#![cfg(target_os = "windows")]

use crate::domain::entities::{ActionRequest, ActionResult, WindowContext};
use crate::domain::ports_out::AutomationBackendPort;
use super::uia_helpers::{resolve_element_at_coords, uia_log};

/// Infrastructure adapter implementing AutomationBackendPort using UIAutomation.
pub struct UiaBackend;

impl UiaBackend {
    pub fn new() -> Self {
        Self
    }

    fn try_invoke_at(&self, x: i32, y: i32, window: &Option<WindowContext>) -> ActionResult {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::*;

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => {
                uia_log(&format!("UIAutomation::new() failed: {}", e));
                return ActionResult::Failed(format!("UIA init failed: {}", e));
            }
        };

        let element = match resolve_element_at_coords(&automation, x, y, window) {
            Some(el) => el,
            None => {
                uia_log(&format!("Failed to resolve element at ({},{})", x, y));
                return ActionResult::Unsupported;
            }
        };

        let el_name = element.get_name().unwrap_or_default();
        let el_type = element.get_control_type().map(|ct| format!("{:?}", ct)).unwrap_or_default();
        uia_log(&format!("Found element at ({},{}): name='{}', type={}", x, y, el_name, el_type));

        if let Ok(invoke) = element.get_pattern::<UIInvokePattern>() {
            match invoke.invoke() {
                Ok(_) => {
                    uia_log(&format!("UIInvokePattern.invoke() succeeded for '{}'", el_name));
                    return ActionResult::Executed {
                        backend: "UIA/Invoke".into(),
                        intrusive: false,
                    };
                }
                Err(e) => {
                    uia_log(&format!("UIInvokePattern.invoke() failed: {}", e));
                }
            }
        }

        if let Ok(toggle) = element.get_pattern::<UITogglePattern>() {
            match toggle.toggle() {
                Ok(_) => {
                    uia_log(&format!("UITogglePattern.toggle() succeeded for '{}'", el_name));
                    return ActionResult::Executed {
                        backend: "UIA/Toggle".into(),
                        intrusive: false,
                    };
                }
                Err(e) => {
                    uia_log(&format!("UITogglePattern.toggle() failed: {}", e));
                }
            }
        }

        if let Ok(sel) = element.get_pattern::<UISelectionItemPattern>() {
            match sel.select() {
                Ok(_) => {
                    uia_log(&format!("UISelectionItemPattern.select() succeeded for '{}'", el_name));
                    return ActionResult::Executed {
                        backend: "UIA/SelectionItem".into(),
                        intrusive: false,
                    };
                }
                Err(e) => {
                    uia_log(&format!("UISelectionItemPattern.select() failed: {}", e));
                }
            }
        }

        if let Ok(ec) = element.get_pattern::<UIExpandCollapsePattern>() {
            match ec.get_state() {
                Ok(state) => {
                    let result = if state == uiautomation::types::ExpandCollapseState::Collapsed {
                        ec.expand()
                    } else {
                        ec.collapse()
                    };
                    match result {
                        Ok(_) => {
                            uia_log(&format!("ExpandCollapse succeeded for '{}'", el_name));
                            return ActionResult::Executed {
                                backend: "UIA/ExpandCollapse".into(),
                                intrusive: false,
                            };
                        }
                        Err(e) => {
                            uia_log(&format!("ExpandCollapse failed: {}", e));
                        }
                    }
                }
                Err(e) => {
                    uia_log(&format!("get_state failed: {}", e));
                }
            }
        }

        uia_log(&format!("No invokable pattern for element '{}' at ({},{})", el_name, x, y));
        ActionResult::Unsupported
    }

    fn try_set_value(&self, text: &str, _window: &Option<WindowContext>) -> ActionResult {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::*;

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => return ActionResult::Failed(format!("UIA init failed: {}", e)),
        };

        let element = match automation.get_focused_element() {
            Ok(el) => el,
            Err(e) => {
                uia_log(&format!("get_focused_element failed: {}", e));
                return ActionResult::Unsupported;
            }
        };

        let el_name = element.get_name().unwrap_or_default();

        if let Ok(value_pattern) = element.get_pattern::<UIValuePattern>() {
            match value_pattern.set_value(text) {
                Ok(_) => {
                    uia_log(&format!("UIValuePattern.set_value() succeeded on '{}'", el_name));
                    return ActionResult::Executed {
                        backend: "UIA/Value".into(),
                        intrusive: false,
                    };
                }
                Err(e) => {
                    uia_log(&format!("UIValuePattern.set_value() failed: {}", e));
                }
            }
        }

        ActionResult::Unsupported
    }

    fn try_scroll(&self, x: i32, y: i32, delta_y: i64, window: &Option<WindowContext>) -> ActionResult {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::*;

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => return ActionResult::Failed(format!("UIA init failed: {}", e)),
        };

        let element = match resolve_element_at_coords(&automation, x, y, window) {
            Some(el) => el,
            None => return ActionResult::Unsupported,
        };

        if let Ok(scroll) = element.get_pattern::<UIScrollPattern>() {
            let amount = if delta_y < 0 {
                uiautomation::types::ScrollAmount::LargeIncrement
            } else {
                uiautomation::types::ScrollAmount::LargeDecrement
            };

            match scroll.scroll(uiautomation::types::ScrollAmount::NoAmount, amount) {
                Ok(_) => {
                    uia_log(&format!("scroll() succeeded at ({},{})", x, y));
                    return ActionResult::Executed {
                        backend: "UIA/Scroll".into(),
                        intrusive: false,
                    };
                }
                Err(e) => {
                    uia_log(&format!("scroll() failed: {}", e));
                }
            }
        }

        ActionResult::Unsupported
    }
}

impl AutomationBackendPort for UiaBackend {
    fn name(&self) -> &str {
        "UIA"
    }

    fn level(&self) -> u8 {
        1
    }

    fn can_handle(&self, action: &ActionRequest) -> bool {
        match action {
            ActionRequest::Click { .. } => true,
            ActionRequest::TypeText { .. } => true,
            ActionRequest::Scroll { .. } => true,
            ActionRequest::WindowFocus { .. } => true,
            _ => false,
        }
    }

    fn execute(&self, action: &ActionRequest) -> ActionResult {
        match action {
            ActionRequest::Click { x, y, window, .. } => {
                self.try_invoke_at(*x, *y, window)
            }
            ActionRequest::TypeText { text, window } => {
                self.try_set_value(text, window)
            }
            ActionRequest::Scroll { x, y, delta_y, window, .. } => {
                self.try_scroll(*x, *y, *delta_y, window)
            }
            ActionRequest::WindowFocus { window } => {
                use uiautomation::UIAutomation;
                let automation = match UIAutomation::new() {
                    Ok(a) => a,
                    Err(e) => return ActionResult::Failed(format!("UIA init: {}", e)),
                };
                let matcher = automation.create_matcher()
                    .name(&window.title)
                    .timeout(2000);
                match matcher.find_first() {
                    Ok(el) => {
                        match el.set_focus() {
                            Ok(_) => ActionResult::Executed {
                                backend: "UIA/Focus".into(),
                                intrusive: false,
                            },
                            Err(e) => ActionResult::Failed(format!("UIA set_focus: {}", e)),
                        }
                    }
                    Err(_) => ActionResult::Unsupported,
                }
            }
            _ => ActionResult::Unsupported,
        }
    }
}
