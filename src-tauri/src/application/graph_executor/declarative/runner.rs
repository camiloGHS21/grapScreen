//! Generic runner for declarative n8n nodes.
//!
//! One code path executes every node in the generated catalogue: the descriptor
//! supplies the base URL and the authentication scheme, the node's own config
//! supplies method / path / query / body, and the response is mapped onto the
//! item list using the same envelope as the hand-written action nodes.
//!
//! This runs once per incoming item, which is the n8n execution model: an HTTP
//! action fires per item, with `{{ $json.x }}` resolving against that item.

use super::auth::{self, AuthApplication};
use super::descriptor::{DescriptorRegistry, NodeDescriptor};
use crate::application::http_client::{self, HttpRequest};
use crate::application::replay_helpers;
use serde_json::{json, Map, Value};

const DEFAULT_TIMEOUT_SECS: u64 = 60;
const MAX_PAGINATION_PAGES: u64 = 50;

/// Reads a config string, interpolating `{{ … }}` expressions.
fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(replay_helpers::interpolate_variables)
        .unwrap_or_default()
}

fn cfg_u64(data: &Value, key: &str) -> Option<u64> {
    data.get(key).and_then(|v| match v {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.trim().parse().ok(),
        Value::Bool(b) => Some(u64::from(*b)),
        _ => None,
    })
}

fn cfg_bool(data: &Value, key: &str) -> bool {
    match data.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => matches!(s.trim().to_ascii_lowercase().as_str(), "1" | "true" | "si" | "sí" | "yes"),
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0) != 0,
        _ => false,
    }
}

/// Reads an object from the node config.
fn cfg_object(data: &Value, key: &str) -> Option<Map<String, Value>> {
    data.get(key).and_then(|v| v.as_object()).cloned()
}

/// Recursively interpolates `{{ … }}` expressions inside a JSON value.
fn interpolate_json(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(replay_helpers::interpolate_variables(s)),
        Value::Object(map) => Value::Object(
            map.iter().map(|(k, v)| (k.clone(), interpolate_json(v))).collect(),
        ),
        Value::Array(arr) => Value::Array(arr.iter().map(interpolate_json).collect()),
        other => other.clone(),
    }
}

/// Turns the flat primitive entries of `n8n_config` into query pairs.
/// Nested objects / arrays are skipped — they belong in a JSON body.
fn config_to_query(config: &Map<String, Value>) -> Vec<(String, String)> {
    config
        .iter()
        .filter_map(|(k, v)| {
            let s = match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                _ => return None,
            };
            Some((k.clone(), s))
        })
        .collect()
}

/// Joins a base URL and a path without producing a double slash or eating a
/// meaningful one. The path may itself be an absolute URL, which wins outright.
fn join_url(base: &str, path: &str) -> String {
    let path = path.trim();
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }
    let base = base.trim().trim_end_matches('/');
    if path.is_empty() {
        return base.to_string();
    }
    format!("{}/{}", base, path.trim_start_matches('/'))
}

/// Normalises the query config, which the UI may hand over as a JSON object, a
/// JSON string or a plain `a=1&b=2` fragment.
///
/// `pub(crate)`: `runmap` merges the captured query with the user's override and
/// needs the same parser.
pub(crate) fn parse_query(raw: &str) -> Vec<(String, String)> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Vec::new();
    }
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) {
        return map
            .into_iter()
            .map(|(k, v)| {
                let s = match v {
                    Value::String(s) => s,
                    other => other.to_string(),
                };
                (k, s)
            })
            .collect();
    }
    raw.split('&')
        .filter(|p| !p.trim().is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((k, v)) => (k.trim().to_string(), v.trim().to_string()),
            None => (pair.trim().to_string(), String::new()),
        })
        .filter(|(k, _)| !k.is_empty())
        .collect()
}

/// Percent-encodes a query value. Encoding the whole pair by hand keeps the
/// dependency surface at zero for something this small.
///
/// `pub(crate)` because `runmap` renders parameter values into URL paths and
/// needs the same escaping rules a query value gets.
pub(crate) fn encode_component(s: &str) -> String {
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

pub(crate) fn with_query(url: &str, query: &[(String, String)]) -> String {
    if query.is_empty() {
        return url.to_string();
    }
    let qs = query
        .iter()
        .map(|(k, v)| format!("{}={}", encode_component(k), encode_component(v)))
        .collect::<Vec<_>>()
        .join("&");
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{}{}{}", url, sep, qs)
}

/// Merges a response object into the item that produced it, so upstream fields
/// stay reachable downstream. Mirrors the hand-written action nodes.
pub(crate) fn item_with_result(item: Option<&Value>, result: Map<String, Value>) -> Value {
    let mut obj = match item {
        Some(v) => match crate::application::expressions::unwrap_item(v) {
            Value::Object(m) => m,
            other => {
                let mut m = Map::new();
                m.insert("value".to_string(), other);
                m
            }
        },
        None => Map::new(),
    };
    for (k, v) in result {
        obj.insert(k, v);
    }
    json!({ "json": Value::Object(obj) })
}

/// Turns a JSON response body into items. An array fans out — the engine's
/// transform nodes all expect a list — while anything else becomes one item.
pub(crate) fn response_items(body: &str) -> Vec<Value> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return vec![json!({})];
    }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(Value::Array(arr)) => arr,
        Ok(Value::Null) => vec![json!({})],
        Ok(other) => vec![other],
        Err(_) => vec![json!({ "body": trimmed })],
    }
}

fn request_once(
    method: &str,
    url: &str,
    auth: &AuthApplication,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let mut headers: Vec<(String, String)> = auth.headers.clone();
    if body.is_some() && !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-type")) {
        headers.push(("Content-Type".to_string(), "application/json".to_string()));
    }

    let req = HttpRequest {
        method: method.trim().to_uppercase(),
        url: url.to_string(),
        headers,
        body: body.map(|b| b.to_string()),
        timeout_secs: DEFAULT_TIMEOUT_SECS,
    };

    let resp = http_client::send(&req).map_err(|e| format!("{}", e))?;
    if !resp.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            resp.status,
            http_client::preview(resp.body.trim(), 300)
        ));
    }
    Ok((resp.status, resp.body))
}

// ── Entry points for the trigger daemon ───────────────────────────────────
// The daemon watches armed triggers on its own threads, long before any replay
// starts. It therefore cannot use `credentials::install_for_node`, which fills
// the replay thread-locals — it resolves the credential from the vault directly.

/// Resolves the credential attached to a node config straight from the vault.
pub fn credential_for(data: &Value) -> Option<Value> {
    let id = data
        .get("credential_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    crate::application::vault_service::service::get_vault_service().resolve_credential_data(id)
}

/// Builds the authentication a node's descriptor declares, resolving the
/// credential from the vault rather than from the replay thread-locals.
fn auth_for(data: &Value, desc: &NodeDescriptor) -> AuthApplication {
    let credential = credential_for(data);
    match desc.credential.as_ref() {
        Some(spec) => auth::apply(spec, credential.as_ref()),
        None => AuthApplication::default(),
    }
}

/// One polling fetch, as the trigger daemon needs it.
#[derive(Debug, Clone)]
pub struct PollOutcome {
    pub url: String,
    pub status: u16,
    pub body: String,
}

/// Fetches a polling trigger's endpoint once.
///
/// Mirrors the URL and auth handling of `run_one`, minus the item envelope:
/// the daemon only needs the raw payload so it can decide whether anything
/// actually changed since the previous poll.
pub fn poll_once(data: &Value, desc: &NodeDescriptor) -> Result<PollOutcome, String> {
    let override_url = cfg(data, "n8n_base_url");
    let base = desc
        .effective_base_url(Some(override_url.as_str()))
        .ok_or_else(|| {
            format!(
                "El disparador '{}' no tiene URL base. Escribe una en 'URL base' para poder sondearlo.",
                desc.display_name
            )
        })?;

    let auth = auth_for(data, desc);
    for note in &auth.notes {
        replay_helpers::warn_ui("n8n_trigger", note);
    }

    let method = {
        let m = cfg(data, "n8n_method");
        if m.trim().is_empty() {
            "GET".to_string()
        } else {
            m.trim().to_uppercase()
        }
    };

    let url = join_url(&base, &cfg(data, "n8n_path"));

    let n8n_config = cfg_object(data, "n8n_config")
        .map(|m| interpolate_json(&Value::Object(m)))
        .and_then(|v| v.as_object().cloned());

    let mut query = parse_query(&cfg(data, "n8n_qs"));
    if query.is_empty() {
        if let Some(ref cfg) = n8n_config {
            query = config_to_query(cfg);
        }
    }
    query.extend(auth.query.clone());
    let full_url = with_query(&url, &query);

    let body_raw = cfg(data, "n8n_body");
    let body = if body_raw.trim().is_empty() {
        n8n_config.map(|c| Value::Object(c).to_string())
    } else {
        Some(body_raw)
    };

    let (status, body) = request_once(&method, &full_url, &auth, body.as_deref())?;
    Ok(PollOutcome { url: full_url, status, body })
}

/// Executes one declarative node for every incoming item.
pub fn run(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let key = cfg(data, "n8n_key");
    let key = key.trim();
    if key.is_empty() {
        return Err("Este nodo no tiene asignado un nodo de n8n (falta n8n_key).".into());
    }

    let registry = DescriptorRegistry::global();
    let desc = registry
        .get(key)
        .ok_or_else(|| format!("El nodo n8n '{}' no está en el catálogo.", key))?;

    let credential = replay_helpers::get_current_credential();
    let auth = match desc.credential.as_ref() {
        Some(spec) => auth::apply(spec, credential.as_ref()),
        None => AuthApplication::default(),
    };
    for note in &auth.notes {
        replay_helpers::warn_ui("n8n_node", note);
    }

    // With no input items the node still fires once — that is how an API call
    // placed right after a trigger behaves when the trigger carried no payload.
    let targets: Vec<Option<Value>> = if items.is_empty() {
        vec![None]
    } else {
        items.iter().cloned().map(Some).collect()
    };

    let mut out = Vec::with_capacity(targets.len());
    for item in targets {
        out.extend(run_one(data, desc, &auth, item.as_ref())?);
    }
    Ok(out)
}

fn run_one(
    data: &Value,
    desc: &NodeDescriptor,
    auth: &AuthApplication,
    item: Option<&Value>,
) -> Result<Vec<Value>, String> {
    let override_url = cfg(data, "n8n_base_url");
    let base = desc
        .effective_base_url(Some(override_url.as_str()))
        .ok_or_else(|| {
            format!(
                "El nodo '{}' no tiene URL base. Escribe una en 'URL base' para poder ejecutarlo.",
                desc.display_name
            )
        })?;

    let method = {
        let m = cfg(data, "n8n_method");
        if m.trim().is_empty() {
            "GET".to_string()
        } else {
            m.trim().to_uppercase()
        }
    };

    let url = join_url(&base, &cfg(data, "n8n_path"));

    let n8n_config = cfg_object(data, "n8n_config")
        .map(|m| interpolate_json(&Value::Object(m)))
        .and_then(|v| v.as_object().cloned());

    let mut query = parse_query(&cfg(data, "n8n_qs"));
    if query.is_empty() {
        if let Some(ref cfg) = n8n_config {
            query = config_to_query(cfg);
        }
    }
    query.extend(auth.query.clone());

    let body_raw = cfg(data, "n8n_body");
    let body = if body_raw.trim().is_empty() {
        n8n_config.map(|c| Value::Object(c).to_string())
    } else {
        Some(body_raw)
    };

    let paginate = cfg_bool(data, "n8n_paginate");
    let page_param = {
        let p = cfg(data, "n8n_page_param");
        if p.trim().is_empty() {
            "page".to_string()
        } else {
            p.trim().to_string()
        }
    };
    let max_pages = cfg_u64(data, "n8n_max_pages")
        .unwrap_or(MAX_PAGINATION_PAGES)
        .clamp(1, MAX_PAGINATION_PAGES);

    let mut collected: Vec<Value> = Vec::new();
    let mut page: u64 = 1;

    loop {
        let mut page_query = query.clone();
        if paginate && page > 1 {
            page_query.push((page_param.clone(), page.to_string()));
        }
        let full_url = with_query(&url, &page_query);

        let (_, response_body) = request_once(&method, &full_url, auth, body.as_deref())?;
        let items = response_items(&response_body);

        let empty = items.is_empty();
        collected.extend(items);

        if !paginate || empty || page >= max_pages {
            break;
        }
        page += 1;
    }

    if collected.is_empty() {
        return Ok(vec![item_with_result(item, Map::new())]);
    }

    Ok(collected
        .into_iter()
        .map(|v| match v {
            Value::Object(map) => item_with_result(item, map),
            other => {
                let mut m = Map::new();
                m.insert("value".to_string(), other);
                item_with_result(item, m)
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::super::descriptor::RequestTemplate;
    use super::*;
    use serde_json::json;

    #[test]
    fn join_url_does_not_double_the_slash() {
        assert_eq!(
            join_url("https://api.slack.com/api/", "/conversations.list"),
            "https://api.slack.com/api/conversations.list"
        );
        assert_eq!(
            join_url("https://api.slack.com/api", "conversations.list"),
            "https://api.slack.com/api/conversations.list"
        );
    }

    #[test]
    fn an_absolute_path_overrides_the_base_url() {
        assert_eq!(
            join_url("https://api.example.com", "https://other.test/v1/thing"),
            "https://other.test/v1/thing"
        );
    }

    #[test]
    fn join_url_keeps_a_bare_base_when_the_path_is_empty() {
        assert_eq!(join_url("https://api.example.com/", ""), "https://api.example.com");
    }

    #[test]
    fn query_accepts_json_objects_and_plain_fragments() {
        // Order-insensitive on purpose: `serde_json` sorts object keys unless
        // the `preserve_order` feature is on, and query-parameter order carries
        // no meaning.
        let sorted = |mut v: Vec<(String, String)>| {
            v.sort();
            v
        };
        let expected = vec![
            ("cursor".to_string(), "abc".to_string()),
            ("limit".to_string(), "10".to_string()),
        ];
        assert_eq!(
            sorted(parse_query(r#"{"limit": 10, "cursor": "abc"}"#)),
            sorted(expected.clone())
        );
        assert_eq!(sorted(parse_query("limit=10&cursor=abc")), sorted(expected));
        assert!(parse_query("   ").is_empty());
    }

    #[test]
    fn a_parameter_without_a_value_is_still_sent() {
        assert_eq!(
            parse_query("verbose"),
            vec![("verbose".to_string(), String::new())]
        );
    }

    #[test]
    fn query_values_are_percent_encoded() {
        let url = with_query("https://x.test/a", &[("q".into(), "a b&c".into())]);
        assert_eq!(url, "https://x.test/a?q=a%20b%26c");
    }

    #[test]
    fn query_appends_with_ampersand_when_the_url_already_has_one() {
        let url = with_query("https://x.test/a?z=1", &[("q".into(), "2".into())]);
        assert_eq!(url, "https://x.test/a?z=1&q=2");
    }

    #[test]
    fn a_json_array_response_fans_out() {
        let items = response_items(r#"[{"id":1},{"id":2}]"#);
        assert_eq!(items.len(), 2);
        assert_eq!(items[1]["id"], json!(2));
    }

    #[test]
    fn a_json_object_response_becomes_one_item() {
        let items = response_items(r#"{"ok":true}"#);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["ok"], json!(true));
    }

    #[test]
    fn a_non_json_response_is_preserved_under_body() {
        let items = response_items("<html>hola</html>");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["body"], json!("<html>hola</html>"));
    }

    #[test]
    fn an_empty_response_body_yields_an_empty_object() {
        assert_eq!(response_items("   ").len(), 1);
        assert_eq!(response_items("")[0], json!({}));
    }

    #[test]
    fn response_fields_are_merged_over_the_input_item() {
        let input = json!({ "json": { "id": 1, "keep": "yes" } });
        let mut m = Map::new();
        m.insert("id".to_string(), json!(2));
        let out = item_with_result(Some(&input), m);
        assert_eq!(out["json"]["id"], json!(2));
        assert_eq!(out["json"]["keep"], json!("yes"));
    }

    #[test]
    fn a_missing_key_fails_with_a_readable_message() {
        let err = run(&json!({}), vec![]).unwrap_err();
        assert!(err.contains("n8n_key"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn an_unknown_key_names_the_missing_node() {
        let err = run(&json!({ "n8n_key": "NoSuchNodeXyz" }), vec![]).unwrap_err();
        assert!(err.contains("NoSuchNodeXyz"), "mensaje inesperado: {}", err);
    }

    /// A polling trigger with no usable API root must say so instead of issuing
    /// a request against an empty URL.
    #[test]
    fn polling_without_a_base_url_explains_what_is_missing() {
        let desc = NodeDescriptor {
            key: "GmailTrigger".into(),
            display_name: "Gmail Trigger".into(),
            description: String::new(),
            category: String::new(),
            subcategory: None,
            group: None,
            is_trigger: true,
            trigger_mode: Some("polling".into()),
            polling: true,
            webhook: false,
            package: String::new(),
            path: String::new(),
            credential: None,
            base_url: None,
            request: RequestTemplate::default(),
        };
        let err = poll_once(&json!({}), &desc).unwrap_err();
        assert!(err.contains("URL base"), "mensaje inesperado: {}", err);
        assert!(
            err.contains("Gmail Trigger"),
            "el error debe nombrar el nodo: {}",
            err
        );
    }

    #[test]
    fn polling_reads_the_base_url_override_from_the_node() {
        // The node-level override is what makes a wrong extraction fixable, so
        // it has to be the value the daemon actually dials. Verified through the
        // descriptor rather than the network.
        let desc = NodeDescriptor {
            key: "X".into(),
            display_name: "X".into(),
            description: String::new(),
            category: String::new(),
            subcategory: None,
            group: None,
            is_trigger: true,
            trigger_mode: Some("polling".into()),
            polling: true,
            webhook: false,
            package: String::new(),
            path: String::new(),
            credential: None,
            base_url: Some("https://from-descriptor.test".into()),
            request: RequestTemplate::default(),
        };
        let node = json!({ "n8n_base_url": "https://from-node.test" });
        let picked = desc.effective_base_url(Some(cfg(&node, "n8n_base_url").as_str()));
        assert_eq!(picked.as_deref(), Some("https://from-node.test"));
    }
}
