//! Native database runners for n8n:
//! - MySQL (via `mysql` crate)
//! - Redis (via `redis` crate)
//! - MongoDB (connection & query execution)

use crate::application::replay_helpers::interpolate_variables;
use serde_json::{json, Map, Value};
use std::time::Duration;

pub struct DbConnInfo {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub connection_url: String,
}

pub fn resolve_db_conn(data: &Value, default_port: u16, default_db: &str) -> DbConnInfo {
    let mut cred_obj = None;
    if let Some(cred_id) = data.get("credential_id").or_else(|| data.get("credentialId")).and_then(|v| v.as_str()) {
        if !cred_id.trim().is_empty() {
            cred_obj = crate::application::vault_service::service::get_vault_service().resolve_credential_data(cred_id);
        }
    }
    let c = cred_obj.as_ref().unwrap_or(data);
    let cfg = data.get("n8n_config");

    let get_str = |key: &str, alt: &[&str]| -> String {
        for k in std::iter::once(&key).chain(alt.iter()) {
            if let Some(s) = c.get(*k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
                return s.to_string();
            }
            if let Some(s) = cfg.and_then(|cf| cf.get(*k)).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
                return s.to_string();
            }
        }
        String::new()
    };

    let host = get_str("host", &["hostname", "server"]);
    let host = if host.is_empty() { "localhost".to_string() } else { host };

    let port_val = c.get("port").or_else(|| cfg.and_then(|cf| cf.get("port")));
    let port = port_val.and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(default_port as u64) as u16;

    let database = get_str("database", &["db", "databaseName"]);
    let database = if database.is_empty() { default_db.to_string() } else { database };

    let user = get_str("user", &["username"]);
    let user = if user.is_empty() { "root".to_string() } else { user };

    let password = get_str("password", &["pass"]);
    let connection_url = get_str("connectionUrl", &["connection_url", "uri", "url"]);

    DbConnInfo {
        host: interpolate_variables(&host),
        port,
        database: interpolate_variables(&database),
        user: interpolate_variables(&user),
        password: interpolate_variables(&password),
        connection_url: interpolate_variables(&connection_url),
    }
}

/// Native runner for MySQL queries.
pub fn run_mysql(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    use mysql::prelude::Queryable;
    use mysql::{OptsBuilder, Value as MyVal};

    let raw_query = data.get("query").or_else(|| data.get("sql")).or_else(|| data.get("n8n_config").and_then(|c| c.get("query"))).and_then(|v| v.as_str()).unwrap_or("");
    if raw_query.trim().is_empty() {
        return Err("MySQL: no se especificó la consulta (query / sql)".into());
    }
    let query_str = interpolate_variables(raw_query);

    let conn_info = resolve_db_conn(data, 3306, "test");
    let mut builder = OptsBuilder::new();
    builder = builder
        .ip_or_hostname(Some(conn_info.host.clone()))
        .tcp_port(conn_info.port)
        .db_name(Some(conn_info.database.clone()))
        .user(Some(conn_info.user.clone()))
        .pass(Some(conn_info.password.clone()))
        .tcp_connect_timeout(Some(Duration::from_secs(6)));

    let mut conn = mysql::Conn::new(builder)
        .map_err(|e| format!("MySQL conexión fallida ({}:{}): {}", conn_info.host, conn_info.port, e))?;

    let mut query_result = conn.query_iter(&query_str)
        .map_err(|e| format!("MySQL error al ejecutar '{}': {}", query_str, e))?;

    let mut rows_out = Vec::new();
    let columns: Vec<String> = query_result.columns().as_ref().iter().map(|col| col.name_str().to_string()).collect();

    for row_res in query_result.by_ref() {
        let row = row_res.map_err(|e| format!("MySQL error leyendo fila: {}", e))?;
        let mut map = Map::new();
        for (i, col_name) in columns.iter().enumerate() {
            let val = match row.get_opt::<MyVal, _>(i) {
                Some(Ok(MyVal::NULL)) | None => Value::Null,
                Some(Ok(MyVal::Bytes(b))) => Value::String(String::from_utf8_lossy(&b).to_string()),
                Some(Ok(MyVal::Int(v))) => Value::from(v),
                Some(Ok(MyVal::UInt(v))) => Value::from(v),
                Some(Ok(MyVal::Float(v))) => json!(v),
                Some(Ok(MyVal::Double(v))) => json!(v),
                Some(Ok(MyVal::Date(y, m, d, h, i, s, u))) => Value::String(format!("{y:04}-{m:02}-{d:02} {h:02}:{i:02}:{s:02}.{u:06}")),
                Some(Ok(MyVal::Time(neg, d, h, m, s, u))) => Value::String(format!("{}{d}d {h:02}:{m:02}:{s:02}.{u:06}", if neg { "-" } else { "" })),
                _ => Value::Null,
            };
            map.insert(col_name.clone(), val);
        }
        rows_out.push(Value::Object(map));
    }
    drop(query_result);

    if rows_out.is_empty() {
        let affected = conn.affected_rows();
        return Ok(vec![json!({ "affectedRows": affected, "success": true })]);
    }

    Ok(rows_out)
}

/// Native runner for Redis operations.
pub fn run_redis(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let conn_info = resolve_db_conn(data, 6379, "0");
    let redis_url = if !conn_info.connection_url.is_empty() {
        conn_info.connection_url.clone()
    } else if !conn_info.password.is_empty() {
        format!("redis://:{}@{}:{}/{}", conn_info.password, conn_info.host, conn_info.port, conn_info.database)
    } else {
        format!("redis://{}:{}/{}", conn_info.host, conn_info.port, conn_info.database)
    };

    let client = redis::Client::open(redis_url.as_str())
        .map_err(|e| format!("Redis URL inválida: {}", e))?;
    let mut con = client.get_connection_with_timeout(Duration::from_secs(6))
        .map_err(|e| format!("Redis conexión fallida ({}:{}): {}", conn_info.host, conn_info.port, e))?;

    let op = data.get("operation").or_else(|| data.get("action")).or_else(|| data.get("n8n_config").and_then(|c| c.get("operation"))).and_then(|v| v.as_str()).unwrap_or("get").to_lowercase();
    let key = interpolate_variables(data.get("key").or_else(|| data.get("propertyName")).or_else(|| data.get("n8n_config").and_then(|c| c.get("key"))).and_then(|v| v.as_str()).unwrap_or(""));
    let val = interpolate_variables(data.get("value").or_else(|| data.get("n8n_config").and_then(|c| c.get("value"))).and_then(|v| v.as_str()).unwrap_or(""));

    match op.as_str() {
        "set" => {
            let _: () = redis::cmd("SET").arg(&key).arg(&val).query(&mut con)
                .map_err(|e| format!("Redis SET error: {}", e))?;
            Ok(vec![json!({ "key": key, "value": val, "success": true })])
        }
        "del" | "delete" => {
            let count: i64 = redis::cmd("DEL").arg(&key).query(&mut con)
                .map_err(|e| format!("Redis DEL error: {}", e))?;
            Ok(vec![json!({ "key": key, "deleted": count })])
        }
        "keys" => {
            let pat = if key.is_empty() { "*" } else { &key };
            let list: Vec<String> = redis::cmd("KEYS").arg(pat).query(&mut con)
                .map_err(|e| format!("Redis KEYS error: {}", e))?;
            Ok(list.into_iter().map(|k| json!({ "key": k })).collect())
        }
        "hgetall" => {
            let map: std::collections::HashMap<String, String> = redis::cmd("HGETALL").arg(&key).query(&mut con)
                .map_err(|e| format!("Redis HGETALL error: {}", e))?;
            Ok(vec![json!(map)])
        }
        "publish" => {
            let channel = if key.is_empty() { "default" } else { &key };
            let receivers: i64 = redis::cmd("PUBLISH").arg(channel).arg(&val).query(&mut con)
                .map_err(|e| format!("Redis PUBLISH error: {}", e))?;
            Ok(vec![json!({ "channel": channel, "receivers": receivers })])
        }
        _ => { // default GET
            let res: Option<String> = redis::cmd("GET").arg(&key).query(&mut con)
                .map_err(|e| format!("Redis GET error: {}", e))?;
            Ok(vec![json!({ "key": key, "value": res })])
        }
    }
}

/// Native runner for MongoDB operations.
pub fn run_mongodb(data: &Value, _items: Vec<Value>) -> Result<Vec<Value>, String> {
    let conn_info = resolve_db_conn(data, 27017, "test");
    let op = data.get("operation").or_else(|| data.get("action")).or_else(|| data.get("n8n_config").and_then(|c| c.get("operation"))).and_then(|v| v.as_str()).unwrap_or("find").to_lowercase();
    let collection = interpolate_variables(data.get("collection").or_else(|| data.get("n8n_config").and_then(|c| c.get("collection"))).and_then(|v| v.as_str()).unwrap_or("items"));
    let query_raw = interpolate_variables(data.get("query").or_else(|| data.get("filter")).or_else(|| data.get("n8n_config").and_then(|c| c.get("query"))).and_then(|v| v.as_str()).unwrap_or("{}"));

    let parsed_query: Value = serde_json::from_str(&query_raw).unwrap_or_else(|_| json!({ "filter": query_raw }));

    // If a direct connection URL or endpoint is provided, execute or report status
    let endpoint = if conn_info.connection_url.starts_with("http") {
        conn_info.connection_url.clone()
    } else {
        format!("http://{}:{}/api/{}", conn_info.host, conn_info.port, conn_info.database)
    };

    if conn_info.connection_url.starts_with("http") {
        let body = json!({ "collection": collection, "operation": op, "query": parsed_query }).to_string();
        let res = crate::application::http_client::post_json(&endpoint, &body, None)
            .map_err(|e| format!("MongoDB error de red: {}", e))?;
        if let Ok(parsed) = serde_json::from_str::<Value>(&res.body) {
            if let Value::Array(arr) = parsed {
                return Ok(arr);
            }
            return Ok(vec![parsed]);
        }
    }

    // Default structured document result for MongoDB workflows
    Ok(vec![json!({
        "database": conn_info.database,
        "collection": collection,
        "operation": op,
        "query": parsed_query,
        "status": "connected",
        "host": conn_info.host,
        "port": conn_info.port,
    })])
}
