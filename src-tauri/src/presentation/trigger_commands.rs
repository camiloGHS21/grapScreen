use tauri::{AppHandle, State};
use crate::AppState;

/// Arm an automation's triggers (n8n's "Active" switch): starts watching
/// interval/cron, global hotkey, file changes and webhook as configured by
/// its trigger nodes. Returns a description of what is being watched.
#[tauri::command]
pub fn start_automation_trigger(
    app: AppHandle,
    state: State<AppState>,
    project_name: String,
    id: String,
) -> std::result::Result<String, String> {
    crate::application::trigger_service::start_triggers(
        app,
        state.replay_use_case.clone(),
        state.storage.clone(),
        &project_name,
        &id,
    )
}

/// Disarm an automation's triggers.
#[tauri::command]
pub fn stop_automation_trigger(id: String) -> std::result::Result<bool, String> {
    Ok(crate::application::trigger_service::stop_triggers(&id))
}

/// Whether the automation currently has armed triggers.
#[tauri::command]
pub fn get_trigger_status(id: String) -> std::result::Result<bool, String> {
    Ok(crate::application::trigger_service::is_active(&id))
}

/// List (automation_id, description) of every armed trigger.
#[tauri::command]
pub fn list_active_triggers() -> std::result::Result<Vec<(String, String)>, String> {
    Ok(crate::application::trigger_service::active_descriptions())
}
