//! Execution runner for n8n runmap nodes.

use super::{plan, DEFAULT_TIMEOUT_SECS};
use crate::application::graph_executor::declarative;
use crate::application::http_client::{self, HttpRequest};
use crate::application::replay_helpers;
use serde_json::{Map, Value};

/// Whether the node was told to treat a non-2xx answer as data.
pub fn ignores_http_errors(data: &Value) -> bool {
    match data.get("n8n_ignore_http_errors") {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::String(text)) => {
            let text = text.trim().to_ascii_lowercase();
            text == "true" || text == "1"
        }
        _ => false,
    }
}

/// Executes one mapped catalogue node, once per incoming item.
pub fn run(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let key = data
        .get("n8n_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let credential = replay_helpers::get_current_credential();
    let auth = match declarative::registry().get(&key).and_then(|d| d.credential.as_ref()) {
        Some(spec) => declarative::auth::apply(spec, credential.as_ref()),
        None => Default::default(),
    };
    for note in &auth.notes {
        replay_helpers::warn_ui("n8n_node", note);
    }

    let targets: Vec<Option<Value>> = if items.is_empty() {
        vec![None]
    } else {
        items.iter().cloned().map(Some).collect()
    };

    let mut out: Vec<Value> = Vec::new();
    for item in targets {
        let planned = plan(data)?;
        let mut headers = planned.headers.clone();
        for (name, value) in &auth.headers {
            if !headers.iter().any(|(n, _)| n.eq_ignore_ascii_case(name)) {
                headers.push((name.clone(), value.clone()));
            }
        }
        let url = declarative::runner::with_query(&planned.url, &auth.query);
        let request = HttpRequest {
            method: planned.method.clone(),
            url: url.clone(),
            headers,
            body: planned.body.clone(),
            timeout_secs: DEFAULT_TIMEOUT_SECS,
        };

        let response = http_client::send(&request)
            .map_err(|e| format!("{} {}: {}", planned.method, url, e))?;
        if !response.is_success() && !ignores_http_errors(data) {
            return Err(format!(
                "{} {} devolvió {}: {}",
                planned.method,
                url,
                response.status,
                http_client::preview(&response.body, 300)
            ));
        }

        let parsed = declarative::runner::response_items(&response.body);
        if parsed.is_empty() {
            out.push(declarative::runner::item_with_result(
                item.as_ref(),
                Map::new(),
            ));
            continue;
        }
        out.extend(parsed.into_iter().map(|value| match value {
            Value::Object(map) => declarative::runner::item_with_result(item.as_ref(), map),
            other => {
                let mut map = Map::new();
                map.insert("value".to_string(), other);
                declarative::runner::item_with_result(item.as_ref(), map)
            }
        }));
    }
    Ok(out)
}
