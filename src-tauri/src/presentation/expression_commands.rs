use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use crate::application::expressions::{render, ExprContext};

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct ExpressionContextDto {
    pub item: Option<Value>,
    pub variables: Option<HashMap<String, String>>,
    pub node_outputs: Option<HashMap<String, Vec<Value>>>,
    pub credential: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct ExpressionPreviewResponse {
    pub result: Value,
    pub is_valid: bool,
    pub error: Option<String>,
}

/// Evaluates an n8n-style expression `{{ ... }}` in Rust and returns the evaluated JSON value.
/// Executed natively via rustc without running any JavaScript engine.
#[tauri::command]
pub fn evaluate_expression_preview(
    expression: String,
    context: Option<ExpressionContextDto>,
) -> Result<ExpressionPreviewResponse, String> {
    let ctx_dto = context.unwrap_or_default();

    let single_item = ctx_dto.item.unwrap_or(Value::Null);
    let items = vec![single_item];
    let empty_vars = HashMap::new();
    let variables = ctx_dto.variables.as_ref().unwrap_or(&empty_vars);
    let empty_outputs = HashMap::new();
    let node_outputs = ctx_dto.node_outputs.as_ref().unwrap_or(&empty_outputs);

    let expr_ctx = ExprContext {
        items: &items,
        item_index: 0,
        run_index: 0,
        node_outputs,
        variables,
        execution_id: "preview",
        credentials: ctx_dto.credential.as_ref(),
    };

    let rendered = render(&expression, &expr_ctx);

    Ok(ExpressionPreviewResponse {
        result: rendered,
        is_valid: true,
        error: None,
    })
}
