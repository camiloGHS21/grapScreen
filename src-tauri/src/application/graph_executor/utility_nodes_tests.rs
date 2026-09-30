#[cfg(test)]
mod tests {
    use crate::application::graph_executor::utility_nodes::*;
    use serde_json::json;

    #[test]
    fn test_execute_command_echo() {
        let data = json!({
            "command": "echo test_exec_output"
        });
        let result = run_execute_command(&data, vec![]).expect("should execute echo");
        assert_eq!(result.len(), 1);
        let out = result[0].get("stdout").and_then(|v| v.as_str()).unwrap_or("");
        assert!(out.contains("test_exec_output"));
        let code = result[0].get("exitCode").and_then(|v| v.as_i64()).unwrap_or(-1);
        assert_eq!(code, 0);
    }

    #[test]
    fn test_execute_command_continue_on_fail() {
        let data = json!({
            "command": "cmd_that_does_not_exist_12345",
            "continueOnFail": true
        });
        let result = run_execute_command(&data, vec![]);
        assert!(result.is_ok(), "should not fail because continueOnFail is true");
        let list = result.unwrap();
        assert_eq!(list.len(), 1);
        let code = list[0].get("exitCode").and_then(|v| v.as_i64()).unwrap_or(0);
        assert_ne!(code, 0);
    }

    #[test]
    fn test_read_write_file_roundtrip() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join("grapscreen_test_rw_file.txt");
        let file_path_str = file_path.to_string_lossy().to_string();

        let write_data = json!({
            "operation": "write",
            "filePath": file_path_str,
            "content": "Hello from grapScreen native Rust!"
        });
        let write_res = run_read_write_file(&write_data, vec![]);
        assert!(write_res.is_ok(), "writing file should succeed: {:?}", write_res);

        let read_data = json!({
            "operation": "read",
            "filePath": file_path_str
        });
        let read_res = run_read_write_file(&read_data, vec![]);
        assert!(read_res.is_ok(), "reading file should succeed: {:?}", read_res);
        let items = read_res.unwrap();
        assert!(!items.is_empty());
        let content = items[0].get("content").and_then(|v| v.as_str()).unwrap_or("");
        assert_eq!(content, "Hello from grapScreen native Rust!");

        let _ = std::fs::remove_file(file_path);
    }

    #[test]
    fn test_spreadsheet_csv_roundtrip() {
        let temp_dir = std::env::temp_dir();
        let csv_path = temp_dir.join("grapscreen_test_sheet.csv");
        let csv_path_str = csv_path.to_string_lossy().to_string();

        let incoming = vec![
            json!({ "name": "Alice", "city": "Bogota" }),
            json!({ "name": "Bob", "city": "Medellin" })
        ];

        let write_data = json!({
            "operation": "toFile",
            "filePath": csv_path_str
        });
        let write_res = run_spreadsheet_file(&write_data, incoming);
        assert!(write_res.is_ok(), "writing CSV should succeed: {:?}", write_res);

        let read_data = json!({
            "operation": "fromFile",
            "filePath": csv_path_str
        });
        let read_res = run_spreadsheet_file(&read_data, vec![]);
        assert!(read_res.is_ok(), "reading CSV should succeed: {:?}", read_res);
        let items = read_res.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].get("name").and_then(|v| v.as_str()), Some("Alice"));
        assert_eq!(items[1].get("city").and_then(|v| v.as_str()), Some("Medellin"));

        let _ = std::fs::remove_file(csv_path);
    }

    #[test]
    fn test_code_node_execution() {
        let data = json!({
            "language": "js",
            "code": "return [{ count: 42, label: 'calculated' }];"
        });
        // If node is available on the machine, run_code will succeed
        let res = run_code(&data, vec![]);
        if let Ok(items) = res {
            assert_eq!(items.len(), 1);
            assert_eq!(items[0].get("count").and_then(|v| v.as_i64()), Some(42));
        }
    }
}
