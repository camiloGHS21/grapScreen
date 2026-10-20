use super::*;
use serde_json::json;
use std::collections::HashMap;

#[test]
fn test_item_matching_and_indexed_item() {
    let mut nodes = HashMap::new();
    nodes.insert("FetchOrders".to_string(), vec![
        json!({ "json": { "order_id": 101, "customer": "Alice" } }),
        json!({ "json": { "order_id": 102, "customer": "Bob" } }),
        json!({ "json": { "order_id": 103, "customer": "Charlie" } }),
    ]);

    let mut vars = HashMap::new();
    vars.insert("prevNode.name".to_string(), "FetchOrders".to_string());

    let items = vec![json!({ "json": { "status": "pending" } })];
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &vars,
        execution_id: "exec_v1",
        credentials: None,
    };

    // Test itemMatching(1)
    let res1 = render("{{ $('FetchOrders').itemMatching(1).json.customer }}", &ctx);
    assert_eq!(res1, json!("Bob"));

    // Test item(2)
    let res2 = render("{{ $('FetchOrders').item(2).json.order_id }}", &ctx);
    assert_eq!(res2, json!(103));

    // Test $prevNode.name
    let prev = render("{{ $prevNode.name }}", &ctx);
    assert_eq!(prev, json!("FetchOrders"));
}
