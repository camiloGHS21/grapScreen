#![cfg(target_os = "windows")]

use crate::domain::entities::{ActionRequest, ActionResult, WindowContext};
use crate::domain::ports_out::AutomationBackendPort;
use super::uia_helpers::{resolve_element_at_coords, uia_log};
use std::io::Write;

fn a11y_log(msg: &str) {
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\Administrator\\Downloads\\grapScreen\\automation.log")
        .and_then(|mut f| writeln!(f, "[A11y] {}", msg));
}

/// Infrastructure adapter implementing AutomationBackendPort using aggressive UIA tree traversal.
pub struct AccessibilityBackend;

impl AccessibilityBackend {
    pub fn new() -> Self {
        Self
    }

    fn try_invoke_walking_tree(&self, x: i32, y: i32, window: &Option<WindowContext>) -> ActionResult {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::*;

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => return ActionResult::Failed(format!("A11y init: {}", e)),
        };

        let element = match resolve_element_at_coords(&automation, x, y, window) {
            Some(el) => el,
            None => return ActionResult::Unsupported,
        };

        let walker = match automation.get_control_view_walker() {
            Ok(w) => w,
            Err(_) => return ActionResult::Unsupported,
        };

        let mut current = Some(element);
        for depth in 0..6 {
            let el = match &current {
                Some(e) => e,
                None => break,
            };

            let el_name = el.get_name().unwrap_or_default();

            if let Ok(invoke) = el.get_pattern::<UIInvokePattern>() {
                if invoke.invoke().is_ok() {
                    a11y_log(&format!("Invoke at depth {} on '{}' for ({},{})", depth, el_name, x, y));
                    return ActionResult::Executed {
                        backend: format!("A11y/Invoke@{}", depth),
                        intrusive: false,
                    };
                }
            }

            if let Ok(toggle) = el.get_pattern::<UITogglePattern>() {
                if toggle.toggle().is_ok() {
                    a11y_log(&format!("Toggle at depth {} on '{}' for ({},{})", depth, el_name, x, y));
                    return ActionResult::Executed {
                        backend: format!("A11y/Toggle@{}", depth),
                        intrusive: false,
                    };
                }
            }

            if let Ok(sel) = el.get_pattern::<UISelectionItemPattern>() {
                if sel.select().is_ok() {
                    a11y_log(&format!("Select at depth {} on '{}' for ({},{})", depth, el_name, x, y));
                    return ActionResult::Executed {
                        backend: format!("A11y/Select@{}", depth),
                        intrusive: false,
                    };
                }
            }

            if let Ok(ec) = el.get_pattern::<UIExpandCollapsePattern>() {
                if let Ok(state) = ec.get_state() {
                    let result = if state == uiautomation::types::ExpandCollapseState::Collapsed {
                        ec.expand()
                    } else {
                        ec.collapse()
                    };
                    if result.is_ok() {
                        a11y_log(&format!("ExpandCollapse at depth {} on '{}' for ({},{})", depth, el_name, x, y));
                        return ActionResult::Executed {
                            backend: format!("A11y/ExpandCollapse@{}", depth),
                            intrusive: false,
                        };
                    }
                }
            }

            current = walker.get_parent(el).ok();
        }

        a11y_log(&format!("No pattern found walking tree from ({},{})", x, y));
        ActionResult::Unsupported
    }

    fn try_set_value_walking(&self, text: &str) -> ActionResult {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::*;

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => return ActionResult::Failed(format!("A11y init: {}", e)),
        };

        let element = match automation.get_focused_element() {
            Ok(el) => el,
            Err(_) => return ActionResult::Unsupported,
        };

        let walker = match automation.get_control_view_walker() {
            Ok(w) => w,
            Err(_) => return ActionResult::Unsupported,
        };

        let mut current = Some(element);
        for depth in 0..4 {
            let el = match &current {
                Some(e) => e,
                None => break,
            };

            if let Ok(vp) = el.get_pattern::<UIValuePattern>() {
                if vp.set_value(text).is_ok() {
                    a11y_log(&format!("SetValue at depth {} for text '{}'", depth, text));
                    return ActionResult::Executed {
                        backend: format!("A11y/Value@{}", depth),
                        intrusive: false,
                    };
                }
            }

            current = walker.get_parent(el).ok();
        }

        ActionResult::Unsupported
    }
}

impl AutomationBackendPort for AccessibilityBackend {
    fn name(&self) -> &str {
        "Accessibility"
    }

    fn level(&self) -> u8 {
        3
    }

    fn can_handle(&self, action: &ActionRequest) -> bool {
        match action {
            ActionRequest::Click { .. } => true,
            ActionRequest::TypeText { .. } => true,
            ActionRequest::Scroll { .. } => true,
            _ => false,
        }
    }

    fn execute(&self, action: &ActionRequest) -> ActionResult {
        match action {
            ActionRequest::Click { x, y, window, .. } => {
                self.try_invoke_walking_tree(*x, *y, window)
            }
            ActionRequest::TypeText { text, .. } => {
                self.try_set_value_walking(text)
            }
            ActionRequest::Scroll { x, y, delta_y, window, .. } => {
                use uiautomation::UIAutomation;
                use uiautomation::patterns::*;

                let automation = match UIAutomation::new() {
                    Ok(a) => a,
                    Err(_) => return ActionResult::Unsupported,
                };
                let element = match resolve_element_at_coords(&automation, *x, *y, window) {
                    Some(el) => el,
                    None => return ActionResult::Unsupported,
                };
                let walker = match automation.get_control_view_walker() {
                    Ok(w) => w,
                    Err(_) => return ActionResult::Unsupported,
                };
                let mut current = Some(element);
                for depth in 0..6 {
                    let el = match &current {
                        Some(e) => e,
                        None => break,
                    };
                    if let Ok(scroll) = el.get_pattern::<UIScrollPattern>() {
                        let amount = if *delta_y < 0 {
                            uiautomation::types::ScrollAmount::LargeIncrement
                        } else {
                            uiautomation::types::ScrollAmount::LargeDecrement
                        };
                        if scroll.scroll(uiautomation::types::ScrollAmount::NoAmount, amount).is_ok() {
                            return ActionResult::Executed {
                                backend: format!("A11y/Scroll@{}", depth),
                                intrusive: false,
                            };
                        }
                    }
                    current = walker.get_parent(el).ok();
                }
                ActionResult::Unsupported
            }
            _ => ActionResult::Unsupported,
        }
    }
}
