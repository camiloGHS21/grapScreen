pub mod custom_events;
pub mod executors;
pub mod expression_eval;

pub use custom_events::handle_custom_event;
pub use executors::{execute_code_node, execute_http_request};
pub use expression_eval::{eval_expression, evaluate_condition_event};
pub use super::hotkey_helpers::simulate_hotkey;
pub use super::ocr_image_helpers::{check_image_match, check_ocr_condition};

use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::Emitter;

thread_local! {
    pub static VARIABLES: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
    pub static CURRENT_ITEMS: RefCell<Vec<Value>> = RefCell::new(Vec::new());
    /// Output items produced by each executed node, keyed by node id AND label.
    /// This is what `{{ $node["My Node"].json.field }}` reads from.
    pub static NODE_OUTPUTS: RefCell<HashMap<String, Vec<Value>>> = RefCell::new(HashMap::new());
    /// Data of the credential attached to the node currently executing, if any.
    /// Exposed to expressions as `{{ $credentials.field }}`.
    pub static CURRENT_CREDENTIAL: RefCell<Option<Value>> = RefCell::new(None);
}

/// Clears all thread-local execution state. Called before every graph run so a
/// previous execution can never leak data into the next one.
pub fn reset_execution_state() {
    VARIABLES.with(|v| v.borrow_mut().clear());
    CURRENT_ITEMS.with(|i| i.borrow_mut().clear());
    NODE_OUTPUTS.with(|n| n.borrow_mut().clear());
    CURRENT_CREDENTIAL.with(|c| *c.borrow_mut() = None);
}

/// Installs (or clears) the credential visible to the node about to run.
///
/// Returns the previous value so a caller can restore it, which matters for
/// nested execution (a sub-workflow must not inherit its parent's credential).
pub fn set_current_credential(data: Option<Value>) -> Option<Value> {
    CURRENT_CREDENTIAL.with(|c| std::mem::replace(&mut *c.borrow_mut(), data))
}

pub fn get_current_credential() -> Option<Value> {
    CURRENT_CREDENTIAL.with(|c| c.borrow().clone())
}

/// Records a node's output so downstream nodes can reference it by name/id.
pub fn set_node_output(node_id: &str, node_label: &str, items: Vec<Value>) {
    NODE_OUTPUTS.with(|map| {
        let mut m = map.borrow_mut();
        m.insert(node_id.to_string(), items.clone());
        if !node_label.is_empty() && node_label != node_id {
            m.insert(node_label.to_string(), items);
        }
    });
}

pub fn get_node_outputs() -> HashMap<String, Vec<Value>> {
    NODE_OUTPUTS.with(|m| m.borrow().clone())
}

/// Builds the read-only context an expression is evaluated against.
///
/// When `credentials` is `None` the current node's credential (installed by
/// [`set_current_credential`]) is used, so callers inside a node do not have to
/// thread it through manually.
pub fn expr_context<'a>(
    items: &'a [Value],
    item_index: usize,
    run_index: usize,
    outputs: &'a HashMap<String, Vec<Value>>,
    variables: &'a HashMap<String, String>,
    execution_id: &'a str,
) -> crate::application::expressions::ExprContext<'a> {
    crate::application::expressions::ExprContext {
        items,
        item_index,
        run_index,
        node_outputs: outputs,
        variables,
        execution_id,
        credentials: None,
    }
}

/// Same as [`expr_context`] but with an explicit credential value, for callers
/// holding the data directly (e.g. the HTTP runner).
pub fn expr_context_with_credential<'a>(
    items: &'a [Value],
    item_index: usize,
    run_index: usize,
    outputs: &'a HashMap<String, Vec<Value>>,
    variables: &'a HashMap<String, String>,
    execution_id: &'a str,
    credentials: &'a Value,
) -> crate::application::expressions::ExprContext<'a> {
    crate::application::expressions::ExprContext {
        items,
        item_index,
        run_index,
        node_outputs: outputs,
        variables,
        execution_id,
        credentials: Some(credentials),
    }
}

/// Evaluates a `{{ ... }}` string against the current thread-local state.
/// This is the drop-in upgrade for the legacy `interpolate_variables`.
pub fn eval_template(input: &str) -> String {
    eval_template_at(input, 0, 0)
}

/// Same as [`eval_template`] but pinned to a specific item/run position so
/// item-based nodes can reference the right `$json`.
pub fn eval_template_at(input: &str, item_index: usize, run_index: usize) -> String {
    if !crate::application::expressions::contains_expression(input) {
        return input.to_string();
    }
    let items = get_items();
    let vars = get_all_vars();
    let outputs = get_node_outputs();
    let credential = get_current_credential();
    let ctx = expr_context_with_credential(
        &items,
        item_index,
        run_index,
        &outputs,
        &vars,
        "",
        credential.as_ref().unwrap_or(&Value::Null),
    );
    crate::application::expressions::render_string(input, &ctx)
}

/// Like [`eval_template_at`] but returns the raw JSON value so node configs can
/// carry numbers/booleans/objects through unchanged.
pub fn eval_template_value(input: &str) -> Value {
    if !crate::application::expressions::contains_expression(input) {
        return Value::String(input.to_string());
    }
    let items = get_items();
    let vars = get_all_vars();
    let outputs = get_node_outputs();
    let credential = get_current_credential();
    let ctx = expr_context_with_credential(
        &items,
        0,
        0,
        &outputs,
        &vars,
        "",
        credential.as_ref().unwrap_or(&Value::Null),
    );
    crate::application::expressions::render(input, &ctx)
}

/// Evaluates an expression and coerces the result to a boolean, for condition
/// and filter nodes.
///
/// Handles both `{{ $json.total > 100 }}`-style templates and bare expressions
/// like `5 < 3`, so legacy flows that predate the typed engine keep working.
pub fn eval_condition_typed(expr: &str) -> bool {
    let items = get_items();
    let vars = get_all_vars();
    let outputs = get_node_outputs();
    let credential = get_current_credential();
    let ctx = expr_context_with_credential(
        &items,
        0,
        0,
        &outputs,
        &vars,
        "",
        credential.as_ref().unwrap_or(&Value::Null),
    );
    crate::application::expressions::eval_condition(expr, &ctx)
}

static FORM_TX: OnceLock<Mutex<Option<mpsc::Sender<(String, HashMap<String, String>)>>>> = OnceLock::new();

pub fn get_form_tx() -> &'static Mutex<Option<mpsc::Sender<(String, HashMap<String, String>)>>> {
    FORM_TX.get_or_init(|| Mutex::new(None))
}

pub fn get_var(name: &str) -> Option<String> {
    VARIABLES.with(|vars| vars.borrow().get(name).cloned())
}

pub fn set_var(name: &str, value: &str) {
    if name.is_empty() {
        return;
    }
    VARIABLES.with(|vars| {
        vars.borrow_mut().insert(name.to_string(), value.to_string());
    });
}

pub fn get_all_vars() -> HashMap<String, String> {
    VARIABLES.with(|vars| vars.borrow().clone())
}

pub fn get_items() -> Vec<Value> {
    CURRENT_ITEMS.with(|items| items.borrow().clone())
}

pub fn set_items(items: Vec<Value>) {
    let formatted_items: Vec<Value> = items
        .into_iter()
        .map(|item| {
            if item.is_object() && item.get("json").is_some() {
                item
            } else {
                serde_json::json!({ "json": item })
            }
        })
        .collect();

    CURRENT_ITEMS.with(|cell| {
        *cell.borrow_mut() = formatted_items.clone();
    });

    if let Ok(json_str) = serde_json::to_string(&formatted_items) {
        set_var("items", &json_str);
    }
    set_var("items_count", &formatted_items.len().to_string());
    if let Some(first) = formatted_items.first() {
        let payload = first.get("json").unwrap_or(first);
        let val_str = match payload {
            Value::String(s) => s.clone(),
            other => serde_json::to_string(other).unwrap_or_else(|_| other.to_string()),
        };
        set_var("item", &val_str);
        set_var("$json", &val_str);
    }
}

pub fn push_item(item: Value) {
    let formatted = if item.is_object() && item.get("json").is_some() {
        item
    } else {
        serde_json::json!({ "json": item })
    };
    CURRENT_ITEMS.with(|cell| {
        cell.borrow_mut().push(formatted);
    });
    let all = get_items();
    if let Ok(json_str) = serde_json::to_string(&all) {
        set_var("items", &json_str);
    }
}

/// Interpolates `{{ ... }}` in a string.
///
/// Delegates to the typed expression engine (see `application::expressions`),
/// which understands `$json`, `$node["..."].json.x`, `$items()`, arithmetic and
/// the legacy flat `{{ variable }}` form. Kept under the old name so every
/// existing caller keeps working.
pub fn interpolate_variables(input: &str) -> String {
    if !input.contains("{{") {
        return input.to_string();
    }
    eval_template(input)
}

/// Legacy single-item path resolver, retained for callers that need a raw
/// string out of the first item without full expression semantics.
fn resolve_item_path<'a>(item: &'a Value, path: &str) -> Option<String> {
    let value = crate::application::expressions::get_path(item, &format!(".{}", path));
    if value.is_null() {
        None
    } else {
        Some(crate::application::expressions::stringify(&value))
    }
}

pub fn warn_ui(warning: &str, detail: &str) {
    if let Some(app) = crate::get_app_handle() {
        let _ = app.emit(
            "automation-warning",
            serde_json::json!({ "id": "", "warning": warning, "detail": detail }),
        );
    }
}

#[cfg(test)]
mod chain_tests {
    use super::*;
    use serde_json::json;

    /// Serializes the tests that share thread-local state. `cargo test` runs
    /// tests in parallel threads, but each `#[test]` still gets its own thread
    /// local, so this is only needed if a test spawns threads.
    fn fresh() {
        reset_execution_state();
    }

    #[test]
    fn node_output_is_addressable_by_label_and_id() {
        fresh();
        set_node_output(
            "node-1",
            "HTTP Request",
            vec![json!({ "json": { "id": 7, "name": "ana" } })],
        );

        let items: Vec<Value> = vec![];
        let vars = get_all_vars();
        let outputs = get_node_outputs();
        let ctx = expr_context(&items, 0, 0, &outputs, &vars, "");

        // Both the label and the id resolve to the same payload.
        assert_eq!(
            crate::application::expressions::render("{{ $node[\"HTTP Request\"].json.id }}", &ctx),
            json!(7)
        );
        assert_eq!(
            crate::application::expressions::render("{{ $node[\"node-1\"].json.name }}", &ctx),
            json!("ana")
        );
    }

    #[test]
    fn items_chain_into_expressions() {
        fresh();
        // Simulates an upstream node emitting two items.
        set_items(vec![
            json!({ "json": { "price": 10, "qty": 2 } }),
            json!({ "json": { "price": 5, "qty": 3 } }),
        ]);

        // Item 0 -> 10 * 2 = 20, item 1 -> 5 * 3 = 15.
        assert_eq!(eval_template_at("{{ $json.price * $json.qty }}", 0, 0), "20");
        assert_eq!(eval_template_at("{{ $json.price * $json.qty }}", 1, 0), "15");
    }

    #[test]
    fn template_and_value_agree_on_whole_expressions() {
        fresh();
        set_items(vec![json!({ "json": { "count": 42 } })]);
        assert_eq!(eval_template("{{ $json.count }}"), "42");
        // The value form keeps the JSON type instead of stringifying.
        assert_eq!(eval_template_value("{{ $json.count }}"), json!(42));
    }

    #[test]
    fn reset_clears_previous_run() {
        fresh();
        set_node_output("n", "Old Node", vec![json!({ "json": { "x": 1 } })]);
        set_items(vec![json!({ "json": { "y": 2 } })]);
        assert!(!get_node_outputs().is_empty());
        assert!(!get_items().is_empty());

        reset_execution_state();
        assert!(get_node_outputs().is_empty());
        assert!(get_items().is_empty());
        assert!(get_all_vars().is_empty());
    }
}
