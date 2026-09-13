//! n8n-style expression engine.
//!
//! Evaluates `{{ ... }}` expressions against the current execution context,
//! preserving JSON types instead of flattening everything to strings.
//!
//! Supported surface (mirrors n8n where it makes sense):
//!
//! ```text
//! {{ $json.field }}                  current item's field (dot + [n] paths)
//! {{ $json["field with spaces"] }}   bracket syntax
//! {{ $items() }}                     all items of the current node
//! {{ $items("Node") }}               all items of a named node
//! {{ $node["HTTP Request"].json.id }}  a previous node's output
//! {{ $node["Code"]["json"]["x"] }}
//! {{ $now }} / {{ $today }}          ISO timestamps
//! {{ $index }} / {{ $runIndex }}     current item / run position
//! {{ $execution.id }}                execution id
//!
//! {{ 1 + 2 }}                        arithmetic: + - * / %
//! {{ $json.price * 1.21 }}           mixed expressions
//! {{ $json.a == $json.b }}           comparison -> boolean
//! {{ $json.name.toUpperCase() }}     a few string helpers
//! ```
//!
//! Anything that cannot be resolved is left verbatim in the output so the user
//! can see what failed instead of silently getting an empty string.

use chrono::Local;
use serde_json::{Map, Value};
use std::collections::HashMap;

/// Read-only view of the execution state an expression can reference.
pub struct ExprContext<'a> {
    /// Items flowing into the current node.
    pub items: &'a [Value],
    /// Index of the item currently being processed (0 for non item-based nodes).
    pub item_index: usize,
    /// Index of the current run (loop / batch iteration).
    pub run_index: usize,
    /// Output items produced so far, keyed by node id AND node label.
    pub node_outputs: &'a HashMap<String, Vec<Value>>,
    /// Flat string variables (legacy `set_var` store).
    pub variables: &'a HashMap<String, String>,
    /// Execution id, when known.
    pub execution_id: &'a str,
    /// Data of the credential attached to the running node, when it has one.
    /// Exposed as `{{ $credentials.field }}` so secrets never have to be typed
    /// into the node config.
    pub credentials: Option<&'a Value>,
}

impl<'a> ExprContext<'a> {
    /// Current item, i.e. what `$json` resolves to.
    pub fn current_item(&self) -> Option<&Value> {
        self.items.get(self.item_index).or_else(|| self.items.first())
    }

    fn lookup_node(&self, name: &str) -> Option<&Vec<Value>> {
        self.node_outputs.get(name)
    }
}

/// Unwraps the `{ "json": ... }` envelope n8n items carry.
pub fn unwrap_item(item: &Value) -> Value {
    item.get("json").cloned().unwrap_or_else(|| item.clone())
}

/// The payload of the item currently being processed.
fn current_payload(ctx: &ExprContext) -> Value {
    ctx.current_item().map(unwrap_item).unwrap_or(Value::Null)
}

/// Returns true when the string contains at least one complete `{{ ... }}`.
pub fn contains_expression(input: &str) -> bool {
    let bytes = input.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = find_close(input, i + 2) {
                let _ = end;
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Finds the index of the closing `}}` starting the search at `from`.
fn find_close(input: &str, from: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut i = from;
    let mut in_string: Option<u8> = None;
    while i + 1 < bytes.len() {
        let c = bytes[i];
        match in_string {
            Some(q) => {
                if c == b'\\' {
                    i += 2;
                    continue;
                }
                if c == q {
                    in_string = None;
                }
            }
            None => {
                if c == b'"' || c == b'\'' {
                    in_string = Some(c);
                } else if c == b'}' && bytes[i + 1] == b'}' {
                    return Some(i);
                }
            }
        }
        i += 1;
    }
    None
}

/// Splits `input` into literal chunks and expression chunks.
fn segments(input: &str) -> Vec<Segment<'_>> {
    let mut out = Vec::new();
    let mut cursor = 0;
    let mut i = 0;
    let bytes = input.as_bytes();
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = find_close(input, i + 2) {
                if i > cursor {
                    out.push(Segment::Literal(&input[cursor..i]));
                }
                out.push(Segment::Expr(input[i + 2..end].trim()));
                i = end + 2;
                cursor = i;
                continue;
            }
        }
        i += 1;
    }
    if cursor < input.len() {
        out.push(Segment::Literal(&input[cursor..]));
    }
    out
}

enum Segment<'a> {
    Literal(&'a str),
    Expr(&'a str),
}

/// Interpolates `input`, keeping the JSON type when the whole string is a
/// single expression. `{{ $json.count }}` becomes a number, not "42".
pub fn render(input: &str, ctx: &ExprContext) -> Value {
    let parts = segments(input);
    if parts.is_empty() {
        return Value::String(String::new());
    }

    // Fast path: the input is exactly one expression -> keep its native type.
    if parts.len() == 1 {
        if let Segment::Expr(e) = parts[0] {
            return eval(e, ctx);
        }
    }

    // Mixed content -> string concatenation.
    let mut out = String::new();
    let mut saw_expr = false;
    for part in parts {
        match part {
            Segment::Literal(l) => out.push_str(l),
            Segment::Expr(e) => {
                saw_expr = true;
                out.push_str(&stringify(&eval(e, ctx)));
            }
        }
    }
    // A string with no expressions at all is returned as-is.
    let _ = saw_expr;
    Value::String(out)
}

/// Convenience: render and force to string.
pub fn render_string(input: &str, ctx: &ExprContext) -> String {
    stringify(&render(input, ctx))
}

/// Renders a `Value` to the string form used when concatenating.
pub fn stringify(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

/// Evaluates a single expression body (without the surrounding `{{ }}`).
pub fn eval(expr: &str, ctx: &ExprContext) -> Value {
    let expr = expr.trim();
    if expr.is_empty() {
        return Value::String(String::new());
    }

    // 1) Comparison / logical operators produce booleans.
    if let Some(v) = try_logical(expr, ctx) {
        return v;
    }
    // 2) Arithmetic.
    if let Some(v) = try_arithmetic(expr, ctx) {
        return v;
    }
    // 3) A single token: resolve it (path, function or literal).
    resolve_token(expr, ctx)
}

// ─────────────────────────── logical operators ───────────────────────────

const LOGIC_OPS: &[&str] = &[" == ", " != ", " >= ", " <= ", " && ", " || ", " > ", " < "];

fn try_logical(expr: &str, ctx: &ExprContext) -> Option<Value> {
    // `&&` / `||` first, lowest precedence.
    for op in [" || ", " && "] {
        if let Some(pos) = find_top_level(expr, op) {
            let lhs = eval(&expr[..pos], ctx);
            if op == " || " {
                if truthy(&lhs) {
                    return Some(Value::Bool(true));
                }
                return Some(Value::Bool(truthy(&eval(&expr[pos + op.len()..], ctx))));
            } else {
                if !truthy(&lhs) {
                    return Some(Value::Bool(false));
                }
                return Some(Value::Bool(truthy(&eval(&expr[pos + op.len()..], ctx))));
            }
        }
    }

    for op in [" == ", " != ", " >= ", " <= ", " > ", " < "] {
        if let Some(pos) = find_top_level(expr, op) {
            let lhs = eval(&expr[..pos], ctx);
            let rhs = eval(&expr[pos + op.len()..], ctx);
            return Some(Value::Bool(compare(&lhs, &rhs, op.trim())));
        }
    }
    None
}

/// Finds `needle` outside of quotes and outside nested parentheses.
fn find_top_level(haystack: &str, needle: &str) -> Option<usize> {
    let bytes = haystack.as_bytes();
    let nbytes = needle.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut i = 0;
    while i + nbytes.len() <= bytes.len() {
        let c = bytes[i];
        match in_string {
            Some(q) => {
                if c == b'\\' {
                    i += 2;
                    continue;
                }
                if c == q {
                    in_string = None;
                }
                i += 1;
                continue;
            }
            None => {}
        }
        if c == b'"' || c == b'\'' {
            in_string = Some(c);
            i += 1;
            continue;
        }
        if c == b'(' {
            depth += 1;
        } else if c == b')' {
            depth -= 1;
        } else if depth == 0 && &bytes[i..i + nbytes.len()] == nbytes {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn compare(lhs: &Value, rhs: &Value, op: &str) -> bool {
    match op {
        "==" => json_eq(lhs, rhs),
        "!=" => !json_eq(lhs, rhs),
        ">" | "<" | ">=" | "<=" => {
            // Numbers compare numerically, everything else as strings.
            if let (Some(a), Some(b)) = (as_f64(lhs), as_f64(rhs)) {
                return match op {
                    ">" => a > b,
                    "<" => a < b,
                    ">=" => a >= b,
                    "<=" => a <= b,
                    _ => false,
                };
            }
            let a = stringify(lhs).to_lowercase();
            let b = stringify(rhs).to_lowercase();
            match op {
                ">" => a > b,
                "<" => a < b,
                ">=" => a >= b,
                "<=" => a <= b,
                _ => false,
            }
        }
        _ => false,
    }
}

fn json_eq(a: &Value, b: &Value) -> bool {
    if let (Some(x), Some(y)) = (as_f64(a), as_f64(b)) {
        return (x - y).abs() < f64::EPSILON;
    }
    match (a, b) {
        (Value::String(x), Value::String(y)) => x == y,
        _ => a == b,
    }
}

fn as_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

/// n8n truthiness: false, 0, "", null and empty arrays/objects are falsy.
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty() && !s.eq_ignore_ascii_case("false") && s != "0",
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

/// Evaluates a whole **condition** string to a boolean.
///
/// Conditions come in two shapes and both must work:
///   1. `{{ $json.total > 100 }}` / `{{ mi_var }} < 10` — expressions, possibly
///      embedded in surrounding text, where comparisons live *outside* the
///      braces and the interpolated value must then take part in them.
///   2. `5 < 3`, `"hola" contains "mundo"` — a bare expression with no braces.
///
/// The trick for shape 1 is order: substitute each `{{ … }}` block first, then
/// evaluate the *resulting* string as an expression. Evaluating the raw string
/// would never see the comparison, and interpolating alone would leave the
/// operator unresolved.
pub fn eval_condition(input: &str, ctx: &ExprContext) -> bool {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return false;
    }

    if contains_expression(trimmed) {
        // Interpolate in place, then the substituted text is the expression.
        let substituted = render_string(trimmed, ctx);
        if substituted.trim().is_empty() {
            return false;
        }
        return truthy(&eval(&substituted, ctx));
    }

    // No braces: the whole string is the expression.
    truthy(&eval(trimmed, ctx))
}

// ─────────────────────────────── arithmetic ───────────────────────────────

fn try_arithmetic(expr: &str, ctx: &ExprContext) -> Option<Value> {
    // Lowest precedence: + and - (left to right). Then * / %.
    if let Some(pos) = find_top_level(expr, " + ") {
        let lhs = eval(&expr[..pos], ctx);
        let rhs = eval(&expr[pos + 3..], ctx);
        return Some(add(lhs, rhs));
    }
    if let Some(pos) = find_top_level(expr, " - ") {
        let lhs = as_f64(&eval(&expr[..pos], ctx))?;
        let rhs = as_f64(&eval(&expr[pos + 3..], ctx))?;
        return Some(num(lhs - rhs));
    }
    for (op, len) in [(" * ", 3), (" / ", 3), (" % ", 3)] {
        if let Some(pos) = find_top_level(expr, op) {
            let lhs = as_f64(&eval(&expr[..pos], ctx))?;
            let rhs = as_f64(&eval(&expr[pos + len..], ctx))?;
            return Some(match op {
                " * " => num(lhs * rhs),
                " / " => {
                    if rhs == 0.0 {
                        Value::Null
                    } else {
                        num(lhs / rhs)
                    }
                }
                _ => {
                    if rhs == 0.0 {
                        Value::Null
                    } else {
                        num(lhs % rhs)
                    }
                }
            });
        }
    }
    None
}

fn num(f: f64) -> Value {
    if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 {
        Value::Number(serde_json::Number::from(f as i64))
    } else {
        serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
    }
}

/// Public alias of [`num`] for modules that produce numbers outside the
/// expression grammar (aggregate sums, date differences…). Keeps whole values
/// as integers so JSON output stays clean.
pub fn num_from_f64(f: f64) -> Value {
    num(f)
}

/// `+` concatenates when either side is a non-numeric string.
fn add(lhs: Value, rhs: Value) -> Value {
    match (&lhs, &rhs) {
        (Value::Number(_), Value::Number(_)) => num(as_f64(&lhs).unwrap_or(0.0) + as_f64(&rhs).unwrap_or(0.0)),
        (Value::String(a), Value::String(b)) => {
            // Two numeric strings should still add numerically (n8n behaviour).
            if let (Ok(x), Ok(y)) = (a.trim().parse::<f64>(), b.trim().parse::<f64>()) {
                num(x + y)
            } else {
                Value::String(format!("{}{}", a, b))
            }
        }
        _ => Value::String(format!("{}{}", stringify(&lhs), stringify(&rhs))),
    }
}

// ───────────────────────────────── tokens ─────────────────────────────────

fn resolve_token(token: &str, ctx: &ExprContext) -> Value {
    let token = token.trim();
    if token.is_empty() {
        return Value::String(String::new());
    }

    // Quoted string literal.
    if (token.starts_with('"') && token.ends_with('"') && token.len() >= 2)
        || (token.starts_with('\'') && token.ends_with('\'') && token.len() >= 2)
    {
        return Value::String(token[1..token.len() - 1].to_string());
    }
    // Numeric literal.
    if let Ok(n) = token.parse::<f64>() {
        return num(n);
    }
    if token == "true" {
        return Value::Bool(true);
    }
    if token == "false" {
        return Value::Bool(false);
    }
    if token == "null" {
        return Value::Null;
    }

    // Function call?
    if let Some(paren) = token.find('(') {
        if token.ends_with(')') {
            let name = token[..paren].trim();
            let args_src = &token[paren + 1..token.len() - 1];
            if let Some(v) = call_function(name, args_src, token, ctx) {
                return v;
            }
        }
    }

    // `$json`, `$node[...]`, `$items` ... or a path into the current item.
    if let Some(v) = resolve_dollar(token, ctx) {
        return v;
    }

    // Bare identifier: legacy flat variable.
    if let Some(v) = ctx.variables.get(token) {
        return Value::String(v.clone());
    }

    // Unresolved -> keep the token visible instead of dropping it silently.
    Value::String(format!("{{{{ {} }}}}", token))
}

fn call_function(name: &str, args_src: &str, whole: &str, ctx: &ExprContext) -> Option<Value> {
    let args = split_args(args_src);
    if name == "$items" {
        let items = match args.first() {
            Some(a) => {
                let node_name = stringify(&eval(a, ctx));
                ctx.lookup_node(&node_name).cloned().unwrap_or_default()
            }
            None => ctx.items.to_vec(),
        };
        return Some(Value::Array(items));
    }

    // `value.method(...)` form: the receiver is everything before the last dot
    // that is not inside brackets/quotes, and the method is the trailing name.
    if let Some(dot) = last_top_level_dot(whole) {
        let recv = &whole[..dot];
        let method = whole[dot + 1..whole.find('(').unwrap_or(whole.len())].trim();
        if !recv.is_empty() && !method.is_empty() {
            let value = eval(recv, ctx);
            return apply_helper(&value, method, &args, ctx);
        }
    }
    None
}

/// Index of the last `.` that is outside quotes and brackets.
fn last_top_level_dot(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut last = None;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        match in_string {
            Some(q) => {
                if c == b'\\' {
                    i += 2;
                    continue;
                }
                if c == q {
                    in_string = None;
                }
            }
            None => {
                if c == b'"' || c == b'\'' {
                    in_string = Some(c);
                } else if c == b'[' || c == b'(' {
                    depth += 1;
                } else if c == b']' || c == b')' {
                    depth -= 1;
                } else if c == b'.' && depth == 0 {
                    last = Some(i);
                }
            }
        }
        i += 1;
    }
    last
}

fn apply_helper(value: &Value, method: &str, args: &[String], ctx: &ExprContext) -> Option<Value> {
    let s = stringify(value);
    match method {
        "toUpperCase" => Some(Value::String(s.to_uppercase())),
        "toLowerCase" => Some(Value::String(s.to_lowercase())),
        "trim" => Some(Value::String(s.trim().to_string())),
        "length" => Some(num(s.chars().count() as f64)),
        "includes" => {
            let needle = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_default();
            Some(Value::Bool(s.contains(&needle)))
        }
        "startsWith" => {
            let needle = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_default();
            Some(Value::Bool(s.starts_with(&needle)))
        }
        "endsWith" => {
            let needle = args.first().map(|a| stringify(&eval(a, ctx))).unwrap_or_default();
            Some(Value::Bool(s.ends_with(&needle)))
        }
        "replace" => {
            if args.len() >= 2 {
                let from = stringify(&eval(&args[0], ctx));
                let to = stringify(&eval(&args[1], ctx));
                Some(Value::String(s.replace(&from, &to)))
            } else {
                Some(Value::String(s))
            }
        }
        "toNumber" | "toFloat" => Some(num(s.trim().parse::<f64>().unwrap_or(0.0))),
        "toFixed" => {
            let digits = args.first()
                .and_then(|a| stringify(&eval(a, ctx)).parse::<usize>().ok())
                .unwrap_or(2);
            Some(Value::String(format!("{:.*}", digits, s.trim().parse::<f64>().unwrap_or(0.0))))
        }
        _ => Some(value.clone()),
    }
}

fn split_args(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut in_string: Option<char> = None;
    let mut current = String::new();
    for c in src.chars() {
        match in_string {
            Some(q) => {
                current.push(c);
                if c == q {
                    in_string = None;
                }
            }
            None => match c {
                '"' | '\'' => {
                    in_string = Some(c);
                    current.push(c);
                }
                '(' | '[' => {
                    depth += 1;
                    current.push(c);
                }
                ')' | ']' => {
                    depth -= 1;
                    current.push(c);
                }
                ',' if depth == 0 => {
                    out.push(current.trim().to_string());
                    current.clear();
                }
                _ => current.push(c),
            },
        }
    }
    if !current.trim().is_empty() {
        out.push(current.trim().to_string());
    }
    out
}

/// Resolves `$json...`, `$node...`, `$items...`, `$now`, `$index` and friends.
fn resolve_dollar(token: &str, ctx: &ExprContext) -> Option<Value> {
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
    // Items are stored as `{ "json": <payload> }`; `$json` refers to the
    // payload itself, so unwrap before walking the path.
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
    // Resolved from the vault credential attached to the running node, so
    // secrets are referenced by field name instead of being pasted into config.
    if token == "$credentials" {
        return Some(ctx.credentials.cloned().unwrap_or(Value::Null));
    }
    if let Some(rest) = token.strip_prefix("$credentials.") {
        return Some(match ctx.credentials {
            Some(data) => get_path(data, &format!(".{}", rest)),
            None => Value::Null,
        });
    }

    // ── $binary / $vars passthrough (kept for forward-compat) ──
    if let Some(rest) = token.strip_prefix("$vars.") {
        return ctx.variables.get(rest).map(|v| Value::String(v.clone()));
    }

    None
}

fn resolve_node_ref(rest: &str, ctx: &ExprContext) -> Option<Value> {
    // Expect: ["Name"] or ["Name"].json or ["Name"]["json"]["x"]
    let rest = rest.trim_start();
    if !rest.starts_with('[') {
        return None;
    }
    let close = rest.find(']')?;
    let name_raw = rest[1..close].trim();
    let name = name_raw.trim_matches(|c| c == '"' || c == '\'').to_string();
    let tail = &rest[close + 1..];

    let items = ctx.lookup_node(&name);
    let value = match items {
        Some(list) => match list.first() {
            Some(v) => unwrap_item(v),
            None => Value::Null,
        },
        None => return Some(Value::Null),
    };

    // Strip a leading `.json` since we already unwrapped it.
    let tail = tail.strip_prefix(".json").unwrap_or(tail);
    if tail.is_empty() {
        return Some(value);
    }
    Some(get_path(&value, tail))
}

/// Walks a `.a.b[0].c` style path into a JSON value.
/// Accepts both `a.b` and `["a"]["b"]` and mixed forms, with or without a
/// leading dot.
pub fn get_path(root: &Value, path: &str) -> Value {
    let mut curr = root;
    let mut rest = path.trim();
    if rest.is_empty() {
        return curr.clone();
    }
    // A bare identifier (no leading dot/bracket) is shorthand for `.ident`.
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
            // Dot access: read until the next '.' or '['
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
        // Unknown syntax: stop.
        break;
    }
    curr.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ctx_with(items: Vec<Value>) -> (HashMap<String, Vec<Value>>, HashMap<String, String>, Vec<Value>) {
        (HashMap::new(), HashMap::new(), items)
    }

    fn render_str(input: &str, items: &[Value], nodes: &HashMap<String, Vec<Value>>) -> String {
        let vars = HashMap::new();
        let ctx = ExprContext {
            items,
            item_index: 0,
            run_index: 0,
            node_outputs: nodes,
            variables: &vars,
            execution_id: "exec-1",
            credentials: None,
        };
        render_string(input, &ctx)
    }

    fn cond(input: &str, items: &[Value]) -> bool {
        let vars = HashMap::new();
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &vars,
            execution_id: "exec-cond",
            credentials: None,
        };
        eval_condition(input, &ctx)
    }

    #[test]
    fn condition_bare_expression() {
        let items: Vec<Value> = vec![];
        assert!(cond("5 > 3", &items));
        assert!(!cond("5 < 3", &items));
        assert!(cond("\"hola\" == \"hola\"", &items));
        assert!(!cond("\"hola\" == \"adios\"", &items));
    }

    #[test]
    fn condition_template_with_comparison_outside_braces() {
        // The comparison sits outside the braces and must still be evaluated
        // against the interpolated value.
        let items = vec![json!({ "json": { "total": 42 } })];
        assert!(cond("{{ $json.total }} > 10", &items));
        assert!(!cond("{{ $json.total }} < 10", &items));
        assert!(cond("{{ $json.total }} == 42", &items));
    }

    #[test]
    fn condition_template_whole_expression() {
        let items = vec![json!({ "json": { "total": 120 } })];
        assert!(cond("{{ $json.total > 100 }}", &items));
        assert!(!cond("{{ $json.total > 500 }}", &items));
        // Bare truthiness also goes through.
        assert!(cond("{{ $json.total }}", &items));
    }

    #[test]
    fn condition_legacy_variable_text() {
        // Mirrors the legacy `{{ mi_var }} < 10` path once variables exist.
        let vars: HashMap<String, String> = [("mi_var".to_string(), "42".to_string())].into_iter().collect();
        let items: Vec<Value> = vec![];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &vars,
            execution_id: "exec-var",
            credentials: None,
        };
        assert!(eval_condition("{{ mi_var }} > 10", &ctx));
        assert!(!eval_condition("{{ mi_var }} < 10", &ctx));
        assert!(eval_condition("{{ mi_var }} == 42", &ctx));
    }

    #[test]
    fn condition_empty_is_false() {
        let items: Vec<Value> = vec![];
        assert!(!cond("", &items));
        assert!(!cond("   ", &items));
    }

    #[test]
    fn json_field_preserves_type() {        let items = vec![json!({ "json": { "count": 42, "name": "ana" } })];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: None,
        };
        // Whole-string expression keeps the number type.
        assert_eq!(render("{{ $json.count }}", &ctx), json!(42));
        assert_eq!(render("{{ $json.name }}", &ctx), json!("ana"));
        // Mixed content becomes a string.
        assert_eq!(render("total: {{ $json.count }}u", &ctx), json!("total: 42u"));
    }

    #[test]
    fn arithmetic() {
        let items = vec![json!({ "json": { "price": 100 } })];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: None,
        };
        // 100 * 1.21 = 121 exactly, and whole numbers stay integers.
        assert_eq!(render("{{ $json.price * 1.21 }}", &ctx), json!(121));
        assert_eq!(render("{{ 2 + 3 }}", &ctx), json!(5));
        // A non-whole result stays a float.
        assert_eq!(render("{{ 10 / 4 }}", &ctx), json!(2.5));
    }

    #[test]
    fn comparisons() {
        let items = vec![json!({ "json": { "a": 5, "b": 3 } })];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: None,
        };
        assert_eq!(render("{{ $json.a > $json.b }}", &ctx), json!(true));
        assert_eq!(render("{{ $json.a == 5 }}", &ctx), json!(true));
    }

    #[test]
    fn node_reference() {
        let mut nodes = HashMap::new();
        nodes.insert("HTTP Request".to_string(), vec![json!({ "json": { "id": 7, "title": "hi" } })]);
        let items: Vec<Value> = vec![];
        let out = render_str("{{ $node[\"HTTP Request\"].json.id }}", &items, &nodes);
        assert_eq!(out, "7");
        let out2 = render_str("{{ $node[\"HTTP Request\"].json.title }}", &items, &nodes);
        assert_eq!(out2, "hi");
    }

    #[test]
    fn items_function() {
        let items = vec![json!({ "json": { "n": 1 } }), json!({ "json": { "n": 2 } })];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: None,
        };
        assert_eq!(render("{{ $items() }}", &ctx).as_array().unwrap().len(), 2);
    }

    #[test]
    fn credentials_token_resolves_fields() {
        let items = vec![json!({ "json": { "n": 1 } })];
        let nodes = HashMap::new();
        let cred = json!({ "api_key": "sk-123", "region": "eu" });
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: Some(&cred),
        };
        assert_eq!(render_string("Bearer {{ $credentials.api_key }}", &ctx), "Bearer sk-123");
        // Whole-string expression keeps the object intact.
        assert_eq!(render("{{ $credentials }}", &ctx), cred);
    }

    #[test]
    fn credentials_token_is_null_without_credential() {
        let items = vec![json!({ "json": { "n": 1 } })];
        let nodes = HashMap::new();
        let ctx = ExprContext {
            items: &items,
            item_index: 0,
            run_index: 0,
            node_outputs: &nodes,
            variables: &HashMap::new(),
            execution_id: "e1",
            credentials: None,
        };
        // Missing credential must not blow up the render: it degrades to empty.
        assert_eq!(render_string("{{ $credentials.api_key }}", &ctx), "");
    }

    #[test]
    fn bracket_paths() {
        let items = vec![json!({ "json": { "user": { "name": "bob" } } })];
        let nodes = HashMap::new();
        let out = render_str("{{ $json[\"user\"][\"name\"] }}", &items, &nodes);
        assert_eq!(out, "bob");
        let out2 = render_str("{{ $json.user.name }}", &items, &nodes);
        assert_eq!(out2, "bob");
    }

    #[test]
    fn string_helpers() {
        let items = vec![json!({ "json": { "name": "ana" } })];
        let nodes = HashMap::new();
        let out = render_str("{{ $json.name.toUpperCase() }}", &items, &nodes);
        assert_eq!(out, "ANA");
    }

    #[test]
    fn unresolved_is_visible() {
        let items: Vec<Value> = vec![];
        let nodes = HashMap::new();
        let out = render_str("{{ $json.missing }}", &items, &nodes);
        // No item -> resolves to null -> empty string via stringify.
        assert_eq!(out, "");
    }

    #[test]
    fn plain_string_untouched() {
        let items: Vec<Value> = vec![];
        let nodes = HashMap::new();
        assert_eq!(render_str("hola mundo", &items, &nodes), "hola mundo");
    }

    #[test]
    fn _sanity_ctx_helper() {
        let (_a, _b, items) = ctx_with(vec![json!({ "json": 1 })]);
        assert_eq!(items.len(), 1);
    }
}
