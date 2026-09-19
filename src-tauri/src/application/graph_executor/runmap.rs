//! Execution map for the n8n catalogue.
//!
//! Every app node in n8n builds its HTTP request in code. Rather than
//! reimplementing 297 integrations in Rust, the requests are *captured* from the
//! node's own `execute()` by `scripts/n8n-runmap-capture.mjs` and shipped as
//! data in `src/data/n8n-runmap.json`: for each `resource`/`operation` pair, the
//! method, path, query, headers and body the real node code produces, with every
//! value that came from a node parameter rewritten as `{{$parameter.name}}`.
//!
//! This module evaluates that data. It resolves the placeholders from the node's
//! `n8n_config`, applies the credential's authentication, sends the request with
//! the app's own HTTP client and maps the response onto the item list — all in
//! Rust, so one binary serves Windows, Linux and macOS and no JavaScript runtime
//! has to ship with the app.
//!
//! A node with no captured case is *not* executable, and the runner says so
//! instead of issuing a request against an API root (which is how the old
//! generic path turned a missing mapping into a confusing 404).

use crate::application::http_client::{self, HttpRequest};
use crate::application::replay_helpers;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const EMBEDDED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/data/n8n-runmap.json"
));

const DEFAULT_TIMEOUT_SECS: u64 = 60;

/// One HTTP call the captured node made.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct CapturedRequest {
    /// Which n8n helper produced it (`requestWithAuthentication`, …).
    pub kind: String,
    pub method: String,
    /// Absolute URL, or the path part when the node used a base URL.
    pub path: String,
    pub qs: Option<Map<String, Value>>,
    pub headers: Option<Map<String, Value>>,
    pub body: Option<Value>,
    pub json: Option<Value>,
    #[serde(rename = "credentialType")]
    pub credential_type: Option<String>,
}

impl CapturedRequest {
    /// The payload to send, preferring n8n's `json` option over a raw body.
    pub fn payload(&self) -> Option<&Value> {
        match (&self.json, &self.body) {
            (Some(json), _) if json.is_object() || json.is_array() => Some(json),
            (_, Some(body)) => Some(body),
            _ => None,
        }
    }
}

/// One `resource`/`operation` pair of a node.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RunCase {
    pub resource: Option<String>,
    pub operation: String,
    pub status: String,
    pub needs: Vec<String>,
    pub requests: Vec<CapturedRequest>,
    pub error: Option<String>,
}

impl RunCase {
    /// The request to send: the last one captured.
    ///
    /// Nodes often look something up first (`GET /data_sources/{id}`) and then
    /// mutate (`POST /pages`). The mutation is the one whose result n8n returns,
    /// and its placeholders come from parameters — the lookups only shape it
    /// when their response is used, which shows up as a `partial` case.
    pub fn sendable(&self) -> Option<&CapturedRequest> {
        self.requests.last()
    }
}

/// Every captured case of one catalogue node.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RunNode {
    pub status: String,
    pub cases: Vec<RunCase>,
}

impl RunNode {
    /// How many of the node's operations got a usable request.
    pub fn usable_cases(&self) -> usize {
        self.cases.iter().filter(|c| c.sendable().is_some()).count()
    }

    /// True when every declared operation was captured.
    pub fn is_complete(&self) -> bool {
        !self.cases.is_empty() && self.usable_cases() == self.cases.len()
    }

    /// The case for a resource/operation pair.
    pub fn case_for(&self, resource: Option<&str>, operation: &str) -> Option<&RunCase> {
        self.cases
            .iter()
            .find(|c| {
                c.operation == operation
                    && match (c.resource.as_deref(), resource) {
                        (_, None) => true,
                        (Some(a), Some(b)) => a == b,
                        // A resource-less case belongs to the node's only flow.
                        (None, Some(_)) => true,
                    }
            })
            .or_else(|| self.cases.iter().find(|c| c.operation == operation))
    }
}

/// The whole artifact, indexed by catalogue key.
pub struct RunMap {
    by_key: HashMap<String, RunNode>,
}

impl RunMap {
    fn from_json(raw: &str) -> Result<Self, String> {
        #[derive(Deserialize)]
        struct Artifact {
            #[serde(default)]
            nodes: HashMap<String, RunNode>,
        }
        let parsed: Artifact =
            serde_json::from_str(raw).map_err(|e| format!("mapa de ejecución ilegible: {}", e))?;
        Ok(Self {
            by_key: parsed.nodes,
        })
    }

    /// Process-wide map, parsed on first use.
    pub fn global() -> &'static RunMap {
        static MAP: OnceLock<RunMap> = OnceLock::new();
        MAP.get_or_init(|| {
            RunMap::from_json(EMBEDDED)
                .unwrap_or_else(|e| panic!("mapa de ejecución n8n corrupto: {}", e))
        })
    }

    pub fn get(&self, key: &str) -> Option<&RunNode> {
        self.by_key.get(key)
    }

    /// Whether the engine can execute this node at all, as it stands.
    pub fn is_executable(&self, key: &str) -> bool {
        self.by_key.get(key).is_some_and(|n| n.usable_cases() > 0)
    }

    /// Catalogue keys with at least one captured operation.
    pub fn executable_keys(&self) -> Vec<&str> {
        let mut keys: Vec<&str> = self
            .by_key
            .iter()
            .filter(|(_, n)| n.usable_cases() > 0)
            .map(|(k, _)| k.as_str())
            .collect();
        keys.sort_unstable();
        keys
    }

    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_key.is_empty()
    }
}

/// The prefixes the capture script writes for a value it could not know.
const P: &str = "{{$parameter.";
const C: &str = "{{$credentials.";

/// Renders one parameter value into text, the way n8n puts it into a URL.
fn render_scalar(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Looks a parameter up by name, then by dotted path (`a.b`).
fn param_at<'a>(params: &'a Map<String, Value>, name: &str) -> Option<&'a Value> {
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
fn credential_object(credential: Option<&Value>) -> Option<&Map<String, Value>> {
    let credential = credential?;
    match credential.get("data") {
        // Imported credentials are stored wrapped; the bare form is accepted so
        // a hand-written vault entry works the same way.
        Some(data) if data.is_object() => data.as_object(),
        _ => credential.as_object(),
    }
}

/// Looks a placeholder name up in the source it names.
fn lookup<'a>(
    kind: &str,
    name: &str,
    params: &'a Map<String, Value>,
    credential: Option<&'a Value>,
) -> Option<Value> {
    if kind == "cred" {
        let map = credential_object(credential)?;
        return map
            .get(name)
            .or_else(|| {
                map.iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case(name))
                    .map(|(_, v)| v)
            })
            .cloned();
    }
    param_at(params, name).cloned()
}

/// What a `{{ … }}` placeholder at the front of `rest` refers to.
///
/// Returns the source kind, the name and how many bytes the placeholder spans.
fn placeholder_at(rest: &str) -> Option<(&'static str, String, usize)> {
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
///
/// Such a value keeps its JSON type: a number stays a number in the body
/// instead of becoming the string `"3"`.
fn whole_placeholder(template: &str) -> Option<(&'static str, String)> {
    let trimmed = template.trim();
    let (kind, name, span) = placeholder_at(trimmed)?;
    if span != trimmed.len() || name.contains("{{") {
        return None;
    }
    Some((kind, name))
}

/// Replaces every parameter/credential placeholder with its value, leaving
/// other text — including engine expressions — alone.
fn substitute_params(
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
                // A source the node never received contributes nothing, which is
                // what n8n does too — it does not send the literal placeholder.
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

/// Resolves a captured value, keeping JSON types and evaluating engine
/// expressions (`{{ $json.x }}`) in the text that remains.
fn resolve_json(
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

/// Renders the captured path, percent-encoding the placeholder values inside it.
///
/// A value that is itself a URL is left alone: n8n lets a node point at a
/// different host, and encoding that would produce a broken request.
fn render_path(
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
                    out.push_str(&super::declarative::runner::encode_component(&raw));
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

/// A request the map produced, ready to be handed to the HTTP client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedRequest {
    pub key: String,
    pub resource: Option<String>,
    pub operation: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

/// The node's own n8n parameters, as an object.
fn config_object(data: &Value) -> Map<String, Value> {
    data.get("n8n_config")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

/// Names the operations a node *can* run, for the error message of one it cannot.
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

/// Builds the request a captured case describes for this node's configuration.
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
    // Placeholders can name the credential as well as a parameter; the vault
    // scope is installed by the engine before the node runs.
    let credential = replay_helpers::get_current_credential();
    let operation = params
        .get("operation")
        .map(render_scalar)
        .unwrap_or_default()
        .trim()
        .to_string();
    let resource = params.get("resource").map(render_scalar);

    let case = if operation.is_empty() {
        // A node without an `operation` parameter has a single flow, which the
        // capture stores under an empty operation.
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

    let request = case.sendable().ok_or_else(|| {
        format!(
            "La operación '{}{}' de '{}' no se pudo capturar ({}).",
            case.resource.as_deref().unwrap_or(""),
            case.operation,
            key,
            case.error.as_deref().unwrap_or("sin petición registrada")
        )
    })?;

    let raw_path = render_path(&request.path, &params, credential.as_ref());
    let url = if raw_path.starts_with("http://") || raw_path.starts_with("https://") {
        raw_path
    } else {
        let base = data
            .get("n8n_base_url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .trim_end_matches('/')
            .to_string();
        if base.is_empty() {
            return Err(format!(
                "La operación '{}' de '{}' necesita una URL base y el nodo no la tiene.",
                case.operation, key
            ));
        }
        format!("{}/{}", base, raw_path.trim_start_matches('/'))
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
    // The user's own overrides win, exactly as they do in the generic path.
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
    if let Some(raw) = data.get("n8n_body").and_then(|v| v.as_str()) {
        if !raw.trim().is_empty() {
            let resolved = replay_helpers::interpolate_variables(raw);
            return Ok(PlannedRequest {
                key,
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
        key,
        resource: case.resource.clone(),
        operation: case.operation.clone(),
        method: request.method.trim().to_uppercase(),
        url: super::declarative::runner::with_query(&url, &query),
        headers,
        body,
    })
}

/// Whether the node was told to treat a non-2xx answer as data.
fn ignores_http_errors(data: &Value) -> bool {
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

    // Authentication comes from the credential the vault is scoped to, through
    // the same helper the generic path uses: the captured request only carries
    // the headers the node code itself set (`Notion-Version`, for instance).
    let credential = replay_helpers::get_current_credential();
    let auth = match super::declarative::registry().get(&key).and_then(|d| d.credential.as_ref()) {
        Some(spec) => super::declarative::auth::apply(spec, credential.as_ref()),
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
        // Planned per item: a parameter may be an expression over the current
        // item (`{{ $json.id }}`), exactly like n8n resolves parameters per item.
        let planned = plan(data)?;

        let mut headers = planned.headers.clone();
        for (name, value) in &auth.headers {
            if !headers.iter().any(|(n, _)| n.eq_ignore_ascii_case(name)) {
                headers.push((name.clone(), value.clone()));
            }
        }
        let url = super::declarative::runner::with_query(&planned.url, &auth.query);
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

        let parsed = super::declarative::runner::response_items(&response.body);
        if parsed.is_empty() {
            out.push(super::declarative::runner::item_with_result(
                item.as_ref(),
                Map::new(),
            ));
            continue;
        }
        out.extend(parsed.into_iter().map(|value| match value {
            Value::Object(map) => super::declarative::runner::item_with_result(item.as_ref(), map),
            other => {
                let mut map = Map::new();
                map.insert("value".to_string(), other);
                super::declarative::runner::item_with_result(item.as_ref(), map)
            }
        }));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn params(pairs: &[(&str, Value)]) -> Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn the_artifact_parses_and_covers_a_large_part_of_the_catalogue() {
        let map = RunMap::global();
        assert!(map.len() > 400, "nodos en el mapa: {}", map.len());
        assert!(
            map.executable_keys().len() > 100,
            "nodos ejecutables: {}",
            map.executable_keys().len()
        );
    }

    #[test]
    fn a_captured_case_carries_the_headers_the_node_code_sets() {
        // `Notion-Version` only exists inside the node's own code, so its
        // presence proves the request was captured and not guessed.
        let notion = RunMap::global()
            .get("Notion")
            .expect("la captura debe incluir Notion");
        let case = notion
            .cases
            .iter()
            .find(|c| c.operation == "get")
            .expect("Notion debe tener la operación 'get'");
        let request = case.sendable().expect("con petición capturada");
        let headers = request.headers.as_ref().expect("con cabeceras");
        assert!(headers.keys().any(|k| k == "Notion-Version"));
    }

    #[test]
    fn a_whole_placeholder_keeps_the_json_type_of_the_parameter() {
        let params = params(&[("limit", json!(3))]);
        let resolved = resolve_json(&json!({ "page_size": "{{$parameter.limit}}" }), &params, None);
        assert_eq!(resolved["page_size"], json!(3));
    }

    #[test]
    fn an_inline_placeholder_is_rendered_inside_the_text() {
        let params = params(&[("name", json!("ana"))]);
        let resolved = resolve_json(&json!("hola {{$parameter.name}}!"), &params, None);
        assert_eq!(resolved, json!("hola ana!"));
    }

    #[test]
    fn a_credential_placeholder_resolves_from_the_vault_scope() {
        let params = Map::new();
        let credential = json!({ "data": { "accessToken": "sec-ret" } });
        let resolved = resolve_json(
            &json!("https://api.test/bot{{$credentials.accessToken}}/getChat"),
            &params,
            Some(&credential),
        );
        assert_eq!(resolved, json!("https://api.test/botsec-ret/getChat"));
    }

    #[test]
    fn a_missing_credential_contributes_nothing_instead_of_the_placeholder() {
        let resolved = resolve_json(&json!("{{$credentials.token}}"), &Map::new(), None);
        assert_eq!(resolved, json!(""));
    }

    #[test]
    fn an_engine_expression_is_left_for_the_interpolator() {
        // `{{ $json.x }}` is the engine's own syntax, not a capture placeholder:
        // this module must leave it for the expression evaluator.
        assert_eq!(
            substitute_params("id: {{ $json.id }}", &Map::new(), None),
            "id: {{ $json.id }}"
        );
    }

    #[test]
    fn a_parameter_in_a_path_is_percent_encoded() {
        let params = params(&[("id", json!("a b/c"))]);
        assert_eq!(
            render_path("https://api.test/v1/{{$parameter.id}}", &params, None),
            "https://api.test/v1/a%20b%2Fc"
        );
    }

    #[test]
    fn a_parameter_that_is_a_url_is_not_encoded() {
        let params = params(&[("target", json!("https://other.test/x?y=1"))]);
        assert_eq!(
            render_path("{{$parameter.target}}", &params, None),
            "https://other.test/x?y=1"
        );
    }

    #[test]
    fn a_missing_parameter_contributes_nothing_instead_of_the_placeholder() {
        let resolved = resolve_json(&json!("{{$parameter.nope}}"), &Map::new(), None);
        assert_eq!(resolved, json!(null));
        assert_eq!(
            substitute_params("x{{$parameter.nope}}y", &Map::new(), None),
            "xy"
        );
    }

    #[test]
    fn a_node_without_a_map_says_so_and_names_itself() {
        let error = plan(&json!({ "n8n_key": "DefinitelyNotCaptured" })).unwrap_err();
        assert!(error.contains("DefinitelyNotCaptured"), "mensaje: {}", error);
    }

    #[test]
    fn an_operation_that_was_not_captured_lists_the_ones_that_were() {
        let key = RunMap::global()
            .executable_keys()
            .into_iter()
            .find(|k| {
                RunMap::global()
                    .get(k)
                    .is_some_and(|n| n.cases.iter().any(|c| !c.operation.is_empty()))
            })
            .expect("algún nodo con operaciones capturadas");
        let error = plan(&json!({
            "n8n_key": key,
            "n8n_config": { "operation": "___no_existe___" }
        }))
        .unwrap_err();
        assert!(error.contains("no está soportada"), "mensaje: {}", error);
        assert!(error.contains(key), "el error debe nombrar el nodo: {}", error);
    }

    #[test]
    fn a_captured_case_plans_a_request_with_the_parameter_in_the_path() {
        let planned = plan(&json!({
            "n8n_key": "Notion",
            "n8n_config": {
                "resource": "dataSource",
                "operation": "get",
                "dataSourceId": "11111111-2222-3333-4444-555555555555"
            }
        }))
        .expect("Notion dataSource/get debe planificarse");
        assert_eq!(planned.method, "GET");
        assert_eq!(
            planned.url,
            "https://api.notion.com/v1/data_sources/11111111-2222-3333-4444-555555555555"
        );
        assert!(planned
            .headers
            .iter()
            .any(|(name, _)| name == "Notion-Version"));
        assert!(planned.body.is_none(), "una lectura no lleva cuerpo");
    }
}
