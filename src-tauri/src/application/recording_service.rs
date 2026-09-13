use crate::domain::entities::{Result, DomainError, TargetApp, AutomationFile, RecordedEvent};
use crate::domain::ports_in::RecordingUseCase;
use crate::domain::ports_out::{StoragePort, InputListenerPort, VideoRecorderPort};
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use std::time::Instant;
use uuid::Uuid;

struct ActiveSession {
    id: String,
    project_name: String,
    automation_name: String,
    generate_mp4: bool,
    target_app: Option<TargetApp>,
    start_time: Instant,
    events: Arc<Mutex<Vec<RecordedEvent>>>,
    paused: Arc<AtomicBool>,
    paused_duration: Arc<Mutex<std::time::Duration>>,
    pause_started: Arc<Mutex<Option<Instant>>>,
}

/// Application service implementing RecordingUseCase with parallel video recording support.
pub struct RecordingServiceImpl {
    storage_port: Arc<dyn StoragePort>,
    input_listener_port: Arc<dyn InputListenerPort>,
    video_recorder_port: Arc<dyn VideoRecorderPort>,
    session: Mutex<Option<ActiveSession>>,
}

impl RecordingServiceImpl {
    pub fn new(
        storage_port: Arc<dyn StoragePort>,
        input_listener_port: Arc<dyn InputListenerPort>,
        video_recorder_port: Arc<dyn VideoRecorderPort>,
    ) -> Self {
        Self {
            storage_port,
            input_listener_port,
            video_recorder_port,
            session: Mutex::new(None),
        }
    }
}

impl RecordingUseCase for RecordingServiceImpl {
    fn start_recording(&self, project_name: &str, automation_name: &str, generate_mp4: bool, target_app: Option<TargetApp>) -> Result<()> {
        let mut guard = self.session.lock().unwrap();
        if guard.is_some() {
            return Err(DomainError::Other("Already recording".into()));
        }

        let file_id = Uuid::new_v4().to_string();
        
        if generate_mp4 {
            let _ = self.video_recorder_port.start_video_recording(project_name, &file_id);
        }

        let events = Arc::new(Mutex::new(Vec::new()));
        let paused = Arc::new(AtomicBool::new(false));
        let paused_duration = Arc::new(Mutex::new(std::time::Duration::ZERO));
        let pause_started = Arc::new(Mutex::new(None));

        let (tx, rx) = std::sync::mpsc::channel();
        self.input_listener_port.start_listening(tx)?;

        let events_clone = events.clone();
        let paused_clone = paused.clone();
        let paused_duration_clone = paused_duration.clone();
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                if paused_clone.load(std::sync::atomic::Ordering::Relaxed) {
                    continue;
                }
                let p_dur = if let Ok(g) = paused_duration_clone.lock() {
                    *g
                } else {
                    std::time::Duration::ZERO
                };
                let relative_ms = event.at_ms.saturating_sub(p_dur.as_millis() as u64);
                let mut ev = event;
                ev.at_ms = relative_ms;
                let mut evs = events_clone.lock().unwrap();
                evs.push(ev);
            }
        });

        *guard = Some(ActiveSession {
            id: file_id,
            project_name: project_name.to_string(),
            automation_name: automation_name.to_string(),
            generate_mp4,
            target_app,
            start_time: Instant::now(),
            events,
            paused,
            paused_duration,
            pause_started,
        });

        Ok(())
    }

    fn stop_recording(&self) -> Result<Option<AutomationFile>> {
        let mut guard = self.session.lock().unwrap();
        let session = match guard.take() {
            Some(s) => s,
            None => return Ok(None),
        };

        self.input_listener_port.stop_listening()?;
        if session.generate_mp4 {
            let _ = self.video_recorder_port.stop_video_recording();
        }

        let events = session.events.lock().unwrap().clone();
        let total_elapsed = session.start_time.elapsed().as_millis() as u64;
        let p_dur = if let Ok(g) = session.paused_duration.lock() {
            g.as_millis() as u64
        } else {
            0
        };
        let duration_ms = total_elapsed.saturating_sub(p_dur);

        let auto_file = AutomationFile {
            id: session.id,
            name: session.automation_name,
            created_at: chrono::Utc::now().timestamp(),
            duration_ms,
            generate_mp4: session.generate_mp4,
            events,
            target_app: session.target_app,
        };

        self.storage_port.save_automation(&session.project_name, &auto_file)?;

        Ok(Some(auto_file))
    }

    fn pause_recording(&self) -> Result<()> {
        let guard = self.session.lock().unwrap();
        if let Some(ref session) = *guard {
            if !session.paused.load(std::sync::atomic::Ordering::Relaxed) {
                session.paused.store(true, std::sync::atomic::Ordering::Relaxed);
                if let Ok(mut start_guard) = session.pause_started.lock() {
                    *start_guard = Some(Instant::now());
                }
            }
        }
        Ok(())
    }

    fn resume_recording(&self) -> Result<()> {
        let guard = self.session.lock().unwrap();
        if let Some(ref session) = *guard {
            if session.paused.load(std::sync::atomic::Ordering::Relaxed) {
                if let Ok(mut start_guard) = session.pause_started.lock() {
                    if let Some(started) = start_guard.take() {
                        let elapsed = started.elapsed();
                        if let Ok(mut dur_guard) = session.paused_duration.lock() {
                            *dur_guard += elapsed;
                        }
                    }
                }
                session.paused.store(false, std::sync::atomic::Ordering::Relaxed);
            }
        }
        Ok(())
    }

    fn cancel_recording(&self) -> Result<()> {
        let mut guard = self.session.lock().unwrap();
        let session = match guard.take() {
            Some(s) => s,
            None => return Ok(()),
        };

        self.input_listener_port.stop_listening()?;
        if session.generate_mp4 {
            let _ = self.video_recorder_port.stop_video_recording();
            let dir = dirs::data_dir()
                .ok_or_else(|| DomainError::Other("No data directory found".into()))?
                .join("grapScreen")
                .join("projects")
                .join(&session.project_name);
            let video_path = dir.join(format!("{}.mp4", session.id));
            if video_path.exists() {
                let _ = std::fs::remove_file(video_path);
            }
        }
        Ok(())
    }

    fn is_recording(&self) -> bool {
        self.session.lock().unwrap().is_some()
    }

    fn record_event(&self, event: RecordedEvent) {
        let guard = self.session.lock().unwrap();
        if let Some(ref session) = *guard {
            if !session.paused.load(std::sync::atomic::Ordering::Relaxed) {
                session.events.lock().unwrap().push(event);
            }
        }
    }

    fn update_target_app(&self, target_app: TargetApp) -> Result<()> {
        let mut guard = self.session.lock().unwrap();
        if let Some(ref mut session) = *guard {
            session.target_app = Some(target_app);
        }
        Ok(())
    }

    fn get_paused_flag(&self) -> Option<std::sync::Arc<std::sync::atomic::AtomicBool>> {
        let guard = self.session.lock().unwrap();
        guard.as_ref().map(|s| s.paused.clone())
    }
}
