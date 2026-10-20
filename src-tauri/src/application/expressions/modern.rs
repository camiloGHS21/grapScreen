use super::context::{current_payload, num, unwrap_item, ExprContext};
use chrono::Local;
use serde_json::Value;

pub use super::path::get_path;

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
        "$execution" => return Some(serde_json::json!({ "id": ctx.execution_id })),
        "$items" => return Some(Value::Array(ctx.items.to_vec())),
        _ => {}
    }

    if token == "$execution.id" {
        return Some(Value::String(ctx.execution_id.to_string()));
    }

    if let Some(rest) = token.strip_prefix("$now.").or_else(|| token.strip_prefix("$today.")) {
        if let Some(v) = super::dates::resolve_now_prop(rest) {
            return Some(v);
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

    // ── $binary[...] / $binary.field ──
    if token == "$binary" {
        return Some(ctx.current_item().and_then(|it| it.get("binary")).cloned().unwrap_or(Value::Null));
    }
    if let Some(rest) = token.strip_prefix("$binary") {
        let bin = ctx.current_item().and_then(|it| it.get("binary")).cloned().unwrap_or(Value::Null);
        return Some(get_path(&bin, rest));
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

    // ── $prevNode ──
    if token == "$prevNode" || token.starts_with("$prevNode.") {
        let prev_name = ctx.variables.get("prevNode.name").map(|s| s.as_str()).unwrap_or("");
        if token == "$prevNode" {
            return Some(serde_json::json!({ "name": prev_name }));
        }
        if token == "$prevNode.name" {
            return Some(Value::String(prev_name.to_string()));
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

    if let Some(rest) = after_paren.strip_prefix(".itemMatching(") {
        let (idx, tail) = parse_indexed_call(rest, ctx.item_index);
        let matched = items_opt.and_then(|l| l.get(idx).or_else(|| l.first())).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&matched, &tail));
    }

    if let Some(rest) = after_paren.strip_prefix(".item(") {
        let (idx, tail) = parse_indexed_call(rest, ctx.item_index);
        let matched = items_opt.and_then(|l| l.get(idx).or_else(|| l.first())).cloned().unwrap_or(Value::Null);
        return Some(resolve_item_tail(&matched, &tail));
    }

    let item = items_opt.and_then(|l| l.get(ctx.item_index).or_else(|| l.first())).cloned().unwrap_or(Value::Null);
    if let Some(rest) = after_paren.strip_prefix(".item") {
        return Some(resolve_item_tail(&item, rest));
    }
    if let Some(rest) = after_paren.strip_prefix(".json") {
        let unwrapped = unwrap_item(&item);
        return Some(if rest.is_empty() { unwrapped } else { get_path(&unwrapped, rest) });
    }
    if let Some(rest) = after_paren.strip_prefix(".binary") {
        let bin = item.get("binary").cloned().unwrap_or(Value::Null);
        return Some(if rest.is_empty() { bin } else { get_path(&bin, rest) });
    }
    Some(resolve_item_tail(&item, after_paren))
}

fn resolve_item_tail(item: &Value, tail: &str) -> Value {
    if tail.is_empty() {
        return unwrap_item(item);
    }
    if let Some(rest) = tail.strip_prefix(".json") {
        let unwrapped = unwrap_item(item);
        return if rest.is_empty() { unwrapped } else { get_path(&unwrapped, rest) };
    }
    if let Some(rest) = tail.strip_prefix(".binary") {
        let bin = item.get("binary").cloned().unwrap_or(Value::Null);
        return if rest.is_empty() { bin } else { get_path(&bin, rest) };
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

fn parse_indexed_call(rest: &str, fallback: usize) -> (usize, String) {
    if let Some(close) = rest.find(')') {
        let arg = rest[..close].trim();
        let idx = arg.parse::<usize>().unwrap_or(fallback);
        let tail = rest[close + 1..].to_string();
        (idx, tail)
    } else {
        (fallback, rest.to_string())
    }
}

