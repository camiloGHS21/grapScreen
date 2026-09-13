use crate::application::vault_service::service::get_vault_service;
use crate::domain::credentials::entity::VaultCredential;

#[tauri::command]
pub fn list_vault_credentials() -> Result<Vec<VaultCredential>, String> {
    get_vault_service().list_credentials()
}

#[tauri::command]
pub fn save_vault_credential(cred: VaultCredential) -> Result<(), String> {
    get_vault_service().save_credential(cred)
}

#[tauri::command]
pub fn delete_vault_credential(id: String) -> Result<(), String> {
    get_vault_service().delete_credential(&id)
}

#[tauri::command]
pub fn get_vault_credential(id: String) -> Result<Option<VaultCredential>, String> {
    get_vault_service().get_credential(&id)
}
