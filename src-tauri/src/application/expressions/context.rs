use serde_json::Value;
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
    pub credentials: Option<&'a Value>,
}

impl<'a> ExprContext<'a> {
    /// Current item, i.e. what `$json` resolves to.
    pub fn current_item(&self) -> Option<&Value> {
        self.items.get(self.item_index).or_else(|| self.items.first())
    }

    pub fn lookup_node(&self, name: &str) -> Option<&Vec<Value>> {
        self.node_outputs.get(name)
    }
}

/// Unwraps the `{ "json": ... }` envelope n8n items carry.
pub fn unwrap_item(item: &Value) -> Value {
    item.get("json").cloned().unwrap_or_else(|| item.clone())
}

/// The payload of the item currently being processed.
pub fn current_payload(ctx: &ExprContext) -> Value {
    ctx.current_item().map(unwrap_item).unwrap_or(Value::Null)
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

pub fn as_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

pub fn json_eq(a: &Value, b: &Value) -> bool {
    if let (Some(x), Some(y)) = (as_f64(a), as_f64(b)) {
        return (x - y).abs() < f64::EPSILON;
    }
    match (a, b) {
        (Value::String(x), Value::String(y)) => x == y,
        _ => a == b,
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

pub fn num(f: f64) -> Value {
    if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 {
        Value::Number(serde_json::Number::from(f as i64))
    } else {
        serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
    }
}

/// Public alias of [`num`] for modules that produce numbers outside the grammar.
pub fn num_from_f64(f: f64) -> Value {
    num(f)
}
