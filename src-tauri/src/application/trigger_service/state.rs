use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};

pub(crate) struct TriggerEntry {
    pub(crate) stop: Arc<AtomicBool>,
    pub(crate) desc: String,
    pub(crate) project: String,
}

static REGISTRY: OnceLock<Mutex<HashMap<String, TriggerEntry>>> = OnceLock::new();
static PENDING_VARS: OnceLock<Mutex<HashMap<String, HashMap<String, String>>>> = OnceLock::new();

pub(crate) fn registry() -> &'static Mutex<HashMap<String, TriggerEntry>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn pending() -> &'static Mutex<HashMap<String, HashMap<String, String>>> {
    PENDING_VARS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Variables seeded right before a triggered run (e.g. webhook payload). The
/// replay thread picks them up on start so `{{ webhook.body }}` works.
pub fn seed_pending_vars(automation_id: &str, vars: HashMap<String, String>) {
    pending().lock().unwrap().insert(automation_id.to_string(), vars);
}

pub fn take_pending_vars(automation_id: &str) -> HashMap<String, String> {
    pending().lock().unwrap().remove(automation_id).unwrap_or_default()
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ArmedEntry {
    pub(crate) project: String,
    pub(crate) id: String,
}

pub(crate) fn armed_path() -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("grapScreen");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("triggers.json"))
}

pub(crate) fn persist_armed() {
    let map = registry().lock().unwrap();
    let entries: Vec<ArmedEntry> = map
        .iter()
        .map(|(id, e)| ArmedEntry { project: e.project.clone(), id: id.clone() })
        .collect();
    if let Some(path) = armed_path() {
        if let Ok(json) = serde_json::to_string_pretty(&entries) {
            let _ = std::fs::write(path, json);
        }
    }
}

pub(crate) fn load_armed() -> Vec<ArmedEntry> {
    armed_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}
