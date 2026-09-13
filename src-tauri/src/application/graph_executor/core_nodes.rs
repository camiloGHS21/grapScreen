//! n8n "Core" node runners.
//!
//! These are the remaining nodes from n8n's *Core Nodes* category that do not
//! belong to the transform / AI / database / integration / parsing families
//! already implemented in the sibling modules:
//!
//! | kind        | n8n node                           | shape     |
//! |-------------|------------------------------------|-----------|
//! | `split_out` | Split Out                          | transform |
//! | `summarize` | Summarize                          | transform |
//! | `rename_keys` | Rename Keys                      | transform |
//! | `markdown`  | Markdown                           | transform |
//! | `crypto`    | Crypto                             | transform |
//! | `read_file` | Read/Write Files from Disk (read)  | action    |
//! | `write_file`| Read/Write Files from Disk (write) | action    |
//!
//! Transforms consume the whole item list and replace it, exactly like
//! `transform.rs`; actions run once per incoming item and merge their result
//! into that item, exactly like `integration_nodes.rs`.
//!
//! Every runner is a pure function of `(config, items)` — the file nodes touch
//! the disk, the crypto node touches nothing, and none of them reach the
//! network — so all of them are unit-testable without a running app.

use crate::application::replay_helpers;
use serde_json::{Map, Value};
use sha2::digest::Digest;
use std::path::PathBuf;

/// Same runaway guard as `transform.rs`: no single node may emit an unbounded
/// item list.
const MAX_ITEMS: usize = 100_000;

// ───────────────────────────── shared helpers ─────────────────────────────

/// Reads a config string, interpolating `{{ … }}` expressions.
fn cfg(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

/// Reads a config string without interpolating it.
fn cfg_raw(data: &Value, key: &str) -> String {
    data.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

/// Walks a dotted path (`data.items`) into a JSON value.
///
/// A leading `$json.` / `json.` prefix is tolerated so the value copied from an
/// expression field still resolves.
fn navigate<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let path = path.trim();
    let path = path
        .strip_prefix("$json.")
        .or_else(|| path.strip_prefix("json."))
        .unwrap_or(path);
    let mut current = value;
    for segment in path.split('.').filter(|s| !s.trim().is_empty()) {
        current = match current {
            Value::Object(map) => map.get(segment.trim())?,
            Value::Array(arr) => arr.get(segment.trim().parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(current)
}

/// Removes a dotted path from an object in place. Used by `split_out` so the
/// consumed list does not linger in the "include all fields" output.
fn remove_path(value: &mut Value, path: &str) {
    let segments: Vec<&str> = path.split('.').filter(|s| !s.trim().is_empty()).collect();
    match segments.as_slice() {
        [] => {}
        [last] => {
            if let Value::Object(map) = value {
                map.remove(*last);
            }
        }
        [head, rest @ ..] => {
            if let Value::Object(map) = value {
                if let Some(child) = map.get_mut(*head) {
                    remove_path(child, &rest.join("."));
                }
            }
        }
    }
}

/// Wraps a payload in the item envelope unless it already is one.
fn wrap(v: Value) -> Value {
    if v.is_object() && v.get("json").is_some() {
        v
    } else {
        serde_json::json!({ "json": v })
    }
}

/// Merges `result` into an unwrapped item and re-wraps it, mirroring the
/// action-node output convention used by the integration runners.
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
    Value::Object(obj)
}

/// An item's payload as an object, so callers can insert keys into it.
fn payload_object(item: &Value) -> Map<String, Value> {
    match crate::application::expressions::unwrap_item(item) {
        Value::Object(m) => m,
        other => {
            let mut m = Map::new();
            m.insert("value".to_string(), other);
            m
        }
    }
}

// ─────────────────────────────── Split Out ───────────────────────────────

/// `split_out` — n8n's *Split Out*.
///
/// Turns a list nested inside an item into one item per element. The `field`
/// config names the list; `include` decides what else survives:
///
/// * `none` (default) — only the split element
/// * `all` — every other field of the source item, with the consumed list
///   removed so it does not shadow the split values
/// * `selected` — only the comma-separated `include_fields`
///
/// When `destination_field` is set the element is nested under that key;
/// otherwise an object element is merged into the output and a scalar element
/// is stored under the field's leaf name (`data.tags` → `tags`), which is what
/// n8n does. A `field` that is not a list leaves the item untouched instead of
/// dropping it — losing data silently is the worst possible failure here.
pub fn run_split_out(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let field = cfg(data, "field");
    if field.trim().is_empty() {
        return Err("Split Out: indica el campo que contiene la lista".into());
    }
    let include = cfg_raw(data, "include");
    let include = if include.trim().is_empty() { "none".to_string() } else { include };
    let include_fields: Vec<String> = cfg(data, "include_fields")
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let destination = cfg(data, "destination_field").trim().to_string();
    let leaf = field
        .trim()
        .trim_start_matches("$json.")
        .rsplit('.')
        .next()
        .unwrap_or(field.trim())
        .to_string();

    let mut out: Vec<Value> = Vec::new();
    for item in items {
        let base = crate::application::expressions::unwrap_item(&item);
        let Some(elements) = navigate(&base, &field).and_then(|v| v.as_array().cloned()) else {
            // Not a list (missing field, object, scalar): pass through untouched.
            out.push(item);
            continue;
        };

        for element in elements {
            if out.len() >= MAX_ITEMS {
                return Err(format!(
                    "Split Out: la salida supera el límite de {} elementos",
                    MAX_ITEMS
                ));
            }

            let mut obj: Map<String, Value> = Map::new();
            match include.as_str() {
                "all" => {
                    // Start from every sibling field, then drop the list we just
                    // consumed so it cannot shadow the split values downstream.
                    obj = match &base {
                        Value::Object(map) => map.clone(),
                        _ => Map::new(),
                    };
                    let mut holder = Value::Object(obj);
                    remove_path(&mut holder, &field);
                    obj = match holder {
                        Value::Object(m) => m,
                        _ => Map::new(),
                    };
                }
                "selected" => {
                    for f in &include_fields {
                        if let Some(v) = navigate(&base, f) {
                            let key = f.rsplit('.').next().unwrap_or(f).to_string();
                            obj.insert(key, v.clone());
                        }
                    }
                }
                _ => {}
            }

            if !destination.is_empty() {
                obj.insert(destination.clone(), element);
            } else if element.is_object() {
                if let Value::Object(map) = element {
                    for (k, v) in map {
                        obj.insert(k, v);
                    }
                }
            } else {
                obj.insert(leaf.clone(), element);
            }

            out.push(wrap(Value::Object(obj)));
        }
    }
    Ok(out)
}

// ─────────────────────────────── Summarize ───────────────────────────────

/// One aggregation requested by the `summarize` node.
#[derive(Debug, Clone, PartialEq)]
struct Aggregation {
    field: String,
    operation: String,
    output: String,
}

/// Parses the `aggregations` config.
///
/// The editor sends an array of `{ field, operation, output_field }`. A compact
/// string form (`sum:amount, count:*`) is also accepted so hand-written
/// automations stay readable.
fn parse_aggregations(data: &Value) -> Result<Vec<Aggregation>, String> {
    let mut out = Vec::new();

    if let Some(arr) = data.get("aggregations").and_then(|v| v.as_array()) {
        for entry in arr {
            let operation = entry
                .get("operation")
                .and_then(|v| v.as_str())
                .unwrap_or("count")
                .trim()
                .to_ascii_lowercase();
            let field = entry.get("field").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let output = entry
                .get("output_field")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| default_output_name(&operation, &field));
            out.push(Aggregation { field, operation, output });
        }
        return Ok(out);
    }

    for chunk in cfg_raw(data, "aggregations").split(',') {
        let chunk = chunk.trim();
        if chunk.is_empty() {
            continue;
        }
        let (operation, field) = chunk
            .split_once(':')
            .map(|(a, b)| (a.trim().to_ascii_lowercase(), b.trim().to_string()))
            .unwrap_or_else(|| ("count".to_string(), String::new()));
        let field = if field == "*" { String::new() } else { field };
        let output = default_output_name(&operation, &field);
        out.push(Aggregation { field, operation, output });
    }
    Ok(out)
}

/// `count` → `count`, otherwise `sum_amount` / `average_price`.
fn default_output_name(operation: &str, field: &str) -> String {
    if operation == "count" {
        return "count".to_string();
    }
    let leaf = field.rsplit('.').next().unwrap_or(field);
    if leaf.is_empty() {
        operation.to_string()
    } else {
        format!("{}_{}", operation, leaf)
    }
}

/// `summarize` — n8n's *Summarize*.
///
/// Groups the items by `group_by` (a comma-separated list of paths; empty means
/// a single group) and computes one aggregation per configured entry. The
/// output has one item per group, carrying the grouping values plus one key per
/// aggregation, which is exactly n8n's shape.
pub fn run_summarize(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let group_by: Vec<String> = cfg(data, "group_by")
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let aggregations = parse_aggregations(data)?;
    if aggregations.is_empty() {
        return Err("Summarize: añade al menos una agregación".into());
    }
    let separator = data
        .get("separator")
        .and_then(|v| v.as_str())
        .unwrap_or(", ")
        .to_string();

    // Group while preserving first-seen order, so the output is deterministic
    // and does not depend on HashMap iteration.
    let mut groups: Vec<(String, Vec<Value>)> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for item in items {
        let p = crate::application::expressions::unwrap_item(&item);
        let key = group_by
            .iter()
            .map(|f| navigate(&p, f).map(|v| v.to_string()).unwrap_or_default())
            .collect::<Vec<_>>()
            .join("\u{1}");
        match index.get(&key) {
            Some(&i) => groups[i].1.push(p),
            None => {
                index.insert(key, groups.len());
                groups.push((String::new(), vec![p]));
            }
        }
    }

    let mut out = Vec::new();
    for (_, members) in groups {
        let mut obj = Map::new();
        for f in &group_by {
            let key = f.rsplit('.').next().unwrap_or(f).to_string();
            let value = members
                .first()
                .and_then(|m| navigate(m, f))
                .cloned()
                .unwrap_or(Value::Null);
            obj.insert(key, value);
        }
        for agg in &aggregations {
            obj.insert(agg.output.clone(), apply_aggregation(agg, &members, &separator));
        }
        out.push(wrap(Value::Object(obj)));
    }
    Ok(out)
}

/// Numeric view of a JSON value; `None` for anything that is not a finite
/// number. Booleans are deliberately excluded — `true` summing as 1 is a
/// surprise, not a feature.
fn as_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64().filter(|f| f.is_finite()),
        Value::String(s) => s.trim().parse::<f64>().ok().filter(|f| f.is_finite()),
        _ => None,
    }
}

/// JSON number for an `f64`, keeping integral results as integers so `sum` of
/// `[1, 2]` is `3` and not `3.0`.
fn number_value(f: f64) -> Value {
    if f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 {
        Value::from(f as i64)
    } else {
        serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
    }
}

fn apply_aggregation(agg: &Aggregation, members: &[Value], separator: &str) -> Value {
    let values: Vec<Value> = if agg.field.trim().is_empty() {
        Vec::new()
    } else {
        members
            .iter()
            .map(|m| navigate(m, &agg.field).cloned().unwrap_or(Value::Null))
            .collect()
    };
    let present: Vec<&Value> = values.iter().filter(|v| !v.is_null()).collect();

    match agg.operation.as_str() {
        "count" => Value::from(members.len()),
        "count_unique" => {
            let mut seen: Vec<String> = Vec::new();
            for v in &present {
                let key = v.to_string();
                if !seen.contains(&key) {
                    seen.push(key);
                }
            }
            Value::from(seen.len())
        }
        "sum" => {
            let nums: Vec<f64> = present.iter().filter_map(|v| as_number(v)).collect();
            number_value(nums.iter().sum())
        }
        "average" | "avg" | "mean" => {
            let nums: Vec<f64> = present.iter().filter_map(|v| as_number(v)).collect();
            if nums.is_empty() {
                Value::Null
            } else {
                number_value(nums.iter().sum::<f64>() / nums.len() as f64)
            }
        }
        "min" | "max" => {
            let want_max = agg.operation == "max";
            let nums: Vec<f64> = present.iter().filter_map(|v| as_number(v)).collect();
            if !nums.is_empty() {
                let picked = nums.iter().fold(nums[0], |acc, n| {
                    if (want_max && *n > acc) || (!want_max && *n < acc) {
                        *n
                    } else {
                        acc
                    }
                });
                return number_value(picked);
            }
            // No numbers at all: fall back to a lexicographic comparison so a
            // text column still summarises instead of returning null.
            present
                .iter()
                .map(|v| v.as_str().unwrap_or("").to_string())
                .filter(|s| !s.is_empty())
                .reduce(|acc, s| {
                    if (want_max && s > acc) || (!want_max && s < acc) {
                        s
                    } else {
                        acc
                    }
                })
                .map(Value::String)
                .unwrap_or(Value::Null)
        }
        "concatenate" | "join" => Value::String(
            present
                .iter()
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect::<Vec<_>>()
                .join(separator),
        ),
        "first" => present.first().map(|v| (*v).clone()).unwrap_or(Value::Null),
        "last" => present.last().map(|v| (*v).clone()).unwrap_or(Value::Null),
        "append" | "collect" => Value::Array(present.into_iter().cloned().collect()),
        // An unknown operation yields null rather than a guess: the caller can
        // see the node produced nothing meaningful.
        _ => Value::Null,
    }
}

// ────────────────────────────── Rename Keys ──────────────────────────────

/// One rename rule: `from` → `to`.
#[derive(Debug, Clone, PartialEq)]
struct Rename {
    from: String,
    to: String,
}

/// Parses `renames`, accepting either the editor's array of `{ from, to }` or a
/// compact `from=to` string (comma- or newline-separated).
fn parse_renames(data: &Value) -> Result<Vec<Rename>, String> {
    if let Some(arr) = data.get("renames").and_then(|v| v.as_array()) {
        return Ok(arr
            .iter()
            .filter_map(|e| {
                let from = e.get("from").and_then(|v| v.as_str())?.trim().to_string();
                let to = e.get("to").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                if from.is_empty() {
                    None
                } else {
                    Some(Rename { from, to })
                }
            })
            .collect());
    }

    let raw = cfg_raw(data, "renames");
    let mut out = Vec::new();
    for line in raw.split([',', '\n']) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((from, to)) = line.split_once('=') {
            let from = from.trim();
            if !from.is_empty() {
                out.push(Rename { from: from.to_string(), to: to.trim().to_string() });
            }
        }
    }
    Ok(out)
}

/// `rename_keys` — n8n's *Rename Keys*.
///
/// `mode` is `plain` (exact key match, the default) or `regex` (each `from` is
/// a regular expression applied with `replace_all`). With `keep_only` enabled
/// the output keeps just the keys that a rule touched, which is n8n's "Keep
/// Only Set" toggle. `deep` applies the rules to nested objects too.
pub fn run_rename_keys(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let renames = parse_renames(data)?;
    if renames.is_empty() {
        return Err("Rename Keys: define al menos un renombrado (origen → destino)".into());
    }
    let mode = cfg_raw(data, "mode");
    let mode = if mode.trim().is_empty() { "plain".to_string() } else { mode };
    let keep_only = data.get("keep_only").and_then(|v| v.as_bool()).unwrap_or(false);
    let deep = data.get("deep").and_then(|v| v.as_bool()).unwrap_or(false);

    // Compile once: an invalid pattern must fail the node loudly rather than
    // silently renaming nothing.
    let compiled: Vec<(Option<regex::Regex>, String)> = if mode.eq_ignore_ascii_case("regex") {
        renames
            .iter()
            .map(|r| {
                regex::Regex::new(&r.from)
                    .map(|re| (Some(re), r.to.clone()))
                    .map_err(|e| format!("Rename Keys: expresión regular inválida '{}': {}", r.from, e))
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        renames.iter().map(|r| (None, r.to.clone())).collect()
    };

    let mut out = Vec::new();
    for item in items {
        let payload = crate::application::expressions::unwrap_item(&item);
        let renamed = rename_value(&payload, &renames, &compiled, mode.eq_ignore_ascii_case("regex"), keep_only, deep);
        out.push(wrap(renamed));
    }
    Ok(out)
}

fn rename_value(
    value: &Value,
    renames: &[Rename],
    compiled: &[(Option<regex::Regex>, String)],
    is_regex: bool,
    keep_only: bool,
    deep: bool,
) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = Map::new();
            for (key, child) in map {
                let child = if deep { rename_value(child, renames, compiled, is_regex, keep_only, deep) } else { child.clone() };

                let mut new_key = key.clone();
                let mut touched = false;
                if is_regex {
                    for (re, to) in compiled {
                        if let Some(re) = re {
                            let replaced = re.replace_all(&new_key, to.as_str()).to_string();
                            if &replaced != &new_key {
                                new_key = replaced;
                                touched = true;
                            }
                        }
                    }
                } else {
                    for (rule, (_, to)) in renames.iter().zip(compiled.iter()) {
                        if &rule.from == key {
                            new_key = to.clone();
                            touched = true;
                        }
                    }
                }

                if keep_only && !touched {
                    continue;
                }
                out.insert(new_key, child);
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|v| rename_value(v, renames, compiled, is_regex, keep_only, deep))
                .collect(),
        ),
        other => other.clone(),
    }
}

// ─────────────────────────────── Markdown ───────────────────────────────

/// `markdown` — n8n's *Markdown*.
///
/// `mode` is `markdown_to_html` (default) or `html_to_markdown`. The text comes
/// from the `source` expression; when that is empty the item's own string value
/// is used, so the node chains naturally after an HTTP Request. The converted
/// text lands in `target_field` (default `data`) and the rest of the item is
/// preserved.
pub fn run_markdown(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let mode = cfg_raw(data, "mode");
    let to_markdown = mode.eq_ignore_ascii_case("html_to_markdown") || mode.eq_ignore_ascii_case("htmlToMarkdown");
    let target = cfg(data, "target_field").trim().to_string();
    let target = if target.is_empty() { "data".to_string() } else { target };
    let source = cfg(data, "source");

    let effective: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    let mut out = Vec::new();
    for item in &effective {
        let payload = crate::application::expressions::unwrap_item(item);
        let text = if source.trim().is_empty() {
            match &payload {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            }
        } else {
            source.clone()
        };

        let converted = if to_markdown {
            html_to_markdown(&text)
        } else {
            markdown_to_html(&text)
        };

        let mut result = Map::new();
        result.insert(target.clone(), Value::String(converted));
        out.push(item_with_result(if item.is_null() { None } else { Some(item) }, result));
    }
    Ok(out)
}

/// Escapes the characters that would otherwise be read as HTML.
fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Decodes the HTML entities that actually show up in feeds and emails.
fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let end = match tail.find(';') {
            Some(e) if e <= 10 => e,
            _ => {
                out.push('&');
                rest = &tail[1..];
                continue;
            }
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "#39" => Some('\''),
            "nbsp" => Some(' '),
            _ => {
                if let Some(hex) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
                    u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
                } else if let Some(dec) = entity.strip_prefix('#') {
                    dec.parse::<u32>().ok().and_then(char::from_u32)
                } else {
                    None
                }
            }
        };
        match decoded {
            Some(ch) => {
                out.push(ch);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Applies the inline markdown rules (bold, italic, code, links, images) to a
/// single already-escaped line.
fn inline_markdown(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let bytes: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < bytes.len() {
        let ch = bytes[i];
        // Images first: ![alt](src)
        if ch == '!' && i + 1 < bytes.len() && bytes[i + 1] == '[' {
            if let Some((alt, url, next)) = read_link(&bytes, i + 1) {
                out.push_str(&format!("<img src=\"{}\" alt=\"{}\" />", url, alt));
                i = next;
                continue;
            }
        }
        if ch == '[' {
            if let Some((label, url, next)) = read_link(&bytes, i) {
                out.push_str(&format!("<a href=\"{}\">{}</a>", url, label));
                i = next;
                continue;
            }
        }
        if ch == '`' {
            if let Some(end) = find_char(&bytes, i + 1, '`') {
                let code: String = bytes[i + 1..end].iter().collect();
                out.push_str(&format!("<code>{}</code>", code));
                i = end + 1;
                continue;
            }
        }
        if ch == '*' || ch == '_' {
            let marker = ch;
            let width = if i + 1 < bytes.len() && bytes[i + 1] == marker { 2 } else { 1 };
            let open = i + width;
            if let Some(end) = find_marker(&bytes, open, marker, width) {
                let inner: String = bytes[open..end].iter().collect();
                let tag = if width == 2 { "strong" } else { "em" };
                out.push_str(&format!("<{}>{}</{}>", tag, inline_markdown(&inner), tag));
                i = end + width;
                continue;
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

/// Reads a `[label](url)` starting at the `[`.
fn read_link(chars: &[char], open: usize) -> Option<(String, String, usize)> {
    if chars.get(open) != Some(&'[') {
        return None;
    }
    let close = find_char(chars, open + 1, ']')?;
    if chars.get(close + 1) != Some(&'(') {
        return None;
    }
    let url_end = find_char(chars, close + 2, ')')?;
    let label: String = chars[open + 1..close].iter().collect();
    let url: String = chars[close + 2..url_end].iter().collect();
    Some((label, url, url_end + 1))
}

fn find_char(chars: &[char], from: usize, needle: char) -> Option<usize> {
    (from..chars.len()).find(|&i| chars[i] == needle)
}

/// Finds a closing emphasis marker, skipping the run of the same character.
fn find_marker(chars: &[char], from: usize, marker: char, width: usize) -> Option<usize> {
    let mut i = from;
    while i < chars.len() {
        if chars[i] == marker {
            let run = (i..chars.len()).take_while(|&j| chars[j] == marker).count();
            if run >= width && i > from {
                return Some(i);
            }
            i += run;
        } else {
            i += 1;
        }
    }
    None
}

/// Converts the markdown subset n8n users actually write into HTML.
///
/// Block structure: ATX headings, fenced code, blockquotes, ordered and
/// unordered lists, horizontal rules and paragraphs. Inline: bold, italic,
/// inline code, links and images.
pub fn markdown_to_html(markdown: &str) -> String {
    let normalised = markdown.replace("\r\n", "\n");
    let lines: Vec<&str> = normalised.split('\n').collect();
    let mut html = String::new();
    let mut i = 0;

    // Open/close helpers keep the emitted HTML balanced.
    let mut list_stack: Vec<&str> = Vec::new();

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        // Fenced code block
        if let Some(fence) = trimmed.strip_prefix("```").map(|rest| rest.trim()) {
            let lang = fence.to_string();
            let mut body = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].trim().starts_with("```") {
                body.push(lines[i]);
                i += 1;
            }
            i += 1; // consume the closing fence
            while let Some(tag) = list_stack.pop() {
                html.push_str(&format!("</{}>", tag));
            }
            let class = if lang.is_empty() { String::new() } else { format!(" class=\"language-{}\"", escape_html(&lang)) };
            html.push_str(&format!("<pre><code{}>{}</code></pre>\n", class, escape_html(&body.join("\n"))));
            continue;
        }

        // Blank line: close any open list and separate blocks.
        if trimmed.is_empty() {
            while let Some(tag) = list_stack.pop() {
                html.push_str(&format!("</{}>", tag));
            }
            i += 1;
            continue;
        }

        // Horizontal rule
        if matches!(trimmed, "---" | "***" | "___" | "- - -") {
            while let Some(tag) = list_stack.pop() {
                html.push_str(&format!("</{}>", tag));
            }
            html.push_str("<hr />\n");
            i += 1;
            continue;
        }

        // ATX heading
        if let Some(level) = heading_level(trimmed) {
            while let Some(tag) = list_stack.pop() {
                html.push_str(&format!("</{}>", tag));
            }
            let text = trimmed[level..].trim().trim_end_matches('#').trim();
            html.push_str(&format!("<h{0}>{1}</h{0}>\n", level, inline_markdown(&escape_html(text))));
            i += 1;
            continue;
        }

        // Blockquote
        if let Some(rest) = trimmed.strip_prefix('>') {
            while let Some(tag) = list_stack.pop() {
                html.push_str(&format!("</{}>", tag));
            }
            html.push_str(&format!("<blockquote>{}</blockquote>\n", inline_markdown(&escape_html(rest.trim()))));
            i += 1;
            continue;
        }

        // Unordered list
        if let Some(rest) = strip_bullet(trimmed) {
            if list_stack.last() != Some(&"ul") {
                while let Some(tag) = list_stack.pop() {
                    html.push_str(&format!("</{}>", tag));
                }
                html.push_str("<ul>");
                list_stack.push("ul");
            }
            html.push_str(&format!("<li>{}</li>", inline_markdown(&escape_html(rest))));
            i += 1;
            continue;
        }

        // Ordered list
        if let Some(rest) = strip_number(trimmed) {
            if list_stack.last() != Some(&"ol") {
                while let Some(tag) = list_stack.pop() {
                    html.push_str(&format!("</{}>", tag));
                }
                html.push_str("<ol>");
                list_stack.push("ol");
            }
            html.push_str(&format!("<li>{}</li>", inline_markdown(&escape_html(rest))));
            i += 1;
            continue;
        }

        // Paragraph
        while let Some(tag) = list_stack.pop() {
            html.push_str(&format!("</{}>", tag));
        }
        html.push_str(&format!("<p>{}</p>\n", inline_markdown(&escape_html(trimmed))));
        i += 1;
    }

    while let Some(tag) = list_stack.pop() {
        html.push_str(&format!("</{}>", tag));
    }
    html
}

fn heading_level(line: &str) -> Option<usize> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if (1..=6).contains(&hashes) && line.chars().nth(hashes) == Some(' ') {
        Some(hashes)
    } else {
        None
    }
}

fn strip_bullet(line: &str) -> Option<&str> {
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return Some(rest.trim());
        }
    }
    None
}

fn strip_number(line: &str) -> Option<&str> {
    let digits = line.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return None;
    }
    let rest = &line[digits..];
    rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") ")).map(|s| s.trim())
}

/// Converts HTML to markdown for the tags that matter in automation payloads.
///
/// Deliberately a tokenizer rather than a DOM walk: the input is usually a feed
/// description or an email body, and a tokenizer degrades gracefully on the
/// malformed HTML those produce instead of throwing the whole document away.
pub fn html_to_markdown(html: &str) -> String {
    let mut out = String::new();
    let mut rest = html;
    // Tags whose content is dropped entirely.
    let mut skip_until: Option<&str> = None;
    // Pending link target, set by <a href> and consumed by </a>.
    let mut link_stack: Vec<String> = Vec::new();
    let mut list_depth = 0usize;

    while let Some(open) = rest.find('<') {
        let text = &rest[..open];
        if skip_until.is_none() {
            push_text(&mut out, &decode_entities(text));
        }
        let tail = &rest[open..];
        let Some(close) = tail.find('>') else {
            break;
        };
        let tag = &tail[1..close];
        rest = &tail[close + 1..];

        let name = tag
            .trim_start_matches('/')
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        let is_close = tag.trim_start().starts_with('/');
        let self_closing = tag.trim_end().ends_with('/');

        // Inside <script>/<style>: swallow everything until the matching close.
        if let Some(until) = skip_until {
            if is_close && name == until {
                skip_until = None;
            }
            continue;
        }
        if !is_close && matches!(name.as_str(), "script" | "style" | "head") && !self_closing {
            skip_until = Some(match name.as_str() {
                "script" => "script",
                "style" => "style",
                _ => "head",
            });
            continue;
        }

        match (is_close, name.as_str()) {
            (false, "br") => out.push('\n'),
            (false, "hr") => out.push_str("\n---\n"),
            (false, "p") | (false, "div") | (false, "section") | (false, "article") => {
                ensure_newlines(&mut out, 2)
            }
            (true, "p") | (true, "div") | (true, "section") | (true, "article") => {
                ensure_newlines(&mut out, 2)
            }
            (false, "h1") | (false, "h2") | (false, "h3") | (false, "h4") | (false, "h5") | (false, "h6") => {
                ensure_newlines(&mut out, 2);
                let level = name[1..].parse::<usize>().unwrap_or(1);
                out.push_str(&"#".repeat(level));
                out.push(' ');
            }
            (true, "h1") | (true, "h2") | (true, "h3") | (true, "h4") | (true, "h5") | (true, "h6") => {
                ensure_newlines(&mut out, 2)
            }
            (false, "strong") | (false, "b") => out.push_str("**"),
            (true, "strong") | (true, "b") => out.push_str("**"),
            (false, "em") | (false, "i") => out.push('*'),
            (true, "em") | (true, "i") => out.push('*'),
            (false, "code") => out.push('`'),
            (true, "code") => out.push('`'),
            (false, "pre") => {
                ensure_newlines(&mut out, 2);
                out.push_str("```\n");
            }
            (true, "pre") => {
                out.push_str("\n```");
                ensure_newlines(&mut out, 2);
            }
            (false, "blockquote") => {
                ensure_newlines(&mut out, 2);
                out.push_str("> ");
            }
            (true, "blockquote") => ensure_newlines(&mut out, 2),
            (false, "ul") | (false, "ol") => {
                ensure_newlines(&mut out, 1);
                list_depth += 1;
            }
            (true, "ul") | (true, "ol") => {
                list_depth = list_depth.saturating_sub(1);
                ensure_newlines(&mut out, 1);
            }
            (false, "li") => {
                ensure_newlines(&mut out, 1);
                out.push_str(&"  ".repeat(list_depth.saturating_sub(1)));
                out.push_str("- ");
            }
            (true, "li") => ensure_newlines(&mut out, 1),
            (false, "a") => {
                let href = attribute(tag, "href").unwrap_or_default();
                link_stack.push(href);
                out.push('[');
            }
            (true, "a") => {
                let href = link_stack.pop().unwrap_or_default();
                out.push_str(&format!("]({})", href));
            }
            (false, "img") => {
                let src = attribute(tag, "src").unwrap_or_default();
                let alt = attribute(tag, "alt").unwrap_or_default();
                out.push_str(&format!("![{}]({})", alt, src));
            }
            (false, "td") | (false, "th") => {
                if !out.ends_with('\n') && !out.is_empty() {
                    out.push_str(" | ");
                }
            }
            (false, "tr") => ensure_newlines(&mut out, 1),
            _ => {}
        }
    }

    if skip_until.is_none() {
        push_text(&mut out, &decode_entities(rest));
    }

    // Collapse the runs of blank lines the block tags introduce.
    let mut cleaned = String::with_capacity(out.len());
    let mut blank_run = 0;
    for line in out.split('\n') {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank_run += 1;
            if blank_run > 2 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        cleaned.push_str(line);
        cleaned.push('\n');
    }
    cleaned.trim().to_string()
}

/// Appends text, collapsing whitespace the way HTML rendering would.
fn push_text(out: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return;
    }
    if !out.is_empty() && !out.ends_with(['\n', ' ', '[', '*', '`']) {
        out.push(' ');
    }
    out.push_str(&collapsed);
}

/// Makes sure `out` ends with at least `n` newlines.
fn ensure_newlines(out: &mut String, n: usize) {
    if out.is_empty() {
        return;
    }
    let trailing = out.chars().rev().take_while(|c| *c == '\n').count();
    for _ in trailing..n {
        out.push('\n');
    }
}

/// Reads `name="value"` (single or double quoted, or bare) from a start tag.
fn attribute(tag: &str, name: &str) -> Option<String> {
    let lowered = tag.to_ascii_lowercase();
    let mut search_from = 0usize;
    loop {
        let pos = lowered[search_from..].find(name)? + search_from;
        // Must be preceded by whitespace so `data-href` does not match `href`.
        let preceded_ok = pos == 0
            || tag[..pos]
                .chars()
                .last()
                .map(|c| c.is_whitespace())
                .unwrap_or(false);
        let after = &tag[pos + name.len()..];
        let after_trimmed = after.trim_start();
        if preceded_ok && after_trimmed.starts_with('=') {
            let value = after_trimmed[1..].trim_start();
            let quote = value.chars().next()?;
            if quote == '"' || quote == '\'' {
                let end = value[1..].find(quote)? + 1;
                return Some(value[1..end].to_string());
            }
            let end = value
                .find(|c: char| c.is_whitespace() || c == '>')
                .unwrap_or(value.len());
            return Some(value[..end].to_string());
        }
        search_from = pos + name.len();
        if search_from >= lowered.len() {
            return None;
        }
    }
}

// ──────────────────────────────── Crypto ────────────────────────────────

/// Normalises the many spellings of an algorithm name n8n accepts.
fn normalise_algorithm(raw: &str) -> String {
    raw.trim()
        .to_ascii_uppercase()
        .replace(['-', '_', ' '], "")
}

/// Digests `bytes` with the named algorithm, or reports the algorithm as
/// unsupported — never silently substituting a different one.
fn hash_bytes(algorithm: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    Ok(match normalise_algorithm(algorithm).as_str() {
        "MD5" => md5::Md5::digest(bytes).to_vec(),
        "SHA1" => sha1::Sha1::digest(bytes).to_vec(),
        "SHA256" => sha2::Sha256::digest(bytes).to_vec(),
        "SHA512" => sha2::Sha512::digest(bytes).to_vec(),
        other => {
            return Err(format!(
                "Crypto: algoritmo '{}' no soportado (usa MD5, SHA1, SHA256 o SHA512)",
                other
            ))
        }
    })
}

/// RFC 2104 HMAC over any `digest::Digest` hasher, so SHA-1/256/512 share one
/// implementation instead of three near-identical ones.
fn hmac_with<D: Digest>(key: &[u8], message: &[u8], block_size: usize) -> Vec<u8> {
    let mut key = key.to_vec();
    if key.len() > block_size {
        key = D::digest(&key).to_vec();
    }
    key.resize(block_size, 0);

    let mut inner = Vec::with_capacity(block_size + message.len());
    let mut outer = Vec::with_capacity(block_size + 32);
    for byte in &key {
        inner.push(byte ^ 0x36);
        outer.push(byte ^ 0x5c);
    }
    inner.extend_from_slice(message);
    let inner_digest = D::digest(&inner);
    outer.extend_from_slice(&inner_digest);
    D::digest(&outer).to_vec()
}

fn hmac_bytes(algorithm: &str, key: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    Ok(match normalise_algorithm(algorithm).as_str() {
        "MD5" => hmac_with::<md5::Md5>(key, message, 64),
        "SHA1" => hmac_with::<sha1::Sha1>(key, message, 64),
        "SHA256" => hmac_with::<sha2::Sha256>(key, message, 64),
        "SHA512" => hmac_with::<sha2::Sha512>(key, message, 128),
        other => {
            return Err(format!(
                "Crypto: algoritmo '{}' no soportado (usa MD5, SHA1, SHA256 o SHA512)",
                other
            ))
        }
    })
}

fn encode_bytes(bytes: &[u8], encoding: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    if encoding.eq_ignore_ascii_case("base64") {
        STANDARD.encode(bytes)
    } else {
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }
}

/// `crypto` — n8n's *Crypto*.
///
/// Actions: `hash`, `hmac` and `random`. `algorithm` accepts MD5 / SHA1 /
/// SHA256 / SHA512 (any spelling — `SHA-256`, `sha256`, `sha_256`); `encoding`
/// is `hex` (default) or `base64`. The result is written to `target_field`
/// (default `data`) and the rest of the item survives.
pub fn run_crypto(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let action = cfg_raw(data, "action");
    let action = if action.trim().is_empty() { "hash".to_string() } else { action };
    let algorithm = cfg_raw(data, "algorithm");
    let algorithm = if algorithm.trim().is_empty() { "SHA256".to_string() } else { algorithm };
    let encoding = cfg_raw(data, "encoding");
    let encoding = if encoding.trim().is_empty() { "hex".to_string() } else { encoding };
    let target = cfg(data, "target_field").trim().to_string();
    let target = if target.is_empty() { "data".to_string() } else { target };

    // Validate once so a bad algorithm fails before any item is processed.
    if action.eq_ignore_ascii_case("hash") || action.eq_ignore_ascii_case("hmac") {
        hash_bytes(&algorithm, b"")?;
    }

    let effective: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    let mut out = Vec::new();
    for item in &effective {
        let mut result = Map::new();

        if action.eq_ignore_ascii_case("random") {
            let length = data
                .get("length")
                .and_then(|v| v.as_u64())
                .unwrap_or(32)
                .clamp(1, 4096) as usize;
            let value = random_string(length, &encoding);
            result.insert(target.clone(), Value::String(value));
        } else {
            let value = cfg(data, "value");
            let digest = if action.eq_ignore_ascii_case("hmac") {
                let secret = {
                    let inline = cfg(data, "secret");
                    if inline.is_empty() {
                        credential_secret()
                    } else {
                        inline
                    }
                };
                if secret.is_empty() {
                    return Err("Crypto: HMAC necesita un secreto".into());
                }
                hmac_bytes(&algorithm, secret.as_bytes(), value.as_bytes())?
            } else {
                hash_bytes(&algorithm, value.as_bytes())?
            };
            result.insert(target.clone(), Value::String(encode_bytes(&digest, &encoding)));
            result.insert("algorithm".into(), Value::String(normalise_algorithm(&algorithm)));
            result.insert("encoding".into(), Value::String(encoding.to_ascii_lowercase()));
        }

        out.push(item_with_result(if item.is_null() { None } else { Some(item) }, result));
    }
    Ok(out)
}

/// Reads the HMAC secret from the node's vault credential when no inline secret
/// was configured, matching the other credential-aware nodes.
fn credential_secret() -> String {
    let Some(cred) = replay_helpers::get_current_credential() else {
        return String::new();
    };
    let data = cred.get("data").unwrap_or(&cred);
    for key in ["secret", "api_key", "key", "password", "token"] {
        if let Some(v) = data.get(key).and_then(|v| v.as_str()) {
            if !v.trim().is_empty() {
                return v.trim().to_string();
            }
        }
    }
    String::new()
}

fn random_string(length: usize, encoding: &str) -> String {
    use rand::RngCore;
    let mut bytes = vec![0u8; length];
    rand::thread_rng().fill_bytes(&mut bytes);
    if encoding.eq_ignore_ascii_case("alphanumeric") {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return bytes
            .iter()
            .map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char)
            .collect();
    }
    if encoding.eq_ignore_ascii_case("base64") {
        return encode_bytes(&bytes, "base64");
    }
    encode_bytes(&bytes, "hex")
}

// ──────────────────────── Read / Write Files from Disk ────────────────────

/// Expands `~` and resolves a relative path against the user's home, so a
/// hand-written `~/datos.csv` works the way the user expects.
fn resolve_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

/// `read_file` — n8n's *Read/Write Files from Disk* (read).
///
/// Reads `file_path` once per incoming item. `encoding` is `utf8` (default) or
/// `base64` for binary payloads; the content lands in `target_field` (default
/// `data`). A missing or unreadable file fails the node instead of emitting an
/// empty string, because a silent empty read is indistinguishable from a
/// genuinely empty file.
pub fn run_read_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_raw = cfg(data, "file_path");
    if path_raw.trim().is_empty() {
        return Err("Leer archivo: indica la ruta del archivo".into());
    }
    let encoding = cfg_raw(data, "encoding");
    let target = cfg(data, "target_field").trim().to_string();
    let target = if target.is_empty() { "data".to_string() } else { target };

    let path = resolve_path(&path_raw);
    let bytes = std::fs::read(&path).map_err(|e| {
        format!("Leer archivo: no se pudo leer '{}': {}", path.display(), e)
    })?;

    let content = if encoding.eq_ignore_ascii_case("base64") {
        encode_bytes(&bytes, "base64")
    } else {
        String::from_utf8(bytes.clone())
            .unwrap_or_else(|_| String::from_utf8_lossy(&bytes).to_string())
    };

    let mut result = Map::new();
    result.insert(target, Value::String(content));
    result.insert("file_path".into(), Value::String(path.display().to_string()));
    result.insert("size_bytes".into(), Value::from(bytes.len() as u64));

    let effective: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    Ok(effective
        .iter()
        .map(|item| item_with_result(if item.is_null() { None } else { Some(item) }, result.clone()))
        .collect())
}

/// `write_file` — n8n's *Read/Write Files from Disk* (write).
///
/// Writes `content` to `file_path`. `content` is an expression, so
/// `{{ $json.body }}` works; when it is left empty the item's own string value
/// is written, which makes the node chain directly after a transform. With
/// `append` enabled the content is added to the end of the file instead of
/// replacing it, and missing parent directories are created either way.
pub fn run_write_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_raw = cfg(data, "file_path");
    if path_raw.trim().is_empty() {
        return Err("Escribir archivo: indica la ruta del archivo".into());
    }
    let encoding = cfg_raw(data, "encoding");
    let append = data.get("append").and_then(|v| v.as_bool()).unwrap_or(false);
    let content_expr = cfg(data, "content");

    let path = resolve_path(&path_raw);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                format!("Escribir archivo: no se pudo crear '{}': {}", parent.display(), e)
            })?;
        }
    }

    let effective: Vec<Value> = if items.is_empty() { vec![Value::Null] } else { items };
    let mut out = Vec::new();
    let mut total_written = 0usize;

    for item in &effective {
        let text = if content_expr.trim().is_empty() {
            match crate::application::expressions::unwrap_item(item) {
                Value::String(s) => s,
                other => other.to_string(),
            }
        } else {
            content_expr.clone()
        };

        let bytes = if encoding.eq_ignore_ascii_case("base64") {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            STANDARD
                .decode(text.trim())
                .map_err(|e| format!("Escribir archivo: base64 inválido: {}", e))?
        } else {
            text.into_bytes()
        };
        total_written += bytes.len();

        let result = if append {
            use std::io::Write;
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .and_then(|mut f| f.write_all(&bytes))
        } else {
            std::fs::write(&path, &bytes)
        };
        result.map_err(|e| format!("Escribir archivo: no se pudo escribir '{}': {}", path.display(), e))?;

        let mut fields = Map::new();
        fields.insert("written".into(), Value::Bool(true));
        fields.insert("bytes".into(), Value::from(bytes.len() as u64));
        fields.insert("file_path".into(), Value::String(path.display().to_string()));
        out.push(item_with_result(if item.is_null() { None } else { Some(item) }, fields));
    }

    if out.is_empty() {
        let mut fields = Map::new();
        fields.insert("written".into(), Value::Bool(false));
        fields.insert("bytes".into(), Value::from(0u64));
        fields.insert("file_path".into(), Value::String(path.display().to_string()));
        out.push(item_with_result(None, fields));
    }
    let _ = total_written;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn items(v: Value) -> Vec<Value> {
        match v {
            Value::Array(arr) => arr.into_iter().map(|x| json!({ "json": x })).collect(),
            other => vec![json!({ "json": other })],
        }
    }

    /// Unwraps a runner's output back to plain payloads for assertions.
    fn payloads(v: Vec<Value>) -> Vec<Value> {
        v.into_iter()
            .map(|i| crate::application::expressions::unwrap_item(&i))
            .collect()
    }

    // ── Split Out ──

    #[test]
    fn split_out_fans_a_list_into_one_item_per_element() {
        let data = json!({ "field": "tags" });
        let out = run_split_out(&data, items(json!({ "tags": ["a", "b", "c"] }))).unwrap();
        assert_eq!(out.len(), 3);
        assert_eq!(payloads(out), vec![json!({"tags":"a"}), json!({"tags":"b"}), json!({"tags":"c"})]);
    }

    #[test]
    fn split_out_merges_object_elements_by_default() {
        let data = json!({ "field": "rows", "include": "none" });
        let out = run_split_out(&data, items(json!({ "rows": [{ "id": 1 }, { "id": 2 }] }))).unwrap();
        assert_eq!(payloads(out), vec![json!({"id":1}), json!({"id":2})]);
    }

    #[test]
    fn split_out_include_all_keeps_siblings_and_drops_the_consumed_list() {
        let data = json!({ "field": "rows", "include": "all" });
        let out = run_split_out(
            &data,
            items(json!({ "source": "api", "rows": [{ "id": 1 }] })),
        )
        .unwrap();
        assert_eq!(payloads(out), vec![json!({ "source": "api", "id": 1 })]);
    }

    #[test]
    fn split_out_include_all_drops_a_nested_consumed_list() {
        // The leaf name is `rows`, but the path is `data.rows`: removing the
        // top-level key `rows` instead of the nested one would be a bug.
        let data = json!({ "field": "data.rows", "include": "all" });
        let out = run_split_out(
            &data,
            items(json!({ "source": "api", "data": { "rows": [{ "id": 7 }], "keep": true } })),
        )
        .unwrap();
        assert_eq!(payloads(out), vec![json!({ "source": "api", "data": { "keep": true }, "id": 7 })]);
    }

    #[test]
    fn split_out_include_selected_keeps_only_named_fields() {
        let data = json!({ "field": "rows", "include": "selected", "include_fields": "source" });
        let out = run_split_out(
            &data,
            items(json!({ "source": "api", "extra": 9, "rows": [{ "id": 1 }] })),
        )
        .unwrap();
        assert_eq!(payloads(out), vec![json!({ "source": "api", "id": 1 })]);
    }

    #[test]
    fn split_out_destination_field_nests_the_element() {
        let data = json!({ "field": "rows", "destination_field": "row" });
        let out = run_split_out(&data, items(json!({ "rows": [{ "id": 1 }] }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "row": { "id": 1 } })]);
    }

    #[test]
    fn split_out_passes_through_a_non_list_instead_of_dropping_it() {
        let data = json!({ "field": "rows" });
        let out = run_split_out(&data, items(json!({ "rows": "not a list" }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "rows": "not a list" })]);
    }

    #[test]
    fn split_out_on_an_empty_list_emits_nothing() {
        let data = json!({ "field": "rows" });
        let out = run_split_out(&data, items(json!({ "rows": [] }))).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn split_out_requires_a_field() {
        let err = run_split_out(&json!({}), items(json!({ "rows": [1] }))).unwrap_err();
        assert!(err.contains("campo"), "unexpected error: {}", err);
    }

    // ── Summarize ──

    #[test]
    fn summarize_groups_and_sums() {
        let data = json!({
            "group_by": "city",
            "aggregations": [{ "field": "amount", "operation": "sum" }],
        });
        let out = run_summarize(
            &data,
            items(json!([
                { "city": "Madrid", "amount": 10 },
                { "city": "Madrid", "amount": 5 },
                { "city": "Bogota", "amount": 7 }
            ])),
        )
        .unwrap();
        let got = payloads(out);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0], json!({ "city": "Madrid", "sum_amount": 15 }));
        assert_eq!(got[1], json!({ "city": "Bogota", "sum_amount": 7 }));
    }

    #[test]
    fn summarize_without_group_by_produces_one_row() {
        let data = json!({ "aggregations": [{ "field": "", "operation": "count" }] });
        let out = run_summarize(&data, items(json!([{ "a": 1 }, { "a": 2 }, { "a": 3 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "count": 3 })]);
    }

    #[test]
    fn summarize_average_ignores_non_numeric_values() {
        let data = json!({ "aggregations": [{ "field": "n", "operation": "average" }] });
        let out = run_summarize(&data, items(json!([{ "n": 10 }, { "n": "texto" }, { "n": 20 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "average_n": 15 })]);
    }

    #[test]
    fn summarize_min_and_max_over_numbers() {
        let data = json!({
            "aggregations": [
                { "field": "n", "operation": "min" },
                { "field": "n", "operation": "max" }
            ],
        });
        let out = run_summarize(&data, items(json!([{ "n": 4 }, { "n": -2 }, { "n": 9 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "min_n": -2, "max_n": 9 })]);
    }

    #[test]
    fn summarize_concatenate_uses_the_separator() {
        let data = json!({
            "separator": " | ",
            "aggregations": [{ "field": "name", "operation": "concatenate" }],
        });
        let out = run_summarize(&data, items(json!([{ "name": "ana" }, { "name": "luis" }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "concatenate_name": "ana | luis" })]);
    }

    #[test]
    fn summarize_count_unique_deduplicates() {
        let data = json!({ "aggregations": [{ "field": "k", "operation": "count_unique" }] });
        let out = run_summarize(&data, items(json!([{ "k": 1 }, { "k": 1 }, { "k": 2 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "count_unique_k": 2 })]);
    }

    #[test]
    fn summarize_append_collects_the_values() {
        let data = json!({ "aggregations": [{ "field": "k", "operation": "append" }] });
        let out = run_summarize(&data, items(json!([{ "k": 1 }, { "k": 2 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "append_k": [1, 2] })]);
    }

    #[test]
    fn summarize_rejects_an_empty_aggregation_list() {
        assert!(run_summarize(&json!({}), items(json!([{ "a": 1 }]))).is_err());
    }

    #[test]
    fn summarize_honours_an_explicit_output_field() {
        let data = json!({
            "aggregations": [{ "field": "amount", "operation": "sum", "output_field": "total" }],
        });
        let out = run_summarize(&data, items(json!([{ "amount": 3 }]))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "total": 3 })]);
    }

    // ── Rename Keys ──

    #[test]
    fn rename_keys_renames_in_plain_mode() {
        let data = json!({ "renames": [{ "from": "old", "to": "new" }] });
        let out = run_rename_keys(&data, items(json!({ "old": 1, "keep": 2 }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "new": 1, "keep": 2 })]);
    }

    #[test]
    fn rename_keys_keep_only_drops_untouched_keys() {
        let data = json!({ "renames": [{ "from": "old", "to": "new" }], "keep_only": true });
        let out = run_rename_keys(&data, items(json!({ "old": 1, "keep": 2 }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "new": 1 })]);
    }

    #[test]
    fn rename_keys_regex_mode_rewrites_every_match() {
        let data = json!({ "mode": "regex", "renames": [{ "from": "^user_", "to": "" }] });
        let out = run_rename_keys(&data, items(json!({ "user_id": 1, "user_name": "ana", "other": 2 }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "id": 1, "name": "ana", "other": 2 })]);
    }

    #[test]
    fn rename_keys_reports_an_invalid_regex_instead_of_ignoring_it() {
        let data = json!({ "mode": "regex", "renames": [{ "from": "([", "to": "x" }] });
        let err = run_rename_keys(&data, items(json!({ "a": 1 }))).unwrap_err();
        assert!(err.contains("regular"), "unexpected error: {}", err);
    }

    #[test]
    fn rename_keys_deep_mode_reaches_nested_objects() {
        let data = json!({ "renames": [{ "from": "old", "to": "new" }], "deep": true });
        let out = run_rename_keys(&data, items(json!({ "nested": { "old": 1 } }))).unwrap();
        assert_eq!(payloads(out), vec![json!({ "nested": { "new": 1 } })]);
    }

    #[test]
    fn rename_keys_requires_at_least_one_rule() {
        assert!(run_rename_keys(&json!({}), items(json!({ "a": 1 }))).is_err());
    }

    // ── Markdown ──

    #[test]
    fn markdown_converts_headings_bold_and_links() {
        let data = json!({ "source": "# Titulo\n\nHola **mundo** y [link](http://x.dev)" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let html = payload["data"].as_str().unwrap();
        assert!(html.contains("<h1>Titulo</h1>"), "{}", html);
        assert!(html.contains("<strong>mundo</strong>"), "{}", html);
        assert!(html.contains("<a href=\"http://x.dev\">link</a>"), "{}", html);
    }

    #[test]
    fn markdown_escapes_html_so_it_cannot_inject_tags() {
        let data = json!({ "source": "texto <script>alert(1)</script>" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let html = payload["data"].as_str().unwrap();
        assert!(!html.contains("<script>"), "raw script leaked: {}", html);
        assert!(html.contains("&lt;script&gt;"), "{}", html);
    }

    #[test]
    fn markdown_converts_fenced_code_without_touching_its_contents() {
        let data = json!({ "source": "```js\nconst a = 1 < 2;\n```" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let html = payload["data"].as_str().unwrap();
        assert!(html.contains("<pre><code class=\"language-js\">"), "{}", html);
        assert!(html.contains("const a = 1 &lt; 2;"), "{}", html);
    }

    #[test]
    fn markdown_converts_unordered_and_ordered_lists() {
        let data = json!({ "source": "- uno\n- dos\n\n1. primero\n2. segundo" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let html = payload["data"].as_str().unwrap();
        assert!(html.contains("<ul><li>uno</li><li>dos</li></ul>"), "{}", html);
        assert!(html.contains("<ol><li>primero</li><li>segundo</li></ol>"), "{}", html);
    }

    #[test]
    fn markdown_html_to_markdown_round_trips_the_common_tags() {
        let data = json!({
            "mode": "html_to_markdown",
            "source": "<h2>Hola</h2><p>Un <strong>texto</strong> con <a href=\"http://x.dev\">link</a>.</p>",
        });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let md = payload["data"].as_str().unwrap();
        assert!(md.contains("## Hola"), "{}", md);
        assert!(md.contains("**texto**"), "{}", md);
        assert!(md.contains("[link](http://x.dev)"), "{}", md);
    }

    #[test]
    fn markdown_html_to_markdown_drops_script_content() {
        let data = json!({ "mode": "html_to_markdown", "source": "<p>ok</p><script>evil()</script>" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let md = payload["data"].as_str().unwrap();
        assert!(md.contains("ok"), "{}", md);
        assert!(!md.contains("evil"), "script body leaked: {}", md);
    }

    #[test]
    fn markdown_html_to_markdown_decodes_entities() {
        let data = json!({ "mode": "html_to_markdown", "source": "<p>a &amp; b &lt; c</p>" });
        let out = run_markdown(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), "a & b < c");
    }

    #[test]
    fn markdown_uses_the_item_value_when_no_source_is_given() {
        let out = run_markdown(&json!({}), items(json!("**hola**"))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), "<p><strong>hola</strong></p>\n");
    }

    #[test]
    fn markdown_writes_to_the_configured_target_field() {
        let data = json!({ "source": "hola", "target_field": "html" });
        let out = run_markdown(&data, items(json!({ "id": 1 }))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["id"], json!(1));
        assert!(payload["html"].as_str().unwrap().contains("hola"));
    }

    // ── Crypto ──

    #[test]
    fn crypto_sha256_matches_the_known_vector() {
        // NIST / RFC 6234 test vector for "abc".
        let data = json!({ "action": "hash", "algorithm": "SHA256", "value": "abc" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(
            payload["data"].as_str().unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn crypto_sha512_matches_the_known_vector() {
        let data = json!({ "algorithm": "SHA-512", "value": "abc" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert!(payload["data"]
            .as_str()
            .unwrap()
            .starts_with("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a"));
    }

    #[test]
    fn crypto_sha1_matches_the_known_vector() {
        let data = json!({ "algorithm": "sha1", "value": "abc" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn crypto_md5_matches_the_rfc1321_vector() {
        let data = json!({ "algorithm": "MD5", "value": "abc" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), "900150983cd24fb0d6963f7d28e17f72");
    }

    #[test]
    fn crypto_md5_matches_the_empty_string_vector() {
        let data = json!({ "algorithm": "MD5", "value": "" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn crypto_hmac_sha256_matches_rfc4231_case_1() {
        // RFC 4231 test case 1: key = 20 x 0x0b, data = "Hi There".
        let key = "\u{0b}".repeat(20);
        let data = json!({ "action": "hmac", "algorithm": "SHA256", "secret": key, "value": "Hi There" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(
            payload["data"].as_str().unwrap(),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn crypto_hmac_sha512_matches_rfc4231_case_1() {
        let key = "\u{0b}".repeat(20);
        let data = json!({ "action": "hmac", "algorithm": "SHA512", "secret": key, "value": "Hi There" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert!(payload["data"]
            .as_str()
            .unwrap()
            .starts_with("87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde"));
    }

    #[test]
    fn crypto_base64_encoding_is_the_base64_of_the_hex_digest() {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        // Derived from the SHA-256 vector asserted above rather than typed out
        // by hand: the two encodings are cross-checked, so a mistyped literal
        // cannot make this test agree with a bug.
        let hex = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let bytes: Vec<u8> = (0..hex.len() / 2)
            .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap())
            .collect();
        let expected = STANDARD.encode(&bytes);

        let data = json!({ "algorithm": "SHA256", "value": "abc", "encoding": "base64" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap(), expected);
        assert_eq!(payload["encoding"], json!("base64"));
    }

    #[test]
    fn crypto_rejects_an_unknown_algorithm_rather_than_substituting_one() {
        let data = json!({ "algorithm": "CRC32", "value": "abc" });
        let err = run_crypto(&data, items(json!({}))).unwrap_err();
        assert!(err.contains("no soportado"), "unexpected error: {}", err);
    }

    #[test]
    fn crypto_hmac_without_a_secret_fails() {
        let data = json!({ "action": "hmac", "value": "abc" });
        assert!(run_crypto(&data, items(json!({}))).is_err());
    }

    #[test]
    fn crypto_random_returns_the_requested_length() {
        let data = json!({ "action": "random", "length": 16, "encoding": "hex" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"].as_str().unwrap().len(), 32); // 16 bytes -> 32 hex chars
    }

    #[test]
    fn crypto_random_alphanumeric_stays_inside_the_alphabet() {
        let data = json!({ "action": "random", "length": 64, "encoding": "alphanumeric" });
        let out = run_crypto(&data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        let value = payload["data"].as_str().unwrap();
        assert_eq!(value.len(), 64);
        assert!(value.chars().all(|c| c.is_ascii_alphanumeric()), "{}", value);
    }

    #[test]
    fn crypto_preserves_the_rest_of_the_item() {
        let data = json!({ "algorithm": "SHA256", "value": "abc" });
        let out = run_crypto(&data, items(json!({ "id": 42 }))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["id"], json!(42));
    }

    // ── Read / Write Files ──

    #[test]
    fn write_then_read_round_trips_a_utf8_file() {
        let dir = std::env::temp_dir().join(format!("grapscreen-test-{}", std::process::id()));
        let path = dir.join("nested").join("salida.txt");
        let path_str = path.to_string_lossy().to_string();

        let write_data = json!({ "file_path": path_str, "content": "hola mundo" });
        run_write_file(&write_data, items(json!({}))).unwrap();
        assert!(path.exists(), "parent directories should be created");

        let read_data = json!({ "file_path": path_str });
        let out = run_read_file(&read_data, items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"], json!("hola mundo"));
        assert_eq!(payload["size_bytes"], json!(10));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_file_appends_when_asked() {
        let dir = std::env::temp_dir().join(format!("grapscreen-append-{}", std::process::id()));
        let path = dir.join("log.txt");
        let path_str = path.to_string_lossy().to_string();

        run_write_file(&json!({ "file_path": path_str, "content": "uno\n" }), items(json!({}))).unwrap();
        run_write_file(
            &json!({ "file_path": path_str, "content": "dos\n", "append": true }),
            items(json!({})),
        )
        .unwrap();

        let out = run_read_file(&json!({ "file_path": path_str }), items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"], json!("uno\ndos\n"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_file_without_append_replaces_the_previous_content() {
        let dir = std::env::temp_dir().join(format!("grapscreen-replace-{}", std::process::id()));
        let path = dir.join("replace.txt");
        let path_str = path.to_string_lossy().to_string();

        run_write_file(&json!({ "file_path": path_str, "content": "viejo" }), items(json!({}))).unwrap();
        run_write_file(&json!({ "file_path": path_str, "content": "nuevo" }), items(json!({}))).unwrap();

        let out = run_read_file(&json!({ "file_path": path_str }), items(json!({}))).unwrap();
        let payload = payloads(out).remove(0);
        assert_eq!(payload["data"], json!("nuevo"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_reports_a_missing_file_instead_of_returning_empty() {
        let data = json!({ "file_path": "C:/definitely/not/here/nope.txt" });
        let err = run_read_file(&data, items(json!({}))).unwrap_err();
        assert!(err.contains("no se pudo leer"), "unexpected error: {}", err);
    }

    #[test]
    fn read_file_requires_a_path() {
        assert!(run_read_file(&json!({}), items(json!({}))).is_err());
        assert!(run_write_file(&json!({}), items(json!({}))).is_err());
    }

    #[test]
    fn write_file_uses_the_item_value_when_no_content_is_configured() {
        let dir = std::env::temp_dir().join(format!("grapscreen-item-{}", std::process::id()));
        let path = dir.join("item.txt");
        let path_str = path.to_string_lossy().to_string();

        run_write_file(&json!({ "file_path": path_str }), items(json!("desde el item"))).unwrap();
        let out = run_read_file(&json!({ "file_path": path_str }), items(json!({}))).unwrap();
        assert_eq!(payloads(out).remove(0)["data"], json!("desde el item"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── helpers ──

    #[test]
    fn navigate_tolerates_the_json_prefix_and_array_indexes() {
        let value = json!({ "a": { "b": [10, 20] } });
        assert_eq!(navigate(&value, "a.b.1"), Some(&json!(20)));
        assert_eq!(navigate(&value, "$json.a.b.0"), Some(&json!(10)));
        assert_eq!(navigate(&value, "a.missing"), None);
    }

    #[test]
    fn attribute_only_matches_a_whole_name() {
        // `data-href` must not be mistaken for `href`.
        assert_eq!(attribute("div data-href=\"x\" href=\"y\"", "href"), Some("y".to_string()));
        assert_eq!(attribute("<a href='single'>", "href"), Some("single".to_string()));
        assert_eq!(attribute("<a href=bare>", "href"), Some("bare".to_string()));
        assert_eq!(attribute("<a title=\"x\">", "href"), None);
    }

    #[test]
    fn number_value_keeps_integers_integral() {
        assert_eq!(number_value(3.0), json!(3));
        assert_eq!(number_value(2.5), json!(2.5));
    }
}
