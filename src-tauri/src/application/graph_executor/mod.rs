//! n8n-style graph execution engine.

pub mod engine;
pub mod extract;
pub mod flow_control;
pub mod node_runners;
pub mod walker;
pub mod transform;
pub mod ai_nodes;
pub mod core_nodes;
pub mod credentials;
pub mod db_nodes;
pub mod declarative;
pub mod integration_nodes;
pub mod parse_nodes;
pub mod postgres_builder;
pub mod postgres_node;
pub mod runmap;
pub mod ai_agent_runner;

#[cfg(test)]
pub mod testkit;
#[cfg(test)]
mod engine_tests;

pub use engine::GraphEngine;
pub use extract::{extract_graph, GraphConnection, GraphNode};

use crate::application::execution_history::NodeRunStatus;
use crate::application::replay_service::ReplayServiceImpl;
use crate::domain::entities::{RecordedEvent, TargetApp};
use std::collections::HashSet;
use std::sync::atomic::AtomicBool;

/// Turns the raw body a trigger received into the item list the flow starts
/// with.
///
/// Triggers write their incoming payload to `webhook.body`, `polling.body`,
/// etc. A JSON object becomes a single-item array `[{"x": 1}]`. A JSON array
/// becomes `[{"x": 1}, {"x": 2}]`. Anything else (form-encoded string, plain
/// text, empty payload) is wrapped into `[{"data": ...}]` so downstream nodes
/// always receive an array and never crash on unexpected root shapes.
pub(crate) fn trigger_payload_items(body: &str) -> Vec<serde_json::Value> {
    let trimmed = body.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Vec::new();
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return match val {
            serde_json::Value::Array(items) => items,
            serde_json::Value::Object(_) => vec![val],
            other => vec![serde_json::json!({ "data": other })],
        };
    }
    // Form-encoded: "a=1&b=2" becomes {"a":"1","b":"2"}.
    if trimmed.contains('=') && !trimmed.contains('\n') {
        let mut map = serde_json::Map::new();
        for pair in trimmed.split('&') {
            let mut parts = pair.splitn(2, '=');
            if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                map.insert(k.to_string(), serde_json::Value::String(v.to_string()));
            }
        }
        if !map.is_empty() {
            return vec![serde_json::Value::Object(map)];
        }
    }
    vec![serde_json::json!({ "data": trimmed })]
}

/// Entry point used by the replay service: executes the whole graph.
pub fn run_graph(
    service: &ReplayServiceImpl,
    file_id: &str,
    events: &[RecordedEvent],
    target: &Option<TargetApp>,
    is_background: bool,
    stop_flag: &AtomicBool,
    nodes: Vec<GraphNode>,
    connections: Vec<GraphConnection>,
    disabled: HashSet<String>,
) -> Result<Vec<NodeRunStatus>, String> {
    run_graph_with_options(service, file_id, events, target, is_background, stop_flag, nodes, connections, disabled, None)
}

/// Full-options graph run; `stop_after` limits execution to a target node
/// (n8n "Execute previous nodes"). Returns the per-node status log.
pub fn run_graph_with_options(
    service: &ReplayServiceImpl,
    file_id: &str,
    events: &[RecordedEvent],
    target: &Option<TargetApp>,
    is_background: bool,
    stop_flag: &AtomicBool,
    nodes: Vec<GraphNode>,
    connections: Vec<GraphConnection>,
    disabled: HashSet<String>,
    stop_after: Option<String>,
) -> Result<Vec<NodeRunStatus>, String> {
    // Fresh execution state: no variables, items or node outputs leak in from a
    // previous run.
    //
    // Caveat: the trigger daemon seeds the incoming payload as variables
    // (`webhook.body`, `polling.body`, `chatInput`, …) immediately *before*
    // calling into the graph. Carry trigger-scoped keys across the reset.
    let trigger_vars: Vec<(String, String)> =
        crate::application::replay_helpers::get_all_vars()
            .into_iter()
            .filter(|(k, _)| {
                k.starts_with("webhook.")
                    || k.starts_with("polling.")
                    || k.starts_with("trigger.")
                    || k.starts_with("chat.")
                    || k == "chatInput"
                    || k == "sessionId"
            })
            .collect();
    crate::application::replay_helpers::reset_execution_state();
    for (k, v) in &trigger_vars {
        crate::application::replay_helpers::set_var(k, v);
    }
    // Expose the payload as items so downstream nodes can read it as
    // `{{ $json.x }}` instead of having to know the `$vars.polling.body` key.
    if let Some((_, body)) = trigger_vars
        .iter()
        .find(|(k, _)| k == "webhook.body" || k == "polling.body" || k == "chat.body")
    {
        let items = trigger_payload_items(body);
        if !items.is_empty() {
            crate::application::replay_helpers::set_items(items);
        }
    } else if let Some((_, input)) = trigger_vars.iter().find(|(k, _)| k == "chatInput") {
        let session = trigger_vars
            .iter()
            .find(|(k, _)| k == "sessionId")
            .map(|(_, s)| s.as_str())
            .unwrap_or("test_session");
        crate::application::replay_helpers::set_items(vec![serde_json::json!({
            "chatInput": input,
            "message": input,
            "text": input,
            "sessionId": session
        })]);
    }
    let mut engine = GraphEngine::new(
        service,
        file_id,
        events,
        target,
        is_background,
        stop_flag,
        nodes,
        connections,
        disabled,
    );
    engine.set_stop_after(stop_after);
    engine.run()?;
    Ok(engine.status_log)
}

/// Runs a single node and returns its status log.
///
/// This is n8n's "Execute step": only the requested node runs, with no upstream
/// walk, so the user can inspect a node's real input and output without
/// replaying (and side-effecting) everything before it.
pub fn run_single_node_with_options(
    service: &ReplayServiceImpl,
    file_id: &str,
    events: &[RecordedEvent],
    target: &Option<TargetApp>,
    is_background: bool,
    stop_flag: &AtomicBool,
    nodes: Vec<GraphNode>,
    connections: Vec<GraphConnection>,
    disabled: HashSet<String>,
    node_id: &str,
) -> Result<Vec<NodeRunStatus>, String> {
    let mut engine = GraphEngine::new(
        service,
        file_id,
        events,
        target,
        is_background,
        stop_flag,
        nodes,
        connections,
        disabled,
    );
    engine.set_only_node(Some(node_id.to_string()));
    engine.run()?;
    Ok(engine.status_log)
}

#[cfg(test)]
mod trigger_payload_tests {
    use super::trigger_payload_items;
    use serde_json::json;

    #[test]
    fn empty_body_yields_no_items() {
        // cron / startup / hotkey carry no payload: the flow must still run,
        // just without a seeded item.
        assert!(trigger_payload_items("").is_empty());
        assert!(trigger_payload_items("   \n\t ").is_empty());
        assert!(trigger_payload_items("null").is_empty());
    }

    #[test]
    fn json_object_becomes_a_single_item() {
        let items = trigger_payload_items(r#"{"id":7,"name":"ana"}"#);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], json!(7));
        assert_eq!(items[0]["name"], json!("ana"));
    }

    #[test]
    fn json_array_fans_out_into_one_item_per_element() {
        let items = trigger_payload_items(r#"[{"id":1},{"id":2},{"id":3}]"#);
        assert_eq!(items.len(), 3);
        assert_eq!(items[2]["id"], json!(3));
    }

    #[test]
    fn form_encoded_body_is_decoded_into_fields() {
        // A form-encoded webhook payload becomes one item whose fields are
        // addressable as `{{ $json.a }}`, instead of one opaque string. HTML
        // form posts and Slack-style urlencoded callbacks rely on this shape.
        let items = trigger_payload_items("a=1&b=2");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["a"], json!("1"));
        assert_eq!(items[0]["b"], json!("2"));
    }

    #[test]
    fn plain_text_body_is_wrapped_under_data() {
        // Text that is neither JSON nor form-encoded (the newline rules out the
        // form branch) is wrapped so downstream nodes always receive an object.
        // `{{ $json.data }}` is the documented contract for that case.
        let items = trigger_payload_items("hola\nmundo");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["data"], json!("hola\nmundo"));
    }

    #[test]
    fn scalar_json_becomes_a_single_item() {
        assert_eq!(trigger_payload_items("42").len(), 1);
        assert_eq!(trigger_payload_items(r#""hola""#).len(), 1);
        assert_eq!(trigger_payload_items("false").len(), 1);
    }

    #[test]
    fn empty_json_array_yields_no_items() {
        assert!(trigger_payload_items("[]").is_empty());
    }
}

