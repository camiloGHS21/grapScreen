#[tauri::command]
pub fn get_credentials() -> crate::application::replay_integrations::Credentials {
    crate::application::replay_integrations::load_credentials()
}

#[tauri::command]
pub fn save_credentials(
    creds: crate::application::replay_integrations::Credentials,
) -> std::result::Result<(), String> {
    crate::application::replay_integrations::save_credentials_internal(creds)
}
