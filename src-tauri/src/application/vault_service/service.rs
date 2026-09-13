use crate::domain::credentials::entity::{VaultCredential, CredentialType};
use crate::domain::credentials::ports::CredentialVaultPort;
use crate::infrastructure::security::filesystem_vault::FilesystemVaultAdapter;

pub struct VaultService {
    port: Box<dyn CredentialVaultPort>,
}

impl VaultService {
    pub fn new() -> Self {
        Self {
            port: Box::new(FilesystemVaultAdapter::new()),
        }
    }

    pub fn list_credentials(&self) -> Result<Vec<VaultCredential>, String> {
        self.port.load_all()
    }

    pub fn save_credential(&self, cred: VaultCredential) -> Result<(), String> {
        if cred.id.trim().is_empty() {
            return Err("Credential ID cannot be empty".into());
        }
        self.port.save(&cred)
    }

    pub fn delete_credential(&self, id: &str) -> Result<(), String> {
        self.port.delete(id)
    }

    pub fn get_credential(&self, id: &str) -> Result<Option<VaultCredential>, String> {
        self.port.get_by_id(id)
    }

    pub fn resolve_credential_data(&self, id: &str) -> Option<serde_json::Value> {
        if let Ok(Some(cred)) = self.port.get_by_id(id) {
            Some(cred.data)
        } else {
            None
        }
    }
}

pub fn get_vault_service() -> VaultService {
    VaultService::new()
}
