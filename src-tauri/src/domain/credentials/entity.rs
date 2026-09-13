use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CredentialType {
    ApiKey,
    BearerToken,
    BasicAuth,
    OAuth2,
    CustomHeader,
    Database,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultCredential {
    pub id: String,
    pub name: String,
    pub cred_type: CredentialType,
    pub data: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}
