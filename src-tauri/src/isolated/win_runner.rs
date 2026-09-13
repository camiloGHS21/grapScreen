use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Instant, Duration};
use base64::Engine;
use tauri::{Emitter, Manager};
use serde_json::json;
use windows::core::HSTRING;

use super::win_types::*;
use super::win_api::*;
use super::win_app_utils::bg_log;
use super::win_window_search::{find_window_on_desktop, open_target_app};
use super::win_event_sim::simulate_real;
use super::win_preview::capture_window_png;
use crate::domain::entities::RecordedEvent;
use crate::domain::entities::TargetApp;
use crate::RecorderState;

pub fn teardown(process: Option<HANDLE>, desktop: HDESK) {
    if let Some(h) = process {
        if !h.is_null() {
            unsafe {
                TerminateProcess(h, 0);
                CloseHandle(h);
            }
        }
    }
    if !desktop.is_null() {
        unsafe { CloseDesktop(desktop); }
    }
}

pub fn execute_isolated(
    app: tauri::AppHandle,
    id: String,
    events: Vec<RecordedEvent>,
    target: TargetApp,
    stop: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let has_active_events = events.iter().any(|e| {
            !e.data.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false)
                && e.kind != "layout_metadata"
        });

        if !has_active_events {
            stop.store(false, Ordering::Relaxed);
            let _ = app.emit("automation-finished", json!({ "id": id }));
            return;
        }

        let desk_name = "grapScreen_isolated_desktop";
        let desk_name_w = HSTRING::from(desk_name);
        
        let h_desk = unsafe {
            let h = CreateDesktopW(
                desk_name_w.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                GENERIC_ALL,
                std::ptr::null(),
            );
            if h.is_null() {
                OpenDesktopW(desk_name_w.as_ptr(), 0, 0, GENERIC_ALL)
            } else {
                h
            }
        };

        if h_desk.is_null() {
            eprintln!("[grapScreen] failed to create/open desktop");
            stop.store(false, Ordering::Relaxed);
            let _ = app.emit("automation-finished", json!({ "id": id }));
            return;
        }

        let mut workspace_path = std::env::current_dir().unwrap_or_default();
        if workspace_path.ends_with("src-tauri") {
            workspace_path.pop();
        }
        let workspace_str = workspace_path.to_string_lossy().to_string();

        let mut args = format!("\"{}\"", workspace_str);
        let target_exe_lower = target.exe.to_lowercase();
        if target_exe_lower.contains("grapscreen") || target_exe_lower.contains("antigravity") || target_exe_lower.contains("code") {
            args.push_str(" --user-data-dir=\"C:\\Users\\Administrator\\.gemini\\antigravity-ide\\isolated_profile\"");
        }

        bg_log(&format!("bg: launching {} with args {} on isolated desktop", target.exe, args));
        

        let (h_process, launched_pid) = match launch_on_desktop_args(&target.exe, &args, desk_name) {
            Some(res) => res,
            None => {
                eprintln!("[grapScreen] failed to launch target on isolated desktop");
                unsafe { CloseDesktop(h_desk); }
                stop.store(false, Ordering::Relaxed);
                let _ = app.emit("automation-finished", json!({ "id": id }));
                return;
            }
        };

        let deadline = Instant::now() + Duration::from_secs(15);
        let mut hwnd = None;
        while Instant::now() < deadline {
            if !stop.load(Ordering::Relaxed) { break; }
            if let Some(h) = find_window_on_desktop(desk_name, &target.class, "", launched_pid) {
                hwnd = Some(h);
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }

        let hwnd = match hwnd {
            Some(h) => h,
            None => {
                eprintln!("[grapScreen] target window never appeared on isolated desktop");
                unsafe {
                    TerminateProcess(h_process, 0);
                    CloseHandle(h_process);
                    CloseDesktop(h_desk);
                }
                stop.store(false, Ordering::Relaxed);
                let _ = app.emit("automation-finished", json!({ "id": id }));
                return;
            }
        };

        unsafe {
            SetWindowPos(
                hwnd,
                WinHandle(std::ptr::null_mut()),
                0,
                0,
                target.rect.2 - target.rect.0,
                target.rect.3 - target.rect.1,
                SWP_NOZORDER | SWP_SHOWWINDOW,
            );
        }

        let id_prev = id.clone();
        let app_prev = app.clone();
        let stop_prev = stop.clone();
        let preview_hwnd = hwnd;
        let preview_desk = h_desk.clone();
        thread::spawn(move || {
            unsafe { SetThreadDesktop(preview_desk); }
            while stop_prev.load(Ordering::Relaxed) {
                let png = unsafe { capture_window_png(preview_hwnd) };
                if let Some(bytes) = png {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let _ = app_prev.emit("automation-preview", json!({ "id": id_prev, "data": b64 }));
                }
                thread::sleep(Duration::from_millis(120));
            }
        });

        let total = events.len();
        let mut previous: u64 = 0;
        let mut last_emit = Instant::now();
        
        let replay_desk = h_desk.clone();
        let replay_target = target.clone();
        let replay_app = app.clone();
        let replay_stop = stop.clone();
        let replay_id = id.clone();

        let replay_handle = thread::spawn(move || {
            unsafe { SetThreadDesktop(replay_desk); }
            let mut last_x = 0;
            let mut last_y = 0;
            for (i, event) in events.into_iter().enumerate() {
                if !replay_stop.load(Ordering::Relaxed) { break; }
                
                if event.kind == "layout_metadata" {
                    continue;
                }
                
                if event.data.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false) {
                    previous = event.at_ms;
                    continue;
                }
                
                let delay = event.at_ms.saturating_sub(previous).min(5000);
                if delay > 0 { thread::sleep(Duration::from_millis(delay)); }
                if !replay_stop.load(Ordering::Relaxed) { break; }

                if event.kind == "mouse_move" {
                    last_x = event.data["x"].as_f64().unwrap_or(0.0) as i32;
                    last_y = event.data["y"].as_f64().unwrap_or(0.0) as i32;
                }
                
                unsafe { simulate_real(&event, (replay_target.rect.0, replay_target.rect.1), (last_x, last_y)); }
                
                bg_log(&format!("bg: replay[{}] {} x={} y={}", i, event.kind, 
                    if event.kind == "mouse_move" { event.data.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0) as i32 } else { last_x },
                    if event.kind == "mouse_move" { event.data.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0) as i32 } else { last_y }
                ));
                previous = event.at_ms;
                if i + 1 == total || last_emit.elapsed() >= Duration::from_millis(70) {
                    last_emit = Instant::now();
                    let _ = replay_app.emit("automation-progress", json!({ "id": replay_id, "index": i }));
                }
            }
        });

        let _ = replay_handle.join();

        bg_log("bg: replay finished, stopping preview thread");
        stop.store(false, Ordering::Relaxed);
        
        thread::sleep(Duration::from_millis(200));

        bg_log("bg: terminating target process and closing desktop");
        unsafe {
            TerminateProcess(h_process, 0);
            WaitForSingleObject(h_process, 1000);
            CloseHandle(h_process);
            CloseDesktop(h_desk);
        }

        remove_isolated(&app, &id);
        let _ = app.emit("automation-finished", json!({ "id": id }));
    });
}

fn remove_isolated(app: &tauri::AppHandle, id: &str) {
    if let Ok(mut map) = app.state::<RecorderState>().isolated_runs.lock() {
        map.remove(id);
    }
}

pub fn register_isolated(state: &RecorderState, id: &str, stop: Arc<AtomicBool>) {
    if let Ok(mut map) = state.isolated_runs.lock() {
        map.insert(id.to_string(), stop);
    }
}

pub fn stop_all_isolated(state: &RecorderState) {
    if let Ok(map) = state.isolated_runs.lock() {
        for flag in map.values() {
            flag.store(false, Ordering::Relaxed);
        }
    }
}

pub fn launch_on_desktop_args(exe: &str, args: &str, desktop: &str) -> Option<(HANDLE, u32)> {
    unsafe {
        let mut si: STARTUPINFOW = std::mem::zeroed();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let desk = HSTRING::from(desktop);
        si.lp_desktop = desk.as_ptr() as *mut u16;

        let full_cmd = format!("\"{}\" {}", exe, args);
        let mut cmd: Vec<u16> = HSTRING::from(&full_cmd).as_wide().to_vec();
        cmd.push(0);
        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let ok = CreateProcessW(
            std::ptr::null(),
            cmd.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            CREATE_NEW_CONSOLE,
            std::ptr::null(),
            std::ptr::null(),
            &si,
            &mut pi,
        );
        if ok != 0 {
            CloseHandle(pi.h_thread);
            Some((pi.h_process, pi.dw_process_id))
        } else {
            None
        }
    }
}
