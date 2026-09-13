//! Data-transformation node runners.
//!
//! These are the n8n "Transform" nodes: they consume the incoming item list and
//! produce a new item list. Unlike the item-based action nodes (which run once
//! per item), these see the **whole array at once** — you cannot sort or
//! aggregate one item in isolation. So the engine dispatches them here before
//! any per-item fan-out, and they replace `CURRENT_ITEMS` with their result.
//!
//! Every runner returns the items it produced; the caller stores them.

use crate::application::expressions::{self, ExprContext};
use crate::application::replay_helpers;
use serde_json::Value;

/// Maximum items any single node may emit, to keep a runaway flow from
/// exhausting memory. n8n caps similarly.
const MAX_ITEMS: usize = 100_000;

/// Builds an expression context over the given items, reading the current
/// thread-local variables and node outputs.
///
/// Credentials are not threaded through here: transformation nodes operate on
/// data rather than talking to authenticated services, so `$credentials`
/// resolves to null inside them.
fn ctx_for<'a>(
    items: &'a [Value],
    nodes: &'a std::collections::HashMap<String, Vec<Value>>,
    vars: &'a std::collections::HashMap<String, String>,
) -> ExprContext<'a> {
    ExprContext {
        items,
        item_index: 0,
        run_index: 0,
        node_outputs: nodes,
        variables: vars,
        execution_id: "",
        credentials: None,
    }
}

/// Extracts the plain payload of an item (`{ "json": x }` -> `x`).
pub(crate) fn payload(item: &Value) -> Value {
    expressions::unwrap_item(item)
}

/// Wraps a payload back into the item envelope, unless it already is one.
pub(crate) fn wrap(v: Value) -> Value {
    if v.is_object() && v.get("json").is_some() {
        v
    } else {
        serde_json::json!({ "json": v })
    }
}

/// Reads a config string field and interpolates expressions in it.
pub(crate) fn cfg_str(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

// ─────────────────────────────── Filter ───────────────────────────────

/// `filter` — keeps only the items whose condition holds.
///
/// n8n splits this into "Filter" and "Remove Duplicates" style nodes; here the
/// condition is a typed expression evaluated per item, so it covers both.
pub fn run_filter(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let condition = data
        .get("condition")
        .and_then(|v| v.as_str())
        .unwrap_or("true")
        .to_string();

    // "keep" (default) keeps matches; "discard" drops them.
    let mode = data.get("mode").and_then(|v| v.as_str()).unwrap_or("keep");
    let keep_matches = !mode.eq_ignore_ascii_case("discard");

    let nodes = replay_helpers::get_node_outputs();
    let vars = replay_helpers::get_all_vars();

    let mut out = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let single = vec![item.clone()];
        let ctx = ctx_for(&single, &nodes, &vars);
        let matched = expressions::eval_condition(&condition, &ctx);

        if matched == keep_matches {
            out.push(item.clone());
        }
        let _ = i;
    }
    Ok(out)
}

// ──────────────────────────────── Sort ────────────────────────────────

/// `sort` — orders items by one or more fields.
///
/// `fields` is a comma-separated list of paths; a leading `-` means descending
/// (e.g. `-created_at,name`). Numbers sort numerically, strings
/// lexicographically, and mixed types fall back to their string form.
pub fn run_sort(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let raw_fields = data
        .get("fields")
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default();

    let specs: Vec<(String, bool)> = raw_fields
        .split(',')
        .map(|f| f.trim())
        .filter(|f| !f.is_empty())
        .map(|f| {
            if let Some(stripped) = f.strip_prefix('-') {
                (stripped.trim().to_string(), true)
            } else {
                (f.to_string(), false)
            }
        })
        .collect();

    if specs.is_empty() {
        // Nothing to sort by: keep the incoming order.
        return Ok(items);
    }

    let mut sorted = items;
    // Stable sort applied from the last key to the first, so the first key in
    // the list wins — the standard multi-key trick.
    for (path, desc) in specs.iter().rev() {
        sorted.sort_by(|a, b| {
            let av = expressions::get_path(&payload(a), path);
            let bv = expressions::get_path(&payload(b), path);
            let ord = compare_values(&av, &bv);
            if *desc {
                ord.reverse()
            } else {
                ord
            }
        });
    }
    Ok(sorted)
}

/// Total order across the JSON types we care about, so sorting never panics on
/// heterogeneous data (n8n's biggest sort pitfall).
fn compare_values(a: &Value, b: &Value) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    // Nulls always sink to the end regardless of direction.
    match (a.is_null(), b.is_null()) {
        (true, true) => return Ordering::Equal,
        (true, false) => return Ordering::Greater,
        (false, true) => return Ordering::Less,
        _ => {}
    }

    // Numbers compare numerically.
    if let (Some(x), Some(y)) = (a.as_f64(), b.as_f64()) {
        return x.partial_cmp(&y).unwrap_or(Ordering::Equal);
    }
    // Booleans: false < true.
    if let (Some(x), Some(y)) = (a.as_bool(), b.as_bool()) {
        return x.cmp(&y);
    }
    // Everything else falls back to its string form, case-insensitively, with a
    // tie-break on the raw form so the order stays deterministic.
    let sa = expressions::stringify(a);
    let sb = expressions::stringify(b);
    sa.to_lowercase()
        .cmp(&sb.to_lowercase())
        .then_with(|| sa.cmp(&sb))
}

// ─────────────────────────────── Limit ────────────────────────────────

/// `limit` — keeps at most `max_items`, optionally skipping the first `skip`.
/// Mirrors n8n's "Limit" node, which is how flows sample data cheaply.
pub fn run_limit(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let skip = data
        .get("skip")
        .map(|v| as_usize(v))
        .unwrap_or(0);
    let max = data
        .get("max_items")
        .or_else(|| data.get("maxItems"))
        .map(|v| as_usize(v))
        .unwrap_or(items.len());

    let out: Vec<Value> = items.into_iter().skip(skip).take(max).collect();
    Ok(out)
}

fn as_usize(v: &Value) -> usize {
    if let Some(n) = v.as_u64() {
        return n as usize;
    }
    if let Some(s) = v.as_str() {
        let interpolated = replay_helpers::interpolate_variables(s);
        return interpolated.trim().parse::<usize>().unwrap_or(0);
    }
    0
}

// ──────────────────────── Remove Duplicates ───────────────────────────

/// Builds the dedupe key for an item from the configured field list.
///
/// The key is the JSON serialization of the selected values, which makes it
/// stable across types (numbers and their string forms are *not* merged, but
/// nested objects and arrays compare structurally). With no fields configured
/// the whole payload is the key, i.e. exact duplicates only.
fn dedupe_key(payload: &Value, fields: &[String]) -> String {
    if fields.is_empty() {
        return serde_json::to_string(payload).unwrap_or_default();
    }
    let parts: Vec<Value> = fields
        .iter()
        .map(|f| expressions::get_path(payload, f))
        .collect();
    serde_json::to_string(&Value::Array(parts)).unwrap_or_default()
}

/// `remove_duplicates` — keeps one item per distinct key.
///
/// `fields` is a comma-separated list of paths forming the key (empty = the
/// whole item). `keep` chooses which occurrence survives: `first` (default) or
/// `last`. Unlike n8n's version this preserves the original order in both modes,
/// so `last` does not shuffle the output.
pub fn run_remove_duplicates(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let fields: Vec<String> = data
        .get("fields")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .split(',')
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
        .collect();

    let keep_last = data
        .get("keep")
        .and_then(|v| v.as_str())
        .map(|s| s.eq_ignore_ascii_case("last"))
        .unwrap_or(false);

    // Map each key to the position that should survive in the output.
    let mut chosen: Vec<(String, usize)> = Vec::new();
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for (i, item) in items.iter().enumerate() {
        let key = dedupe_key(&payload(item), &fields);
        match seen.get(&key) {
            Some(&slot) if keep_last => {
                // Replace the kept occurrence but hold the original position, so
                // ordering stays exactly as the input produced it.
                chosen[slot] = (key, i);
            }
            Some(_) => {}
            None => {
                seen.insert(key.clone(), chosen.len());
                chosen.push((key, i));
            }
        }
    }

    let out: Vec<Value> = chosen.into_iter().map(|(_, idx)| items[idx].clone()).collect();
    Ok(out)
}

// ──────────────────────── Compare Datasets ────────────────────────────

/// `compare_datasets` — diffs the incoming items against a second list.
///
/// `compare_with` names a variable holding the other dataset (JSON array, or an
/// array produced by an HTTP/Code node). Items are matched on `key` (a field
/// path); the output is one item per difference, tagged with `change_type`:
///
///   - `added`   — present in the incoming list, absent from `compare_with`
///   - `removed` — present in `compare_with`, absent from the incoming list
///   - `changed` — present in both but at least one `compare_fields` differs
///
/// With no `compare_fields` set, "changed" means the payloads are not deeply
/// equal. `mode` selects what to emit: `all` (default), `added`, `removed`,
/// `changed`, or `same`.
pub fn run_compare_datasets(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let raw = cfg_str(data, "compare_with");
    if raw.trim().is_empty() {
        return Err(
            "El nodo Comparar datasets necesita 'compare_with': la variable o expresión con la otra lista."
                .into(),
        );
    }

    // Accept either a JSON array or a line-separated fallback, matching the
    // tolerance of the split_batches node.
    let other: Vec<Value> = match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Array(arr)) => arr.into_iter().map(wrap).collect(),
        _ => raw
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .map(|l| wrap(Value::String(l.to_string())))
            .collect(),
    };

    let key = data
        .get("key")
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default();
    let key = key.trim();
    if key.is_empty() {
        return Err("El nodo Comparar datasets necesita un 'key' para emparejar los items.".into());
    }

    let compare_fields: Vec<String> = data
        .get("compare_fields")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .split(',')
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
        .collect();

    let mode = data
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("all")
        .to_lowercase();

    // Resolve the match key for an item.
    //
    // When `compare_with` is plain text rather than JSON, each line becomes a
    // bare string item that has no field to look up. Falling back to the value
    // itself keeps those datasets matchable instead of collapsing every entry
    // onto the same empty key.
    let key_of = |item: &Value| -> String {
        let found = expressions::get_path(&payload(item), key);
        if found.is_null() {
            return expressions::stringify(&payload(item));
        }
        expressions::stringify(&found)
    };

    let mut other_by_key: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for o in &other {
        other_by_key.insert(key_of(o), o.clone());
    }

    let mut incoming_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<Value> = Vec::new();

    let differs = |a: &Value, b: &Value| -> bool {
        if compare_fields.is_empty() {
            // Deep structural comparison.
            return payload(a) != payload(b);
        }
        compare_fields.iter().any(|f| {
            expressions::get_path(&payload(a), f) != expressions::get_path(&payload(b), f)
        })
    };

    let emit = |kind: &str, mode: &str| -> bool {
        mode == "all" || mode == kind
    };

    for item in &items {
        let k = key_of(item);
        incoming_keys.insert(k.clone());
        match other_by_key.get(&k) {
            None => {
                if emit("added", &mode) {
                    out.push(wrap(serde_json::json!({
                        "key": k,
                        "change_type": "added",
                        "current": payload(item),
                        "previous": Value::Null,
                    })));
                }
            }
            Some(prev) => {
                if differs(item, prev) {
                    if emit("changed", &mode) {
                        out.push(wrap(serde_json::json!({
                            "key": k,
                            "change_type": "changed",
                            "current": payload(item),
                            "previous": payload(prev),
                        })));
                    }
                } else if emit("same", &mode) {
                    out.push(wrap(serde_json::json!({
                        "key": k,
                        "change_type": "same",
                        "current": payload(item),
                        "previous": payload(prev),
                    })));
                }
            }
        }
    }

    // Anything left in `compare_with` was removed upstream.
    if emit("removed", &mode) {
        for prev in &other {
            let k = key_of(prev);
            if !incoming_keys.contains(&k) {
                out.push(wrap(serde_json::json!({
                    "key": k,
                    "change_type": "removed",
                    "current": Value::Null,
                    "previous": payload(prev),
                })));
            }
        }
    }

    Ok(out)
}

// ───────────────────────────── Aggregate ──────────────────────────────

/// `aggregate` — collapses the whole item list into a single item.
///
/// `mode` picks the shape of the result:
///   - `list` (default): `{ json: { data: [ ...payloads ] } }`
///   - `count`:          `{ json: { count: N } }`
///   - `sum`/`min`/`max`/`average`: needs `field`, produces `{ json: { <field or value>: X } }`
///   - `collect`: gathers one `field` from every item into an array
///   - `concat`: joins one `field` from every item as text, using `separator`
pub fn run_aggregate(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let mode = data
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("list")
        .to_lowercase();
    let field = cfg_str(data, "field");

    let payloads: Vec<Value> = items.iter().map(payload).collect();

    let result = match mode.as_str() {
        "count" => serde_json::json!({ "count": payloads.len() }),
        "collect" => {
            let collected: Vec<Value> = payloads
                .iter()
                .map(|p| {
                    if field.is_empty() {
                        p.clone()
                    } else {
                        expressions::get_path(p, &field)
                    }
                })
                .collect();
            serde_json::json!({ "data": collected })
        }
        "concat" => {
            let sep = data.get("separator").and_then(|v| v.as_str()).unwrap_or("");
            let joined: Vec<String> = payloads
                .iter()
                .map(|p| {
                    let v = if field.is_empty() {
                        p.clone()
                    } else {
                        expressions::get_path(p, &field)
                    };
                    expressions::stringify(&v)
                })
                .collect();
            serde_json::json!({ "data": joined.join(sep) })
        }
        "sum" | "min" | "max" | "average" | "avg" | "mean" => {
            let nums: Vec<f64> = payloads
                .iter()
                .filter_map(|p| {
                    let v = if field.is_empty() {
                        p.clone()
                    } else {
                        expressions::get_path(p, &field)
                    };
                    as_number(&v)
                })
                .collect();
            if nums.is_empty() {
                serde_json::json!({ "value": Value::Null })
            } else {
                let acc = match mode.as_str() {
                    "sum" => nums.iter().sum::<f64>(),
                    "min" => nums.iter().cloned().fold(f64::INFINITY, f64::min),
                    "max" => nums.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
                    _ => nums.iter().sum::<f64>() / nums.len() as f64,
                };
                serde_json::json!({ "value": expressions::num_from_f64(acc) })
            }
        }
        // "list" and anything unknown.
        _ => serde_json::json!({ "data": payloads }),
    };

    Ok(vec![wrap(result)])
}

/// Coerces a JSON value to a number the way a spreadsheet would: numbers pass
/// through, numeric strings parse, booleans become 0/1, everything else is
/// skipped by the caller.
fn as_number(v: &Value) -> Option<f64> {
    if let Some(n) = v.as_f64() {
        return Some(n);
    }
    if let Some(b) = v.as_bool() {
        return Some(if b { 1.0 } else { 0.0 });
    }
    if let Some(s) = v.as_str() {
        return s.trim().parse::<f64>().ok();
    }
    None
}

// ──────────────────────────── Edit Fields ─────────────────────────────

/// `edit_fields` — adds, overwrites or removes fields on every item.
///
/// `set_fields` is a JSON object whose values are templates, so
/// `{ "total": "{{ $json.price * $json.qty }}" }` computes a field. Fields
/// listed in `keep_only` (comma-separated) are the only ones retained, which
/// also covers n8n's "Remove Fields" use case.
pub fn run_edit_fields(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let set_raw = data.get("set_fields").and_then(|v| v.as_str()).unwrap_or("");

    // Parse the field map once. Values are evaluated per item.
    let field_map: serde_json::Map<String, Value> = if set_raw.trim().is_empty() {
        serde_json::Map::new()
    } else {
        match serde_json::from_str::<Value>(set_raw.trim()) {
            Ok(Value::Object(m)) => m,
            Ok(_) => return Err("set_fields debe ser un objeto JSON".into()),
            Err(e) => {
                return Err(format!(
                    "set_fields no es JSON válido: {}. Escribe un objeto como {{\"campo\": \"valor\"}}",
                    e
                ))
            }
        }
    };

    let keep_only: Vec<String> = data
        .get("keep_only")
        .and_then(|v| v.as_str())
        .map(|s| {
            s.split(',')
                .map(|f| f.trim().to_string())
                .filter(|f| !f.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let nodes = replay_helpers::get_node_outputs();
    let vars = replay_helpers::get_all_vars();

    let mut out = Vec::new();
    for item in items.iter() {
        let base = payload(item);
        let mut obj = match base {
            Value::Object(m) => m,
            // Non-object items are wrapped under "value" so fields can be added.
            other => {
                let mut m = serde_json::Map::new();
                m.insert("value".to_string(), other);
                m
            }
        };

        // 1) Apply the keep_only projection first, so removed fields cannot be
        //    referenced by the new values below.
        if !keep_only.is_empty() {
            let mut projected = serde_json::Map::new();
            for key in &keep_only {
                if let Some(v) = obj.get(key) {
                    projected.insert(key.clone(), v.clone());
                }
            }
            obj = projected;
        }

        // 2) Evaluate and assign each configured field against this item.
        let single = vec![item.clone()];
        let ctx = ctx_for(&single, &nodes, &vars);
        for (k, v) in &field_map {
            let resolved = match v {
                Value::String(s) => expressions::render(s, &ctx),
                other => other.clone(),
            };
            obj.insert(k.clone(), resolved);
        }

        out.push(wrap(Value::Object(obj)));
    }
    Ok(out)
}

// ──────────────────────────── Date & Time ─────────────────────────────

/// `date_time` — date arithmetic on a field or the current time.
///
/// `operation`:
///   - `format`   (default): rewrite `field` using `format` (chrono strftime)
///   - `add`:     add `amount` `unit` (seconds/minutes/hours/days/weeks/months)
///   - `subtract`: same, backwards
///   - `diff`:    `result_field` = difference between `field` and `compare_to`
///                in the given `unit`
///   - `now`:     write the current timestamp into `result_field`
pub fn run_date_time(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    use chrono::{DateTime, Datelike, Duration, FixedOffset, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};

    let operation = data
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("format")
        .to_lowercase();
    let field = cfg_str(data, "field");
    let result_field = data
        .get("result_field")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(field.as_str())
        .to_string();
    let fmt = data
        .get("format")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("%Y-%m-%d %H:%M:%S")
        .to_string();
    let unit = data.get("unit").and_then(|v| v.as_str()).unwrap_or("days").to_string();
    let amount: i64 = data
        .get("amount")
        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())))
        .unwrap_or(0);

    let parse_dt = |s: &str| -> Option<DateTime<FixedOffset>> {
        let s = s.trim();
        if s.is_empty() {
            return None;
        }
        // RFC 3339 / ISO 8601 with offset.
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return Some(dt);
        }
        // Naive ISO forms, assumed UTC.
        for pattern in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"] {
            if let Ok(naive) = NaiveDateTime::parse_from_str(s, pattern) {
                return Some(Utc.from_utc_datetime(&naive).fixed_offset());
            }
            if let Ok(d) = NaiveDate::parse_from_str(s, pattern) {
                return Some(Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0)?).fixed_offset());
            }
        }
        // Unix seconds.
        if let Ok(secs) = s.parse::<i64>() {
            return Utc.timestamp_opt(secs, 0).single().map(|d| d.fixed_offset());
        }
        None
    };

    let shift = |dt: DateTime<FixedOffset>, sign: i64| -> DateTime<FixedOffset> {
        let signed = amount * sign;
        match unit.to_lowercase().as_str() {
            "seconds" | "second" | "secs" => dt + Duration::seconds(signed),
            "minutes" | "minute" | "mins" => dt + Duration::minutes(signed),
            "hours" | "hour" => dt + Duration::hours(signed),
            "weeks" | "week" => dt + Duration::weeks(signed),
            "months" | "month" => {
                // Month math is calendar-aware: clamp the day to the target
                // month's length (e.g. Jan 31 + 1 month -> Feb 28/29).
                let mut y = dt.year();
                let mut m = dt.month() as i64 + signed;
                while m > 12 {
                    m -= 12;
                    y += 1;
                }
                while m < 1 {
                    m += 12;
                    y -= 1;
                }
                let last_day = days_in_month(y, m as u32);
                let day = dt.day().min(last_day);
                match make_fixed(dt.offset().local_minus_utc(), y, m as u32, day, dt.hour(), dt.minute(), dt.second()) {
                    Some(v) => v,
                    None => dt,
                }
            }
            "years" | "year" => {
                let y = dt.year() + signed as i32;
                match make_fixed(dt.offset().local_minus_utc(), y, dt.month(), dt.day(), dt.hour(), dt.minute(), dt.second()) {
                    Some(v) => v,
                    None => dt,
                }
            }
            // Default to days.
            _ => dt + Duration::days(signed),
        }
    };

    let diff_units = |a: DateTime<FixedOffset>, b: DateTime<FixedOffset>| -> f64 {
        let secs = (a.timestamp() - b.timestamp()) as f64;
        match unit.to_lowercase().as_str() {
            "seconds" | "second" | "secs" => secs,
            "minutes" | "minute" | "mins" => secs / 60.0,
            "hours" | "hour" => secs / 3600.0,
            "weeks" | "week" => secs / 604_800.0,
            "months" | "month" => secs / 2_592_000.0,
            "years" | "year" => secs / 31_536_000.0,
            _ => secs / 86_400.0,
        }
    };

    let mut out = Vec::new();
    for item in items.iter() {
        let mut obj = match payload(item) {
            Value::Object(m) => m,
            other => {
                let mut m = serde_json::Map::new();
                m.insert("value".to_string(), other);
                m
            }
        };

        match operation.as_str() {
            "now" => {
                let now = Local::now().fixed_offset();
                let key = if result_field.is_empty() { "now".to_string() } else { result_field.clone() };
                obj.insert(key, Value::String(now.format(&fmt).to_string()));
            }
            "add" | "subtract" => {
                let raw = expressions::stringify(&expressions::get_path(&Value::Object(obj.clone()), &field));
                if let Some(dt) = parse_dt(&raw) {
                    let sign = if operation == "add" { 1 } else { -1 };
                    let shifted = shift(dt, sign);
                    let key = if result_field.is_empty() { field.clone() } else { result_field.clone() };
                    obj.insert(key, Value::String(shifted.format(&fmt).to_string()));
                }
                // Unparseable input is left untouched rather than corrupted.
            }
            "diff" => {
                let lhs_raw = expressions::stringify(&expressions::get_path(&Value::Object(obj.clone()), &field));
                let rhs_raw = cfg_str(data, "compare_to");
                if let (Some(a), Some(b)) = (parse_dt(&lhs_raw), parse_dt(&rhs_raw)) {
                    let key = if result_field.is_empty() { "diff".to_string() } else { result_field.clone() };
                    obj.insert(key, expressions::num_from_f64(diff_units(a, b)));
                }
            }
            // "format" and anything unknown.
            _ => {
                let raw = expressions::stringify(&expressions::get_path(&Value::Object(obj.clone()), &field));
                if let Some(dt) = parse_dt(&raw) {
                    let key = if result_field.is_empty() { field.clone() } else { result_field.clone() };
                    obj.insert(key, Value::String(dt.format(&fmt).to_string()));
                }
            }
        }

        out.push(wrap(Value::Object(obj)));
    }
    Ok(out)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn make_fixed(
    offset_secs: i32,
    y: i32,
    m: u32,
    d: u32,
    hh: u32,
    mm: u32,
    ss: u32,
) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    use chrono::{FixedOffset, TimeZone};
    let offset = FixedOffset::east_opt(offset_secs)?;
    offset
        .with_ymd_and_hms(y, m, d, hh, mm, ss)
        .single()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn items() -> Vec<Value> {
        vec![
            json!({ "json": { "name": "ana", "age": 30, "city": "Madrid" } }),
            json!({ "json": { "name": "luis", "age": 25, "city": "Bogota" } }),
            json!({ "json": { "name": "mia", "age": 35, "city": "Madrid" } }),
        ]
    }

    fn names(v: &[Value]) -> Vec<String> {
        v.iter()
            .map(|i| {
                payload(i)
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string()
            })
            .collect()
    }

    #[test]
    fn filter_keeps_matching_items() {
        let data = json!({ "condition": "{{ $json.age }} > 26" });
        let out = run_filter(&data, items()).unwrap();
        assert_eq!(names(&out), vec!["ana", "mia"]);
    }

    #[test]
    fn filter_discard_mode_inverts() {
        let data = json!({ "condition": "{{ $json.age }} > 26", "mode": "discard" });
        let out = run_filter(&data, items()).unwrap();
        assert_eq!(names(&out), vec!["luis"]);
    }

    #[test]
    fn sort_ascending_and_descending() {
        let asc = run_sort(&json!({ "fields": "age" }), items()).unwrap();
        assert_eq!(names(&asc), vec!["luis", "ana", "mia"]);

        let desc = run_sort(&json!({ "fields": "-age" }), items()).unwrap();
        assert_eq!(names(&desc), vec!["mia", "ana", "luis"]);
    }

    #[test]
    fn sort_is_stable_across_keys() {
        // Sort by city asc, then age asc within each city.
        let out = run_sort(&json!({ "fields": "city,age" }), items()).unwrap();
        assert_eq!(names(&out), vec!["luis", "ana", "mia"]);
    }

    #[test]
    fn sort_nulls_sink_to_the_end() {
        let data = vec![
            json!({ "json": { "n": 5 } }),
            json!({ "json": { "n": null } }),
            json!({ "json": { "n": 1 } }),
        ];
        let out = run_sort(&json!({ "fields": "n" }), data).unwrap();
        let vals: Vec<Value> = out.iter().map(|i| payload(i).get("n").cloned().unwrap()).collect();
        assert_eq!(vals[0], json!(1));
        assert_eq!(vals[1], json!(5));
        assert_eq!(vals[2], Value::Null);
    }

    #[test]
    fn limit_skips_then_takes() {
        let out = run_limit(&json!({ "skip": 1, "max_items": 1 }), items()).unwrap();
        assert_eq!(names(&out), vec!["luis"]);
    }

    #[test]
    fn aggregate_count_and_sum() {
        let count = run_aggregate(&json!({ "mode": "count" }), items()).unwrap();
        assert_eq!(payload(&count[0]), json!({ "count": 3 }));

        let sum = run_aggregate(&json!({ "mode": "sum", "field": "age" }), items()).unwrap();
        assert_eq!(payload(&sum[0]), json!({ "value": 90 }));
    }

    #[test]
    fn aggregate_collect_and_average() {
        let collected = run_aggregate(&json!({ "mode": "collect", "field": "name" }), items()).unwrap();
        assert_eq!(payload(&collected[0]), json!({ "data": ["ana", "luis", "mia"] }));

        let avg = run_aggregate(&json!({ "mode": "average", "field": "age" }), items()).unwrap();
        assert_eq!(payload(&avg[0]), json!({ "value": 30 }));
    }

    #[test]
    fn edit_fields_sets_and_computes() {
        let data = json!({
            "set_fields": "{\"label\": \"{{ $json.name }} ({{ $json.age }})\", \"next_age\": \"{{ $json.age + 1 }}\"}"
        });
        let out = run_edit_fields(&data, items()).unwrap();
        let first = payload(&out[0]);
        assert_eq!(first.get("label").unwrap(), &json!("ana (30)"));
        assert_eq!(first.get("next_age").unwrap(), &json!(31));
        // Original fields survive.
        assert_eq!(first.get("city").unwrap(), &json!("Madrid"));
    }

    #[test]
    fn edit_fields_keep_only_projects() {
        let data = json!({ "set_fields": "{}", "keep_only": "name,city" });
        let out = run_edit_fields(&data, items()).unwrap();
        let first = payload(&out[0]);
        assert!(first.get("name").is_some());
        assert!(first.get("city").is_some());
        assert!(first.get("age").is_none());
    }

    #[test]
    fn edit_fields_rejects_bad_json() {
        let data = json!({ "set_fields": "no soy json" });
        assert!(run_edit_fields(&data, items()).is_err());
    }

    #[test]
    fn date_time_format_iso_input() {
        let data_vec = vec![json!({ "json": { "when": "2026-03-01T10:30:00Z" } })];
        let out = run_date_time(&json!({ "operation": "format", "field": "when", "format": "%Y/%m/%d" }), data_vec).unwrap();
        assert_eq!(payload(&out[0]).get("when").unwrap(), &json!("2026/03/01"));
    }

    #[test]
    fn date_time_add_days() {
        let data_vec = vec![json!({ "json": { "when": "2026-03-01T00:00:00Z" } })];
        let out = run_date_time(
            &json!({ "operation": "add", "field": "when", "amount": 2, "unit": "days", "format": "%Y-%m-%d" }),
            data_vec,
        )
        .unwrap();
        assert_eq!(payload(&out[0]).get("when").unwrap(), &json!("2026-03-03"));
    }

    #[test]
    fn date_time_add_month_clamps_day() {
        // Jan 31 + 1 month must not overflow into March.
        let data_vec = vec![json!({ "json": { "when": "2026-01-31T00:00:00Z" } })];
        let out = run_date_time(
            &json!({ "operation": "add", "field": "when", "amount": 1, "unit": "months", "format": "%Y-%m-%d" }),
            data_vec,
        )
        .unwrap();
        assert_eq!(payload(&out[0]).get("when").unwrap(), &json!("2026-02-28"));
    }

    #[test]
    fn date_time_diff_in_days() {
        let data_vec = vec![json!({ "json": { "end": "2026-03-10T00:00:00Z" } })];
        let out = run_date_time(
            &json!({
                "operation": "diff",
                "field": "end",
                "compare_to": "2026-03-01T00:00:00Z",
                "unit": "days",
                "result_field": "days"
            }),
            data_vec,
        )
        .unwrap();
        assert_eq!(payload(&out[0]).get("days").unwrap(), &json!(9));
    }

    #[test]
    fn unparseable_dates_are_left_alone() {
        let data_vec = vec![json!({ "json": { "when": "not a date" } })];
        let out = run_date_time(&json!({ "operation": "format", "field": "when" }), data_vec).unwrap();
        assert_eq!(payload(&out[0]).get("when").unwrap(), &json!("not a date"));
    }

    // ────────────────────────── Fase 4 ───────────────────────────

    #[test]
    fn remove_duplicates_on_single_field_keeps_first() {
        // "city" repeats Madrid: only the first Madrid item survives.
        let out = run_remove_duplicates(&json!({ "fields": "city" }), items()).unwrap();
        assert_eq!(names(&out), vec!["ana", "luis"]);
    }

    #[test]
    fn remove_duplicates_keep_last_replaces_value_in_place() {
        // keep=last must swap the *content* of the Madrid slot but not move it.
        let out = run_remove_duplicates(&json!({ "fields": "city", "keep": "last" }), items()).unwrap();
        assert_eq!(names(&out), vec!["mia", "luis"]);
    }

    #[test]
    fn remove_duplicates_multi_field_key() {
        let data_vec = vec![
            json!({ "json": { "a": 1, "b": 1, "n": "x" } }),
            json!({ "json": { "a": 1, "b": 2, "n": "y" } }),
            json!({ "json": { "a": 1, "b": 1, "n": "z" } }),
        ];
        let out = run_remove_duplicates(&json!({ "fields": "a, b" }), data_vec).unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(out[0]["json"]["n"], "x");
    }

    #[test]
    fn remove_duplicates_without_fields_dedupes_exact_payloads() {
        let data_vec = vec![
            json!({ "json": { "a": 1 } }),
            json!({ "json": { "a": 1 } }),
            json!({ "json": { "a": 2 } }),
        ];
        let out = run_remove_duplicates(&json!({}), data_vec).unwrap();
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn remove_duplicates_keeps_order_with_multiple_groups() {
        let data_vec = vec![
            json!({ "json": { "k": "b", "n": 1 } }),
            json!({ "json": { "k": "a", "n": 2 } }),
            json!({ "json": { "k": "b", "n": 3 } }),
            json!({ "json": { "k": "a", "n": 4 } }),
        ];
        let out = run_remove_duplicates(&json!({ "fields": "k", "keep": "last" }), data_vec).unwrap();
        // Order follows first appearance: b then a.
        assert_eq!(out[0]["json"]["n"], 3);
        assert_eq!(out[1]["json"]["n"], 4);
    }

    fn current_items() -> Vec<Value> {
        vec![
            json!({ "json": { "id": 1, "total": 10 } }),
            json!({ "json": { "id": 2, "total": 20 } }),
            json!({ "json": { "id": 4, "total": 40 } }),
        ]
    }

    #[test]
    fn compare_datasets_requires_compare_with() {
        let err = run_compare_datasets(&json!({ "key": "id" }), current_items()).unwrap_err();
        assert!(err.contains("compare_with"), "error inesperado: {}", err);
    }

    #[test]
    fn compare_datasets_requires_key() {
        let data = json!({ "compare_with": "[{\"id\":1}]" });
        let err = run_compare_datasets(&data, current_items()).unwrap_err();
        assert!(err.contains("key"), "error inesperado: {}", err);
    }

    #[test]
    fn compare_datasets_all_mode_tags_every_change() {
        // Previous list: id 1 (same), id 2 (total differs), id 3 (gone).
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10},{\"id\":2,\"total\":99},{\"id\":3,\"total\":30}]",
            "key": "id",
            "mode": "all",
        });
        let out = run_compare_datasets(&data, current_items()).unwrap();
        let kinds: Vec<String> = out
            .iter()
            .map(|o| payload(o)["change_type"].as_str().unwrap_or("").to_string())
            .collect();
        assert!(kinds.contains(&"added".to_string()), "kinds: {:?}", kinds);
        assert!(kinds.contains(&"changed".to_string()), "kinds: {:?}", kinds);
        assert!(kinds.contains(&"removed".to_string()), "kinds: {:?}", kinds);
        assert!(kinds.contains(&"same".to_string()), "kinds: {:?}", kinds);
        assert_eq!(out.len(), 4);
    }

    #[test]
    fn compare_datasets_added_mode_only_emits_new_keys() {
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10}]",
            "key": "id",
            "mode": "added",
        });
        let out = run_compare_datasets(&data, current_items()).unwrap();
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|o| payload(o)["change_type"] == "added"));
        // Keys are stringified, so numeric ids come back as "2" / "4".
        let keys: Vec<String> = out
            .iter()
            .map(|o| payload(o)["key"].as_str().unwrap_or("").to_string())
            .collect();
        assert_eq!(keys, vec!["2", "4"]);
    }

    #[test]
    fn compare_datasets_removed_mode_only_emits_missing_keys() {
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10},{\"id\":9,\"total\":90}]",
            "key": "id",
            "mode": "removed",
        });
        let out = run_compare_datasets(&data, current_items()).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(payload(&out[0])["change_type"], "removed");
        assert_eq!(payload(&out[0])["key"], "9");
        assert!(payload(&out[0])["current"].is_null());
    }

    #[test]
    fn compare_datasets_changed_mode_uses_selected_fields_only() {
        // Only "total" is compared, so the extra "note" field is irrelevant.
        let incoming = vec![json!({ "json": { "id": 1, "total": 10, "note": "nuevo" } })];
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10,\"note\":\"viejo\"}]",
            "key": "id",
            "compare_fields": "total",
            "mode": "changed",
        });
        let out = run_compare_datasets(&data, incoming).unwrap();
        assert!(out.is_empty(), "no debería haber cambios: {:?}", out);
    }

    #[test]
    fn compare_datasets_deep_equality_when_no_fields_selected() {
        let incoming = vec![json!({ "json": { "id": 1, "total": 10, "note": "nuevo" } })];
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10,\"note\":\"viejo\"}]",
            "key": "id",
            "mode": "changed",
        });
        let out = run_compare_datasets(&data, incoming).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(payload(&out[0])["change_type"], "changed");
        assert_eq!(payload(&out[0])["previous"]["note"], "viejo");
        assert_eq!(payload(&out[0])["current"]["note"], "nuevo");
    }

    #[test]
    fn compare_datasets_same_mode_emits_untouched_items() {
        let data = json!({
            "compare_with": "[{\"id\":1,\"total\":10},{\"id\":2,\"total\":20}]",
            "key": "id",
            "mode": "same",
        });
        let out = run_compare_datasets(&data, current_items()).unwrap();
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|o| payload(o)["change_type"] == "same"));
    }

    #[test]
    fn compare_datasets_accepts_line_separated_fallback() {
        // Not JSON: falls back to line-separated string items.
        let incoming = vec![json!({ "json": { "id": "a" } })];
        let data = json!({
            "compare_with": "a\nb",
            "key": "id",
            "mode": "removed",
        });
        let out = run_compare_datasets(&data, incoming).unwrap();
        // "a" is present on both sides, so the only difference is "b".
        assert_eq!(out.len(), 1);
        assert_eq!(payload(&out[0])["key"], "b");
        assert_eq!(payload(&out[0])["change_type"], "removed");
    }
}
