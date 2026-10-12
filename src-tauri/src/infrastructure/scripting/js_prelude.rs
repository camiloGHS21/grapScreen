//! JavaScript prelude: the globals a script sees before its own code runs.
//!
//! Assembled as one IIFE that publishes everything through `globalThis`, so
//! nothing depends on global lexical bindings surviving across `eval` calls.

use super::js_shims::JsEnv;

/// Builds the prelude source from the environment. Values are embedded as JSON
/// literals (valid JavaScript expressions).
pub fn build_prelude(env: &JsEnv) -> Result<String, String> {
    let items = json_literal(&env.items)?;
    let nodes = json_literal(&env.node_outputs)?;
    let vars = json_literal(&env.vars)?;
    let execution_id = json_literal(&env.execution_id)?;

    Ok(format!(
        r#"(function () {{
  var __items = {items};
  var __nodes = {nodes};
  var __vars = {vars};
  var __execution = {{ id: {execution_id}, mode: "internal", resumed: false }};

  var __console = {{
    log: function () {{ return __grapscreen_log.apply(null, arguments); }},
    info: function () {{ return __grapscreen_log.apply(null, arguments); }},
    warn: function () {{ return __grapscreen_log.apply(null, arguments); }},
    error: function () {{ return __grapscreen_log.apply(null, arguments); }},
    debug: function () {{ return __grapscreen_log.apply(null, arguments); }}
  }};

  var __fs = {{
    readFileSync: function (p, enc) {{ return __grapscreen_fs_read(String(p), enc); }},
    writeFileSync: function (p, data) {{ return __grapscreen_fs_write(String(p), String(data)); }},
    appendFileSync: function (p, data) {{ return __grapscreen_fs_append(String(p), String(data)); }},
    existsSync: function (p) {{ return __grapscreen_fs_exists(String(p)); }},
    mkdirSync: function (p) {{ return __grapscreen_fs_mkdir(String(p)); }},
    readdirSync: function (p) {{ return __grapscreen_fs_readdir(String(p)); }},
    unlinkSync: function (p) {{ return __grapscreen_fs_unlink(String(p)); }},
    rmSync: function (p) {{ return __grapscreen_fs_unlink(String(p)); }}
  }};
  var __path = {{
    join: function () {{ return __grapscreen_path_op("join", Array.prototype.slice.call(arguments).map(String)); }},
    resolve: function () {{ return __grapscreen_path_op("resolve", Array.prototype.slice.call(arguments).map(String)); }},
    dirname: function (p) {{ return __grapscreen_path_op("dirname", [String(p)]); }},
    basename: function (p) {{ return __grapscreen_path_op("basename", [String(p)]); }},
    extname: function (p) {{ return __grapscreen_path_op("extname", [String(p)]); }},
    sep: __grapscreen_path_op("sep", [])
  }};
  var __os = {{
    platform: function () {{ return __grapscreen_os_op("platform"); }},
    tmpdir: function () {{ return __grapscreen_os_op("tmpdir"); }},
    EOL: __grapscreen_os_op("eol")
  }};
  var __util = {{
    inspect: function (v) {{ try {{ return JSON.stringify(v); }} catch (e) {{ return String(v); }} }},
    format: function () {{ return Array.prototype.slice.call(arguments).map(String).join(" "); }}
  }};

  var __modules = {{
    fs: __fs, "node:fs": __fs,
    path: __path, "node:path": __path,
    os: __os, "node:os": __os,
    util: __util, "node:util": __util
  }};
  function __require(name) {{
    var mod = __modules[String(name)];
    if (!mod) throw new Error("Módulo no disponible en el motor embebido: " + name);
    return mod;
  }}

  function __node_entry(outputs) {{
    return {{
      all: function () {{ return outputs; }},
      first: function () {{ return outputs.length ? outputs[0] : {{}}; }},
      last: function () {{ return outputs.length ? outputs[outputs.length - 1] : {{}}; }},
      item: outputs.length ? outputs[0] : {{}},
      json: outputs.length ? outputs[0] : {{}},
      context: {{}}
    }};
  }}
  var __node = {{}};
  for (var __name in __nodes) {{ if (Object.prototype.hasOwnProperty.call(__nodes, __name)) {{ __node[__name] = __node_entry(__nodes[__name]); }} }}

  var __now = new Date();
  var __input = {{
    all: function () {{ return __items; }},
    first: function () {{ return __items.length ? __items[0] : {{}}; }},
    last: function () {{ return __items.length ? __items[__items.length - 1] : {{}}; }},
    item: __items.length ? __items[0] : {{}},
    params: {{}}
  }};
  var __helpers = {{
    returnJsonArray: function (items) {{
      if (!Array.isArray(items)) return [{{ json: items }}];
      return items.map(function (it) {{ return it && it.json !== undefined ? it : {{ json: it }}; }});
    }},
    httpRequest: function (opts) {{ return __grapscreen_http(opts); }},
    assertValidData: function () {{}}
  }};

  if (!String.raw) {{
    String.raw = function (strings) {{
      var values = Array.prototype.slice.call(arguments, 1);
      var out = "";
      for (var i = 0; i < strings.length; i++) {{ out += strings[i] + (i < values.length ? String(values[i]) : ""); }}
      return out;
    }};
  }}
  if (typeof setTimeout === "undefined") {{
    globalThis.setTimeout = function (fn) {{ Promise.resolve().then(fn); return 0; }};
    globalThis.clearTimeout = function () {{}};
    globalThis.setInterval = function () {{ return 0; }};
    globalThis.clearInterval = function () {{}};
  }}

  globalThis.console = __console;
  globalThis.fs = __fs;
  globalThis.path = __path;
  globalThis.os = __os;
  globalThis.require = __require;
  globalThis.__grapscreen_import = function (name) {{ return Promise.resolve(__require(name)); }};
  globalThis.items = __items;
  globalThis.$input = __input;
  globalThis.$json = __items.length ? __items[0] : {{}};
  globalThis.$node = __node;
  globalThis.$vars = __vars;
  globalThis.$env = {{}};
  globalThis.$execution = __execution;
  globalThis.$now = __now;
  globalThis.$today = new Date(__now.getFullYear(), __now.getMonth(), __now.getDate());
  globalThis.$timestamp = __now.getTime();
  globalThis.helpers = __helpers;
  globalThis.process = {{ env: {{}}, platform: __grapscreen_os_op("platform"), cwd: function () {{ return __grapscreen_path_op("resolve", []); }} }};
}})();
"#,
        items = items,
        nodes = nodes,
        vars = vars,
        execution_id = execution_id,
    ))
}

fn json_literal<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| format!("no se pudo serializar el entorno del script: {e}"))
}
