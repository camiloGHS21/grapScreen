//! Native Rust runners for n8n utility nodes:
//! - ExecuteCommand: executes shell commands, capturing stdout/stderr/exitCode
//! - ReadWriteFile: reads or writes files on the local filesystem
//! - SpreadsheetFile: reads or writes Excel (.xlsx) / CSV files
//! - Code: executes JavaScript on the embedded Boa engine (or Python via interpreter)

use crate::application::replay_helpers::{self, interpolate_variables};
use serde_json::{json, Map, Value};
use std::path::Path;

/// Resolves a config value by checking direct fields and `n8n_config`.
pub fn cfg_str(data: &Value, key: &str, alt_keys: &[&str]) -> String {
    for k in std::iter::once(&key).chain(alt_keys.iter()) {
        if let Some(s) = data.get(*k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
            return s.to_string();
        }
        if let Some(s) = data.get("n8n_config").and_then(|c| c.get(*k)).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
            return s.to_string();
        }
    }
    String::new()
}

/// Native runner for `ExecuteCommand` (n8n `executeCommand`).
pub fn run_execute_command(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let raw_cmd = cfg_str(data, "command", &["cmd", "execute"]);
    if raw_cmd.trim().is_empty() {
        return Err("ExecuteCommand: falta el comando a ejecutar".into());
    }
    let raw_args = cfg_str(data, "args", &["arguments"]);
    let continue_on_fail = data.get("continueOnFail").and_then(|v| v.as_bool())
        .or_else(|| data.get("n8n_config").and_then(|c| c.get("continueOnFail")).and_then(|v| v.as_bool()))
        .unwrap_or(false);

    let targets = if items.is_empty() { vec![Value::Null] } else { items };
    let mut outputs = Vec::new();

    for item in targets {
        let cmd_interp = interpolate_variables(&raw_cmd);
        let args_interp = interpolate_variables(&raw_args);

        #[cfg(target_os = "windows")]
        let mut proc = {
            let mut c = std::process::Command::new("cmd");
            c.arg("/C").arg(&cmd_interp);
            c
        };
        #[cfg(not(target_os = "windows"))]
        let mut proc = {
            let mut c = std::process::Command::new("sh");
            c.arg("-c").arg(&cmd_interp);
            c
        };

        if !args_interp.trim().is_empty() {
            for arg in args_interp.split_whitespace() {
                proc.arg(arg);
            }
        }

        let out = proc.output().map_err(|e| format!("ExecuteCommand: error al invocar comando: {}", e))?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let exit_code = out.status.code().unwrap_or(if out.status.success() { 0 } else { 1 });

        if exit_code != 0 && !continue_on_fail {
            let err_msg = if !stderr.is_empty() { &stderr } else { &stdout };
            return Err(format!("ExecuteCommand devolvió error (código {}): {}", exit_code, err_msg));
        }

        let mut row = Map::new();
        row.insert("stdout".into(), Value::String(stdout));
        row.insert("stderr".into(), Value::String(stderr));
        row.insert("exitCode".into(), Value::from(exit_code));
        row.insert("exit_code".into(), Value::from(exit_code));
        if let Value::Object(item_obj) = item {
            for (k, v) in item_obj {
                row.entry(k).or_insert(v);
            }
        }
        outputs.push(Value::Object(row));
    }
    Ok(outputs)
}

/// Native runner for `ReadWriteFile` / `ReadBinaryFile` / `WriteBinaryFile`.
pub fn run_read_write_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let op = cfg_str(data, "operation", &["mode"]).to_lowercase();
    if op == "write" || op == "writebinaryfile" {
        run_write_file(data, items)
    } else {
        run_read_file(data, items)
    }
}

/// Native runner for `read_file` (delegating to core_nodes or binary_data).
pub fn run_read_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    if super::binary_data::is_binary_op(data, &items) {
        return super::binary_data::run_read_binary_file(data, items);
    }
    let path = cfg_str(data, "file_path", &["filePath", "path", "filename"]);
    let mut normalized = data.clone();
    if !path.is_empty() {
        normalized["file_path"] = Value::String(path);
    }
    let res = super::core_nodes::run_read_file(&normalized, items)?;
    Ok(res.into_iter().map(|mut it| {
        if let Value::Object(ref mut map) = it {
            if let Some(d) = map.get("data").cloned() {
                map.entry("content".to_string()).or_insert(d);
            }
        }
        it
    }).collect())
}

/// Native runner for `write_file` (delegating to core_nodes or binary_data).
pub fn run_write_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    if super::binary_data::is_binary_op(data, &items) {
        return super::binary_data::run_write_binary_file(data, items);
    }
    let path = cfg_str(data, "file_path", &["filePath", "path", "filename"]);
    let content = cfg_str(data, "content", &["data", "value"]);
    let mut normalized = data.clone();
    if !path.is_empty() {
        normalized["file_path"] = Value::String(path);
    }
    if !content.is_empty() && normalized.get("content").is_none() {
        normalized["content"] = Value::String(content);
    }
    super::core_nodes::run_write_file(&normalized, items)
}

/// Native runner for `SpreadsheetFile` (Excel .xlsx and CSV reader/writer).
pub fn run_spreadsheet_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let raw_path = cfg_str(data, "file_path", &["filePath", "path", "filename"]);
    if raw_path.trim().is_empty() {
        return Err("SpreadsheetFile: indica la ruta del archivo (file_path / filePath)".into());
    }
    let path_str = interpolate_variables(&raw_path);
    let path = Path::new(&path_str);
    let is_xlsx = path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("xlsx")).unwrap_or(false);
    let op = cfg_str(data, "operation", &["mode"]).to_lowercase();
    let is_read = op == "fromfile" || op == "read" || op == "readfromfile";

    if is_read {
        if !path.exists() {
            return Err(format!("SpreadsheetFile: el archivo '{}' no existe", path.display()));
        }
        if is_xlsx {
            let rows = crate::application::xlsx_writer::read_xlsx_rows(path)
                .ok_or_else(|| format!("SpreadsheetFile: no se pudo leer el archivo Excel '{}'", path.display()))?;
            if rows.is_empty() {
                return Ok(vec![]);
            }
            let headers = &rows[0];
            let mut out = Vec::new();
            for r in rows.iter().skip(1) {
                let mut map = Map::new();
                for (ci, h) in headers.iter().enumerate() {
                    let val = r.get(ci).cloned().unwrap_or_default();
                    map.insert(h.clone(), Value::String(val));
                }
                out.push(Value::Object(map));
            }
            return Ok(out);
        } else {
            let text = std::fs::read_to_string(path).map_err(|e| format!("SpreadsheetFile: {}", e))?;
            let mut lines = text.lines();
            let header_line = match lines.next() {
                Some(l) if !l.trim().is_empty() => l,
                _ => return Ok(vec![]),
            };
            let delim = if header_line.contains(';') { ';' } else { ',' };
            let headers: Vec<String> = header_line.split(delim).map(|s| s.trim().trim_matches('"').to_string()).collect();
            let mut out = Vec::new();
            for line in lines {
                if line.trim().is_empty() { continue; }
                let cells: Vec<String> = line.split(delim).map(|s| s.trim().trim_matches('"').to_string()).collect();
                let mut map = Map::new();
                for (ci, h) in headers.iter().enumerate() {
                    let val = cells.get(ci).cloned().unwrap_or_default();
                    map.insert(h.clone(), Value::String(val));
                }
                out.push(Value::Object(map));
            }
            return Ok(out);
        }
    }

    // Write operation: format incoming items as rows
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Engine items arrive wrapped in the `{"json": …}` envelope; the columns
    // are the payload's fields — exactly what `$json` resolves against.
    let payloads: Vec<Value> = items
        .iter()
        .map(crate::application::expressions::unwrap_item)
        .collect();
    let mut headers: Vec<String> = Vec::new();
    for it in &payloads {
        if let Value::Object(obj) = it {
            for k in obj.keys() {
                if !headers.contains(k) {
                    headers.push(k.clone());
                }
            }
        }
    }
    let mut rows: Vec<Vec<String>> = Vec::new();
    for it in &payloads {
        if let Value::Object(obj) = it {
            let mut r = Vec::new();
            for h in &headers {
                let val = match obj.get(h) {
                    Some(Value::String(s)) => s.clone(),
                    Some(v) => v.to_string(),
                    None => String::new(),
                };
                r.push(val);
            }
            rows.push(r);
        }
    }

    if is_xlsx {
        crate::application::xlsx_writer::write_xlsx(path, &headers, &rows)
            .map_err(|e| format!("SpreadsheetFile: no se pudo escribir '{}': {}", path.display(), e))?;
    } else {
        let mut content = headers.join(",") + "\n";
        for r in rows {
            content.push_str(&r.join(","));
            content.push('\n');
        }
        std::fs::write(path, content).map_err(|e| format!("SpreadsheetFile: no se pudo escribir '{}': {}", path.display(), e))?;
    }

    Ok(items)
}

/// Native runner for `Code` (n8n `code`).
///
/// JavaScript runs on the **embedded Boa engine inside the Rust process**: no
/// `node`, no temp files, no subprocess. The script body is interpolated first
/// so `{{ ... }}` expressions (e.g. `{{ $json.file_path }}`) resolve against the
/// node's items/vars exactly like they do in n8n.
///
/// Result contract (kept from the external runner): an explicit `return`
/// becomes the items (array → items, single value → one item); otherwise the
/// last printed JSON line wins; otherwise the logs become `{ output }`; and a
/// script that produced nothing lets the incoming items flow through.
pub fn run_code(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let raw_code = cfg_str(data, "code", &["jsCode", "pythonCode", "script"]);
    if raw_code.trim().is_empty() {
        return Ok(items);
    }
    let code = replay_helpers::eval_template(&raw_code);
    let lang = cfg_str(data, "language", &["lang"]).to_lowercase();
    if lang.starts_with("py") {
        return run_code_python(&code, items);
    }

    let env = crate::infrastructure::scripting::js_shims::JsEnv {
        items: items.clone(),
        node_outputs: replay_helpers::get_node_outputs(),
        vars: replay_helpers::get_all_vars()
            .into_iter()
            .map(|(k, v)| (k, Value::String(v)))
            .collect(),
        execution_id: String::new(),
    };

    let outcome = crate::infrastructure::scripting::run_js(&code, &env)?;
    if let Some(result_items) = outcome.items {
        return Ok(result_items);
    }
    if !outcome.logs.is_empty() {
        let joined = outcome.logs.join("\n");
        if let Ok(parsed) = serde_json::from_str::<Value>(joined.trim()) {
            return Ok(match parsed {
                Value::Array(arr) => arr,
                other => vec![other],
            });
        }
        for line in outcome.logs.iter().rev() {
            if let Ok(parsed) = serde_json::from_str::<Value>(line.trim()) {
                return Ok(match parsed {
                    Value::Array(arr) => arr,
                    other => vec![other],
                });
            }
        }
        return Ok(vec![json!({ "output": joined })]);
    }
    Ok(items)
}

/// Python `Code` scripts still go through an interpreter (RustPython is not
/// bundled yet); JavaScript never leaves the Rust process.
fn run_code_python(code: &str, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let items_json = serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string());
    let file_path = std::env::temp_dir().join(format!("grapscreen_run_code_{}.py", std::process::id()));
    let wrapped_script = format!(
        "import sys, json\n_input = json.loads('''{}''')\ndef main():\n{}\nif __name__ == '__main__':\n    res = main()\n    if res is not None:\n        print(json.dumps(res))\n",
        items_json.replace('\\', "\\\\").replace('\'', "\\'"),
        code.lines().map(|l| format!("    {}", l)).collect::<Vec<_>>().join("\n")
    );
    std::fs::write(&file_path, &wrapped_script)
        .map_err(|e| format!("Code: no se pudo escribir script temporal: {}", e))?;
    let result = std::process::Command::new("python").arg(&file_path).output();
    let _ = std::fs::remove_file(&file_path);
    match result {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if !out.status.success() {
                return Err(format!("Code: script terminó con error: {}", if stderr.is_empty() { stdout } else { stderr }));
            }
            if let Ok(parsed) = serde_json::from_str::<Value>(&stdout) {
                return Ok(match parsed {
                    Value::Array(arr) => arr,
                    other => vec![other],
                });
            }
            if !stdout.is_empty() {
                return Ok(vec![json!({ "output": stdout })]);
            }
            Ok(items)
        }
        Err(e) => Err(format!("Code: no se encontró 'python' ({})", e)),
    }
}
