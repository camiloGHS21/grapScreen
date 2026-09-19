use serde::{Deserialize, Serialize};

/// The coarse credential kind, kept for the nodes that predate the n8n
/// catalogue (`http_request`, `notion`, `crypto`, …).
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

/// A credential's type.
///
/// Two shapes have to coexist:
///
///   * the legacy fixed kinds above, stored as `"api_key"`, `"bearer_token"`, …
///   * an **n8n credential type name**, e.g. `"whatsAppTriggerApi"`, which is an
///     open set of 445 names generated from the n8n source.
///
/// The fixed enum cannot hold the open set — serde rejects an unknown variant,
/// so a typed credential would fail to save. Modelling this as untagged keeps
/// both readable: a known variant deserialises into `Kind`, anything else into
/// `Named`. Serialisation is transparent, so the vault JSON is unchanged for
/// existing entries.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum CredentialTypeField {
    Kind(CredentialType),
    Named(String),
}

impl CredentialTypeField {
    /// The raw string as stored, which is what the descriptor registry and the
    /// frontend both key on.
    pub fn as_str(&self) -> &str {
        match self {
            // Must match `CredentialType`'s snake_case rename exactly: these
            // strings are what is already on disk.
            CredentialTypeField::Kind(CredentialType::ApiKey) => "api_key",
            CredentialTypeField::Kind(CredentialType::BearerToken) => "bearer_token",
            CredentialTypeField::Kind(CredentialType::BasicAuth) => "basic_auth",
            CredentialTypeField::Kind(CredentialType::OAuth2) => "oauth2",
            CredentialTypeField::Kind(CredentialType::CustomHeader) => "custom_header",
            CredentialTypeField::Kind(CredentialType::Database) => "database",
            CredentialTypeField::Named(name) => name.as_str(),
        }
    }
}

impl Default for CredentialTypeField {
    fn default() -> Self {
        CredentialTypeField::Kind(CredentialType::ApiKey)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultCredential {
    pub id: String,
    pub name: String,
    pub cred_type: CredentialTypeField,
    pub data: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_kinds_round_trip_unchanged() {
        // Existing vault files store these exact strings; a regression here
        // would make every saved credential unreadable.
        let cred: VaultCredential = serde_json::from_value(json!({
            "id": "a", "name": "A", "cred_type": "bearer_token",
            "data": {}, "created_at": "", "updated_at": ""
        }))
        .unwrap();
        assert_eq!(cred.cred_type, CredentialTypeField::Kind(CredentialType::BearerToken));
        assert_eq!(cred.cred_type.as_str(), "bearer_token");
        let back = serde_json::to_value(&cred).unwrap();
        assert_eq!(back["cred_type"], json!("bearer_token"));
    }

    #[test]
    fn an_n8n_type_name_is_accepted() {
        // The whole point: 445 generated names are not enum variants.
        let cred: VaultCredential = serde_json::from_value(json!({
            "id": "b", "name": "WhatsApp", "cred_type": "whatsAppTriggerApi",
            "data": { "clientId": "x", "clientSecret": "y" },
            "created_at": "", "updated_at": ""
        }))
        .expect("un tipo de n8n debe poder guardarse");
        assert_eq!(cred.cred_type.as_str(), "whatsAppTriggerApi");
        let back = serde_json::to_value(&cred).unwrap();
        assert_eq!(back["cred_type"], json!("whatsAppTriggerApi"));
    }

    #[test]
    fn every_legacy_kind_has_a_stable_string() {
        let cases = [
            (CredentialType::ApiKey, "api_key"),
            (CredentialType::BearerToken, "bearer_token"),
            (CredentialType::BasicAuth, "basic_auth"),
            (CredentialType::OAuth2, "oauth2"),
            (CredentialType::CustomHeader, "custom_header"),
            (CredentialType::Database, "database"),
        ];
        for (kind, expected) in cases {
            assert_eq!(CredentialTypeField::Kind(kind).as_str(), expected);
        }
    }
}

