#![cfg(target_os = "windows")]

use crate::domain::entities::WindowContext;
use std::io::Write;
use uiautomation::core::UIElement;

/// Append a line to the automation log for debugging.
pub fn uia_log(msg: &str) {
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\Administrator\\Downloads\\grapScreen\\automation.log")
        .and_then(|mut f| writeln!(f, "[UIA] {}", msg));
}

/// Recursively find the deepest descendant element containing coordinates (x, y)
/// in the given root element, even when the window is behind other windows.
pub fn find_element_at_coords(root: &UIElement, x: i32, y: i32) -> Option<UIElement> {
    let automation = uiautomation::UIAutomation::new().ok()?;
    let walker = automation.get_control_view_walker().ok()?;
    
    let mut best_match = None;
    let mut best_area = f64::MAX;
    
    traverse(root.clone(), x, y, &walker, &mut best_match, &mut best_area);
    best_match
}

fn traverse(
    el: UIElement,
    x: i32,
    y: i32,
    walker: &uiautomation::core::UITreeWalker,
    best_match: &mut Option<UIElement>,
    best_area: &mut f64,
) {
    if let Ok(rect) = el.get_bounding_rectangle() {
        let left = rect.get_left();
        let top = rect.get_top();
        let right = rect.get_right();
        let bottom = rect.get_bottom();
        
        if x >= left && x <= right && y >= top && y <= bottom {
            let width = right - left;
            let height = bottom - top;
            let area = (width * height) as f64;
            if area < *best_area {
                *best_area = area;
                *best_match = Some(el.clone());
            }
            
            if let Ok(mut child) = walker.get_first_child(&el) {
                loop {
                    traverse(child.clone(), x, y, walker, best_match, best_area);
                    match walker.get_next_sibling(&child) {
                        Ok(next) => child = next,
                        Err(_) => break,
                    }
                }
            }
        }
    }
}

/// Resolve the UI element at the given coordinates.
/// Prioritizes searching from the target HWND context (which works for background/covered windows).
/// Falls back to using element_from_point (which resolves the top-most visible element on screen).
pub fn resolve_element_at_coords(
    automation: &uiautomation::UIAutomation,
    x: i32,
    y: i32,
    window: &Option<WindowContext>,
) -> Option<UIElement> {
    if let Some(ctx) = window {
        if let Some(hwnd_val) = ctx.hwnd {
            if hwnd_val != 0 {
                let handle = uiautomation::types::Handle::from(hwnd_val);
                if let Ok(root) = automation.element_from_handle(handle) {
                    if let Some(target) = find_element_at_coords(&root, x, y) {
                        uia_log(&format!("Resolved element from HWND handle context for ({},{})", x, y));
                        return Some(target);
                    }
                }
            }
        }
    }

    // Never fall back to screen point in background execution if IS_BACKGROUND is true
    // In our Hexagonal structure, we will use a thread-local or pass it down.
    // Let's check if the manager had a thread-local flag. Yes, IS_BACKGROUND.
    // We can also just read it via the tauri app state or a global/thread-local variable.
    // Let's use the thread local check from manager.
    if crate::application::replay_service::IS_BACKGROUND.with(|v| v.get()) {
        None
    } else {
        let point = uiautomation::types::Point::new(x, y);
        if let Ok(el) = automation.element_from_point(point) {
            Some(el)
        } else {
            None
        }
    }
}
