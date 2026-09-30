use super::context::{as_f64, json_eq, num, stringify, truthy, ExprContext};
use super::eval::eval;
use super::parser::find_top_level;
use serde_json::Value;

pub fn try_logical(expr: &str, ctx: &ExprContext) -> Option<Value> {
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

pub fn compare(lhs: &Value, rhs: &Value, op: &str) -> bool {
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

pub fn try_arithmetic(expr: &str, ctx: &ExprContext) -> Option<Value> {
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

/// `+` concatenates when either side is a non-numeric string.
pub fn add(lhs: Value, rhs: Value) -> Value {
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
