use std::time::Duration;
use rdev::{simulate, EventType, Key};

pub fn parse_key_str(name: &str) -> Option<Key> {
    match name.to_lowercase().as_str() {
        "ctrl" | "control" | "controlleft" | "ctrl_l" | "control_l" => Some(Key::ControlLeft),
        "ctrl_r" | "control_r" => Some(Key::ControlRight),
        "alt" | "alt_l" => Some(Key::Alt),
        "alt_r" | "altgr" => Some(Key::AltGr),
        "shift" | "shiftleft" | "shift_l" => Some(Key::ShiftLeft),
        "shift_r" => Some(Key::ShiftRight),
        "win" | "meta" | "metaleft" | "cmd" | "command" => Some(Key::MetaLeft),
        "enter" | "return" => Some(Key::Return),
        "backspace" => Some(Key::Backspace),
        "escape" | "esc" => Some(Key::Escape),
        "space" => Some(Key::Space),
        "tab" => Some(Key::Tab),
        "delete" | "del" => Some(Key::Delete),
        "down" | "downarrow" => Some(Key::DownArrow),
        "up" | "uparrow" => Some(Key::UpArrow),
        "left" | "leftarrow" => Some(Key::LeftArrow),
        "right" | "rightarrow" => Some(Key::RightArrow),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        "a" => Some(Key::KeyA), "b" => Some(Key::KeyB), "c" => Some(Key::KeyC),
        "d" => Some(Key::KeyD), "e" => Some(Key::KeyE), "f" => Some(Key::KeyF),
        "g" => Some(Key::KeyG), "h" => Some(Key::KeyH), "i" => Some(Key::KeyI),
        "j" => Some(Key::KeyJ), "k" => Some(Key::KeyK), "l" => Some(Key::KeyL),
        "m" => Some(Key::KeyM), "n" => Some(Key::KeyN), "o" => Some(Key::KeyO),
        "p" => Some(Key::KeyP), "q" => Some(Key::KeyQ), "r" => Some(Key::KeyR),
        "s" => Some(Key::KeyS), "t" => Some(Key::KeyT), "u" => Some(Key::KeyU),
        "v" => Some(Key::KeyV), "w" => Some(Key::KeyW), "x" => Some(Key::KeyX),
        "y" => Some(Key::KeyY), "z" => Some(Key::KeyZ),
        "0" => Some(Key::Num0), "1" => Some(Key::Num1), "2" => Some(Key::Num2),
        "3" => Some(Key::Num3), "4" => Some(Key::Num4), "5" => Some(Key::Num5),
        "6" => Some(Key::Num6), "7" => Some(Key::Num7), "8" => Some(Key::Num8),
        "9" => Some(Key::Num9),
        _ => None,
    }
}

pub fn simulate_hotkey(keys_str: &str) -> std::result::Result<(), String> {
    let parts: Vec<&str> = keys_str.split('+').map(|s| s.trim()).collect();
    let mut parsed_keys = Vec::new();
    for part in parts {
        if let Some(key) = parse_key_str(part) {
            parsed_keys.push(key);
        } else {
            return Err(format!("Unknown key: {}", part));
        }
    }
    for key in &parsed_keys {
        let _ = simulate(&EventType::KeyPress(*key));
        std::thread::sleep(Duration::from_millis(20));
    }
    std::thread::sleep(Duration::from_millis(50));
    for key in parsed_keys.iter().rev() {
        let _ = simulate(&EventType::KeyRelease(*key));
        std::thread::sleep(Duration::from_millis(20));
    }
    Ok(())
}
