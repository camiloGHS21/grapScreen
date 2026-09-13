use crate::domain::entities::AutomationFile;
use crate::AppState;
use serde_json;
use tauri::{AppHandle, Manager, State, Emitter, WebviewUrl};
use tauri::webview::Color;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    state: State<AppState>,
    recorder_state: State<crate::RecorderState>,
    project_name: String,
    automation_name: String,
    generate_mp4: bool,
) -> std::result::Result<(), String> {
    state.recording_use_case.start_recording(&project_name, &automation_name, generate_mp4, None).map_err(|e| e.to_string())?;

    // Store the project name for later (recording-finished event).
    if let Ok(mut guard) = recorder_state.project_name.lock() {
        *guard = Some(project_name.clone());
    }

    // Recording controls stay visible in every recording session. Playback's
    // background mode must never suppress the timer, pause or stop controls.
    let stop_flag = Arc::new(AtomicBool::new(false));
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let pause_flag = Arc::new(AtomicBool::new(false));
    let paused_flag = Arc::new(AtomicBool::new(false));
    let border_overlay = crate::presentation::overlay_window::RecordOverlay::show(
        stop_flag,
        cancel_flag,
        pause_flag,
        paused_flag,
    );
    if let Ok(mut guard) = recorder_state.overlay.lock() {
        *guard = Some(border_overlay);
    }

    let app_clone = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(100));
        let app_clone2 = app_clone.clone();
        let _ = app_clone.run_on_main_thread(move || {
            open_recording_overlay(&app_clone2);
        });
    });

    // Keep the main editor out of the captured desktop, as before.
    let main_win_clone = app.get_webview_window("main");
    let app_clone3 = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(50));
        if let Some(win) = main_win_clone {
            if let Ok(pos) = win.outer_position() {
                if let Some(rec_state) = app_clone3.try_state::<crate::RecorderState>() {
                    if let Ok(mut guard) = rec_state.main_win_pos.lock() {
                        *guard = Some(tauri::Position::Physical(pos));
                    }
                }
            }
            let _ = win
                .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(-9999.0, -9999.0)));
        }
    });

    // Background task: detect the foreground app so it can be associated with
    // the recording for "isolated" execution.
    let recording_use_case2 = state.recording_use_case.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1500));
        let mut target = None;
        for _ in 0..10 {
            if let Some(t) = crate::isolated::capture_active_app() {
                let exe_l = t.exe.to_lowercase();
                if !exe_l.contains("grapscreen") && !exe_l.contains("tauri") {
                    target = Some(t);
                    break;
                }
            }
            thread::sleep(Duration::from_millis(200));
        }
        if let Some(t) = target {
            let _ = recording_use_case2.update_target_app(t);
        }
    });

    Ok(())
}

fn restore_main_window(app: &AppHandle) {
    let main_win_clone = app.get_webview_window("main");
    let app_clone = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(50));
        if let Some(win) = main_win_clone {
            let mut restored = false;
            if let Some(rec_state) = app_clone.try_state::<crate::RecorderState>() {
                if let Ok(mut guard) = rec_state.main_win_pos.lock() {
                    if let Some(saved_pos) = guard.take() {
                        let _ = win.set_position(saved_pos);
                        restored = true;
                    }
                }
            }
            if !restored {
                let _ = win.center();
            }
            let _ = win.show();
            let _ = win.set_focus();
        }
    });
}

fn stop_recording_internal(app: &AppHandle) -> std::result::Result<Option<AutomationFile>, String> {
    restore_main_window(app);
    destroy_recording_overlay(&app);
    let state = app.state::<AppState>();

    // Clean up the border overlay window
    if let Some(rec_state) = app.try_state::<crate::RecorderState>() {
        if let Ok(mut guard) = rec_state.overlay.lock() {
            if let Some(mut border) = guard.take() {
                border.hide();
            }
        }
    }

    let res = state.recording_use_case.stop_recording().map_err(|e| e.to_string())?;

    // Tell the frontend the recording finished (id + project) so it refreshes
    // the automation list and leaves the "recording" UI state. Without this
    // event the user has to manually reload the page to see the new automation.
    if let Some(file) = &res {
        let project_name = app
            .try_state::<crate::RecorderState>()
            .and_then(|s| s.project_name.lock().ok().and_then(|g| g.clone()));
        let payload = serde_json::json!({
            "id": file.id,
            "project_name": project_name.unwrap_or_default(),
            "video_error": null,
        });
        let _ = app.emit("recording-finished", payload);
        let _ = app.emit("recording-toggled", serde_json::json!({ "active": false }));
    }

    Ok(res)
}

#[tauri::command]
pub fn stop_recording(app: AppHandle) -> std::result::Result<Option<AutomationFile>, String> {
    stop_recording_internal(&app)
}

#[tauri::command]
pub fn cancel_recording(app: AppHandle) -> std::result::Result<(), String> {
    restore_main_window(&app);
    destroy_recording_overlay(&app);
    let state = app.state::<AppState>();

    // Clean up the border overlay window
    if let Some(rec_state) = app.try_state::<crate::RecorderState>() {
        if let Ok(mut guard) = rec_state.overlay.lock() {
            if let Some(mut border) = guard.take() {
                border.hide();
            }
        }
    }

    state.recording_use_case.cancel_recording().map_err(|e| e.to_string())?;
    let _ = app.emit("recording-cancelled", ());
    Ok(())
}

#[tauri::command]
pub fn pause_recording(state: State<AppState>) -> std::result::Result<(), String> {
    state.recording_use_case.pause_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resume_recording(state: State<AppState>) -> std::result::Result<(), String> {
    state.recording_use_case.resume_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_recording(state: State<AppState>) -> bool {
    state.recording_use_case.is_recording()
}


#[tauri::command]
pub fn resize_overlay_window(app: AppHandle, w: f64, h: f64, x: f64, y: f64) -> std::result::Result<(), String> {
    if let Some(win) = app.get_webview_window(REC_OVERLAY_LABEL) {
        let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
    }
    Ok(())
}

const REC_OVERLAY_LABEL: &str = "recording-overlay";

/// Opens the modern control panel as a dedicated, always-on-top, borderless
/// webview window (loaded from the same SPA, detected in App.tsx via
/// `window.__IS_RECORDING_OVERLAY__`). Uses the same global `get_app_handle()`
/// pattern as the working `form-standalone` window so the init script is
/// reliably applied and React mounts the overlay component.
///
/// The window URL includes `?overlay=1` so `index.html` paints the body
/// transparent and the bar appears to float on top of the desktop.
fn open_recording_overlay(_app: &AppHandle) {
    let Some(app) = crate::get_app_handle() else {
        return;
    };
    if let Some(existing) = app.get_webview_window(REC_OVERLAY_LABEL) {
        let _ = existing.destroy();
    }

    let start_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0) as u64;
    // The init script applies the marker flags BEFORE any React code runs, so
    // the `__IS_RECORDING_OVERLAY__` check in App.tsx is reliable on the very
    // first render. We use `var` and wrap in try/catch for robustness.
    let init_script = format!(
        "(function(){{ try{{ window.__IS_RECORDING_OVERLAY__ = true; window.__REC_START__ = {ms}; document.documentElement.classList.add('rec-overlay-html'); document.documentElement.style.background='transparent'; document.body && (document.body.style.background='transparent'); }}catch(e){{ window.__IS_RECORDING_OVERLAY__ = true; window.__REC_START__ = {ms}; }} }})();",
        ms = start_ms
    );

    let monitor = app.primary_monitor().ok().flatten();
    let scale_factor = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let (sw, _sh) = monitor
        .map(|m| {
            let s = m.size();
            (s.width as f64 / scale_factor, s.height as f64 / scale_factor)
        })
        .unwrap_or((1280.0, 720.0));
    let win_w = 140.0;
    let win_h = 64.0;
    let pos_x = ((sw - win_w) / 2.0).max(0.0);

    match tauri::WebviewWindowBuilder::new(
        &app,
        REC_OVERLAY_LABEL,
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("Grabando")
    .decorations(false)
    .always_on_top(true)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(win_w, win_h)
    .position(pos_x, 0.0)
    .initialization_script(init_script)
    .build() {
        Ok(win) => {
            let _ = win.set_always_on_top(true);
            println!("[grapScreen] Recording overlay window built successfully.");
        }
        Err(e) => {
            eprintln!("[grapScreen] Failed to build recording overlay window: {:?}", e);
        }
    }
}

fn destroy_recording_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(REC_OVERLAY_LABEL) {
        let _ = win.destroy();
    }
}
