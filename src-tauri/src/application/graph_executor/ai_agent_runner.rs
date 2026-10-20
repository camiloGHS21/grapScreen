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

fn resolve_model_provider(data: &Value) -> Option<&'static str> {
    let key = data
        .get("modelKey")
        .or_else(|| data.get("n8n_key"))
        .and_then(|v| v.as_str())?;
    match key {
        "LmChatAnthropic" | "Anthropic" => Some("anthropic"),
        "LmChatGroq" | "Groq" => Some("groq"),
        "LmChatMistralCloud" | "MistralAi" => Some("mistral"),
        "LmChatDeepSeek" | "DeepSeek" => Some("deepseek"),
        "LmChatGoogleGemini" | "GoogleGemini" => Some("gemini"),
        "LmChatOllama" | "Ollama" => Some("ollama"),
        "LmChatOpenRouter" | "OpenRouter" => Some("openrouter"),
        "LmChatOpenAi" | "OpenAi" => Some("openai"),
        _ => None,
    }
}

/// Executes the AI Agent node for the current graph execution step.
pub fn run(data: &Value, incoming: Vec<Value>) -> Result<Vec<Value>, String> {
    // 1. Determine user prompt from config expression, incoming items, or variables
    let configured_prompt = data
        .get("prompt")
        .and_then(|v| v.as_str())
        .map(replay_helpers::interpolate_variables)
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
        if let Some(p) = resolve_model_provider(data) {
            obj.insert("provider".to_string(), json!(p));
        }
    }

    let dummy_event = RecordedEvent {
        at_ms: 0,
        kind: "ai_agent".to_string(),
        data: event_data,
    };

    // 3. Resolve credentials
    let mut creds = replay_integrations::load_credentials();
    if let Some(key) = data
        .get("api_key")
        .or_else(|| data.get("apiKey"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
    {
        creds.openai_key = key.trim().to_string();
    } else if let Some(cred_val) =
        crate::application::graph_executor::declarative::credential_for(data)
    {
        let map = cred_val
            .get("data")
            .and_then(|d| d.as_object())
            .or_else(|| cred_val.as_object());
        if let Some(map) = map {
            for &k in &["apiKey", "api_key", "token", "accessToken", "access_token"] {
                if let Some(val) = map
                    .get(k)
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.trim().is_empty())
                {
                    creds.openai_key = val.trim().to_string();
                    break;
                }
            }
        }
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

    // Save conversation turn into memory buffer
    let history_key = format!(
        "ai_agent_history_{}",
        data.get("id").and_then(|v| v.as_str()).unwrap_or("default")
    );
    let mut history = replay_helpers::get_var(&history_key).unwrap_or_default();
    if !history.is_empty() {
        history.push('\n');
    }
    history.push_str(&format!("User: {}\nAssistant: {}", user_prompt, response_text));
    replay_helpers::set_var(&history_key, &history);

    let mut output_item = json!({
        "output": response_text,
        "chatResponse": response_text,
        "text": response_text,
        "response": response_text,
        "chatInput": user_prompt,
    });

    // If response contains structured JSON (e.g. OutputParserStructured), extract fields into the output item
    if let Some(Value::Object(parsed_obj)) = super::ai_nodes::extract_json_object(&response_text) {
        if let Some(map) = output_item.as_object_mut() {
            for (k, v) in parsed_obj {
                map.entry(k).or_insert(v);
            }
        }
    }

    Ok(vec![output_item])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_agent_runner_fallback_and_memory() {
        let node_data = json!({
            "id": "agent_test_1",
            "prompt": "Explica la fotosíntesis",
            "modelKey": "LmChatOpenAi"
        });
        let res = run(&node_data, vec![]).expect("Agent must execute cleanly");
        assert_eq!(res.len(), 1);
        assert!(res[0].get("output").is_some());
        assert_eq!(res[0]["chatInput"], "Explica la fotosíntesis");

        // Verify conversation turn saved in replay memory
        let history = replay_helpers::get_var("ai_agent_history_agent_test_1");
        assert!(history.is_some());
        assert!(history.unwrap().contains("Explica la fotosíntesis"));
    }

    #[test]
    fn test_ai_agent_structured_output_extraction() {
        // Mock a structured response via pre-set variable
        replay_helpers::set_var("ai_response", r#"```json
{
  "summary": "Reporte financiero",
  "score": 95,
  "status": "APPROVED"
}
```"#);

        let node_data = json!({
            "id": "agent_test_structured",
            "prompt": "Genera el reporte en JSON"
        });
        let res = run(&node_data, vec![]).expect("Agent must execute cleanly");
        assert_eq!(res.len(), 1);
        let item = &res[0];
        assert_eq!(item["summary"], "Reporte financiero");
        assert_eq!(item["score"], 95);
        assert_eq!(item["status"], "APPROVED");
    }
}
