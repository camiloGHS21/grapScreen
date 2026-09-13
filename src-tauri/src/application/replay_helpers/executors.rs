use super::{interpolate_variables, set_items, set_var, warn_ui};
use crate::application::http_client::{self, HttpError, HttpRequest};
use serde_json::Value;

/// Higher timeout than the client default: an HTTP Request node is often
/// pointed at a slow internal system, and the previous `curl` invocation
/// allowed 120s too.
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 120;

pub fn execute_http_request(data: &Value) -> bool {
    let method = data["method"].as_str().unwrap_or("GET").to_uppercase();
    let url = interpolate_variables(data["url"].as_str().unwrap_or(""));
    if url.trim().is_empty() {
        warn_ui("http_request", "El nodo HTTP Request no tiene URL configurada.");
        return false;
    }
    let headers_raw = data["headers"].as_str().unwrap_or("");
    let body = interpolate_variables(data["body"].as_str().unwrap_or(""));
    let output_var = data["output_var"].as_str().unwrap_or("http_response").to_string();

    // Interpolate expressions into every header value, then merge the vault
    // credential. Explicit node headers win, so a flow can always override.
    let mut headers: Vec<(String, String)> = http_client::parse_headers(headers_raw)
        .into_iter()
        .map(|(k, v)| (k, interpolate_variables(&v)))
        .collect();

    if let Some(credential) = super::get_current_credential() {
        headers = http_client::merge_headers(&headers, http_client::credential_headers(&credential));
    }

    // A body is only meaningful for methods that carry one.
    let send_body = if !body.trim().is_empty() && method != "GET" && method != "HEAD" {
        Some(body)
    } else {
        None
    };

    let request = HttpRequest {
        method: method.clone(),
        url: url.clone(),
        headers,
        body: send_body,
        timeout_secs: HTTP_REQUEST_TIMEOUT_SECS,
    };

    match http_client::send(&request) {
        Ok(response) => {
            let body_text = response.body.trim().to_string();
            let status = response.status_text();

            set_var(&output_var, &body_text);
            set_var(&format!("{}_status", output_var), &status);

            if let Ok(json_val) = serde_json::from_str::<Value>(&body_text) {
                if let Value::Array(arr) = json_val {
                    set_items(arr);
                } else if json_val.is_object() {
                    set_items(vec![json_val]);
                }
            }

            if !response.is_success() {
                warn_ui(
                    "http_request",
                    &format!("La petición a {} devolvió el estado {}.", url, status),
                );
                return false;
            }
            true
        }
        Err(HttpError::InvalidRequest(msg)) => {
            warn_ui("http_request", &msg);
            set_var(&output_var, &format!("ERROR: {}", msg));
            false
        }
        Err(HttpError::Transport(msg)) => {
            // The native client reports *why* the request failed (DNS, TLS,
            // timeout, refused connection) instead of an opaque exit code.
            warn_ui("http_request", &msg);
            set_var(&output_var, &format!("ERROR: {}", msg));
            set_var(&format!("{}_status", output_var), "000");
            false
        }
    }
}

pub fn execute_code_node(data: &Value) -> bool {
    let language = data["language"].as_str().unwrap_or("javascript").to_lowercase();
    let code = interpolate_variables(data["code"].as_str().unwrap_or(""));
    let output_var = data["output_var"].as_str().unwrap_or("code_output").to_string();
    let (exe, ext) = if language.starts_with("py") { ("python", "py") } else { ("node", "js") };

    let file_path = std::env::temp_dir().join(format!("grapscreen_code_{}.{}", std::process::id(), ext));
    if std::fs::write(&file_path, &code).is_err() {
        warn_ui("code", "No se pudo escribir el script temporal.");
        return false;
    }
    let result = std::process::Command::new(exe).arg(&file_path).output();
    let _ = std::fs::remove_file(&file_path);

    match result {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let res_text = if stdout.is_empty() { &stderr } else { &stdout };
            set_var(&output_var, res_text);

            if let Ok(json_val) = serde_json::from_str::<Value>(res_text) {
                if let Value::Array(arr) = json_val {
                    set_items(arr);
                } else if json_val.is_object() {
                    set_items(vec![json_val]);
                }
            }

            if out.status.success() {
                true
            } else {
                let short: String = stderr.chars().take(200).collect();
                warn_ui("code", &format!("El script terminó con error: {}", short));
                false
            }
        }
        Err(e) => {
            warn_ui("code", &format!("No se encontró el intérprete '{}' ({}). Instálalo o cambia el lenguaje.", exe, e));
            set_var(&output_var, &format!("ERROR: {}", e));
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The node must reject a missing URL before opening any connection, and
    /// must not touch the output variable in that case.
    #[test]
    fn http_request_without_url_warns_and_fails() {
        crate::application::replay_helpers::reset_execution_state();
        assert!(!execute_http_request(&json!({ "method": "GET", "url": "" })));
    }

    /// An unreachable host is a transport error: the node fails, records the
    /// reason in the output variable, and marks the status "000" — the same
    /// shape the old curl path produced on failure.
    ///
    /// The assertion checks the *shape* of the message, not the OS wording:
    /// the underlying text differs between Windows and Linux.
    #[test]
    fn http_request_transport_failure_is_reported() {
        crate::application::replay_helpers::reset_execution_state();
        let ok = execute_http_request(&json!({
            "method": "GET",
            "url": "http://127.0.0.1:1/nada",
            "output_var": "res"
        }));
        assert!(!ok);

        let stored = crate::application::replay_helpers::get_var("res").unwrap_or_default();
        assert!(
            stored.starts_with("ERROR:"),
            "esperaba un error almacenado, llegó {:?}",
            stored
        );
        // The message must name the host so the user knows what failed.
        assert!(
            stored.contains("127.0.0.1:1"),
            "el error debería nombrar el host, llegó {:?}",
            stored
        );
        assert_eq!(
            crate::application::replay_helpers::get_var("res_status").unwrap_or_default(),
            "000"
        );
    }
}
