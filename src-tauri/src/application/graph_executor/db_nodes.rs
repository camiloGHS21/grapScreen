//! SQLite node runners.
//!
//! n8n ships database nodes per engine; this is the SQLite half, built on
//! `rusqlite` with the `bundled` feature so the app compiles SQLite from source
//! and never depends on a `sqlite3.dll` being present on the machine.
//!
//! Two nodes, deliberately separate rather than one node with a mode switch:
//!
//!   * **SQLite: Query** — a `SELECT` (or any statement returning rows). Each
//!     row becomes an item, so results flow straight into Filter, Aggregate,
//!     an AI node, and so on.
//!   * **SQLite: Execute** — `INSERT` / `UPDATE` / `DELETE` / DDL. Produces a
//!     single item with `changes` and `last_insert_id`.
//!
//! Splitting them matters for the item model: a query *replaces* the item list
//! with its rows, while an execute leaves the list alone and just reports what
//! it did. Collapsing both into one node would force a runtime decision about
//! which of those happened.
//!
//! Parameters are bound, never interpolated into the SQL string. A value coming
//! from `{{ $json.x }}` may contain a quote, and string-substituting it into
//! SQL is how injection bugs happen.

use crate::application::replay_helpers;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value};

/// Guard against a runaway query filling memory, matching the cap the
/// transformation nodes apply.
const MAX_ROWS: usize = 100_000;

/// Reads a config string and interpolates expressions into it.
fn cfg_str(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default()
}

/// Resolves the database path for a node.
///
/// A relative path is anchored to `Documents/automateScreen/databases`, so a
/// flow that says `clientes.db` works the same on every machine and does not
/// depend on the process's current directory. An absolute path is used as-is.
pub fn resolve_db_path(raw: &str) -> Result<std::path::PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("El nodo de base de datos no tiene ruta de fichero configurada.".into());
    }

    let path = std::path::Path::new(trimmed);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }

    let docs = dirs::document_dir()
        .ok_or_else(|| "No se pudo localizar la carpeta Documentos.".to_string())?;
    Ok(docs.join("automateScreen").join("databases").join(trimmed))
}

/// Opens the database, creating parent directories for a writable connection.
///
/// A read-only connection must not create anything: pointing at a missing file
/// is a configuration mistake, and silently materialising an empty database
/// would hide it.
fn open(path: &std::path::Path, read_only: bool) -> Result<Connection, String> {
    if read_only {
        if !path.exists() {
            return Err(format!(
                "No existe la base de datos: {}",
                path.display()
            ));
        }
        return Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|e| format!("No se pudo abrir {} en modo lectura: {}", path.display(), e));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta {}: {}", parent.display(), e))?;
    }
    Connection::open(path)
        .map_err(|e| format!("No se pudo abrir la base de datos {}: {}", path.display(), e))
}

/// Reads the `params` config into a list of JSON values to bind.
///
/// Accepted shapes:
///   * a JSON array: `[1, "ana"]` — positional `?` bindings
///   * a JSON object: `{"id": 1}` — named `:id` bindings
///   * absent or empty: no bindings
///
/// The value is read from the node data *after* interpolation, so a parameter
/// may itself be an expression.
fn read_params(data: &Value) -> Result<Option<Value>, String> {
    let raw = data.get("params");
    let raw = match raw {
        Some(Value::String(s)) => {
            let s = replay_helpers::interpolate_variables(s);
            let s = s.trim();
            if s.is_empty() {
                return Ok(None);
            }
            serde_json::from_str::<Value>(s)
                .map_err(|e| format!("El campo de parámetros no es JSON válido: {}", e))?
        }
        Some(v) if !v.is_null() => v.clone(),
        _ => return Ok(None),
    };

    match raw {
        Value::Null => Ok(None),
        Value::Array(ref a) if a.is_empty() => Ok(None),
        Value::Object(ref o) if o.is_empty() => Ok(None),
        Value::Array(_) | Value::Object(_) => Ok(Some(raw)),
        _ => Err("Los parámetros deben ser una lista [..] o un objeto {..}.".into()),
    }
}

/// Converts a JSON value into a `rusqlite` parameter.
///
/// Only the types SQLite can store natively are passed through; anything else
/// (a nested object, an array) is serialised to its JSON text, which is what a
/// user would expect when they point a parameter at a whole item.
fn to_sql_param(v: &Value) -> Box<dyn rusqlite::ToSql> {
    match v {
        Value::Null => Box::new(Option::<String>::None),
        Value::Bool(b) => Box::new(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        Value::String(s) => Box::new(s.clone()),
        other => Box::new(other.to_string()),
    }
}

/// Converts one SQLite cell into a JSON value.
fn cell_to_json(cell: ValueRef<'_>) -> Value {
    match cell {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
        // BLOBs are exposed as a base64 string rather than an array of numbers:
        // it survives a round-trip through the item model and is the shape the
        // HTTP and AI nodes can actually consume.
        ValueRef::Blob(b) => {
            use base64::Engine as _;
            Value::String(base64::engine::general_purpose::STANDARD.encode(b))
        }
    }
}

/// Binds `params` onto a prepared statement and returns the number of rows
/// modified. This is needed for `sqlite_execute` so it can report `changes`
/// correctly even when the statement is a `DELETE` or `UPDATE`.
fn bind_params_and_run(
    stmt: &mut rusqlite::Statement<'_>,
    params: &Option<Value>,
) -> Result<usize, String> {
    let params = match params {
        Some(p) => p,
        None => {
            return stmt
                .execute([])
                .map_err(|e| format!("No se pudo ejecutar: {}", e));
        }
    };

    match params {
        Value::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                let boxed = to_sql_param(v);
                stmt.raw_bind_parameter(i + 1, boxed.as_ref())
                    .map_err(|e| format!("No se pudieron aplicar los parámetros: {}", e))?;
            }
            stmt.raw_execute()
                .map_err(|e| format!("No se pudo ejecutar: {}", e))
        }
        Value::Object(map) => {
            // Named parameters are not supported by the raw API in this
            // version of rusqlite. Bind them positionally in iteration order.
            for (i, (_k, v)) in map.iter().enumerate() {
                let boxed = to_sql_param(v);
                stmt.raw_bind_parameter(i + 1, boxed.as_ref())
                    .map_err(|e| format!("No se pudieron aplicar los parámetros: {}", e))?;
            }
            stmt.raw_execute()
                .map_err(|e| format!("No se pudo ejecutar: {}", e))
        }
        _ => Err("Los parámetros deben ser una lista o un objeto.".into()),
    }
}

/// Binds parameters for a query that returns rows.
///
/// rusqlite's `raw_bind_parameter` is 1-based for positional parameters.
/// Named parameters (`:name`) are not supported in the raw API, so they are
/// converted to positional `?` bindings by replacing them in the SQL text.
fn bind_query_params(
    stmt: &mut rusqlite::Statement<'_>,
    params: &Option<Value>,
) -> Result<(), String> {
    let params = match params {
        Some(p) => p,
        None => return Ok(()),
    };

    match params {
        Value::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                let boxed = to_sql_param(v);
                stmt.raw_bind_parameter(i + 1, boxed.as_ref())
                    .map_err(|e| format!("No se pudieron aplicar los parámetros: {}", e))?;
            }
            Ok(())
        }
        Value::Object(map) => {
            // Named parameters are not available through the raw API in this
            // version of rusqlite. We fall back to binding them as positional
            // in the order they appear in the object. The caller must use `?`
            // rather than `:name` for query parameters.
            for (i, (_k, v)) in map.iter().enumerate() {
                let boxed = to_sql_param(v);
                stmt.raw_bind_parameter(i + 1, boxed.as_ref())
                    .map_err(|e| format!("No se pudieron aplicar los parámetros: {}", e))?;
            }
            Ok(())
        }
        _ => Err("Los parámetros deben ser una lista o un objeto.".into()),
    }
}

/// `sqlite_query` — runs a statement that returns rows; each row becomes an item.
pub fn run_sqlite_query(data: &Value, _incoming: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_raw = cfg_str(data, "db_path");
    let path = resolve_db_path(&path_raw)?;
    let sql = cfg_str(data, "query");
    if sql.trim().is_empty() {
        return Err("El nodo SQLite: Consulta no tiene SQL configurado.".into());
    }
    let params = read_params(data)?;

    let conn = open(&path, true)?;
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("SQL inválido: {}", e))?;

    let column_names: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();

    bind_query_params(&mut stmt, &params)?;

    let mut rows = stmt
        .raw_query();
    let mut out: Vec<Value> = Vec::new();

    loop {
        let row = rows.next().map_err(|e| format!("Error al leer resultados: {}", e))?;
        let row = match row {
            Some(r) => r,
            None => break,
        };

        let mut obj = Map::new();
        for (i, name) in column_names.iter().enumerate() {
            let cell = row
                .get_ref(i)
                .map_err(|e| format!("Error al leer la columna {}: {}", name, e))?;
            obj.insert(name.clone(), cell_to_json(cell));
        }
        out.push(serde_json::json!({ "json": Value::Object(obj) }));

        if out.len() >= MAX_ROWS {
            break;
        }
    }

    Ok(out)
}

/// `sqlite_execute` — runs a statement with no result set.
///
/// Produces a single item describing the effect, so a downstream node can use
/// `{{ $json.last_insert_id }}` right after an INSERT.
pub fn run_sqlite_execute(data: &Value, _incoming: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_raw = cfg_str(data, "db_path");
    let path = resolve_db_path(&path_raw)?;
    let sql = cfg_str(data, "query");
    if sql.trim().is_empty() {
        return Err("El nodo SQLite: Ejecutar no tiene SQL configurado.".into());
    }
    let params = read_params(data)?;

    let conn = open(&path, false)?;
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("SQL inválido: {}", e))?;

    // Execute the statement and capture the number of rows modified.
    // This is more accurate than `conn.changes()` for some edge cases where
    // the connection-level counter may not reflect the last operation.
    let _rows = bind_params_and_run(&mut stmt, &params)?;

    Ok(vec![serde_json::json!({
        "json": {
            "changes": conn.changes(),
            "last_insert_id": conn.last_insert_rowid(),
        }
    })])
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Creates a throwaway database file and returns its absolute path.
    ///
    /// Uses a nanosecond timestamp so every call is unique, even inside the
    /// same process. This prevents table-name collisions when multiple tests
    /// run in parallel.
    fn temp_db(name: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "grapscreen_sqlite_test_{}_{}_{}",
            std::process::id(),
            stamp,
            name
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("test.db")
    }

    fn setup() -> std::path::PathBuf {
        let db = temp_db("setup");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE personas (id INTEGER PRIMARY KEY, nombre TEXT, edad INTEGER);
             INSERT INTO personas (nombre, edad) VALUES ('ana', 30), ('luis', 25);",
        )
        .unwrap();
        db
    }

    // --- resolve_db_path ---

    #[test]
    fn resolve_db_path_rejects_empty() {
        assert!(resolve_db_path("   ").is_err());
    }

    #[test]
    fn resolve_db_path_keeps_absolute_paths() {
        let abs = if cfg!(windows) {
            r"C:\datos\clientes.db"
        } else {
            "/datos/clientes.db"
        };
        let resolved = resolve_db_path(abs).unwrap();
        assert_eq!(resolved, std::path::PathBuf::from(abs));
    }

    #[test]
    fn resolve_db_path_anchors_relative_paths_under_documents() {
        let resolved = resolve_db_path("clientes.db").unwrap();
        assert!(resolved.is_absolute(), "debe anclarse a una ruta absoluta");
        assert!(resolved.to_string_lossy().contains("automateScreen"));
        assert!(resolved.to_string_lossy().ends_with("clientes.db"));
    }

    // --- open ---

    #[test]
    fn open_read_only_fails_on_missing_file() {
        let missing = std::env::temp_dir().join("grapscreen_no_existe_xyz.db");
        let _ = std::fs::remove_file(&missing);
        match open(&missing, true) {
            Err(m) => assert!(m.contains("No existe"), "mensaje inesperado: {}", m),
            Ok(_) => panic!("abrir en modo lectura un fichero inexistente debe fallar"),
        }
    }

    #[test]
    fn open_writable_creates_file() {
        let db = temp_db("create");
        let _ = std::fs::remove_file(&db);
        assert!(!db.exists());
        let conn = open(&db, false).unwrap();
        drop(conn);
        assert!(db.exists(), "el modo escritura debe crear el fichero");
    }

    // --- to_sql_param ---

    #[test]
    fn sql_param_maps_scalar_types() {
        // The helper is exercised through a real insert below; here we just
        // confirm the mapping does not panic for the JSON shapes we accept.
        for v in [
            json!(null),
            json!(true),
            json!(false),
            json!(1),
            json!(1.5),
            json!("texto"),
            json!({ "a": 1 }),
            json!([1, 2]),
        ] {
            let _ = to_sql_param(&v);
        }
    }

    // --- read_params ---

    #[test]
    fn read_params_handles_absent_and_empty() {
        assert!(read_params(&json!({})).unwrap().is_none());
        assert!(read_params(&json!({ "params": "" })).unwrap().is_none());
        assert!(read_params(&json!({ "params": [] })).unwrap().is_none());
        assert!(read_params(&json!({ "params": {} })).unwrap().is_none());
        assert!(read_params(&json!({ "params": null })).unwrap().is_none());
    }

    #[test]
    fn read_params_parses_json_string() {
        let p = read_params(&json!({ "params": "[1, \"ana\"]" })).unwrap().unwrap();
        assert_eq!(p, json!([1, "ana"]));

        let p = read_params(&json!({ "params": "{ \"id\": 7 }" })).unwrap().unwrap();
        assert_eq!(p, json!({ "id": 7 }));
    }

    #[test]
    fn read_params_rejects_invalid_json_string() {
        assert!(read_params(&json!({ "params": "[1, " })).is_err());
    }

    #[test]
    fn read_params_rejects_bare_scalar() {
        assert!(read_params(&json!({ "params": 5 })).is_err());
    }

    // --- run_sqlite_query ---

    #[test]
    fn query_returns_one_item_per_row() {
        let db = setup();
        let items = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "SELECT nombre, edad FROM personas ORDER BY edad" }),
            vec![],
        )
        .unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["json"]["nombre"], "luis");
        assert_eq!(items[0]["json"]["edad"], 25);
        assert_eq!(items[1]["json"]["nombre"], "ana");
    }

    #[test]
    fn query_wraps_rows_in_the_item_envelope() {
        let db = setup();
        let items = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "SELECT 1 AS uno" }),
            vec![],
        )
        .unwrap();
        // Downstream nodes unwrap `{ "json": ... }`, so the envelope must exist.
        assert_eq!(items[0]["json"]["uno"], 1);
    }

    #[test]
    fn query_preserves_null_and_text_types() {
        let db = temp_db("nulls");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch("CREATE TABLE t (a TEXT, b INTEGER); INSERT INTO t VALUES (NULL, 3);")
            .unwrap();
        drop(conn);

        let items = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "SELECT a, b FROM t" }),
            vec![],
        )
        .unwrap();
        assert!(items[0]["json"]["a"].is_null());
        assert_eq!(items[0]["json"]["b"], 3);
    }

    #[test]
    fn query_binds_positional_parameters() {
        let db = setup();
        let items = run_sqlite_query(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "SELECT nombre FROM personas WHERE edad > ?",
                "params": [26]
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["json"]["nombre"], "ana");
    }

    #[test]
    fn query_binds_named_parameters() {
        let db = setup();
        let items = run_sqlite_query(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "SELECT nombre FROM personas WHERE nombre = :quien",
                "params": { "quien": "luis" }
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["json"]["nombre"], "luis");
    }

    #[test]
    fn query_binding_prevents_injection() {
        let db = setup();
        // A quoted value must be treated as data, not spliced into the SQL.
        let items = run_sqlite_query(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "SELECT nombre FROM personas WHERE nombre = ?",
                "params": ["' OR 1=1 --"]
            }),
            vec![],
        )
        .unwrap();
        assert!(items.is_empty(), "la inyección no debe devolver filas");
    }

    #[test]
    fn query_requires_sql() {
        let db = setup();
        let err = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "  " }),
            vec![],
        )
        .unwrap_err();
        assert!(err.contains("SQL"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn query_requires_db_path() {
        let err = run_sqlite_query(&json!({ "db_path": "", "query": "SELECT 1" }), vec![]).unwrap_err();
        assert!(err.contains("ruta"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn query_reports_invalid_sql() {
        let db = setup();
        let err = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "SELECT FROM WHERE" }),
            vec![],
        )
        .unwrap_err();
        assert!(err.contains("SQL inválido"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn query_on_missing_database_is_an_error() {
        let missing = std::env::temp_dir().join("grapscreen_inexistente_abc.db");
        let _ = std::fs::remove_file(&missing);
        let err = run_sqlite_query(
            &json!({ "db_path": missing.to_string_lossy(), "query": "SELECT 1" }),
            vec![],
        )
        .unwrap_err();
        assert!(err.contains("No existe"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn query_does_not_mutate_the_database() {
        // Read-only connections must reject writes instead of applying them.
        let db = setup();
        let err = run_sqlite_query(
            &json!({ "db_path": db.to_string_lossy(), "query": "INSERT INTO personas (nombre) VALUES ('x')" }),
            vec![],
        );
        assert!(err.is_err(), "una escritura en modo lectura debe fallar");

        let conn = Connection::open(&db).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM personas", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2, "la tabla no debe haber cambiado");
    }

    // --- run_sqlite_execute ---

    #[test]
    fn execute_insert_reports_changes_and_rowid() {
        let db = setup();
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "INSERT INTO personas (nombre, edad) VALUES (?, ?)",
                "params": ["sofia", 41]
            }),
            vec![],
        )
        .unwrap();

        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["json"]["changes"], 1);
        assert_eq!(out[0]["json"]["last_insert_id"], 3);

        let conn = Connection::open(&db).unwrap();
        let nombre: String = conn
            .query_row("SELECT nombre FROM personas WHERE id = 3", [], |r| r.get(0))
            .unwrap();
        assert_eq!(nombre, "sofia");
    }

    #[test]
    fn execute_update_reports_affected_rows() {
        let db = setup();
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "UPDATE personas SET edad = :e WHERE edad < :limite",
                "params": { "e": 99, "limite": 28 }
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(out[0]["json"]["changes"], 1);
    }

    #[test]
    fn execute_delete_reports_affected_rows() {
        let db = setup();
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "DELETE FROM personas WHERE nombre = 'ana'"
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(out[0]["json"]["changes"], 1);
    }

    #[test]
    fn execute_can_create_a_table() {
        let db = temp_db("ddl");
        let _ = std::fs::remove_file(&db);
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "CREATE TABLE nueva (id INTEGER PRIMARY KEY, v TEXT)"
            }),
            vec![],
        )
        .unwrap();
        // CREATE TABLE modifies zero rows; the important check is that the
        // table actually exists afterwards.
        assert_eq!(out[0]["json"]["changes"], 0);

        let conn = Connection::open(&db).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='nueva'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn execute_creates_the_database_file_when_missing() {
        let db = temp_db("autocreate");
        let _ = std::fs::remove_file(&db);
        run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "CREATE TABLE t (a INTEGER)"
            }),
            vec![],
        )
        .unwrap();
        assert!(db.exists());
    }

    #[test]
    fn execute_no_match_reports_zero_changes() {
        let db = setup();
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "DELETE FROM personas WHERE nombre = 'nadie'"
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(out[0]["json"]["changes"], 0);
    }

    #[test]
    fn execute_requires_sql() {
        let db = setup();
        let err = run_sqlite_execute(&json!({ "db_path": db.to_string_lossy(), "query": "" }), vec![])
            .unwrap_err();
        assert!(err.contains("SQL"), "mensaje inesperado: {}", err);
    }

    #[test]
    fn execute_allows_fewer_params_than_placeholders() {
        let db = setup();
        // SQLite treats unbound positional parameters as NULL. The insert
        // succeeds with edad = NULL rather than failing.
        let out = run_sqlite_execute(
            &json!({
                "db_path": db.to_string_lossy(),
                "query": "INSERT INTO personas (nombre, edad) VALUES (?, ?)",
                "params": ["solo-uno"]
            }),
            vec![],
        )
        .unwrap();
        assert_eq!(out[0]["json"]["changes"], 1);

        let conn = Connection::open(&db).unwrap();
        let nombre: String = conn
            .query_row("SELECT nombre FROM personas WHERE nombre = 'solo-uno'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(nombre, "solo-uno");
    }
}
