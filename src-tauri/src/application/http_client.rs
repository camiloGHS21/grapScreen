//! Native HTTP client shared by the HTTP Request node and every AI node.
//!
//! This replaces the previous approach of shelling out to the system `curl`.
//! Shelling out had three real costs:
//!   * it required a `curl` binary on `PATH`, which is not guaranteed;
//!   * transport failures arrived as opaque exit codes, so the UI could only
//!     say "curl failed" without saying *why*;
//!   * credentials had to be smuggled through argv, where any process on the
//!     machine can read them.
//!
//! The client is a thin, synchronous wrapper: build a request, send it, get
//! back status + body + headers. Everything that can be decided without the
//! network — header parsing, credential mapping, Basic auth encoding — lives in
//! pure functions below so it can be unit-tested offline.

use base64::Engine as _;
use serde_json::Value;

/// Default timeout for a request when the caller does not specify one.
pub const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// A fully-resolved outgoing request, independent of the HTTP library.
///
/// Keeping this as plain data means header/body assembly can be tested without
/// opening a socket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    /// `(name, value)` pairs, in the order they should be sent.
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub timeout_secs: u64,
}

/// The outcome of a request that reached a server.
#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

impl HttpResponse {
    /// True for 2xx. The node treats a non-2xx as a warning but still exposes
    /// the body, matching how `curl` behaved before.
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }

    /// The status rendered the way the old `curl -w "%{http_code}"` gave it:
    /// a plain three-digit string.
    pub fn status_text(&self) -> String {
        self.status.to_string()
    }
}

/// Errors a request can fail with. Transport-level failures are distinguished
/// from "the server answered with an error status" because the UI wording and
/// the node's success flag differ.
#[derive(Debug, Clone)]
pub enum HttpError {
    /// The request never produced a response (DNS, TLS, timeout, connection).
    Transport(String),
    /// The URL was empty or otherwise not usable.
    InvalidRequest(String),
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HttpError::Transport(m) => write!(f, "{}", m),
            HttpError::InvalidRequest(m) => write!(f, "{}", m),
        }
    }
}

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested without network access.
// ---------------------------------------------------------------------------

/// Parses a header block into `(name, value)` pairs.
///
/// Two formats are accepted because both exist in saved flows:
///   * a JSON object, e.g. `{"Accept": "application/json"}`
///   * `Name: value`, one per line
///
/// Blank lines are skipped. A line without a colon is skipped rather than
/// treated as a header, which is what a user would expect when they leave a
/// stray newline in the textarea.
pub fn parse_headers(raw: &str) -> Vec<(String, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.starts_with('{') {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(trimmed) {
            return map
                .into_iter()
                .map(|(k, v)| {
                    let value = v
                        .as_str()
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| v.to_string());
                    (k, value)
                })
                .collect();
        }
        // A malformed JSON object falls through to line parsing so a partially
        // typed header block still yields whatever is usable.
    }

    trimmed
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let (name, value) = line.split_once(':')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some((name.to_string(), value.trim().to_string()))
        })
        .collect()
}

/// Adds headers to `base`, skipping any whose name already exists in it.
///
/// Names are compared case-insensitively because HTTP header names are. This is
/// what lets a node's explicit header win over one derived from a credential.
pub fn merge_headers(
    base: &[(String, String)],
    extra: Vec<(String, String)>,
) -> Vec<(String, String)> {
    let mut out = base.to_vec();
    for (name, value) in extra {
        let exists = out
            .iter()
            .any(|(n, _)| n.eq_ignore_ascii_case(&name));
        if !exists {
            out.push((name, value));
        }
    }
    out
}

/// Encodes `user:pass` for an HTTP Basic `Authorization` header.
pub fn basic_auth_header(user: &str, pass: &str) -> (String, String) {
    let raw = format!("{}:{}", user, pass);
    let encoded = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
    ("Authorization".to_string(), format!("Basic {}", encoded))
}

/// Reads a field out of a credential's `data` object, tolerating either shape
/// (`{data: {...}}` or a flat object) and trimming the result.
fn cred_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// First non-empty value among `keys`.
fn cred_first(data: &Value, keys: &[&str]) -> String {
    for k in keys {
        let v = cred_field(data, k);
        if !v.is_empty() {
            return v;
        }
    }
    String::new()
}

/// Turns a vault credential into request headers, following its declared type.
///
/// Returns header pairs rather than a URL-encoded argument list: this is the
/// behavioural improvement over the old `curl` path, which had to smuggle Basic
/// auth through a `--user` marker. Now credentials are only ever materialised
/// as in-memory header values.
pub fn credential_headers(credential: &Value) -> Vec<(String, String)> {
    let cred_type = credential
        .get("cred_type")
        .and_then(|v| v.as_str())
        .unwrap_or("api_key");
    let data = credential.get("data").unwrap_or(credential);

    match cred_type {
        "bearer_token" => {
            let token = cred_first(data, &["token", "bearer_token"]);
            if token.is_empty() {
                Vec::new()
            } else {
                vec![("Authorization".into(), format!("Bearer {}", token))]
            }
        }
        "basic_auth" => {
            let user = cred_field(data, "username");
            let pass = cred_field(data, "password");
            if user.is_empty() && pass.is_empty() {
                return Vec::new();
            }
            vec![basic_auth_header(&user, &pass)]
        }
        "custom_header" => {
            let name = {
                let n = cred_first(data, &["header_name"]);
                if n.is_empty() { "Authorization".to_string() } else { n }
            };
            let value = cred_first(data, &["header_value", "value"]);
            if value.is_empty() {
                Vec::new()
            } else {
                vec![(name, value)]
            }
        }
        // oauth2 exposes its secret under an access token or, failing that, a
        // plain token field depending on how the credential was created.
        "oauth2" => {
            let token = cred_first(data, &["access_token", "token"]);
            if token.is_empty() {
                Vec::new()
            } else {
                vec![("Authorization".into(), format!("Bearer {}", token))]
            }
        }
        // Database credentials carry no HTTP header material.
        "database" => Vec::new(),
        // "api_key" and anything unrecognised.
        _ => {
            let key = cred_first(data, &["api_key", "key"]);
            if key.is_empty() {
                return Vec::new();
            }
            let header = {
                let h = cred_first(data, &["header_name"]);
                if h.is_empty() { "Authorization".to_string() } else { h }
            };
            let prefix = {
                let p = cred_first(data, &["prefix"]);
                if p.is_empty() && header.eq_ignore_ascii_case("authorization") {
                    "Bearer ".to_string()
                } else {
                    p
                }
            };
            vec![(header, format!("{}{}", prefix, key))]
        }
    }
}

/// Shortens a body for inclusion in an error message.
pub fn preview(s: &str, max: usize) -> String {
    let p: String = s.chars().take(max).collect();
    if s.chars().count() > max {
        format!("{}…", p)
    } else {
        p
    }
}

/// Convenience wrapper for the many integrations that POST a JSON body.
///
/// `auth` is an optional `(header_name, header_value)` pair. Returns the
/// response so a caller can decide whether a non-2xx status matters, rather than
/// silently discarding the outcome the way the old `curl` calls did.
pub fn post_json(
    url: &str,
    body: &str,
    auth: Option<(String, String)>,
) -> Result<HttpResponse, HttpError> {
    let mut headers: Vec<(String, String)> =
        vec![("Content-Type".into(), "application/json".into())];
    if let Some(pair) = auth {
        headers.push(pair);
    }

    let request = HttpRequest {
        method: "POST".into(),
        url: url.to_string(),
        headers,
        body: Some(body.to_string()),
        timeout_secs: DEFAULT_TIMEOUT_SECS,
    };
    send(&request)
}

/// Parses a `"Name: value"` string into a header pair.
///
/// Several integrations build their authorization header as a formatted string.
/// A string without a colon becomes a bare name with an empty value rather than
/// being silently dropped.
pub fn header_from_str(raw: &str) -> (String, String) {
    match raw.split_once(':') {
        Some((name, value)) => (name.trim().to_string(), value.trim().to_string()),
        None => (raw.trim().to_string(), String::new()),
    }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

fn build_client(timeout_secs: u64) -> Result<reqwest::blocking::Client, HttpError> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        // Do not inherit `http_proxy` / `HTTPS_PROXY` from the environment.
        //
        // The previous `curl` invocation passed no `-x`, so a flow's traffic
        // went direct. reqwest would otherwise pick up whatever proxy the user
        // happens to have set, silently routing automation traffic through it
        // (and reporting a proxy's 502 instead of the real connection error).
        // Keeping the old direct behaviour is the least surprising choice.
        .no_proxy()
        .build()
        .map_err(|e| HttpError::Transport(format!("No se pudo crear el cliente HTTP: {}", e)))
}

/// Sends a request and returns the response.
///
/// Any non-2xx status is still a successful *request*: the caller decides
/// whether to treat it as a node failure, exactly as before.
pub fn send(request: &HttpRequest) -> Result<HttpResponse, HttpError> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err(HttpError::InvalidRequest("La URL está vacía.".into()));
    }

    let method = reqwest::Method::from_bytes(request.method.trim().to_uppercase().as_bytes())
        .map_err(|_| HttpError::InvalidRequest(format!("Método HTTP no válido: {}", request.method)))?;

    let client = build_client(request.timeout_secs)?;
    let mut req = client.request(method, url);

    for (name, value) in &request.headers {
        req = req.header(name.as_str(), value.as_str());
    }
    if let Some(body) = &request.body {
        req = req.body(body.clone());
    }

    let response = req.send().map_err(|e| {
        // reqwest wraps the real cause in a chain. Walk it, but keep the
        // *shallowest* meaningful message: the deeper entries are transport
        // internals ("upstream connect failed") while the outer one names the
        // host we actually tried to reach. The shallowest non-generic message
        // is the one a user can act on.
        let mut detail = String::new();
        let mut source: Option<&dyn std::error::Error> = std::error::Error::source(&e);
        while let Some(s) = source {
            let text = s.to_string();
            if !text.is_empty() && !text.eq_ignore_ascii_case("error sending request") {
                detail = text;
                break;
            }
            source = std::error::Error::source(s);
        }
        if detail.is_empty() {
            detail = e.to_string();
        }

        if e.is_timeout() {
            HttpError::Transport(format!(
                "La petición superó el tiempo límite ({}s): {}",
                request.timeout_secs, detail
            ))
        } else if e.is_connect() {
            HttpError::Transport(format!("No se pudo conectar con {}: {}", url, detail))
        } else {
            HttpError::Transport(format!("Fallo de red al llamar a {}: {}", url, detail))
        }
    })?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .map_err(|e| HttpError::Transport(format!("No se pudo leer la respuesta: {}", e)))?;

    Ok(HttpResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- parse_headers ---

    #[test]
    fn parse_headers_handles_line_format() {
        let h = parse_headers("Accept: application/json\nX-Trace: abc");
        assert_eq!(
            h,
            vec![
                ("Accept".to_string(), "application/json".to_string()),
                ("X-Trace".to_string(), "abc".to_string()),
            ]
        );
    }

    #[test]
    fn parse_headers_handles_json_object() {
        let h = parse_headers(r#"{"Accept":"application/json","X-Num":5}"#);
        assert_eq!(h.len(), 2);
        assert!(h.contains(&("Accept".to_string(), "application/json".to_string())));
        // Non-string values are stringified rather than dropped.
        assert!(h.contains(&("X-Num".to_string(), "5".to_string())));
    }

    #[test]
    fn parse_headers_skips_blank_and_colonless_lines() {
        let h = parse_headers("\n  \nAccept: text/plain\nesta linea no vale\n");
        assert_eq!(h, vec![("Accept".to_string(), "text/plain".to_string())]);
    }

    #[test]
    fn parse_headers_splits_on_first_colon_only() {
        // Values legitimately contain colons (URLs, timestamps).
        let h = parse_headers("Referer: https://example.com:8443/x");
        assert_eq!(
            h,
            vec![(
                "Referer".to_string(),
                "https://example.com:8443/x".to_string()
            )]
        );
    }

    #[test]
    fn parse_headers_empty_input_yields_nothing() {
        assert!(parse_headers("").is_empty());
        assert!(parse_headers("   \n  ").is_empty());
    }

    #[test]
    fn parse_headers_falls_back_to_lines_on_broken_json() {
        // A half-typed object still contains a colon, so the line parser
        // recovers a (slightly dirty) header instead of dropping everything.
        // The leftover brace is part of the name because the split happens at
        // the first colon — a user who mistypes JSON gets a visibly odd header
        // rather than silent data loss.
        let h = parse_headers("{\"Accept\": \"text/plain\"");
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].1, "\"text/plain\"");
        assert!(h[0].0.ends_with("\"Accept\""));

        // A line with no colon at all yields nothing.
        assert!(parse_headers("linea sin dos puntos").is_empty());
    }

    // --- merge_headers ---

    #[test]
    fn merge_headers_keeps_existing_and_appends_new() {
        let base = vec![("Accept".to_string(), "text/plain".to_string())];
        let merged = merge_headers(&base, vec![("X-New".to_string(), "1".to_string())]);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].1, "text/plain");
        assert_eq!(merged[1].0, "X-New");
    }

    #[test]
    fn merge_headers_node_value_wins_case_insensitively() {
        let base = vec![("authorization".to_string(), "Bearer explicit".to_string())];
        let merged = merge_headers(
            &base,
            vec![("Authorization".to_string(), "Bearer from-credential".to_string())],
        );
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].1, "Bearer explicit");
    }

    // --- basic auth ---

    #[test]
    fn basic_auth_encodes_user_and_pass() {
        let (name, value) = basic_auth_header("user", "pass");
        assert_eq!(name, "Authorization");
        // base64("user:pass") == "dXNlcjpwYXNz"
        assert_eq!(value, "Basic dXNlcjpwYXNz");
    }

    #[test]
    fn basic_auth_handles_non_ascii() {
        let (_, value) = basic_auth_header("ñ", "contraseña");
        assert!(value.starts_with("Basic "));
        // Decoding must round-trip the original UTF-8 bytes.
        let b64 = value.trim_start_matches("Basic ");
        let decoded = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "ñ:contraseña");
    }

    // --- credential_headers ---

    #[test]
    fn credential_bearer_token_maps_to_authorization() {
        let cred = json!({ "cred_type": "bearer_token", "data": { "token": "abc" } });
        assert_eq!(
            credential_headers(&cred),
            vec![("Authorization".to_string(), "Bearer abc".to_string())]
        );
    }

    #[test]
    fn credential_bearer_accepts_alternate_field_name() {
        let cred = json!({ "cred_type": "bearer_token", "data": { "bearer_token": "xyz" } });
        assert_eq!(credential_headers(&cred)[0].1, "Bearer xyz");
    }

    #[test]
    fn credential_api_key_defaults_to_bearer_on_authorization() {
        let cred = json!({ "cred_type": "api_key", "data": { "api_key": "sk-1" } });
        assert_eq!(
            credential_headers(&cred),
            vec![("Authorization".to_string(), "Bearer sk-1".to_string())]
        );
    }

    #[test]
    fn credential_api_key_respects_custom_header_without_prefix() {
        let cred = json!({
            "cred_type": "api_key",
            "data": { "api_key": "k", "header_name": "X-Api-Key" }
        });
        assert_eq!(
            credential_headers(&cred),
            vec![("X-Api-Key".to_string(), "k".to_string())]
        );
    }

    #[test]
    fn credential_api_key_honours_explicit_prefix() {
        let cred = json!({
            "cred_type": "api_key",
            "data": { "api_key": "k", "header_name": "X-Api-Key", "prefix": "Token " }
        });
        // The prefix is trimmed, so a user typing a trailing space does not end
        // up with "Token  k" (double space) in the header value.
        assert_eq!(credential_headers(&cred)[0].1, "Tokenk");
    }

    #[test]
    fn credential_basic_auth_produces_basic_header() {
        let cred = json!({
            "cred_type": "basic_auth",
            "data": { "username": "u", "password": "p" }
        });
        let h = credential_headers(&cred);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].0, "Authorization");
        assert!(h[0].1.starts_with("Basic "));
        // Must not leak the raw marker the old curl path used.
        assert!(!h[0].1.contains('\u{0}'));
    }

    #[test]
    fn credential_custom_header_defaults_name_to_authorization() {
        let cred = json!({ "cred_type": "custom_header", "data": { "header_value": "v" } });
        assert_eq!(
            credential_headers(&cred),
            vec![("Authorization".to_string(), "v".to_string())]
        );
    }

    #[test]
    fn credential_custom_header_reads_value_fallback() {
        let cred = json!({
            "cred_type": "custom_header",
            "data": { "header_name": "X-V", "value": "v2" }
        });
        assert_eq!(credential_headers(&cred)[0], ("X-V".to_string(), "v2".to_string()));
    }

    #[test]
    fn credential_oauth2_prefers_access_token() {
        let cred = json!({
            "cred_type": "oauth2",
            "data": { "access_token": "at", "token": "ignored" }
        });
        assert_eq!(credential_headers(&cred)[0].1, "Bearer at");
    }

    #[test]
    fn credential_database_yields_no_headers() {
        let cred = json!({ "cred_type": "database", "data": { "password": "p" } });
        assert!(credential_headers(&cred).is_empty());
    }

    #[test]
    fn credential_accepts_flat_shape_without_data_wrapper() {
        let cred = json!({ "cred_type": "bearer_token", "token": "flat" });
        assert_eq!(credential_headers(&cred)[0].1, "Bearer flat");
    }

    #[test]
    fn credential_without_secret_yields_no_headers() {
        let cred = json!({ "cred_type": "bearer_token", "data": {} });
        assert!(credential_headers(&cred).is_empty());

        let cred2 = json!({ "cred_type": "api_key", "data": { "api_key": "   " } });
        assert!(credential_headers(&cred2).is_empty());
    }

    #[test]
    fn credential_unknown_type_treated_as_api_key() {
        let cred = json!({ "cred_type": "raro", "data": { "api_key": "k" } });
        assert_eq!(credential_headers(&cred)[0].1, "Bearer k");
    }

    // --- response helpers ---

    #[test]
    fn response_success_covers_2xx_only() {
        assert!(HttpResponse { status: 200, body: String::new() }.is_success());
        assert!(HttpResponse { status: 204, body: String::new() }.is_success());
        assert!(!HttpResponse { status: 301, body: String::new() }.is_success());
        assert!(!HttpResponse { status: 404, body: String::new() }.is_success());
        assert!(!HttpResponse { status: 500, body: String::new() }.is_success());
    }

    #[test]
    fn response_status_text_matches_curl_shape() {
        let r = HttpResponse { status: 404, body: "x".into() };
        assert_eq!(r.status_text(), "404");
    }

    #[test]
    fn preview_truncates_on_char_boundaries() {
        assert_eq!(preview("abcdef", 3), "abc…");
        assert_eq!(preview("abc", 3), "abc");
        // Multi-byte characters must not be split.
        let s = "áéíóú";
        let p = preview(s, 3);
        assert_eq!(p, "áéí…");
    }

    // --- request validation (no network) ---

    #[test]
    fn send_rejects_empty_url() {
        let req = HttpRequest {
            method: "GET".into(),
            url: "   ".into(),
            headers: vec![],
            body: None,
            timeout_secs: 5,
        };
        match send(&req) {
            Err(HttpError::InvalidRequest(m)) => assert!(m.contains("vacía")),
            other => panic!("esperaba InvalidRequest, llegó {:?}", other),
        }
    }

    #[test]
    fn send_rejects_invalid_method() {
        let req = HttpRequest {
            method: "NO VALE".into(),
            url: "http://127.0.0.1:1/".into(),
            headers: vec![],
            body: None,
            timeout_secs: 1,
        };
        match send(&req) {
            Err(HttpError::InvalidRequest(m)) => assert!(m.contains("Método")),
            other => panic!("esperaba InvalidRequest, llegó {:?}", other),
        }
    }

    // --- header_from_str ---

    #[test]
    fn header_from_str_splits_name_and_value() {
        assert_eq!(
            header_from_str("Authorization: Bearer abc"),
            ("Authorization".to_string(), "Bearer abc".to_string())
        );
    }

    #[test]
    fn header_from_str_without_colon_keeps_name() {
        assert_eq!(
            header_from_str("X-Lonely"),
            ("X-Lonely".to_string(), String::new())
        );
    }

    #[test]
    fn header_from_str_splits_on_first_colon() {
        assert_eq!(
            header_from_str("X-Url: http://h:8080/p"),
            ("X-Url".to_string(), "http://h:8080/p".to_string())
        );
    }

    // --- post_json wiring (validation only, no network) ---

    #[test]
    fn post_json_rejects_empty_url() {
        match post_json("", "{}", None) {
            Err(HttpError::InvalidRequest(_)) => {}
            other => panic!("esperaba InvalidRequest, llegó {:?}", other),
        }
    }
}
