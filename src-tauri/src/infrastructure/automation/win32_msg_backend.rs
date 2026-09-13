#![cfg(target_os = "windows")]

use crate::domain::entities::{ActionRequest, ActionResult, MouseButton, WindowContext};
use crate::domain::ports_out::AutomationBackendPort;
use std::ffi::c_void;
use std::io::Write;

fn w32_log(msg: &str) {
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\Administrator\\Downloads\\grapScreen\\automation.log")
        .and_then(|mut f| writeln!(f, "[Win32Msg] {}", msg));
}

#[repr(transparent)]
#[derive(Clone, Copy)]
struct HWND(*mut c_void);
unsafe impl Send for HWND {}
unsafe impl Sync for HWND {}

type BOOL = i32;
type WPARAM = usize;
type LPARAM = isize;

const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_LBUTTONUP: u32 = 0x0202;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_RBUTTONUP: u32 = 0x0205;
const WM_MOUSEWHEEL: u32 = 0x020A;
const WM_KEYDOWN: u32 = 0x0100;
const WM_KEYUP: u32 = 0x0101;
const WM_CHAR: u32 = 0x0102;
const MK_LBUTTON: u32 = 0x0001;
const MK_RBUTTON: u32 = 0x0002;

#[link(name = "user32")]
extern "system" {
    fn GetForegroundWindow() -> HWND;
    fn SendMessageW(h_wnd: HWND, msg: u32, w_param: WPARAM, l_param: LPARAM) -> LPARAM;
    fn PostMessageW(h_wnd: HWND, msg: u32, w_param: WPARAM, l_param: LPARAM) -> BOOL;
    fn MapVirtualKeyW(u_code: u32, u_map_type: u32) -> u32;
    fn GetWindowRect(h_wnd: HWND, lp_rect: *mut RECT) -> BOOL;
}

#[repr(C)]
#[derive(Clone, Copy)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

fn make_lparam(x: i32, y: i32) -> LPARAM {
    ((y as i32 & 0xFFFF) << 16 | (x as i32 & 0xFFFF)) as LPARAM
}

fn key_to_vk(name: &str) -> Option<u32> {
    Some(match name {
        "KeyA" => 0x41, "KeyB" => 0x42, "KeyC" => 0x43, "KeyD" => 0x44, "KeyE" => 0x45,
        "KeyF" => 0x46, "KeyG" => 0x47, "KeyH" => 0x48, "KeyI" => 0x49, "KeyJ" => 0x4A,
        "KeyK" => 0x4B, "KeyL" => 0x4C, "KeyM" => 0x4D, "KeyN" => 0x4E, "KeyO" => 0x4F,
        "KeyP" => 0x50, "KeyQ" => 0x51, "KeyR" => 0x52, "KeyS" => 0x53, "KeyT" => 0x54,
        "KeyU" => 0x55, "KeyV" => 0x56, "KeyW" => 0x57, "KeyX" => 0x58, "KeyY" => 0x59,
        "KeyZ" => 0x5A,
        "Num0" => 0x30, "Num1" => 0x31, "Num2" => 0x32, "Num3" => 0x33, "Num4" => 0x34,
        "Num5" => 0x35, "Num6" => 0x36, "Num7" => 0x37, "Num8" => 0x38, "Num9" => 0x39,
        "F1" => 0x70, "F2" => 0x71, "F3" => 0x72, "F4" => 0x73, "F5" => 0x74, "F6" => 0x75,
        "F7" => 0x76, "F8" => 0x77, "F9" => 0x78, "F10" => 0x79, "F11" => 0x7A, "F12" => 0x7B,
        "Return" | "Enter" => 0x0D, "Space" => 0x20, "Tab" => 0x09, "Escape" => 0x1B,
        "Backspace" => 0x08, "Delete" => 0x2E, "Insert" => 0x2D, "Home" => 0x24,
        "End" => 0x23, "PageUp" => 0x21, "PageDown" => 0x22, "LeftArrow" => 0x25,
        "UpArrow" => 0x26, "RightArrow" => 0x27, "DownArrow" => 0x28,
        "ShiftLeft" => 0xA0, "ShiftRight" => 0xA1, "ControlLeft" => 0xA2, "ControlRight" => 0xA3,
        "Alt" => 0xA4, "AltGr" => 0xA5, "MetaLeft" => 0x5B, "MetaRight" => 0x5C,
        "CapsLock" => 0x14,
        _ => return None,
    })
}

/// Infrastructure adapter implementing AutomationBackendPort using raw Win32 PostMessage.
pub struct Win32MsgBackend;

impl Win32MsgBackend {
    pub fn new() -> Self {
        Self
    }

    fn resolve_hwnd(&self, window: &Option<WindowContext>) -> Option<HWND> {
        if let Some(ctx) = window {
            if let Some(hwnd_val) = ctx.hwnd {
                if hwnd_val != 0 {
                    return Some(HWND(hwnd_val as *mut c_void));
                }
            }
        }
        if crate::application::replay_service::IS_BACKGROUND.with(|v| v.get()) {
            None
        } else {
            let fg = unsafe { GetForegroundWindow() };
            if !fg.0.is_null() { Some(fg) } else { None }
        }
    }

    fn screen_to_client(&self, hwnd: HWND, screen_x: i32, screen_y: i32) -> (i32, i32) {
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        unsafe { GetWindowRect(hwnd, &mut rect); }
        (screen_x - rect.left, screen_y - rect.top)
    }
}

impl AutomationBackendPort for Win32MsgBackend {
    fn name(&self) -> &str {
        "Win32Msg"
    }

    fn level(&self) -> u8 {
        1
    }

    fn can_handle(&self, action: &ActionRequest) -> bool {
        match action {
            ActionRequest::Click { window, .. } => window.is_some(),
            ActionRequest::ButtonRelease { window, .. } => window.is_some(),
            ActionRequest::KeyPress { window, .. } => window.is_some(),
            ActionRequest::KeyRelease { window, .. } => window.is_some(),
            ActionRequest::Scroll { window, .. } => window.is_some(),
            ActionRequest::TypeText { window, .. } => window.is_some(),
            _ => false,
        }
    }

    fn execute(&self, action: &ActionRequest) -> ActionResult {
        match action {
            ActionRequest::Click { x, y, button, window } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                let (cx, cy) = self.screen_to_client(hwnd, *x, *y);
                let lparam = make_lparam(cx, cy);
                let (msg_down, msg_up, wparam) = match button {
                    MouseButton::Right => (WM_RBUTTONDOWN, WM_RBUTTONUP, MK_RBUTTON as WPARAM),
                    _ => (WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON as WPARAM),
                };
                unsafe {
                    PostMessageW(hwnd, msg_down, wparam, lparam);
                    std::thread::sleep(std::time::Duration::from_millis(30));
                    PostMessageW(hwnd, msg_up, 0, lparam);
                }
                w32_log(&format!("Click at ({},{}) via PostMessage", cx, cy));
                ActionResult::Executed {
                    backend: "Win32Msg/Click".into(),
                    intrusive: false,
                }
            }
            ActionRequest::ButtonRelease { x, y, button, window } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                let (cx, cy) = self.screen_to_client(hwnd, *x, *y);
                let lparam = make_lparam(cx, cy);
                let msg = match button {
                    MouseButton::Right => WM_RBUTTONUP,
                    _ => WM_LBUTTONUP,
                };
                unsafe { PostMessageW(hwnd, msg, 0, lparam); }
                ActionResult::Executed { backend: "Win32Msg/Release".into(), intrusive: false }
            }
            ActionRequest::KeyPress { key, window, .. } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                if let Some(vk) = key_to_vk(key) {
                    let sc = unsafe { MapVirtualKeyW(vk, 0) };
                    let lparam = ((sc as LPARAM) << 16) | 1;
                    unsafe { PostMessageW(hwnd, WM_KEYDOWN, vk as WPARAM, lparam); }
                    w32_log(&format!("KeyPress '{}' (vk=0x{:X}) via PostMessage", key, vk));
                    ActionResult::Executed { backend: "Win32Msg/Key".into(), intrusive: false }
                } else {
                    ActionResult::Unsupported
                }
            }
            ActionRequest::KeyRelease { key, window, .. } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                if let Some(vk) = key_to_vk(key) {
                    let sc = unsafe { MapVirtualKeyW(vk, 0) };
                    let lparam = ((sc as LPARAM) << 16) | 1 | (0xC000_0000u32 as LPARAM);
                    unsafe { PostMessageW(hwnd, WM_KEYUP, vk as WPARAM, lparam); }
                    ActionResult::Executed { backend: "Win32Msg/KeyUp".into(), intrusive: false }
                } else {
                    ActionResult::Unsupported
                }
            }
            ActionRequest::TypeText { text, window } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                for ch in text.encode_utf16() {
                    unsafe { PostMessageW(hwnd, WM_CHAR, ch as WPARAM, 1); }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                w32_log(&format!("TypeText '{}' via WM_CHAR", text));
                ActionResult::Executed { backend: "Win32Msg/Type".into(), intrusive: false }
            }
            ActionRequest::Scroll { x, y, delta_y, window, .. } => {
                let hwnd = match self.resolve_hwnd(window) {
                    Some(h) => h,
                    None => return ActionResult::Unsupported,
                };
                let (cx, cy) = self.screen_to_client(hwnd, *x, *y);
                let delta = (-(*delta_y as i32) * 120).clamp(i16::MIN as i32, i16::MAX as i32);
                let wparam = ((delta as u32 & 0xFFFF) << 16) as WPARAM;
                let lparam = make_lparam(cx, cy);
                unsafe { PostMessageW(hwnd, WM_MOUSEWHEEL, wparam, lparam); }
                ActionResult::Executed { backend: "Win32Msg/Scroll".into(), intrusive: false }
            }
            _ => ActionResult::Unsupported,
        }
    }
}
