use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tauri::{AppHandle, State};
use crate::AppState;

#[tauri::command]
pub fn execute_automation(
    state: State<AppState>,
    project_name: String,
    id: String,
) -> std::result::Result<(), String> {
    state.replay_use_case
        .execute_replay(&project_name, &id, false)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn execute_automation_isolated(
    app: AppHandle,
    state: State<AppState>,
    recorder_state: State<crate::RecorderState>,
    project_name: String,
    id: String,
) -> std::result::Result<(), String> {
    let file = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    let target = file.target_app.clone().ok_or_else(|| {
        "Esta automatización no tiene una app objetivo grabada. Grábala de nuevo con la app activa para poder ejecutarla aislada.".to_string()
    })?;
    let stop = Arc::new(AtomicBool::new(true));
    crate::isolated::register_isolated(&recorder_state, &id, stop.clone());
    crate::isolated::execute_isolated(app, id, file.events, target, stop);
    Ok(())
}

#[tauri::command]
pub fn execute_automation_background(
    state: State<AppState>,
    project_name: String,
    id: String,
) -> std::result::Result<(), String> {
    state.replay_use_case
        .execute_replay(&project_name, &id, true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_execution(
    state: State<AppState>,
    recorder_state: State<crate::RecorderState>,
) -> std::result::Result<(), String> {
    state.replay_use_case.stop_all_replays().map_err(|e| e.to_string())?;
    crate::isolated::stop_all_isolated(&recorder_state);
    Ok(())
}

/// n8n "Execute previous nodes": run the graph but stop right after
/// `node_id` finishes. Only works for graph-based flows (falls back to a
/// normal full run for legacy linear recordings).
#[tauri::command]
pub fn execute_automation_until(
    state: State<AppState>,
    project_name: String,
    id: String,
    node_id: String,
) -> std::result::Result<(), String> {
    state.replay_use_case
        .execute_replay_until(&project_name, &id, &node_id)
        .map_err(|e| e.to_string())
}

/// Execution history: list recorded runs (most recent first).
#[tauri::command]
pub fn get_execution_history(
    automation_id: Option<String>,
) -> std::result::Result<Vec<crate::application::execution_history::ExecutionRecord>, String> {
    Ok(crate::application::execution_history::list_runs(automation_id))
}

/// Clear the execution history.
#[tauri::command]
pub fn clear_execution_history() -> std::result::Result<(), String> {
    crate::application::execution_history::clear_history();
    Ok(())
}
