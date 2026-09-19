//! Execution tests for the graph engine.
//!
//! These run the **real** engine — `GraphEngine::run` → `walk` → `exec_node` →
//! runner — over a connected graph, and assert on the *result*: which branches
//! were taken, what items each node published, how many times a node ran.
//!
//! The alternative, which these replace, is calling a runner directly. That
//! proves the runner works; it does not prove the engine ever reaches it, and
//! every interesting failure in this file is an engine-level one: a port that is
//! wired to the wrong branch, a fan-out that does not happen, an error handler
//! that never fires.
//!
//! `walk_order.rs`     — the walker: fan-out, ports, visited, disabled, stop.
//! `control_flow.rs`   — condition, switch, loop, split_batches, error_handler.
//! `routing.rs`        — per-kind dispatch and the catch-all.
//! `ledger.rs`         — what is tested, what is declared untestable, and why.

mod control_flow;
mod ledger;
mod routing;
mod walk_order;
