//! Generic runner for declarative n8n nodes.
//!
//! One code path executes every node in the generated catalogue: the descriptor
//! supplies the base URL and the authentication scheme, the node's own config
//! supplies method / path / query / body, and the response is mapped onto the
//! item list using the same envelope as the hand-written action nodes.

use super::auth::{self, AuthApplication};
use super::base_url;
use super::descriptor::{DescriptorRegistry, NodeDescriptor};
use super::helpers::*;
use crate::application::replay_helpers;
use serde_json::{Map, Value};

// Re-export query/encode/item helpers for sibling modules (e.g. runmap, trigger_service).
pub use super::helpers::{
    cfg, cfg_bool, cfg_object, cfg_u64, config_to_query, encode_component, interpolate_json,
    item_with_result, join_url, parse_query, request_once, response_items, with_query,
};

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

/// The daemon half of [`auth_for`]: same vault read-through, but usable from
/// the trigger service, which plans its polls without a replay to lean on.
pub fn auth_for_data(data: &Value, desc: &NodeDescriptor) -> AuthApplication {
    auth_for(data, desc)
}

/// One polling fetch, as the trigger daemon needs it.
#[derive(Debug, Clone)]
pub struct PollOutcome {
    pub url: String,
    pub status: u16,
    pub body: String,
}

/// Fetches a polling trigger's endpoint once.
pub fn poll_once(data: &Value, desc: &NodeDescriptor) -> Result<PollOutcome, String> {
    let cred = credential_for(data);
    let path = cfg(data, "n8n_path");
    let base = if path.starts_with("http://") || path.starts_with("https://") {
        String::new()
    } else {
        base_url::resolve_base_url(&desc.key, data, Some(desc), None, cred.as_ref())
            .ok_or_else(|| {
                format!(
                    "El disparador '{}' no tiene URL base. Escribe una en 'URL base' para poder sondearlo.",
                    desc.display_name
                )
            })?
    };

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

    let url = join_url(&base, &path);
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
    Ok(PollOutcome {
        url: full_url,
        status,
        body,
    })
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
    let cred = replay_helpers::get_current_credential();
    let n8n_config = cfg_object(data, "n8n_config")
        .map(|m| interpolate_json(&Value::Object(m)))
        .and_then(|v| v.as_object().cloned());
    let path = cfg(data, "n8n_path");

    let base = if path.starts_with("http://") || path.starts_with("https://") {
        String::new()
    } else {
        base_url::resolve_base_url(&desc.key, data, Some(desc), n8n_config.as_ref(), cred.as_ref())
            .ok_or_else(|| {
                format!(
                    "El nodo '{}' no tiene URL base. Escribe una en 'URL base' para poder ejecutarlo.",
                    desc.display_name
                )
            })?
    };

    let method = {
        let m = cfg(data, "n8n_method");
        if m.trim().is_empty() {
            "GET".to_string()
        } else {
            m.trim().to_uppercase()
        }
    };

    let url = join_url(&base, &path);
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
#[path = "runner_tests.rs"]
mod tests;
