use super::context::{num, stringify, truthy, ExprContext};
use super::methods::call_function;
use super::modern::resolve_dollar;
use super::operators::{try_arithmetic, try_logical};
use super::parser::{contains_expression, parse_trailing_call, segments, Segment};
use serde_json::Value;

/// Interpolates `input`, keeping the JSON type when the whole string is a single expression.
pub fn render(input: &str, ctx: &ExprContext) -> Value {
    let parts = segments(input);
    if parts.is_empty() {
        return Value::String(String::new());
    }

    if parts.len() == 1 {
        if let Segment::Expr(e) = parts[0] {
            return eval(e, ctx);
        }
    }

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
    let _ = saw_expr;
    Value::String(out)
}

/// Convenience: render and force to string.
pub fn render_string(input: &str, ctx: &ExprContext) -> String {
    stringify(&render(input, ctx))
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

/// Evaluates a whole condition string to a boolean.
pub fn eval_condition(input: &str, ctx: &ExprContext) -> bool {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return false;
    }

    if contains_expression(trimmed) {
        let substituted = render_string(trimmed, ctx);
        if substituted.trim().is_empty() {
            return false;
        }
        return truthy(&eval(&substituted, ctx));
    }

    truthy(&eval(trimmed, ctx))
}

pub fn resolve_token(token: &str, ctx: &ExprContext) -> Value {
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

    // Trailing function or method call, e.g. `$items()`, `$json.items.map(...)`, `$('Node').all().join(...)`
    if let Some(call) = parse_trailing_call(token) {
        if let Some(v) = call_function(&call, ctx) {
            return v;
        }
    }

    // `$json`, `$node[...]`, `$('Node')`, `$items` ...
    if let Some(v) = resolve_dollar(token, ctx) {
        return v;
    }

    // Bare identifier: legacy flat variable.
    if let Some(v) = ctx.variables.get(token) {
        return Value::String(v.clone());
    }

    // Unresolved -> keep the token visible.
    Value::String(format!("{{{{ {} }}}}", token))
}
