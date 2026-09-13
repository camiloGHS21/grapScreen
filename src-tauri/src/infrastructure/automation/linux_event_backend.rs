#![cfg(target_os = "linux")]

use crate::domain::entities::{ActionRequest, ActionResult};
use crate::domain::ports_out::AutomationBackendPort;

/// Infrastructure adapter implementing AutomationBackendPort for Linux background event simulation.
pub struct LinuxEventBackend;

impl LinuxEventBackend {
    pub fn new() -> Self {
        Self
    }
}

impl AutomationBackendPort for LinuxEventBackend {
    fn name(&self) -> &str {
        "LinuxEvent"
    }

    fn level(&self) -> u8 {
        1
    }

    fn can_handle(&self, action: &ActionRequest) -> bool {
        match action {
            ActionRequest::Click { window, .. } => window.is_some(),
            ActionRequest::TypeText { window, .. } => window.is_some(),
            _ => false,
        }
    }

    fn execute(&self, _action: &ActionRequest) -> ActionResult {
        ActionResult::Unsupported
    }
}
