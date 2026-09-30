//! n8n-style expression engine.
//!
//! Evaluates `{{ ... }}` expressions against the current execution context,
//! preserving JSON types instead of flattening everything to strings.
//!
//! Supports:
//! - Legacy syntax: `{{ $json.field }}`, `{{ $node["Node"].json.field }}`
//! - Modern n8n v1+ syntax: `{{ $('NodeName').item.json.field }}`, `{{ $('NodeName').first().json }}`, `{{ $('NodeName').all() }}`
//! - Inline array/string manipulation: `.map()`, `.filter()`, `.join()`, `.split()`, `.slice()`, etc.
//! - Operators (+, -, *, /, %, ==, !=, >, <, >=, <=, &&, ||)

pub mod context;
pub mod parser;
pub mod operators;
pub mod modern;
pub mod methods;
pub mod lambda;
pub mod eval;

pub use context::{as_f64, current_payload, json_eq, num, num_from_f64, stringify, truthy, unwrap_item, ExprContext};
pub use parser::{contains_expression, find_close, find_top_level, last_top_level_dot, parse_trailing_call, segments, split_args, Segment, TrailingCall};
pub use operators::{add, compare, try_arithmetic, try_logical};
pub use modern::{get_path, resolve_dollar, resolve_modern_node, resolve_node_ref};
pub use methods::{apply_helper, call_function};
pub use lambda::eval_lambda;
pub use eval::{eval, eval_condition, render, render_string, resolve_token};

#[cfg(test)]
mod tests;
