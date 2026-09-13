//! Per-node credential resolution.
//!
//! Nodes reference credentials by id (`data.credential_id`) instead of carrying
//! secrets inline. Before a node runs, the engine looks that id up in the vault
//! and installs the credential data so expressions can read it as
//! `{{ $credentials.field }}`.
//!
//! The lookup is best-effort: a missing or empty id simply means "no credential"
//! and the node runs exactly as before. That keeps every existing flow working
//! and makes the feature purely additive.

use crate::application::replay_helpers;
use crate::application::vault_service::service::get_vault_service;
use serde_json::Value;

/// Resolves the credential attached to a node config and installs it as the
/// active credential for the duration of that node's execution.
///
/// Returns the previous credential so nested execution can restore it.
pub fn install_for_node(data: &Value) -> Option<Value> {
    let id = data
        .get("credential_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let resolved = match id {
        Some(id) => match get_vault_service().resolve_credential_data(id) {
            Some(data) => Some(data),
            None => {
                replay_helpers::warn_ui(
                    "credential",
                    &format!(
                        "La credencial '{}' referenciada por este nodo no existe en la bóveda. El nodo se ejecutará sin ella.",
                        id
                    ),
                );
                None
            }
        },
        None => None,
    };

    replay_helpers::set_current_credential(resolved)
}

/// Restores a previously installed credential (or clears it when `None`).
pub fn restore(previous: Option<Value>) {
    replay_helpers::set_current_credential(previous);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn install_clears_credential_when_id_absent() {
        // A previous credential must not leak into a node that has none.
        replay_helpers::set_current_credential(Some(json!({ "token": "leaked" })));
        let prev = install_for_node(&json!({ "url": "https://example.com" }));
        assert!(replay_helpers::get_current_credential().is_none());
        assert_eq!(prev, Some(json!({ "token": "leaked" })));
        replay_helpers::reset_execution_state();
    }

    #[test]
    fn install_clears_credential_for_blank_id() {
        replay_helpers::set_current_credential(Some(json!({ "token": "x" })));
        install_for_node(&json!({ "credential_id": "   " }));
        assert!(replay_helpers::get_current_credential().is_none());
        replay_helpers::reset_execution_state();
    }

    #[test]
    fn unknown_credential_id_resolves_to_none_without_panicking() {
        // No app handle in tests, so warn_ui is a no-op — the point is that a
        // bogus id degrades gracefully instead of failing the node.
        install_for_node(&json!({ "credential_id": "does-not-exist-xyz" }));
        assert!(replay_helpers::get_current_credential().is_none());
        replay_helpers::reset_execution_state();
    }

    #[test]
    fn restore_puts_previous_credential_back() {
        let prev = replay_helpers::set_current_credential(Some(json!({ "outer": 1 })));
        assert!(prev.is_none());
        install_for_node(&json!({ "url": "x" }));
        assert!(replay_helpers::get_current_credential().is_none());

        restore(Some(json!({ "outer": 1 })));
        assert_eq!(
            replay_helpers::get_current_credential(),
            Some(json!({ "outer": 1 }))
        );
        replay_helpers::reset_execution_state();
    }
}
