//! Tool schema and execution for the AI agent runner.

use crate::application::replay_helpers::VARIABLES;
use rdev::{simulate, Button, EventType, Key};
use serde_json::{json, Value};
use std::thread;
use std::time::Duration;

pub fn build_tools_schema(enabled: &[String]) -> Vec<Value> {
    let mut tools = Vec::new();
    if enabled.contains(&"ocr_scan_text".to_string()) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "ocr_scan_text",
                "description": "Escanea la pantalla actual con OCR y devuelve el texto detectado.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        }));
    }
    if enabled.contains(&"rpa_click".to_string()) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "rpa_click",
                "description": "Realiza un clic de ratón en las coordenadas (x, y) de la pantalla.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": { "type": "number", "description": "Coordenada X" },
                        "y": { "type": "number", "description": "Coordenada Y" }
                    },
                    "required": ["x", "y"]
                }
            }
        }));
    }
    if enabled.contains(&"rpa_type_text".to_string()) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "rpa_type_text",
                "description": "Escribe un texto en el elemento activo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Texto a escribir" }
                    },
                    "required": ["text"]
                }
            }
        }));
    }
    if enabled.contains(&"get_workflow_var".to_string()) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "get_workflow_var",
                "description": "Obtiene el valor de una variable del flujo de trabajo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Nombre de la variable" }
                    },
                    "required": ["name"]
                }
            }
        }));
    }
    if enabled.contains(&"set_workflow_var".to_string()) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "set_workflow_var",
                "description": "Establece el valor de una variable en el flujo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "value": { "type": "string" }
                    },
                    "required": ["name", "value"]
                }
            }
        }));
    }
    tools
}

pub fn execute_tool(name: &str, args: &Value) -> String {
    match name {
        "ocr_scan_text" => {
            let ocr = crate::infrastructure::ocr::win_ocr::WinOcrAdapter::new();
            use crate::domain::ports_out::OcrPort;
            match ocr.scan_screen_text() {
                Ok(scan) => json!({ "text": scan.text, "boxes_count": scan.boxes.len() }).to_string(),
                Err(e) => json!({ "error": e.to_string() }).to_string(),
            }
        }
        "rpa_click" => {
            let x = args["x"].as_f64().unwrap_or(0.0);
            let y = args["y"].as_f64().unwrap_or(0.0);
            let _ = simulate(&EventType::MouseMove { x, y });
            thread::sleep(Duration::from_millis(30));
            let _ = simulate(&EventType::ButtonPress(Button::Left));
            thread::sleep(Duration::from_millis(40));
            let _ = simulate(&EventType::ButtonRelease(Button::Left));
            json!({ "status": "executed", "x": x, "y": y }).to_string()
        }
        "rpa_type_text" => {
            let text = args["text"].as_str().unwrap_or("");
            for ch in text.chars() {
                let key = if ch == ' ' {
                    Key::Space
                } else if ch == '\n' {
                    Key::Return
                } else {
                    Key::KeyA
                };
                let _ = simulate(&EventType::KeyPress(key));
                let _ = simulate(&EventType::KeyRelease(key));
            }
            json!({ "status": "executed", "typed_length": text.len() }).to_string()
        }
        "get_workflow_var" => {
            let name = args["name"].as_str().unwrap_or("");
            let val = VARIABLES.with(|vars| vars.borrow().get(name).cloned().unwrap_or_default());
            json!({ "name": name, "value": val }).to_string()
        }
        "set_workflow_var" => {
            let name = args["name"].as_str().unwrap_or("");
            let val = args["value"].as_str().unwrap_or("");
            VARIABLES.with(|vars| vars.borrow_mut().insert(name.to_string(), val.to_string()));
            json!({ "status": "updated", "name": name, "value": val }).to_string()
        }
        _ => json!({ "error": "Herramienta no encontrada" }).to_string(),
    }
}
