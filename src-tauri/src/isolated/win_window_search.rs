use std::time::{Instant, Duration};
use std::thread;
use windows::core::HSTRING;

use super::win_types::*;
use super::win_api::*;
use super::win_app_utils::process_exe;
use crate::domain::entities::TargetApp;

struct SearchCtx {
    class: String,
    title: String,
    pid: u32,
    found: HWND,
}

unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam as *mut SearchCtx);
    let mut buf = [0u16; 256];
    let n = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    let cls = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
    let mut tbuf = [0u16; 256];
    let tn = GetWindowTextW(hwnd, tbuf.as_mut_ptr(), tbuf.len() as i32);
    let ttl = String::from_utf16_lossy(&tbuf[..tn.max(0) as usize]);
    
    let mut w_pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut w_pid);

    let match_pid = ctx.pid == 0 || w_pid == ctx.pid;
    let match_title = ctx.title.is_empty() || ttl.contains(&ctx.title);

    if !cls.is_empty() && cls == ctx.class && match_pid && match_title {
        ctx.found = hwnd;
        0
    } else {
        1
    }
}

pub fn find_window_on_desktop(desktop: &str, class: &str, title: &str, pid: u32) -> Option<HWND> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<HWND>>();
    let desktop = desktop.to_string();
    let class = class.to_string();
    let title = title.to_string();
    thread::spawn(move || {
        let s = HSTRING::from(&desktop);
        let desk = unsafe { OpenDesktopW(s.as_ptr(), 0, 0, GENERIC_ALL) };
        if desk.is_null() {
            let _ = tx.send(None);
            return;
        }
        unsafe { let _ = SetThreadDesktop(desk); }
        let mut ctx = SearchCtx { class, title, pid, found: WinHandle(std::ptr::null_mut()) };
        unsafe { EnumDesktopWindows(desk, Some(enum_callback), &mut ctx as *mut _ as LPARAM); }
        let _ = tx.send(Some(ctx.found).filter(|h| !h.is_null()));
        unsafe { CloseDesktop(desk); }
    });
    rx.recv_timeout(Duration::from_secs(3)).ok().flatten()
}

struct FindCtx<'a> {
    target: &'a TargetApp,
    found: Option<HWND>,
    best_score: i32,
}

unsafe extern "system" fn enum_find(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam as *mut FindCtx);
    if IsWindowVisible(hwnd) == 0 { return 1; }
    let mut buf = [0u16; 256];
    let n = GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
    if n == 0 { return 1; }
    let class = String::from_utf16_lossy(&buf[..n as usize]);
    
    let mut tbuf = [0u16; 512];
    let tn = GetWindowTextW(hwnd, tbuf.as_mut_ptr(), 512);
    let title = String::from_utf16_lossy(&tbuf[..tn.max(0) as usize]);

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 { return 1; }
    if let Some(exe) = process_exe(pid) {
        let name_l = std::path::Path::new(&exe).file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
        let tname = std::path::Path::new(&ctx.target.exe).file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
        
        if !name_l.is_empty() && name_l == tname {
            let mut score = 1;
            if class == ctx.target.class {
                score += 2;
            }
            if !ctx.target.title.is_empty() {
                if title == ctx.target.title {
                    score += 4;
                } else if title.contains(&ctx.target.title) || ctx.target.title.contains(&title) {
                    score += 2;
                }
            }
            if score > ctx.best_score {
                ctx.best_score = score;
                ctx.found = Some(hwnd);
            }
        }
    }
    1
}

pub fn find_existing_window(target: &TargetApp) -> Option<HWND> {
    let mut ctx = FindCtx { target, found: None, best_score: 0 };
    unsafe { EnumWindows(Some(enum_find), &mut ctx as *mut _ as LPARAM); }
    ctx.found
}

pub fn find_target_hwnd(target: &TargetApp) -> Option<isize> {
    find_existing_window(target).map(|h| h.0 as isize)
}

pub fn open_target_app(exe: &str) -> bool {
    unsafe {
        let mut si: STARTUPINFOW = std::mem::zeroed();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        si.dw_flags = 0x00000001; // STARTF_USESHOWWINDOW
        si.w_show_window = 4; // SW_SHOWNOACTIVATE
        
        let app: Vec<u16> = exe.encode_utf16().chain(std::iter::once(0)).collect();
        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let ok = CreateProcessW(
            app.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            CREATE_NEW_CONSOLE,
            std::ptr::null(),
            std::ptr::null(),
            &si,
            &mut pi,
        );
        if ok == 0 {
            eprintln!("[grapScreen] open_target_app: CreateProcess failed for {}", exe);
            return false;
        }
        CloseHandle(pi.h_thread);
        CloseHandle(pi.h_process);
        true
    }
}

pub fn focus_target_window(target: &TargetApp) -> bool {
    let hwnd = if let Some(h) = find_existing_window(target) {
        h
    } else {
        if !open_target_app(&target.exe) { return false; }
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut found = None;
        while Instant::now() < deadline {
            if let Some(h) = find_existing_window(target) { found = Some(h); break; }
            thread::sleep(Duration::from_millis(400));
        }
        match found {
            Some(h) => h,
            None => return false,
        }
    };
    unsafe {
        let _ = AllowSetForegroundWindow(0xFFFF_FFFF);
        let mut wp: WINDOWPLACEMENT = std::mem::zeroed();
        wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
        let mut should_maximize = false;
        
        if GetWindowPlacement(hwnd, &mut wp) != 0 {
            should_maximize = wp.show_cmd == 3 || (wp.flags & 2) != 0;
        } else {
            should_maximize = IsZoomed(hwnd) != 0;
        }

        if IsIconic(hwnd) != 0 {
            if should_maximize {
                ShowWindowAsync(hwnd, 3);
            } else {
                ShowWindowAsync(hwnd, 9);
            }
        } else if should_maximize {
            ShowWindowAsync(hwnd, 3);
        } else {
            ShowWindowAsync(hwnd, 9);
        }
        SetForegroundWindow(hwnd);
    }
    true
}
