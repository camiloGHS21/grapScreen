use super::entities::{Result, AutomationFile, OcrScan, ActionRequest, ActionResult, RecordedEvent};
use std::sync::mpsc::Sender;

/// Output Port (SPI) for persisting automation recording files.
pub trait StoragePort: Send + Sync {
    fn save_automation(&self, project_name: &str, file: &AutomationFile) -> Result<()>;
    fn load_automation(&self, project_name: &str, file_id: &str) -> Result<AutomationFile>;
    fn list_automations(&self, project_name: &str) -> Result<Vec<AutomationFile>>;
}

/// Output Port (SPI) for Optical Character Recognition (OCR).
pub trait OcrPort: Send + Sync {
    fn scan_screen_text(&self) -> Result<OcrScan>;
}

/// Output Port (SPI) for Template Matching / Computer Vision.
pub trait VisionPort: Send + Sync {
    fn find_template(&self, template_png_base64: &str) -> Result<(i32, i32)>;
}

/// Output Port (SPI) for capturing hardware input events.
pub trait InputListenerPort: Send + Sync {
    fn start_listening(&self, sender: Sender<RecordedEvent>) -> Result<()>;
    fn stop_listening(&self) -> Result<()>;
}

/// Output Port (SPI) representing an execution backend for automation actions.
pub trait AutomationBackendPort: Send + Sync {
    fn name(&self) -> &str;
    fn level(&self) -> u8;
    fn can_handle(&self, action: &ActionRequest) -> bool;
    fn execute(&self, action: &ActionRequest) -> ActionResult;
}

/// Output Port (SPI) for notifying progress and status changes of automations.
pub trait ReplayObserver: Send + Sync {
    fn on_progress(&self, file_id: &str, step: usize, total: usize);
    fn on_status(&self, file_id: &str, status: &str);

    /// Graph-mode progress: reports which node is executing (falls back to
    /// plain index-based progress for observers that don't override it).
    fn on_node_progress(&self, file_id: &str, node_id: &str, index: usize) {
        let _ = node_id;
        self.on_progress(file_id, index, 0);
    }

    /// Graph-mode per-node status: "running" | "ok" | "error".
    fn on_node_status(&self, _file_id: &str, _node_id: &str, _status: &str) {}

    /// Graph-mode per-node detailed execution payload reporting (input, output, duration).
    fn on_node_detail(
        &self,
        _file_id: &str,
        _node_id: &str,
        _status: &str,
        _input: Option<&serde_json::Value>,
        _output: Option<&serde_json::Value>,
        _duration_ms: Option<u64>,
    ) {}
}


/// Output Port (SPI) for recording screen video during automation.
pub trait VideoRecorderPort: Send + Sync {
    fn start_video_recording(&self, project_name: &str, file_id: &str) -> Result<()>;
    fn stop_video_recording(&self) -> Result<()>;
}
