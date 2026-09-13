#![cfg(target_os = "linux")]

use crate::domain::entities::TargetApp;
use std::process::Command;

/// Parse key=value pairs from xdotool output.
fn cmd_output(args: &[&str]) -> Option<String> {
    Command::new(args[0])
        .args(&args[1..])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

/// Get the executable path from a PID via /proc.
fn exe_from_pid(pid: u32) -> String {
    std::fs::read_link(format!("/proc/{}/exe", pid))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Get window title from xdotool.
fn window_name(wid: &str) -> String {
    cmd_output(&["xdotool", "getwindowname", wid]).unwrap_or_default()
}

/// Get PID from a window ID.
fn window_pid(wid: &str) -> u32 {
    cmd_output(&["xdotool", "getwindowpid", wid])
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

pub fn capture_active_app() -> Option<TargetApp> {
    let wid = cmd_output(&["xdotool", "getactivewindow"])?;
    let pid = window_pid(&wid);
    if pid == 0 { return None; }
    let exe = exe_from_pid(pid);
    let title = window_name(&wid);
    let rect = get_window_rect_by_wid(&wid);

    Some(TargetApp {
        name: app_friendly_name(&exe, &title),
        exe,
        title,
        class: String::new(),
        pid,
        rect,
    })
}

fn app_friendly_name(exe: &str, title: &str) -> String {
    let stem = std::path::Path::new(exe)
        .file_name()
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

pub fn find_target_hwnd(target: &TargetApp) -> Option<isize> {
    // Search by window name
    let search_term = if !target.title.is_empty() {
        &target.title
    } else {
        let stem = std::path::Path::new(&target.exe)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        if stem.is_empty() { return None; }
        // Use a leaked string to return a &str — acceptable for this use
        return find_by_name(&stem);
    };
    find_by_name(search_term)
}

fn find_by_name(name: &str) -> Option<isize> {
    let out = cmd_output(&["xdotool", "search", "--name", name])?;
    out.lines()
        .next()
        .and_then(|line| line.trim().parse::<isize>().ok())
}

pub fn focus_target_window(target: &TargetApp) -> bool {
    if let Some(wid) = find_target_hwnd(target) {
        cmd_output(&["xdotool", "windowactivate", "--sync", &wid.to_string()])
            .is_some()
    } else {
        // Try to open the app then focus
        if !open_target_app(&target.exe) { return false; }
        std::thread::sleep(std::time::Duration::from_secs(2));
        find_target_hwnd(target)
            .and_then(|wid| {
                cmd_output(&["xdotool", "windowactivate", "--sync", &wid.to_string()])
            })
            .is_some()
    }
}

pub fn open_target_app(exe: &str) -> bool {
    Command::new(exe)
        .spawn()
        .is_ok()
}

fn get_window_rect_by_wid(wid: &str) -> (i32, i32, i32, i32) {
    // xdotool getwindowgeometry returns: "Window <id>\n  Position: X,Y\n  Geometry: WxH"
    let out = cmd_output(&["xdotool", "getwindowgeometry", "--shell", wid])
        .unwrap_or_default();
    let mut x = 0i32;
    let mut y = 0i32;
    let mut w = 0i32;
    let mut h = 0i32;
    for line in out.lines() {
        if let Some(val) = line.strip_prefix("X=") {
            x = val.parse().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("Y=") {
            y = val.parse().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("WIDTH=") {
            w = val.parse().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("HEIGHT=") {
            h = val.parse().unwrap_or(0);
        }
    }
    (x, y, x + w, y + h)
}

pub fn get_window_rect_coords(hwnd_val: isize) -> Option<(i32, i32, i32, i32)> {
    let wid = hwnd_val.to_string();
    let rect = get_window_rect_by_wid(&wid);
    if rect.2 == 0 && rect.3 == 0 { return None; }
    Some(rect)
}

pub fn move_window_to(hwnd_val: isize, x: i32, y: i32, width: i32, height: i32) -> bool {
    let wid = hwnd_val.to_string();
    let moved = cmd_output(&[
        "xdotool", "windowmove", &wid, &x.to_string(), &y.to_string(),
    ]).is_some();
    let resized = cmd_output(&[
        "xdotool", "windowsize", &wid, &width.to_string(), &height.to_string(),
    ]).is_some();
    moved && resized
}

pub fn capture_target_preview(target: &TargetApp) -> Option<Vec<u8>> {
    let wid = find_target_hwnd(target)?;
    capture_window_png(wid)
}

pub fn capture_window_png(hwnd_val: isize) -> Option<Vec<u8>> {
    // Use import (ImageMagick) to capture a specific window
    let tmp = std::env::temp_dir().join(format!("grapscreen_cap_{}.png", hwnd_val));
    let wid = format!("0x{:x}", hwnd_val as u64);
    let ok = Command::new("import")
        .args(["-window", &wid, tmp.to_str()?])
        .output()
        .ok()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !ok {
        // Fallback: capture entire screen and crop
        let rect = get_window_rect_coords(hwnd_val)?;
        let w = rect.2 - rect.0;
        let h = rect.3 - rect.1;
        let geom = format!("{}x{}+{}+{}", w, h, rect.0, rect.1);
        let _ = Command::new("import")
            .args(["-window", "root", "-crop", &geom, tmp.to_str()?])
            .output();
    }

    let data = std::fs::read(&tmp).ok();
    let _ = std::fs::remove_file(&tmp);
    data
}

pub fn find_window_on_desktop(
    _desktop: &str, _class: &str, title: &str, pid: u32,
) -> Option<isize> {
    if pid > 0 {
        cmd_output(&["xdotool", "search", "--pid", &pid.to_string()])
            .and_then(|s| s.lines().next().and_then(|l| l.parse().ok()))
    } else if !title.is_empty() {
        find_by_name(title)
    } else {
        None
    }
}
