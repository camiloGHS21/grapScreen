//! Native PostgreSQL execution runner for n8n Postgres nodes.
//! Executes queries against PostgreSQL using pure Rust `postgres` crate.

use super::postgres_builder;
use crate::application::replay_helpers;
use postgres::types::Type;
use postgres::{Config, NoTls, Row};
use serde_json::{json, Map, Value};
use std::time::Duration;

/// Extracted connection credentials for PostgreSQL.
struct PgConnInfo {
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
}

fn resolve_conn_info(data: &Value) -> Result<PgConnInfo, String> {
    let mut cred_obj = None;
    if let Some(cred_id) = data.get("credential_id").and_then(|v| v.as_str()) {
        if !cred_id.trim().is_empty() {
            cred_obj = crate::application::vault_service::service::get_vault_service()
                .resolve_credential_data(cred_id);
        }
    }

    let c = cred_obj.as_ref().unwrap_or(data);

    let host = c
        .get("host")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("localhost")
        .to_string();

    let port = c
        .get("port")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(5432) as u16;

    let database = c
        .get("database")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("postgres")
        .to_string();

    let user = c
        .get("user")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("postgres")
        .to_string();

    let password = c
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(PgConnInfo {
        host,
        port,
        database,
        user,
        password,
    })
}

fn convert_cell(row: &Row, idx: usize) -> Value {
    let col = &row.columns()[idx];
    let t = col.type_();

    if *t == Type::BOOL {
        if let Ok(Some(b)) = row.try_get::<_, Option<bool>>(idx) {
            return Value::Bool(b);
        }
    } else if *t == Type::INT2 {
        if let Ok(Some(n)) = row.try_get::<_, Option<i16>>(idx) {
            return json!(n);
        }
    } else if *t == Type::INT4 {
        if let Ok(Some(n)) = row.try_get::<_, Option<i32>>(idx) {
            return json!(n);
        }
    } else if *t == Type::INT8 {
        if let Ok(Some(n)) = row.try_get::<_, Option<i64>>(idx) {
            return json!(n);
        }
    } else if *t == Type::FLOAT4 {
        if let Ok(Some(f)) = row.try_get::<_, Option<f32>>(idx) {
            return json!(f);
        }
    } else if *t == Type::FLOAT8 {
        if let Ok(Some(f)) = row.try_get::<_, Option<f64>>(idx) {
            return json!(f);
        }
    } else if *t == Type::JSON || *t == Type::JSONB {
        if let Ok(Some(s)) = row.try_get::<_, Option<String>>(idx) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                return parsed;
            }
            return Value::String(s);
        }
    } else if let Ok(Some(s)) = row.try_get::<_, Option<String>>(idx) {
        return Value::String(s);
    }

    Value::Null
}

fn row_to_json(row: &Row) -> Map<String, Value> {
    let mut map = Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let val = convert_cell(row, i);
        map.insert(col.name().to_string(), val);
    }
    map
}

/// Executes Postgres action node.
pub fn run(data: &Value, incoming: Vec<Value>) -> Result<Vec<Value>, String> {
    let info = resolve_conn_info(data)?;

    let mut cfg = Config::new();
    cfg.host(&info.host);
    cfg.port(info.port);
    cfg.dbname(&info.database);
    cfg.user(&info.user);
    if !info.password.is_empty() {
        cfg.password(&info.password);
    }
    cfg.connect_timeout(Duration::from_secs(10));

    let mut client = cfg
        .connect(NoTls)
        .map_err(|e| format!("Postgres: error de conexión a {}:{}/{}: {}", info.host, info.port, info.database, e))?;

    let n8n_cfg = data.get("n8n_config").unwrap_or(data);
    let op = n8n_cfg
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("executeQuery");

    let options = n8n_cfg.get("options");
    let output_field = options
        .and_then(|o| o.get("outputField"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let continue_on_fail = options
        .and_then(|o| o.get("continueOnFail"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let items = if incoming.is_empty() {
        vec![json!({})]
    } else {
        incoming
    };

    let mut all_produced: Vec<Value> = Vec::new();

    for item in &items {
        let sql_res = match op {
            "insert" => postgres_builder::build_insert(n8n_cfg, item),
            "update" => postgres_builder::build_update(n8n_cfg, item),
            "upsert" => postgres_builder::build_upsert(n8n_cfg, item),
            "delete" => postgres_builder::build_delete(n8n_cfg, item),
            "select" => postgres_builder::build_select(n8n_cfg, item),
            _ => {
                let raw_query = n8n_cfg.get("query").and_then(|v| v.as_str()).unwrap_or("");
                if raw_query.trim().is_empty() {
                    Err("Postgres: la consulta SQL 'Query' está vacía.".into())
                } else {
                    Ok(replay_helpers::interpolate_variables(raw_query))
                }
            }
        };

        let res = sql_res.and_then(|sql| {
            let rows = client
                .query(&sql, &[])
                .map_err(|e| format!("Postgres error en consulta SQL: {}", e))?;
            let out: Vec<Value> = rows.iter().map(|r| Value::Object(row_to_json(r))).collect();
            Ok(out)
        });

        match res {
            Ok(rows) => {
                if let Some(field) = output_field {
                    let mut wrapped = item.as_object().cloned().unwrap_or_default();
                    wrapped.insert(field.to_string(), Value::Array(rows));
                    all_produced.push(Value::Object(wrapped));
                } else if rows.is_empty() {
                    all_produced.push(item.clone());
                } else {
                    for r in rows {
                        all_produced.push(r);
                    }
                }
            }
            Err(e) => {
                if continue_on_fail {
                    let mut err_item = item.as_object().cloned().unwrap_or_default();
                    err_item.insert("error".to_string(), Value::String(e));
                    all_produced.push(Value::Object(err_item));
                } else {
                    return Err(e);
                }
            }
        }
    }

    Ok(all_produced)
}
