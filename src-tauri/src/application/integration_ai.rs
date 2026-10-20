//! AI Agent integration runner supporting OpenAI, Anthropic, Groq, Mistral, DeepSeek, Gemini, and local LLMs.

use super::integration_ai_tools::{build_tools_schema, execute_tool};
use super::replay_integrations::Credentials;
use crate::application::http_client;
use crate::application::replay_helpers::{interpolate_variables, VARIABLES};
use crate::domain::entities::RecordedEvent;
use serde_json::{json, Value};

fn save_output(var_name: &str, content: &str) {
    VARIABLES.with(|vars| {
        vars.borrow_mut().insert(var_name.to_string(), content.to_string());
    });
}

fn execute_anthropic(
    model: &str,
    system: &str,
    prompt: &str,
    key: &str,
    output_var: &str,
) -> bool {
    let req = http_client::HttpRequest {
        method: "POST".to_string(),
        url: "https://api.anthropic.com/v1/messages".to_string(),
        headers: vec![
            ("x-api-key".to_string(), key.to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ],
        body: Some(
            json!({
                "model": if model.is_empty() { "claude-3-5-sonnet-latest" } else { model },
                "max_tokens": 2048,
                "system": system,
                "messages": [{"role": "user", "content": prompt}]
            })
            .to_string(),
        ),
        timeout_secs: 60,
    };

    let resp = match http_client::send(&req) {
        Ok(r) if r.is_success() => r,
        _ => return false,
    };

    let parsed: Value = match serde_json::from_str(resp.body.trim()) {
        Ok(v) => v,
        Err(_) => return false,
    };

    if let Some(text) = parsed["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["text"].as_str())
    {
        save_output(output_var, text);
        return true;
    }
    false
}

pub fn execute_ai(event: &RecordedEvent, creds: &Credentials) -> bool {
    let prompt = event.data["prompt"].as_str().unwrap_or("");
    let system_prompt = event.data["system_prompt"]
        .as_str()
        .unwrap_or("Eres un asistente inteligente.");
    let provider = event.data["provider"].as_str().unwrap_or("openai");
    let model = event.data["model"].as_str().unwrap_or("gpt-4o-mini");
    let output_var = event.data["output_var"].as_str().unwrap_or("ai_response");
    let max_iterations = event.data["max_iterations"].as_u64().unwrap_or(5) as usize;

    let key = event
        .data
        .get("apiKey")
        .or_else(|| event.data.get("api_key"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(if creds.openai_key.is_empty() {
            "none"
        } else {
            &creds.openai_key
        });

    let prompt_interp = interpolate_variables(prompt);
    let system_interp = interpolate_variables(system_prompt);

    if provider.eq_ignore_ascii_case("anthropic") {
        return execute_anthropic(model, &system_interp, &prompt_interp, key, output_var);
    }

    let (url, auth_header) = match provider.to_ascii_lowercase().as_str() {
        "ollama" => {
            let host = if creds.ollama_url.is_empty() {
                "http://localhost:11434"
            } else {
                &creds.ollama_url
            };
            (
                format!("{}/v1/chat/completions", host.trim_end_matches('/')),
                "Authorization: Bearer none".to_string(),
            )
        }
        "lmstudio" => (
            "http://localhost:1234/v1/chat/completions".to_string(),
            "Authorization: Bearer none".to_string(),
        ),
        "groq" => (
            "https://api.groq.com/openai/v1/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
        "mistral" => (
            "https://api.mistral.ai/v1/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
        "gemini" => (
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
        "deepseek" => (
            "https://api.deepseek.com/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
        "openrouter" => (
            "https://openrouter.ai/api/v1/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
        _ => (
            "https://api.openai.com/v1/chat/completions".to_string(),
            format!("Authorization: Bearer {}", key),
        ),
    };

    let enabled_tools: Vec<String> = event.data["enable_tools"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                "ocr_scan_text".into(),
                "rpa_click".into(),
                "rpa_type_text".into(),
                "get_workflow_var".into(),
                "set_workflow_var".into(),
            ]
        });

    let tools_schema = build_tools_schema(&enabled_tools);
    let mut messages = vec![
        json!({ "role": "system", "content": system_interp }),
        json!({ "role": "user", "content": prompt_interp }),
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
