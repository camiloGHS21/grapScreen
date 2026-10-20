//! Native router for n8n core, transform, flow and AI sub-nodes.
//!
//! Routes n8n-style node keys directly to Rust native implementations
//! (in-process transforms, Boa JS, RustPython, AI agent runner, etc.).

use serde_json::Value;

/// Checks if a lowercase n8n key matches a core, transform, flow, or AI sub-node,
/// and executes it natively in pure Rust.
pub fn run_n8n_core_or_transform(
    key_lower: &str,
    data: &Value,
    incoming: Vec<Value>,
) -> Option<Result<Vec<Value>, String>> {
    match key_lower {
        "set" | "itemlists" | "edit_fields" => {
            Some(super::transform::run_edit_fields(data, incoming))
        }
        "filter" => Some(super::transform::run_filter(data, incoming)),
        "sort" => Some(super::transform::run_sort(data, incoming)),
        "limit" => Some(super::transform::run_limit(data, incoming)),
        "aggregate" => Some(super::transform::run_aggregate(data, incoming)),
        "datetime" | "date_time" => Some(super::transform::run_date_time(data, incoming)),
        "removeduplicates" | "remove_duplicates" => {
            Some(super::transform::run_remove_duplicates(data, incoming))
        }
        "comparedatasets" | "compare_datasets" => {
            Some(super::transform::run_compare_datasets(data, incoming))
        }
        "splitout" | "split_out" => Some(super::core_nodes::run_split_out(data, incoming)),
        "summarize" => Some(super::core_nodes::run_summarize(data, incoming)),
        "renamekeys" | "rename_keys" => Some(super::core_nodes::run_rename_keys(data, incoming)),
        "markdown" => Some(super::core_nodes::run_markdown(data, incoming)),
        "crypto" => Some(super::core_nodes::run_crypto(data, incoming)),
        "xml" => Some(super::parse_nodes::run_xml_parse(data, incoming)),
        "htmlextract" | "html" => Some(super::parse_nodes::run_html_extract(data, incoming)),
        "noop" => Some(Ok(incoming)),
        "wait" => {
            let ms = data.get("seconds").and_then(|v| v.as_f64()).map(|s| (s * 1000.0) as u64).unwrap_or(1000).min(600_000);
            std::thread::sleep(std::time::Duration::from_millis(ms));
            Some(Ok(incoming))
        }
        "stopanderror" => {
            let msg = data
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Detenido por nodo Stop & Error")
                .to_string();
            Some(Err(msg))
        }
        // AI model and chain sub-nodes execute through AI agent runner
        k if k.starts_with("lmchat") || k.starts_with("chain") || k.starts_with("textclassifier")
            || k.starts_with("sentimentanalysis") || k.starts_with("informationextractor") => {
            Some(super::ai_agent_runner::run(data, incoming))
        }
        // Memory, tool, parser sub-nodes passed as steps pass items through
        k if k.starts_with("memory") || k.starts_with("outputparser") || k.starts_with("tool")
            || k.starts_with("agenttool") || k.starts_with("mcpclient") => {
            Some(Ok(incoming))
        }
        _ => None,
    }
}
