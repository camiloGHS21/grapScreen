//! Utility and formatting helpers for declarative n8n execution.

use super::auth::AuthApplication;
use crate::application::http_client::{self, HttpRequest};
use crate::application::replay_helpers;
use serde_json::{json, Map, Value};

pub const DEFAULT_TIMEOUT_SECS: u64 = 60;
pub const MAX_PAGINATION_PAGES: u64 = 50;

/// Reads a config string, interpolating `{{ … }}` expressions.
pub fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(replay_helpers::interpolate_variables)
        .unwrap_or_default()
}

pub fn cfg_u64(data: &Value, key: &str) -> Option<u64> {
    data.get(key).and_then(|v| match v {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.trim().parse().ok(),
        Value::Bool(b) => Some(u64::from(*b)),
        _ => None,
    })
}

pub fn cfg_bool(data: &Value, key: &str) -> bool {
    match data.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "si" | "sí" | "yes"
        ),
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0) != 0,
        _ => false,
    }
}

/// Reads an object from the node config.
pub fn cfg_object(data: &Value, key: &str) -> Option<Map<String, Value>> {
    data.get(key).and_then(|v| v.as_object()).cloned()
}

/// Recursively interpolates `{{ … }}` expressions inside a JSON value.
pub fn interpolate_json(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(replay_helpers::interpolate_variables(s)),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), interpolate_json(v)))
                .collect(),
        ),
        Value::Array(arr) => Value::Array(arr.iter().map(interpolate_json).collect()),
        other => other.clone(),
    }
}

/// Turns the flat primitive entries of `n8n_config` into query pairs.
pub fn config_to_query(config: &Map<String, Value>) -> Vec<(String, String)> {
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
pub fn join_url(base: &str, path: &str) -> String {
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
pub fn parse_query(raw: &str) -> Vec<(String, String)> {
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

/// Percent-encodes a query value.
pub fn encode_component(s: &str) -> String {
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

pub fn with_query(url: &str, query: &[(String, String)]) -> String {
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

/// Merges a response object into the item that produced it.
pub fn item_with_result(item: Option<&Value>, result: Map<String, Value>) -> Value {
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

/// Turns a JSON response body into items.
pub fn response_items(body: &str) -> Vec<Value> {
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

pub fn request_once(
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
