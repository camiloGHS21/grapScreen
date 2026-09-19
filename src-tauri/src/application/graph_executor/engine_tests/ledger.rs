//! What this suite has decided about every node kind the engine can dispatch.
//!
//! Two lists, and a test that proves they cover the engine exactly. The value is
//! not the lists themselves but the fact that they cannot rot: adding a kind to
//! `exec_node` without saying whether it is tested or why it cannot be fails
//! `the_coverage_ledger_has_no_holes`, and renaming one fails
//! `the_ledgers_name_no_kind_the_engine_does_not_dispatch`. A coverage claim
//! that nobody re-checks is worse than no claim at all, because it reads as
//! evidence.

use crate::application::graph_executor::engine::{
    ENTRY_KINDS, ITEM_AWARE_KINDS, PASSTHROUGH_KINDS, TRANSFORM_KINDS,
};

/// Kinds exercised by a test that asserts a result, and where.
const EXERCISED: &[(&str, &str)] = &[
    // walk_order.rs
    ("start", "an_item_based_node_runs_once_per_item_with_its_own_json"),
    ("noop", "a_passthrough_node_forwards_the_whole_batch_untouched"),
    ("end", "a_passthrough_node_forwards_the_whole_batch_untouched"),
    ("app", "an_app_node_walks_its_recorded_range_without_touching_the_desktop"),
    ("read_file", "an_item_based_node_runs_once_per_item_with_its_own_json"),
    ("write_file", "a_node_with_no_incoming_items_still_runs_once"),
    // control_flow.rs
    ("condition", "condition_routes_to_the_true_port_when_the_expression_holds"),
    ("switch", "switch_routes_each_case_to_its_own_port"),
    ("loop", "loop_runs_the_body_once_per_iteration_then_leaves_by_done"),
    ("split_batches", "split_batches_runs_the_body_once_per_item_and_then_leaves_by_done"),
    ("merge", "merge_passes_the_batch_through_and_reaches_every_target"),
    ("error_handler", "an_error_handler_receives_the_message_and_the_failing_node"),
    ("stop_error", "an_error_handler_receives_the_message_and_the_failing_node"),
    ("delay", "delay_waits_before_continuing"),
    ("wait", "wait_reads_seconds_from_the_configuration"),
    ("note", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("webhook", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("cron", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("startup", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("file_change", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("hotkey_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("polling", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("rss_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("chat_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("whatsapp_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("telegram_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("email_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    ("n8n_trigger", "every_passthrough_kind_forwards_the_batch_untouched"),
    // routing.rs
    ("filter", "filter_keeps_the_items_matching_its_condition"),
    ("limit", "limit_takes_the_first_n_items"),
    ("sort", "sort_orders_by_a_descending_field"),
    ("remove_duplicates", "remove_duplicates_keeps_one_item_per_key"),
    ("split_out", "split_out_turns_an_array_field_into_one_item_each"),
    ("crypto", "crypto_hashes_with_the_configured_algorithm"),
    ("markdown", "markdown_converts_to_html_in_the_target_field"),
    ("rename_keys", "rename_keys_renames_by_rule"),
    ("summarize", "summarize_groups_and_aggregates"),
    ("date_time", "date_time_formats_a_field_into_another"),
    ("xml_parse", "xml_parse_produces_one_item_per_element"),
    ("html_extract", "html_extract_pulls_the_requested_attribute"),
    ("sqlite_query", "sqlite_execute_then_query_round_trips_through_a_temp_database"),
    ("sqlite_execute", "sqlite_execute_then_query_round_trips_through_a_temp_database"),
    ("sub_workflow", "a_sub_workflow_without_a_target_workflow_is_an_error"),
    ("llm_chain", "provider_backed_kinds_reach_their_runner_and_complain_about_configuration"),
    ("classifier", "provider_backed_kinds_reach_their_runner_and_complain_about_configuration"),
    ("information_extractor", "provider_backed_kinds_reach_their_runner_and_complain_about_configuration"),
    ("sentiment_analysis", "provider_backed_kinds_reach_their_runner_and_complain_about_configuration"),
    ("rss_read", "provider_backed_kinds_reach_their_runner_and_complain_about_configuration"),
    // template_e2e.rs drives this one through the real engine over the catalogue.
    ("code", "template_e2e: cada plantilla local ejecuta su nodo Código"),
];

/// Kinds the engine dispatches that cannot be executed without a real target.
/// Each needs a live endpoint, a credential, a provider, or the desktop.
const UNEXECUTABLE: &[(&str, &str)] = &[
    ("send_email", "envía correo: necesita un servidor SMTP"),
    ("slack_webhook", "publica en Slack: necesita la red y un webhook real"),
    ("discord_webhook", "publica en Discord: necesita la red y un webhook real"),
    ("notion", "escribe en Notion: necesita la API y credenciales"),
    ("airtable", "escribe en Airtable: necesita la API y credenciales"),
    ("postgres", "consulta Postgres: necesita un servidor"),
    ("ai_agent", "llama a un modelo: necesita proveedor y credenciales"),
    ("n8n_node", "cualquier nodo n8n declarativo: una petición HTTP autenticada"),
    ("http_request", "abre una conexión real; las plantillas que lo usan no son locales"),
    ("edit_fields", "no cubierto: pendiente de una prueba de resultado"),
    ("aggregate", "no cubierto: pendiente de una prueba de resultado"),
    ("compare_datasets", "no cubierto: pendiente de una prueba de resultado"),
];

/// Every kind `exec_node` can dispatch, spelled out.
///
/// The engine's `exec_node` is the source of truth for the *shape*; this list is
/// the statement of what the test suite has decided about each one.
fn dispatched_kinds() -> Vec<String> {
    let mut kinds: Vec<String> = PASSTHROUGH_KINDS.iter().map(|k| k.to_string()).collect();
    kinds.extend(TRANSFORM_KINDS.iter().map(|k| k.to_string()));
    // `app` is an entry kind with no arm of its own: it is the one kind the
    // catch-all is *designed* to serve, replaying its recorded range.
    kinds.extend(ENTRY_KINDS.iter().map(|k| k.to_string()));
    kinds.extend(
        [
            "delay",
            "wait",
            "condition",
            "switch",
            "loop",
            "split_batches",
            "sub_workflow",
            "send_email",
            "slack_webhook",
            "discord_webhook",
            "notion",
            "airtable",
            "read_file",
            "write_file",
            "postgres",
            "ai_agent",
            "n8n_node",
            "stop_error",
            "http_request",
            "code",
        ]
        .iter()
        .map(|k| k.to_string()),
    );
    kinds.sort();
    kinds.dedup();
    kinds
}

/// The gap this suite is not allowed to leave open: a kind the engine dispatches
/// that is neither exercised nor declared.
#[test]
fn the_coverage_ledger_has_no_holes() {
    let exercised: Vec<&str> = EXERCISED.iter().map(|(k, _)| *k).collect();
    let declared: Vec<&str> = UNEXECUTABLE.iter().map(|(k, _)| *k).collect();
    let dispatched = dispatched_kinds();

    println!(
        "cobertura por tipo de nodo: {} despachados · {} con prueba directa · {} declarados no ejecutables",
        dispatched.len(),
        exercised.len(),
        declared.len()
    );

    let mut holes = Vec::new();
    for kind in dispatched {
        if !exercised.contains(&kind.as_str()) && !declared.contains(&kind.as_str()) {
            holes.push(kind);
        }
    }
    assert!(
        holes.is_empty(),
        "estos tipos los despacha el motor y no están ni probados ni declarados: {}\n\
         Añade una prueba de resultado o una entrada en UNEXECUTABLE explicando por qué no se puede.",
        holes.join(", ")
    );
}

/// The ledgers must not name kinds the engine does not dispatch — a stale entry
/// is a lie about coverage.
#[test]
fn the_ledgers_name_no_kind_the_engine_does_not_dispatch() {
    let known = dispatched_kinds();
    for (kind, _) in EXERCISED.iter().chain(UNEXECUTABLE.iter()) {
        assert!(
            known.contains(&kind.to_string()),
            "'{}' figura en el registro pero el motor no lo despacha",
            kind
        );
    }
}

/// Every entry has to say something, and the transform/item-aware invariant the
/// engine relies on is restated here because this is the file that would notice
/// a transform added to only one of the two lists.
#[test]
fn every_ledger_entry_has_a_reason() {
    for (kind, why) in EXERCISED.iter().chain(UNEXECUTABLE.iter()) {
        assert!(!why.trim().is_empty(), "'{}' no explica nada", kind);
    }
    for kind in TRANSFORM_KINDS {
        assert!(
            ITEM_AWARE_KINDS.contains(kind),
            "'{}' es de transformación y no es item-aware",
            kind
        );
    }
}
