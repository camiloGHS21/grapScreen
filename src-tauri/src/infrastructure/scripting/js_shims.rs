//! Host environment (shims) exposed to embedded JavaScript.
//!
//! Provides the slice of the Node / n8n surface that the workflow templates
//! and real n8n `Code` nodes rely on: `console`, `fs`, `path`, `os`,
//! `require`/`import()`, the `$`-globals (`$input`, `$json`, `$node`, `$vars`,
//! `$now`…) and `helpers`. Everything is implemented in Rust: the script never
//! touches a subprocess or the filesystem outside what these shims allow.

use boa_engine::{js_string, Context, JsNativeError, JsResult, JsValue, NativeFunction};
use serde_json::Value;
use std::collections::HashMap;

/// Environment a script sees. Built by the application layer so this module
/// stays free of workflow semantics.
#[derive(Debug, Default, Clone)]
pub struct JsEnv {
    /// The items flowing into the node (`$input.all()`, `items`).
    pub items: Vec<Value>,
    /// Outputs of upstream nodes, for `$node["Name"].all()` look-ups.
    pub node_outputs: HashMap<String, Vec<Value>>,
    /// Workflow variables for `$vars`.
    pub vars: HashMap<String, Value>,
    /// Execution id for `$execution.id`.
    pub execution_id: String,
}

/// Rewrites dynamic `import(...)` calls to the embedded loader.
///
/// The embedded engine has no module loader, so `await import('node:fs')` is
/// routed through `__grapscreen_import`, which resolves the same module object
/// that `require()` returns. Word-boundary matched so identifiers such as
/// `reimport(` are left alone.
pub fn rewrite_imports(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let bytes = code.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if code[i..].starts_with("import") {
            let before_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
            let after = i + 6;
            let after_ok = after >= bytes.len() || !is_ident_byte(bytes[after]);
            if before_ok && after_ok {
                let rest = &code[after..];
                let trimmed = rest.trim_start();
                let gap = rest.len() - trimmed.len();
                if trimmed.starts_with('(') {
                    out.push_str("__grapscreen_import");
                    out.push_str(&rest[..gap + 1]);
                    i = after + gap + 1;
                    continue;
                }
            }
        }
        let ch_len = code[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
        out.push_str(&code[i..i + ch_len]);
        i += ch_len;
    }
    out
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Installs every global the script can see.
pub fn install(context: &mut Context, env: &JsEnv) -> JsResult<()> {
    install_natives(context)?;
    let prelude = super::js_prelude::build_prelude(env).map_err(err)?;
    context.eval(boa_engine::Source::from_bytes(&prelude))?;
    Ok(())
}

fn install_natives(context: &mut Context) -> JsResult<()> {
    context.register_global_callable(js_string!("__grapscreen_log"), 1, NativeFunction::from_fn_ptr(native_log))?;
    context.register_global_callable(js_string!("__grapscreen_set_result"), 1, NativeFunction::from_fn_ptr(native_set_result))?;
    context.register_global_callable(js_string!("__grapscreen_set_error"), 1, NativeFunction::from_fn_ptr(native_set_error))?;
    context.register_global_callable(js_string!("__grapscreen_fs_read"), 2, NativeFunction::from_fn_ptr(native_fs_read))?;
    context.register_global_callable(js_string!("__grapscreen_fs_write"), 2, NativeFunction::from_fn_ptr(native_fs_write))?;
    context.register_global_callable(js_string!("__grapscreen_fs_append"), 2, NativeFunction::from_fn_ptr(native_fs_append))?;
    context.register_global_callable(js_string!("__grapscreen_fs_exists"), 1, NativeFunction::from_fn_ptr(native_fs_exists))?;
    context.register_global_callable(js_string!("__grapscreen_fs_mkdir"), 1, NativeFunction::from_fn_ptr(native_fs_mkdir))?;
    context.register_global_callable(js_string!("__grapscreen_fs_readdir"), 1, NativeFunction::from_fn_ptr(native_fs_readdir))?;
    context.register_global_callable(js_string!("__grapscreen_fs_unlink"), 1, NativeFunction::from_fn_ptr(native_fs_unlink))?;
    context.register_global_callable(js_string!("__grapscreen_path_op"), 2, NativeFunction::from_fn_ptr(native_path_op))?;
    context.register_global_callable(js_string!("__grapscreen_os_op"), 1, NativeFunction::from_fn_ptr(native_os_op))?;
    context.register_global_callable(js_string!("__grapscreen_http"), 1, NativeFunction::from_fn_ptr(native_http))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// value helpers
// ---------------------------------------------------------------------------

fn to_text(value: &JsValue, context: &mut Context) -> JsResult<String> {
    if value.is_string() {
        return Ok(value.as_string().map(|s| s.to_std_string_escaped()).unwrap_or_default());
    }
    Ok(value.to_string(context)?.to_std_string_escaped())
}

fn value_to_json(value: &JsValue, context: &mut Context) -> JsResult<Value> {
    Ok(value.to_json(context)?.unwrap_or(Value::Null))
}

fn err(message: impl Into<String>) -> boa_engine::JsError {
    JsNativeError::error().with_message(message.into()).into()
}

// ---------------------------------------------------------------------------
// native functions
// ---------------------------------------------------------------------------

fn native_log(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let mut parts = Vec::with_capacity(args.len());
    for arg in args {
        if arg.is_string() {
            parts.push(arg.as_string().map(|s| s.to_std_string_escaped()).unwrap_or_default());
        } else {
            parts.push(value_to_json(arg, context)?.to_string());
        }
    }
    super::js_engine::push_log(parts.join(" "));
    Ok(JsValue::undefined())
}

fn native_set_result(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let value = args.first().cloned().unwrap_or(JsValue::undefined());
    if value.is_undefined() || value.is_null() {
        super::js_engine::set_result(None);
    } else {
        super::js_engine::set_result(Some(value_to_json(&value, context)?));
    }
    Ok(JsValue::undefined())
}

fn native_set_error(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let value = args.first().cloned().unwrap_or(JsValue::undefined());
    let mut message = to_text(&value, context)?;
    if let Some(json) = value.to_json(context)? {
        if let Some(m) = json.get("message").and_then(|m| m.as_str()) {
            let name = json.get("name").and_then(|n| n.as_str()).unwrap_or("Error");
            message = format!("{name}: {m}");
        }
    }
    super::js_engine::set_error(message);
    Ok(JsValue::undefined())
}

fn native_fs_read(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    std::fs::read_to_string(&path)
        .map(|text| JsValue::from(js_string!(text)))
        .map_err(|e| err(format!("fs.readFileSync('{path}'): {e}")))
}

fn native_fs_write(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let data = to_text(args.get(1).unwrap_or(&JsValue::undefined()), context)?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, data).map_err(|e| err(format!("fs.writeFileSync('{path}'): {e}")))?;
    Ok(JsValue::undefined())
}

fn native_fs_append(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    use std::io::Write;
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let data = to_text(args.get(1).unwrap_or(&JsValue::undefined()), context)?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| err(format!("fs.appendFileSync('{path}'): {e}")))?;
    file.write_all(data.as_bytes()).map_err(|e| err(format!("fs.appendFileSync('{path}'): {e}")))?;
    Ok(JsValue::undefined())
}

fn native_fs_exists(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    Ok(JsValue::from(std::path::Path::new(&path).exists()))
}

fn native_fs_mkdir(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    std::fs::create_dir_all(&path).map_err(|e| err(format!("fs.mkdirSync('{path}'): {e}")))?;
    Ok(JsValue::undefined())
}

fn native_fs_readdir(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let entries = std::fs::read_dir(&path).map_err(|e| err(format!("fs.readdirSync('{path}'): {e}")))?;
    let names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    JsValue::from_json(&Value::Array(names.into_iter().map(Value::String).collect()), context)
}

fn native_fs_unlink(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let path = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let result = std::fs::remove_file(&path).or_else(|_| std::fs::remove_dir_all(&path));
    result.map_err(|e| err(format!("fs.unlinkSync('{path}'): {e}")))?;
    Ok(JsValue::undefined())
}

fn native_path_op(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let op = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let rest: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| to_text(a, context))
        .collect::<JsResult<_>>()?;
    let joined = || rest.iter().map(std::path::PathBuf::from).collect::<std::path::PathBuf>();
    let text = match op.as_str() {
        "join" => joined().to_string_lossy().to_string(),
        "resolve" => {
            let mut base = std::env::current_dir().unwrap_or_default();
            for part in &rest {
                base.push(part);
            }
            base.to_string_lossy().to_string()
        }
        "dirname" => std::path::Path::new(rest.first().map(String::as_str).unwrap_or(""))
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        "basename" => std::path::Path::new(rest.first().map(String::as_str).unwrap_or(""))
            .file_name()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        "extname" => std::path::Path::new(rest.first().map(String::as_str).unwrap_or(""))
            .extension()
            .map(|p| format!(".{}", p.to_string_lossy()))
            .unwrap_or_default(),
        "sep" => std::path::MAIN_SEPARATOR.to_string(),
        _ => return Err(err(format!("path.{op}: operación no soportada"))),
    };
    Ok(JsValue::from(js_string!(text)))
}

fn native_os_op(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let op = to_text(args.first().unwrap_or(&JsValue::undefined()), context)?;
    match op.as_str() {
        "platform" => Ok(JsValue::from(js_string!(std::env::consts::OS))),
        "tmpdir" => Ok(JsValue::from(js_string!(std::env::temp_dir().to_string_lossy().to_string()))),
        "eol" => Ok(JsValue::from(js_string!("\n"))),
        _ => Err(err(format!("os.{op}: operación no soportada"))),
    }
}

/// Minimal `helpers.httpRequest(opts)` — synchronous, JSON or text responses.
fn native_http(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let opts = value_to_json(args.first().unwrap_or(&JsValue::undefined()), context)?;
    let url = opts
        .get("url")
        .and_then(Value::as_str)
        .or_else(|| opts.get("uri").and_then(Value::as_str))
        .ok_or_else(|| err("helpers.httpRequest: falta la URL"))?;
    let method = opts.get("method").and_then(Value::as_str).unwrap_or("GET");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| err(format!("helpers.httpRequest: {e}")))?;
    let mut request = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
        url,
    );
    if let Some(headers) = opts.get("headers").and_then(Value::as_object) {
        for (key, value) in headers {
            if let Some(text) = value.as_str() {
                request = request.header(key.as_str(), text);
            }
        }
    }
    if let Some(body) = opts.get("body") {
        request = request.body(body.to_string());
    }
    let response = request.send().map_err(|e| err(format!("helpers.httpRequest: {e}")))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if opts.get("returnFullResponse").and_then(Value::as_bool).unwrap_or(false) {
        JsValue::from_json(
            &serde_json::json!({ "statusCode": status, "body": text }),
            context,
        )
    } else {
        Ok(JsValue::from(js_string!(text)))
    }
}
