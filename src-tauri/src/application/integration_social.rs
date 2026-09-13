use crate::domain::entities::RecordedEvent;
use crate::application::replay_helpers::interpolate_variables;
use crate::application::http_client;
use super::replay_integrations::Credentials;
// Still needed to launch the default browser for the WhatsApp Web path.
use std::process::Command;

pub fn execute_social(event: &RecordedEvent, creds: &Credentials) -> bool {
    match event.kind.as_str() {
        "telegram" => {
            let msg = event.data["message"].as_str().unwrap_or("");
            let chat_id = event.data["chat_id"].as_str().unwrap_or(&creds.telegram_chat_id);
            let token = event.data["token"].as_str().unwrap_or(&creds.telegram_token);
            
            let msg_interp = interpolate_variables(msg);
            let chat_id_interp = interpolate_variables(chat_id);
            let token_interp = interpolate_variables(token);
            
            if msg_interp.is_empty() || chat_id_interp.is_empty() || token_interp.is_empty() {
                return false;
            }
            
            let url = format!("https://api.telegram.org/bot{}/sendMessage", token_interp);
            let body = serde_json::json!({
                "chat_id": chat_id_interp,
                "text": msg_interp
            }).to_string();

            match http_client::post_json(&url, &body, None) {
                Ok(r) if r.is_success() => true,
                Ok(r) => {
                    crate::application::replay_helpers::warn_ui(
                        "telegram",
                        &format!("Telegram devolvió el estado {}: {}", r.status, http_client::preview(r.body.trim(), 200)),
                    );
                    false
                }
                Err(e) => {
                    crate::application::replay_helpers::warn_ui(
                        "telegram",
                        &format!("No se pudo llamar a Telegram: {}", e),
                    );
                    false
                }
            }
        }
        "whatsapp" => {
            let msg = event.data["message"].as_str().unwrap_or("");
            let to = event.data["to"].as_str().unwrap_or("");
            let api_type = event.data["api_type"].as_str().unwrap_or("web");
            
            let msg_interp = interpolate_variables(msg);
            let to_interp = interpolate_variables(to);
            
            if msg_interp.is_empty() || to_interp.is_empty() {
                return false;
            }
            
            if api_type == "web" {
                let encoded_msg: String = msg_interp.chars().map(|c| {
                    if c.is_alphanumeric() {
                        c.to_string()
                    } else {
                        format!("%{:02X}", c as u32)
                    }
                }).collect();
                let url = format!("https://web.whatsapp.com/send?phone={}&text={}", to_interp, encoded_msg);
                let _ = Command::new("cmd").args(&["/C", "start", &url]).spawn();
                true
            } else {
                let token = event.data["token"].as_str().unwrap_or(&creds.whatsapp_token);
                let phone_id = event.data["phone_id"].as_str().unwrap_or(&creds.whatsapp_phone_id);
                let token_interp = interpolate_variables(token);
                let phone_id_interp = interpolate_variables(phone_id);
                
                if token_interp.is_empty() || phone_id_interp.is_empty() {
                    return false;
                }
                
                let url = format!("https://graph.facebook.com/v19.0/{}/messages", phone_id_interp);
                let body = serde_json::json!({
                    "messaging_product": "whatsapp",
                    "to": to_interp,
                    "type": "text",
                    "text": { "body": msg_interp }
                }).to_string();
                let auth_header = format!("Authorization: Bearer {}", token_interp);

                match http_client::post_json(&url, &body, Some(http_client::header_from_str(&auth_header))) {
                    Ok(r) if r.is_success() => true,
                    Ok(r) => {
                        crate::application::replay_helpers::warn_ui(
                            "whatsapp",
                            &format!("WhatsApp devolvió el estado {}: {}", r.status, http_client::preview(r.body.trim(), 200)),
                        );
                        false
                    }
                    Err(e) => {
                        crate::application::replay_helpers::warn_ui(
                            "whatsapp",
                            &format!("No se pudo llamar a WhatsApp: {}", e),
                        );
                        false
                    }
                }
            }
        }
        _ => false,
    }
}
