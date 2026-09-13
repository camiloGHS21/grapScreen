pub mod event_runner;

use crate::domain::entities::{ActionRequest, ActionResult, MouseButton, Result, TargetApp, WindowContext};
use crate::domain::ports_in::ReplayUseCase;
use crate::domain::ports_out::{AutomationBackendPort, OcrPort, ReplayObserver, StoragePort};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

thread_local! {
    pub static IS_BACKGROUND: std::cell::Cell<bool> = std::cell::Cell::new(false);
}

pub(crate) struct ReplayServiceInner {
    pub(crate) storage_port: Arc<dyn StoragePort>,
    pub(crate) backends: Vec<Box<dyn AutomationBackendPort>>,
    pub(crate) observer: Arc<dyn ReplayObserver>,
    pub(crate) ocr_port: Arc<dyn OcrPort>,
    pub(crate) active_replays: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub(crate) last_mouse_pos: Mutex<(i32, i32)>,
}

/// Application service implementing ReplayUseCase.
#[derive(Clone)]
pub struct ReplayServiceImpl {
    pub(crate) inner: Arc<ReplayServiceInner>,
}

impl ReplayServiceImpl {
    pub fn new(
        storage_port: Arc<dyn StoragePort>,
        backends: Vec<Box<dyn AutomationBackendPort>>,
        observer: Arc<dyn ReplayObserver>,
        ocr_port: Arc<dyn OcrPort>,
    ) -> Self {
        Self {
            inner: Arc::new(ReplayServiceInner {
                storage_port,
                backends,
                observer,
                ocr_port,
                active_replays: Mutex::new(HashMap::new()),
                last_mouse_pos: Mutex::new((0, 0)),
            }),
        }
    }

    pub(crate) fn observer(&self) -> Arc<dyn ReplayObserver> {
        self.inner.observer.clone()
    }

    pub(crate) fn ocr(&self) -> Arc<dyn OcrPort> {
        self.inner.ocr_port.clone()
    }

    pub(crate) fn run_single_event(
        &self,
        event: &crate::domain::entities::RecordedEvent,
        target: &Option<TargetApp>,
        is_background: bool,
        stop_flag: &AtomicBool,
    ) -> std::result::Result<(), String> {
        if let Some(success) = crate::application::replay_helpers::handle_custom_event(
            event,
            &*self.inner.ocr_port,
            stop_flag,
        ) {
            if !success {
                return Err(format!("El paso '{}' falló", event.kind));
            }
            return Ok(());
        }
        if let Some(action) = self.event_to_action(event, target, is_background) {
            let _ = self.execute_action(&action, is_background);
        }
        Ok(())
    }

    pub(crate) fn execute_action(&self, action: &ActionRequest, is_background: bool) -> ActionResult {
        if is_background {
            if let ActionRequest::WindowFocus { .. } = action {
                return ActionResult::Executed {
                    backend: "Background/FocusNoOp".into(),
                    intrusive: false,
                };
            }
        }

        for backend in &self.inner.backends {
            if !is_background && backend.level() < 5 {
                continue;
            }
            if is_background && backend.level() == 5 {
                continue;
            }
            if !backend.can_handle(action) {
                continue;
            }

            let result = backend.execute(action);
            match &result {
                ActionResult::Executed { backend: name, intrusive } => {
                    return ActionResult::Executed { backend: name.clone(), intrusive: *intrusive };
                }
                ActionResult::Unsupported => {
                    continue;
                }
                ActionResult::Failed(err) => {
                    println!("[Replay] Backend {} failed: {}", backend.name(), err);
                    continue;
                }
            }
        }
        ActionResult::Failed("All backends exhausted".into())
    }

    pub(crate) fn event_to_action(
        &self,
        event: &crate::domain::entities::RecordedEvent,
        target: &Option<TargetApp>,
        is_background: bool,
    ) -> Option<ActionRequest> {
        let window_ctx = target.as_ref().map(|t| {
            let hwnd = crate::isolated::find_target_hwnd(t);
            WindowContext {
                title: t.title.clone(),
                class: t.class.clone(),
                exe: t.exe.clone(),
                pid: t.pid,
                hwnd,
            }
        });

        match event.kind.as_str() {
            "mouse_move" => {
                let x = event.data["x"].as_f64().unwrap_or(0.0) as i32;
                let y = event.data["y"].as_f64().unwrap_or(0.0) as i32;
                if let Ok(mut pos) = self.inner.last_mouse_pos.lock() {
                    *pos = (x, y);
                }
                if is_background {
                    None
                } else {
                    Some(ActionRequest::MouseMove { x, y })
                }
            }
            "button_press" => {
                let (x, y) = self.inner.last_mouse_pos.lock().map(|p| *p).unwrap_or((0, 0));
                let button = MouseButton::from_str(event.data["button"].as_str().unwrap_or("Left"));
                Some(ActionRequest::Click { x, y, button, window: window_ctx })
            }
            "button_release" => {
                let (x, y) = self.inner.last_mouse_pos.lock().map(|p| *p).unwrap_or((0, 0));
                let button = MouseButton::from_str(event.data["button"].as_str().unwrap_or("Left"));
                Some(ActionRequest::ButtonRelease { x, y, button, window: window_ctx })
            }
            "wheel" => {
                let (x, y) = self.inner.last_mouse_pos.lock().map(|p| *p).unwrap_or((0, 0));
                let dx = event.data["x"].as_i64().unwrap_or(0);
                let dy = event.data["y"].as_i64().unwrap_or(0);
                Some(ActionRequest::Scroll { x, y, delta_x: dx, delta_y: dy, window: window_ctx })
            }
            "key_press" => {
                let key = event.data["key"].as_str().unwrap_or("").to_string();
                let key = crate::application::replay_helpers::interpolate_variables(&key);
                Some(ActionRequest::KeyPress { key, modifiers: vec![], window: window_ctx })
            }
            "key_release" => {
                let key = event.data["key"].as_str().unwrap_or("").to_string();
                let key = crate::application::replay_helpers::interpolate_variables(&key);
                Some(ActionRequest::KeyRelease { key, modifiers: vec![], window: window_ctx })
            }
            _ => None,
        }
    }
}

impl ReplayUseCase for ReplayServiceImpl {
    fn execute_replay(&self, project_name: &str, file_id: &str, is_background: bool) -> Result<()> {
        self.execute_replay_internal(project_name, file_id, is_background, None)
    }

    fn execute_replay_until(&self, project_name: &str, file_id: &str, node_id: &str) -> Result<()> {
        self.execute_replay_internal(project_name, file_id, false, Some(node_id.to_string()))
    }

    fn stop_replay(&self, file_id: &str) -> Result<()> {
        let mut replays = self.inner.active_replays.lock().unwrap();
        if let Some(flag) = replays.remove(file_id) {
            flag.store(false, Ordering::Relaxed);
            self.inner.observer.on_status(file_id, "stopped");
        }
        Ok(())
    }

    fn stop_all_replays(&self) -> Result<()> {
        let mut replays = self.inner.active_replays.lock().unwrap();
        for (id, flag) in replays.iter() {
            flag.store(false, Ordering::Relaxed);
            self.inner.observer.on_status(id, "stopped");
        }
        replays.clear();
        Ok(())
    }
}

/// Regression baseline for the record → replay path.
///
/// This is the part of the app the user actually relies on day to day: a screen
/// recording has to replay as the same mouse and keyboard actions, in order.
/// The graph-executor work (n8n-style nodes) lives on a different code path, so
/// these tests exist to prove that adding nodes cannot silently break
/// recordings.
#[cfg(test)]
mod recording_replay_tests {
    use super::*;
    use crate::domain::entities::{
        AutomationFile, DomainError, MouseButton, OcrScan, RecordedEvent, Result as DomainResult,
    };
    use crate::domain::ports_out::{OcrPort, ReplayObserver, StoragePort};
    use serde_json::json;

    // ── test doubles ──
    // The replay path needs a storage, a set of backends, an observer and an
    // OCR port. None of them participate in event→action translation, so the
    // doubles stay deliberately empty.

    struct NullStorage;
    impl StoragePort for NullStorage {
        fn save_automation(&self, _p: &str, _f: &AutomationFile) -> DomainResult<()> {
            Ok(())
        }
        fn load_automation(&self, _p: &str, _id: &str) -> DomainResult<AutomationFile> {
            Err(DomainError::Other("not used in tests".into()))
        }
        fn list_automations(&self, _p: &str) -> DomainResult<Vec<AutomationFile>> {
            Ok(Vec::new())
        }
    }

    struct NullObserver;
    impl ReplayObserver for NullObserver {
        fn on_progress(&self, _f: &str, _s: usize, _t: usize) {}
        fn on_status(&self, _f: &str, _s: &str) {}
    }

    struct NullOcr;
    impl OcrPort for NullOcr {
        fn scan_screen_text(&self) -> DomainResult<OcrScan> {
            Err(DomainError::Other("not used in tests".into()))
        }
    }

    fn service() -> ReplayServiceImpl {
        ReplayServiceImpl::new(
            Arc::new(NullStorage),
            Vec::new(),
            Arc::new(NullObserver),
            Arc::new(NullOcr),
        )
    }

    fn ev(at_ms: u64, kind: &str, data: serde_json::Value) -> RecordedEvent {
        RecordedEvent { at_ms, kind: kind.to_string(), data }
    }

    fn to_action(svc: &ReplayServiceImpl, e: &RecordedEvent, background: bool) -> Option<ActionRequest> {
        svc.event_to_action(e, &None, background)
    }

    // ── the core contract ──

    #[test]
    fn mouse_move_preserves_coordinates() {
        let svc = service();
        let a = to_action(&svc, &ev(0, "mouse_move", json!({ "x": 640, "y": 480 })), false);
        match a {
            Some(ActionRequest::MouseMove { x, y }) => {
                assert_eq!((x, y), (640, 480));
            }
            other => panic!("expected MouseMove, got {:?}", other),
        }
    }

    #[test]
    fn click_reuses_the_last_recorded_mouse_position() {
        // The recorder emits `button_press` without coordinates — the position
        // comes from the preceding `mouse_move`. Losing that carry-over would
        // make every replay click at (0, 0), which is the classic regression
        // here, so pin it down explicitly.
        let svc = service();
        to_action(&svc, &ev(0, "mouse_move", json!({ "x": 300, "y": 150 })), false);
        let a = to_action(&svc, &ev(10, "button_press", json!({ "button": "Left" })), false);
        match a {
            Some(ActionRequest::Click { x, y, button, .. }) => {
                assert_eq!((x, y), (300, 150));
                assert_eq!(button, MouseButton::Left);
            }
            other => panic!("expected Click at the last mouse position, got {:?}", other),
        }
    }

    #[test]
    fn button_release_reuses_the_last_mouse_position() {
        let svc = service();
        to_action(&svc, &ev(0, "mouse_move", json!({ "x": 12, "y": 34 })), false);
        let a = to_action(&svc, &ev(40, "button_release", json!({ "button": "Left" })), false);
        match a {
            Some(ActionRequest::ButtonRelease { x, y, .. }) => assert_eq!((x, y), (12, 34)),
            other => panic!("expected ButtonRelease, got {:?}", other),
        }
    }

    #[test]
    fn right_and_middle_clicks_are_not_downgraded_to_left() {
        let svc = service();
        for (raw, want) in [("Right", MouseButton::Right), ("Middle", MouseButton::Middle)] {
            to_action(&svc, &ev(0, "mouse_move", json!({ "x": 5, "y": 5 })), false);
            let a = to_action(&svc, &ev(10, "button_press", json!({ "button": raw })), false);
            match a {
                Some(ActionRequest::Click { button, .. }) => assert_eq!(button, want, "raw {}", raw),
                other => panic!("expected Click, got {:?}", other),
            }
        }
    }

    #[test]
    fn wheel_keeps_both_deltas() {
        let svc = service();
        to_action(&svc, &ev(0, "mouse_move", json!({ "x": 7, "y": 9 })), false);
        let a = to_action(&svc, &ev(20, "wheel", json!({ "x": 0, "y": -120 })), false);
        match a {
            Some(ActionRequest::Scroll { x, y, delta_x, delta_y, .. }) => {
                assert_eq!((x, y), (7, 9));
                assert_eq!((delta_x, delta_y), (0, -120));
            }
            other => panic!("expected Scroll, got {:?}", other),
        }
    }

    #[test]
    fn key_press_and_release_keep_the_key_name() {
        // `KeyA` / `Space` / `Return` are the raw names rdev produces; they must
        // survive the expression-interpolation pass untouched.
        let svc = service();
        for key in ["KeyA", "Space", "Return", "F5", "ControlLeft"] {
            let a = to_action(&svc, &ev(0, "key_press", json!({ "key": key })), false);
            match a {
                Some(ActionRequest::KeyPress { key: got, .. }) => assert_eq!(got, key),
                other => panic!("expected KeyPress for {}, got {:?}", key, other),
            }
            let a = to_action(&svc, &ev(1, "key_release", json!({ "key": key })), false);
            match a {
                Some(ActionRequest::KeyRelease { key: got, .. }) => assert_eq!(got, key),
                other => panic!("expected KeyRelease for {}, got {:?}", key, other),
            }
        }
    }

    #[test]
    fn background_runs_never_move_the_real_cursor() {
        // Background execution must not hijack the user's pointer; the click
        // itself is still emitted so the target window receives it.
        let svc = service();
        assert!(to_action(&svc, &ev(0, "mouse_move", json!({ "x": 1, "y": 2 })), true).is_none());
        assert!(to_action(&svc, &ev(5, "button_press", json!({ "button": "Left" })), true).is_some());
    }

    #[test]
    fn a_full_recording_replays_one_action_per_input_event() {
        // move → press → release → key → wheel: the canonical recorded flow.
        // Every raw input event must map to exactly one action, in order.
        let svc = service();
        let recording = vec![
            ev(0, "mouse_move", json!({ "x": 100, "y": 200 })),
            ev(50, "button_press", json!({ "button": "Left" })),
            ev(90, "button_release", json!({ "button": "Left" })),
            ev(150, "key_press", json!({ "key": "KeyH" })),
            ev(170, "key_release", json!({ "key": "KeyH" })),
            ev(260, "wheel", json!({ "x": 0, "y": -120 })),
        ];
        let actions: Vec<ActionRequest> = recording
            .iter()
            .map(|e| to_action(&svc, e, false).expect("every recorded input event must replay"))
            .collect();
        assert_eq!(actions.len(), 6);
        assert!(matches!(actions[0], ActionRequest::MouseMove { .. }));
        assert!(matches!(actions[1], ActionRequest::Click { .. }));
        assert!(matches!(actions[2], ActionRequest::ButtonRelease { .. }));
        assert!(matches!(actions[3], ActionRequest::KeyPress { .. }));
        assert!(matches!(actions[4], ActionRequest::KeyRelease { .. }));
        assert!(matches!(actions[5], ActionRequest::Scroll { .. }));
    }

    #[test]
    fn non_input_events_do_not_become_mouse_actions() {
        // High-level node kinds are handled by `handle_custom_event`, not here.
        // If one leaked into this mapping it would fire a stray click.
        let svc = service();
        for kind in ["delay", "set_var", "screenshot", "run_cmd", "trigger", "note", "noop"] {
            assert!(
                to_action(&svc, &ev(0, kind, json!({})), false).is_none(),
                "{} must not map to a raw input action",
                kind
            );
        }
    }

    #[test]
    fn malformed_mouse_data_degrades_to_the_origin_instead_of_panicking() {
        // A truncated or hand-edited recording must not crash the replay.
        let svc = service();
        let a = to_action(&svc, &ev(0, "button_press", json!({})), false);
        match a {
            Some(ActionRequest::Click { x, y, .. }) => assert_eq!((x, y), (0, 0)),
            other => panic!("expected Click at the origin, got {:?}", other),
        }
        // A missing key becomes an empty key rather than an error.
        match to_action(&svc, &ev(0, "key_press", json!({})), false) {
            Some(ActionRequest::KeyPress { key, .. }) => assert!(key.is_empty()),
            other => panic!("expected KeyPress, got {:?}", other),
        }
    }

    #[test]
    fn executing_without_backends_fails_loudly() {
        // Guards the backend-selection loop: no backend can handle the action,
        // so the run must report failure rather than silently doing nothing.
        let svc = service();
        let action = ActionRequest::KeyPress {
            key: "KeyA".into(),
            modifiers: vec![],
            window: None,
        };
        assert!(matches!(svc.execute_action(&action, false), ActionResult::Failed(_)));
    }
}
