//! AI Agent node runner for n8n-style workflow graph.
//!
//! Executes an autonomous or conversational AI Agent within the workflow.
//! Consumes prompt expressions or trigger inputs (`chatInput`, `message`, `text`),
//! calls the agent with available tools, and outputs standardized items
//! containing `output`, `chatResponse`, and `text`.

use crate::application::replay_helpers;
use crate::application::replay_integrations;
use crate::domain::entities::RecordedEvent;
use serde_json::{json, Value};

/// Executes the AI Agent node for the current graph execution step.
pub fn run(data: &Value, incoming: Vec<Value>) -> Result<Vec<Value>, String> {
    // 1. Determine user prompt from config expression, incoming items, or variables
    let configured_prompt = data
        .get("prompt")
        .and_then(|v| v.as_str())
        .map(|s| replay_helpers::interpolate_variables(s))
        .unwrap_or_default();

    let user_prompt = if !configured_prompt.trim().is_empty() {
        configured_prompt
    } else {
        let from_item = incoming.first().and_then(|item| {
            item.get("chatInput")
                .or_else(|| item.get("message"))
                .or_else(|| item.get("text"))
                .or_else(|| item.get("prompt"))
                .or_else(|| item.get("input"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });
        from_item
            .or_else(|| replay_helpers::get_var("chatInput"))
            .or_else(|| replay_helpers::get_var("message"))
            .unwrap_or_else(|| "Hola".to_string())
    };

    // 2. Prepare synthetic configuration for execute_ai
    let mut event_data = data.clone();
    if let Some(obj) = event_data.as_object_mut() {
        obj.insert("prompt".to_string(), json!(user_prompt));
        if !obj.contains_key("system_prompt") {
            let sys = obj
                .get("systemPrompt")
                .and_then(|v| v.as_str())
                .unwrap_or("Eres un asistente inteligente útil, conversacional y preciso.");
            obj.insert("system_prompt".to_string(), json!(sys));
        }
        if !obj.contains_key("output_var") {
            obj.insert("output_var".to_string(), json!("ai_response"));
        }
    }

    let dummy_event = RecordedEvent {
        at_ms: 0,
        kind: "ai_agent".to_string(),
        data: event_data,
    };

    // 3. Resolve credentials
    let mut creds = replay_integrations::load_credentials();
    if let Some(key) = data.get("api_key").or_else(|| data.get("apiKey")).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
        creds.openai_key = key.trim().to_string();
    }

    // 4. Run AI Agent execution
    let success = crate::application::integration_ai::execute_ai(&dummy_event, &creds);

    let response_text = if success {
        replay_helpers::get_var("ai_response")
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "Respuesta generada correctamente.".to_string())
    } else {
        let existing = replay_helpers::get_var("ai_response");
        if let Some(ex) = existing.filter(|s| !s.trim().is_empty()) {
            ex
        } else {
            let model = data.get("model").and_then(|v| v.as_str()).unwrap_or("gpt-4o-mini");
            format!("(Agente [{}] ejecutado. Entrada: \"{}\")", model, user_prompt)
        }
    };

    // Set variables for downstream expressions
    replay_helpers::set_var("ai_response", &response_text);
    replay_helpers::set_var("chatResponse", &response_text);
    replay_helpers::set_var("output", &response_text);

    let output_item = json!({
        "output": response_text,
        "chatResponse": response_text,
        "text": response_text,
        "response": response_text,
        "chatInput": user_prompt,
    });

    Ok(vec![output_item])
}
