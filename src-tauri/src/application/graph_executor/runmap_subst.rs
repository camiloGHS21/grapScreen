//! Placeholder and parameter substitution for n8n runmap.

use crate::application::replay_helpers;
use serde_json::{Map, Value};

/// The prefixes the capture script writes for a value it could not know.
const P: &str = "{{$parameter.";
const C: &str = "{{$credentials.";

/// Formats a credential URL/domain field ensuring it has an https:// protocol.
pub fn format_cred_url_field(name: &str, s: &str) -> String {
    let trimmed = s.trim().trim_end_matches('/');
    if trimmed.is_empty() || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    let last = name.split('.').next_back().unwrap_or(name).to_ascii_lowercase();
    match last.as_str() {
        "domain" | "subdomain" => {
            if trimmed.contains('.') {
                format!("https://{}", trimmed)
            } else {
                format!("https://{}.atlassian.net", trimmed)
            }
        }
        "host" | "server" | "instance_url" | "instanceurl" | "base_url" | "baseurl" | "url"
        | "api_url" | "apiurl" => format!("https://{}", trimmed),
        _ => trimmed.to_string(),
    }
}

/// Renders one parameter value into text, the way n8n puts it into a URL.
pub fn render_scalar(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Looks a parameter up by name, then by dotted path (`a.b`).
pub fn param_at<'a>(params: &'a Map<String, Value>, name: &str) -> Option<&'a Value> {
    if name == "this" {
        for (_, v) in params {
            if let Some(inner) = v.as_object() {
                if inner.get("__rl") == Some(&Value::Bool(true)) {
                    if let Some(value) = inner.get("value") {
                        return Some(value);
                    }
                }
            }
        }
        return None;
    }
    if let Some(found) = params.get(name) {
        return Some(found);
    }
    let mut parts = name.split('.');
    let first = parts.next()?;
    let mut current = params.get(first)?;
    for part in parts {
        current = current.get(part)?;
    }
    Some(current)
}

/// The decrypted credential the node runs with, unwrapped from its envelope.
pub fn credential_object(credential: Option<&Value>) -> Option<&Map<String, Value>> {
    let credential = credential?;
    match credential.get("data") {
        Some(data) if data.is_object() => data.as_object(),
        _ => credential.as_object(),
    }
}

/// Looks a placeholder name up in the source it names.
pub fn lookup<'a>(
    kind: &str,
    name: &str,
    params: &'a Map<String, Value>,
    credential: Option<&'a Value>,
) -> Option<Value> {
    if kind == "cred" {
        let map = credential_object(credential)?;
        let mut parts = name.split('.');
        let first = parts.next().unwrap_or(name);
        let mut current: Option<&Value> = map.get(first).or_else(|| {
            map.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(first))
                .map(|(_, v)| v)
        });
        if current.is_some() {
            for part in parts {
                current = current.and_then(|c| c.as_object()).and_then(|obj| {
                    obj.get(part).or_else(|| {
                        obj.iter()
                            .find(|(k, _)| k.eq_ignore_ascii_case(part))
                            .map(|(_, v)| v)
                    })
                });
            }
        }
        let val = current.cloned().or_else(|| {
            if name.contains('.') {
                let last = name.split('.').next_back()?;
                map.get(last)
                    .or_else(|| {
                        map.iter()
                            .find(|(k, _)| k.eq_ignore_ascii_case(last))
                            .map(|(_, v)| v)
                    })
                    .cloned()
            } else {
                None
            }
        })?;

        if let Value::String(ref s) = val {
            let formatted = format_cred_url_field(name, s);
            return Some(Value::String(formatted));
        }
        return Some(val);
    }
    param_at(params, name).cloned()
}

/// What a `{{ … }}` placeholder at the front of `rest` refers to.
pub fn placeholder_at(rest: &str) -> Option<(&'static str, String, usize)> {
    for (prefix, kind) in [(P, "param"), (C, "cred")] {
        if !rest.starts_with(prefix) {
            continue;
        }
        let after = &rest[prefix.len()..];
        let end = after.find("}}")?;
        return Some((kind, after[..end].trim().to_string(), prefix.len() + end + 2));
    }
    None
}

/// True when the text is exactly one placeholder.
pub fn whole_placeholder(template: &str) -> Option<(&'static str, String)> {
    let trimmed = template.trim();
    let (kind, name, span) = placeholder_at(trimmed)?;
    if span != trimmed.len() || name.contains("{{") {
        return None;
    }
    Some((kind, name))
}

/// Replaces every parameter/credential placeholder with its value.
pub fn substitute_params(
    template: &str,
    params: &Map<String, Value>,
    credential: Option<&Value>,
) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        match placeholder_at(&rest[start..]) {
            Some((kind, name, span)) => {
                if let Some(value) = lookup(kind, &name, params, credential) {
                    out.push_str(&render_scalar(&value));
                }
                rest = &rest[start + span..];
            }
            None => {
                out.push_str("{{");
                rest = &rest[start + 2..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Resolves a captured value, keeping JSON types and evaluating engine expressions.
pub fn resolve_json(
    value: &Value,
    params: &Map<String, Value>,
    credential: Option<&Value>,
) -> Value {
    match value {
        Value::String(s) => {
            if let Some((kind, name)) = whole_placeholder(s) {
                return lookup(kind, &name, params, credential).unwrap_or(Value::Null);
            }
            Value::String(replay_helpers::interpolate_variables(&substitute_params(
                s, params, credential,
            )))
        }
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|v| resolve_json(v, params, credential))
                .collect(),
        ),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), resolve_json(v, params, credential)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Renders the captured path, percent-encoding placeholder values inside it.
pub fn render_path(
    template: &str,
    params: &Map<String, Value>,
    credential: Option<&Value>,
) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        match placeholder_at(&rest[start..]) {
            Some((kind, name, span)) => {
                let raw = lookup(kind, &name, params, credential)
                    .map(|value| render_scalar(&value))
                    .unwrap_or_default();
                if raw.starts_with("http://") || raw.starts_with("https://") {
                    out.push_str(&raw);
                } else {
                    out.push_str(&crate::application::graph_executor::declarative::runner::encode_component(&raw));
                }
                rest = &rest[start + span..];
            }
            None => {
                out.push_str("{{");
                rest = &rest[start + 2..];
            }
        }
    }
    out.push_str(rest);
    replay_helpers::interpolate_variables(&out)
}
