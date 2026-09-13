use tauri::Manager;
use super::replay_helpers::{VARIABLES, get_form_tx};

pub fn handle_form_event(fields: &serde_json::Value) -> Option<bool> {
    let Some(app) = crate::get_app_handle() else {
        eprintln!("[Runner] AppHandle not initialized");
        return Some(false);
    };

    let (tx, rx) = std::sync::mpsc::channel();
    {
        let mut guard = get_form_tx().lock().unwrap();
        *guard = Some(tx);
    }

    // Open the form in a dedicated, separate window (not the main app window).
    let data_json = serde_json::to_string(fields).unwrap_or_else(|_| "{}".to_string());
    let init_script = format!(
        "window.__IS_FORM_WINDOW__ = true; window.__FORM_DATA__ = {}; document.documentElement.classList.add('form-window');",
        data_json
    );

    let screen = fields.get("screen");
    let base_w = screen
        .and_then(|s| s.get("width"))
        .and_then(|v| v.as_f64())
        .or_else(|| screen.and_then(|s| s.get("width")).and_then(|v| v.as_u64().map(|n| n as f64)))
        .unwrap_or(420.0);
    let base_h = screen
        .and_then(|s| s.get("height"))
        .and_then(|v| v.as_f64())
        .or_else(|| screen.and_then(|s| s.get("height")).and_then(|v| v.as_u64().map(|n| n as f64)))
        .unwrap_or(560.0);
    let win_w = (base_w + 36.0).max(360.0);
    let win_h = (base_h + 150.0).clamp(360.0, 860.0);

    if let Some(existing) = app.get_webview_window("form-standalone") {
        let _ = existing.destroy();
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "form-standalone",
        tauri::WebviewUrl::App(std::path::PathBuf::from("index.html")),
    )
    .title("Formulario")
    .inner_size(win_w, win_h)
    .min_inner_size(320.0, 320.0)
    .resizable(true)
    .decorations(true)
    .center()
    .initialization_script(init_script)
    .build();

    if let Some(win) = app.get_webview_window("form-standalone") {
        let _ = win.set_focus();
    }

    match rx.recv() {
        Ok((status, values)) => {
            if let Some(win) = app.get_webview_window("form-standalone") {
                let _ = win.destroy();
            }
            if status == "cancelled" {
                if let Some(win) = app.get_webview_window("main") {
                    if app.try_state::<crate::AppendedFlowState>().map(|s| s.0.lock().unwrap().is_some()).unwrap_or(false) {
                        let _ = win.hide();
                    }
                }
                Some(false)
            } else {
                VARIABLES.with(|vars| {
                    let mut vars_borrow = vars.borrow_mut();
                    for (k, v) in &values {
                        vars_borrow.insert(k.clone(), v.clone());
                    }
                    eprintln!("[FormHelper] Variables guardadas: {:?}", vars_borrow);
                });
                if let Some(win) = app.get_webview_window("main") {
                    if app.try_state::<crate::AppendedFlowState>().map(|s| s.0.lock().unwrap().is_some()).unwrap_or(false) {
                        let _ = win.hide();
                    }
                }
                Some(true)
            }
        }
        Err(_) => {
            if let Some(win) = app.get_webview_window("form-standalone") {
                let _ = win.destroy();
            }
            Some(false)
        }
    }
}
