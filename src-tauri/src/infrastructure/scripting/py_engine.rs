//! Python execution on the embedded RustPython interpreter.
//!
//! RustPython is a complete Python interpreter written in pure Rust, and the
//! Python stdlib is **frozen into the binary** (`rustpython-pylib`), so an
//! automation that ships as `.exe`/`.dmg` runs Python `Code` scripts on a
//! machine with no `python` installed — same as the JavaScript side (Boa).
//!
//! The interpreter lives on one dedicated worker thread with a large stack:
//! RustPython sets its native-recursion soft limit from the creating thread's
//! stack bounds, and its frozen-stdlib bootstrap is deeply recursive — more
//! than the 2 MB that Tauri/tokio workers and Rust test threads get in debug
//! builds. Every run gets a fresh scope, so scripts never leak state into each
//! other.

use std::sync::mpsc;
use std::sync::OnceLock;

use rustpython_vm::{compiler::Mode, scope::Scope, Interpreter, Settings, VirtualMachine};
use serde_json::Value;

use super::js_engine::{value_to_items, ScriptOutcome};
use super::js_shims::JsEnv;
use super::py_bridge;

/// Stack size for the Python worker thread. The frozen-stdlib bootstrap needs
/// well over the default 2 MB when frames are debug-built.
const WORKER_STACK_BYTES: usize = 32 * 1024 * 1024;

struct Job {
    code: String,
    env: JsEnv,
    reply: mpsc::Sender<Result<ScriptOutcome, String>>,
}

/// Sender to the Python worker thread, started on first use.
fn engine_sender() -> Result<&'static mpsc::Sender<Job>, String> {
    static SENDER: OnceLock<mpsc::Sender<Job>> = OnceLock::new();
    if let Some(sender) = SENDER.get() {
        return Ok(sender);
    }
    let (tx, rx) = mpsc::channel::<Job>();
    std::thread::Builder::new()
        .name("grapscreen-python".into())
        .stack_size(WORKER_STACK_BYTES)
        .spawn(move || worker_loop(rx))
        .map_err(|err| format!("Code: could not start the Python engine: {err}"))?;
    // First thread wins the race; a losing worker exits once its sender drops.
    let _ = SENDER.set(tx);
    SENDER
        .get()
        .ok_or_else(|| "Code: could not start the Python engine".to_string())
}

fn worker_loop(rx: mpsc::Receiver<Job>) {
    // Built here so the VM's native-recursion soft limit matches this thread —
    // the only thread that ever runs Python.
    let interpreter = build_interpreter();
    while let Ok(job) = rx.recv() {
        let result = interpreter.enter(|vm| run_script(vm, &job.code, &job.env));
        let _ = job.reply.send(result);
    }
}

fn build_interpreter() -> Interpreter {
    let builder = Interpreter::builder(Settings::default());
    // Native half of the stdlib (json, math, hashlib …).
    let defs = rustpython_stdlib::stdlib_module_defs(&builder.ctx);
    // Pure-Python half (re, datetime, random …) — compiled into the binary.
    builder
        .add_native_modules(&defs)
        .add_frozen_modules(rustpython_pylib::FROZEN_STDLIB)
        .build()
}

/// Runs a Python `Code` script with the given environment and returns what it
/// produced. Mirrors [`super::js_engine::run_js`]: an explicit `return` from
/// `main()` becomes the items, otherwise printed output decides.
pub fn run_py(code: &str, env: &JsEnv) -> Result<ScriptOutcome, String> {
    if code.trim().is_empty() {
        return Ok(ScriptOutcome::default());
    }
    let sender = engine_sender()?;
    let (reply_tx, reply_rx) = mpsc::channel();
    sender
        .send(Job {
            code: code.to_owned(),
            env: env.clone(),
            reply: reply_tx,
        })
        .map_err(|_| "Code: the Python engine is not running".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "Code: the Python engine stopped unexpectedly".to_string())?
}

fn run_script(vm: &VirtualMachine, code: &str, env: &JsEnv) -> Result<ScriptOutcome, String> {
    let scope = vm.new_scope_with_builtins();
    // Three compile units share one scope: bootstrap, the user's `def main():`
    // body (named `<grapscreen-code>` so tracebacks point at the script), and
    // the call that captures `main()`'s return value.
    run_unit(vm, scope.clone(), &py_bridge::prelude(env), "<grapscreen-prelude>")?;
    run_unit(vm, scope.clone(), &py_bridge::wrap_main(code), py_bridge::SCRIPT_NAME)?;
    run_unit(vm, scope.clone(), py_bridge::EPILOGUE, "<grapscreen-epilogue>")?;

    Ok(ScriptOutcome {
        items: read_result(vm, &scope),
        logs: read_logs(vm, &scope),
    })
}

fn run_unit(vm: &VirtualMachine, scope: Scope, source: &str, name: &str) -> Result<(), String> {
    let code_obj = vm.compile(source, Mode::Exec, name.to_string()).map_err(|err| {
        let exc = err.into_pyexception(vm, Some(source));
        format!("Code: {}", py_bridge::render_exception(vm, exc.as_ref()))
    })?;
    vm.run_code_obj(code_obj, scope)
        .map_err(|exc| format!("Code: {}", py_bridge::render_exception(vm, exc.as_ref())))?;
    Ok(())
}

/// `main()`'s return value as items: array → items, single value → one item,
/// `None` → "the script produced nothing" (printed output decides instead).
fn read_result(vm: &VirtualMachine, scope: &Scope) -> Option<Vec<Value>> {
    let obj = scope
        .globals
        .get_item_opt(py_bridge::RESULT_VAR, vm)
        .ok()
        .flatten()?;
    if vm.is_none(&obj) {
        return None;
    }
    value_to_items(&py_bridge::to_json(vm, &obj))
}

/// Everything the script printed (via `print`, `sys.stdout` or `sys.stderr`),
/// in order. The trailing newline `print` adds is stripped so entries behave
/// like `console.log` lines on the JavaScript side.
fn read_logs(vm: &VirtualMachine, scope: &Scope) -> Vec<String> {
    let Some(obj) = scope.globals.get_item_opt(py_bridge::LOGS_VAR, vm).ok().flatten() else {
        return Vec::new();
    };
    match py_bridge::to_json(vm, &obj) {
        Value::Array(entries) => entries
            .iter()
            .map(|entry| match entry {
                Value::String(line) => line.trim_end_matches('\n').to_string(),
                other => other.to_string(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::scripting::outcome_to_items;
    use serde_json::json;
    use std::collections::HashMap;

    fn env_with_items(items: Vec<Value>) -> JsEnv {
        JsEnv {
            items,
            node_outputs: HashMap::new(),
            vars: HashMap::new(),
            execution_id: "test".to_string(),
        }
    }

    #[test]
    fn returned_array_becomes_items() {
        let outcome = run_py("return [{'a': 1}, {'b': 2}]", &env_with_items(vec![])).expect("el script corre");
        assert_eq!(outcome.items, Some(vec![json!({"a": 1}), json!({"b": 2})]));
    }

    #[test]
    fn printed_json_wins_when_nothing_is_returned() {
        let code = "import json\nprint(json.dumps({'ok': True}))";
        let outcome = run_py(code, &env_with_items(vec![])).expect("el script corre");
        assert_eq!(outcome_to_items(&outcome, vec![]), vec![json!({"ok": true})]);
    }

    #[test]
    fn stdlib_is_frozen_into_the_binary() {
        // `re`/`json` come from the frozen stdlib: works with no `python` install.
        let code = "import re\nreturn [re.sub('world', 'rust', 'hello world')]";
        let outcome = run_py(code, &env_with_items(vec![])).expect("el script corre");
        assert_eq!(outcome.items, Some(vec![json!("hello rust")]));
    }

    #[test]
    fn logs_without_json_become_output_item() {
        let outcome = run_py("print('hola'); print('mundo')", &env_with_items(vec![])).expect("el script corre");
        assert_eq!(outcome.logs, vec!["hola".to_string(), "mundo".to_string()]);
        assert_eq!(outcome_to_items(&outcome, vec![]), vec![json!({"output": "hola\nmundo"})]);
    }

    #[test]
    fn incoming_items_and_vars_are_visible() {
        let mut vars = HashMap::new();
        vars.insert("nombre".to_string(), json!("ana"));
        let env = JsEnv {
            items: vec![json!({"x": 7})],
            node_outputs: HashMap::new(),
            vars,
            execution_id: "test".to_string(),
        };
        let code = "return [{'echo': items[0]['x'], 'v': variables['nombre'], 'id': execution_id}]";
        let outcome = run_py(code, &env).expect("el script corre");
        assert_eq!(
            outcome.items,
            Some(vec![json!({"echo": 7, "v": "ana", "id": "test"})])
        );
    }

    #[test]
    fn script_that_produces_nothing_passes_items_through() {
        let items = vec![json!({"x": 1})];
        let outcome = run_py("pass", &env_with_items(items.clone())).expect("el script corre");
        assert_eq!(outcome_to_items(&outcome, items.clone()), items);
    }

    #[test]
    fn runtime_errors_carry_the_python_message() {
        let err = run_py("return [1 / 0]", &env_with_items(vec![])).expect_err("debe fallar");
        assert!(err.contains("ZeroDivisionError"), "error inesperado: {err}");
    }

    #[test]
    fn syntax_errors_are_reported() {
        let err = run_py("def rota(:\n    pass", &env_with_items(vec![])).expect_err("debe fallar");
        assert!(err.contains("SyntaxError"), "error inesperado: {err}");
    }

    #[test]
    fn concurrent_calls_share_the_python_lane_safely() {
        let handles: Vec<_> = (0..8)
            .map(|i| {
                std::thread::spawn(move || {
                    let code = format!("return [{{'i': {i}}}] ");
                    let outcome = run_py(&code, &env_with_items(vec![])).expect("el script corre");
                    assert_eq!(outcome.items, Some(vec![json!({"i": i})]));
                })
            })
            .collect();
        for handle in handles {
            handle.join().expect("el hilo termina sin panic");
        }
    }
}
