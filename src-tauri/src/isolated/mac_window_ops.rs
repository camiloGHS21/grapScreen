#![cfg(target_os = "macos")]

use crate::domain::entities::TargetApp;
use std::process::Command;

/// Run osascript with an AppleScript snippet and return stdout.
fn osascript(script: &str) -> Option<String> {
    Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

pub fn capture_active_app() -> Option<TargetApp> {
    let script = r#"
tell application "System Events"
    set fp to first process whose frontmost is true
    set appName to name of fp
    set appPath to POSIX path of (file of fp as text)
    set pid to unix id of fp
    return appName & "||" & appPath & "||" & (pid as text)
end tell
"#;
    let raw = osascript(script)?;
    let parts: Vec<&str> = raw.splitn(3, "||").collect();
    if parts.len() < 3 { return None; }

    let name = parts[0].to_string();
    let exe = parts[1].to_string();
    let pid: u32 = parts[2].parse().unwrap_or(0);

    // Get the title of the frontmost window
    let title_script = format!(
        r#"tell application "{}" to get name of front window"#,
        name
    );
    let title = osascript(&title_script).unwrap_or_default();

    let rect = get_front_window_bounds(&name);

    Some(TargetApp {
        name: name.clone(),
        exe,
        title,
        class: String::new(),
        pid,
        rect,
    })
}

fn get_front_window_bounds(app_name: &str) -> (i32, i32, i32, i32) {
    let script = format!(
        r#"tell application "{}" to get bounds of front window"#,
        app_name
    );
    parse_bounds(&osascript(&script).unwrap_or_default())
}

fn parse_bounds(s: &str) -> (i32, i32, i32, i32) {
    let nums: Vec<i32> = s.split(", ")
        .filter_map(|x| x.trim().parse().ok())
        .collect();
    if nums.len() >= 4 {
        (nums[0], nums[1], nums[2], nums[3])
    } else {
        (0, 0, 0, 0)
    }
}

pub fn find_target_hwnd(target: &TargetApp) -> Option<isize> {
    // On macOS we use PID as the window identifier
    let search = if !target.exe.is_empty() {
        let stem = std::path::Path::new(&target.exe)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        stem
    } else if !target.title.is_empty() {
        target.title.clone()
    } else {
        return None;
    };

    let script = format!(
        r#"tell application "System Events" to get unix id of first process whose name contains "{}""#,
        search
    );
    osascript(&script)
        .and_then(|s| s.parse::<isize>().ok())
}

pub fn focus_target_window(target: &TargetApp) -> bool {
    // Try activating by app name first
    let app_name = if !target.name.is_empty() {
        target.name.clone()
    } else {
        std::path::Path::new(&target.exe)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    if !app_name.is_empty() {
        let script = format!(
            r#"tell application "{}" to activate"#,
            app_name
        );
        if osascript(&script).is_some() {
            return true;
        }
    }

    // Fallback: open the app
    if open_target_app(&target.exe) {
        std::thread::sleep(std::time::Duration::from_secs(2));
        return true;
    }
    false
}

pub fn open_target_app(exe: &str) -> bool {
    // Try `open -a` first (macOS standard)
    let stem = std::path::Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    if !stem.is_empty() {
        if Command::new("open").args(["-a", &stem]).spawn().is_ok() {
            return true;
        }
    }

    // Fallback: direct path
    Command::new("open").arg(exe).spawn().is_ok()
}

pub fn get_window_rect_coords(hwnd_val: isize) -> Option<(i32, i32, i32, i32)> {
    // hwnd_val is PID on macOS
    let script = format!(
        r#"tell application "System Events"
    set p to first process whose unix id is {}
    set appName to name of p
    tell application appName to get bounds of front window
end tell"#,
        hwnd_val
    );
    let raw = osascript(&script)?;
    let rect = parse_bounds(&raw);
    if rect.2 == 0 && rect.3 == 0 { return None; }
    Some(rect)
}

pub fn move_window_to(hwnd_val: isize, x: i32, y: i32, w: i32, h: i32) -> bool {
    let script = format!(
        r#"tell application "System Events"
    set p to first process whose unix id is {}
    set appName to name of p
    tell application appName to set bounds of front window to {{{}, {}, {}, {}}}
end tell"#,
        hwnd_val, x, y, x + w, y + h
    );
    osascript(&script).is_some()
}

pub fn capture_target_preview(target: &TargetApp) -> Option<Vec<u8>> {
    let wid = find_target_hwnd(target)?;
    capture_window_png(wid)
}

pub fn capture_window_png(hwnd_val: isize) -> Option<Vec<u8>> {
    // macOS screencapture can capture a specific window by CGWindowID.
    // We get the CGWindowID from the PID using a CGWindowListCopyWindowInfo call
    // via Python (available on all macOS installations).
    let tmp = std::env::temp_dir()
        .join(format!("grapscreen_cap_{}.png", hwnd_val));

    // Get CGWindowID for the PID
    let script = format!(
        r#"
import Quartz
wl = Quartz.CGWindowListCopyWindowInfo(
    Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
for w in wl:
    if w.get('kCGWindowOwnerPID', 0) == {}:
        print(w.get('kCGWindowNumber', 0))
        break
"#,
        hwnd_val
    );

    let cg_wid = Command::new("python3")
        .args(["-c", &script])
        .output()
        .ok()
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u64>()
                .ok()
        });

    if let Some(wid) = cg_wid {
        let _ = Command::new("screencapture")
            .args(["-l", &wid.to_string(), "-x", tmp.to_str()?])
            .output();
    } else {
        // Fallback: capture entire screen
        let _ = Command::new("screencapture")
            .args(["-x", tmp.to_str()?])
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
        Some(pid as isize)
    } else if !title.is_empty() {
        let script = format!(
            r#"tell application "System Events" to get unix id of first process whose name contains "{}""#,
            title
        );
        osascript(&script).and_then(|s| s.parse().ok())
    } else {
        None
    }
}

pub fn app_friendly_name(exe: &str, title: &str, _class: &str) -> String {
    let stem = std::path::Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if !stem.is_empty() {
        stem
    } else if !title.is_empty() {
        title.to_string()
    } else {
        exe.to_string()
    }
}
