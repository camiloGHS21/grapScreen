#[cfg(target_os = "windows")]
pub mod uia_helpers;
#[cfg(target_os = "windows")]
pub mod uia_backend;
#[cfg(target_os = "windows")]
pub mod win32_msg_backend;
#[cfg(target_os = "windows")]
pub mod accessibility_backend;

#[cfg(target_os = "macos")]
pub mod mac_event_backend;
#[cfg(target_os = "macos")]
pub mod mac_accessibility_backend;

#[cfg(target_os = "linux")]
pub mod linux_event_backend;

pub mod input_sim_backend;
