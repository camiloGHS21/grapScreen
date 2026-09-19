use crate::application::graph_executor::declarative::auth;
use crate::application::graph_executor::declarative::descriptor::DescriptorRegistry;
use crate::application::http_client::{self, HttpRequest};
use crate::application::vault_service::service::get_vault_service;
use crate::domain::credentials::entity::VaultCredential;
use serde::Serialize;

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

/// The result of probing a credential against its provider.
///
/// `reachable` and `authenticated` are deliberately separate. A 401 means the
/// network and the URL are fine but the secret is wrong — collapsing that into a
/// single boolean would tell the user "connection failed" when the truthful
/// message is "the credentials were rejected".
#[derive(Debug, Clone, Serialize)]
pub struct CredentialProbe {
    /// The URL that was actually requested.
    pub url: String,
    /// The HTTP status, when a response arrived at all.
    pub status: Option<u16>,
    pub reachable: bool,
    pub authenticated: bool,
    /// True when the provider reached out fine but rejected the credentials.
    pub rejected: bool,
    /// Human-readable summary in Spanish, ready to show in the UI.
    pub message: String,
    /// Non-fatal advisories (a scheme that cannot be applied, for instance).
    pub notes: Vec<String>,
}

const PROBE_TIMEOUT_SECS: u64 = 20;
/// Keep the echoed body short — it exists to explain a failure, not to dump a
/// response into the drawer.
const BODY_PREVIEW_CHARS: usize = 300;

/// Picks a URL worth probing for a credential type.
///
/// The descriptor registry is the only source that knows a real API root, so the
/// search walks the descriptors that declare this credential and takes the first
/// base URL it finds. When none has one, the credential's own `apiUrl`-style
/// field is used, and failing that the probe cannot run at all — which is
/// reported rather than guessed, because inventing a URL would produce a
/// meaningless result.
fn probe_url_for(cred_type: &str, cred: &serde_json::Value) -> Option<String> {
    let declares = |d: &crate::application::graph_executor::declarative::descriptor::NodeDescriptor| {
        d.credential.as_ref().and_then(|c| c.name.as_deref()) == Some(cred_type)
    };
    let root_of = |d: &crate::application::graph_executor::declarative::descriptor::NodeDescriptor| {
        d.base_url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };

    // Actions first: a trigger's descriptor may describe a different endpoint.
    let all = DescriptorRegistry::global().all();
    for d in all.iter().filter(|d| !d.is_trigger && declares(d)) {
        if let Some(u) = root_of(d) {
            return Some(u);
        }
    }
    for d in all.iter().filter(|d| declares(d)) {
        if let Some(u) = root_of(d) {
            return Some(u);
        }
    }

    // Some credentials carry their own API root as a user-filled field
    // (ActiveCampaign's `apiUrl`, for instance). Only an absolute URL counts.
    let obj = cred.get("data").filter(|d| d.is_object()).unwrap_or(cred);
    for name in ["apiUrl", "baseUrl", "base_url", "url", "host"] {
        if let Some(v) = obj.get(name).and_then(|v| v.as_str()) {
            let v = v.trim();
            if v.starts_with("http://") || v.starts_with("https://") {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Probes a credential against the provider its type belongs to.
///
/// This is the "Test connection" button. It sends one authenticated GET to the
/// integration's API root and reports what came back. It is honest about the
/// three distinct outcomes a user needs to tell apart: no response at all, a
/// response that rejected the credentials, and success.
#[tauri::command]
pub fn test_vault_credential(cred: VaultCredential) -> Result<CredentialProbe, String> {
    Ok(probe(cred.cred_type.as_str(), &cred.data))
}

/// The probe itself, split out so it can be unit-tested without Tauri.
pub fn probe(cred_type: &str, data: &serde_json::Value) -> CredentialProbe {
    let mut notes: Vec<String> = Vec::new();

    let Some(url) = probe_url_for(cred_type, data) else {
        return CredentialProbe {
            url: String::new(),
            status: None,
            reachable: false,
            authenticated: false,
            rejected: false,
            message: format!(
                "El tipo '{}' no declara una URL de API en el catálogo, así que no se puede probar \
                 automáticamente. Los campos se guardarán igualmente.",
                cred_type
            ),
            notes,
        };
    };

    // Apply exactly the authentication a real run would apply, so a green probe
    // means the node will authenticate too.
    let spec = DescriptorRegistry::global()
        .all()
        .iter()
        .find_map(|d| match d.credential.as_ref() {
            Some(c) if c.name.as_deref() == Some(cred_type) => Some(c.clone()),
            _ => None,
        });

    let auth = match spec.as_ref() {
        Some(s) => auth::apply(s, Some(data)),
        None => Default::default(),
    };
    notes.extend(auth.notes.iter().cloned());

    let mut headers = auth.headers.clone();
    if !headers.iter().any(|(n, _)| n.eq_ignore_ascii_case("accept")) {
        headers.push(("Accept".to_string(), "application/json".to_string()));
    }

    let mut full_url = url.clone();
    if !auth.query.is_empty() {
        let qs = auth
            .query
            .iter()
            .map(|(k, v)| format!("{}={}", encode(k), encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        full_url.push(if full_url.contains('?') { '&' } else { '?' });
        full_url.push_str(&qs);
    }

    let req = HttpRequest {
        method: "GET".to_string(),
        url: full_url.clone(),
        headers,
        body: None,
        timeout_secs: PROBE_TIMEOUT_SECS,
    };

    match http_client::send(&req) {
        Ok(resp) => {
            let rejected = matches!(resp.status, 401 | 403);
            let reachable = true;
            let authenticated = resp.is_success();
            let message = if authenticated {
                format!("Conexión correcta (HTTP {}).", resp.status)
            } else if rejected {
                format!(
                    "El servicio respondió HTTP {}: alcanzable, pero rechazó las credenciales. \
                     Revisa la clave o el token.",
                    resp.status
                )
            } else {
                format!(
                    "El servicio respondió HTTP {}: {}",
                    resp.status,
                    http_client::preview(resp.body.trim(), BODY_PREVIEW_CHARS)
                )
            };
            CredentialProbe {
                url: full_url,
                status: Some(resp.status),
                reachable,
                authenticated,
                rejected,
                message,
                notes,
            }
        }
        Err(e) => CredentialProbe {
            url: full_url,
            status: None,
            reachable: false,
            authenticated: false,
            rejected: false,
            message: format!("No se pudo conectar: {}", e),
            notes,
        },
    }
}

/// Minimal percent-encoding for probe query values.
fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_typed_credential_resolves_a_real_api_root() {
        // Slack's descriptor carries the API root; the probe must find it rather
        // than sending the request to the credential's auth endpoint.
        let url = probe_url_for("slackApi", &json!({ "accessToken": "t" }));
        assert_eq!(url.as_deref(), Some("https://slack.com/api"));
    }

    #[test]
    fn the_probe_url_never_ends_at_an_oauth_token_endpoint() {
        // Regression guard for the extraction bug: WhatsApp's credential pointed
        // at `…/oauth/access_token`, which is not something to GET.
        let url = probe_url_for("whatsAppTriggerApi", &json!({}));
        if let Some(u) = url {
            assert!(
                !u.contains("/oauth/"),
                "la URL de sondeo no debe ser un endpoint de token: {}",
                u
            );
        }
    }

    #[test]
    fn a_credential_with_its_own_api_root_field_is_used() {
        let url = probe_url_for(
            "noSuchCredentialTypeAtAll",
            &json!({ "apiUrl": "https://acme.api.com/v3" }),
        );
        assert_eq!(url.as_deref(), Some("https://acme.api.com/v3"));
    }

    #[test]
    fn a_relative_api_root_field_is_not_treated_as_a_url() {
        // A user may type a bare host or path; probing it would build a
        // meaningless request, so it is rejected and reported instead.
        let url = probe_url_for("noSuchCredentialTypeAtAll", &json!({ "apiUrl": "acme.com" }));
        assert_eq!(url, None);
    }

    #[test]
    fn an_unknown_type_without_a_url_reports_that_it_cannot_probe() {
        let result = probe("definitelyNotACredentialType", &json!({}));
        assert!(!result.reachable);
        assert!(result.status.is_none());
        assert!(
            result.message.contains("no declara una URL"),
            "mensaje inesperado: {}",
            result.message
        );
    }

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(encode("a b&c=d"), "a%20b%26c%3Dd");
        assert_eq!(encode("safe-._~"), "safe-._~");
    }
}

