#![cfg(target_os = "macos")]

use crate::domain::entities::{ActionRequest, ActionResult};
use crate::domain::ports_out::AutomationBackendPort;

/// Infrastructure adapter implementing AutomationBackendPort for macOS accessibility tree.
pub struct MacAccessibilityBackend;

impl MacAccessibilityBackend {
    pub fn new() -> Self {
        Self
    }
}

impl AutomationBackendPort for MacAccessibilityBackend {
    fn name(&self) -> &str {
        "MacAccessibility"
    }

    fn level(&self) -> u8 {
        3
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
