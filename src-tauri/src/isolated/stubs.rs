use crate::domain::entities::RecordedEvent;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

pub fn register_isolated(_state: &crate::RecorderState, _id: &str, _stop: Arc<AtomicBool>) {}

pub fn stop_all_isolated(_state: &crate::RecorderState) {}

pub fn execute_isolated(
    _app: AppHandle,
    _id: String,
    _events: Vec<RecordedEvent>,
    _target: crate::domain::entities::TargetApp,
    _stop: Arc<AtomicBool>,
) {}

/// Stub KeyMods for non-Windows platforms.
#[derive(Default)]
pub struct KeyMods {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
}

/// Stub for post_event — no-op on non-Windows platforms.
/// The InputSimBackend (rdev::simulate) handles cross-platform event replay.
pub unsafe fn post_event(
    _hwnd: isize,
    _ev: &RecordedEvent,
    _origin: (i32, i32),
    _mods: &mut KeyMods,
) {}
