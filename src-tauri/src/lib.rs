pub mod domain;
pub mod application;
pub mod infrastructure;
pub mod presentation;

pub mod isolated;

use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use std::sync::{Arc, Mutex, OnceLock};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::domain::ports_out::StoragePort;
use crate::domain::ports_in::ReplayUseCase;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn get_app_handle() -> Option<AppHandle> {
    APP_HANDLE.get().cloned()
}

pub struct AppState {
    pub recording_use_case: Arc<dyn crate::domain::ports_in::RecordingUseCase>,
    pub replay_use_case: Arc<dyn crate::domain::ports_in::ReplayUseCase>,
    pub storage: Arc<dyn crate::domain::ports_out::StoragePort>,
    pub ocr: Arc<dyn crate::domain::ports_out::OcrPort>,
    pub vision: Arc<dyn crate::domain::ports_out::VisionPort>,
}

pub struct AppendedFlowState(pub Mutex<Option<crate::domain::entities::AutomationFile>>);
pub struct RecorderState {
    pub isolated_runs: Mutex<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
    pub overlay: Mutex<Option<crate::presentation::overlay_window::RecordOverlay>>,
    pub project_name: Mutex<Option<String>>,
    pub main_win_pos: Mutex<Option<tauri::Position>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut = isolated::runner_helpers::record_toggle_shortcut();

    let appended_flow = isolated::runner_helpers::read_appended_flow();
    let is_runner_mode = appended_flow.is_some();

    let args: Vec<String> = std::env::args().collect();
    let is_background_mode = args.iter().any(|a| a == "--background" || a == "--autostart" || a == "-b");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc: &Shortcut, _event| {
                    if *sc == shortcut {
                        let _ = isolated::runner_helpers::toggle_recording(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            
            // If in runner or daemon background mode, hide main window immediately
            if is_runner_mode || is_background_mode {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }

            // Instantiate ports & adapters
            let storage = Arc::new(crate::infrastructure::storage::file_storage::FileStorageAdapter::new());
            let ocr = Arc::new(crate::infrastructure::ocr::win_ocr::WinOcrAdapter::new());
            let vision = Arc::new(crate::infrastructure::vision::template_match::TemplateMatchAdapter::new());
            
            let input_listener = Arc::new(crate::infrastructure::input_listener::rdev_listener::RdevListenerAdapter::new());
            let video_recorder = Arc::new(crate::infrastructure::storage::ffmpeg_recorder::FfmpegVideoRecorderAdapter::new(app.handle().clone()));

            let observer = Arc::new(isolated::runner_helpers::TauriReplayObserver {
                app: app.handle().clone(),
            });

            // Instantiate native backends target-conditionally
            let mut backends: Vec<Box<dyn crate::domain::ports_out::AutomationBackendPort>> = vec![];

            #[cfg(target_os = "windows")]
            {
                backends.push(Box::new(crate::infrastructure::automation::win32_msg_backend::Win32MsgBackend::new()));
                backends.push(Box::new(crate::infrastructure::automation::uia_backend::UiaBackend::new()));
                backends.push(Box::new(crate::infrastructure::automation::accessibility_backend::AccessibilityBackend::new()));
            }

            #[cfg(target_os = "macos")]
            {
                backends.push(Box::new(crate::infrastructure::automation::mac_event_backend::MacEventBackend::new()));
                backends.push(Box::new(crate::infrastructure::automation::mac_accessibility_backend::MacAccessibilityBackend::new()));
            }

            #[cfg(target_os = "linux")]
            {
                backends.push(Box::new(crate::infrastructure::automation::linux_event_backend::LinuxEventBackend::new()));
            }

            backends.push(Box::new(crate::infrastructure::automation::input_sim_backend::InputSimBackend::new()));

            // Instantiate use cases
            let recording_use_case = Arc::new(crate::application::recording_service::RecordingServiceImpl::new(
                storage.clone(),
                input_listener.clone(),
                video_recorder.clone(),
            ));

            let replay_use_case = Arc::new(crate::application::replay_service::ReplayServiceImpl::new(
                storage.clone(),
                backends,
                observer.clone(),
                ocr.clone(),
            ));

            // Register global states
            app.manage(AppState {
                recording_use_case,
                replay_use_case: replay_use_case.clone(),
                storage: storage.clone(),
                ocr,
                vision,
            });

            app.manage(RecorderState {
                isolated_runs: Mutex::new(HashMap::new()),
                overlay: Mutex::new(None),
                project_name: Mutex::new(None),
                main_win_pos: Mutex::new(None),
            });

            app.manage(AppendedFlowState(Mutex::new(appended_flow.clone())));

            // n8n-style trigger daemon: re-arm automations that were active
            // and fire the ones with an "Al iniciar" (startup) trigger.
            if !is_runner_mode {
                crate::application::trigger_service::rearm_and_startup(
                    app.handle().clone(),
                    replay_use_case.clone(),
                    storage.clone(),
                );
            }


            let _ = app.handle().emit("backend-ready", ());

            // Auto-run if in runner mode
            if let Some(flow) = &appended_flow {
                let _ = storage.save_automation("runner_project", flow);
                let replay_use_case_clone = replay_use_case.clone();
                let flow_id = flow.id.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let _ = replay_use_case_clone.execute_replay("runner_project", &flow_id, false);
                });
            }

            // Window window close override (Closing only hides window)
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // Cross-platform System Tray setup (Windows, Linux, macOS)
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;
                let show = MenuItem::with_id(app, "show", "👁️ Mostrar grapScreen", true, None::<&str>)?;
                let hide = MenuItem::with_id(app, "hide", "🙈 Ocultar a la bandeja", true, None::<&str>)?;
                let status = MenuItem::with_id(app, "status", "⚡ Triggers activos en segundo plano", true, None::<&str>)?;
                let rec = MenuItem::with_id(app, "rec", "🔴 Iniciar / Detener grabación", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "❌ Salir completamente", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[
                    &show,
                    &hide,
                    &status,
                    &PredefinedMenuItem::separator(app)?,
                    &rec,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ])?;
                if let Some(icon) = app.default_window_icon() {
                    let _ = TrayIconBuilder::new()
                        .icon(icon.clone())
                        .tooltip("grapScreen — Daemon 24/7 en segundo plano")
                        .show_menu_on_left_click(true)
                        .menu(&menu)
                        .on_menu_event(|app, event| match event.id().as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                    let _ = w.unminimize();
                                }
                            }
                            "hide" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.hide();
                                }
                            }
                            "status" => {
                                let descs = crate::application::trigger_service::active_descriptions();
                                let count = descs.len();
                                eprintln!("[Daemon] {} triggers activos en segundo plano", count);
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.emit("daemon-status", serde_json::json!({
                                        "active_triggers_count": count,
                                        "active_triggers": descs
                                    }));
                                }
                            }
                            "rec" => { let _ = isolated::runner_helpers::toggle_recording(app); }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        })
                        .build(app);
                }
            }

            // Global shortcut registration
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("[grapScreen] failed to register global shortcut: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            presentation::tauri_commands::get_projects,
            presentation::tauri_commands::create_project,
            presentation::tauri_commands::delete_project,
            presentation::tauri_commands::get_automations,
            presentation::tauri_commands::get_automation,
            presentation::tauri_commands::save_automation,
            presentation::tauri_commands::save_automation_target_app,
            presentation::credential_commands::get_credentials,
            presentation::credential_commands::save_credentials,
            presentation::vault_commands::list_vault_credentials,
            presentation::vault_commands::save_vault_credential,
            presentation::vault_commands::delete_vault_credential,
            presentation::vault_commands::get_vault_credential,
            presentation::tauri_commands::create_empty_automation,
            presentation::tauri_commands::rename_automation,
            presentation::tauri_commands::duplicate_automation,
            presentation::tauri_commands::delete_automation,
            presentation::recording_commands::start_recording,
            presentation::recording_commands::stop_recording,
            presentation::recording_commands::cancel_recording,
            presentation::recording_commands::pause_recording,
            presentation::recording_commands::resume_recording,
            presentation::recording_commands::is_recording,
            presentation::execution_commands::execute_automation,
            presentation::recording_commands::resize_overlay_window,
            presentation::execution_commands::execute_automation_isolated,
            presentation::execution_commands::execute_automation_background,
            presentation::execution_commands::stop_execution,
            presentation::execution_commands::execute_automation_until,
            presentation::execution_commands::get_execution_history,
            presentation::execution_commands::clear_execution_history,
            presentation::trigger_commands::start_automation_trigger,
            presentation::trigger_commands::stop_automation_trigger,
            presentation::trigger_commands::get_trigger_status,
            presentation::trigger_commands::list_active_triggers,
            presentation::tauri_vision_commands::ocr_scan_screen,
            presentation::tauri_vision_commands::ocr_find_text,
            presentation::tauri_vision_commands::ocr_recover_step,
            presentation::tauri_vision_commands::save_visual_template,
            presentation::tauri_vision_commands::import_visual_template,
            presentation::tauri_vision_commands::list_visual_templates,
            presentation::tauri_vision_commands::delete_visual_template,
            presentation::tauri_vision_commands::find_visual_template,
            presentation::tauri_commands::get_runner_flow,
            presentation::file_commands::export_automation_exe,
            presentation::tauri_commands::submit_form_response,
            presentation::file_commands::select_save_file,
            presentation::file_commands::pick_folder,
            presentation::file_commands::select_excel_file,
            presentation::file_commands::get_host_os,
            presentation::file_commands::get_system_installed_apps,
            presentation::file_commands::pick_executable_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running grapScreen");
}
