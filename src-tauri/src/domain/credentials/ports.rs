use super::entity::VaultCredential;

pub trait CredentialVaultPort: Send + Sync {
    fn load_all(&self) -> Result<Vec<VaultCredential>, String>;
    fn save(&self, cred: &VaultCredential) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
    fn get_by_id(&self, id: &str) -> Result<Option<VaultCredential>, String>;
}
