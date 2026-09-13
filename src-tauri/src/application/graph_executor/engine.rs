use super::extract::{GraphConnection, GraphNode};
use crate::application::execution_history::NodeRunStatus;
use crate::application::replay_service::ReplayServiceImpl;
use crate::domain::entities::{RecordedEvent, TargetApp};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::time::Duration;

pub const STOPPED: &str = "__stopped__";

pub const PASSTHROUGH_KINDS: &[&str] = &[
    "start",
    "trigger",
    "webhook",
    "cron",
    "startup",
    "file_change",
    "hotkey_trigger",
    "note",
    "merge",
    "error_handler",
    "end",
    // Phase 11 — NoOp passes items through untouched; polling is a trigger
    // whose payload arrives via pending vars, like webhook.
    "noop",
    "polling",
];

pub const ENTRY_KINDS: &[&str] = &[
    "start",
    "trigger",
    "webhook",
    "cron",
    "startup",
    "file_change",
    "hotkey_trigger",
    "app",
    "polling",
];

/// Node kinds that own their own iteration / fan-out semantics.
///
/// Everything else is *item-based*: when several items reach it, the engine
/// runs it once per item with `$json` pointing at that item, accumulating the
/// outputs — the n8n execution model.
///
/// Transformation nodes belong here too, but for the opposite reason: they must
/// see the **whole array** at once (you cannot sort or aggregate one item in
/// isolation), so they must not be fanned out per item.
pub const ITEM_AWARE_KINDS: &[&str] = &[
    "condition",
    "switch",
    "loop",
    "split_batches",
    "merge",
    "wait",
    "delay",
    "error_handler",
    "sub_workflow",
    "note",
    "end",
    // Data transformation: operate on the full item list.
    "filter",
    "sort",
    "limit",
    "aggregate",
    "edit_fields",
    "date_time",
    "remove_duplicates",
    "compare_datasets",
    // AI nodes spend one request per node, not per item, and attach the answer
    // to every item themselves.
    "llm_chain",
    "classifier",
    "information_extractor",
    "sentiment_analysis",
    // Database nodes: they run a query/execute and replace the item list with
    // the result, exactly like other transform nodes.
    "sqlite_query",
    "sqlite_execute",
    // Phase 11 — parsing nodes: they replace the item list with parsed data.
    "rss_read",
    "xml_parse",
    "html_extract",
    // Phase 11 — stop_error runs once and aborts with an error message.
    "stop_error",
    // n8n Core nodes (core_nodes.rs): the split/summarise/rename/markdown and
    // crypto runners all see the whole list, like the transform family.
    "split_out",
    "summarize",
    "rename_keys",
    "markdown",
    "crypto",
];

/// Kind names the engine treats as data-transforming nodes: they consume the
/// incoming item list and replace it with what they produce.
pub const TRANSFORM_KINDS: &[&str] = &[
    "filter",
    "sort",
    "limit",
    "aggregate",
    "edit_fields",
    "date_time",
    "remove_duplicates",
    "compare_datasets",
    "llm_chain",
    "classifier",
    "information_extractor",
    "sentiment_analysis",
    "sqlite_query",
    "sqlite_execute",
    // Phase 11
    "rss_read",
    "xml_parse",
    "html_extract",
    // n8n Core nodes
    "split_out",
    "summarize",
    "rename_keys",
    "markdown",
    "crypto",
];

pub struct GraphEngine<'a> {
    pub(crate) service: &'a ReplayServiceImpl,
    pub(crate) file_id: &'a str,
    pub(crate) events: &'a [RecordedEvent],
    pub(crate) target: &'a Option<TargetApp>,
    pub(crate) is_background: bool,
    pub(crate) stop_flag: &'a AtomicBool,
    pub(crate) nodes: HashMap<String, GraphNode>,
    pub(crate) outgoing: HashMap<String, Vec<GraphConnection>>,
    pub(crate) disabled: HashSet<String>,
    pub(crate) error_handlers: Vec<String>,
    pub(crate) stop_after: Option<String>,
    pub(crate) finished_early: bool,
    pub status_log: Vec<NodeRunStatus>,
}

impl<'a> GraphEngine<'a> {
    pub fn new(
        service: &'a ReplayServiceImpl,
        file_id: &'a str,
        events: &'a [RecordedEvent],
        target: &'a Option<TargetApp>,
        is_background: bool,
        stop_flag: &'a AtomicBool,
        nodes: Vec<GraphNode>,
        connections: Vec<GraphConnection>,
        disabled: HashSet<String>,
    ) -> Self {
        let mut node_map = HashMap::new();
        let mut error_handlers = Vec::new();
        for n in nodes {
            if n.kind == "error_handler" {
                error_handlers.push(n.id.clone());
            }
            node_map.insert(n.id.clone(), n);
        }
        let mut outgoing: HashMap<String, Vec<GraphConnection>> = HashMap::new();
        for c in connections {
            outgoing.entry(c.sourceNodeId.clone()).or_default().push(c);
        }
        Self {
            service,
            file_id,
            events,
            target,
            is_background,
            stop_flag,
            nodes: node_map,
            outgoing,
            disabled,
            error_handlers,
            stop_after: None,
            finished_early: false,
            status_log: Vec::new(),
        }
    }

    pub fn set_stop_after(&mut self, node_id: Option<String>) {
        self.stop_after = node_id;
    }

    pub fn run(&mut self) -> Result<(), String> {
        let mut entries: Vec<String> = self
            .nodes
            .values()
            .filter(|n| ENTRY_KINDS.contains(&n.kind.as_str()))
            .map(|n| n.id.clone())
            .collect();
        entries.sort();
        if entries.is_empty() {
            let has_incoming: HashSet<String> = self
                .outgoing
                .values()
                .flatten()
                .map(|c| c.targetNodeId.clone())
                .collect();
            entries = self
                .nodes
                .values()
                .filter(|n| !has_incoming.contains(&n.id))
                .map(|n| n.id.clone())
                .collect();
            entries.sort();
        }
        let mut visited = HashSet::new();
        for entry in entries {
            self.walk(&entry, &mut visited, 0)?;
        }
        Ok(())
    }

    pub(crate) fn targets_of(&self, node_id: &str, port: Option<&str>) -> Vec<String> {
        match self.outgoing.get(node_id) {
            None => Vec::new(),
            Some(conns) => conns
                .iter()
                .filter(|c| port.map_or(true, |p| c.sourcePortId == p))
                .map(|c| c.targetNodeId.clone())
                .collect(),
        }
    }

    pub(crate) fn check_stop(&self) -> Result<(), String> {
        if !self.stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(STOPPED.into());
        }
        Ok(())
    }

    pub(crate) fn sleep_interruptible(&self, ms: u64) -> Result<(), String> {
        let mut remaining = ms;
        while remaining > 0 {
            self.check_stop()?;
            let slice = remaining.min(50);
            std::thread::sleep(Duration::from_millis(slice));
            remaining -= slice;
        }
        Ok(())
    }

    pub(crate) fn log_node(
        &mut self,
        node: &GraphNode,
        status: &str,
        input_data: Option<serde_json::Value>,
        output_data: Option<serde_json::Value>,
        duration_ms: Option<u64>,
    ) {
        self.status_log.retain(|n| n.node_id != node.id);
        self.status_log.push(NodeRunStatus {
            node_id: node.id.clone(),
            label: node.kind.clone(),
            status: status.to_string(),
            detail: None,
            input_data: input_data.clone(),
            output_data: output_data.clone(),
            duration_ms,
        });

        self.service.observer().on_node_detail(
            self.file_id,
            &node.id,
            status,
            input_data.as_ref(),
            output_data.as_ref(),
            duration_ms,
        );
    }
}

#[cfg(test)]
mod kind_registry_tests {
    use super::*;

    /// Every transform is also item-aware.
    ///
    /// The engine reads these two lists independently: `ITEM_AWARE_KINDS` stops
    /// the per-item fan-out, `TRANSFORM_KINDS` routes the node to
    /// `exec_transform`. A kind added to only one of them still compiles and
    /// still runs — it just does the wrong thing (transformed once per item, or
    /// treated as a plain recorded range). Nothing else catches that, so it is
    /// asserted here.
    #[test]
    fn every_transform_kind_is_also_item_aware() {
        for kind in TRANSFORM_KINDS {
            assert!(
                ITEM_AWARE_KINDS.contains(kind),
                "'{}' is in TRANSFORM_KINDS but missing from ITEM_AWARE_KINDS: \
                 it would be fanned out per item instead of seeing the whole list",
                kind
            );
        }
    }

    /// Every entry kind either passes items through or owns a recorded range.
    ///
    /// `app` is the one deliberate exception, and it is the reason this test
    /// exists. In a screen recording the `app` node is the root of the flow and
    /// spans the whole event list (`start: 0, end: events.len() - 1`); the
    /// engine replays that range through `exec_range`. Adding it to
    /// `PASSTHROUGH_KINDS` "for consistency" would make it skip its own events
    /// and every recorded automation would silently stop doing anything.
    ///
    /// So a new entry kind must make a conscious choice: pass through, or own a
    /// range. This test forces that decision instead of letting it default.
    #[test]
    fn every_entry_kind_passes_through_or_owns_a_recorded_range() {
        const RANGE_OWNING_ENTRIES: &[&str] = &["app"];
        for kind in ENTRY_KINDS {
            let ok = PASSTHROUGH_KINDS.contains(kind) || RANGE_OWNING_ENTRIES.contains(kind);
            assert!(
                ok,
                "'{}' is an entry kind but is neither a passthrough nor a known \
                 range-owning entry. Decide how it executes: add it to \
                 PASSTHROUGH_KINDS, or to RANGE_OWNING_ENTRIES if it replays \
                 recorded events.",
                kind
            );
        }
    }

    /// Pins the `app` node's execution mode.
    ///
    /// A recorded automation is a single `app` node spanning every recorded
    /// event. If someone adds `app` to `PASSTHROUGH_KINDS` — which looks like a
    /// tidy-up, since every other entry kind is a passthrough — the node stops
    /// replaying its events and screen recordings break with no error. This
    /// test exists to make that change fail loudly instead.
    #[test]
    fn the_app_node_must_replay_its_recorded_range() {
        assert!(
            ENTRY_KINDS.contains(&"app"),
            "the app node must remain an entry point"
        );
        assert!(
            !PASSTHROUGH_KINDS.contains(&"app"),
            "'app' must NOT be a passthrough: it owns the recorded event range. \
             Making it a passthrough silently breaks every screen recording."
        );
    }

    /// Guards against a typo silently disabling a node.
    #[test]
    fn no_kind_is_registered_twice() {
        for list in [ITEM_AWARE_KINDS, TRANSFORM_KINDS, PASSTHROUGH_KINDS, ENTRY_KINDS] {
            let mut seen = std::collections::HashSet::new();
            for kind in list {
                assert!(seen.insert(*kind), "'{}' appears twice in the same kind list", kind);
            }
        }
    }

    /// The n8n Core nodes must be reachable from the engine's transform path.
    #[test]
    fn the_core_transform_nodes_are_registered() {
        for kind in ["split_out", "summarize", "rename_keys", "markdown", "crypto"] {
            assert!(TRANSFORM_KINDS.contains(&kind), "'{}' is not a transform kind", kind);
            assert!(ITEM_AWARE_KINDS.contains(&kind), "'{}' is not item-aware", kind);
        }
    }
}
