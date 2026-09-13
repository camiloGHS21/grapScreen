use std::fs;
use std::path::PathBuf;
use crate::domain::credentials::entity::VaultCredential;
use crate::domain::credentials::ports::CredentialVaultPort;
use super::win32_dpapi::{decrypt_bytes, encrypt_bytes};

pub struct FilesystemVaultAdapter;

impl FilesystemVaultAdapter {
    pub fn new() -> Self {
        Self
    }

    fn get_vault_path(&self) -> Result<PathBuf, String> {
        let mut path = dirs::data_dir().ok_or_else(|| "No data directory found".to_string())?;
        path.push("grapScreen");
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        path.push("vault.bin");
        Ok(path)
    }
}

impl CredentialVaultPort for FilesystemVaultAdapter {
    fn load_all(&self) -> Result<Vec<VaultCredential>, String> {
        let path = self.get_vault_path()?;
        if !path.exists() {
            return Ok(Vec::new());
        }

        let encrypted = fs::read(&path).map_err(|e| e.to_string())?;
        if encrypted.is_empty() {
            return Ok(Vec::new());
        }

        let decrypted = decrypt_bytes(&encrypted)?;
        let creds: Vec<VaultCredential> = serde_json::from_slice(&decrypted).map_err(|e| e.to_string())?;
        Ok(creds)
    }

    fn save(&self, cred: &VaultCredential) -> Result<(), String> {
        let mut list = self.load_all().unwrap_or_default();
        if let Some(idx) = list.iter().position(|c| c.id == cred.id) {
            list[idx] = cred.clone();
        } else {
            list.push(cred.clone());
        }

        let json_bytes = serde_json::to_vec_pretty(&list).map_err(|e| e.to_string())?;
        let encrypted = encrypt_bytes(&json_bytes)?;
        let path = self.get_vault_path()?;
        fs::write(path, encrypted).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        let mut list = self.load_all().unwrap_or_default();
        let orig_len = list.len();
        list.retain(|c| c.id != id);

        if list.len() != orig_len {
            let json_bytes = serde_json::to_vec_pretty(&list).map_err(|e| e.to_string())?;
            let encrypted = encrypt_bytes(&json_bytes)?;
            let path = self.get_vault_path()?;
            fs::write(path, encrypted).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn get_by_id(&self, id: &str) -> Result<Option<VaultCredential>, String> {
        let list = self.load_all()?;
        Ok(list.into_iter().find(|c| c.id == id))
    }
}
