use super::interpolate_variables;
use crate::domain::ports_out::OcrPort;
pub use crate::application::ocr_image_helpers::{check_image_match, check_ocr_condition};


fn unquote(s: &str) -> &str {
    let b = s.as_bytes();
    if b.len() >= 2 && ((b[0] == b'"' && b[b.len() - 1] == b'"') || (b[0] == b'\'' && b[b.len() - 1] == b'\'')) {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

fn compare_operands(lhs: &str, rhs: &str, op: &str) -> bool {
    let ln = lhs.trim().parse::<f64>();
    let rn = rhs.trim().parse::<f64>();
    let numeric = |f: &dyn Fn(f64, f64) -> bool| -> bool {
        match (&ln, &rn) {
            (Ok(a), Ok(b)) => f(*a, *b),
            _ => false,
        }
    };
    match op {
        "==" => match (&ln, &rn) {
            (Ok(a), Ok(b)) => (*a - *b).abs() < f64::EPSILON,
            _ => lhs == rhs,
        },
        "!=" => !compare_operands(lhs, rhs, "=="),
        ">" => numeric(&|a, b| a > b),
        "<" => numeric(&|a, b| a < b),
        ">=" => numeric(&|a, b| a >= b),
        "<=" => numeric(&|a, b| a <= b),
        "contains" => lhs.to_lowercase().contains(&rhs.to_lowercase()),
        "not contains" => !lhs.to_lowercase().contains(&rhs.to_lowercase()),
        "starts with" => lhs.to_lowercase().starts_with(&rhs.to_lowercase()),
        "ends with" => lhs.to_lowercase().ends_with(&rhs.to_lowercase()),
        _ => false,
    }
}

/// Evaluate an n8n-style expression after interpolating `{{ variables }}`.
///
/// The typed engine handles `$json` / `$node` / arithmetic / comparisons. This
/// wrapper adds the legacy human-readable operators (`contains`, `starts with`,
/// `ends with`) plus the OCR/image condition modes, so existing flows keep
/// working unchanged.
pub fn eval_expression(raw: &str) -> bool {
    // Words like `contains` are not part of the typed grammar, so handle them
    // on the interpolated text first.
    let interpolated = interpolate_variables(raw);
    let expr = interpolated.trim();
    if expr.is_empty() {
        return false;
    }

    const WORD_OPS: &[&str] = &[
        " not contains ",
        " contains ",
        " starts with ",
        " ends with ",
    ];
    let lower = expr.to_lowercase();
    for op in WORD_OPS {
        if let Some(pos) = lower.find(op) {
            let lhs = unquote(expr[..pos].trim());
            let rhs = unquote(expr[pos + op.len()..].trim());
            return compare_operands(lhs, rhs, op.trim());
        }
    }

    // Symbolic operators and truthiness go through the typed engine, which
    // understands JSON types instead of comparing everything as text.
    crate::application::replay_helpers::eval_condition_typed(raw)
}

/// Evaluate a condition node's stored data. Types: text (OCR), image
/// (template match), expression (variables). Unknown types pass through.
pub fn evaluate_condition_event(data: &serde_json::Value, ocr_port: &dyn OcrPort) -> bool {
    let condition_type = data["condition_type"].as_str().unwrap_or("text");
    let description = data["description"].as_str().unwrap_or("");
    match condition_type {
        "text" => check_ocr_condition(ocr_port, description),
        "image" => check_image_match(description),
        "expression" => {
            let expr = data["expression"].as_str().unwrap_or(description);
            eval_expression(expr)
        }
        _ => true,
    }
}

#[cfg(test)]
mod expression_tests {
    use super::*;
    use super::super::{get_var, set_var};

    #[test]
    fn numeric_comparisons() {
        assert!(eval_expression("5 > 3"));
        assert!(eval_expression("5 >= 5"));
        assert!(!eval_expression("5 < 3"));
        assert!(eval_expression("3.5 == 3.5"));
        assert!(eval_expression("3 != 4"));
    }

    #[test]
    fn string_comparisons() {
        assert!(eval_expression("\"hola\" == \"hola\""));
        assert!(!eval_expression("\"hola\" == \"adios\""));
        assert!(eval_expression("\"hola mundo\" contains \"mundo\""));
        assert!(!eval_expression("\"hola\" not contains \"ola\""));
        assert!(eval_expression("\"hola\" starts with \"ho\""));
        assert!(eval_expression("\"hola\" ends with \"la\""));
    }

    #[test]
    fn truthy_values() {
        assert!(eval_expression("algo"));
        assert!(!eval_expression("false"));
        assert!(!eval_expression("0"));
        assert!(!eval_expression(""));
        assert!(eval_expression("123"));
    }

    #[test]
    fn variables_interpolate() {
        set_var("mi_var", "42");
        assert!(eval_expression("{{ mi_var }} == 42"));
        assert!(eval_expression("{{ mi_var }} > 10"));
        assert!(!eval_expression("{{ mi_var }} < 10"));
        set_var("nombre", "grapscreen");
        assert!(eval_expression("{{ nombre }} contains \"screen\""));
    }

    #[test]
    fn set_and_get_var() {
        set_var("test_key", "test_value");
        assert_eq!(get_var("test_key"), Some("test_value".to_string()));
        assert_eq!(get_var("no_existe_xyz"), None);
    }
}
