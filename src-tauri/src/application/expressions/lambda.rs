use super::context::ExprContext;
use super::parser::split_args;
use serde_json::Value;

/// Evaluates a JavaScript-style arrow function or expression body against an array element.
/// Examples:
/// - `u => u.name`
/// - `u => u.name.toUpperCase()`
/// - `p => p.price > 30`
/// - `item => item.json.email`
/// - `"name"` (shorthand property accessor)
pub fn eval_lambda(lambda_str: &str, elem: &Value, ctx: &ExprContext) -> Value {
    let raw = lambda_str.trim();
    if raw.is_empty() {
        return elem.clone();
    }

    if let Some((param_part, body_part)) = raw.split_once("=>") {
        let param = param_part.trim().trim_matches(|c| c == '(' || c == ')').trim();
        let body = body_part.trim();

        if body == param {
            return elem.clone();
        }

        if body.starts_with(param) {
            let tail = &body[param.len()..];
            if tail.starts_with('.') || tail.starts_with('[') {
                if tail.contains('(') && tail.ends_with(')') {
                    if let Some(dot) = super::parser::last_top_level_dot(tail) {
                        let prop_tail = &tail[..dot];
                        let method_call = &tail[dot + 1..];
                        let base_val = resolve_elem_field(elem, prop_tail);
                        if let Some(paren_m) = method_call.find('(') {
                            let method = method_call[..paren_m].trim();
                            let args_src = &method_call[paren_m + 1..method_call.len() - 1];
                            let args = split_args(args_src);
                            return super::methods::apply_helper(&base_val, method, &args, ctx).unwrap_or(base_val);
                        }
                    }
                }

                if body.contains("==") || body.contains("!=") || body.contains('>') || body.contains('<') {
                    return eval_scoped_condition(body, param, elem, ctx);
                }

                return resolve_elem_field(elem, tail);
            }
        }

        if body.contains("==") || body.contains("!=") || body.contains('>') || body.contains('<') {
            return eval_scoped_condition(body, param, elem, ctx);
        }

        return super::eval::eval(body, ctx);
    }

    let prop = raw.trim_matches(|c| c == '"' || c == '\'');
    resolve_elem_field(elem, &format!(".{}", prop))
}

pub fn resolve_elem_field(elem: &Value, tail: &str) -> Value {
    if tail.is_empty() {
        return elem.clone();
    }
    if let Some(after_json) = tail.strip_prefix(".json") {
        if elem.get("json").is_none() {
            return super::modern::get_path(elem, after_json);
        }
    }
    super::modern::get_path(elem, tail)
}

fn eval_scoped_condition(expr: &str, param: &str, elem: &Value, ctx: &ExprContext) -> Value {
    for op in ["==", "!=", ">=", "<=", ">", "<"] {
        let op_spaced = format!(" {} ", op);
        if let Some((lhs_str, rhs_str)) = expr.split_once(&op_spaced) {
            let lhs = eval_lambda_part(lhs_str.trim(), param, elem, ctx);
            let rhs = eval_lambda_part(rhs_str.trim(), param, elem, ctx);
            return Value::Bool(super::operators::compare(&lhs, &rhs, op));
        }
    }
    Value::Bool(false)
}

fn eval_lambda_part(part: &str, param: &str, elem: &Value, ctx: &ExprContext) -> Value {
    if part == param {
        return elem.clone();
    }
    if part.starts_with(param) {
        let tail = &part[param.len()..];
        if tail.starts_with('.') || tail.starts_with('[') {
            return resolve_elem_field(elem, tail);
        }
    }
    super::eval::eval(part, ctx)
}
