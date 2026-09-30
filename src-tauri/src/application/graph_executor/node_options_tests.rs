use super::node_options::NodeOptions;
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};

#[test]
fn test_node_options_default() {
    let opts = NodeOptions::default();
    assert!(!opts.continue_on_fail);
    assert!(!opts.retry_on_fail);
    assert_eq!(opts.max_tries, 1);
    assert_eq!(opts.wait_between_tries_ms, 1000);
    assert!(!opts.always_output_data);
    assert!(!opts.execute_once);
}

#[test]
fn test_node_options_from_top_level_and_nested() {
    let data = json!({
        "continueOnFail": true,
        "retryOnFail": true,
        "maxTries": 3,
        "waitBetweenTries": 500,
        "alwaysOutputData": true,
        "executeOnce": true,
    });
    let opts = NodeOptions::from_data(Some(&data));
    assert!(opts.continue_on_fail);
    assert!(opts.retry_on_fail);
    assert_eq!(opts.max_tries, 3);
    assert_eq!(opts.wait_between_tries_ms, 500);
    assert!(opts.always_output_data);
    assert!(opts.execute_once);

    // Test nested in `options`
    let data_nested = json!({
        "options": {
            "continueOnFail": true,
            "retryOnFail": true,
            "maxTries": 4,
            "waitBetweenTries": 200,
            "alwaysOutputData": true,
            "executeOnce": true
        }
    });
    let opts_nested = NodeOptions::from_data(Some(&data_nested));
    assert!(opts_nested.continue_on_fail);
    assert!(opts_nested.retry_on_fail);
    assert_eq!(opts_nested.max_tries, 4);
    assert_eq!(opts_nested.wait_between_tries_ms, 200);
    assert!(opts_nested.always_output_data);
    assert!(opts_nested.execute_once);

    // Test onError string syntax from n8n
    let data_onerror = json!({
        "onError": "continueRegularOutput"
    });
    let opts_err = NodeOptions::from_data(Some(&data_onerror));
    assert!(opts_err.continue_on_fail);
}

#[test]
fn test_retry_on_fail_success_on_second_try() {
    let opts = NodeOptions {
        continue_on_fail: false,
        retry_on_fail: true,
        max_tries: 3,
        wait_between_tries_ms: 0,
        always_output_data: false,
        execute_once: false,
    };

    let attempts = AtomicU32::new(0);
    let res = opts.execute_with_resilience(
        || {
            let count = attempts.fetch_add(1, Ordering::SeqCst);
            if count == 0 {
                Err("First attempt failed".to_string())
            } else {
                Ok("Success on second attempt".to_string())
            }
        },
        |_| Ok(()),
    );

    assert_eq!(res.unwrap(), "Success on second attempt");
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
}

#[test]
fn test_retry_on_fail_exhausted_returns_error() {
    let opts = NodeOptions {
        continue_on_fail: false,
        retry_on_fail: true,
        max_tries: 3,
        wait_between_tries_ms: 0,
        always_output_data: false,
        execute_once: false,
    };

    let attempts = AtomicU32::new(0);
    let res: Result<(), String> = opts.execute_with_resilience(
        || {
            attempts.fetch_add(1, Ordering::SeqCst);
            Err("Persistent network error".to_string())
        },
        |_| Ok(()),
    );

    assert!(res.is_err());
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}

#[test]
fn test_make_error_item_and_ensure_output() {
    let err_item = NodeOptions::make_error_item("Connection timeout", Some(0));
    assert_eq!(err_item["json"]["error"]["message"], "Connection timeout");
    assert_eq!(err_item["json"]["error"]["itemIndex"], 0);

    let opts = NodeOptions {
        always_output_data: true,
        ..Default::default()
    };
    let mut items = Vec::new();
    opts.ensure_output_items(&mut items);
    assert_eq!(items.len(), 1);
    assert!(items[0]["json"].is_object());
}
