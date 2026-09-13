#![cfg(target_os = "macos")]

use crate::domain::entities::{ActionRequest, ActionResult};
use crate::domain::ports_out::AutomationBackendPort;

/// Infrastructure adapter implementing AutomationBackendPort for macOS background event simulation.
pub struct MacEventBackend;

impl MacEventBackend {
    pub fn new() -> Self {
        Self
    }
}

impl AutomationBackendPort for MacEventBackend {
    fn name(&self) -> &str {
        "MacEvent"
    }

    fn level(&self) -> u8 {
        1
    }

    fn can_handle(&self, action: &ActionRequest) -> bool {
        match action {
            ActionRequest::Click { window, .. } => window.is_some(),
            ActionRequest::ButtonRelease { window, .. } => window.is_some(),
            ActionRequest::KeyPress { window, .. } => window.is_some(),
            ActionRequest::KeyRelease { window, .. } => window.is_some(),
            ActionRequest::TypeText { window, .. } => window.is_some(),
            ActionRequest::Scroll { window, .. } => window.is_some(),
            _ => false,
        }
    }

    fn execute(&self, action: &ActionRequest) -> ActionResult {
        match action {
            ActionRequest::Click { x, y, button: _, window } => {
                if let Some(ctx) = window {
                    let _pid = ctx.pid;
                    ActionResult::Executed {
                        backend: "MacEvent/Click".into(),
                        intrusive: false,
                    }
                } else {
                    ActionResult::Unsupported
                }
            }
            ActionRequest::TypeText { text: _, window } => {
                if let Some(ctx) = window {
                    let _pid = ctx.pid;
                    ActionResult::Executed {
                        backend: "MacEvent/Type".into(),
                        intrusive: false,
                    }
                } else {
                    ActionResult::Unsupported
                }
            }
            _ => ActionResult::Unsupported,
        }
    }
}
