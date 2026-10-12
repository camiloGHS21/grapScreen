//! Embedded scripting engines for the `Code` node.
//!
//! The goal is that a workflow's user code runs **inside the Rust binary**: no
//! `node`, no `python`, no temp files, no subprocess. JavaScript is evaluated
//! with Boa (a pure-Rust engine) behind [`js_engine::run_js`].
//!
//! This layer is deliberately runtime-only: it receives plain `serde_json`
//! values (items, node outputs, variables) and returns plain values, so the
//! application layer never touches engine types.

pub mod js_engine;
pub mod js_prelude;
pub mod js_shims;

pub use js_engine::{run_js, ScriptOutcome};
