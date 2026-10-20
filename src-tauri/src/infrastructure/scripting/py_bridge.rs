//! Bridge between plain JSON values and the embedded RustPython VM.
//!
//! Python `Code` scripts run **inside the Rust binary** with the same shape the
//! external `python` runner used to give them: the user's body becomes
//! `def main():`, incoming items/vars are real Python objects (`items`,
//! `_input`, `variables`, `node_outputs`, `execution_id`), `print()` output is
//! captured, and `main()`'s return value is what flows to the next node.
//!
//! Everything here is pure text/composition plus one conversion helper — the
//! engine lifecycle lives in [`super::py_engine`]. Line numbers reported by
//! Python are offset by one (the `def main():` wrapper line).

use rustpython_vm::{builtins, builtins::PyBaseException, py_serde, Py, PyObject, VirtualMachine};
use serde_json::Value;

use super::js_shims::JsEnv;

/// Where the wrapped script stores `main()`'s return value.
pub const RESULT_VAR: &str = "__gs_result";
/// Where stdout/stderr/`print` output accumulates, in order.
pub const LOGS_VAR: &str = "__gs_logs";
/// Name shown in tracebacks for the wrapped user body.
pub const SCRIPT_NAME: &str = "<grapscreen-code>";
/// Runs the user's `main()` after its body was defined.
pub const EPILOGUE: &str = "__gs_result = main()\n";

/// Builds the bootstrap that runs before user code: print capture plus the
/// n8n-style input globals (`items`, `_input`, `variables`, `node_outputs`,
/// `execution_id`) rendered as plain Python literals — no `json` import and no
/// escaping pitfalls from embedding raw JSON inside source text.
pub fn prelude(env: &JsEnv) -> String {
    let items = py_literal(&Value::Array(env.items.clone()));
    let outputs = Value::Object(
        env.node_outputs
            .iter()
            .map(|(name, values)| (name.clone(), Value::Array(values.clone())))
            .collect(),
    );
    let vars = Value::Object(env.vars.iter().map(|(name, value)| (name.clone(), value.clone())).collect());
    format!(
        "import sys as __gs_sys\n\
         import builtins as __gs_builtins\n\
         {LOGS_VAR} = []\n\
         class __gs_Stream:\n\
         \x20   def write(self, s):\n\
         \x20       if s:\n\
         \x20           {LOGS_VAR}.append(str(s))\n\
         \x20       return len(s)\n\
         \x20   def flush(self):\n\
         \x20       return 0\n\
         __gs_stream = __gs_Stream()\n\
         __gs_sys.stdout = __gs_stream\n\
         __gs_sys.stderr = __gs_stream\n\
         __gs_builtins.print = lambda *args, sep=' ', end='\\n', **kwargs: {LOGS_VAR}.append(sep.join(str(a) for a in args) + end)\n\
         items = {items}\n\
         _input = items\n\
         variables = {variables}\n\
         node_outputs = {outputs}\n\
         execution_id = {execution_id}\n",
        variables = py_literal(&vars),
        outputs = py_literal(&outputs),
        execution_id = py_literal(&Value::String(env.execution_id.clone())),
    )
}

/// Wraps the user's body as `def main():` so scripts can `return` values the
/// same way they did under the external runner. Blank lines stay unindented
/// (Python allows that inside a block).
pub fn wrap_main(code: &str) -> String {
    let normalized = code.replace("\r\n", "\n").replace('\r', "\n");
    let mut body = String::new();
    let mut has_code = false;
    for line in normalized.split('\n') {
        if line.trim().is_empty() {
            body.push('\n');
        } else {
            has_code = true;
            body.push_str("    ");
            body.push_str(line);
            body.push('\n');
        }
    }
    if !has_code {
        body.push_str("    pass\n");
    }
    format!("def main():\n{body}")
}

/// Renders a JSON value as a Python literal (`None`/`True`/`False`, quoted
/// strings, list/dict displays). JSON and Python literals differ in the
/// boolean/null spellings and in string escapes, so this walks the value tree
/// instead of splicing `serde_json` text into the source.
pub fn py_literal(value: &Value) -> String {
    match value {
        Value::Null => "None".to_string(),
        Value::Bool(true) => "True".to_string(),
        Value::Bool(false) => "False".to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => py_string(s),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(py_literal).collect();
            format!("[{}]", parts.join(", "))
        }
        Value::Object(map) => {
            let parts: Vec<String> = map
                .iter()
                .map(|(key, value)| format!("{}: {}", py_string(key), py_literal(value)))
                .collect();
            format!("{{{}}}", parts.join(", "))
        }
    }
}

fn py_string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 || c == '\u{7f}' => out.push_str(&format!("\\x{:02x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Converts a Python object produced by the script into plain JSON. Values the
/// serializer cannot represent (big ints, exotic keys) fall back to their
/// `repr` so a script never fails just because of its output shape.
pub fn to_json(vm: &VirtualMachine, obj: &PyObject) -> Value {
    serde_json::to_value(py_serde::PyObjectSerializer::new(vm, obj))
        .unwrap_or_else(|_| Value::String(repr_of(vm, obj)))
}

fn repr_of(vm: &VirtualMachine, obj: &PyObject) -> String {
    vm.call_method(obj, "__repr__", ())
        .ok()
        .and_then(|text| text.downcast::<builtins::PyStr>().ok())
        .map(|text| text.to_string())
        .unwrap_or_else(|| "<unrepresentable>".to_string())
}

/// Renders a Python exception as the traceback the user needs to read.
pub fn render_exception(vm: &VirtualMachine, exc: &Py<PyBaseException>) -> String {
    let mut trace = String::new();
    if vm.write_exception(&mut trace, exc).is_err() {
        return "el script falló sin detalle".to_string();
    }
    trace.trim_end().to_string()
}
