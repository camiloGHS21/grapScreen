use crate::domain::entities::RecordedEvent;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
pub struct GraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub start: Option<usize>,
    #[serde(default)]
    pub end: Option<usize>,
    /// Index of the event holding this node's configuration. Execution ranges
    /// may expand to guarantee full event coverage, so configuration lookups
    /// (condition expression, switch cases, loop iterations) must use this.
    #[serde(default)]
    pub data_idx: Option<usize>,
    #[serde(default)]
    pub sleep_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(non_snake_case)]
pub struct GraphConnection {
    pub sourceNodeId: String,
    pub sourcePortId: String,
    pub targetNodeId: String,
    #[allow(dead_code)]
    pub targetPortId: String,
}

/// Extract the executable graph from the `layout_metadata` event, if present.
pub fn extract_graph(
    events: &[RecordedEvent],
) -> Option<(Vec<GraphNode>, Vec<GraphConnection>, HashSet<String>)> {
    let meta = events.iter().find(|e| e.kind == "layout_metadata")?;
    let data = &meta.data;
    let nodes: Vec<GraphNode> = serde_json::from_value(data.get("graphNodes")?.clone()).ok()?;
    if nodes.is_empty() {
        return None;
    }
    let connections: Vec<GraphConnection> =
        serde_json::from_value(data.get("connections").cloned().unwrap_or(serde_json::json!([])))
            .unwrap_or_default();
    let disabled: HashSet<String> = data
        .get("disabledNodeIds")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Some((nodes, connections, disabled))
}
