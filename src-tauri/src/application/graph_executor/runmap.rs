//! Execution map for the n8n catalogue.
//!
//! Evaluates captured requests from `src/data/n8n-runmap.json`, replacing
//! placeholders, signing AWS calls, resolving relative base URLs from
//! credentials or node config, and executing HTTP requests in pure Rust.

#[path = "runmap_exec.rs"]
pub mod runmap_exec;
#[path = "runmap_models.rs"]
pub mod runmap_models;
#[path = "runmap_subst.rs"]
pub mod runmap_subst;

pub use runmap_exec::run;
pub use runmap_models::*;
use runmap_subst::*;

use crate::application::replay_helpers;
use serde_json::{Map, Value};

pub const DEFAULT_TIMEOUT_SECS: u64 = 60;

fn config_object(data: &Value) -> Map<String, Value> {
    data.get("n8n_config")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn supported_operations(node: &RunNode) -> String {
    let mut names: Vec<String> = node
        .cases
        .iter()
        .filter(|c| c.sendable().is_some())
        .map(|c| match c.resource.as_deref() {
            Some(r) => format!("{}/{}", r, c.operation),
            None => c.operation.clone(),
        })
        .collect();
    names.sort();
    names.join(", ")
}

pub fn plan(data: &Value) -> Result<PlannedRequest, String> {
    let key = data
        .get("n8n_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if key.is_empty() {
        return Err("Este nodo no tiene asignado un nodo de n8n (falta n8n_key).".into());
    }

    let node = RunMap::global().get(&key).ok_or_else(|| {
        format!(
            "El nodo n8n '{}' todavía no tiene un mapa de ejecución: no puede ejecutarse.",
            key
        )
    })?;

    let params = config_object(data);
    let credential = if data
        .get("n8n_credential")
        .map(|value| !value.is_null())
        .unwrap_or(false)
    {
        data.get("n8n_credential").cloned()
    } else {
        replay_helpers::get_current_credential()
    };
    let operation = params
        .get("operation")
        .map(render_scalar)
        .unwrap_or_default()
        .trim()
        .to_string();
    let resource = params.get("resource").map(render_scalar);

    let case = if operation.is_empty() {
        node.cases
            .iter()
            .find(|c| c.operation.is_empty() && c.sendable().is_some())
            .ok_or_else(|| format!("El nodo '{}' no declara ninguna operación ejecutable.", key))?
    } else {
        node.case_for(resource.as_deref(), &operation).ok_or_else(|| {
            format!(
                "La operación '{}' de '{}' todavía no está soportada. Disponibles: {}",
                operation,
                key,
                supported_operations(node)
            )
        })?
    };

    plan_request(&key, data, credential, case)
}

fn plan_request(
    key: &str,
    data: &Value,
    credential: Option<Value>,
    case: &RunCase,
) -> Result<PlannedRequest, String> {
    let params = config_object(data);
    let request = case.sendable().ok_or_else(|| {
        format!(
            "La operación '{}{}' de '{}' no se pudo capturar ({}).",
            case.resource.as_deref().unwrap_or(""),
            case.operation,
            key,
            case.error.as_deref().unwrap_or("sin petición registrada")
        )
    })?;

    if request.path.trim().is_empty() {
        if let Some(qs) = &request.qs {
            let service = resolve_json(
                &Value::String(qs.get("service").and_then(|v| v.as_str()).unwrap_or("").to_string()),
                &params,
                credential.as_ref(),
            );
            let service = render_scalar(&service);
            if service.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') && !service.is_empty() {
                let raw_path = qs
                    .get("path")
                    .map(|p| render_scalar(&resolve_json(p, &params, credential.as_ref())))
                    .unwrap_or_default();
                let body = request.payload().map(|payload| {
                    match resolve_json(payload, &params, credential.as_ref()) {
                        Value::String(s) => s,
                        other => other.to_string(),
                    }
                });
                let extra_query: Vec<(String, String)> = match qs.get("query").and_then(|q| q.as_object()) {
                    Some(inner) => inner
                        .iter()
                        .map(|(name, value)| {
                            (
                                name.clone(),
                                render_scalar(&resolve_json(value, &params, credential.as_ref())),
                            )
                        })
                        .collect(),
                    None => Vec::new(),
                };
                let signed = super::aws::build(
                    &request.method,
                    &super::aws::AwsRecipe { service: service.clone(), path: raw_path },
                    &extra_query,
                    body.as_deref(),
                    credential.as_ref(),
                )
                .ok_or_else(|| {
                    format!(
                        "La credencial 'aws' necesita región, accessKeyId y secretAccessKey para firmar '{}'.",
                        key
                    )
                })?;
                return Ok(PlannedRequest {
                    key: key.to_string(),
                    resource: case.resource.clone(),
                    operation: case.operation.clone(),
                    method: signed.method,
                    url: signed.url,
                    headers: signed.headers,
                    body: signed.body,
                });
            }
        }
        return Err(format!(
            "La operación '{}' de '{}' no tiene URL que enviar: n8n la construye y firma en su propio helper, y este motor no la reproduce (familia AWS).",
            case.operation, key
        ));
    }

    let raw_path = render_path(&request.path, &params, credential.as_ref());
    let url = if raw_path.starts_with("http://") || raw_path.starts_with("https://") {
        raw_path
    } else {
        let base = super::declarative::base_url::resolve_base_url(
            key,
            data,
            None,
            Some(&params),
            credential.as_ref(),
        )
        .ok_or_else(|| {
            format!(
                "La operación '{}' de '{}' necesita una URL base y el nodo no la tiene. Configúrala en 'URL base' o en las credenciales.",
                case.operation, key
            )
        })?;
        format!("{}/{}", base.trim_end_matches('/'), raw_path.trim_start_matches('/'))
    };

    let mut query: Vec<(String, String)> = Vec::new();
    if let Some(qs) = &request.qs {
        for (name, value) in qs {
            let text = render_scalar(&resolve_json(value, &params, credential.as_ref()));
            if !text.is_empty() {
                query.push((name.clone(), text));
            }
        }
    }
    let user_query = super::declarative::runner::parse_query(
        data.get("n8n_qs").and_then(|v| v.as_str()).unwrap_or(""),
    );
    if !user_query.is_empty() {
        query = user_query;
    }

    let mut headers: Vec<(String, String)> = Vec::new();
    if let Some(captured) = &request.headers {
        for (name, value) in captured {
            let text = render_scalar(&resolve_json(value, &params, credential.as_ref()));
            if !text.is_empty() {
                headers.push((name.clone(), text));
            }
        }
    }

    let body = request.payload().map(|payload| {
        match resolve_json(payload, &params, credential.as_ref()) {
            Value::String(s) => s,
            other => other.to_string(),
        }
    });
    if body.is_some() && !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-type")) {
        headers.push(("Content-Type".to_string(), "application/json".to_string()));
    }
    if let Some(raw_body) = data.get("n8n_body").and_then(|v| v.as_str()) {
        if !raw_body.trim().is_empty() {
            let resolved = replay_helpers::interpolate_variables(raw_body);
            return Ok(PlannedRequest {
                key: key.to_string(),
                resource: case.resource.clone(),
                operation: case.operation.clone(),
                method: request.method.trim().to_uppercase(),
                url: super::declarative::runner::with_query(&url, &query),
                headers,
                body: Some(resolved),
            });
        }
    }

    Ok(PlannedRequest {
        key: key.to_string(),
        resource: case.resource.clone(),
        operation: case.operation.clone(),
        method: request.method.trim().to_uppercase(),
        url: super::declarative::runner::with_query(&url, &query),
        headers,
        body,
    })
}

pub fn poll_plan(data: &Value) -> Result<PlannedRequest, String> {
    let key = data
        .get("n8n_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if key.is_empty() {
        return Err("Este disparador no tiene asignado un nodo de n8n (falta n8n_key).".into());
    }

    let node = RunMap::global().get(&key).ok_or_else(|| {
        format!(
            "El disparador n8n '{}' todavía no tiene un mapa de ejecución: no puede sondearse.",
            key
        )
    })?;

    let case = node
        .cases
        .iter()
        .find(|case| case.operation.is_empty() && case.sendable().is_some())
        .ok_or_else(|| {
            format!(
                "El disparador n8n '{}' no tiene su `poll()` capturado: no puede sondearse.",
                key
            )
        })?;

    plan_request(
        &key,
        data,
        crate::application::graph_executor::declarative::credential_for(data),
        case,
    )
}

#[cfg(test)]
#[path = "runmap_tests.rs"]
mod tests;
