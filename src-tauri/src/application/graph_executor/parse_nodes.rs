//! Phase 11 parsing nodes: `xml_parse` (XML → JSON items) and
//! `html_extract` (CSS-selector extraction from HTML).
//!
//! Both are transforms: they read their source string from the node config
//! (usually an interpolated `{{ $json.field }}` expression) and REPLACE the
//! current item list with what they produce.

use crate::application::replay_helpers;
use serde_json::{json, Map, Value};

fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

// ───────────────────────────── XML → JSON ─────────────────────────────

/// Converts an XML document into a `serde_json::Value` tree.
///
/// Conventions (same as Python's xmltodict, which n8n users know):
///   - attributes become `"@key"` entries,
///   - text content becomes `"#text"` — except on a leaf element with no
///     attributes, where the text is stored directly (`"a"`, not
///     `{"#text": "a"}`) so `{{ $json.a }}` yields the value,
///   - repeated sibling elements collapse into a JSON array.
/// Namespace prefixes are stripped from element names.
pub fn xml_to_value(xml: &str) -> Result<Value, String> {
    xml_to_value_named(xml).map(|(_, value)| value)
}

/// Same as [`xml_to_value`], but also returns the local name of the root
/// element.
///
/// The root element itself is not part of the returned tree — `<doc><x>1</x></doc>`
/// becomes `{"x": "1"}`, exactly like xmltodict. `run_xml_parse` still needs the
/// name so it can tolerate a `root` path that starts with it.
fn xml_to_value_named(xml: &str) -> Result<(String, Value), String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    // Stack of (element_name, map) — the root becomes the return value.
    let mut stack: Vec<(String, Map<String, Value>)> = Vec::new();
    let mut root: Option<Value> = None;
    let mut root_name: Option<String> = None;
    let mut buf = Vec::new();
    let mut text_buf = String::new();

    fn insert_child(map: &mut Map<String, Value>, key: String, value: Value) {
        match map.get_mut(&key) {
            None => {
                map.insert(key, value);
            }
            Some(Value::Array(arr)) => arr.push(value),
            Some(existing) => {
                let prev = existing.take();
                map.insert(key, Value::Array(vec![prev, value]));
            }
        }
    }

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = name.split(':').next_back().unwrap_or(&name).to_string();

                let mut map = Map::new();
                for attr in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let key = key.split(':').next_back().unwrap_or(&key).to_string();
                    let val = attr.unescape_value().unwrap_or_default().to_string();
                    map.insert(format!("@{}", key), Value::String(val));
                }
                stack.push((local, map));
                text_buf.clear();
            }
            Ok(Event::Text(t)) => {
                text_buf.push_str(&t.unescape().unwrap_or_default());
            }
            Ok(Event::CData(t)) => {
                text_buf.push_str(&String::from_utf8_lossy(t.as_ref()));
            }
            Ok(Event::End(_)) => {
                if let Some((name, mut map)) = stack.pop() {
                    let trimmed = text_buf.trim();
                    // Leaf element with no attributes and no children: store the
                    // text directly, so `{{ $json.a }}` is "1" rather than
                    // {"#text": "1"}. Only an element that *also* carries
                    // attributes needs the `#text` / `@attr` object form, since
                    // the two would otherwise collide.
                    let value = if !trimmed.is_empty() && map.is_empty() {
                        Value::String(trimmed.to_string())
                    } else {
                        if !trimmed.is_empty() {
                            map.insert("#text".into(), Value::String(trimmed.to_string()));
                        }
                        Value::Object(map)
                    };
                    match stack.last_mut() {
                        Some((_, parent)) => insert_child(parent, name, value),
                        None => {
                            root_name = Some(name);
                            root = Some(value);
                        }
                    }
                }
                text_buf.clear();
            }
            Ok(Event::Empty(e)) => {
                // <tag/> — attribute-only element with no children.
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = name.split(':').next_back().unwrap_or(&name).to_string();
                let mut map = Map::new();
                for attr in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let key = key.split(':').next_back().unwrap_or(&key).to_string();
                    let val = attr.unescape_value().unwrap_or_default().to_string();
                    map.insert(format!("@{}", key), Value::String(val));
                }
                match stack.last_mut() {
                    Some((_, parent)) => insert_child(parent, local, Value::Object(map)),
                    None => {
                        root_name = Some(local);
                        root = Some(Value::Object(map));
                    }
                }
                text_buf.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML no válido: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    match (root, root_name) {
        (Some(value), Some(name)) => Ok((name, value)),
        _ => Err("El documento XML no tiene ningún elemento raíz".to_string()),
    }
}

/// Navigates a dot-separated path (`a.b.c`) through the parsed tree.
fn navigate<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut cur = value;
    for segment in path.split('.').filter(|s| !s.trim().is_empty()) {
        cur = match cur {
            Value::Object(map) => map.get(segment)?,
            Value::Array(arr) => {
                let idx: usize = segment.parse().ok()?;
                arr.get(idx)?
            }
            _ => return None,
        };
    }
    Some(cur)
}

/// Resolves the `root` path, tolerating a leading segment that names the
/// document's root element.
///
/// Since the root element is stripped from the tree (`<rss>…</rss>` becomes
/// `{"channel": …}`), the path people naturally write — `rss.channel.item` —
/// would otherwise never resolve. Dropping that first segment makes both
/// `rss.channel.item` and `channel.item` work; a path that is *only* the root
/// name resolves to the whole document.
fn navigate_from_root<'a>(value: &'a Value, root_name: &str, path: &str) -> Option<&'a Value> {
    let mut segments: Vec<&str> = path.split('.').filter(|s| !s.trim().is_empty()).collect();
    if let Some(first) = segments.first() {
        if first.trim() == root_name {
            segments.remove(0);
        }
    }
    if segments.is_empty() {
        return Some(value);
    }
    navigate(value, &segments.join("."))
}

/// `xml_parse` — turns an XML string into items.
///
/// `source` is interpolated (e.g. `{{ $json.payload }}`); `root` optionally
/// walks into a subtree before fan-out, and may be prefixed with the root
/// element name. An array becomes one item per element; anything else becomes a
/// single item. Non-object elements are wrapped as `{"value": …}`, because an
/// n8n item's `json` is always an object.
pub fn run_xml_parse(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let source = cfg(data, "source");
    if source.trim().is_empty() {
        return Err("Falta el XML de origen (source), p. ej. {{ $json.xml }}".into());
    }
    let root_path = cfg(data, "root");

    let (root_name, parsed) = xml_to_value_named(&source)?;
    let target = if root_path.trim().is_empty() {
        &parsed
    } else {
        navigate_from_root(&parsed, &root_name, &root_path)
            .ok_or_else(|| format!("La ruta '{}' no existe en el XML parseado", root_path))?
    };

    match target {
        Value::Array(arr) => Ok(arr
            .iter()
            .map(|v| {
                let obj = match v {
                    Value::Object(m) => Value::Object(m.clone()),
                    other => json!({ "value": other }),
                };
                json!({ "json": obj })
            })
            .collect()),
        other => Ok(vec![json!({ "json": other })]),
    }
}

// ───────────────────────────── HTML extraction ─────────────────────────────

/// `html_extract` — CSS-selects elements from an HTML string.
///
/// Each match becomes one item with the element's text plus any attributes
/// listed in `attr` (comma-separated, e.g. `href,title`).
pub fn run_html_extract(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let source = cfg(data, "source");
    if source.trim().is_empty() {
        return Err("Falta el HTML de origen (source), p. ej. {{ $json.html }}".into());
    }
    let selector = cfg(data, "selector");
    if selector.trim().is_empty() {
        return Err("Falta el selector CSS (p. ej. a.titulo, div.card h2)".into());
    }
    let attrs: Vec<String> = cfg(data, "attr")
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let document = scraper::Html::parse_document(&source);
    let sel = scraper::Selector::parse(&selector)
        .map_err(|e| format!("Selector CSS no válido: {:?}", e))?;

    let mut out = Vec::new();
    for element in document.select(&sel) {
        let mut obj = Map::new();
        obj.insert(
            "text".into(),
            Value::String(element.text().collect::<String>().trim().to_string()),
        );
        for attr in &attrs {
            obj.insert(
                attr.clone(),
                Value::String(element.value().attr(attr).unwrap_or("").to_string()),
            );
        }
        out.push(json!({ "json": Value::Object(obj) }));
    }

    if out.is_empty() {
        // Not an error per se — n8n returns zero items too — but a hint helps.
        Ok(Vec::new())
    } else {
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_to_value_basic_tree() {
        let xml = r#"<root><a>1</a><b attr="x">texto</b></root>"#;
        let v = xml_to_value(xml).unwrap();
        assert_eq!(v["a"], "1");
        assert_eq!(v["b"]["#text"], "texto");
        assert_eq!(v["b"]["@attr"], "x");
    }

    #[test]
    fn xml_to_value_repeated_siblings_become_array() {
        let xml = r#"<root><item>uno</item><item>dos</item><item>tres</item></root>"#;
        let v = xml_to_value(xml).unwrap();
        let arr = v["item"].as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[2], "tres");
    }

    #[test]
    fn xml_to_value_namespaces_stripped() {
        let xml = r#"<ns:root xmlns:ns="http://x"><ns:child>hola</ns:child></ns:root>"#;
        let v = xml_to_value(xml).unwrap();
        assert_eq!(v["child"], "hola");
    }

    #[test]
    fn xml_to_value_empty_elements() {
        let xml = r#"<root><a/><b>1</b></root>"#;
        let v = xml_to_value(xml).unwrap();
        assert_eq!(v["a"], Value::Object(Map::new()));
        assert_eq!(v["b"], "1");
    }

    #[test]
    fn navigate_walks_path() {
        let v = json!({ "rss": { "channel": { "item": [ {"id": 1}, {"id": 2} ] } } });
        let arr = navigate(&v, "rss.channel.item").unwrap();
        assert_eq!(arr.as_array().unwrap().len(), 2);
        assert!(navigate(&v, "rss.no.existe").is_none());
    }

    #[test]
    fn xml_parse_fans_out_array() {
        // The root element is stripped, so the path to the repeated element is
        // `item`, not `root.item`.
        let data = json!({
            "source": "<root><item><n>1</n></item><item><n>2</n></item></root>",
            "root": "item"
        });
        let items = run_xml_parse(&data, vec![]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["json"]["n"], "1");
        assert_eq!(items[1]["json"]["n"], "2");
    }

    #[test]
    fn xml_parse_root_path_may_include_root_element_name() {
        let xml = "<rss><channel>\
                   <item><title>uno</title></item>\
                   <item><title>dos</title></item>\
                   </channel></rss>";
        // Both spellings resolve: with and without the `<rss>` prefix.
        for path in ["rss.channel.item", "channel.item"] {
            let data = json!({ "source": xml, "root": path });
            let items = run_xml_parse(&data, vec![]).unwrap();
            assert_eq!(items.len(), 2, "path {}", path);
            assert_eq!(items[0]["json"]["title"], "uno", "path {}", path);
        }
    }

    #[test]
    fn xml_parse_wraps_scalar_elements_under_value() {
        // An n8n item's `json` is always an object, so a bare scalar element
        // becomes {"value": "uno"} rather than "uno".
        let data = json!({
            "source": "<root><item>uno</item><item>dos</item></root>",
            "root": "item"
        });
        let items = run_xml_parse(&data, vec![]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["json"]["value"], "uno");
        assert_eq!(items[1]["json"]["value"], "dos");
    }

    #[test]
    fn xml_parse_without_root_returns_whole() {
        let data = json!({ "source": "<doc><x>1</x></doc>" });
        let items = run_xml_parse(&data, vec![]).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["json"]["x"], "1");
    }

    #[test]
    fn xml_parse_requires_source() {
        let err = run_xml_parse(&json!({}), vec![]).unwrap_err();
        assert!(err.contains("source"));
    }

    #[test]
    fn html_extract_pulls_links() {
        let html = r#"<html><body>
            <a class="titulo" href="/uno">Primera</a>
            <a class="titulo" href="/dos">Segunda</a>
            <a href="/otro">Ignorada</a>
        </body></html>"#;
        let data = json!({ "source": html, "selector": "a.titulo", "attr": "href" });
        let items = run_html_extract(&data, vec![]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["json"]["text"], "Primera");
        assert_eq!(items[0]["json"]["href"], "/uno");
        assert_eq!(items[1]["json"]["href"], "/dos");
    }

    #[test]
    fn html_extract_multiple_attrs() {
        let html = r#"<img src="a.png" alt="desc" />"#;
        let data = json!({ "source": html, "selector": "img", "attr": "src,alt" });
        let items = run_html_extract(&data, vec![]).unwrap();
        assert_eq!(items[0]["json"]["src"], "a.png");
        assert_eq!(items[0]["json"]["alt"], "desc");
    }

    #[test]
    fn html_extract_no_matches_is_empty() {
        let data = json!({ "source": "<p>hola</p>", "selector": "table" });
        assert!(run_html_extract(&data, vec![]).unwrap().is_empty());
    }

    #[test]
    fn html_extract_rejects_bad_selector() {
        let data = json!({ "source": "<p>hola</p>", "selector": "<<<" });
        assert!(run_html_extract(&data, vec![]).is_err());
    }

    #[test]
    fn html_extract_requires_source() {
        let err = run_html_extract(&json!({ "selector": "a" }), vec![]).unwrap_err();
        assert!(err.contains("source"));
    }
}
