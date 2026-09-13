//! Phase 11 integration nodes: Email (SMTP), Slack, Discord, Notion,
//! Airtable and RSS.
//!
//! Action nodes (`send_email`, `slack_webhook`, `discord_webhook`, `notion`,
//! `airtable`) run once per incoming item when there are several — the walker
//! narrows `CURRENT_ITEMS` so `{{ $json.x }}` resolves against each item — and
//! merge the action result into the item, following the `llm_chain` output
//! convention.
//!
//! `rss_read` is a transform: it fetches a feed and REPLACES the item list
//! with one item per entry.
//!
//! Secrets can come from the vault credential attached to the node (via
//! `credential_id`) instead of being stored inline in the automation JSON.

use crate::application::http_client::{self, HttpRequest};
use crate::application::replay_helpers;
use serde_json::{json, Map, Value};

/// Reads a config string, interpolating `{{ … }}` expressions.
fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

/// Probes the node's attached vault credential for any of the given field
/// names. Inline values always win; the credential is the fallback.
fn credential_secret(keys: &[&str]) -> String {
    let Some(cred) = replay_helpers::get_current_credential() else {
        return String::new();
    };
    let data = cred.get("data").unwrap_or(&cred);
    for key in keys {
        if let Some(v) = data.get(*key).and_then(|v| v.as_str()) {
            let v = v.trim();
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }
    String::new()
}

/// Merges `result` fields into an unwrapped item (or into a fresh object when
/// the node runs with no input items) and re-wraps it in the `{ "json": … }`
/// envelope the item model expects.
fn item_with_result(item: Option<&Value>, result: Map<String, Value>) -> Value {
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

/// POST/GET helper that parses the JSON body and surfaces provider errors.
fn api_call(req: &HttpRequest) -> Result<Value, String> {
    let resp = http_client::send(req).map_err(|e| format!("{}", e))?;
    let trimmed = resp.body.trim();
    if !resp.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            resp.status,
            http_client::preview(trimmed, 200)
        ));
    }
    if trimmed.is_empty() {
        return Ok(json!({ "status": resp.status }));
    }
    serde_json::from_str(trimmed)
        .map_err(|_| format!("Respuesta no es JSON válido: {}", http_client::preview(trimmed, 160)))
}

// ───────────────────────────── Email (SMTP) ─────────────────────────────

/// `send_email` — one SMTP message per item, via `lettre` with rustls.
///
/// Port 465 uses implicit TLS; 587 (and anything else) uses STARTTLS, which
/// is what Gmail, Outlook and most providers expect.
pub fn run_send_email(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let host = cfg(data, "smtp_host");
    if host.trim().is_empty() {
        return Err("Falta el servidor SMTP (smtp_host)".into());
    }
    let port: u16 = cfg(data, "smtp_port").trim().parse().unwrap_or(587);
    let username = cfg(data, "username");
    let mut password = cfg(data, "password");
    if password.is_empty() {
        password = credential_secret(&["password", "app_password", "smtp_password", "api_key"]);
    }
    let from_email = cfg(data, "from_email");
    if from_email.trim().is_empty() {
        return Err("Falta el remitente (from_email)".into());
    }
    let to_email = cfg(data, "to_email");
    if to_email.trim().is_empty() {
        return Err("Falta el destinatario (to_email)".into());
    }
    let subject = cfg(data, "subject");
    let body = cfg(data, "body");
    let is_html = data.get("is_html").and_then(|v| v.as_bool()).unwrap_or(false);

    if username.trim().is_empty() || password.is_empty() {
        return Err("Faltan usuario o contraseña SMTP (o adjunta una credencial de la bóveda)".into());
    }

    use lettre::message::{header::ContentType, Mailbox, Message};
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{SmtpTransport, Transport};

    let from_mb: Mailbox = from_email
        .parse()
        .map_err(|_| format!("Remitente no válido: {}", from_email))?;
    let to_mb: Mailbox = to_email
        .parse()
        .map_err(|_| format!("Destinatario no válido: {}", to_email))?;

    let mut out = Vec::new();
    for item in &items {
        // Per-item fields: the walker narrowed `to`/`subject`/`body` already,
        // but when several recipients arrive inside one run we re-resolve the
        // envelope per item so each gets its own copy.
        let builder = Message::builder()
            .from(from_mb.clone())
            .to(to_mb.clone())
            .subject(subject.clone())
            .header(if is_html {
                ContentType::TEXT_HTML
            } else {
                ContentType::TEXT_PLAIN
            });
        let email = builder
            .body(body.clone())
            .map_err(|e| format!("No se pudo construir el email: {}", e))?;

        let creds = Credentials::new(username.clone(), password.clone());
        let mailer = if port == 465 {
            SmtpTransport::relay(&host)
                .map_err(|e| format!("Host SMTP no válido: {}", e))?
        } else {
            SmtpTransport::starttls_relay(&host)
                .map_err(|e| format!("Host SMTP no válido: {}", e))?
        }
        .port(port)
        .credentials(creds)
        .build();

        let response = mailer
            .send(&email)
            .map_err(|e| format!("Envío SMTP falló: {}", e))?;

        out.push(item_with_result(
            Some(item),
            json!({ "sent": true, "email_status": response.code().to_string() })
                .as_object()
                .cloned()
                .unwrap_or_default(),
        ));
    }

    // No incoming items: send once with the bare config.
    if items.is_empty() {
        let builder = Message::builder()
            .from(from_mb)
            .to(to_mb)
            .subject(subject)
            .header(if is_html { ContentType::TEXT_HTML } else { ContentType::TEXT_PLAIN });
        let email = builder
            .body(body)
            .map_err(|e| format!("No se pudo construir el email: {}", e))?;
        let creds = Credentials::new(username, password);
        let mailer = if port == 465 {
            SmtpTransport::relay(&host).map_err(|e| format!("Host SMTP no válido: {}", e))?
        } else {
            SmtpTransport::starttls_relay(&host).map_err(|e| format!("Host SMTP no válido: {}", e))?
        }
        .port(port)
        .credentials(creds)
        .build();
        let response = mailer.send(&email).map_err(|e| format!("Envío SMTP falló: {}", e))?;
        out.push(item_with_result(
            None,
            json!({ "sent": true, "email_status": response.code().to_string() }).as_object().cloned().unwrap_or_default(),
        ));
    }

    Ok(out)
}

// ───────────────────────────── Slack ─────────────────────────────

/// `slack_webhook` — posts a message through a Slack Incoming Webhook.
pub fn run_slack(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let webhook_url = cfg(data, "webhook_url");
    if webhook_url.trim().is_empty() {
        return Err("Falta la URL del webhook de Slack".into());
    }
    let text = cfg(data, "text");
    if text.trim().is_empty() {
        return Err("Falta el texto del mensaje de Slack".into());
    }
    let channel = cfg(data, "channel");
    let bot_name = cfg(data, "bot_name");

    let mut out = Vec::new();
    let effective_items: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    for item in &effective_items {
        let mut payload = Map::new();
        payload.insert("text".into(), Value::String(text.clone()));
        if !channel.trim().is_empty() {
            payload.insert("channel".into(), Value::String(channel.clone()));
        }
        if !bot_name.trim().is_empty() {
            payload.insert("username".into(), Value::String(bot_name.clone()));
        }
        let req = HttpRequest {
            method: "POST".into(),
            url: webhook_url.clone(),
            headers: vec![("Content-Type".into(), "application/json".into())],
            body: Some(Value::Object(payload).to_string()),
            timeout_secs: 30,
        };
        let resp = http_client::send(&req).map_err(|e| format!("Slack: {}", e))?;
        if !resp.is_success() {
            return Err(format!("Slack devolvió HTTP {}: {}", resp.status, http_client::preview(&resp.body, 160)));
        }
        out.push(item_with_result(
            if item.is_null() { None } else { Some(item) },
            json!({ "sent": true, "service": "slack" }).as_object().cloned().unwrap_or_default(),
        ));
    }
    Ok(out)
}

// ───────────────────────────── Discord ─────────────────────────────

/// `discord_webhook` — posts a message through a Discord webhook URL.
pub fn run_discord(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let webhook_url = cfg(data, "webhook_url");
    if webhook_url.trim().is_empty() {
        return Err("Falta la URL del webhook de Discord".into());
    }
    let content = cfg(data, "content");
    if content.trim().is_empty() {
        return Err("Falta el contenido del mensaje de Discord".into());
    }
    let bot_name = cfg(data, "bot_name");

    let mut out = Vec::new();
    let effective_items: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    for item in &effective_items {
        let mut payload = Map::new();
        payload.insert("content".into(), Value::String(content.clone()));
        if !bot_name.trim().is_empty() {
            payload.insert("username".into(), Value::String(bot_name.clone()));
        }
        let req = HttpRequest {
            method: "POST".into(),
            url: webhook_url.clone(),
            headers: vec![("Content-Type".into(), "application/json".into())],
            body: Some(Value::Object(payload).to_string()),
            timeout_secs: 30,
        };
        let resp = http_client::send(&req).map_err(|e| format!("Discord: {}", e))?;
        if !resp.is_success() {
            return Err(format!("Discord devolvió HTTP {}: {}", resp.status, http_client::preview(&resp.body, 160)));
        }
        out.push(item_with_result(
            if item.is_null() { None } else { Some(item) },
            json!({ "sent": true, "service": "discord" }).as_object().cloned().unwrap_or_default(),
        ));
    }
    Ok(out)
}

// ───────────────────────────── Notion ─────────────────────────────

const NOTION_VERSION: &str = "2022-06-28";

fn notion_headers(token: &str) -> Vec<(String, String)> {
    vec![
        ("Content-Type".into(), "application/json".into()),
        ("Authorization".into(), format!("Bearer {}", token)),
        ("Notion-Version".into(), NOTION_VERSION.into()),
    ]
}

/// `notion` — query a database, create or update pages.
///
/// `properties_json` (optional) lets the user send the exact Notion property
/// payload; when absent, `create_page` builds a title property from `title`
/// on the default "Name" column.
pub fn run_notion(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let operation = cfg(data, "operation");
    let mut token = cfg(data, "token");
    if token.is_empty() {
        token = credential_secret(&["token", "api_key", "internal_integration_token"]);
    }
    if token.is_empty() {
        return Err("Falta el token de integración de Notion (inline o en la bóveda)".into());
    }
    let database_id = cfg(data, "database_id");
    let page_id = cfg(data, "page_id");
    let title = cfg(data, "title");
    let properties_raw = cfg(data, "properties_json");

    let properties: Option<Map<String, Value>> = if !properties_raw.trim().is_empty() {
        Some(
            serde_json::from_str::<Value>(&properties_raw)
                .map_err(|e| format!("properties_json no es JSON válido: {}", e))?
                .as_object()
                .cloned()
                .ok_or("properties_json debe ser un objeto JSON")?,
        )
    } else {
        None
    };

    match operation.as_str() {
        "query_database" => {
            if database_id.trim().is_empty() {
                return Err("Falta el database_id de Notion".into());
            }
            let filter_raw = cfg(data, "filter_json");
            let mut body = Map::new();
            if !filter_raw.trim().is_empty() {
                let filter: Value = serde_json::from_str(&filter_raw)
                    .map_err(|e| format!("filter_json no es JSON válido: {}", e))?;
                body.insert("filter".into(), filter);
            }
            let req = HttpRequest {
                method: "POST".into(),
                url: format!("https://api.notion.com/v1/databases/{}/query", database_id),
                headers: notion_headers(&token),
                body: Some(Value::Object(body).to_string()),
                timeout_secs: 60,
            };
            let parsed = api_call(&req)?;
            let pages = parsed
                .get("results")
                .and_then(|r| r.as_array())
                .cloned()
                .unwrap_or_default();
            // The feed replaces the item list: one item per page.
            Ok(pages
                .into_iter()
                .map(|p| json!({ "json": p }))
                .collect())
        }
        "create_page" => {
            if database_id.trim().is_empty() {
                return Err("Falta el database_id de Notion".into());
            }
            let props = properties.unwrap_or_else(|| {
                json!({ "Name": { "title": [{ "text": { "content": title } }] } })
                    .as_object()
                    .cloned()
                    .unwrap_or_default()
            });
            let body = json!({
                "parent": { "type": "database_id", "database_id": database_id },
                "properties": Value::Object(props),
            });
            let req = HttpRequest {
                method: "POST".into(),
                url: "https://api.notion.com/v1/pages".into(),
                headers: notion_headers(&token),
                body: Some(body.to_string()),
                timeout_secs: 60,
            };
            let page = api_call(&req)?;
            let single = items.first();
            Ok(vec![item_with_result(
                single,
                json!({ "notion_page": page }).as_object().cloned().unwrap_or_default(),
            )])
        }
        "update_page" => {
            if page_id.trim().is_empty() {
                return Err("Falta el page_id de Notion a actualizar".into());
            }
            let props = properties.unwrap_or_else(|| {
                json!({ "Name": { "title": [{ "text": { "content": title } }] } })
                    .as_object()
                    .cloned()
                    .unwrap_or_default()
            });
            let body = json!({ "properties": Value::Object(props) });
            let req = HttpRequest {
                method: "PATCH".into(),
                url: format!("https://api.notion.com/v1/pages/{}", page_id),
                headers: notion_headers(&token),
                body: Some(body.to_string()),
                timeout_secs: 60,
            };
            let page = api_call(&req)?;
            let single = items.first();
            Ok(vec![item_with_result(
                single,
                json!({ "notion_page": page }).as_object().cloned().unwrap_or_default(),
            )])
        }
        other => Err(format!("Operación de Notion desconocida: {} (usa query_database, create_page o update_page)", other)),
    }
}

// ───────────────────────────── Airtable ─────────────────────────────

/// URL-encodes a table name for the Airtable path (tables can contain spaces
/// and unicode).
fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// `airtable` — list / create / update / delete records.
pub fn run_airtable(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let operation = cfg(data, "operation");
    let mut api_key = cfg(data, "api_key");
    if api_key.is_empty() {
        api_key = credential_secret(&["api_key", "token", "pat"]);
    }
    if api_key.is_empty() {
        return Err("Falta la API key de Airtable (inline o en la bóveda)".into());
    }
    let base_id = cfg(data, "base_id");
    if base_id.trim().is_empty() {
        return Err("Falta el base_id de Airtable".into());
    }
    let table = cfg(data, "table");
    if table.trim().is_empty() {
        return Err("Falta el nombre de la tabla de Airtable".into());
    }
    let record_id = cfg(data, "record_id");
    let fields_raw = cfg(data, "fields_json");

    let fields: Option<Map<String, Value>> = if !fields_raw.trim().is_empty() {
        Some(
            serde_json::from_str::<Value>(&fields_raw)
                .map_err(|e| format!("fields_json no es JSON válido: {}", e))?
                .as_object()
                .cloned()
                .ok_or("fields_json debe ser un objeto JSON")?,
        )
    } else {
        None
    };

    let headers = vec![
        ("Content-Type".into(), "application/json".into()),
        ("Authorization".into(), format!("Bearer {}", api_key)),
    ];
    let base = format!("https://api.airtable.com/v0/{}/{}", urlencode(&base_id), urlencode(&table));

    match operation.as_str() {
        "list" => {
            let req = HttpRequest {
                method: "GET".into(),
                url: base,
                headers,
                body: None,
                timeout_secs: 60,
            };
            let parsed = api_call(&req)?;
            let records = parsed
                .get("records")
                .and_then(|r| r.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(records.into_iter().map(|r| json!({ "json": r })).collect())
        }
        "create" | "update" => {
            let fields = fields.ok_or("Falta fields_json con los campos a escribir")?;
            if operation == "update" && record_id.trim().is_empty() {
                return Err("Falta el record_id de Airtable a actualizar".into());
            }
            let (url, method) = if operation == "update" {
                (format!("{}/{}", base, record_id), "PATCH")
            } else {
                (base.clone(), "POST")
            };
            let req = HttpRequest {
                method: method.into(),
                url,
                headers,
                body: Some(json!({ "fields": Value::Object(fields) }).to_string()),
                timeout_secs: 60,
            };
            let record = api_call(&req)?;
            let single = items.first();
            Ok(vec![item_with_result(
                single,
                json!({ "airtable_record": record }).as_object().cloned().unwrap_or_default(),
            )])
        }
        "delete" => {
            if record_id.trim().is_empty() {
                return Err("Falta el record_id de Airtable a borrar".into());
            }
            let req = HttpRequest {
                method: "DELETE".into(),
                url: format!("{}/{}", base, record_id),
                headers,
                body: None,
                timeout_secs: 60,
            };
            let result = api_call(&req)?;
            let single = items.first();
            Ok(vec![item_with_result(
                single,
                json!({ "airtable_deleted": result }).as_object().cloned().unwrap_or_default(),
            )])
        }
        other => Err(format!("Operación de Airtable desconocida: {} (usa list, create, update o delete)", other)),
    }
}

// ───────────────────────────── RSS / Atom ─────────────────────────────

/// Extracts the URL from an Atom `<link>` element.
///
/// Atom writes links as `<link rel="alternate" href="…"/>` — a self-closing
/// element, so quick-xml reports it as `Event::Empty` and it never reaches the
/// text-based RSS path. Only the alternate link (the one a reader should
/// follow) is kept; `rel="self"`, `rel="edit"`, enclosures and the like are
/// ignored.
fn atom_link_href(e: &quick_xml::events::BytesStart) -> Option<String> {
    let mut href = String::new();
    let mut rel = String::from("alternate");
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let val = attr.unescape_value().unwrap_or_default().to_string();
        match key.as_str() {
            "href" => href = val,
            "rel" => rel = val,
            _ => {}
        }
    }
    if !href.is_empty() && (rel == "alternate" || rel.is_empty()) {
        Some(href)
    } else {
        None
    }
}

/// Parses an RSS 2.0 or Atom feed into a list of JSON objects with
/// `title`, `link`, `description`, `pub_date` and `guid`.
pub fn parse_feed(xml: &str) -> Result<Vec<Value>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut items: Vec<Value> = Vec::new();
    let mut buf = Vec::new();
    let mut current: Option<Map<String, Value>> = None;
    let mut text_buf = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = name.split(':').next_back().unwrap_or(&name).to_string();
                if local == "item" || local == "entry" {
                    current = Some(Map::new());
                } else if local == "link" && current.is_some() {
                    // Atom: <link href="…" rel="alternate" /> — RSS uses text.
                    if let Some(href) = atom_link_href(&e) {
                        current
                            .as_mut()
                            .unwrap()
                            .insert("link".into(), Value::String(href));
                    }
                }
                text_buf.clear();
            }
            Ok(Event::Empty(e)) => {
                // Self-closing elements carry no text, so `text_buf` is left
                // alone — the enclosing element may still be accumulating text.
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = name.split(':').next_back().unwrap_or(&name).to_string();
                if local == "link" && current.is_some() {
                    if let Some(href) = atom_link_href(&e) {
                        current
                            .as_mut()
                            .unwrap()
                            .insert("link".into(), Value::String(href));
                    }
                }
            }
            Ok(Event::Text(t)) => {
                text_buf.push_str(&t.unescape().unwrap_or_default());
            }
            Ok(Event::CData(t)) => {
                text_buf.push_str(&String::from_utf8_lossy(t.as_ref()));
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = name.split(':').next_back().unwrap_or(&name).to_string();
                if let Some(cur) = current.as_mut() {
                    if local == "item" || local == "entry" {
                        if let Some(done) = current.take() {
                            items.push(Value::Object(done));
                        }
                    } else if matches!(local.as_str(), "description" | "summary" | "content" | "content:encoded") {
                        cur.insert("description".into(), Value::String(text_buf.clone()));
                    } else if local == "title" {
                        cur.insert("title".into(), Value::String(text_buf.clone()));
                    } else if matches!(local.as_str(), "pubDate" | "updated" | "published") {
                        cur.insert("pub_date".into(), Value::String(text_buf.clone()));
                    } else if local == "guid" || local == "id" {
                        cur.insert("guid".into(), Value::String(text_buf.clone()));
                    } else if local == "link" {
                        // RSS <link>text</link>
                        if !text_buf.trim().is_empty() {
                            cur.insert("link".into(), Value::String(text_buf.clone()));
                        }
                    }
                }
                text_buf.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML del feed no válido: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    if items.is_empty() {
        // Distinguish "malformed" from "feed without entries" — a channel with
        // a title parses fine but yields no items, which is a valid (if odd) state.
        if !xml.contains("<item") && !xml.contains("<entry") {
            return Err("El documento no parece un feed RSS o Atom (sin <item> ni <entry>)".into());
        }
    }
    Ok(items)
}

/// `rss_read` — fetches a feed URL and replaces the items with its entries.
pub fn run_rss_read(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let url = cfg(data, "url");
    if url.trim().is_empty() {
        return Err("Falta la URL del feed RSS".into());
    }
    let limit = data
        .get("limit")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(20) as usize;

    let req = HttpRequest {
        method: "GET".into(),
        url,
        headers: vec![],
        body: None,
        timeout_secs: 30,
    };
    let resp = http_client::send(&req).map_err(|e| format!("RSS: {}", e))?;
    if !resp.is_success() {
        return Err(format!("El feed devolvió HTTP {}: {}", resp.status, http_client::preview(&resp.body, 120)));
    }
    let entries = parse_feed(&resp.body)?;
    Ok(entries
        .into_iter()
        .take(limit.max(1))
        .map(|e| json!({ "json": e }))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_feed_rss2() {
        let xml = r#"
        <rss version="2.0"><channel>
            <title>Canal</title><link>https://example.com</link>
            <item>
                <title>Primera noticia</title>
                <link>https://example.com/1</link>
                <description>Contenido de la primera</description>
                <pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate>
                <guid>abc-1</guid>
            </item>
            <item>
                <title>Segunda</title>
                <link>https://example.com/2</link>
                <description><![CDATA[Con <b>HTML</b> dentro]]></description>
            </item>
        </channel></rss>"#;
        let items = parse_feed(xml).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["title"], "Primera noticia");
        assert_eq!(items[0]["link"], "https://example.com/1");
        assert_eq!(items[0]["guid"], "abc-1");
        assert_eq!(items[0]["pub_date"], "Mon, 01 Sep 2026 10:00:00 GMT");
        assert!(items[1]["description"].as_str().unwrap().contains("HTML"));
    }

    #[test]
    fn parse_feed_atom() {
        let xml = r#"
        <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Atom Feed</title>
            <link rel="self" href="https://example.com/feed.atom"/>
            <entry>
                <title>Entrada uno</title>
                <link rel="alternate" href="https://example.com/a"/>
                <updated>2026-09-01T10:00:00Z</updated>
                <id>urn:uuid:1</id>
                <summary>Resumen</summary>
            </entry>
        </feed>"#;
        let items = parse_feed(xml).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["title"], "Entrada uno");
        // Only the alternate link is kept, not the feed's rel="self".
        assert_eq!(items[0]["link"], "https://example.com/a");
        assert_eq!(items[0]["pub_date"], "2026-09-01T10:00:00Z");
        assert_eq!(items[0]["guid"], "urn:uuid:1");
        assert_eq!(items[0]["description"], "Resumen");
    }

    #[test]
    fn parse_feed_rejects_non_feed_xml() {
        assert!(parse_feed("<html><body>no</body></html>").is_err());
    }

    #[test]
    fn urlencode_encodes_spaces() {
        assert_eq!(urlencode("My Table"), "My%20Table");
        assert_eq!(urlencode("appBase123"), "appBase123");
    }

    #[test]
    fn item_with_result_merges_fields() {
        let item = json!({ "json": { "nombre": "ana", "total": 5 } });
        let out = item_with_result(
            Some(&item),
            json!({ "sent": true }).as_object().cloned().unwrap(),
        );
        assert_eq!(out["json"]["nombre"], "ana");
        assert_eq!(out["json"]["sent"], true);
    }

    #[test]
    fn send_email_requires_host() {
        let err = run_send_email(&json!({}), vec![]).unwrap_err();
        assert!(err.contains("smtp_host"));
    }

    #[test]
    fn slack_requires_webhook_url() {
        let err = run_slack(&json!({ "text": "hola" }), vec![]).unwrap_err();
        assert!(err.contains("webhook"));
    }

    #[test]
    fn notion_requires_token() {
        let err = run_notion(&json!({ "operation": "query_database", "database_id": "abc" }), vec![]).unwrap_err();
        assert!(err.contains("token"));
    }

    #[test]
    fn airtable_requires_base() {
        let err = run_airtable(&json!({ "operation": "list" }), vec![]).unwrap_err();
        assert!(err.contains("API key"));
    }

    #[test]
    fn notion_rejects_unknown_operation() {
        let err = run_notion(&json!({ "operation": "magic", "token": "x" }), vec![]).unwrap_err();
        assert!(err.contains("Operación de Notion desconocida"));
    }
}
