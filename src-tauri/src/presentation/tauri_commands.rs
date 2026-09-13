use crate::domain::entities::{AutomationFile, RecordedEvent, TargetApp};
use crate::AppState;
use tauri::State;
use std::fs;
use std::path::PathBuf;

#[derive(serde::Serialize)]
pub struct AutomationSummary {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub duration_ms: u64,
    pub event_count: usize,
    pub has_video: bool,
    pub json_path: String,
    pub mp4_path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ProjectSummary {
    pub name: String,
    pub automations: Vec<AutomationSummary>,
}

fn library_dir() -> std::result::Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "No data directory found".to_string())?
        .join("grapScreen")
        .join("projects");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
fn clean_project_name(name: &str) -> std::result::Result<String, String> {
    let clean: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        .collect();
    if clean.is_empty() {
        Err("Invalid project name".to_string())
    } else {
        Ok(clean)
    }
}




#[tauri::command]
pub fn get_projects() -> std::result::Result<Vec<String>, String> {
    let dir = library_dir()?;
    let mut projects = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    projects.push(name.to_string());
                }
            }
        }
    }
    projects.sort();
    Ok(projects)
}

#[tauri::command]
pub fn get_automations() -> std::result::Result<Vec<ProjectSummary>, String> {
    let root = library_dir()?;
    let mut projects = Vec::new();
    if root.exists() {
        for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() && path.file_name().and_then(|n| n.to_str()) != Some("temp") {
                let project_name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
                let mut automations = Vec::new();
                let automations_dir = path.join("automations");
                if automations_dir.exists() {
                    for sub_entry in fs::read_dir(&automations_dir).map_err(|e| e.to_string())? {
                        let sub_entry = sub_entry.map_err(|e| e.to_string())?;
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() && sub_path.extension().map_or(false, |ext| ext == "json") {
                            if let Ok(text) = fs::read_to_string(&sub_path) {
                                if let Ok(file) = serde_json::from_str::<AutomationFile>(&text) {
                                    let mp4 = automations_dir.join(format!("{}.mp4", file.id));
                                    automations.push(AutomationSummary {
                                        id: file.id,
                                        name: file.name,
                                        created_at: file.created_at,
                                        duration_ms: file.duration_ms,
                                        event_count: file.events.len(),
                                        has_video: mp4.exists(),
                                        json_path: sub_path.to_string_lossy().into(),
                                        mp4_path: mp4.exists().then(|| mp4.to_string_lossy().into()),
                                    });
                                }
                            }
                        }
                    }
                }
                automations.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                projects.push(ProjectSummary {
                    name: project_name,
                    automations,
                });
            }
        }
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
pub fn get_automation(state: State<AppState>, project_name: String, id: String) -> std::result::Result<AutomationFile, String> {
    state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_automation(state: State<AppState>, project_name: String, id: String, events: Vec<crate::domain::entities::RecordedEvent>) -> std::result::Result<(), String> {
    let mut file = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    file.events = events;
    file.duration_ms = file.events.last().map(|e| e.at_ms).unwrap_or(0);
    state.storage.save_automation(&project_name, &file).map_err(|e| e.to_string())?;
    Ok(())
}


/// Seed an empty automation with a single editable Trigger ("main node")
/// plus the layout_metadata event that stores canvas state (positions,
/// connections, notes, disabled nodes). This way the canvas is never a dead
/// blank and the user starts from a real, configurable entry point.
fn seed_empty_events() -> Vec<RecordedEvent> {
    let trigger_id = uuid::Uuid::new_v4().to_string();
    let mut trigger = RecordedEvent {
        at_ms: 0,
        kind: "trigger".to_string(),
        data: serde_json::json!({
            "id": trigger_id,
            "trigger_type": "manual",
            "description": "Inicio"
        }),
    };
    let layout = RecordedEvent {
        at_ms: 99999999,
        kind: "layout_metadata".to_string(),
        data: serde_json::json!({
            "positions": {},
            "connections": [],
            "notes": [],
            "disabledNodeIds": []
        }),
    };
    let mut events: Vec<RecordedEvent> = Vec::new();
    events.push(trigger);
    events.push(layout);
    events
}


#[tauri::command]
pub fn create_empty_automation(
    state: State<AppState>,
    project_name: String,
    name: String,
) -> std::result::Result<AutomationFile, String> {
    let file_id = uuid::Uuid::new_v4().to_string();
    let auto_file = AutomationFile {
        id: file_id,
        name,
        created_at: chrono::Utc::now().timestamp(),
        duration_ms: 0,
        generate_mp4: false,
        events: seed_empty_events(),
        target_app: None,
    };
    state.storage.save_automation(&project_name, &auto_file).map_err(|e| e.to_string())?;
    Ok(auto_file)
}

#[tauri::command]
pub fn duplicate_automation(state: State<AppState>, project_name: String, id: String, new_name: String) -> std::result::Result<AutomationFile, String> {
    let source = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    let new_id = uuid::Uuid::new_v4().to_string();
    let dup_file = AutomationFile {
        id: new_id,
        name: new_name,
        created_at: chrono::Utc::now().timestamp(),
        duration_ms: source.duration_ms,
        generate_mp4: source.generate_mp4,
        events: source.events,
        target_app: source.target_app,
    };
    state.storage.save_automation(&project_name, &dup_file).map_err(|e| e.to_string())?;
    Ok(dup_file)
}

#[tauri::command]
pub fn rename_automation(state: State<AppState>, project_name: String, id: String, new_name: String) -> std::result::Result<(), String> {
    let mut file = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    file.name = new_name;
    state.storage.save_automation(&project_name, &file).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_automation(project_name: String, id: String) -> std::result::Result<(), String> {
    let dir = library_dir()?.join(&project_name).join("automations");
    for ext in &["json", "mp4"] {
        let p = dir.join(format!("{}.{}", id, ext));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_project(name: String) -> std::result::Result<String, String> {
    let clean = clean_project_name(&name)?;
    let dir = library_dir()?.join(&clean);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(clean)
}

#[tauri::command]
pub fn delete_project(name: String) -> std::result::Result<(), String> {
    let clean = clean_project_name(&name)?;
    let dir = library_dir()?.join(clean);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_automation_target_app(
    state: State<AppState>,
    project_name: String,
    id: String,
    target_app: Option<TargetApp>,
) -> std::result::Result<(), String> {
    let mut file = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    file.target_app = target_app;
    state.storage.save_automation(&project_name, &file).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn submit_form_response(
    status: String,
    values: std::collections::HashMap<String, String>,
) -> std::result::Result<(), String> {
    let guard_mutex = crate::application::replay_helpers::get_form_tx();
    let mut guard = guard_mutex.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send((status, values));
        Ok(())
    } else {
        Err("No active form request found".to_string())
    }
}

#[tauri::command]
pub fn get_runner_flow(
    state: State<'_, crate::AppendedFlowState>,
) -> Option<crate::domain::entities::AutomationFile> {
    state.0.lock().unwrap().clone()
}

