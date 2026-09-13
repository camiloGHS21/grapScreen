//! AI node runners: LLM Chain and Classifier.
//!
//! These talk to any OpenAI-compatible `/chat/completions` endpoint, which is
//! what virtually every provider (OpenAI, Azure, Groq, OpenRouter, Ollama,
//! LM Studio, Together…) exposes. That keeps the implementation honest: no
//! vendor SDK, no hidden service — just an HTTP call the user can point
//! anywhere, and a clear error when no key/base URL is configured.
//!
//! Configuration lives in the node's `data` (see the frontend form):
//!   base_url, api_key, model, system_prompt, prompt, temperature,
//!   max_tokens, result_field, categories, output_var.

use crate::application::replay_helpers;
use serde_json::Value;

/// Sensible default so a bare node still does something useful locally.
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-4o-mini";
const DEFAULT_TIMEOUT_SECS: &str = "90";

/// One request/response round-trip against a chat-completions endpoint.
struct ChatRequest<'a> {
    base_url: &'a str,
    api_key: &'a str,
    model: &'a str,
    system_prompt: &'a str,
    user_prompt: &'a str,
    temperature: f64,
    max_tokens: u64,
}

/// Calls the endpoint and returns the assistant message text.
///
/// Uses the app's native HTTP client. This previously shelled out to `curl`,
/// which meant a missing binary broke every AI node and transport errors
/// surfaced as an opaque exit code. The native client reports *why* a request
/// failed and keeps the API key out of the process argument list.
fn call_chat(req: &ChatRequest) -> Result<String, String> {
    let url = format!("{}/chat/completions", req.base_url.trim_end_matches('/'));

    let mut messages: Vec<Value> = Vec::new();
    if !req.system_prompt.trim().is_empty() {
        messages.push(serde_json::json!({ "role": "system", "content": req.system_prompt }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": req.user_prompt }));

    let body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
    })
    .to_string();

    let mut headers: Vec<(String, String)> =
        vec![("Content-Type".into(), "application/json".into())];
    if !req.api_key.trim().is_empty() {
        headers.push((
            "Authorization".into(),
            format!("Bearer {}", req.api_key.trim()),
        ));
    }

    let request = crate::application::http_client::HttpRequest {
        method: "POST".into(),
        url,
        headers,
        body: Some(body),
        timeout_secs: DEFAULT_TIMEOUT_SECS
            .parse()
            .unwrap_or(crate::application::http_client::DEFAULT_TIMEOUT_SECS),
    };

    let response = crate::application::http_client::send(&request)
        .map_err(|e| format!("{}", e))?;

    let trimmed = response.body.trim();

    if trimmed.is_empty() {
        return Err(format!(
            "El proveedor no devolvió respuesta (estado {}).",
            response.status
        ));
    }

    let parsed: Value = serde_json::from_str(trimmed)
        .map_err(|_| format!("Respuesta no válida del proveedor: {}", preview(trimmed)))?;

    // Surface API-level errors instead of silently returning an empty string.
    if let Some(err) = parsed.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or_else(|| err.as_str().unwrap_or("error desconocido"));
        return Err(format!("El proveedor devolvió un error: {}", msg));
    }

    extract_content(&parsed).ok_or_else(|| {
        format!(
            "Respuesta sin contenido reconocible. Revisa modelo y proveedor: {}",
            preview(trimmed)
        )
    })
}

/// Pulls the assistant text out of a chat-completions response, tolerating the
/// small shape differences between providers.
fn extract_content(parsed: &Value) -> Option<String> {
    // OpenAI / Groq / OpenRouter / Ollama (OpenAI mode)
    if let Some(content) = parsed
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
    {
        if let Some(s) = content.as_str() {
            return Some(s.to_string());
        }
        // Some providers return content as an array of parts.
        if let Some(arr) = content.as_array() {
            let joined: String = arr
                .iter()
                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !joined.is_empty() {
                return Some(joined);
            }
        }
    }
    // Anthropic-style top-level content array.
    if let Some(arr) = parsed.get("content").and_then(|c| c.as_array()) {
        let joined: String = arr
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return Some(joined);
        }
    }
    None
}

fn preview(s: &str) -> String {
    let p: String = s.chars().take(300).collect();
    if s.chars().count() > 300 {
        format!("{}…", p)
    } else {
        p
    }
}

/// Reads a config string and interpolates expressions into it.
fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

/// Shared setup: resolves connection settings and validates them.
///
/// The API key may come from three places, in priority order:
///   1. the node's own `api_key` field (explicit wins),
///   2. the vault credential attached to the node,
///   3. nothing — allowed only for local servers.
fn prepare(data: &Value) -> Result<(String, String, String, String, f64, u64), String> {
    let base_url = cfg(data, "base_url");
    let base_url = if base_url.trim().is_empty() {
        DEFAULT_BASE_URL.to_string()
    } else {
        base_url
    };
    let mut api_key = cfg(data, "api_key");
    if api_key.trim().is_empty() {
        api_key = credential_api_key();
    }
    let model = {
        let m = cfg(data, "model");
        if m.trim().is_empty() {
            DEFAULT_MODEL.to_string()
        } else {
            m
        }
    };
    let system_prompt = cfg(data, "system_prompt");
    let temperature = data
        .get("temperature")
        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0.7);
    let max_tokens = data
        .get("max_tokens")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(1024);

    // A local server (Ollama/LM Studio) legitimately needs no key; only warn
    // when we're pointing at a hosted provider without one.
    let is_local = base_url.contains("localhost") || base_url.contains("127.0.0.1");
    if api_key.trim().is_empty() && !is_local {
        return Err(
            "Falta la API key del modelo. Configúrala en el nodo, adjunta una credencial de la bóveda, o usa una URL local (Ollama/LM Studio) si no necesitas clave."
                .into(),
        );
    }

    Ok((base_url, api_key, model, system_prompt, temperature, max_tokens))
}

/// Pulls an API key out of the node's attached vault credential, if any.
///
/// Credentials are stored with a `cred_type` and a `data` object; the key field
/// name varies by how the credential was created, so we probe the common ones.
fn credential_api_key() -> String {
    let cred = match replay_helpers::get_current_credential() {
        Some(c) => c,
        None => return String::new(),
    };
    let data = cred.get("data").unwrap_or(&cred);
    for key in ["api_key", "key", "token", "access_token", "bearer_token", "password"] {
        if let Some(v) = data.get(key).and_then(|v| v.as_str()) {
            let v = v.trim();
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }
    // Some credentials store the secret at the top level.
    if let Some(v) = cred.get("api_key").and_then(|v| v.as_str()) {
        let v = v.trim();
        if !v.is_empty() {
            return v.to_string();
        }
    }
    String::new()
}

// ───────────────────────────── LLM Chain ──────────────────────────────

/// `llm_chain` — sends a prompt to a chat model and stores the reply.
///
/// The prompt is a template, so a chain in the middle of a flow can reference
/// upstream data: `"Resume esto: {{ $json.body }}"`.
pub fn run_llm_chain(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let (base_url, api_key, model, system_prompt, temperature, max_tokens) = prepare(data)?;

    let prompt = cfg(data, "prompt");
    if prompt.trim().is_empty() {
        return Err("El nodo Cadena LLM no tiene prompt configurado".into());
    }

    let result_field = data
        .get("result_field")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("text")
        .to_string();
    let output_var = data
        .get("output_var")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("ai_output")
        .to_string();

    let reply = call_chat(&ChatRequest {
        base_url: &base_url,
        api_key: &api_key,
        model: &model,
        system_prompt: &system_prompt,
        user_prompt: &prompt,
        temperature,
        max_tokens,
    })?;

    replay_helpers::set_var(&output_var, &reply);

    // Attach the reply to each incoming item; with no items (e.g. right after a
    // trigger) emit a single item carrying the answer so the chain continues.
    let mut out: Vec<Value> = Vec::new();
    if items.is_empty() {
        out.push(serde_json::json!({ "json": { result_field.as_str(): reply, "text": reply } }));
    } else {
        for item in items {
            let mut obj = match crate::application::expressions::unwrap_item(&item) {
                Value::Object(m) => m,
                other => {
                    let mut m = serde_json::Map::new();
                    m.insert("value".to_string(), other);
                    m
                }
            };
            obj.insert(result_field.clone(), Value::String(reply.clone()));
            out.push(serde_json::json!({ "json": Value::Object(obj) }));
        }
    }
    Ok(out)
}

// ───────────────────────────── Classifier ─────────────────────────────

/// `classifier` — asks the model to place text into one of the given categories.
///
/// Uses the model only to pick a label; the mapping to a branch is done in code
/// via `category_field`, so the result is deterministic and cheap to route.
pub fn run_classifier(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let (base_url, api_key, model, system_prompt, temperature, max_tokens) = prepare(data)?;

    let categories: Vec<String> = data
        .get("categories")
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.iter()
                    .filter_map(|c| c.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            } else {
                v.as_str()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            }
        })
        .unwrap_or_default();

    if categories.is_empty() {
        return Err("El Clasificador necesita al menos una categoría".into());
    }

    let input = cfg(data, "prompt");
    if input.trim().is_empty() {
        return Err("El Clasificador necesita un texto de entrada (usa {{ $json.campo }})".into());
    }

    let category_field = data
        .get("category_field")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("category")
        .to_string();
    let output_var = data
        .get("output_var")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("classification")
        .to_string();

    let list = categories.join(", ");
    let system = if system_prompt.trim().is_empty() {
        format!(
            "Eres un clasificador. Responde únicamente con una de estas categorías exactas: {}. No añadas nada más.",
            list
        )
    } else {
        format!("{}\n\nResponde únicamente con una de estas categorías exactas: {}.", system_prompt, list)
    };

    let reply = call_chat(&ChatRequest {
        base_url: &base_url,
        api_key: &api_key,
        model: &model,
        system_prompt: &system,
        user_prompt: &input,
        // Classification wants determinism, not creativity.
        temperature: 0.0_f64.min(temperature),
        max_tokens,
    })?;

    let category = normalize_category(&reply, &categories);
    replay_helpers::set_var(&output_var, &category);
    replay_helpers::set_var("category", &category);

    let mut out: Vec<Value> = Vec::new();
    if items.is_empty() {
        out.push(serde_json::json!({ "json": { category_field.as_str(): category } }));
    } else {
        for item in items {
            let mut obj = match crate::application::expressions::unwrap_item(&item) {
                Value::Object(m) => m,
                other => {
                    let mut m = serde_json::Map::new();
                    m.insert("value".to_string(), other);
                    m
                }
            };
            obj.insert(category_field.clone(), Value::String(category.clone()));
            out.push(serde_json::json!({ "json": Value::Object(obj) }));
        }
    }
    Ok(out)
}

/// Maps a free-form model reply onto one of the allowed categories.
///
/// Models sometimes wrap the answer in quotes, add punctuation or restate the
/// question, so we match case-insensitively and fall back to the closest
/// containing match before returning the raw reply.
fn normalize_category(reply: &str, categories: &[String]) -> String {
    let cleaned = reply
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '.' || c == '`')
        .trim()
        .to_lowercase();

    for c in categories {
        if c.to_lowercase() == cleaned {
            return c.clone();
        }
    }
    // The model may have written a sentence containing the label.
    for c in categories {
        if cleaned.contains(&c.to_lowercase()) {
            return c.clone();
        }
    }
    // Nothing matched: hand back the trimmed reply so the user can see it.
    reply.trim().to_string()
}

// ─────────────────────── Information Extractor ────────────────────────

/// Pulls a JSON object out of a model reply.
///
/// Models wrap JSON in markdown fences, add a sentence before it, or append a
/// trailing note. Rather than trusting the whole reply to parse, we locate the
/// outermost balanced `{...}` (ignoring braces inside strings) and parse that.
fn extract_json_object(reply: &str) -> Option<Value> {
    let text = reply.trim();

    // Fast path: the reply is already pure JSON.
    if let Ok(v @ Value::Object(_)) = serde_json::from_str::<Value>(text) {
        return Some(v);
    }

    // Strip a fenced block if present, keeping its contents.
    let haystack = if let Some(start) = text.find("```") {
        let after = &text[start + 3..];
        // Skip an optional language tag on the same line.
        let body_start = after.find('\n').map(|i| i + 1).unwrap_or(0);
        let body = &after[body_start..];
        match body.find("```") {
            Some(end) => &body[..end],
            None => body,
        }
    } else {
        text
    };

    let bytes = haystack.as_bytes();
    let start = match haystack.find('{') {
        Some(s) => s,
        None => return None,
    };

    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;

    for i in start..bytes.len() {
        let c = bytes[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if c == b'\\' {
                escaped = true;
            } else if c == b'"' {
                in_string = false;
            }
            continue;
        }
        match c {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    let candidate = &haystack[start..=i];
                    if let Ok(v @ Value::Object(_)) = serde_json::from_str::<Value>(candidate) {
                        return Some(v);
                    }
                    // Malformed at this position: keep scanning a little further
                    // in case the model emitted a preamble brace before the real
                    // object.
                    if let Some(next) = haystack[i + 1..].find('{') {
                        let abs = i + 1 + next;
                        let mut d = 0i32;
                        let mut s = false;
                        let mut esc = false;
                        for j in abs..bytes.len() {
                            let cc = bytes[j];
                            if s {
                                if esc {
                                    esc = false;
                                } else if cc == b'\\' {
                                    esc = true;
                                } else if cc == b'"' {
                                    s = false;
                                }
                                continue;
                            }
                            match cc {
                                b'"' => s = true,
                                b'{' => d += 1,
                                b'}' => {
                                    d -= 1;
                                    if d == 0 {
                                        if let Ok(v @ Value::Object(_)) =
                                            serde_json::from_str::<Value>(&haystack[abs..=j])
                                        {
                                            return Some(v);
                                        }
                                        break;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    return None;
                }
            }
            _ => {}
        }
    }
    None
}

/// `information_extractor` — turns free text into a structured object.
///
/// `schema` is a JSON object whose values are short descriptions of the field to
/// pull out, e.g. `{ "name": "full name", "total": "invoice total as a number" }`.
/// The model is instructed to answer with that exact shape.
///
/// Two output modes:
///   - `merge` (default): the extracted fields are merged into each item, so the
///     original data stays available downstream.
///   - `replace`: the item payload becomes the extracted object only.
///
/// Extracted values land under `output_var` as well, for reference.
pub fn run_information_extractor(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let (base_url, api_key, model, system_prompt, temperature, max_tokens) = prepare(data)?;

    let input = cfg(data, "prompt");
    if input.trim().is_empty() {
        return Err("El nodo Extraer información necesita un texto de entrada (usa {{ $json.campo }})".into());
    }

    let schema_raw = data.get("schema").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if schema_raw.is_empty() {
        return Err(
            "El nodo Extraer información necesita un 'schema': un objeto JSON que describa los campos a extraer.".into(),
        );
    }
    let schema: Value = serde_json::from_str(&schema_raw)
        .map_err(|e| format!("El 'schema' no es JSON válido: {}. Ejemplo: {{\"nombre\": \"nombre completo\"}}", e))?;
    if !schema.is_object() {
        return Err("El 'schema' debe ser un objeto JSON, por ejemplo {\"nombre\": \"nombre completo\"}.".into());
    }

    let mode = data
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("merge")
        .to_lowercase();
    let output_var = data
        .get("output_var")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("extracted")
        .to_string();

    let field_list = schema
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(k, v)| format!("- \"{}\": {}", k, v.as_str().unwrap_or("")))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let system = {
        let base = if system_prompt.trim().is_empty() {
            "Eres un extractor de datos. Devuelves exclusivamente JSON válido, sin explicaciones.".to_string()
        } else {
            system_prompt
        };
        format!(
            "{}\n\nExtrae los siguientes campos del texto del usuario:\n{}\n\nResponde SÓLO con un objeto JSON con esas claves exactas. Si un dato no está presente, usa null.",
            base, field_list
        )
    };

    let reply = call_chat(&ChatRequest {
        base_url: &base_url,
        api_key: &api_key,
        model: &model,
        system_prompt: &system,
        user_prompt: &input,
        temperature,
        max_tokens,
    })?;

    let extracted = extract_json_object(&reply).ok_or_else(|| {
        format!(
            "El modelo no devolvió un JSON válido. Respuesta: {}",
            preview(&reply)
        )
    })?;

    replay_helpers::set_var(
        &output_var,
        &serde_json::to_string(&extracted).unwrap_or_default(),
    );

    Ok(attach_object(&extracted, items, &mode, &output_var))
}

/// Applies an extracted object to the item list according to `mode`.
fn attach_object(extracted: &Value, items: Vec<Value>, mode: &str, output_var: &str) -> Vec<Value> {
    let extracted_obj = match extracted.as_object() {
        Some(m) => m.clone(),
        None => return items,
    };

    let mut out: Vec<Value> = Vec::new();
    let mut push = |base: serde_json::Map<String, Value>| {
        let mut obj = base;
        obj.insert(output_var.to_string(), Value::Object(extracted_obj.clone()));
        if mode == "replace" {
            // Only the extracted fields (plus the mirror under output_var).
            let mut only = extracted_obj.clone();
            only.insert(output_var.to_string(), Value::Object(extracted_obj.clone()));
            out.push(wrap_object(only));
            return;
        }
        out.push(wrap_object(obj));
    };

    if items.is_empty() {
        push(serde_json::Map::new());
    } else {
        for item in items {
            let base = match crate::application::expressions::unwrap_item(&item) {
                Value::Object(m) => m,
                other => {
                    let mut m = serde_json::Map::new();
                    m.insert("value".to_string(), other);
                    m
                }
            };
            push(base);
        }
    }
    out
}

fn wrap_object(m: serde_json::Map<String, Value>) -> Value {
    serde_json::json!({ "json": Value::Object(m) })
}

// ──────────────────────── Sentiment Analysis ──────────────────────────

/// `sentiment_analysis` — classifies the tone of a piece of text.
///
/// `labels` defaults to `positive,neutral,negative` but can be replaced (e.g.
/// `muy positivo,positivo,neutro,negativo`). The chosen label is written under
/// `label_field` (default `sentiment`), and a numeric `score` is derived so
/// flows can branch on it: the first label scores `1.0`, the last `-1.0`, with
/// the middle ones interpolated — so the default set yields `1 / 0 / -1`.
pub fn run_sentiment_analysis(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let (base_url, api_key, model, system_prompt, temperature, max_tokens) = prepare(data)?;

    let input = cfg(data, "prompt");
    if input.trim().is_empty() {
        return Err("El nodo Análisis de sentimiento necesita un texto de entrada (usa {{ $json.campo }})".into());
    }

    let labels: Vec<String> = data
        .get("labels")
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.iter()
                    .filter_map(|c| c.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            } else {
                v.as_str()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            }
        })
        .filter(|v: &Vec<String>| !v.is_empty())
        .unwrap_or_else(|| {
            vec!["positive".to_string(), "neutral".to_string(), "negative".to_string()]
        });

    let label_field = data
        .get("label_field")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("sentiment")
        .to_string();
    let score_field = data
        .get("score_field")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("sentiment_score")
        .to_string();
    let output_var = data
        .get("output_var")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("sentiment")
        .to_string();

    let list = labels.join(", ");
    let system = {
        let base = if system_prompt.trim().is_empty() {
            "Eres un analista de sentimiento preciso.".to_string()
        } else {
            system_prompt
        };
        format!(
            "{}\n\nClasifica el sentimiento del texto del usuario. Responde únicamente con una de estas etiquetas exactas: {}. No añadas nada más.",
            base, list
        )
    };

    let reply = call_chat(&ChatRequest {
        base_url: &base_url,
        api_key: &api_key,
        model: &model,
        system_prompt: &system,
        user_prompt: &input,
        // Sentiment is a classification: determinism over creativity.
        temperature: 0.0_f64.min(temperature),
        max_tokens,
    })?;

    let label = normalize_category(&reply, &labels);
    let score = sentiment_score(&label, &labels);
    replay_helpers::set_var(&output_var, &label);
    replay_helpers::set_var(&format!("{}_score", output_var), &score.to_string());

    let mut out: Vec<Value> = Vec::new();
    let mut apply = |base: serde_json::Map<String, Value>| {
        let mut obj = base;
        obj.insert(label_field.clone(), Value::String(label.clone()));
        obj.insert(score_field.clone(), crate::application::expressions::num_from_f64(score));
        out.push(wrap_object(obj));
    };

    if items.is_empty() {
        apply(serde_json::Map::new());
    } else {
        for item in items {
            let base = match crate::application::expressions::unwrap_item(&item) {
                Value::Object(m) => m,
                other => {
                    let mut m = serde_json::Map::new();
                    m.insert("value".to_string(), other);
                    m
                }
            };
            apply(base);
        }
    }
    Ok(out)
}

/// Maps a label to a score in `[-1, 1]` by its position in the label list.
///
/// With the default `positive, neutral, negative` this yields `1`, `0`, `-1`.
/// An unknown label scores `0` so downstream comparisons stay meaningful.
fn sentiment_score(label: &str, labels: &[String]) -> f64 {
    if labels.len() < 2 {
        return 0.0;
    }
    let idx = match labels.iter().position(|l| l.eq_ignore_ascii_case(label)) {
        Some(i) => i as f64,
        None => return 0.0,
    };
    // First label -> +1, last -> -1, linear in between.
    1.0 - 2.0 * (idx / (labels.len() as f64 - 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_exact_match() {
        let cats = vec!["Factura".to_string(), "Soporte".to_string()];
        assert_eq!(normalize_category("Factura", &cats), "Factura");
    }

    #[test]
    fn normalize_is_case_insensitive_and_strips_quotes() {
        let cats = vec!["Factura".to_string(), "Soporte".to_string()];
        assert_eq!(normalize_category("\"factura\".", &cats), "Factura");
        assert_eq!(normalize_category("  SOPORTE  ", &cats), "Soporte");
    }

    #[test]
    fn normalize_falls_back_to_containment() {
        let cats = vec!["Factura".to_string(), "Soporte".to_string()];
        assert_eq!(
            normalize_category("La categoría es Soporte.", &cats),
            "Soporte"
        );
    }

    #[test]
    fn normalize_returns_raw_when_unknown() {
        let cats = vec!["Factura".to_string()];
        assert_eq!(normalize_category("no lo sé", &cats), "no lo sé");
    }

    #[test]
    fn extract_content_openai_shape() {
        let parsed = json!({
            "choices": [{ "message": { "content": "hola" } }]
        });
        assert_eq!(extract_content(&parsed).unwrap(), "hola");
    }

    #[test]
    fn extract_content_array_parts() {
        let parsed = json!({
            "choices": [{ "message": { "content": [{ "type": "text", "text": "ho" }, { "type": "text", "text": "la" }] } }]
        });
        assert_eq!(extract_content(&parsed).unwrap(), "hola");
    }

    #[test]
    fn extract_content_top_level_array() {
        let parsed = json!({ "content": [{ "type": "text", "text": "respuesta" }] });
        assert_eq!(extract_content(&parsed).unwrap(), "respuesta");
    }

    #[test]
    fn prepare_rejects_missing_key_for_hosted_provider() {
        let data = json!({ "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini" });
        assert!(prepare(&data).is_err());
    }

    #[test]
    fn prepare_allows_local_without_key() {
        let data = json!({ "base_url": "http://localhost:11434/v1", "model": "llama3" });
        let (base, _key, model, ..) = prepare(&data).unwrap();
        assert_eq!(base, "http://localhost:11434/v1");
        assert_eq!(model, "llama3");
    }

    #[test]
    fn classifier_requires_categories() {
        let data = json!({ "api_key": "x", "prompt": "hola" });
        assert!(run_classifier(&data, vec![]).is_err());
    }

    #[test]
    fn llm_chain_requires_prompt() {
        let data = json!({ "api_key": "x" });
        assert!(run_llm_chain(&data, vec![]).is_err());
    }

    // ────────────────────────── Fase 4 ───────────────────────────

    #[test]
    fn extract_json_pure_object() {
        let v = extract_json_object(r#"{"nombre":"Ana","total":42}"#).unwrap();
        assert_eq!(v["nombre"], "Ana");
        assert_eq!(v["total"], 42);
    }

    #[test]
    fn extract_json_from_fenced_block() {
        let reply = "Aquí tienes:\n```json\n{\"nombre\": \"Ana\"}\n```\nEspero que sirva.";
        assert_eq!(extract_json_object(reply).unwrap()["nombre"], "Ana");
    }

    #[test]
    fn extract_json_ignores_preamble_and_trailing_note() {
        let reply = "Claro, el resultado es {\"total\": 7} según el documento.";
        assert_eq!(extract_json_object(reply).unwrap()["total"], 7);
    }

    #[test]
    fn extract_json_handles_braces_inside_strings() {
        let reply = r#"{"nota":"usa {llaves} aquí","n":1}"#;
        let v = extract_json_object(reply).unwrap();
        assert_eq!(v["nota"], "usa {llaves} aquí");
        assert_eq!(v["n"], 1);
    }

    #[test]
    fn extract_json_handles_nested_objects() {
        let v = extract_json_object(r#"{"a":{"b":{"c":1}},"d":2}"#).unwrap();
        assert_eq!(v["a"]["b"]["c"], 1);
    }

    #[test]
    fn extract_json_returns_none_without_object() {
        assert!(extract_json_object("no hay json aquí").is_none());
    }

    #[test]
    fn extract_json_skips_malformed_preamble_object() {
        // The first brace pair is not valid JSON; the real object follows.
        let reply = "{no válido} y luego {\"ok\": true}";
        assert_eq!(extract_json_object(reply).unwrap()["ok"], true);
    }

    #[test]
    fn sentiment_default_labels_map_to_plus_one_zero_minus_one() {
        let labels: Vec<String> = vec!["positive".into(), "neutral".into(), "negative".into()];
        assert_eq!(sentiment_score("positive", &labels), 1.0);
        assert_eq!(sentiment_score("neutral", &labels), 0.0);
        assert_eq!(sentiment_score("negative", &labels), -1.0);
    }

    #[test]
    fn sentiment_is_case_insensitive() {
        let labels: Vec<String> = vec!["positive".into(), "neutral".into(), "negative".into()];
        assert_eq!(sentiment_score("NEGATIVE", &labels), -1.0);
    }

    #[test]
    fn sentiment_custom_labels_interpolate() {
        let labels: Vec<String> = vec![
            "muy positivo".into(),
            "positivo".into(),
            "neutro".into(),
            "negativo".into(),
        ];
        assert_eq!(sentiment_score("muy positivo", &labels), 1.0);
        assert_eq!(sentiment_score("negativo", &labels), -1.0);
        // 1 - 2 * (1/3)
        let pos = sentiment_score("positivo", &labels);
        assert!((pos - (1.0 - 2.0 / 3.0)).abs() < 1e-9);
    }

    #[test]
    fn sentiment_unknown_label_scores_zero() {
        let labels: Vec<String> = vec!["positive".into(), "neutral".into(), "negative".into()];
        assert_eq!(sentiment_score("no lo sé", &labels), 0.0);
    }

    #[test]
    fn sentiment_single_label_list_cannot_rank() {
        let labels: Vec<String> = vec!["único".into()];
        assert_eq!(sentiment_score("único", &labels), 0.0);
    }

    #[test]
    fn extractor_requires_schema() {
        let data = json!({ "api_key": "x", "prompt": "texto" });
        assert!(run_information_extractor(&data, vec![]).is_err());
    }

    #[test]
    fn extractor_requires_prompt() {
        let data = json!({ "api_key": "x", "schema": "{\"a\":\"b\"}" });
        assert!(run_information_extractor(&data, vec![]).is_err());
    }

    #[test]
    fn extractor_rejects_non_object_schema() {
        let data = json!({ "api_key": "x", "prompt": "t", "schema": "[1,2]" });
        assert!(run_information_extractor(&data, vec![]).is_err());
    }

    #[test]
    fn extractor_rejects_invalid_schema_json() {
        let data = json!({ "api_key": "x", "prompt": "t", "schema": "no soy json" });
        let err = run_information_extractor(&data, vec![]).unwrap_err();
        assert!(err.contains("JSON válido"), "error inesperado: {}", err);
    }

    #[test]
    fn sentiment_requires_prompt() {
        let data = json!({ "api_key": "x" });
        assert!(run_sentiment_analysis(&data, vec![]).is_err());
    }

    #[test]
    fn attach_object_merge_keeps_original_fields() {
        let extracted = json!({ "nombre": "Ana" });
        let items = vec![json!({ "json": { "email": "a@b.c" } })];
        let out = attach_object(&extracted, items, "merge", "extracted");
        assert_eq!(out[0]["json"]["email"], "a@b.c");
        assert_eq!(out[0]["json"]["extracted"]["nombre"], "Ana");
    }

    #[test]
    fn attach_object_replace_drops_original_fields() {
        let extracted = json!({ "nombre": "Ana" });
        let items = vec![json!({ "json": { "email": "a@b.c" } })];
        let out = attach_object(&extracted, items, "replace", "extracted");
        assert!(out[0]["json"].get("email").is_none());
        assert_eq!(out[0]["json"]["nombre"], "Ana");
    }

    #[test]
    fn attach_object_without_items_still_emits_one() {
        let extracted = json!({ "nombre": "Ana" });
        let out = attach_object(&extracted, vec![], "merge", "extracted");
        assert_eq!(out.len(), 1);
        // Even the empty case mirrors the result under output_var.
        assert_eq!(out[0]["json"]["extracted"]["nombre"], "Ana");
    }
}
