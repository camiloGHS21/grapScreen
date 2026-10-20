use super::super::descriptor::RequestTemplate;
use super::*;
use serde_json::json;

#[test]
fn join_url_does_not_double_the_slash() {
    assert_eq!(
        join_url("https://api.slack.com/api/", "/conversations.list"),
        "https://api.slack.com/api/conversations.list"
    );
    assert_eq!(
        join_url("https://api.slack.com/api", "conversations.list"),
        "https://api.slack.com/api/conversations.list"
    );
}

#[test]
fn an_absolute_path_overrides_the_base_url() {
    assert_eq!(
        join_url("https://api.example.com", "https://other.test/v1/thing"),
        "https://other.test/v1/thing"
    );
}

#[test]
fn join_url_keeps_a_bare_base_when_the_path_is_empty() {
    assert_eq!(join_url("https://api.example.com/", ""), "https://api.example.com");
}

#[test]
fn query_accepts_json_objects_and_plain_fragments() {
    let sorted = |mut v: Vec<(String, String)>| {
        v.sort();
        v
    };
    let expected = vec![
        ("cursor".to_string(), "abc".to_string()),
        ("limit".to_string(), "10".to_string()),
    ];
    assert_eq!(
        sorted(parse_query(r#"{"limit": 10, "cursor": "abc"}"#)),
        sorted(expected.clone())
    );
    assert_eq!(sorted(parse_query("limit=10&cursor=abc")), sorted(expected));
    assert!(parse_query("   ").is_empty());
}

#[test]
fn a_parameter_without_a_value_is_still_sent() {
    assert_eq!(
        parse_query("verbose"),
        vec![("verbose".to_string(), String::new())]
    );
}

#[test]
fn query_values_are_percent_encoded() {
    let url = with_query("https://x.test/a", &[("q".into(), "a b&c".into())]);
    assert_eq!(url, "https://x.test/a?q=a%20b%26c");
}

#[test]
fn query_appends_with_ampersand_when_the_url_already_has_one() {
    let url = with_query("https://x.test/a?z=1", &[("q".into(), "2".into())]);
    assert_eq!(url, "https://x.test/a?z=1&q=2");
}

#[test]
fn a_json_array_response_fans_out() {
    let items = response_items(r#"[{"id":1},{"id":2}]"#);
    assert_eq!(items.len(), 2);
    assert_eq!(items[1]["id"], json!(2));
}

#[test]
fn a_json_object_response_becomes_one_item() {
    let items = response_items(r#"{"ok":true}"#);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["ok"], json!(true));
}

#[test]
fn a_non_json_response_is_preserved_under_body() {
    let items = response_items("<html>hola</html>");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["body"], json!("<html>hola</html>"));
}

#[test]
fn an_empty_response_body_yields_an_empty_object() {
    assert_eq!(response_items("   ").len(), 1);
    assert_eq!(response_items("")[0], json!({}));
}

#[test]
fn response_fields_are_merged_over_the_input_item() {
    let input = json!({ "json": { "id": 1, "keep": "yes" } });
    let mut m = Map::new();
    m.insert("id".to_string(), json!(2));
    let out = item_with_result(Some(&input), m);
    assert_eq!(out["json"]["id"], json!(2));
    assert_eq!(out["json"]["keep"], json!("yes"));
}

#[test]
fn a_missing_key_fails_with_a_readable_message() {
    let err = run(&json!({}), vec![]).unwrap_err();
    assert!(err.contains("n8n_key"), "mensaje inesperado: {}", err);
}

#[test]
fn an_unknown_key_names_the_missing_node() {
    let err = run(&json!({ "n8n_key": "NoSuchNodeXyz" }), vec![]).unwrap_err();
    assert!(err.contains("NoSuchNodeXyz"), "mensaje inesperado: {}", err);
}

#[test]
fn polling_without_a_base_url_explains_what_is_missing() {
    let desc = NodeDescriptor {
        key: "GmailTrigger".into(),
        display_name: "Gmail Trigger".into(),
        description: String::new(),
        category: String::new(),
        subcategory: None,
        group: None,
        is_trigger: true,
        trigger_mode: Some("polling".into()),
        polling: true,
        webhook: false,
        package: String::new(),
        path: String::new(),
        credential: None,
        base_url: None,
        request: RequestTemplate::default(),
    };
    let err = poll_once(&json!({}), &desc).unwrap_err();
    assert!(err.contains("URL base"), "mensaje inesperado: {}", err);
    assert!(
        err.contains("Gmail Trigger"),
        "el error debe nombrar el nodo: {}",
        err
    );
}

#[test]
fn polling_reads_the_base_url_override_from_the_node() {
    let desc = NodeDescriptor {
        key: "X".into(),
        display_name: "X".into(),
        description: String::new(),
        category: String::new(),
        subcategory: None,
        group: None,
        is_trigger: true,
        trigger_mode: Some("polling".into()),
        polling: true,
        webhook: false,
        package: String::new(),
        path: String::new(),
        credential: None,
        base_url: Some("https://from-descriptor.test".into()),
        request: RequestTemplate::default(),
    };
    let node = json!({ "n8n_base_url": "https://from-node.test" });
    let picked = desc.effective_base_url(Some(cfg(&node, "n8n_base_url").as_str()));
    assert_eq!(picked.as_deref(), Some("https://from-node.test"));
}
