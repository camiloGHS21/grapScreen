use std::ffi::c_void;
use crate::domain::entities::RecordedEvent;
use super::win_types::*;
use super::win_api::*;
use super::win_app_utils::{children_of, process_exe};

unsafe fn unicode_char(vk: u32, sc: u32, mods: &KeyMods) -> u16 {
    let mut keystate = [0u8; 256];
    if mods.shift { keystate[0x10] = 0x80; }
    if mods.ctrl { keystate[0x11] = 0x80; }
    if mods.alt { keystate[0x12] = 0x80; }
    let mut buf = [0u16; 8];
    let n = ToUnicode(vk, sc, keystate.as_ptr(), buf.as_mut_ptr(), buf.len() as i32, 0);
    if n > 0 { buf[0] } else { 0 }
}

fn console_ck(mods: &KeyMods) -> u32 {
    let mut s = 0u32;
    if mods.shift { s |= 0x0001; }
    if mods.ctrl { s |= 0x0002; }
    if mods.alt { s |= 0x0008; }
    s
}

unsafe fn send_console_key(pid: u32, vk: u32, down: bool, mods: &KeyMods) -> bool {
    let candidates = {
        let mut list = vec![pid];
        list.extend(children_of(pid));
        list
    };
    let sc = MapVirtualKeyW(vk, 0) as u16;
    let ch = if down { unicode_char(vk, MapVirtualKeyW(vk, 1), mods) } else { 0 };
    let cks = console_ck(mods);
    for cand in candidates {
        FreeConsole();
        if AttachConsole(cand) == 0 { continue; }
        let h = GetStdHandle(STD_INPUT_HANDLE);
        if h.0.is_null() || (h.0 as isize) == -1 {
            FreeConsole();
            continue;
        }
        let rec = INPUT_RECORD {
            EventType: KEY_EVENT,
            _pad: 0,
            key: KEY_EVENT_RECORD {
                bKeyDown: if down { 1 } else { 0 },
                wRepeatCount: 1,
                wVirtualKeyCode: vk as u16,
                wVirtualScanCode: sc,
                uChar: ch,
                dwControlKeyState: cks,
            },
        };
        let mut written: u32 = 0;
        let ok = WriteConsoleInputW(h, &rec, 1, &mut written);
        FreeConsole();
        if ok != 0 { return true; }
    }
    false
}

pub unsafe fn simulate_real(ev: &RecordedEvent, origin: (i32, i32), last_mouse: (i32, i32)) -> bool {
    let (x, y) = if ev.kind == "mouse_move" {
        let ex = ev.data["x"].as_f64().unwrap_or(0.0) as i32;
        let ey = ev.data["y"].as_f64().unwrap_or(0.0) as i32;
        (ex, ey)
    } else {
        last_mouse
    };
    let cx = x - origin.0;
    let cy = y - origin.1;
    let scr_w = GetSystemMetrics(SM_CXSCREEN).max(1) as f64;
    let scr_h = GetSystemMetrics(SM_CYSCREEN).max(1) as f64;
    let abs_x = ((cx as f64 / scr_w) * 65535.0).clamp(0.0, 65535.0) as i32;
    let abs_y = ((cy as f64 / scr_h) * 65535.0).clamp(0.0, 65535.0) as i32;

    let mut inputs: Vec<INPUT> = Vec::new();
    let mut push_mouse = |flags: u32, data: u32| {
        inputs.push(INPUT {
            type_: INPUT_MOUSE,
            u: INPUT_UNION {
                mi: MOUSEINPUT {
                    dx: abs_x,
                    dy: abs_y,
                    mouse_data: data,
                    flags: flags | MOUSEEVENTF_ABSOLUTE,
                    time: 0,
                    extra_info: 0,
                },
            },
        });
    };
    match ev.kind.as_str() {
        "mouse_move" => push_mouse(MOUSEEVENTF_MOVE, 0),
        "button_press" => {
            let btn = ev.data["button"].as_str().unwrap_or("Left");
            if btn == "Right" { push_mouse(MOUSEEVENTF_RIGHTDOWN, 0); }
            else { push_mouse(MOUSEEVENTF_LEFTDOWN, 0); }
        }
        "button_release" => {
            let btn = ev.data["button"].as_str().unwrap_or("Left");
            if btn == "Right" { push_mouse(MOUSEEVENTF_RIGHTUP, 0); }
            else { push_mouse(MOUSEEVENTF_LEFTUP, 0); }
        }
        "wheel" => {
            let dy = ev.data["y"].as_i64().unwrap_or(0);
            let delta = (-(dy as i32) * 120).clamp(i16::MIN as i32, i16::MAX as i32) as u32;
            push_mouse(MOUSEEVENTF_WHEEL, delta);
        }
        "key_press" | "key_release" => {
            if let Some(vk) = key_to_vk(ev.data["key"].as_str().unwrap_or("")) {
                let down = ev.kind == "key_press";
                let mut flags = if down { 0 } else { KEYEVENTF_KEYUP };
                if vk >= 0x21 && vk <= 0x2E { flags |= KEYEVENTF_EXTENDEDKEY; }
                inputs.push(INPUT {
                    type_: INPUT_KEYBOARD,
                    u: INPUT_UNION {
                        ki: KEYBDINPUT {
                            w_vk: vk as u16,
                            w_scan: MapVirtualKeyW(vk, 0) as u16,
                            flags,
                            time: 0,
                            extra_info: 0,
                        },
                    },
                });
            } else {
                return false;
            }
        }
        _ => return false,
    }
    if inputs.is_empty() { return false; }
    SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    true
}

unsafe fn click_offscreen(hwnd: HWND, kind: &str, cx: i32, cy: i32, data: &serde_json::Value) {
    let mut orig = POINT { x: 0, y: 0 };
    GetCursorPos(&mut orig);
    let tx = 10000 + cx;
    let ty = 10000 + cy;
    SetCursorPos(tx, ty);

    let mut inputs = Vec::new();
    let mut push_mouse = |flags: u32, mouse_data: u32| {
        let scr_w = GetSystemMetrics(SM_CXSCREEN).max(1) as f64;
        let scr_h = GetSystemMetrics(SM_CYSCREEN).max(1) as f64;
        let abs_x = ((tx as f64 / scr_w) * 65535.0).clamp(0.0, 65535.0) as i32;
        let abs_y = ((ty as f64 / scr_h) * 65535.0).clamp(0.0, 65535.0) as i32;
        inputs.push(INPUT {
            type_: INPUT_MOUSE,
            u: INPUT_UNION {
                mi: MOUSEINPUT {
                    dx: abs_x,
                    dy: abs_y,
                    mouse_data,
                    flags: flags | MOUSEEVENTF_ABSOLUTE,
                    time: 0,
                    extra_info: 0,
                },
            },
        });
    };

    match kind {
        "mouse_move" => push_mouse(MOUSEEVENTF_MOVE, 0),
        "button_press" => {
            let btn = data["button"].as_str().unwrap_or("Left");
            SendMessageW(hwnd, WM_NCACTIVATE, 1, 0);
            SendMessageW(hwnd, WM_ACTIVATE, 1, 0);
            if btn == "Right" { push_mouse(MOUSEEVENTF_RIGHTDOWN, 0); }
            else { push_mouse(MOUSEEVENTF_LEFTDOWN, 0); }
        }
        "button_release" => {
            let btn = data["button"].as_str().unwrap_or("Left");
            if btn == "Right" { push_mouse(MOUSEEVENTF_RIGHTUP, 0); }
            else { push_mouse(MOUSEEVENTF_LEFTUP, 0); }
        }
        "wheel" => {
            let dy = data["y"].as_i64().unwrap_or(0);
            let delta = (-(dy as i32) * 120).clamp(i16::MIN as i32, i16::MAX as i32) as u32;
            push_mouse(MOUSEEVENTF_WHEEL, delta);
        }
        _ => {}
    }

    if !inputs.is_empty() {
        SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    }
    SetCursorPos(orig.x, orig.y);
}

unsafe fn find_leaf_child_window(hwnd: HWND, pt: POINT, depth: usize) -> (HWND, POINT) {
    if depth >= 10 { return (hwnd, pt); }
    let child = ChildWindowFromPoint(hwnd, pt);
    if !child.is_null() && child.0 != hwnd.0 {
        let mut child_pt = pt;
        ClientToScreen(hwnd, &mut child_pt);
        ScreenToClient(child, &mut child_pt);
        find_leaf_child_window(child, child_pt, depth + 1)
    } else {
        (hwnd, pt)
    }
}

pub unsafe fn post_event(hwnd: HWND, ev: &RecordedEvent, origin: (i32, i32), mods: &mut KeyMods) {
    let screen_x = ev.data["x"].as_f64().unwrap_or(0.0) as i32;
    let screen_y = ev.data["y"].as_f64().unwrap_or(0.0) as i32;
    let cx = screen_x - origin.0;
    let cy = screen_y - origin.1;

    let mut target_hwnd = hwnd;

    if ev.kind == "mouse_move" || ev.kind == "button_press" || ev.kind == "button_release" || ev.kind == "wheel" {
        let (leaf_hwnd, leaf_pt) = find_leaf_child_window(hwnd, POINT { x: cx, y: cy }, 0);
        target_hwnd = leaf_hwnd;
        mods.last_hwnd = leaf_hwnd;
        click_offscreen(hwnd, ev.kind.as_str(), cx, cy, &ev.data);
        return;
    } else if !mods.last_hwnd.is_null() {
        target_hwnd = mods.last_hwnd;
    }

    match ev.kind.as_str() {
        "key_press" => {
            let key = ev.data["key"].as_str().unwrap_or("");
            match key {
                "ShiftLeft" | "ShiftRight" => mods.shift = true,
                "ControlLeft" | "ControlRight" => mods.ctrl = true,
                "Alt" | "AltGr" => mods.alt = true,
                _ => {}
            }
            SendMessageW(hwnd, WM_NCACTIVATE, 1, 0);
            SendMessageW(hwnd, WM_ACTIVATE, 1, 0);
            SendMessageW(target_hwnd, WM_SETFOCUS, 0, 0);
            if let Some(vk) = key_to_vk(key) {
                let sc = MapVirtualKeyW(vk, 1);
                let mut pid = 0u32;
                GetWindowThreadProcessId(target_hwnd, &mut pid);
                if pid != 0 {
                    let mut class_buf = [0u16; 256];
                    let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 256);
                    let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
                    if class_name == "ConsoleWindowClass" {
                        send_console_key(pid, vk, true, mods);
                    }
                }
                let ch = unicode_char(vk, sc, mods);
                if ch != 0 {
                    PostMessageW(target_hwnd, WM_CHAR, ch as usize, 1);
                } else {
                    let lparam_down = ((sc as isize) << 16) as LPARAM;
                    PostMessageW(target_hwnd, WM_KEYDOWN, vk as usize, lparam_down);
                }
            }
        }
        "key_release" => {
            let key = ev.data["key"].as_str().unwrap_or("");
            match key {
                "ShiftLeft" | "ShiftRight" => mods.shift = false,
                "ControlLeft" | "ControlRight" => mods.ctrl = false,
                "Alt" | "AltGr" => mods.alt = false,
                _ => {}
            }
            if let Some(vk) = key_to_vk(key) {
                let sc = MapVirtualKeyW(vk, 1);
                let mut pid = 0u32;
                GetWindowThreadProcessId(target_hwnd, &mut pid);
                if pid != 0 {
                    let mut class_buf = [0u16; 256];
                    let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 256);
                    let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
                    if class_name == "ConsoleWindowClass" {
                        send_console_key(pid, vk, false, mods);
                    }
                }
                let ch = unicode_char(vk, sc, mods);
                if ch == 0 {
                    let lparam_up = (((sc as isize) << 16) | 0xC000_0000) as LPARAM;
                    PostMessageW(target_hwnd, WM_KEYUP, vk as usize, lparam_up);
                }
            }
        }
        _ => {}
    }
}
