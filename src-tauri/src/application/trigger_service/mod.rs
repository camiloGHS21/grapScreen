//! n8n-style trigger daemon: fires automations automatically when their
//! trigger nodes' events occur — schedule/interval, global hotkey, file
//! changes, incoming webhook calls and app startup.

pub mod handlers;
pub mod state;

pub use handlers::parse_interval_ms;
pub use state::{seed_pending_vars, take_pending_vars};

use handlers::{normalize_rdev_key, parse_hotkey, path_signature, run_webhook_server, sleep_check};
use state::{load_armed, persist_armed, registry, ArmedEntry, TriggerEntry};

use crate::domain::ports_in::ReplayUseCase;
use crate::domain::ports_out::StoragePort;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub fn is_active(automation_id: &str) -> bool {
    registry().lock().unwrap().contains_key(automation_id)
}

/// Records which trigger fired, so the execution history can label the run.
///
/// `seed_pending_vars` *replaces* the map, so triggers that also carry a
/// payload (webhook, polling) must fold this key into their own map instead of
/// calling this afterwards.
fn kind_vars(kind: &str) -> std::collections::HashMap<String, String> {
    let mut m = std::collections::HashMap::new();
    m.insert("trigger.kind".to_string(), kind.to_string());
    m
}

pub fn active_descriptions() -> Vec<(String, String)> {
    registry()
        .lock()
        .unwrap()
        .iter()
        .map(|(id, e)| (id.clone(), e.desc.clone()))
        .collect()
}

pub fn stop_triggers(automation_id: &str) -> bool {
    let removed = registry().lock().unwrap().remove(automation_id);
    if let Some(entry) = removed {
        entry.stop.store(false, Ordering::Relaxed);
        persist_armed();
        true
    } else {
        false
    }
}

/// Reads the automation and spawns watchers for every trigger node it has.
/// Returns a human description of what got armed.
pub fn start_triggers(
    app: tauri::AppHandle,
    replay: Arc<dyn ReplayUseCase>,
    storage: Arc<dyn StoragePort>,
    project: &str,
    id: &str,
) -> Result<String, String> {
    use tauri::Emitter;

    stop_triggers(id); // re-arm cleanly

    let file = storage
        .load_automation(project, id)
        .map_err(|e| format!("No se pudo cargar la automatización: {}", e))?;

    let stop = Arc::new(AtomicBool::new(true));
    let mut descs: Vec<String> = Vec::new();

    let trigger_kinds = ["trigger", "cron", "webhook", "hotkey_trigger", "file_change", "startup", "polling"];
    let trigger_events: Vec<&crate::domain::entities::RecordedEvent> = file
        .events
        .iter()
        .filter(|e| trigger_kinds.contains(&e.kind.as_str()))
        .collect();

    for ev in trigger_events {
        let project = project.to_string();
        let auto_id = id.to_string();
        let replay = replay.clone();
        let app = app.clone();
        let stop = stop.clone();

        match ev.kind.as_str() {
            "cron" | "trigger" => {
                let schedule = ev.data["schedule"].as_str().unwrap_or("").to_string();
                let interval = if schedule == "manual" || schedule.is_empty() {
                    None
                } else {
                    parse_interval_ms(&schedule)
                };
                if let Some(ms) = interval {
                    descs.push(format!("Intervalo (cada {})", schedule));
                    std::thread::spawn(move || {
                        while sleep_check(ms, &stop) {
                            seed_pending_vars(&auto_id, kind_vars("cron"));
                            let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "cron" }));
                            let _ = replay.execute_replay(&project, &auto_id, false);
                        }
                    });
                }
            }
            "hotkey_trigger" => {
                let shortcut = ev.data["shortcut"].as_str().unwrap_or("").to_string();
                if let Some((mods, key)) = parse_hotkey(&shortcut) {
                    descs.push(format!("Atajo {}", shortcut));
                    std::thread::spawn(move || {
                        let mut pressed: HashSet<String> = HashSet::new();
                        let mut last_fire = Instant::now() - Duration::from_secs(2);
                        let cb = move |event: rdev::Event| {
                            if !stop.load(Ordering::Relaxed) {
                                return;
                            }
                            use rdev::EventType::*;
                            match event.event_type {
                                KeyPress(k) => {
                                    let name = normalize_rdev_key(&k);
                                    pressed.insert(name.clone());
                                    let mod_ok = mods.iter().all(|m| pressed.contains(&m.to_uppercase()));
                                    if mod_ok && name == key && last_fire.elapsed() > Duration::from_millis(800) {
                                        last_fire = Instant::now();
                                        seed_pending_vars(&auto_id, kind_vars("hotkey"));
                                        let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "hotkey" }));
                                        let _ = replay.execute_replay(&project, &auto_id, false);
                                    }
                                }
                                KeyRelease(k) => {
                                    pressed.remove(&normalize_rdev_key(&k));
                                }
                                _ => {}
                            }
                        };
                        let _ = rdev::listen(cb);
                    });
                }
            }

            "file_change" => {
                let path = ev.data["path"].as_str().unwrap_or("").to_string();
                if !path.is_empty() {
                    descs.push(format!("Vigilar {}", path));
                    std::thread::spawn(move || {
                        let mut last = path_signature(&path);
                        loop {
                            if !sleep_check(2000, &stop) {
                                break;
                            }
                            let sig = path_signature(&path);
                            if sig.is_some() && sig != last {
                                last = sig;
                                seed_pending_vars(&auto_id, kind_vars("file_change"));
                                let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "file_change" }));
                                let _ = replay.execute_replay(&project, &auto_id, false);
                            } else if sig.is_none() {
                                last = None;
                            }
                        }
                    });
                }
            }
            "webhook" => {
                let cfg_path = ev.data["path"].as_str().unwrap_or("/webhook").to_string();
                let cfg_method = ev.data["method"].as_str().unwrap_or("POST").to_uppercase();
                let port: u16 = ev.data["port"].as_str().unwrap_or("8787").parse().unwrap_or(8787);
                descs.push(format!("Webhook :{} {}", port, cfg_path));
                std::thread::spawn(move || {
                    run_webhook_server(stop, app, replay, project, auto_id, port, cfg_path, cfg_method);
                });
            }
            "startup" => {
                descs.push("Al iniciar la app".to_string());
            }
            "polling" => {
                let url = ev.data["url"].as_str().unwrap_or("").to_string();
                let method = ev.data["method"].as_str().unwrap_or("GET").to_uppercase();
                let headers_raw = ev.data["headers"].as_str().unwrap_or("").to_string();
                let body = ev.data["body"].as_str().unwrap_or("").to_string();
                let interval_secs = ev.data["interval"]
                    .as_u64()
                    .or_else(|| ev.data["interval"].as_str().and_then(|s| s.parse().ok()))
                    .unwrap_or(60)
                    .max(5);
                if !url.is_empty() {
                    descs.push(format!("Polling cada {}s a {}", interval_secs, url));
                    std::thread::spawn(move || {
                        let mut last_hash: Option<String> = None;
                        while sleep_check(interval_secs * 1000, &stop) {
                            let req = crate::application::http_client::HttpRequest {
                                method: method.clone(),
                                url: url.clone(),
                                headers: crate::application::http_client::parse_headers(&headers_raw),
                                body: if body.is_empty() { None } else { Some(body.clone()) },
                                timeout_secs: 30,
                            };
                            let Ok(resp) = crate::application::http_client::send(&req) else { continue };
                            let digest = {
                                use sha2::{Digest, Sha256};
                                let mut hasher = Sha256::new();
                                hasher.update(resp.body.as_bytes());
                                format!("{:x}", hasher.finalize())
                            };
                            if last_hash.as_deref() == Some(digest.as_str()) { continue; }
                            let is_first = last_hash.is_none();
                            last_hash = Some(digest);
                            if is_first { continue; }
                            let mut vars = std::collections::HashMap::new();
                            vars.insert("trigger.kind".into(), "polling".into());
                            vars.insert("polling.body".into(), resp.body.clone());
                            vars.insert("polling.status".into(), resp.status.to_string());
                            vars.insert("polling.url".into(), url.clone());
                            seed_pending_vars(&auto_id, vars);
                            let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "polling" }));
                            let _ = replay.execute_replay(&project, &auto_id, false);
                        }
                    });
                }
            }
            _ => {}
        }
    }

    if descs.is_empty() {
        return Err("Esta automatización no tiene ningún nodo trigger configurado (Intervalo/Cron, Atajo global, Webhook, Cambio de archivo, Polling o Al iniciar).".into());
    }

    let desc = descs.join(" + ");
    registry().lock().unwrap().insert(
        id.to_string(),
        TriggerEntry { stop, desc: desc.clone(), project: project.to_string() },
    );
    persist_armed();
    Ok(desc)
}

pub fn run_startup_flows(replay: Arc<dyn ReplayUseCase>, storage: Arc<dyn StoragePort>) {
    let base = match dirs::data_dir() {
        Some(d) => d.join("grapScreen").join("projects"),
        None => return,
    };
    let projects = match std::fs::read_dir(&base) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in projects.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let project = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if let Ok(files) = storage.list_automations(&project) {
            for file in files {
                let has_startup = file.events.iter().any(|e| e.kind == "startup");
                if has_startup {
                    let replay = replay.clone();
                    let project = project.clone();
                    let auto_id = file.id.clone();
                    std::thread::spawn(move || {
                        seed_pending_vars(&auto_id, kind_vars("startup"));
                        let _ = replay.execute_replay(&project, &auto_id, false);
                    });
                }
            }
        }
    }
}

pub fn rearm_and_startup(app: tauri::AppHandle, replay: Arc<dyn ReplayUseCase>, storage: Arc<dyn StoragePort>) {
    for ArmedEntry { project, id } in load_armed() {
        let _ = start_triggers(app.clone(), replay.clone(), storage.clone(), &project, &id);
    }
    run_startup_flows(replay, storage);
}
