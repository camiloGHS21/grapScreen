//! n8n-style graph execution engine.

pub mod engine;
pub mod extract;
pub mod node_runners;
pub mod walker;
pub mod transform;
pub mod ai_nodes;
pub mod core_nodes;
pub mod credentials;
pub mod db_nodes;
pub mod integration_nodes;
pub mod parse_nodes;

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
/// A JSON array fans out into one item per element, which is what n8n does and
/// what the transform nodes (`filter`, `sort`, `limit`, `aggregate`) expect —
/// they operate on the whole list. A JSON object becomes a single item. A body
/// that is not JSON at all (plain text, form-encoded) is wrapped under `body`
/// so `{{ $json.body }}` still resolves. An empty or whitespace-only body
/// yields no items, which is the normal case for `cron`/`startup`/`hotkey`.
pub(crate) fn trigger_payload_items(body: &str) -> Vec<serde_json::Value> {
    if body.trim().is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(serde_json::Value::Array(arr)) => arr,
        Ok(serde_json::Value::Null) => Vec::new(),
        Ok(other) => vec![other],
        Err(_) => vec![serde_json::json!({ "body": body })],
    }
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
    // (`webhook.body`, `polling.body`, …) immediately *before* calling into the
    // graph, so a blind reset would silently discard exactly the data the flow
    // was triggered by. Carry the trigger-scoped keys across the reset.
    let trigger_vars: Vec<(String, String)> =
        crate::application::replay_helpers::get_all_vars()
            .into_iter()
            .filter(|(k, _)| {
                k.starts_with("webhook.")
                    || k.starts_with("polling.")
                    || k.starts_with("trigger.")
            })
            .collect();
    crate::application::replay_helpers::reset_execution_state();
    for (k, v) in &trigger_vars {
        crate::application::replay_helpers::set_var(k, v);
    }
    // Expose the payload as items so downstream nodes can read it as
    // `{{ $json.x }}` instead of having to know the `$vars.polling.body` key.
    // Triggers with no payload (cron, startup, hotkey) leave the list empty.
    if let Some((_, body)) = trigger_vars
        .iter()
        .find(|(k, _)| k == "webhook.body" || k == "polling.body")
    {
        let items = trigger_payload_items(body);
        if !items.is_empty() {
            crate::application::replay_helpers::set_items(items);
        }
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
    fn non_json_body_is_wrapped_under_body() {
        // A form-encoded or plain-text webhook payload must not lose its data.
        let items = trigger_payload_items("a=1&b=2");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["body"], json!("a=1&b=2"));
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

