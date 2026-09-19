//! Authentication for declarative nodes.
//!
//! A descriptor names the n8n credential type it expects; the vault supplies the
//! secret fields. This module turns the pair into the headers and query
//! parameters the request needs, covering the schemes n8n credential types
//! actually declare.
//!
//! Two layers, in order:
//!   1. the templates extracted from the n8n credential file (authoritative),
//!   2. a fallback derived from the declared `authType` plus the well-known
//!      field names, for credential files whose templates we could not parse.
//!
//! Layer 2 matters more than it looks: an unparsed template is silent, and a
//! request that goes out unauthenticated looks like a provider bug rather than a
//! configuration gap.

use super::descriptor::CredentialSpec;
use base64::Engine as _;
use serde_json::Value;

/// Headers and query parameters an authentication scheme contributes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuthApplication {
    pub headers: Vec<(String, String)>,
    pub query: Vec<(String, String)>,
    /// Human-readable notes surfaced to the user, e.g. an unsupported scheme.
    pub notes: Vec<String>,
}

/// Credentials are stored either bare or wrapped in `{ "data": { … } }`
/// depending on how they were imported into the vault. Accept both.
fn credential_object(cred: Option<&Value>) -> Option<&Value> {
    let c = cred?;
    match c.get("data") {
        Some(d) if d.is_object() => Some(d),
        _ if c.is_object() => Some(c),
        _ => None,
    }
}

/// First non-empty string among `names`, searched case-insensitively so
/// `accessToken`, `access_token` and `AccessToken` all resolve.
fn field(cred: Option<&Value>, names: &[&str]) -> Option<String> {
    let obj = credential_object(cred)?;
    let map = obj.as_object()?;
    for want in names {
        for (k, v) in map {
            if k.eq_ignore_ascii_case(want) {
                let s = match v {
                    Value::String(s) => s.clone(),
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => b.to_string(),
                    _ => continue,
                };
                let s = s.trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

/// Substitutes `{{$credentials.field}}` (and the spaced variant) in an n8n auth
/// template. A leading `=` is n8n's marker for "this is an expression" and is
/// not part of the value.
///
/// Returns `None` when the template references a credential field the vault did
/// not supply. That matters: `=Bearer {{$credentials.accessToken}}` with no
/// token would otherwise resolve to the bare word `Bearer`, and a header with a
/// dangling scheme is worse than no header — providers report it as an invalid
/// credential rather than as a missing one.
fn resolve_template(tpl: &str, cred: Option<&Value>) -> Option<String> {
    let mut out = String::with_capacity(tpl.len());
    let mut rest = tpl.trim();
    if let Some(stripped) = rest.strip_prefix('=') {
        rest = stripped;
    }

    let mut cursor = 0usize;
    while let Some(open) = rest[cursor..].find("{{") {
        let open = cursor + open;
        out.push_str(&rest[cursor..open]);
        let Some(close_rel) = rest[open..].find("}}") else {
            // Unterminated placeholder: keep the remainder verbatim.
            out.push_str(&rest[open..]);
            return Some(out.trim().to_string());
        };
        let close = open + close_rel;
        let inner = rest[open + 2..close].trim();

        if inner.starts_with("$credentials") {
            let value = credential_field_value(inner, cred);
            if value.is_empty() {
                return None;
            }
            out.push_str(&value);
        } else {
            // Some other expression: leave the placeholder intact rather than
            // silently blanking it, so the failure is visible in the request.
            out.push_str(&rest[open..close + 2]);
        }
        cursor = close + 2;
    }
    out.push_str(&rest[cursor..]);
    let out = out.trim().to_string();
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Reads the value a `{{$credentials.x}}` / `{{$credentials['x']}}` token names.
fn credential_field_value(token: &str, cred: Option<&Value>) -> String {
    let Some(rest) = token.strip_prefix("$credentials") else {
        return String::new();
    };
    let rest = rest.trim();
    let name = if let Some(inner) = rest.strip_prefix('.') {
        inner.trim().to_string()
    } else if let Some(inner) = rest.strip_prefix('[') {
        inner
            .trim_end_matches(']')
            .trim()
            .trim_matches(|c| c == '\'' || c == '"')
            .to_string()
    } else {
        return String::new();
    };
    if name.is_empty() {
        return String::new();
    }
    field(cred, &[name.as_str()]).unwrap_or_default()
}

/// Field names n8n credential types use for a bearer-style token, most specific
/// first so `accessToken` wins over a generic `key`.
const TOKEN_FIELDS: &[&str] = &[
    "accessToken",
    "access_token",
    "bearerToken",
    "personalAccessToken",
    "authToken",
    "token",
    "apiKey",
    "api_key",
    "apikey",
    "key",
    "secret",
];

const USER_FIELDS: &[&str] = &["user", "username", "login", "email", "account", "clientId", "client_id"];
const PASSWORD_FIELDS: &[&str] = &["password", "pass", "secret", "clientSecret", "client_secret", "token"];

/// Resolves the authentication a descriptor's credential type contributes.
pub fn apply(spec: &CredentialSpec, credential: Option<&Value>) -> AuthApplication {
    let mut out = AuthApplication::default();

    // Layer 1 — the templates extracted from the n8n credential definition.
    for (name, tpl) in &spec.headers {
        if let Some(value) = resolve_template(tpl, credential) {
            out.headers.push((name.clone(), value));
        }
    }
    for (name, tpl) in &spec.qs {
        if let Some(value) = resolve_template(tpl, credential) {
            out.query.push((name.clone(), value));
        }
    }
    if !out.headers.is_empty() || !out.query.is_empty() {
        return out;
    }
    // Every declared template resolved to nothing — say so instead of sending an
    // unauthenticated request that looks like a provider bug.
    if !spec.headers.is_empty() || !spec.qs.is_empty() {
        out.notes.push(
            "La credencial no tiene los campos que este nodo necesita; se ejecutará sin autenticar."
                .into(),
        );
        return out;
    }

    // Layer 2 — derive from the declared scheme.
    match spec.auth_type.as_str() {
        "bearer" | "oAuth2" | "oauth2" => match field(credential, TOKEN_FIELDS) {
            Some(t) => out
                .headers
                .push(("Authorization".into(), format!("Bearer {}", t))),
            None => out.notes.push(
                "La credencial no tiene un token (accessToken/token/apiKey) y el nodo se ejecutará sin autenticar."
                    .into(),
            ),
        },
        "basic" => {
            let user = field(credential, USER_FIELDS);
            let pass = field(credential, PASSWORD_FIELDS);
            match (user, pass) {
                (Some(u), Some(p)) => {
                    let raw = format!("{}:{}", u, p);
                    let encoded =
                        base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
                    out.headers
                        .push(("Authorization".into(), format!("Basic {}", encoded)));
                }
                _ => out.notes.push(
                    "La credencial no tiene usuario y contraseña y el nodo se ejecutará sin autenticar."
                        .into(),
                ),
            }
        }
        "apiKey" | "queryAuth" | "headerAuth" => match field(credential, TOKEN_FIELDS) {
            Some(t) => out.headers.push(("X-API-Key".into(), t)),
            None => out.notes.push(
                "La credencial no tiene una clave (apiKey/key/token) y el nodo se ejecutará sin autenticar."
                    .into(),
            ),
        },
        "digest" => out.notes.push(
            "La autenticación Digest no está soportada todavía; el nodo se ejecutará sin autenticar."
                .into(),
        ),
        // `generic` with no templates means the credential declares nothing we
        // can apply — usually an OAuth2 flow that needs a token exchange first.
        "generic" | "" => {
            if let Some(t) = field(credential, TOKEN_FIELDS) {
                out.headers
                    .push(("Authorization".into(), format!("Bearer {}", t)));
            }
        }
        other => out.notes.push(format!(
            "Tipo de autenticación '{}' no reconocido; el nodo se ejecutará sin autenticar.",
            other
        )),
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::BTreeMap;

    fn spec(auth_type: &str) -> CredentialSpec {
        CredentialSpec {
            name: Some("test".into()),
            auth_type: auth_type.into(),
            base_url: None,
            headers: BTreeMap::new(),
            qs: BTreeMap::new(),
            fields: vec![],
        }
    }

    #[test]
    fn declared_header_templates_win_over_the_fallback() {
        let mut s = spec("bearer");
        s.headers
            .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
        let cred = json!({ "accessToken": "tok_123" });
        let a = apply(&s, Some(&cred));
        assert_eq!(
            a.headers,
            vec![("Authorization".to_string(), "Bearer tok_123".to_string())]
        );
        assert!(a.notes.is_empty());
    }

    #[test]
    fn spaced_and_bracket_placeholder_forms_resolve() {
        let mut s = spec("generic");
        s.headers.insert("X-A".into(), "{{ $credentials.token }}".into());
        s.headers.insert("X-B".into(), "{{$credentials['apiKey']}}".into());
        let cred = json!({ "token": "t1", "apiKey": "k2" });
        let a = apply(&s, Some(&cred));
        assert!(a.headers.contains(&("X-A".to_string(), "t1".to_string())));
        assert!(a.headers.contains(&("X-B".to_string(), "k2".to_string())));
    }

    #[test]
    fn a_missing_credential_field_yields_no_empty_header() {
        // Emitting `Authorization: Bearer ` would be worse than omitting it —
        // some providers reject the request outright, others 401 confusingly.
        let mut s = spec("bearer");
        s.headers.insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
        let a = apply(&s, Some(&json!({ "other": "x" })));
        assert!(a.headers.is_empty());
    }

    #[test]
    fn bearer_falls_back_to_well_known_field_names() {
        let a = apply(&spec("bearer"), Some(&json!({ "access_token": "abc" })));
        assert_eq!(a.headers, vec![("Authorization".into(), "Bearer abc".into())]);
    }

    #[test]
    fn basic_encodes_user_and_password() {
        let a = apply(&spec("basic"), Some(&json!({ "user": "ana", "password": "s3cr3t" })));
        assert_eq!(a.headers.len(), 1);
        let (name, value) = &a.headers[0];
        assert_eq!(name, "Authorization");
        // base64("ana:s3cr3t")
        assert_eq!(value, "Basic YW5hOnMzY3IzdA==");
    }

    #[test]
    fn nested_data_wrapper_is_unwrapped() {
        let cred = json!({ "data": { "apiKey": "nested-key" } });
        let a = apply(&spec("bearer"), Some(&cred));
        assert_eq!(a.headers, vec![("Authorization".into(), "Bearer nested-key".into())]);
    }

    #[test]
    fn query_templates_become_query_parameters() {
        let mut s = spec("apiKey");
        s.qs.insert("key".into(), "{{$credentials.apiKey}}".into());
        let a = apply(&s, Some(&json!({ "apiKey": "qk" })));
        assert_eq!(a.query, vec![("key".into(), "qk".into())]);
        assert!(a.headers.is_empty());
    }

    #[test]
    fn digest_reports_an_explicit_note_instead_of_silently_failing() {
        let a = apply(&spec("digest"), Some(&json!({ "user": "u", "password": "p" })));
        assert!(a.headers.is_empty());
        assert_eq!(a.notes.len(), 1);
        assert!(a.notes[0].contains("Digest"));
    }

    #[test]
    fn no_credential_at_all_produces_no_headers_and_no_panic() {
        let a = apply(&spec("bearer"), None);
        assert!(a.headers.is_empty());
        assert!(a.query.is_empty());
        assert_eq!(a.notes.len(), 1);
    }

    #[test]
    fn declared_templates_that_all_resolve_empty_are_reported() {
        // Silence here would look like a provider outage rather than a
        // credential that simply does not carry the expected fields.
        let mut s = spec("generic");
        s.headers
            .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
        let a = apply(&s, Some(&json!({ "unrelated": "x" })));
        assert!(a.headers.is_empty());
        assert_eq!(a.notes.len(), 1);
        assert!(a.notes[0].contains("sin autenticar"));
    }

    #[test]
    fn a_non_credential_expression_is_left_visible_in_the_header() {
        // Blanking an unknown expression hides the problem; keeping it makes the
        // malformed request obvious in the logs.
        let mut s = spec("generic");
        s.headers.insert("X-Tenant".into(), "{{ $vars.tenant }}".into());
        let a = apply(&s, Some(&json!({})));
        assert_eq!(a.headers, vec![("X-Tenant".into(), "{{ $vars.tenant }}".into())]);
    }

    #[test]
    fn an_empty_credential_value_is_treated_as_absent() {
        let mut s = spec("bearer");
        s.headers
            .insert("Authorization".into(), "=Bearer {{$credentials.accessToken}}".into());
        let a = apply(&s, Some(&json!({ "accessToken": "   " })));
        assert!(a.headers.is_empty());
    }
}
