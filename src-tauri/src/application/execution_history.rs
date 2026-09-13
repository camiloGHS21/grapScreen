//! n8n-style execution history: persists each run of an automation with its
//! per-node statuses and any error, capped to the most recent 50 runs.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRunStatus {
    pub node_id: String,
    pub label: String,
    pub status: String, // "ok" | "error" | "running" | "skipped"
    pub detail: Option<String>,
    #[serde(default)]
    pub input_data: Option<serde_json::Value>,
    #[serde(default)]
    pub output_data: Option<serde_json::Value>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub automation_id: String,
    pub automation_name: String,
    pub started_at: i64,
    pub finished_at: i64,
    pub duration_ms: u64,
    pub status: String, // "success" | "error" | "stopped"
    pub error: Option<String>,
    pub node_statuses: Vec<NodeRunStatus>,
    pub trigger_kind: Option<String>, // "manual" | "cron" | "webhook" | ...
}

static HISTORY: OnceLock<Mutex<Vec<ExecutionRecord>>> = OnceLock::new();
const MAX_RUNS: usize = 50;

fn history() -> &'static Mutex<Vec<ExecutionRecord>> {
    HISTORY.get_or_init(|| Mutex::new(Vec::new()))
}

fn history_path() -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("grapScreen");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("executions.json"))
}

fn load_from_disk() {
    let Some(path) = history_path() else { return };
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(records) = serde_json::from_str::<Vec<ExecutionRecord>>(&content) {
            let mut h = history().lock().unwrap();
            *h = records;
        }
    }
}

fn save_to_disk() {
    let Some(path) = history_path() else { return };
    let h = history().lock().unwrap();
    if let Ok(json) = serde_json::to_string_pretty(&*h) {
        let _ = std::fs::write(path, json);
    }
}

static LOADED: OnceLock<()> = OnceLock::new();

fn ensure_loaded() {
    LOADED.get_or_init(|| {
        load_from_disk();
    });
}

/// Append a finished run and trim the history.
pub fn record_run(record: ExecutionRecord) {
    ensure_loaded();
    let mut h = history().lock().unwrap();
    h.insert(0, record);
    h.truncate(MAX_RUNS);
    drop(h);
    save_to_disk();
}

/// All runs, most recent first. Optionally filter by automation id.
pub fn list_runs(automation_id: Option<String>) -> Vec<ExecutionRecord> {
    ensure_loaded();
    let h = history().lock().unwrap();
    h.iter()
        .filter(|r| automation_id.as_deref().map_or(true, |id| r.automation_id == id))
        .cloned()
        .collect()
}

pub fn clear_history() {
    let mut h = history().lock().unwrap();
    h.clear();
    drop(h);
    save_to_disk();
}
