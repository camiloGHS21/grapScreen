//! n8n-style trigger daemon: fires automations automatically when their
//! trigger nodes' events occur — schedule/interval, global hotkey, file
//! changes, incoming webhook calls and app startup.

pub mod handlers;
pub mod state;

pub use handlers::parse_interval_ms;
pub use state::{seed_pending_vars, take_pending_vars};

use handlers::{
    normalize_rdev_key, normalize_webhook_path, parse_hotkey, path_signature, run_webhook_server,
    sha256_hex, sleep_check,
};
use state::{load_armed, persist_armed, registry, ArmedEntry, TriggerEntry};

use crate::domain::ports_in::ReplayUseCase;
use crate::domain::ports_out::StoragePort;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Reads a config value that the UI may store as a number or as a string.
fn cfg_u64(data: &serde_json::Value, key: &str, default: u64, min: u64) -> u64 {
    let raw = match data.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_u64(),
        Some(serde_json::Value::String(s)) => s.trim().parse().ok(),
        _ => None,
    };
    raw.unwrap_or(default).max(min)
}

fn cfg_u16(data: &serde_json::Value, key: &str, default: u16) -> u16 {
    match data.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(default as u64) as u16,
        Some(serde_json::Value::String(s)) => s.trim().parse().unwrap_or(default),
        _ => default,
    }
}

/// Reads a config string, defaulting when absent or blank.
fn cfg_str(data: &serde_json::Value, key: &str, default: &str) -> String {
    match data.get(key).and_then(|v| v.as_str()) {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => default.to_string(),
    }
}

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
    // Counted separately from `descs`: a trigger can be described without being
    // armable (an n8n broker subscriber, or a polling node with no API root), and
    // reporting "armed" for one that will never fire is worse than an error.
    let mut armed = 0usize;

    let trigger_kinds = [
        "trigger",
        "cron",
        "webhook",
        "hotkey_trigger",
        "file_change",
        "startup",
        "polling",
        "whatsapp_trigger",
        "telegram_trigger",
        "email_trigger",
        "rss_trigger",
        // The declarative n8n catalogue: 111 official triggers share this kind
        // and name their specific node in `data.n8n_key`.
        crate::application::graph_executor::declarative::N8N_TRIGGER_KIND,
    ];
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
                    armed += 1;
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
                    armed += 1;
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
                    armed += 1;
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
                armed += 1;
                std::thread::spawn(move || {
                    run_webhook_server(
                        stop,
                        app,
                        replay,
                        project,
                        auto_id,
                        port,
                        cfg_path,
                        cfg_method,
                        "Webhook".to_string(),
                    );
                });
            }
            "startup" => {
                descs.push("Al iniciar la app".to_string());
                armed += 1;
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
                    armed += 1;
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
                            let digest = sha256_hex(&resp.body);
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
            "whatsapp_trigger" => {
                let path = "/webhook/whatsapp".to_string();
                let port = 8787u16;
                descs.push(format!("WhatsApp Webhook (:{} {})", port, path));
                armed += 1;
                std::thread::spawn(move || {
                    run_webhook_server(
                        stop,
                        app,
                        replay,
                        project,
                        auto_id,
                        port,
                        path,
                        "POST".to_string(),
                        "whatsapp_trigger".to_string(),
                    );
                });
            }
            "rss_trigger" => {
                let url = ev.data["url"].as_str().unwrap_or("").to_string();
                let interval = cfg_u64(&ev.data, "interval", 60, 5);
                if !url.is_empty() {
                    descs.push(format!("RSS Feed ({} cada {}s)", url, interval));
                    armed += 1;
                    std::thread::spawn(move || {
                        let mut last_hash = String::new();
                        while sleep_check(interval * 1000, &stop) {
                            let req = crate::application::http_client::HttpRequest {
                                method: "GET".into(),
                                url: url.clone(),
                                headers: vec![],
                                body: None,
                                timeout_secs: 15,
                            };
                            if let Ok(resp) = crate::application::http_client::send(&req) {
                                let h = sha256_hex(&resp.body);
                                if !last_hash.is_empty() && h != last_hash {
                                    let mut vars = kind_vars("rss_trigger");
                                    vars.insert("rss.body".into(), resp.body.clone());
                                    seed_pending_vars(&auto_id, vars);
                                    let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "rss_trigger" }));
                                    let _ = replay.execute_replay(&project, &auto_id, false);
                                }
                                last_hash = h;
                            }
                        }
                    });
                }
            }
            "telegram_trigger" => {
                let token = ev.data["bot_token"].as_str().unwrap_or("").to_string();
                if !token.is_empty() {
                    descs.push("Telegram Bot (long polling)".to_string());
                    armed += 1;
                    let api_url = format!("https://api.telegram.org/bot{}/getUpdates?timeout=10", token);
                    std::thread::spawn(move || {
                        let mut last_update_id: i64 = 0;
                        while sleep_check(5000, &stop) {
                            let poll_url = if last_update_id > 0 {
                                format!("{}&offset={}", api_url, last_update_id + 1)
                            } else {
                                api_url.clone()
                            };
                            let req = crate::application::http_client::HttpRequest {
                                method: "GET".into(),
                                url: poll_url,
                                headers: vec![],
                                body: None,
                                timeout_secs: 20,
                            };
                            if let Ok(resp) = crate::application::http_client::send(&req) {
                                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&resp.body) {
                                    if let Some(results) = json_val.get("result").and_then(|r| r.as_array()) {
                                        for upd in results {
                                            if let Some(uid) = upd.get("update_id").and_then(|u| u.as_i64()) {
                                                if uid > last_update_id {
                                                    last_update_id = uid;
                                                }
                                            }
                                        }
                                        if !results.is_empty() {
                                            let mut vars = kind_vars("telegram_trigger");
                                            vars.insert("telegram.updates".into(), json_val.to_string());
                                            seed_pending_vars(&auto_id, vars);
                                            let _ = app.emit("trigger-fired", serde_json::json!({ "id": auto_id, "kind": "telegram_trigger" }));
                                            let _ = replay.execute_replay(&project, &auto_id, false);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
            "email_trigger" => {
                let host = ev.data["host"].as_str().unwrap_or("").to_string();
                descs.push(format!("Email IMAP ({})", if host.is_empty() { "sin configurar" } else { &host }));
            }
            "n8n_trigger" => {
                // The declarative catalogue. `n8n_key` names the descriptor, and
                // the descriptor's `triggerMode` (detected from the n8n source)
                // decides how the event is actually received.
                let key = ev.data["n8n_key"].as_str().unwrap_or("").trim().to_string();
                let named = ev.data["n8n_name"].as_str().unwrap_or("").trim().to_string();
                let label = if named.is_empty() { key.clone() } else { named };

                if key.is_empty() {
                    descs.push("Disparador n8n sin nodo asignado".to_string());
                    continue;
                }
                let Some(desc) = crate::application::graph_executor::declarative::registry().get(&key)
                else {
                    descs.push(format!("{} (no está en el catálogo)", label));
                    continue;
                };

                let config = ev.data.clone();
                // An explicit mode on the node wins over the descriptor, so a
                // wrong extraction can be corrected by hand without waiting for
                // the catalogue to be regenerated.
                let mode = {
                    let stored = config["n8n_trigger_mode"]
                        .as_str()
                        .unwrap_or("")
                        .trim()
                        .to_lowercase();
                    if matches!(stored.as_str(), "webhook" | "polling" | "schedule" | "event") {
                        stored
                    } else {
                        desc.trigger_mode().to_string()
                    }
                };

                match mode.as_str() {
                    "webhook" => {
                        // n8n registers a public URL with the third party. We
                        // cannot do that, but we can serve the endpoint locally
                        // and let the user paste this URL into the service.
                        let path = normalize_webhook_path(
                            config["n8n_path"].as_str().unwrap_or(""),
                            &key,
                        );
                        let http_method = cfg_str(&config, "n8n_method", "POST").to_uppercase();
                        let port = cfg_u16(&config, "n8n_port", 8787);
                        descs.push(format!(
                            "{} (webhook :{} {}, método {})",
                            label, port, path, http_method
                        ));
                        armed += 1;
                        let fire_origin = label.clone();
                        std::thread::spawn(move || {
                            run_webhook_server(
                                stop,
                                app,
                                replay,
                                project,
                                auto_id,
                                port,
                                path,
                                http_method,
                                fire_origin,
                            );
                        });
                    }
                    "polling" => {
                        // Polling needs somewhere to poll. Without an API root
                        // the node cannot fire, so say so instead of arming a
                        // loop that would fail every cycle.
                        let override_url = config["n8n_base_url"].as_str().unwrap_or("");
                        if desc.effective_base_url(Some(override_url)).is_none() {
                            descs.push(format!("{} (sondeo: falta la URL base)", label));
                            continue;
                        }
                        let interval_secs = cfg_u64(&config, "n8n_interval", 60, 5);
                        descs.push(format!("{} (sondeo cada {}s)", label, interval_secs));
                        armed += 1;
                        std::thread::spawn(move || {
                            let mut last_hash: Option<String> = None;
                            while sleep_check(interval_secs * 1000, &stop) {
                                let outcome = match crate::application::graph_executor::declarative::poll_once(&config, desc) {
                                    Ok(o) => o,
                                    Err(e) => {
                                        // A single failed poll is normal (network
                                        // blip, expired token); keep watching.
                                        let _ = app.emit(
                                            "automation-warning",
                                            serde_json::json!({ "id": auto_id, "warning": "n8n_trigger", "detail": e }),
                                        );
                                        continue;
                                    }
                                };
                                let digest = sha256_hex(&outcome.body);
                                if last_hash.as_deref() == Some(digest.as_str()) {
                                    continue;
                                }
                                // n8n emits nothing on the first poll either: it
                                // seeds the watermark and waits for new data.
                                let is_first = last_hash.is_none();
                                last_hash = Some(digest);
                                if is_first {
                                    continue;
                                }
                                let mut vars = std::collections::HashMap::new();
                                vars.insert("trigger.kind".into(), "n8n_trigger".into());
                                vars.insert("n8n.trigger".into(), key.clone());
                                vars.insert("polling.body".into(), outcome.body);
                                vars.insert("polling.status".into(), outcome.status.to_string());
                                vars.insert("polling.url".into(), outcome.url);
                                seed_pending_vars(&auto_id, vars);
                                let _ = app.emit(
                                    "trigger-fired",
                                    serde_json::json!({ "id": auto_id, "kind": "n8n_trigger", "n8nKey": key }),
                                );
                                let _ = replay.execute_replay(&project, &auto_id, false);
                            }
                        });
                    }
                    "schedule" => {
                        let interval_secs = cfg_u64(&config, "n8n_interval", 60, 5);
                        descs.push(format!("{} (cada {}s)", label, interval_secs));
                        armed += 1;
                        let fire_key = key.clone();
                        std::thread::spawn(move || {
                            while sleep_check(interval_secs * 1000, &stop) {
                                let mut vars = std::collections::HashMap::new();
                                vars.insert("trigger.kind".into(), "n8n_trigger".into());
                                vars.insert("n8n.trigger".into(), fire_key.clone());
                                seed_pending_vars(&auto_id, vars);
                                let _ = app.emit(
                                    "trigger-fired",
                                    serde_json::json!({ "id": auto_id, "kind": "n8n_trigger", "n8nKey": fire_key }),
                                );
                                let _ = replay.execute_replay(&project, &auto_id, false);
                            }
                        });
                    }
                    // Broker subscribers (Kafka, MQTT, Redis, AMQP), IMAP
                    // watchers and manual/subflow triggers need a client library
                    // or an external caller. Arming them on a timer would fire
                    // the flow with no event behind it, so they are reported as
                    // unavailable instead of silently doing nothing.
                    _ => {
                        descs.push(format!(
                            "{} ({}) — requiere un cliente propio; usa un Webhook, un sondeo o un intervalo",
                            label, key
                        ));
                    }
                }
            }
            _ => {}
        }
    }

    if armed == 0 {
        if descs.is_empty() {
            return Err("Esta automatización no tiene ningún nodo trigger configurado (Intervalo/Cron, Atajo global, Webhook, Cambio de archivo, Polling o Al iniciar).".into());
        }
        return Err(format!("Ningún disparador se pudo activar: {}.", descs.join(", ")));
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
