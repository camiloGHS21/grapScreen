use crate::domain::entities::RecordedEvent;
use crate::application::replay_helpers::interpolate_variables;
use crate::application::http_client;
use super::replay_integrations::Credentials;

pub fn execute_google(event: &RecordedEvent, creds: &Credentials) -> bool {
    match event.kind.as_str() {
        "google_sheets" => {
            let spreadsheet_id = event.data["spreadsheet_id"].as_str().unwrap_or("");
            let range = event.data["range"].as_str().unwrap_or("Sheet1!A:Z");
            let values_str = event.data["values"].as_str().unwrap_or("[]");
            let token = event.data["token"].as_str().unwrap_or(&creds.google_token);
            
            let spreadsheet_interp = interpolate_variables(spreadsheet_id);
            let range_interp = interpolate_variables(range);
            let values_interp = interpolate_variables(values_str);
            let token_interp = interpolate_variables(token);
            
            if spreadsheet_interp.is_empty() || token_interp.is_empty() {
                return false;
            }
            
            let val_json: serde_json::Value = serde_json::from_str(&values_interp).unwrap_or(serde_json::json!([[values_interp]]));
            let values_arr = if val_json.is_array() {
                val_json
            } else {
                serde_json::json!([[val_json]])
            };
            
            let url = format!("https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}:append?valueInputOption=USER_ENTERED", spreadsheet_interp, range_interp);
            let body = serde_json::json!({ "values": values_arr }).to_string();
            let auth_header = format!("Authorization: Bearer {}", token_interp);

            // Report the outcome: previously the result was discarded, so a bad
            // token looked identical to success.
            match http_client::post_json(&url, &body, Some(http_client::header_from_str(&auth_header))) {
                Ok(r) if r.is_success() => true,
                Ok(r) => {
                    crate::application::replay_helpers::warn_ui(
                        "google_sheets",
                        &format!("Google Sheets devolvió el estado {}: {}", r.status, http_client::preview(r.body.trim(), 200)),
                    );
                    false
                }
                Err(e) => {
                    crate::application::replay_helpers::warn_ui(
                        "google_sheets",
                        &format!("No se pudo llamar a Google Sheets: {}", e),
                    );
                    false
                }
            }
        }
        "google_docs" => {
            let document_id = event.data["document_id"].as_str().unwrap_or("");
            let text = event.data["text"].as_str().unwrap_or("");
            let token = event.data["token"].as_str().unwrap_or(&creds.google_token);
            
            let doc_interp = interpolate_variables(document_id);
            let text_interp = interpolate_variables(text);
            let token_interp = interpolate_variables(token);
            
            if doc_interp.is_empty() || token_interp.is_empty() {
                return false;
            }
            
            let url = format!("https://docs.googleapis.com/v1/documents/{}:batchUpdate", doc_interp);
            let body = serde_json::json!({
                "requests": [
                    {
                        "insertText": {
                            "text": text_interp,
                            "location": { "index": 1 }
                        }
                    }
                ]
            }).to_string();
            let auth_header = format!("Authorization: Bearer {}", token_interp);

            match http_client::post_json(&url, &body, Some(http_client::header_from_str(&auth_header))) {
                Ok(r) if r.is_success() => true,
                Ok(r) => {
                    crate::application::replay_helpers::warn_ui(
                        "google_docs",
                        &format!("Google Docs devolvió el estado {}: {}", r.status, http_client::preview(r.body.trim(), 200)),
                    );
                    false
                }
                Err(e) => {
                    crate::application::replay_helpers::warn_ui(
                        "google_docs",
                        &format!("No se pudo llamar a Google Docs: {}", e),
                    );
                    false
                }
            }
        }
        _ => false,
    }
}
