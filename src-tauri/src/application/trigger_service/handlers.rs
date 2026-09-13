use super::state::seed_pending_vars;
use crate::domain::ports_in::ReplayUseCase;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

/// Parses "30s", "5m", "1h", "1d", "@every 5m" or plain seconds into ms.
pub fn parse_interval_ms(raw: &str) -> Option<u64> {
    let s = raw.trim().trim_start_matches("@every").trim().to_lowercase();
    if s.is_empty() {
        return None;
    }
    let (num, mult) = if let Some(n) = s.strip_suffix("ms") {
        (n.trim(), 1u64)
    } else if let Some(n) = s.strip_suffix('s') {
        (n.trim(), 1_000u64)
    } else if let Some(n) = s.strip_suffix('m') {
        (n.trim(), 60_000u64)
    } else if let Some(n) = s.strip_suffix('h') {
        (n.trim(), 3_600_000u64)
    } else if let Some(n) = s.strip_suffix('d') {
        (n.trim(), 86_400_000u64)
    } else {
        (s.as_str(), 1_000u64)
    };
    let value: f64 = num.parse().ok()?;
    if value <= 0.0 {
        return None;
    }
    Some((value * mult as f64) as u64)
}

pub(crate) fn parse_hotkey(raw: &str) -> Option<(HashSet<String>, String)> {
    let mut mods = HashSet::new();
    let mut key = String::new();
    for part in raw.split('+').map(|p| p.trim().to_lowercase()) {
        match part.as_str() {
            "ctrl" | "control" => {
                mods.insert("ctrl".to_string());
            }
            "alt" => {
                mods.insert("alt".to_string());
            }
            "shift" => {
                mods.insert("shift".to_string());
            }
            "win" | "meta" | "super" | "cmd" => {
                mods.insert("meta".to_string());
            }
            "" => {}
            other => key = other.to_uppercase(),
        }
    }
    if key.is_empty() {
        None
    } else {
        Some((mods, key))
    }
}

pub(crate) fn normalize_rdev_key(key: &rdev::Key) -> String {
    use rdev::Key::*;
    match key {
        ControlLeft | ControlRight => "CTRL".into(),
        Alt | AltGr => "ALT".into(),
        ShiftLeft | ShiftRight => "SHIFT".into(),
        MetaLeft | MetaRight => "META".into(),
        Space => "SPACE".into(),
        Return => "ENTER".into(),
        other => format!("{:?}", other).to_uppercase().replace("KEY", ""),
    }
}

pub(crate) fn path_signature(path: &str) -> Option<String> {
    let p = std::path::Path::new(path);
    if p.is_file() {
        let meta = std::fs::metadata(p).ok()?;
        let mtime = meta.modified().ok()?.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs();
        Some(format!("f:{}:{}", meta.len(), mtime))
    } else if p.is_dir() {
        let mut count = 0u64;
        let mut newest = 0u64;
        if let Ok(entries) = std::fs::read_dir(p) {
            for e in entries.flatten() {
                count += 1;
                if let Ok(m) = e.metadata() {
                    if let Ok(t) = m.modified() {
                        if let Ok(d) = t.duration_since(SystemTime::UNIX_EPOCH) {
                            newest = newest.max(d.as_secs());
                        }
                    }
                }
            }
        }
        Some(format!("d:{}:{}", count, newest))
    } else {
        None
    }
}

pub(crate) fn sleep_check(ms: u64, stop: &AtomicBool) -> bool {
    let mut remaining = ms;
    while remaining > 0 {
        if !stop.load(Ordering::Relaxed) {
            return false;
        }
        let slice = remaining.min(100);
        std::thread::sleep(Duration::from_millis(slice));
        remaining -= slice;
    }
    true
}

pub(crate) fn run_webhook_server(
    stop: Arc<AtomicBool>,
    app: tauri::AppHandle,
    replay: Arc<dyn ReplayUseCase>,
    project: String,
    auto_id: String,
    port: u16,
    cfg_path: String,
    cfg_method: String,
) {
    use tauri::Emitter;

    let listener = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(l) => l,
        Err(e) => {
            let _ = app.emit(
                "automation-warning",
                serde_json::json!({ "id": auto_id, "warning": "webhook", "detail": format!("No se pudo abrir el puerto {}: {}", port, e) }),
            );
            return;
        }
    };
    let _ = listener.set_nonblocking(true);

    while stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
                let mut buf = Vec::new();
                let mut chunk = [0u8; 8192];
                for _ in 0..8 {
                    match stream.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            buf.extend_from_slice(&chunk[..n]);
                            if buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() > 64 {
                            }
                        }
                        Err(_) => break,
                    }
                    if buf.len() > 512 * 1024 {
                        break;
                    }
                }
                let text = String::from_utf8_lossy(&buf).to_string();
                let mut lines = text.lines();
                let request_line = lines.next().unwrap_or("").to_string();
                let mut parts = request_line.split_whitespace();
                let method = parts.next().unwrap_or("").to_uppercase();
                let raw_path = parts.next().unwrap_or("/");
                let path_only = raw_path.split('?').next().unwrap_or("/");
                let query = raw_path.split('?').nth(1).unwrap_or("").to_string();
                let body = text
                    .split("\r\n\r\n")
                    .nth(1)
                    .unwrap_or("")
                    .trim_matches(char::from(0))
                    .trim()
                    .to_string();

                let (status, resp_body) = if path_only != cfg_path {
                    ("404 Not Found", "{\"error\":\"not found\"}".to_string())
                } else if method != cfg_method {
                    ("405 Method Not Allowed", "{\"error\":\"method not allowed\"}".to_string())
                } else {
                    let mut vars = HashMap::new();
                    vars.insert("trigger.kind".into(), "webhook".into());
                    vars.insert("webhook.method".into(), method.clone());
                    vars.insert("webhook.path".into(), path_only.to_string());
                    vars.insert("webhook.query".into(), query);
                    vars.insert("webhook.body".into(), body.clone());
                    seed_pending_vars(&auto_id, vars);
                    let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "webhook" }));
                    let _ = replay.execute_replay(&project, &auto_id, false);
                    ("200 OK", "{\"status\":\"ok\",\"message\":\"grapScreen webhook recibido\"}".to_string())
                };

                let response = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status,
                    resp_body.len(),
                    resp_body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(_) => {
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}
