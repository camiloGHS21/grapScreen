//! SQL query builder for n8n Postgres operations (insert, update, upsert, delete, select).

use serde_json::Value;

pub fn sql_format_val(v: &Value) -> String {
    match v {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => if *b { "TRUE".into() } else { "FALSE".into() },
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        Value::Array(_) | Value::Object(_) => format!("'{}'", v.to_string().replace('\'', "''")),
    }
}

pub fn build_insert(cfg: &Value, item: &Value) -> Result<String, String> {
    let table = cfg.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    if table.is_empty() {
        return Err("Postgres: 'table' requerido para operación Insert.".into());
    }
    let schema = cfg.get("schema").and_then(|v| v.as_str()).unwrap_or("public").trim();
    let return_fields = cfg.get("returnFields").and_then(|v| v.as_str()).unwrap_or("*").trim();
    let cols_str = cfg.get("columns").and_then(|v| v.as_str()).unwrap_or("");

    let cols: Vec<&str> = if cols_str.trim().is_empty() {
        item.as_object()
            .map(|o| o.keys().map(|s| s.as_str()).collect())
            .unwrap_or_default()
    } else {
        cols_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect()
    };

    if cols.is_empty() {
        return Err("Postgres: no se especificaron columnas para insertar.".into());
    }

    let col_names = cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
    let val_exprs = cols.iter().map(|c| sql_format_val(item.get(*c).unwrap_or(&Value::Null))).collect::<Vec<_>>().join(", ");

    Ok(format!(
        "INSERT INTO \"{}\".\"{}\" ({}) VALUES ({}) RETURNING {};",
        schema, table, col_names, val_exprs, return_fields
    ))
}

pub fn build_update(cfg: &Value, item: &Value) -> Result<String, String> {
    let table = cfg.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    if table.is_empty() {
        return Err("Postgres: 'table' requerido para operación Update.".into());
    }
    let schema = cfg.get("schema").and_then(|v| v.as_str()).unwrap_or("public").trim();
    let update_key = cfg.get("updateKey").and_then(|v| v.as_str()).unwrap_or("id").trim();
    let return_fields = cfg.get("returnFields").and_then(|v| v.as_str()).unwrap_or("*").trim();
    let cols_str = cfg.get("columns").and_then(|v| v.as_str()).unwrap_or("");

    let key_val = item.get(update_key).ok_or_else(|| {
        format!("Postgres Update: elemento sin clave de actualización '{}'", update_key)
    })?;

    let cols: Vec<&str> = cols_str
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && *s != update_key)
        .collect();

    if cols.is_empty() {
        return Err("Postgres: no se especificaron columnas para actualizar.".into());
    }

    let set_clauses = cols
        .iter()
        .map(|c| format!("\"{}\" = {}", c, sql_format_val(item.get(*c).unwrap_or(&Value::Null))))
        .collect::<Vec<_>>()
        .join(", ");

    Ok(format!(
        "UPDATE \"{}\".\"{}\" SET {} WHERE \"{}\" = {} RETURNING {};",
        schema, table, set_clauses, update_key, sql_format_val(key_val), return_fields
    ))
}

pub fn build_upsert(cfg: &Value, item: &Value) -> Result<String, String> {
    let table = cfg.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    if table.is_empty() {
        return Err("Postgres: 'table' requerido para operación Upsert.".into());
    }
    let schema = cfg.get("schema").and_then(|v| v.as_str()).unwrap_or("public").trim();
    let conflict_key = cfg.get("updateKey").and_then(|v| v.as_str()).unwrap_or("id").trim();
    let return_fields = cfg.get("returnFields").and_then(|v| v.as_str()).unwrap_or("*").trim();
    let cols_str = cfg.get("columns").and_then(|v| v.as_str()).unwrap_or("");

    let cols: Vec<&str> = if cols_str.trim().is_empty() {
        item.as_object()
            .map(|o| o.keys().map(|s| s.as_str()).collect())
            .unwrap_or_default()
    } else {
        cols_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect()
    };

    if cols.is_empty() {
        return Err("Postgres: no se especificaron columnas para upsert.".into());
    }

    let col_names = cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
    let val_exprs = cols.iter().map(|c| sql_format_val(item.get(*c).unwrap_or(&Value::Null))).collect::<Vec<_>>().join(", ");
    let update_set = cols
        .iter()
        .filter(|c| **c != conflict_key)
        .map(|c| format!("\"{}\" = EXCLUDED.\"{}\"", c, c))
        .collect::<Vec<_>>()
        .join(", ");

    let do_clause = if update_set.is_empty() {
        "DO NOTHING".to_string()
    } else {
        format!("DO UPDATE SET {}", update_set)
    };

    Ok(format!(
        "INSERT INTO \"{}\".\"{}\" ({}) VALUES ({}) ON CONFLICT (\"{}\") {} RETURNING {};",
        schema, table, col_names, val_exprs, conflict_key, do_clause, return_fields
    ))
}

pub fn build_delete(cfg: &Value, item: &Value) -> Result<String, String> {
    let table = cfg.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    if table.is_empty() {
        return Err("Postgres: 'table' requerido para operación Delete.".into());
    }
    let schema = cfg.get("schema").and_then(|v| v.as_str()).unwrap_or("public").trim();
    let delete_key = cfg.get("deleteKey").and_then(|v| v.as_str()).unwrap_or("id").trim();
    let return_fields = cfg.get("returnFields").and_then(|v| v.as_str()).unwrap_or("*").trim();

    let key_val = item.get(delete_key).ok_or_else(|| {
        format!("Postgres Delete: el elemento no contiene la clave de eliminación '{}'", delete_key)
    })?;

    Ok(format!(
        "DELETE FROM \"{}\".\"{}\" WHERE \"{}\" = {} RETURNING {};",
        schema, table, delete_key, sql_format_val(key_val), return_fields
    ))
}

pub fn build_select(cfg: &Value, _item: &Value) -> Result<String, String> {
    let table = cfg.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    if table.is_empty() {
        return Err("Postgres: 'table' requerido para operación Select.".into());
    }
    let schema = cfg.get("schema").and_then(|v| v.as_str()).unwrap_or("public").trim();
    let return_fields = cfg.get("returnFields").and_then(|v| v.as_str()).unwrap_or("*").trim();
    let limit = cfg.get("limit").and_then(|v| v.as_u64()).unwrap_or(50);

    Ok(format!(
        "SELECT {} FROM \"{}\".\"{}\" LIMIT {};",
        return_fields, schema, table, limit
    ))
}
