//! Shared plumbing for the engine's execution tests.
//!
//! Every test in this directory builds a **connected graph** and runs it through
//! the real [`GraphEngine`], so what is exercised is the production dispatch
//! (`walk` → `exec_node` → runner), not a re-implementation of it. A test that
//! hand-calls `run_filter` proves the filter works; it does not prove the engine
//! reaches it, and those are different claims.
//!
//! # Nothing here can touch the machine
//!
//! The service is built with **no automation backends**. That is not a
//! convenience: `execute_action` iterates the backend list and returns
//! `Failed("All backends exhausted")` when none claims the action, and
//! `run_single_event` discards that result. With an empty list no `ActionRequest`
//! can ever reach the real mouse, keyboard or window manager, no matter which
//! node kind a test drives through `exec_range`.
//!
//! The remaining real-effect paths (`handle_custom_event`) are keyed by event
//! kind — `run_cmd`, `close_app`, `open_app`, `screenshot`, `wait_image`,
//! `hotkey`, `form`, `http_request` and the integrations. Tests that must cover
//! those kinds use [`declares_untestable`] and assert on the classification
//! instead of executing them.

use super::engine::GraphEngine;
use super::extract::{GraphConnection, GraphNode};
use crate::application::execution_history::NodeRunStatus;
use crate::application::replay_service::ReplayServiceImpl;
use crate::domain::entities::{ActionRequest, ActionResult, AutomationFile, DomainError, OcrScan};
use crate::domain::entities::{RecordedEvent, Result as DomainResult};
use crate::domain::ports_out::{AutomationBackendPort, OcrPort, ReplayObserver, StoragePort};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub const FILE_ID: &str = "test-file";

// ── ports ────────────────────────────────────────────────────────────────

struct NullStorage;

impl StoragePort for NullStorage {
    fn save_automation(&self, _p: &str, _f: &AutomationFile) -> DomainResult<()> {
        Ok(())
    }
    fn load_automation(&self, _p: &str, _id: &str) -> DomainResult<AutomationFile> {
        Err(DomainError::Other("el arnés del motor no carga sub-flujos".into()))
    }
    fn list_automations(&self, _p: &str) -> DomainResult<Vec<AutomationFile>> {
        Ok(Vec::new())
    }
}

pub struct StubOcr;

impl OcrPort for StubOcr {
    fn scan_screen_text(&self) -> DomainResult<OcrScan> {
        Err(DomainError::Other("el arnés del motor no lee la pantalla".into()))
    }
}

/// Records every per-node status transition the engine reports.
///
/// This is what makes "which branch was taken" observable without inspecting
/// internals: a node that did not run has no status, and the order of the log is
/// the order the walker visited them.
#[derive(Default)]
pub struct RecordingObserver {
    pub events: Mutex<Vec<(String, String)>>,
}

impl RecordingObserver {
    pub fn statuses_of(&self, node_id: &str) -> Vec<String> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|(id, _)| id == node_id)
            .map(|(_, s)| s.clone())
            .collect()
    }

    /// Node ids in the order they were reported, first occurrence wins.
    pub fn visited(&self) -> Vec<String> {
        let mut seen = HashSet::new();
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|(id, _)| seen.insert(id.clone()))
            .map(|(id, _)| id.clone())
            .collect()
    }
}

impl ReplayObserver for RecordingObserver {
    fn on_progress(&self, _f: &str, _s: usize, _t: usize) {}
    fn on_status(&self, _f: &str, _s: &str) {}
    fn on_node_status(&self, _f: &str, node_id: &str, status: &str) {
        self.events
            .lock()
            .unwrap()
            .push((node_id.to_string(), status.to_string()));
    }
}

/// A backend that is *offered* every action the engine produces but claims none
/// of them, so `execute_action` always exhausts the list and nothing is
/// performed.
///
/// Both halves matter. `offered` is the proof that a recorded range really was
/// walked and translated into desktop actions; `performed` staying empty is the
/// proof that none of them happened. A backend that simply refused without
/// recording would make "the range ran" and "the range was skipped"
/// indistinguishable.
#[derive(Default, Clone)]
pub struct SpyBackend {
    pub offered: Arc<Mutex<Vec<String>>>,
    pub performed: Arc<Mutex<Vec<String>>>,
}

impl SpyBackend {
    pub fn offered_actions(&self) -> Vec<String> {
        self.offered.lock().unwrap().clone()
    }

    pub fn performed_actions(&self) -> Vec<String> {
        self.performed.lock().unwrap().clone()
    }
}

/// Variant name of an `ActionRequest`, e.g. `MouseMove`, without its payload.
fn action_name(action: &ActionRequest) -> String {
    let debug = format!("{:?}", action);
    debug
        .split(['{', '(', ' '])
        .next()
        .unwrap_or(&debug)
        .to_string()
}

impl AutomationBackendPort for SpyBackend {
    fn name(&self) -> &str {
        "test/spy"
    }
    fn level(&self) -> u8 {
        10
    }
    fn can_handle(&self, action: &ActionRequest) -> bool {
        self.offered.lock().unwrap().push(action_name(action));
        false
    }
    fn execute(&self, action: &ActionRequest) -> ActionResult {
        self.performed.lock().unwrap().push(action_name(action));
        ActionResult::Unsupported
    }
}

// ── service ──────────────────────────────────────────────────────────────

pub struct Harness {
    service: ReplayServiceImpl,
    pub observer: Arc<RecordingObserver>,
    /// Present only when built with [`Harness::with_spy_backend`].
    pub spy: Option<SpyBackend>,
}

impl Harness {
    /// Production service with inert ports and **no** automation backends.
    ///
    /// `execute_action` then iterates an empty list and returns
    /// `Failed("All backends exhausted")`, which `run_single_event` discards —
    /// so no `ActionRequest` can reach the real mouse, keyboard or window
    /// manager, whatever node kind a test drives through `exec_range`.
    pub fn inert() -> Self {
        let observer = Arc::new(RecordingObserver::default());
        Self {
            service: ReplayServiceImpl::new(
                Arc::new(NullStorage),
                Vec::new(),
                observer.clone(),
                Arc::new(StubOcr),
            ),
            observer,
            spy: None,
        }
    }

    /// Same, plus a backend that is offered every action and performs none, so a
    /// test can assert what the engine *tried* to do.
    pub fn with_spy_backend() -> Self {
        let observer = Arc::new(RecordingObserver::default());
        let spy = SpyBackend::default();
        Self {
            service: ReplayServiceImpl::new(
                Arc::new(NullStorage),
                vec![Box::new(spy.clone())],
                observer.clone(),
                Arc::new(StubOcr),
            ),
            observer,
            spy: Some(spy),
        }
    }

    /// The actions the engine offered the spy backend, in order.
    pub fn offered_actions(&self) -> Vec<String> {
        self.spy.as_ref().map(|s| s.offered_actions()).unwrap_or_default()
    }

    /// The actions the spy backend was asked to perform. Must always be empty.
    pub fn performed_actions(&self) -> Vec<String> {
        self.spy.as_ref().map(|s| s.performed_actions()).unwrap_or_default()
    }
}

// ── graph construction ───────────────────────────────────────────────────

pub fn event(kind: &str, data: Value) -> RecordedEvent {
    RecordedEvent { at_ms: 0, kind: kind.to_string(), data }
}

/// Builds a connected graph one node at a time.
///
/// Each `node()` call also pushes that node's configuration event, and wires the
/// node's `data_idx`/`start`/`end` to it — the same thing the canvas does when it
/// writes `layout_metadata`. Ports are plain strings: `output`, `true`, `false`,
/// `case0`…, `body`, `done`.
#[derive(Default)]
pub struct Graph {
    nodes: Vec<GraphNode>,
    connections: Vec<GraphConnection>,
    disabled: HashSet<String>,
    index: std::collections::HashMap<String, usize>,
    pub events: Vec<RecordedEvent>,
}

impl Graph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn node(mut self, id: &str, kind: &str, data: Value) -> Self {
        let at = self.events.len();
        self.events.push(event(kind, data));
        self.index.insert(id.to_string(), self.nodes.len());
        self.nodes.push(GraphNode {
            id: id.to_string(),
            kind: kind.to_string(),
            start: Some(at),
            end: Some(at),
            data_idx: Some(at),
            sleep_ms: None,
        });
        self
    }

    /// Node whose configuration lives in a *different* event than its range,
    /// which is how the canvas writes a node that owns recorded steps.
    pub fn node_with_range(mut self, id: &str, kind: &str, data: Value, range: (usize, usize)) -> Self {
        let at = self.events.len();
        self.events.push(event(kind, data));
        self.index.insert(id.to_string(), self.nodes.len());
        self.nodes.push(GraphNode {
            id: id.to_string(),
            kind: kind.to_string(),
            start: Some(range.0),
            end: Some(range.1),
            data_idx: Some(at),
            sleep_ms: None,
        });
        self
    }

    /// Appends an event that belongs to no node (a recorded action).
    pub fn raw_event(mut self, kind: &str, data: Value) -> Self {
        self.events.push(event(kind, data));
        self
    }

    pub fn connect(mut self, from: &str, port: &str, to: &str) -> Self {
        self.connections.push(GraphConnection {
            sourceNodeId: from.to_string(),
            sourcePortId: port.to_string(),
            targetNodeId: to.to_string(),
            targetPortId: "input".to_string(),
        });
        self
    }

    pub fn disable(mut self, id: &str) -> Self {
        self.disabled.insert(id.to_string());
        self
    }

    pub fn set_sleep_ms(mut self, id: &str, ms: u64) -> Self {
        let i = self.index[id];
        self.nodes[i].sleep_ms = Some(ms);
        self
    }

    fn parts(self) -> (Vec<GraphNode>, Vec<GraphConnection>, HashSet<String>, Vec<RecordedEvent>) {
        (self.nodes, self.connections, self.disabled, self.events)
    }
}

// ── running ──────────────────────────────────────────────────────────────

pub struct Run {
    pub result: Result<(), String>,
    pub status_log: Vec<NodeRunStatus>,
    pub observer: Arc<RecordingObserver>,
    pub events: Vec<RecordedEvent>,
    /// Actions the engine offered the spy backend (empty without one).
    pub offered_actions: Vec<String>,
    /// Actions a backend was asked to perform (empty without one).
    pub performed_actions: Vec<String>,
}

impl Run {
    /// True when the node ran to completion (has an "ok" status).
    pub fn ran(&self, node_id: &str) -> bool {
        self.observer.statuses_of(node_id).iter().any(|s| s == "ok")
    }

    /// True when the node produced *no* status at all — it was never walked.
    pub fn skipped(&self, node_id: &str) -> bool {
        self.observer.statuses_of(node_id).is_empty()
    }

    pub fn status_of(&self, node_id: &str) -> Option<String> {
        self.observer.statuses_of(node_id).pop()
    }

    /// Node ids in walk order.
    pub fn order(&self) -> Vec<String> {
        self.observer.visited()
    }

    pub fn log_of(&self, node_id: &str) -> Option<&NodeRunStatus> {
        self.status_log.iter().find(|n| n.node_id == node_id)
    }

    /// The items a node published as its output.
    pub fn output_items(&self, node_id: &str) -> Vec<Value> {
        self.log_of(node_id)
            .and_then(|n| n.output_data.as_ref())
            .and_then(|v| v.get("items"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
    }
}

pub struct Runner {
    harness: Harness,
    graph: Graph,
    stop_after: Option<String>,
    only_node: Option<String>,
    seed_items: Vec<Value>,
    seed_vars: Vec<(String, String)>,
    running: bool,
}

impl Runner {
    pub fn new(harness: Harness, graph: Graph) -> Self {
        Self {
            harness,
            graph,
            stop_after: None,
            only_node: None,
            seed_items: Vec::new(),
            seed_vars: Vec::new(),
            running: true,
        }
    }

    /// Items already in scope when the entry node runs — the payload a trigger
    /// hands the flow.
    pub fn with_items(mut self, items: Vec<Value>) -> Self {
        self.seed_items = items;
        self
    }

    pub fn with_vars(mut self, vars: &[(&str, &str)]) -> Self {
        self.seed_vars = vars.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        self
    }

    pub fn stopping_after(mut self, node_id: &str) -> Self {
        self.stop_after = Some(node_id.to_string());
        self
    }

    pub fn only_node(mut self, node_id: &str) -> Self {
        self.only_node = Some(node_id.to_string());
        self
    }

    /// Simulates the user having pressed Stop before the run started.
    pub fn stopped(mut self) -> Self {
        self.running = false;
        self
    }

    /// Runs the graph through `GraphEngine::run`, exactly as production does.
    pub fn run(self) -> Run {
        let (nodes, connections, disabled, events) = self.graph.parts();
        let stop_flag = AtomicBool::new(self.running);
        let mut engine = GraphEngine::new(
            &self.harness.service,
            FILE_ID,
            &events,
            &None,
            false,
            &stop_flag,
            nodes,
            connections,
            disabled,
        );
        engine.set_stop_after(self.stop_after);
        engine.set_only_node(self.only_node);

        super::super::replay_helpers::reset_execution_state();
        for (k, v) in &self.seed_vars {
            super::super::replay_helpers::set_var(k, v);
        }
        super::super::replay_helpers::set_items(self.seed_items.clone());

        let result = engine.run();
        let offered_actions = self.harness.offered_actions();
        let performed_actions = self.harness.performed_actions();
        Run {
            result,
            status_log: engine.status_log,
            observer: self.harness.observer,
            events,
            offered_actions,
            performed_actions,
        }
    }
}

/// Convenience: `json!` for a node with no interesting configuration.
pub fn cfg() -> Value {
    json!({})
}

/// The data inside an item, without its `{"json": …}` envelope.
///
/// `replay_helpers::set_items` wraps every item it is handed, so what a node
/// publishes is always enveloped. Tests assert on the payload, because that is
/// what `{{ $json.x }}` resolves against and therefore what a user sees.
pub fn payload(item: &Value) -> Value {
    item.get("json").cloned().unwrap_or_else(|| item.clone())
}

/// [`payload`] for a whole item list.
pub fn payloads(items: &[Value]) -> Vec<Value> {
    items.iter().map(payload).collect()
}

// ── kinds that cannot be executed without the desktop ────────────────────

/// Node kinds whose real runner performs an irreversible or external action, so
/// they are deliberately never executed here.
///
/// A test for one of these asserts the *classification* — that the kind is
/// listed here and therefore excluded from execution — rather than pretending to
/// have run it. That is the honest claim; claiming coverage of `run_cmd` by
/// calling it would shell out on the developer's machine.
pub const UNTESTABLE_KINDS: &[&str] = &[
    // Spawns a process / kills one.
    "run_cmd",
    "open_app",
    "close_app",
    // Drives the real mouse and keyboard.
    "hotkey",
    "click",
    "type",
    "scroll",
    "mouse_move",
    "button_press",
    "button_release",
    "drag",
    "key_press",
    "key_release",
    // Reads or writes the real screen.
    "screenshot",
    "wait_image",
    // Opens a real window.
    "form",
    // Talks to a remote service with the user's credentials.
    "http_request",
    "telegram",
    "whatsapp",
    "google_sheets",
    "google_docs",
    "email_trigger",
];

/// Documents, in code, that a kind was reviewed and cannot be executed here.
///
/// Returns the reason so the caller can assert on it; the value is stable so a
/// test can pin the classification.
pub fn declares_untestable(kind: &str) -> &'static str {
    if UNTESTABLE_KINDS.contains(&kind) {
        "efecto real sobre la máquina o servicio externo: no se ejecuta en las pruebas"
    } else {
        "este tipo no está declarado como no comprobable"
    }
}
