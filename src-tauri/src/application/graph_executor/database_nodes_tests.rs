#[cfg(test)]
mod tests {
    use crate::application::graph_executor::database_nodes::*;
    use crate::application::graph_executor::google_sdks::*;
    use serde_json::json;

    #[test]
    fn test_resolve_db_conn_defaults() {
        let data = json!({});
        let conn = resolve_db_conn(&data, 3306, "default_db");
        assert_eq!(conn.host, "localhost");
        assert_eq!(conn.port, 3306);
        assert_eq!(conn.database, "default_db");
        assert_eq!(conn.user, "root");
        assert_eq!(conn.password, "");
    }

    #[test]
    fn test_resolve_db_conn_from_config() {
        let data = json!({
            "n8n_config": {
                "host": "db.internal.net",
                "port": "3307",
                "database": "production",
                "user": "admin",
                "password": "secret_password"
            }
        });
        let conn = resolve_db_conn(&data, 3306, "test");
        assert_eq!(conn.host, "db.internal.net");
        assert_eq!(conn.port, 3307);
        assert_eq!(conn.database, "production");
        assert_eq!(conn.user, "admin");
        assert_eq!(conn.password, "secret_password");
    }

    #[test]
    fn test_run_mongodb_query_structure() {
        let data = json!({
            "collection": "customers",
            "operation": "find",
            "query": "{\"status\":\"active\"}",
            "database": "crm"
        });
        let res = run_mongodb(&data, vec![]).expect("MongoDB structure should format cleanly");
        assert_eq!(res.len(), 1);
        assert_eq!(res[0]["collection"], "customers");
        assert_eq!(res[0]["operation"], "find");
        assert_eq!(res[0]["status"], "connected");
        assert_eq!(res[0]["query"]["status"], "active");
    }

    #[test]
    fn test_run_mysql_empty_query_err() {
        let data = json!({
            "host": "127.0.0.1",
            "query": ""
        });
        let res = run_mysql(&data, vec![]);
        assert!(res.is_err());
        assert!(res.err().unwrap().contains("no se especificó la consulta"));
    }

    #[test]
    fn test_resolve_google_token_direct() {
        let data = json!({
            "accessToken": "ya29.mock_oauth_token_12345"
        });
        let token = resolve_google_token(&data).expect("should resolve OAuth token");
        assert_eq!(token, "ya29.mock_oauth_token_12345");
    }

    #[test]
    fn test_resolve_google_token_missing() {
        let data = json!({});
        let res = resolve_google_token(&data);
        assert!(res.is_err());
        assert!(res.err().unwrap().contains("Google SDK: no se encontró token OAuth2"));
    }

    #[test]
    fn test_google_docs_requires_token() {
        let data = json!({
            "documentId": "12345ABC"
        });
        let res = run_google_docs(&data, vec![]);
        assert!(res.is_err());
        assert!(res.err().unwrap().contains("no se encontró token OAuth2"));
    }
}
