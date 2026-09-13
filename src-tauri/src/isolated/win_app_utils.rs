use std::io::Write;
use std::collections::HashMap;

use super::win_types::*;
use super::win_api::*;
use crate::domain::entities::TargetApp;

pub fn bg_log(msg: &str) {
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\Administrator\\Downloads\\grapScreen\\automation.log")
        .and_then(|mut f| writeln!(f, "{}", msg));
}

pub unsafe fn process_exe(pid: u32) -> Option<String> {
    let h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
    if h.is_null() { return None; }
    let mut buf = [0u16; 1024];
    let mut size: u32 = 1024;
    let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
    CloseHandle(h);
    if ok == 0 { return None; }
    Some(String::from_utf16_lossy(&buf[..size as usize]))
}

pub unsafe fn children_of(root: u32) -> Vec<u32> {
    let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap.0 as isize) == INVALID_HANDLE_VALUE {
        return Vec::new();
    }
    let mut parent_of: HashMap<u32, u32> = HashMap::new();
    let mut pe: PROCESSENTRY32 = std::mem::zeroed();
    pe.dw_size = std::mem::size_of::<PROCESSENTRY32>() as u32;
    if Process32FirstW(snap, &mut pe) != 0 {
        loop {
            parent_of.insert(pe.th32_process_id, pe.th32_parent_process_id);
            if Process32NextW(snap, &mut pe) == 0 { break; }
        }
    }
    CloseHandle(snap);
    let mut out: Vec<u32> = Vec::new();
    let mut frontier = vec![root];
    while let Some(p) = frontier.pop() {
        for (child, parent) in parent_of.iter() {
            if *parent == p {
                out.push(*child);
                frontier.push(*child);
            }
        }
    }
    out
}

pub fn app_friendly_name(exe: &str, title: &str, _class: &str) -> String {
    let file = std::path::Path::new(exe)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem = file.replace(".exe", "").replace(".EXE", "");
    let known: &[(&str, &str)] = &[
        ("cmd", "Símbolo del sistema"),
        ("wt", "Windows Terminal"),
        ("windowsterminal", "Windows Terminal"),
        ("powershell", "PowerShell"),
        ("pwsh", "PowerShell"),
        ("explorer", "Explorador de archivos"),
        ("chrome", "Google Chrome"),
        ("msedge", "Microsoft Edge"),
        ("firefox", "Mozilla Firefox"),
        ("code", "Visual Studio Code"),
        ("devenv", "Visual Studio"),
        ("notepad", "Bloc de notas"),
        ("excel", "Microsoft Excel"),
        ("winword", "Microsoft Word"),
        ("outlook", "Microsoft Outlook"),
        ("calculator", "Calculadora"),
        ("spotify", "Spotify"),
        ("discord", "Discord"),
        ("teams", "Microsoft Teams"),
    ];
    let key = stem.to_lowercase();
    for (k, v) in known {
        if *k == key {
            return v.to_string();
        }
    }
    if !stem.is_empty() {
        let mut chars = stem.chars();
        let first = chars
            .next()
            .map(|f| f.to_uppercase().collect::<String>())
            .unwrap_or_default();
        let rest: String = chars.collect();
        return format!("{}{}", first, rest);
    }
    if !title.is_empty() {
        return title.to_string();
    }
    exe.to_string()
}

pub fn capture_active_app() -> Option<TargetApp> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

        let exe = {
            let h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
            if h.is_null() {
                String::new()
            } else {
                let mut buf = [0u16; 1024];
                let mut size: u32 = buf.len() as u32;
                let _ = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
                let s = String::from_utf16_lossy(&buf[..size as usize]);
                CloseHandle(h);
                s
            }
        };

        let mut cbuf = [0u16; 256];
        let cn = GetClassNameW(hwnd, cbuf.as_mut_ptr(), cbuf.len() as i32);
        let class = String::from_utf16_lossy(&cbuf[..cn.max(0) as usize]);

        let mut tbuf = [0u16; 256];
        let tn = GetWindowTextW(hwnd, tbuf.as_mut_ptr(), tbuf.len() as i32);
        let title = String::from_utf16_lossy(&tbuf[..tn.max(0) as usize]);

        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        GetWindowRect(hwnd, &mut rect);

        if exe.is_empty() && class.is_empty() {
            return None;
        }
        Some(TargetApp {
            exe: exe.clone(),
            title: title.clone(),
            class: class.clone(),
            name: app_friendly_name(&exe, &title, &class),
            rect: (rect.left, rect.top, rect.right, rect.bottom),
            pid: 0,
        })
    }
}
