//! Declarative n8n node support.
//!
//! The hand-written runners in the sibling modules stay exactly as they are.
//! This module adds a second, data-driven path so the full n8n catalogue can be
//! reached without a bespoke Rust implementation per integration:
//!
//! * [`descriptor`] — the descriptor model and the registry built from
//!   `src/data/n8n-descriptors.json`.
//! * [`auth`] — turns an n8n credential type plus vault data into headers and
//!   query parameters.
//! * [`runner`] — builds and sends the request, then maps the response onto the
//!   item list.
//!
//! A graph node reaches this path with the engine kind `n8n_node` and a
//! `n8n_key` naming the descriptor.
//!
//! The trigger daemon (`application::trigger_service`) also lives here: it arms
//! a declarative trigger by its descriptor's `triggerMode`, which is why
//! [`runner::poll_once`] and [`runner::credential_for`] are public.

pub mod auth;
pub mod descriptor;
pub mod runner;

pub use descriptor::{CredentialSpec, DescriptorRegistry, NodeDescriptor, RequestTemplate};
pub use runner::{credential_for, poll_once, PollOutcome};

/// Engine kind every declarative node shares. The specific n8n node lives in the
/// node config as `n8n_key`, which keeps 554 integrations out of the
/// `FlowNodeType` union and out of every per-kind switch in the editor.
pub const N8N_NODE_KIND: &str = "n8n_node";

/// Engine kind for declarative *trigger* nodes.
///
/// Separate from [`N8N_NODE_KIND`] because the two differ structurally, not
/// cosmetically: a trigger has no input port and is a valid flow entry point,
/// while an action has an input and is not. The editor derives ports and the
/// "first node must be a trigger" rule from the kind, so folding both into one
/// kind would make triggers unusable as the head of a flow.
pub const N8N_TRIGGER_KIND: &str = "n8n_trigger";

/// Node kinds that own their own iteration and therefore must not be fanned out
/// per item by the engine.
pub const ITEM_AWARE: &[&str] = &[N8N_NODE_KIND];

/// Descriptor lookup used by both the runner and the IPC surface.
pub fn registry() -> &'static DescriptorRegistry {
    DescriptorRegistry::global()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_registry_is_reachable_through_the_module_facade() {
        assert!(registry().len() > 500);
    }

    #[test]
    fn the_kind_name_is_stable() {
        // The frontend, the engine and the saved automations all key off this
        // literal; renaming it silently orphans every declarative node.
        assert_eq!(N8N_NODE_KIND, "n8n_node");
    }
}
