//! JavaScript execution on the embedded Boa engine.
//!
//! The user's code is wrapped in an async IIFE whose resolution is captured by
//! two native hooks (`__grapscreen_set_result` / `__grapscreen_set_error`), so
//! `return` values, `await` and thrown errors all come back to Rust without the
//! engine needing to resolve promises from the host side. `console.log` output
//! is captured the same way, which keeps the "last printed JSON wins" contract
//! the templates were written against.

use super::js_shims;
use boa_engine::{Context, Source};
use serde_json::Value;

/// What a script run produced.
#[derive(Debug, Default, Clone)]
pub struct ScriptOutcome {
    /// The value the script returned (or `None` when it returned nothing).
    /// Scripts may return one item, an array of items, or `undefined`.
    pub items: Option<Vec<Value>>,
    /// Everything the script printed, in order.
    pub logs: Vec<String>,
}

thread_local! {
    static LOGS: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(Vec::new()) };
    static RESULT: std::cell::RefCell<Option<Value>> = const { std::cell::RefCell::new(None) };
    static ERROR: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

pub(super) fn push_log(line: String) {
    LOGS.with(|l| l.borrow_mut().push(line));
}

pub(super) fn set_result(value: Option<Value>) {
    RESULT.with(|r| *r.borrow_mut() = value);
}

pub(super) fn set_error(message: String) {
    ERROR.with(|e| *e.borrow_mut() = Some(message));
}

fn take_state() -> (Vec<String>, Option<Value>, Option<String>) {
    let logs = LOGS.with(|l| std::mem::take(&mut *l.borrow_mut()));
    let result = RESULT.with(|r| r.borrow_mut().take());
    let error = ERROR.with(|e| e.borrow_mut().take());
    (logs, result, error)
}

/// Runs `code` with the given environment and returns what it produced.
pub fn run_js(code: &str, env: &js_shims::JsEnv) -> Result<ScriptOutcome, String> {
    if code.trim().is_empty() {
        return Ok(ScriptOutcome::default());
    }
    take_state();

    let mut context = Context::default();
    js_shims::install(&mut context, env)
        .map_err(|e| format!("Code: no se pudo preparar el motor: {}", render_error(&e, &mut context)))?;

    let rewritten = js_shims::rewrite_imports(code);
    let wrapped = format!(
        "(async () => {{\n{}\n}})().then(\n  (res) => __grapscreen_set_result(res),\n  (err) => __grapscreen_set_error(err)\n);\n",
        rewritten
    );

    if let Err(e) = context.eval(Source::from_bytes(&wrapped)) {
        let _ = take_state();
        return Err(format!("Code: {}", render_error(&e, &mut context)));
    }
    if let Err(e) = context.run_jobs() {
        let _ = take_state();
        return Err(format!("Code: {}", render_error(&e, &mut context)));
    }

    let (logs, result, error) = take_state();
    if let Some(message) = error {
        return Err(format!("Code: script terminó con error: {}", message));
    }
    Ok(ScriptOutcome { items: result.and_then(|v| value_to_items(&v)), logs })
}

/// Renders an engine error the way a user needs to read it: the message, not
/// the opaque engine object.
fn render_error(error: &boa_engine::JsError, context: &mut Context) -> String {
    if let Ok(opaque) = error.clone().into_opaque(context) {
        if let Ok(Some(json)) = opaque.to_json(context) {
            if let Some(message) = json.get("message").and_then(|m| m.as_str()) {
                let name = json.get("name").and_then(|n| n.as_str()).unwrap_or("Error");
                return format!("{}: {}", name, message);
            }
            return json.to_string();
        }
    }
    error.to_string()
}

/// Converts a JavaScript value produced by a script into plain JSON items.
///
/// Mirrors the old external-runner contract: an array becomes the item list, a
/// single object/value becomes one item, and `undefined`/`null` means "the
/// script did not produce anything".
pub fn value_to_items(value: &Value) -> Option<Vec<Value>> {
    match value {
        Value::Null => None,
        Value::Array(arr) => Some(arr.clone()),
        other => Some(vec![other.clone()]),
    }
}
