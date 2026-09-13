use super::{ReplayServiceImpl, IS_BACKGROUND};
use crate::domain::entities::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

impl ReplayServiceImpl {
    pub(crate) fn execute_replay_internal(
        &self,
        project_name: &str,
        file_id: &str,
        is_background: bool,
        stop_after: Option<String>,
    ) -> Result<()> {
        let file = self.inner.storage_port.load_automation(project_name, file_id)?;
        let target = file.target_app.clone();

        let stop_flag = Arc::new(AtomicBool::new(true));
        {
            let mut replays = self.inner.active_replays.lock().unwrap();
            replays.insert(file_id.to_string(), stop_flag.clone());
        }

        let file_id_clone = file_id.to_string();
        let service_clone = Self { inner: self.inner.clone() };
        let started_at = chrono::Utc::now().timestamp_millis();
        let run_start = Instant::now();

        std::thread::spawn(move || {
            IS_BACKGROUND.with(|v| v.set(is_background));

            // The trigger daemon seeds the payload (and which trigger fired)
            // right before calling in. Consume it once here: `take_pending_vars`
            // removes the entry, so a second call further down would return an
            // empty map and silently record every run as trigger-less.
            let pending = crate::application::trigger_service::take_pending_vars(&file_id_clone);
            let trigger_kind = pending.get("trigger.kind").cloned();
            for (k, v) in pending {
                crate::application::replay_helpers::set_var(&k, &v);
            }

            let has_active_events = file.events.iter().any(|e| {
                !e.data.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false)
                    && e.kind != "layout_metadata"
            });

            if has_active_events {
                if is_background {
                    if let Some(t) = &target {
                        if crate::isolated::find_target_hwnd(t).is_none() {
                            let _ = crate::isolated::open_target_app(&t.exe);
                            std::thread::sleep(Duration::from_millis(1500));
                        }
                    }
                } else {
                    if let Some(t) = &target {
                        let _ = crate::isolated::focus_target_window(t);
                        std::thread::sleep(Duration::from_millis(400));
                    }
                }
            }

            service_clone.inner.observer.on_status(&file_id_clone, "started");

            if let Some((gnodes, gconns, gdisabled)) =
                crate::application::graph_executor::extract_graph(&file.events)
            {
                let result = crate::application::graph_executor::run_graph_with_options(
                    &service_clone,
                    &file_id_clone,
                    &file.events,
                    &target,
                    is_background,
                    &stop_flag,
                    gnodes,
                    gconns,
                    gdisabled,
                    stop_after.clone(),
                );
                {
                    let mut replays = service_clone.inner.active_replays.lock().unwrap();
                    replays.remove(&file_id_clone);
                }
                let (run_status, run_error, node_statuses) = match &result {
                    Ok(log) => (
                        "success".to_string(),
                        None,
                        log.clone(),
                    ),

                    Err(e) => (
                        if e == "__stopped__" { "stopped".to_string() } else { "error".to_string() },
                        if e == "__stopped__" { None } else { Some(e.clone()) },
                        Vec::new(),
                    ),
                };
                if let Err(e) = &result {
                    if e != "__stopped__" {
                        crate::application::replay_helpers::warn_ui(
                            "execution",
                            &format!("La ejecución terminó con error: {}", e),
                        );
                    }
                }
                crate::application::execution_history::record_run(crate::application::execution_history::ExecutionRecord {
                    automation_id: file_id_clone.clone(),
                    automation_name: file.name.clone(),
                    started_at,
                    finished_at: chrono::Utc::now().timestamp_millis(),
                    duration_ms: run_start.elapsed().as_millis() as u64,
                    status: run_status,
                    error: run_error,
                    node_statuses,
                    trigger_kind,
                });
                service_clone.inner.observer.on_status(&file_id_clone, "finished");
                return;
            }

            let total = file.events.len();
            let mut previous: u64 = 0;
            let mut last_emit = Instant::now();

            for (i, event) in file.events.iter().enumerate() {
                if !stop_flag.load(Ordering::Relaxed) {
                    break;
                }
                
                if event.kind == "layout_metadata" {
                    continue;
                }
                
                if event.data.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false) {
                    previous = event.at_ms;
                    continue;
                }
                
                let delay = event.at_ms.saturating_sub(previous).min(5000);
                if delay > 0 {
                    std::thread::sleep(Duration::from_millis(delay));
                }
                
                if !stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                let mut handled = false;
                if let Some(success) = crate::application::replay_helpers::handle_custom_event(
                    event,
                    &*service_clone.inner.ocr_port,
                    &stop_flag,
                ) {
                    if !success {
                        break;
                    }
                    handled = true;
                }

                if !handled {
                    if let Some(action) = service_clone.event_to_action(event, &target, is_background) {
                        let _ = service_clone.execute_action(&action, is_background);
                    }
                }
                
                previous = event.at_ms;

                if i + 1 == total || last_emit.elapsed() >= Duration::from_millis(70) {
                    last_emit = Instant::now();
                    service_clone.inner.observer.on_progress(&file_id_clone, i, total);
                }
            }

            {
                let mut replays = service_clone.inner.active_replays.lock().unwrap();
                replays.remove(&file_id_clone);
            }

            service_clone.inner.observer.on_status(&file_id_clone, "finished");
        });

        Ok(())
    }
}
