use super::context::{current_payload, num, unwrap_item, ExprContext};
use chrono::Local;
use serde_json::{Map, Value};

/// Resolves `$json...`, `$node...`, `$items...`, `$now`, `$index`, `$credentials` and `$('NodeName')`.
pub fn resolve_dollar(token: &str, ctx: &ExprContext) -> Option<Value> {
    // ── Modern n8n v1+ syntax: $('NodeName').item.json.field ──
    if token.starts_with("$('") || token.starts_with("$(\"") {
        return resolve_modern_node(token, ctx);
    }

    // ── Built-in globals ──
    match token {
        "$now" => return Some(Value::String(Local::now().to_rfc3339())),
        "$today" => return Some(Value::String(Local::now().format("%Y-%m-%d").to_string())),
        "$timestamp" => return Some(num(Local::now().timestamp_millis() as f64)),
        "$index" => return Some(num(ctx.item_index as f64)),
        "$runIndex" => return Some(num(ctx.run_index as f64)),
        "$execution" => {
            let mut m = Map::new();
            m.insert("id".into(), Value::String(ctx.execution_id.to_string()));
            return Some(Value::Object(m));
        }
        "$items" => return Some(Value::Array(ctx.items.to_vec())),
        _ => {}
    }

    // ── $execution.id ──
    if let Some(rest) = token.strip_prefix("$execution.") {
        if rest == "id" {
            return Some(Value::String(ctx.execution_id.to_string()));
        }
    }

    // ── $json[...] / $json.field ──
    if token == "$json" || token == "$item" {
        return Some(current_payload(ctx));
    }
    if let Some(rest) = token.strip_prefix("$json").or_else(|| token.strip_prefix("$item")) {
        let payload = current_payload(ctx);
        return Some(get_path(&payload, rest));
    }

    // ── $node["Name"].json.field ──
    if let Some(rest) = token.strip_prefix("$node") {
        return resolve_node_ref(rest, ctx);
    }

    // ── $credentials.field ──
    if token == "$credentials" {
        return Some(ctx.credentials.cloned().unwrap_or(Value::Null));
    }
    if let Some(rest) = token.strip_prefix("$credentials.") {
        return Some(match ctx.credentials {
            Some(data) => get_path(data, &format!(".{}", rest)),
            None => Value::Null,
        });
    }

    // ── $vars passthrough ──
    if let Some(rest) = token.strip_prefix("$vars.") {
        return ctx.variables.get(rest).map(|v| Value::String(v.clone()));
    }

    // ── $input... (n8n v1+ input references) ──
    if token == "$input" {
        return Some(Value::Array(ctx.items.to_vec()));
    }
    if let Some(rest) = token.strip_prefix("$input") {
        if rest == ".all()" || rest == ".all" {
            return Some(Value::Array(ctx.items.to_vec()));
        }
        if let Some(tail) = rest.strip_prefix(".first()") {
            let first = ctx.items.first().cloned().unwrap_or(Value::Null);
            return Some(resolve_item_tail(&first, tail));
        }
        if let Some(tail) = rest.strip_prefix(".last()") {
            let last = ctx.items.last().cloned().unwrap_or(Value::Null);
            return Some(resolve_item_tail(&last, tail));
        }
        if let Some(tail) = rest.strip_prefix(".item") {
            let item = ctx.current_item().cloned().unwrap_or(Value::Null);
            return Some(resolve_item_tail(&item, tail));
        }
        if let Some(tail) = rest.strip_prefix(".params") {
            let p_name = tail.trim_start_matches('.');
            return ctx.variables.get(p_name).map(|v| Value::String(v.clone()));
        }
        let item = ctx.current_item().cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&item, rest));
    }

    // ── $env.VAR or $env["VAR"] ──
    if let Some(rest) = token.strip_prefix("$env") {
        let name = rest.trim_start_matches('.').trim_matches(|c| c == '[' || c == ']' || c == '"' || c == '\'');
        if !name.is_empty() {
            return Some(std::env::var(name).map(Value::String).unwrap_or(Value::Null));
        }
    }

    // ── $parameter.VAR or $parameter["VAR"] ──
    if let Some(rest) = token.strip_prefix("$parameter") {
        let name = rest.trim_start_matches('.').trim_matches(|c| c == '[' || c == ']' || c == '"' || c == '\'');
        if let Some(v) = ctx.variables.get(name) {
            return Some(Value::String(v.clone()));
        }
    }

    // ── $workflow.id / $workflow.name ──
    if let Some(rest) = token.strip_prefix("$workflow.") {
        if rest == "id" || rest == "name" {
            return Some(Value::String(ctx.execution_id.to_string()));
        }
    }

    None
}

/// Resolves modern n8n v1+ node references: `$('NodeName').item.json.field`
pub fn resolve_modern_node(token: &str, ctx: &ExprContext) -> Option<Value> {
    if !token.starts_with("$('") && !token.starts_with("$(\"") {
        return None;
    }
    let quote_char = if token.starts_with("$('") { '\'' } else { '"' };
    let after_prefix = &token[3..];
    let close_quote_idx = after_prefix.find(quote_char)?;
    let node_name = &after_prefix[..close_quote_idx];

    let after_quote = &after_prefix[close_quote_idx + 1..];
    let after_paren = after_quote.strip_prefix(')')?;

    let items_opt = ctx.lookup_node(node_name);

    if after_paren.is_empty() {
        return Some(match items_opt {
            Some(list) => Value::Array(list.clone()),
            None => Value::Null,
        });
    }

    if let Some(rest) = after_paren.strip_prefix(".all()") {
        let all_items = items_opt.cloned().unwrap_or_default();
        if rest.is_empty() {
            return Some(Value::Array(all_items));
        }
        return Some(get_path(&Value::Array(all_items), rest));
    }

    if let Some(rest) = after_paren.strip_prefix(".first()") {
        let first_item = items_opt.and_then(|l| l.first()).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&first_item, rest));
    }

    if let Some(rest) = after_paren.strip_prefix(".last()") {
        let last_item = items_opt.and_then(|l| l.last()).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&last_item, rest));
    }

    if let Some(rest) = after_paren.strip_prefix(".item") {
        let item = match items_opt {
            Some(l) => l.get(ctx.item_index).or_else(|| l.first()).cloned().unwrap_or(Value::Null),
            None => Value::Null,
        };
        return Some(resolve_item_tail(&item, rest));
    }

    if let Some(rest) = after_paren.strip_prefix(".json") {
        let item = match items_opt {
            Some(l) => l.get(ctx.item_index).or_else(|| l.first()).cloned().unwrap_or(Value::Null),
            None => Value::Null,
        };
        let unwrapped = unwrap_item(&item);
        if rest.is_empty() {
            return Some(unwrapped);
        }
        return Some(get_path(&unwrapped, rest));
    }

    let item = match items_opt {
        Some(l) => l.get(ctx.item_index).or_else(|| l.first()).cloned().unwrap_or(Value::Null),
        None => Value::Null,
    };
    Some(resolve_item_tail(&item, after_paren))
}

fn resolve_item_tail(item: &Value, tail: &str) -> Value {
    if tail.is_empty() {
        return unwrap_item(item);
    }
    if let Some(rest) = tail.strip_prefix(".json") {
        let unwrapped = unwrap_item(item);
        if rest.is_empty() {
            return unwrapped;
        }
        return get_path(&unwrapped, rest);
    }
    if tail.starts_with(".binary") {
        return item.get("binary").cloned().unwrap_or(Value::Null);
    }
    get_path(item, tail)
}

pub fn resolve_node_ref(rest: &str, ctx: &ExprContext) -> Option<Value> {
    let rest = rest.trim_start();
    if !rest.starts_with('[') {
        return None;
    }
    let close = rest.find(']')?;
    let name_raw = rest[1..close].trim();
    let name = name_raw.trim_matches(|c| c == '"' || c == '\'').to_string();
    let tail = &rest[close + 1..];

    let items = ctx.lookup_node(&name);
    if tail.starts_with(".all()") {
        return Some(Value::Array(items.cloned().unwrap_or_default()));
    }
    if let Some(rest_tail) = tail.strip_prefix(".first()") {
        let first_item = items.and_then(|l| l.first()).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&first_item, rest_tail));
    }
    if let Some(rest_tail) = tail.strip_prefix(".item") {
        let item = items.and_then(|l| l.get(ctx.item_index).or_else(|| l.first())).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&item, rest_tail));
    }

    let value = match items {
        Some(list) => match list.first() {
            Some(v) => unwrap_item(v),
            None => Value::Null,
        },
        None => return Some(Value::Null),
    };

    let tail = tail.strip_prefix(".json").unwrap_or(tail);
    if tail.is_empty() {
        return Some(value);
    }
    Some(get_path(&value, tail))
}

/// Walks a `.a.b[0].c` style path into a JSON value.
pub fn get_path(root: &Value, path: &str) -> Value {
    let mut curr = root;
    let mut rest = path.trim();
    if rest.is_empty() {
        return curr.clone();
    }
    if !rest.starts_with('.') && !rest.starts_with('[') {
        let end = rest.find(['.', '[']).unwrap_or(rest.len());
        let key = &rest[..end];
        curr = match curr.get(key) {
            Some(v) => v,
            None => return Value::Null,
        };
        rest = &rest[end..];
    }
    while !rest.is_empty() {
        if let Some(r) = rest.strip_prefix('.') {
            let end = r.find(['.', '[']).unwrap_or(r.len());
            let key = &r[..end];
            curr = match curr.get(key) {
                Some(v) => v,
                None => return Value::Null,
            };
            rest = &r[end..];
            continue;
        }
        if let Some(r) = rest.strip_prefix('[') {
            let close = match r.find(']') {
                Some(c) => c,
                None => return Value::Null,
            };
            let inner = r[..close].trim();
            let unquoted = inner.trim_matches(|c| c == '"' || c == '\'');
            if let Ok(idx) = unquoted.parse::<usize>() {
                curr = match curr.get(idx) {
                    Some(v) => v,
                    None => return Value::Null,
                };
            } else {
                curr = match curr.get(unquoted) {
                    Some(v) => v,
                    None => return Value::Null,
                };
            }
            rest = &r[close + 1..];
            continue;
        }
        break;
    }
    curr.clone()
}
