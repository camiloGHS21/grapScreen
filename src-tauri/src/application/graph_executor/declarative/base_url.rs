//! Base URL resolution for declarative and runmap nodes.
//!
//! Many services (Salesforce, Jira, Jenkins, ActiveCampaign, Supabase, self-hosted
//! GitLab, etc.) require an instance URL, domain, or tenant host. This module
//! resolves the effective base URL with the following precedence:
//! 1. Explicit override on node (`n8n_base_url`, `baseUrl`, `base_url`)
//! 2. Vault credentials (`instance_url`, `url`, `baseUrl`, `host`, `domain`, etc.)
//! 3. Node configuration parameters (`n8n_config`)
//! 4. Node descriptor (`desc.base_url`)
//! 5. Well-known public endpoints for known cloud services

use super::descriptor::{DescriptorRegistry, NodeDescriptor};
use serde_json::{Map, Value};

/// Common keys in credentials and parameters that define an API endpoint or instance.
const URL_KEYS: &[&str] = &[
    "instance_url",
    "instanceUrl",
    "base_url",
    "baseUrl",
    "url",
    "api_url",
    "apiUrl",
    "host",
    "server",
    "endpoint",
    "domain",
    "subdomain",
];

/// Extracts the decrypted credential object.
fn credential_map(cred: Option<&Value>) -> Option<&Map<String, Value>> {
    let c = cred?;
    match c.get("data") {
        Some(data) if data.is_object() => data.as_object(),
        _ => c.as_object(),
    }
}

/// Formats a raw host/domain string into an absolute HTTPS base URL.
fn format_domain_or_host(key: &str, field: &str, raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }

    if field == "domain" || field == "subdomain" {
        if trimmed.contains('.') {
            return Some(format!("https://{}", trimmed));
        }
        let k = key.to_ascii_lowercase();
        if k == "jira" || k.starts_with("jira") {
            return Some(format!("https://{}.atlassian.net", trimmed));
        }
        if k == "salesforce" {
            return Some(format!("https://{}.my.salesforce.com", trimmed));
        }
        if k == "activecampaign" {
            return Some(format!("https://{}.api-us1.com", trimmed));
        }
        if k == "zendesk" {
            return Some(format!("https://{}.zendesk.com", trimmed));
        }
        return Some(format!("https://{}", trimmed));
    }

    Some(format!("https://{}", trimmed))
}

/// Searches a map for URL/host/domain candidate values.
fn find_in_map(key: &str, map: &Map<String, Value>) -> Option<String> {
    // Check nested oauthTokenData first if present (e.g. Salesforce OAuth)
    if let Some(oauth) = map.get("oauthTokenData").and_then(|v| v.as_object()) {
        for &k in &["instance_url", "instanceUrl", "baseUrl", "base_url", "url"] {
            if let Some(val) = oauth.get(k).and_then(|v| v.as_str()) {
                if let Some(formatted) = format_domain_or_host(key, k, val) {
                    return Some(formatted);
                }
            }
        }
    }

    for &k in URL_KEYS {
        if let Some(val) = map.get(k).and_then(|v| v.as_str()) {
            if let Some(formatted) = format_domain_or_host(key, k, val) {
                return Some(formatted);
            }
        }
    }
    None
}

/// Resolves well-known public API endpoints for services with static URLs.
fn well_known_endpoint(key: &str, cred_map: Option<&Map<String, Value>>) -> Option<String> {
    match key.to_ascii_lowercase().as_str() {
        "anthropic" | "lmchatanthropic" => Some("https://api.anthropic.com".into()),
        "deepseek" => Some("https://api.deepseek.com".into()),
        "groq" => Some("https://api.groq.com/openai/v1".into()),
        "mistral" => Some("https://api.mistral.ai/v1".into()),
        "openai" | "lmchatopenai" => Some("https://api.openai.com/v1".into()),
        "github" => Some("https://api.github.com".into()),
        "gitlab" => Some("https://gitlab.com/api/v4".into()),
        "zohocrm" => Some("https://www.zohoapis.com".into()),
        "paypal" => {
            let is_sandbox = cred_map
                .and_then(|m| m.get("environment"))
                .and_then(|v| v.as_str())
                .map(|s| s.eq_ignore_ascii_case("sandbox"))
                .unwrap_or(false);
            if is_sandbox {
                Some("https://api-m.sandbox.paypal.com".into())
            } else {
                Some("https://api-m.paypal.com".into())
            }
        }
        _ => None,
    }
}

/// Resolves the effective base URL for an n8n node.
pub fn resolve_base_url(
    key: &str,
    data: &Value,
    desc: Option<&NodeDescriptor>,
    params: Option<&Map<String, Value>>,
    credential: Option<&Value>,
) -> Option<String> {
    // 1. Direct override on node
    for &k in &["n8n_base_url", "baseUrl", "base_url"] {
        if let Some(val) = data.get(k).and_then(|v| v.as_str()) {
            let trimmed = val.trim().trim_end_matches('/');
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    let cred_obj = credential_map(credential);

    // 2. Check credentials (tenant/instance specific)
    if let Some(map) = cred_obj {
        if let Some(url) = find_in_map(key, map) {
            return Some(url);
        }
    }

    // 3. Check node parameters
    if let Some(p) = params {
        if let Some(url) = find_in_map(key, p) {
            return Some(url);
        }
    }
    if let Some(cfg) = data.get("n8n_config").and_then(|v| v.as_object()) {
        if let Some(url) = find_in_map(key, cfg) {
            return Some(url);
        }
    }

    // 4. Check descriptor (passed explicitly or from registry)
    let descriptor = desc.or_else(|| DescriptorRegistry::global().get(key));
    if let Some(d) = descriptor {
        if let Some(base) = d.base_url.as_ref() {
            let trimmed = base.trim().trim_end_matches('/');
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    // 5. Well-known static endpoints
    well_known_endpoint(key, cred_obj)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn direct_override_wins() {
        let data = json!({ "n8n_base_url": "https://custom.api.org/v1" });
        let url = resolve_base_url("Jira", &data, None, None, None);
        assert_eq!(url.as_deref(), Some("https://custom.api.org/v1"));
    }

    #[test]
    fn credential_instance_url_resolves() {
        let cred = json!({
            "instance_url": "https://mytenant.my.salesforce.com"
        });
        let url = resolve_base_url("Salesforce", &json!({}), None, None, Some(&cred));
        assert_eq!(url.as_deref(), Some("https://mytenant.my.salesforce.com"));
    }

    #[test]
    fn credential_domain_formats_jira() {
        let cred = json!({
            "data": { "domain": "acmecorp" }
        });
        let url = resolve_base_url("Jira", &json!({}), None, None, Some(&cred));
        assert_eq!(url.as_deref(), Some("https://acmecorp.atlassian.net"));
    }

    #[test]
    fn credential_domain_with_dot_uses_https() {
        let cred = json!({
            "domain": "api.acme.example.com"
        });
        let url = resolve_base_url("Supabase", &json!({}), None, None, Some(&cred));
        assert_eq!(url.as_deref(), Some("https://api.acme.example.com"));
    }

    #[test]
    fn well_known_anthropic_resolves() {
        let url = resolve_base_url("Anthropic", &json!({}), None, None, None);
        assert_eq!(url.as_deref(), Some("https://api.anthropic.com"));
    }

    #[test]
    fn paypal_resolves_environment() {
        let cred = json!({ "environment": "sandbox" });
        let url = resolve_base_url("PayPal", &json!({}), None, None, Some(&cred));
        assert_eq!(url.as_deref(), Some("https://api-m.sandbox.paypal.com"));
    }
}
