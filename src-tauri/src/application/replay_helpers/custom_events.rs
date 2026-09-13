use super::{execute_code_node, execute_http_request, interpolate_variables, simulate_hotkey, evaluate_condition_event, VARIABLES};
use crate::application::ocr_image_helpers::check_image_match;
use crate::domain::ports_out::OcrPort;
use std::time::{Duration, Instant};
use tauri::Emitter;

pub fn handle_custom_event(
    event: &crate::domain::entities::RecordedEvent,
    ocr_port: &dyn OcrPort,
    stop_flag: &std::sync::atomic::AtomicBool,
) -> Option<bool> {
    match event.kind.as_str() {
        "hotkey" => {
            let keys = event.data["keys"].as_str().unwrap_or(event.data["key"].as_str().unwrap_or(""));
            let keys_interp = interpolate_variables(keys);
            let _ = simulate_hotkey(&keys_interp);
            Some(true)
        }
        "open_app" => {
            let exe = event.data["exe"].as_str().unwrap_or("");
            let exe_interp = interpolate_variables(exe);
            if !exe_interp.is_empty() {
                let _ = std::process::Command::new("cmd").args(&["/C", "start", "", &exe_interp]).spawn();
            }
            Some(true)
        }
        "close_app" => {
            let name = event.data["name"].as_str().unwrap_or("");
            let name_interp = interpolate_variables(name);
            if !name_interp.is_empty() {
                let process_name = if name_interp.ends_with(".exe") {
                    name_interp
                } else {
                    format!("{}.exe", name_interp)
                };
                let _ = std::process::Command::new("taskkill").args(&["/F", "/IM", &process_name]).spawn();
            }
            Some(true)
        }
        "set_var" => {
            let var_name = event.data["name"].as_str().unwrap_or("");
            let var_value = event.data["value"].as_str().unwrap_or("");
            let var_name_interp = interpolate_variables(var_name);
            let var_value_interp = interpolate_variables(var_value);
            if !var_name_interp.is_empty() {
                VARIABLES.with(|vars| {
                    vars.borrow_mut().insert(var_name_interp, var_value_interp);
                });
            }
            Some(true)
        }
        "screenshot" => {
            let filename = event.data["filename"].as_str().unwrap_or("captura.png");
            let filename_interp = interpolate_variables(filename);
            let monitor = event.data.get("monitor").and_then(|v| v.as_u64()).map(|n| n as usize);

            let result: crate::domain::entities::Result<()> = (|| {
                let mut path = dirs::data_dir()
                    .ok_or_else(|| crate::domain::entities::DomainError::Other("No data dir".into()))?;
                path = path.join("grapScreen").join("screenshots");
                std::fs::create_dir_all(&path)
                    .map_err(|e| crate::domain::entities::DomainError::Other(e.to_string()))?;
                let path = path.join(&filename_interp);
                crate::infrastructure::screen_capture::capture_screen_to_file(&path, monitor)?;
                Ok(())
            })();

            match result {
                Ok(()) => {
                    println!("[Runner] Screenshot saved: {}", filename_interp);
                }
                Err(e) => {
                    eprintln!("[Runner] Screenshot failed ({}): {}", filename_interp, e);
                    if let Some(app) = crate::get_app_handle() {
                        let _ = app.emit(
                            "capture-error",
                            serde_json::json!({ "file": filename_interp, "error": e.to_string() }),
                        );
                    }
                }
            }
            Some(true)
        }
        "run_cmd" => {
            let command = event.data["command"].as_str().unwrap_or("");
            let args = event.data["args"].as_str().unwrap_or("");
            let command_interp = interpolate_variables(command);
            let args_interp = interpolate_variables(args);
            if !command_interp.is_empty() {
                let mut binding = std::process::Command::new("cmd");
                let mut cmd = binding.arg("/C").arg(&command_interp);
                if !args_interp.is_empty() {
                    for arg in args_interp.split_whitespace() {
                        cmd = cmd.arg(arg);
                    }
                }
                let _ = cmd.spawn();
            }
            Some(true)
        }
        "condition" => {
            let success = evaluate_condition_event(&event.data, ocr_port);
            Some(success)
        }
        "http_request" => Some(execute_http_request(&event.data)),
        "code" => Some(execute_code_node(&event.data)),
        "loop_start" => Some(true),
        "wait_image" => {
            let description = event.data["description"].as_str().unwrap_or("");
            let timeout_secs = event.data["timeout"].as_u64().unwrap_or(10);
            let start_wait = Instant::now();
            loop {
                if !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                if check_image_match(description) {
                    break;
                }
                if start_wait.elapsed().as_secs() >= timeout_secs {
                    break;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            Some(true)
        }
        "telegram" | "whatsapp" | "google_sheets" | "google_docs" | "ai_agent" | "excel_local" => {
            let success = crate::application::replay_integrations::execute_integration(event);
            Some(success)
        }
        "form" => {
            crate::application::form_helper::handle_form_event(&event.data)
        }
        _ => None,
    }
}
