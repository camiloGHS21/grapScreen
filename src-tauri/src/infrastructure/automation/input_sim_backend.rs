use crate::domain::entities::{ActionRequest, ActionResult, MouseButton};
use crate::domain::ports_out::AutomationBackendPort;
use rdev::{simulate, Button, EventType, Key};
use std::io::Write;
use std::thread;
use std::time::Duration;

fn sim_log(msg: &str) {
    if let Some(mut dir) = dirs::data_dir() {
        dir.push("grapScreen");
        let _ = std::fs::create_dir_all(&dir);
        dir.push("automation.log");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&dir)
            .and_then(|mut f| writeln!(f, "[InputSim] {}", msg));
    }
}

fn parse_button(button: &MouseButton) -> Button {
    match button {
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
        MouseButton::Left => Button::Left,
    }
}

fn parse_key(name: &str) -> Option<Key> {
    Some(match name {
        "Alt" => Key::Alt,
        "AltGr" => Key::AltGr,
        "Backspace" => Key::Backspace,
        "CapsLock" => Key::CapsLock,
        "ControlLeft" => Key::ControlLeft,
        "ControlRight" => Key::ControlRight,
        "Delete" => Key::Delete,
        "DownArrow" => Key::DownArrow,
        "End" => Key::End,
        "Escape" => Key::Escape,
        "Home" => Key::Home,
        "LeftArrow" => Key::LeftArrow,
        "MetaLeft" => Key::MetaLeft,
        "MetaRight" => Key::MetaRight,
        "PageDown" => Key::PageDown,
        "PageUp" => Key::PageUp,
        "Return" | "Enter" => Key::Return,
        "RightArrow" => Key::RightArrow,
        "ShiftLeft" => Key::ShiftLeft,
        "ShiftRight" => Key::ShiftRight,
        "Space" => Key::Space,
        "Tab" => Key::Tab,
        "UpArrow" => Key::UpArrow,
        "KeyA" => Key::KeyA, "KeyB" => Key::KeyB, "KeyC" => Key::KeyC,
        "KeyD" => Key::KeyD, "KeyE" => Key::KeyE, "KeyF" => Key::KeyF,
        "KeyG" => Key::KeyG, "KeyH" => Key::KeyH, "KeyI" => Key::KeyI,
        "KeyJ" => Key::KeyJ, "KeyK" => Key::KeyK, "KeyL" => Key::KeyL,
        "KeyM" => Key::KeyM, "KeyN" => Key::KeyN, "KeyO" => Key::KeyO,
        "KeyP" => Key::KeyP, "KeyQ" => Key::KeyQ, "KeyR" => Key::KeyR,
        "KeyS" => Key::KeyS, "KeyT" => Key::KeyT, "KeyU" => Key::KeyU,
        "KeyV" => Key::KeyV, "KeyW" => Key::KeyW, "KeyX" => Key::KeyX,
        "KeyY" => Key::KeyY, "KeyZ" => Key::KeyZ,
        "Num0" => Key::Num0, "Num1" => Key::Num1, "Num2" => Key::Num2,
        "Num3" => Key::Num3, "Num4" => Key::Num4, "Num5" => Key::Num5,
        "Num6" => Key::Num6, "Num7" => Key::Num7, "Num8" => Key::Num8,
        "Num9" => Key::Num9,
        "F1" => Key::F1, "F2" => Key::F2, "F3" => Key::F3, "F4" => Key::F4,
        "F5" => Key::F5, "F6" => Key::F6, "F7" => Key::F7, "F8" => Key::F8,
        "F9" => Key::F9, "F10" => Key::F10, "F11" => Key::F11, "F12" => Key::F12,
        _ => return None,
    })
}

/// Infrastructure adapter implementing AutomationBackendPort using rdev simulation (intrusive).
pub struct InputSimBackend;

impl InputSimBackend {
    pub fn new() -> Self {
        Self
    }
}

impl AutomationBackendPort for InputSimBackend {
    fn name(&self) -> &str {
        "InputSimulation"
    }

    fn level(&self) -> u8 {
        5
    }

    fn can_handle(&self, _action: &ActionRequest) -> bool {
        true
    }

    fn execute(&self, action: &ActionRequest) -> ActionResult {
        match action {
            ActionRequest::MouseMove { x, y } => {
                let _ = simulate(&EventType::MouseMove {
                    x: *x as f64,
                    y: *y as f64,
                });
                ActionResult::Executed {
                    backend: "InputSim/Move".into(),
                    intrusive: true,
                }
            }
            ActionRequest::Click { x, y, button, .. } => {
                let btn = parse_button(button);
                let _ = simulate(&EventType::MouseMove {
                    x: *x as f64,
                    y: *y as f64,
                });
                thread::sleep(Duration::from_millis(30));
                let _ = simulate(&EventType::ButtonPress(btn));
                thread::sleep(Duration::from_millis(40));
                let _ = simulate(&EventType::ButtonRelease(btn));
                sim_log(&format!("Click at ({},{}) via rdev::simulate (INTRUSIVE)", x, y));
                ActionResult::Executed {
                    backend: "InputSim/Click".into(),
                    intrusive: true,
                }
            }
            ActionRequest::ButtonRelease { x, y, button, .. } => {
                let btn = parse_button(button);
                let _ = simulate(&EventType::MouseMove {
                    x: *x as f64,
                    y: *y as f64,
                });
                let _ = simulate(&EventType::ButtonRelease(btn));
                ActionResult::Executed {
                    backend: "InputSim/Release".into(),
                    intrusive: true,
                }
            }
            ActionRequest::KeyPress { key, .. } => {
                if let Some(k) = parse_key(key) {
                    let _ = simulate(&EventType::KeyPress(k));
                    ActionResult::Executed {
                        backend: "InputSim/KeyPress".into(),
                        intrusive: true,
                    }
                } else {
                    ActionResult::Failed(format!("Unknown key: {}", key))
                }
            }
            ActionRequest::KeyRelease { key, .. } => {
                if let Some(k) = parse_key(key) {
                    let _ = simulate(&EventType::KeyRelease(k));
                    ActionResult::Executed {
                        backend: "InputSim/KeyRelease".into(),
                        intrusive: true,
                    }
                } else {
                    ActionResult::Failed(format!("Unknown key: {}", key))
                }
            }
            ActionRequest::TypeText { text, .. } => {
                for ch in text.chars() {
                    let key_name = if ch == ' ' {
                        "Space".to_string()
                    } else if ch == '\n' {
                        "Return".to_string()
                    } else if ch.is_ascii_alphabetic() {
                        format!("Key{}", ch.to_uppercase())
                    } else {
                        continue;
                    };
                    if let Some(k) = parse_key(&key_name) {
                        let _ = simulate(&EventType::KeyPress(k));
                        thread::sleep(Duration::from_millis(20));
                        let _ = simulate(&EventType::KeyRelease(k));
                        thread::sleep(Duration::from_millis(30));
                    }
                }
                sim_log(&format!("TypeText '{}' via rdev::simulate (INTRUSIVE)", text));
                ActionResult::Executed {
                    backend: "InputSim/Type".into(),
                    intrusive: true,
                }
            }
            ActionRequest::Scroll { x, y, delta_x, delta_y, .. } => {
                let _ = simulate(&EventType::MouseMove {
                    x: *x as f64,
                    y: *y as f64,
                });
                thread::sleep(Duration::from_millis(20));
                let _ = simulate(&EventType::Wheel {
                    delta_x: *delta_x,
                    delta_y: *delta_y,
                });
                ActionResult::Executed {
                    backend: "InputSim/Scroll".into(),
                    intrusive: true,
                }
            }
            ActionRequest::WindowFocus { window } => {
                let target = crate::domain::entities::TargetApp {
                    exe: window.exe.clone(),
                    title: window.title.clone(),
                    class: window.class.clone(),
                    name: "".to_string(),
                    rect: (0, 0, 0, 0),
                    pid: window.pid,
                };
                let _ = crate::isolated::focus_target_window(&target);
                sim_log(&format!("WindowFocus '{}' — delegated to OS", window.title));
                ActionResult::Executed {
                    backend: "InputSim/Focus".into(),
                    intrusive: true,
                }
            }
        }
    }
}
