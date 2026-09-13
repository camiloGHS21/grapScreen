use crate::domain::entities::{Result, RecordedEvent};
use crate::domain::ports_out::InputListenerPort;
use rdev::{listen, Event, EventType};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

/// Infrastructure adapter implementing InputListenerPort using rdev.
pub struct RdevListenerAdapter {
    active_sender: Arc<Mutex<Option<(Sender<RecordedEvent>, Instant)>>>,
}

impl RdevListenerAdapter {
    pub fn new() -> Self {
        let active_sender: Arc<Mutex<Option<(Sender<RecordedEvent>, Instant)>>> = Arc::new(Mutex::new(None));
        
        let sender_clone = active_sender.clone();
        thread::spawn(move || {
            let callback = move |event: Event| {
                let guard = sender_clone.lock().unwrap();
                if let Some((ref sender, start_time)) = *guard {
                    let relative_ms = start_time.elapsed().as_millis() as u64;
                    let (kind, data) = match event.event_type {
                        EventType::MouseMove { x, y } => ("mouse_move", serde_json::json!({ "x": x, "y": y })),
                        EventType::ButtonPress(btn) => ("button_press", serde_json::json!({ "button": format!("{:?}", btn) })),
                        EventType::ButtonRelease(btn) => ("button_release", serde_json::json!({ "button": format!("{:?}", btn) })),
                        EventType::Wheel { delta_x, delta_y } => ("wheel", serde_json::json!({ "x": delta_x, "y": delta_y })),
                        EventType::KeyPress(key) => ("key_press", serde_json::json!({ "key": format!("{:?}", key) })),
                        EventType::KeyRelease(key) => ("key_release", serde_json::json!({ "key": format!("{:?}", key) })),
                    };
                    let _ = sender.send(RecordedEvent {
                        at_ms: relative_ms,
                        kind: kind.into(),
                        data,
                    });
                }
            };
            let _ = listen(callback);
        });

        Self { active_sender }
    }
}

impl InputListenerPort for RdevListenerAdapter {
    fn start_listening(&self, sender: Sender<RecordedEvent>) -> Result<()> {
        let mut guard = self.active_sender.lock().unwrap();
        *guard = Some((sender, Instant::now()));
        Ok(())
    }

    fn stop_listening(&self) -> Result<()> {
        let mut guard = self.active_sender.lock().unwrap();
        *guard = None;
        Ok(())
    }
}
