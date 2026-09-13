pub use crate::domain::entities::TargetApp;

#[cfg(target_os = "windows")]
mod win_types;
#[cfg(target_os = "windows")]
mod win_api;
#[cfg(target_os = "windows")]
mod win_app_utils;
#[cfg(target_os = "windows")]
mod win_window_search;
#[cfg(target_os = "windows")]
mod win_window_control;
#[cfg(target_os = "windows")]
mod win_event_sim;
#[cfg(target_os = "windows")]
mod win_preview;
#[cfg(target_os = "windows")]
mod win_runner;

#[cfg(target_os = "windows")]
pub use win_app_utils::{capture_active_app, app_friendly_name};
#[cfg(target_os = "windows")]
pub use win_window_search::{find_target_hwnd, focus_target_window, open_target_app, find_window_on_desktop};
#[cfg(target_os = "windows")]
pub use win_window_control::{get_window_rect_coords, move_window_to};
#[cfg(target_os = "windows")]
pub use win_event_sim::post_event;
#[cfg(target_os = "windows")]
pub use win_preview::{capture_target_preview, capture_window_png};
#[cfg(target_os = "windows")]
pub use win_runner::{execute_isolated, register_isolated, stop_all_isolated};

// --- Linux native implementations via xdotool ---
#[cfg(target_os = "linux")]
mod linux_window_ops;
#[cfg(target_os = "linux")]
pub use linux_window_ops::{
    capture_active_app, find_target_hwnd, focus_target_window,
    open_target_app, find_window_on_desktop, get_window_rect_coords,
    move_window_to, capture_target_preview, capture_window_png,
};

// --- macOS native implementations via osascript ---
#[cfg(target_os = "macos")]
mod mac_window_ops;
#[cfg(target_os = "macos")]
pub use mac_window_ops::{
    capture_active_app, app_friendly_name, find_target_hwnd,
    focus_target_window, open_target_app, find_window_on_desktop,
    get_window_rect_coords, move_window_to, capture_target_preview,
    capture_window_png,
};

// Shared stubs for functions that only make sense on Windows
// (isolated desktop execution)
#[cfg(not(target_os = "windows"))]
mod stubs;
#[cfg(not(target_os = "windows"))]
pub use stubs::{
    register_isolated, stop_all_isolated, execute_isolated,
    post_event, KeyMods,
};

// Linux doesn't have app_friendly_name in its module — provide a default
#[cfg(target_os = "linux")]
pub fn app_friendly_name(exe: &str, title: &str, _class: &str) -> String {
    let stem = std::path::Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if !stem.is_empty() {
        let mut chars = stem.chars();
        let first = chars.next()
            .map(|f| f.to_uppercase().collect::<String>())
            .unwrap_or_default();
        let rest: String = chars.collect();
        format!("{}{}", first, rest)
    } else if !title.is_empty() {
        title.to_string()
    } else {
        exe.to_string()
    }
}

pub mod runner_helpers;
