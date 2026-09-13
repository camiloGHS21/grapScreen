use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
use crate::AppendedFlowState;
use crate::AppState;

pub fn read_appended_flow() -> Option<crate::domain::entities::AutomationFile> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    let exe_path = std::env::current_exe().ok()?;
    let mut file = File::open(exe_path).ok()?;
    let metadata = file.metadata().ok()?;
    let len = metadata.len();
    if len < 32 {
        return None;
    }
    if file.seek(SeekFrom::End(-8)).is_err() {
        return None;
    }
    let mut len_bytes = [0u8; 8];
    if file.read_exact(&mut len_bytes).is_err() {
        return None;
    }
    let json_len = u64::from_le_bytes(len_bytes) as usize;
    if json_len == 0 || json_len > len as usize {
        return None;
    }
    let marker = b"//GRAPSCREEN_FLOW_DATA//";
    let marker_len = marker.len();
    let seek_pos = 8 + marker_len;
    if file.seek(SeekFrom::End(-(seek_pos as i64))).is_err() {
        return None;
    }
    let mut marker_buf = vec![0u8; marker_len];
    if file.read_exact(&mut marker_buf).is_err() {
        return None;
    }
    if marker_buf != marker {
        return None;
    }
    let json_seek_pos = 8 + marker_len + json_len;
    if file.seek(SeekFrom::End(-(json_seek_pos as i64))).is_err() {
        return None;
    }
    let mut json_buf = vec![0u8; json_len];
    if file.read_exact(&mut json_buf).is_err() {
        return None;
    }
    let json_str = String::from_utf8(json_buf).ok()?;
    serde_json::from_str(&json_str).ok()
}

pub struct TauriReplayObserver {
    pub app: AppHandle,
}

impl crate::domain::ports_out::ReplayObserver for TauriReplayObserver {
    fn on_progress(&self, file_id: &str, step: usize, _total: usize) {
        let _ = self.app.emit("automation-progress", serde_json::json!({ "id": file_id, "index": step }));
    }

    fn on_node_progress(&self, file_id: &str, node_id: &str, index: usize) {
        let _ = self.app.emit("automation-progress", serde_json::json!({ "id": file_id, "index": index, "nodeId": node_id }));
    }

    fn on_node_status(&self, file_id: &str, node_id: &str, status: &str) {
        let _ = self.app.emit("automation-node-status", serde_json::json!({ "id": file_id, "nodeId": node_id, "status": status }));
    }

    fn on_node_detail(
        &self,
        file_id: &str,
        node_id: &str,
        status: &str,
        input: Option<&serde_json::Value>,
        output: Option<&serde_json::Value>,
        duration_ms: Option<u64>,
    ) {
        let _ = self.app.emit(
            "automation-node-detail",
            serde_json::json!({
                "id": file_id,
                "nodeId": node_id,
                "status": status,
                "input_data": input,
                "output_data": output,
                "duration_ms": duration_ms
            }),
        );
    }


    fn on_status(&self, file_id: &str, status: &str) {
        if status == "finished" || status == "stopped" {
            let _ = self.app.emit("automation-finished", serde_json::json!({ "id": file_id }));
            if let Some(state) = self.app.try_state::<AppendedFlowState>() {
                if state.0.lock().unwrap().is_some() {
                    let app_clone = self.app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        app_clone.exit(0);
                    });
                }
            }
        }
    }
}

pub fn record_toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyK)
}

pub fn toggle_recording(app: &AppHandle) -> std::result::Result<(), String> {
    let state = app.state::<AppState>();
    if state.recording_use_case.is_recording() {
        let _ = state.recording_use_case.stop_recording();
    } else {
        // Atajo global de grabación: arranca en primer plano (con overlay), que
        // es el comportamiento histórico de la tecla de grabación rápida.
        let _ = state.recording_use_case.start_recording("default", "default", true, None);
    }
    Ok(())
}
