use crate::domain::entities::RecordedEvent;

#[derive(serde::Deserialize, serde::Serialize, Clone, Default)]
pub struct Credentials {
    pub openai_key: String,
    #[serde(default)]
    pub deepseek_key: String,
    #[serde(default)]
    pub gemini_key: String,
    #[serde(default)]
    pub openrouter_key: String,
    #[serde(default)]
    pub custom_ai_url: String,
    #[serde(default)]
    pub custom_ai_key: String,
    #[serde(default)]
    pub custom_ai_model: String,
    pub ollama_url: String,
    pub telegram_token: String,
    pub telegram_chat_id: String,
    #[serde(default)]
    pub google_service_account_json: String,
    pub google_token: String,
    pub whatsapp_token: String,
    pub whatsapp_phone_id: String,
}

pub fn load_credentials() -> Credentials {
    if let Some(mut path) = dirs::data_dir() {
        path = path.join("grapScreen").join("credentials.json");
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                if let Ok(creds) = serde_json::from_str(&content) {
                    return creds;
                }
            }
        }
    }
    Credentials::default()
}

pub fn save_credentials_internal(creds: Credentials) -> Result<(), String> {
    if let Some(mut path) = dirs::data_dir() {
        path = path.join("grapScreen");
        let _ = std::fs::create_dir_all(&path);
        let path = path.join("credentials.json");
        let content = serde_json::to_string_pretty(&creds).map_err(|e| e.to_string())?;
        std::fs::write(path, content).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Could not locate data directory".into())
    }
}

pub fn execute_integration(event: &RecordedEvent) -> bool {
    let creds = load_credentials();
    match event.kind.as_str() {
        "excel_local" => {
            super::integration_excel::execute_excel_local(event)
        }
        "telegram" | "whatsapp" => {
            super::integration_social::execute_social(event, &creds)
        }
        "google_sheets" | "google_docs" => {
            super::integration_google::execute_google(event, &creds)
        }
        "ai_agent" => {
            super::integration_ai::execute_ai(event, &creds)
        }
        _ => false,
    }
}
