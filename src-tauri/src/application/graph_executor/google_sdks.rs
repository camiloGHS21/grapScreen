//! Native Google REST API v1/v3 execution runner for n8n Google nodes:
//! - GoogleDocs (https://docs.googleapis.com/v1/documents)
//! - GoogleSlides (https://slides.googleapis.com/v1/presentations)
//! - GoogleChat (https://chat.googleapis.com/v1)
//! - GoogleDrive (https://www.googleapis.com/drive/v3/files)

use crate::application::http_client;
use crate::application::replay_helpers::interpolate_variables;
use serde_json::{json, Value};

/// Helper to get a parameter from data or n8n_config.
pub fn cfg_val(data: &Value, key: &str, alt_keys: &[&str]) -> String {
    for k in std::iter::once(&key).chain(alt_keys.iter()) {
        if let Some(s) = data.get(*k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
            return s.to_string();
        }
        if let Some(s) = data.get("n8n_config").and_then(|c| c.get(*k)).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
            return s.to_string();
        }
    }
    String::new()
}

/// Resolves Google OAuth2 Bearer token from data, config, or vault.
pub fn resolve_google_token(data: &Value) -> Result<String, String> {
    for field in &["token", "accessToken", "access_token", "google_token"] {
        let t = cfg_val(data, field, &[]);
        if !t.is_empty() {
            return Ok(interpolate_variables(&t));
        }
    }

    let cred_id = cfg_val(data, "credential_id", &["credentialId"]);
    if !cred_id.is_empty() {
        if let Some(cred) = crate::application::vault_service::service::get_vault_service().resolve_credential_data(&cred_id) {
            for field in &["accessToken", "access_token", "token"] {
                if let Some(s) = cred.get(*field).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
                    return Ok(s.to_string());
                }
            }
            if let Some(oauth) = cred.get("oauthTokenData").and_then(|v| v.get("access_token")).and_then(|v| v.as_str()) {
                if !oauth.trim().is_empty() {
                    return Ok(oauth.to_string());
                }
            }
        }
    }

    Err("Google SDK: no se encontró token OAuth2 (configura googleOAuth2Api en la bóveda o pásalo en el nodo)".into())
}

fn execute_google_request(method: &str, url: &str, body: Option<&str>, token: &str) -> Result<Value, String> {
    let mut headers = vec![
        ("Authorization".into(), format!("Bearer {}", token)),
    ];
    if body.is_some() {
        headers.push(("Content-Type".into(), "application/json".into()));
    }
    let req = http_client::HttpRequest {
        method: method.to_string(),
        url: url.to_string(),
        headers,
        body: body.map(|s| s.to_string()),
        timeout_secs: http_client::DEFAULT_TIMEOUT_SECS,
    };
    let resp = http_client::send(&req)
        .map_err(|e| format!("Google API error de red: {}", e))?;

    if !resp.is_success() {
        return Err(format!("Google API devolvió {}: {}", resp.status, http_client::preview(resp.body.trim(), 200)));
    }
    if resp.body.trim().is_empty() {
        return Ok(json!({ "success": true }));
    }
    serde_json::from_str(&resp.body).map_err(|e| format!("Google API JSON inválido: {} (cuerpo: {})", e, http_client::preview(&resp.body, 120)))
}

/// Native runner for Google Docs (canonical REST API v1).
pub fn run_google_docs(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let token = resolve_google_token(data)?;
    let op = cfg_val(data, "operation", &["mode"]).to_lowercase();
    let doc_id = interpolate_variables(&cfg_val(data, "documentId", &["document_id", "docId", "documentURL"]));
    let title = interpolate_variables(&cfg_val(data, "title", &["name"]));
    let text = interpolate_variables(&cfg_val(data, "text", &["content"]));

    let res = if op == "create" || doc_id.is_empty() && !title.is_empty() {
        let url = "https://docs.googleapis.com/v1/documents";
        let body = json!({ "title": if title.is_empty() { "Documento sin título" } else { &title } }).to_string();
        execute_google_request("POST", url, Some(&body), &token)?
    } else if op == "update" || op == "batchupdate" || !text.is_empty() {
        let clean_id = doc_id.trim_start_matches("https://docs.google.com/document/d/").split('/').next().unwrap_or(&doc_id);
        let url = format!("https://docs.googleapis.com/v1/documents/{}:batchUpdate", clean_id);
        let body = json!({
            "requests": [{
                "insertText": {
                    "text": text,
                    "location": { "index": 1 }
                }
            }]
        }).to_string();
        execute_google_request("POST", &url, Some(&body), &token)?
    } else {
        let clean_id = doc_id.trim_start_matches("https://docs.google.com/document/d/").split('/').next().unwrap_or(&doc_id);
        let url = format!("https://docs.googleapis.com/v1/documents/{}", clean_id);
        execute_google_request("GET", &url, None, &token)?
    };

    Ok(vec![res])
}

/// Native runner for Google Slides (canonical REST API v1).
pub fn run_google_slides(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let token = resolve_google_token(data)?;
    let op = cfg_val(data, "operation", &["mode"]).to_lowercase();
    let pres_id = interpolate_variables(&cfg_val(data, "presentationId", &["presentation_id", "id"]));
    let title = interpolate_variables(&cfg_val(data, "title", &["name"]));

    let res = if op == "create" || pres_id.is_empty() && !title.is_empty() {
        let url = "https://slides.googleapis.com/v1/presentations";
        let body = json!({ "title": if title.is_empty() { "Presentación sin título" } else { &title } }).to_string();
        execute_google_request("POST", url, Some(&body), &token)?
    } else if op == "batchupdate" {
        let clean_id = pres_id.trim_start_matches("https://docs.google.com/presentation/d/").split('/').next().unwrap_or(&pres_id);
        let url = format!("https://slides.googleapis.com/v1/presentations/{}:batchUpdate", clean_id);
        let requests_val = data.get("requests").cloned().unwrap_or_else(|| json!([]));
        let body = json!({ "requests": requests_val }).to_string();
        execute_google_request("POST", &url, Some(&body), &token)?
    } else {
        let clean_id = pres_id.trim_start_matches("https://docs.google.com/presentation/d/").split('/').next().unwrap_or(&pres_id);
        let url = format!("https://slides.googleapis.com/v1/presentations/{}", clean_id);
        execute_google_request("GET", &url, None, &token)?
    };

    Ok(vec![res])
}

/// Native runner for Google Chat (canonical REST API v1).
pub fn run_google_chat(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let token = resolve_google_token(data)?;
    let op = cfg_val(data, "operation", &["mode"]).to_lowercase();
    let space = interpolate_variables(&cfg_val(data, "space", &["spaceId", "space_id"]));
    let message = interpolate_variables(&cfg_val(data, "message", &["text", "content"]));

    let clean_space = if space.starts_with("spaces/") { space } else { format!("spaces/{}", space) };

    let res = if op == "listspaces" || op == "list" {
        let url = "https://chat.googleapis.com/v1/spaces";
        execute_google_request("GET", url, None, &token)?
    } else if op == "getspace" && !clean_space.is_empty() {
        let url = format!("https://chat.googleapis.com/v1/{}", clean_space);
        execute_google_request("GET", &url, None, &token)?
    } else {
        let url = format!("https://chat.googleapis.com/v1/{}/messages", clean_space);
        let body = json!({ "text": message }).to_string();
        execute_google_request("POST", &url, Some(&body), &token)?
    };

    Ok(vec![res])
}

/// Native runner for Google Drive (canonical REST API v3).
pub fn run_google_drive(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let token = resolve_google_token(data)?;
    let op = cfg_val(data, "operation", &["mode"]).to_lowercase();
    let file_id = interpolate_variables(&cfg_val(data, "fileId", &["file_id", "id"]));
    let name = interpolate_variables(&cfg_val(data, "name", &["title", "fileName"]));
    let query = interpolate_variables(&cfg_val(data, "query", &["q", "filter"]));

    let res = if op == "delete" && !file_id.is_empty() {
        let url = format!("https://www.googleapis.com/drive/v3/files/{}", file_id);
        execute_google_request("DELETE", &url, None, &token)?
    } else if op == "createfolder" || op == "folder" {
        let url = "https://www.googleapis.com/drive/v3/files";
        let body = json!({
            "name": if name.is_empty() { "Nueva Carpeta" } else { &name },
            "mimeType": "application/vnd.google-apps.folder"
        }).to_string();
        execute_google_request("POST", url, Some(&body), &token)?
    } else if op == "copy" && !file_id.is_empty() {
        let url = format!("https://www.googleapis.com/drive/v3/files/{}/copy", file_id);
        let body = if name.is_empty() { json!({}).to_string() } else { json!({ "name": name }).to_string() };
        execute_google_request("POST", &url, Some(&body), &token)?
    } else if (op == "list" || op == "search") || file_id.is_empty() {
        let q_part = if query.is_empty() { String::new() } else { format!("?q={}", uri_encode(&query)) };
        let url = format!("https://www.googleapis.com/drive/v3/files{}", q_part);
        let out = execute_google_request("GET", &url, None, &token)?;
        if let Some(files) = out.get("files").and_then(|f| f.as_array()) {
            return Ok(files.clone());
        }
        out
    } else {
        let url = format!("https://www.googleapis.com/drive/v3/files/{}?fields=*", file_id);
        execute_google_request("GET", &url, None, &token)?
    };

    Ok(vec![res])
}

fn uri_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => {
                let _ = std::fmt::Write::write_fmt(&mut out, format_args!("%{other:02X}"));
            }
        }
    }
    out
}
