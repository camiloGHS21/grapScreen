use serde_json::{json, Value};
use crate::domain::entities::RecordedEvent;
use crate::application::replay_helpers::{interpolate_variables, VARIABLES};
use crate::application::http_client;
use super::replay_integrations::Credentials;
use rdev::{simulate, Button, EventType, Key};
use std::thread;
use std::time::Duration;

pub fn execute_ai(event: &RecordedEvent, creds: &Credentials) -> bool {
    let prompt = event.data["prompt"].as_str().unwrap_or("");
    let system_prompt = event.data["system_prompt"].as_str().unwrap_or("Eres un asistente inteligente.");
    let provider = event.data["provider"].as_str().unwrap_or("openai");
    let model = event.data["model"].as_str().unwrap_or("gpt-4o-mini");
    let output_var = event.data["output_var"].as_str().unwrap_or("ai_response");
    let max_iterations = event.data["max_iterations"].as_u64().unwrap_or(5) as usize;
    let enabled_tools: Vec<String> = event.data["enable_tools"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_else(|| vec!["ocr_scan_text".into(), "rpa_click".into(), "rpa_type_text".into(), "get_workflow_var".into(), "set_workflow_var".into()]);

    let prompt_interp = interpolate_variables(prompt);
    let system_interp = interpolate_variables(system_prompt);

    let (url, auth_header) = match provider {
        "ollama" => {
            let host = if creds.ollama_url.is_empty() { "http://localhost:11434" } else { &creds.ollama_url };
            (format!("{}/v1/chat/completions", host.trim_end_matches('/')), "Authorization: Bearer none".to_string())
        }
        "lmstudio" => {
            ("http://localhost:1234/v1/chat/completions".to_string(), "Authorization: Bearer none".to_string())
        }
        "gemini" => {
            let key = if creds.openai_key.is_empty() { "none" } else { &creds.openai_key };
            ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(), format!("Authorization: Bearer {}", key))
        }
        "deepseek" => {
            let key = if creds.openai_key.is_empty() { "none" } else { &creds.openai_key };
            ("https://api.deepseek.com/chat/completions".to_string(), format!("Authorization: Bearer {}", key))
        }
        "openrouter" => {
            let key = if creds.openai_key.is_empty() { "none" } else { &creds.openai_key };
            ("https://openrouter.ai/api/v1/chat/completions".to_string(), format!("Authorization: Bearer {}", key))
        }
        _ => {
            let key = if creds.openai_key.is_empty() { "none" } else { &creds.openai_key };
            ("https://api.openai.com/v1/chat/completions".to_string(), format!("Authorization: Bearer {}", key))
        }
    };

    let tools_schema = build_tools_schema(&enabled_tools);
    let mut messages = vec![
        json!({ "role": "system", "content": system_interp }),
        json!({ "role": "user", "content": prompt_interp })
    ];

    for _iteration in 0..max_iterations {
        let mut req_body = json!({
            "model": model,
            "messages": messages
        });

        if !tools_schema.is_empty() {
            req_body["tools"] = json!(tools_schema);
        }

        let body_str = req_body.to_string();
        let response = match http_client::post_json(
            &url,
            &body_str,
            Some(http_client::header_from_str(&auth_header)),
        ) {
            Ok(r) if r.is_success() => r,
            _ => break,
        };

        let res_val: Value = match serde_json::from_str(response.body.trim()) {
            Ok(v) => v,
            Err(_) => break,
        };

        let choice = &res_val["choices"][0];
        let message = &choice["message"];

        if message.is_null() {
            break;
        }

        messages.push(message.clone());

        if let Some(tool_calls) = message["tool_calls"].as_array() {
            if tool_calls.is_empty() {
                if let Some(content) = message["content"].as_str() {
                    save_output(output_var, content);
                    return true;
                }
                break;
            }

            for tool_call in tool_calls {
                let call_id = tool_call["id"].as_str().unwrap_or("call_0");
                let fn_name = tool_call["function"]["name"].as_str().unwrap_or("");
                let fn_args_str = tool_call["function"]["arguments"].as_str().unwrap_or("{}");
                let fn_args: Value = serde_json::from_str(fn_args_str).unwrap_or_default();

                let result_str = execute_tool(fn_name, &fn_args);

                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result_str
                }));
            }
        } else if let Some(content) = message["content"].as_str() {
            save_output(output_var, content);
            return true;
        } else {
            break;
        }
    }

    false
}

fn save_output(var_name: &str, content: &str) {
    VARIABLES.with(|vars| {
        vars.borrow_mut().insert(var_name.to_string(), content.to_string());
    });
}

fn build_tools_schema(enabled: &[String]) -> Vec<Value> {
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

fn execute_tool(name: &str, args: &Value) -> String {
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
                let key = if ch == ' ' { Key::Space } else if ch == '\n' { Key::Return } else { Key::KeyA };
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
