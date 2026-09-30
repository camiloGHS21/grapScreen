use serde_json::Value;
use std::collections::HashMap;

/// Lifecycle and resilience options for n8n-compatible nodes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeOptions {
    pub continue_on_fail: bool,
    pub retry_on_fail: bool,
    pub max_tries: u32,
    pub wait_between_tries_ms: u64,
    pub always_output_data: bool,
    pub execute_once: bool,
}

impl Default for NodeOptions {
    fn default() -> Self {
        Self {
            continue_on_fail: false,
            retry_on_fail: false,
            max_tries: 1,
            wait_between_tries_ms: 1000,
            always_output_data: false,
            execute_once: false,
        }
    }
}

impl NodeOptions {
    /// Extracts resilience options from the node configuration or its nested options object.
    pub fn from_data(data: Option<&Value>) -> Self {
        let d = match data {
            Some(v) => v,
            None => return Self::default(),
        };

        let opts = d.get("options").and_then(|v| v.as_object());
        let continue_on_fail = d.get("continueOnFail").and_then(|v| v.as_bool())
            .or_else(|| opts.and_then(|o| o.get("continueOnFail").and_then(|v| v.as_bool())))
            .or_else(|| d.get("onError").and_then(|v| v.as_str()).map(|s| s == "continueRegularOutput" || s == "continueErrorOutput"))
            .unwrap_or(false);

        let retry_on_fail = d.get("retryOnFail").and_then(|v| v.as_bool())
            .or_else(|| opts.and_then(|o| o.get("retryOnFail").and_then(|v| v.as_bool())))
            .unwrap_or(false);

        let max_tries = d.get("maxTries").and_then(|v| v.as_u64())
            .or_else(|| opts.and_then(|o| o.get("maxTries").and_then(|v| v.as_u64())))
            .unwrap_or(1) as u32;

        let wait_between_tries_ms = d.get("waitBetweenTries").and_then(|v| v.as_u64())
            .or_else(|| opts.and_then(|o| o.get("waitBetweenTries").and_then(|v| v.as_u64())))
            .unwrap_or(1000);

        let always_output_data = d.get("alwaysOutputData").and_then(|v| v.as_bool())
            .or_else(|| opts.and_then(|o| o.get("alwaysOutputData").and_then(|v| v.as_bool())))
            .unwrap_or(false);

        let execute_once = d.get("executeOnce").and_then(|v| v.as_bool())
            .or_else(|| opts.and_then(|o| o.get("executeOnce").and_then(|v| v.as_bool())))
            .unwrap_or(false);

        Self {
            continue_on_fail,
            retry_on_fail,
            max_tries: max_tries.clamp(1, 10),
            wait_between_tries_ms: wait_between_tries_ms.min(60_000),
            always_output_data,
            execute_once,
        }
    }

    /// Formats an error into a standardized n8n continue-on-fail item payload.
    pub fn make_error_item(err: &str, item_idx: Option<usize>) -> Value {
        let mut err_obj = serde_json::Map::new();
        err_obj.insert("message".to_string(), Value::String(err.to_string()));
        if let Some(idx) = item_idx {
            err_obj.insert("itemIndex".to_string(), Value::Number(idx.into()));
        }
        serde_json::json!({
            "json": {
                "error": Value::Object(err_obj)
            }
        })
    }

    /// Ensures that if alwaysOutputData is true and items are empty, at least one empty item is emitted.
    pub fn ensure_output_items(&self, items: &mut Vec<Value>) {
        if self.always_output_data && items.is_empty() {
            items.push(serde_json::json!({ "json": {} }));
        }
    }

    /// Executes an operation with retry logic if retry_on_fail is enabled.
    pub fn execute_with_resilience<F, T>(
        &self,
        mut op: F,
        sleep_fn: impl Fn(u64) -> Result<(), String>,
    ) -> Result<T, String>
    where
        F: FnMut() -> Result<T, String>,
    {
        let tries = if self.retry_on_fail { self.max_tries } else { 1 };
        let mut last_err = String::new();
        for attempt in 1..=tries {
            match op() {
                Ok(val) => return Ok(val),
                Err(err) => {
                    if err == "__stopped__" {
                        return Err(err);
                    }
                    last_err = err;
                    if attempt < tries && self.wait_between_tries_ms > 0 {
                        sleep_fn(self.wait_between_tries_ms)?;
                    }
                }
            }
        }
        Err(last_err)
    }
}

/// Builds the standardized input JSON object for audit and execution logging.
pub fn build_input_json(
    vars: &HashMap<String, String>,
    items: &[Value],
    config: Option<&Value>,
) -> Value {
    let mut input_map = serde_json::Map::new();
    input_map.insert("variables".to_string(), serde_json::to_value(vars).unwrap_or(Value::Null));
    if !items.is_empty() {
        input_map.insert("items".to_string(), serde_json::to_value(items).unwrap_or(Value::Null));
    }
    if let Some(cfg) = config {
        input_map.insert("config".to_string(), cfg.clone());
    }
    Value::Object(input_map)
}

/// Builds the standardized output JSON object for execution logging.
pub fn build_output_json(
    curr_vars: &HashMap<String, String>,
    prev_vars: &HashMap<String, String>,
    curr_items: &[Value],
    is_continued: bool,
) -> Value {
    let mut out_map = serde_json::Map::new();
    let mut diff_vars = HashMap::new();
    for (k, v) in curr_vars {
        if prev_vars.get(k) != Some(v) {
            diff_vars.insert(k.clone(), v.clone());
        }
    }
    if !diff_vars.is_empty() {
        out_map.insert("variables_updated".to_string(), serde_json::to_value(diff_vars).unwrap_or(Value::Null));
    }
    if !curr_items.is_empty() {
        out_map.insert("items".to_string(), serde_json::to_value(curr_items).unwrap_or(Value::Null));
        out_map.insert("items_count".to_string(), Value::Number(curr_items.len().into()));
    }
    if is_continued {
        out_map.insert("continue_on_fail".to_string(), Value::Bool(true));
    }
    if out_map.is_empty() {
        serde_json::json!({ "executed": true, "total_vars": curr_vars.len() })
    } else {
        Value::Object(out_map)
    }
}
