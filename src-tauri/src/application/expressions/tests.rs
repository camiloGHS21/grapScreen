use super::*;
use serde_json::{json, Value};
use std::collections::HashMap;

fn render_str(input: &str, items: &[Value], nodes: &HashMap<String, Vec<Value>>) -> String {
    let vars = HashMap::new();
    let ctx = ExprContext {
        items,
        item_index: 0,
        run_index: 0,
        node_outputs: nodes,
        variables: &vars,
        execution_id: "exec-1",
        credentials: None,
    };
    render_string(input, &ctx)
}

fn cond(input: &str, items: &[Value]) -> bool {
    let vars = HashMap::new();
    let nodes = HashMap::new();
    let ctx = ExprContext {
        items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &vars,
        execution_id: "exec-cond",
        credentials: None,
    };
    eval_condition(input, &ctx)
}

#[test]
fn condition_bare_expression() {
    let items: Vec<Value> = vec![];
    assert!(cond("5 > 3", &items));
    assert!(!cond("5 < 3", &items));
    assert!(cond("\"hola\" == \"hola\"", &items));
    assert!(!cond("\"hola\" == \"adios\"", &items));
}

#[test]
fn condition_template_with_comparison() {
    let items = vec![json!({ "json": { "total": 42 } })];
    assert!(cond("{{ $json.total }} > 10", &items));
    assert!(!cond("{{ $json.total }} < 10", &items));
    assert!(cond("{{ $json.total }} == 42", &items));
}

#[test]
fn condition_template_whole_expression() {
    let items = vec![json!({ "json": { "total": 120 } })];
    assert!(cond("{{ $json.total > 100 }}", &items));
    assert!(!cond("{{ $json.total > 500 }}", &items));
    assert!(cond("{{ $json.total }}", &items));
}

#[test]
fn arithmetic() {
    let items = vec![json!({ "json": { "price": 100 } })];
    let nodes = HashMap::new();
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: None,
    };
    assert_eq!(render("{{ $json.price * 1.21 }}", &ctx), json!(121));
    assert_eq!(render("{{ 2 + 3 }}", &ctx), json!(5));
    assert_eq!(render("{{ 10 / 4 }}", &ctx), json!(2.5));
}

#[test]
fn node_reference_legacy_syntax() {
    let mut nodes = HashMap::new();
    nodes.insert("HTTP Request".to_string(), vec![json!({ "json": { "id": 7, "title": "hi" } })]);
    let items: Vec<Value> = vec![];
    let out = render_str("{{ $node[\"HTTP Request\"].json.id }}", &items, &nodes);
    assert_eq!(out, "7");
}

#[test]
fn modern_node_syntax_item_json() {
    let mut nodes = HashMap::new();
    nodes.insert("Fetch API".to_string(), vec![
        json!({ "json": { "id": 42, "status": "approved", "role": "admin" } })
    ]);
    let items: Vec<Value> = vec![];
    let out1 = render_str("{{ $('Fetch API').item.json.id }}", &items, &nodes);
    assert_eq!(out1, "42");
    let out2 = render_str("{{ $('Fetch API').item.json.status }}", &items, &nodes);
    assert_eq!(out2, "approved");
    let out3 = render_str("{{ $('Fetch API').json.role }}", &items, &nodes);
    assert_eq!(out3, "admin");
}

#[test]
fn modern_node_syntax_first_and_last() {
    let mut nodes = HashMap::new();
    nodes.insert("Records".to_string(), vec![
        json!({ "json": { "num": 10 } }),
        json!({ "json": { "num": 99 } }),
    ]);
    let items: Vec<Value> = vec![];
    let first = render_str("{{ $('Records').first().json.num }}", &items, &nodes);
    assert_eq!(first, "10");
    let last = render_str("{{ $('Records').last().json.num }}", &items, &nodes);
    assert_eq!(last, "99");
}

#[test]
fn inline_array_map_and_join() {
    let items = vec![json!({
        "json": {
            "users": [
                { "name": "carlos", "role": "dev" },
                { "name": "elena", "role": "lead" },
                { "name": "diego", "role": "qa" }
            ]
        }
    })];
    let nodes = HashMap::new();
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: None,
    };
    let res = render("{{ $json.users.map(u => u.name).join(', ') }}", &ctx);
    assert_eq!(res, json!("carlos, elena, diego"));

    let res_upper = render("{{ $json.users.map(u => u.name.toUpperCase()).join(' - ') }}", &ctx);
    assert_eq!(res_upper, json!("CARLOS - ELENA - DIEGO"));
}

#[test]
fn inline_array_filter() {
    let items = vec![json!({
        "json": {
            "products": [
                { "title": "Keyboard", "price": 40 },
                { "title": "Monitor", "price": 250 },
                { "title": "Mouse", "price": 20 }
            ]
        }
    })];
    let nodes = HashMap::new();
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: None,
    };
    let expensive = render("{{ $json.products.filter(p => p.price > 30).map(p => p.title).join(', ') }}", &ctx);
    assert_eq!(expensive, json!("Keyboard, Monitor"));
}

#[test]
fn modern_node_all_with_map_and_join() {
    let mut nodes = HashMap::new();
    nodes.insert("GetUsers".to_string(), vec![
        json!({ "json": { "email": "a@test.com" } }),
        json!({ "json": { "email": "b@test.com" } }),
    ]);
    let items: Vec<Value> = vec![];
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: None,
    };
    let out = render("{{ $('GetUsers').all().map(i => i.json.email).join(';') }}", &ctx);
    assert_eq!(out, json!("a@test.com;b@test.com"));
}

#[test]
fn string_split_and_slice() {
    let items = vec![json!({ "json": { "tags": "rust,tauri,n8n,workflow" } })];
    let nodes = HashMap::new();
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: None,
    };
    let res = render("{{ $json.tags.split(',').slice(0, 2).join(' & ') }}", &ctx);
    assert_eq!(res, json!("rust & tauri"));
}

#[test]
fn credentials_token() {
    let items = vec![json!({ "json": { "n": 1 } })];
    let nodes = HashMap::new();
    let cred = json!({ "api_key": "sk-secret-key" });
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "e1",
        credentials: Some(&cred),
    };
    assert_eq!(render_string("Bearer {{ $credentials.api_key }}", &ctx), "Bearer sk-secret-key");
}

#[test]
fn test_input_and_env_expressions() {
    std::env::set_var("GRAP_TEST_ENV", "production_mode");
    let items = vec![
        json!({ "json": { "title": "FirstItem" } }),
        json!({ "json": { "title": "SecondItem" } }),
    ];
    let nodes = HashMap::new();
    let mut vars = HashMap::new();
    vars.insert("threshold".to_string(), "95".to_string());
    let ctx = ExprContext {
        items: &items,
        item_index: 1,
        run_index: 0,
        node_outputs: &nodes,
        variables: &vars,
        execution_id: "exec_123",
        credentials: None,
    };

    assert_eq!(render("{{ $input.item.json.title }}", &ctx), json!("SecondItem"));
    assert_eq!(render("{{ $input.first().json.title }}", &ctx), json!("FirstItem"));
    assert_eq!(render("{{ $input.last().json.title }}", &ctx), json!("SecondItem"));
    assert_eq!(render("{{ $input.all().map(i => i.json.title).join(' | ') }}", &ctx), json!("FirstItem | SecondItem"));
    assert_eq!(render("{{ $env.GRAP_TEST_ENV }}", &ctx), json!("production_mode"));
    assert_eq!(render("{{ $parameter.threshold }}", &ctx), json!("95"));
    assert_eq!(render("{{ $workflow.id }}", &ctx), json!("exec_123"));
}

#[test]
fn binary_expressions() {
    let items = vec![json!({
        "json": { "id": 1 },
        "binary": {
            "data": {
                "fileName": "invoice.pdf",
                "fileSize": "12 kB",
                "mimeType": "application/pdf"
            }
        }
    })];
    let mut nodes = HashMap::new();
    nodes.insert("DownloadNode".to_string(), items.clone());
    let ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs: &nodes,
        variables: &HashMap::new(),
        execution_id: "exec_bin",
        credentials: None,
    };

    assert_eq!(render("{{ $binary.data.fileName }}", &ctx), json!("invoice.pdf"));
    assert_eq!(render("{{ $binary.data.mimeType }}", &ctx), json!("application/pdf"));
    assert_eq!(render("{{ $('DownloadNode').item.binary.data.fileName }}", &ctx), json!("invoice.pdf"));
    assert_eq!(render("{{ $('DownloadNode').first().binary.data.fileSize }}", &ctx), json!("12 kB"));
}

