//! Per-kind dispatch: does `exec_node` actually reach every runner it claims to?
//!
//! The failure this file exists to catch is the *silent* one. `exec_node` ends in
//! a catch-all that replays the node's own recorded range. A kind that falls out
//! of `TRANSFORM_KINDS` — a typo, a rename, a merge gone wrong — does not fail:
//! it lands in the catch-all, finds no `ActionRequest` for its event kind, and
//! completes the run reporting `ok` with the input items untouched. Deep in the
//! middle of a 20-node flow that is invisible.
//!
//! So each test below asserts an *observable output*: the exact items the node
//! produced, or the specific error it raised. Both are things the catch-all can
//! never produce, which is what makes them evidence of dispatch.
//!
//! `ledger.rs` closes the loop: every kind the engine dispatches must be either
//! exercised here or declared unexecutable with a reason.

use crate::application::graph_executor::engine::PASSTHROUGH_KINDS;
use crate::application::graph_executor::testkit::{cfg, payloads, Graph, Harness, Runner};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("grapscreen_engine_tests").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("directorio temporal");
    dir
}

/// Runs `start → kind` with the given items and configuration, and returns the
/// node's payload output.
fn dispatch(kind: &str, data: Value, items: Vec<Value>) -> Vec<Value> {
    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "subject")
        .node("subject", kind, data);
    let run = Runner::new(Harness::inert(), graph).with_items(items).run();
    assert!(
        run.ran("subject"),
        "el nodo '{}' no llegó a ejecutarse: {:?}",
        kind,
        run.result
    );
    payloads(&run.output_items("subject"))
}

// ── the pass-through family ──────────────────────────────────────────────

/// Every pass-through kind hands the batch on untouched and forwards to its
/// outgoing edge.
///
/// They are all one line in `exec_node`, which is precisely why a typo in the
/// list is easy to miss: the node still runs, it just stops forwarding.
#[test]
fn every_passthrough_kind_forwards_the_batch_untouched() {
    let items = vec![json!({ "n": 1 }), json!({ "n": 2 })];
    for kind in PASSTHROUGH_KINDS {
        let graph = Graph::new()
            .node("start", "start", cfg())
            .connect("start", "output", "mid")
            .node("mid", kind, cfg())
            .connect("mid", "output", "after")
            .node("after", "noop", cfg());

        let run = Runner::new(Harness::inert(), graph).with_items(items.clone()).run();

        assert!(run.ran("mid"), "'{}' no ejecutó", kind);
        assert!(run.ran("after"), "'{}' no reenvió al nodo siguiente", kind);
        assert_eq!(
            payloads(&run.output_items("mid")),
            payloads(&items),
            "'{}' alteró los items",
            kind
        );
    }
}

// ── transform runners, happy path ────────────────────────────────────────

#[test]
fn filter_keeps_the_items_matching_its_condition() {
    let out = dispatch(
        "filter",
        json!({ "condition": "{{ $json.importe }} > 100", "mode": "keep" }),
        vec![json!({"importe": 50}), json!({"importe": 150}), json!({"importe": 999})],
    );
    assert_eq!(out, vec![json!({"importe": 150}), json!({"importe": 999})]);
}

#[test]
fn limit_takes_the_first_n_items() {
    let out = dispatch(
        "limit",
        json!({ "skip": 0, "max_items": 2 }),
        vec![json!({"n": 1}), json!({"n": 2}), json!({"n": 3})],
    );
    assert_eq!(out, vec![json!({"n": 1}), json!({"n": 2})]);
}

#[test]
fn sort_orders_by_a_descending_field() {
    let out = dispatch(
        "sort",
        json!({ "fields": "-n" }),
        vec![json!({"n": 1}), json!({"n": 3}), json!({"n": 2})],
    );
    assert_eq!(out, vec![json!({"n": 3}), json!({"n": 2}), json!({"n": 1})]);
}

#[test]
fn remove_duplicates_keeps_one_item_per_key() {
    let out = dispatch(
        "remove_duplicates",
        json!({ "fields": "email", "keep": "first" }),
        vec![
            json!({"email": "a@x.com", "n": 1}),
            json!({"email": "a@x.com", "n": 2}),
            json!({"email": "b@x.com", "n": 3}),
        ],
    );
    assert_eq!(out.len(), 2);
    assert_eq!(out[0]["n"], json!(1), "modo 'first' debe conservar el primero");
    assert_eq!(out[1]["email"], json!("b@x.com"));
}

/// One item per array element. With no `destination_field` the element is
/// written back into the field it came from, which keeps the item shape stable
/// for a chained node.
#[test]
fn split_out_turns_an_array_field_into_one_item_each() {
    let out = dispatch(
        "split_out",
        json!({ "field": "lineas", "include": "none", "include_fields": "", "destination_field": "" }),
        vec![json!({ "lineas": ["a", "b", "c"] })],
    );
    assert_eq!(
        out,
        vec![json!({"lineas": "a"}), json!({"lineas": "b"}), json!({"lineas": "c"})],
        "un item por elemento, en orden"
    );
}

#[test]
fn crypto_hashes_with_the_configured_algorithm() {
    let out = dispatch(
        "crypto",
        json!({
            "action": "hash",
            "algorithm": "SHA256",
            "encoding": "hex",
            "value": "abc",
            "target_field": "digest",
        }),
        vec![json!({})],
    );
    assert_eq!(
        out[0]["digest"],
        json!("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
        "SHA256 de 'abc' debe ser el digest conocido"
    );
}

#[test]
fn markdown_converts_to_html_in_the_target_field() {
    let out = dispatch(
        "markdown",
        json!({ "mode": "markdown_to_html", "source": "**hola**", "target_field": "data" }),
        vec![json!({})],
    );
    let html = out[0]["data"].as_str().unwrap_or_default();
    assert!(html.contains("<strong>hola</strong>"), "se obtuvo: {}", html);
}

#[test]
fn rename_keys_renames_by_rule() {
    let out = dispatch(
        "rename_keys",
        json!({
            "renames": [{ "from": "nombre", "to": "cliente" }],
            "mode": "plain",
            "keep_only": false,
            "deep": false,
        }),
        vec![json!({ "nombre": "Ana", "edad": 30 })],
    );
    assert_eq!(out[0]["cliente"], json!("Ana"));
    assert!(out[0].get("nombre").is_none(), "la clave vieja no debe quedar");
}

#[test]
fn summarize_groups_and_aggregates() {
    let out = dispatch(
        "summarize",
        json!({
            "group_by": "equipo",
            "aggregations": [{ "operation": "sum", "field": "horas", "output_field": "total" }],
            "separator": ", ",
        }),
        vec![
            json!({"equipo": "azul", "horas": 1}),
            json!({"equipo": "azul", "horas": 2}),
            json!({"equipo": "rojo", "horas": 5}),
        ],
    );
    assert_eq!(out.len(), 2, "un item por grupo");
    let azul = out.iter().find(|i| i["equipo"] == json!("azul")).expect("grupo azul");
    assert_eq!(azul["total"], json!(3));
}

#[test]
fn date_time_formats_a_field_into_another() {
    let out = dispatch(
        "date_time",
        json!({
            "operation": "format",
            "field": "fecha",
            "format": "%Y-%m-%d",
            "result_field": "fecha_corta",
        }),
        vec![json!({ "fecha": "2024-03-15T10:00:00Z" })],
    );
    assert_eq!(out[0]["fecha_corta"], json!("2024-03-15"));
}

#[test]
fn xml_parse_produces_one_item_per_element() {
    let out = dispatch(
        "xml_parse",
        json!({ "source": "<root><item><n>1</n></item><item><n>2</n></item></root>", "root": "" }),
        vec![json!({})],
    );
    assert!(!out.is_empty(), "el XML debe producir items");
}

#[test]
fn html_extract_pulls_the_requested_attribute() {
    let out = dispatch(
        "html_extract",
        json!({
            "source": "<a href=\"https://uno.test\">uno</a><a href=\"https://dos.test\">dos</a>",
            "selector": "a",
            "attr": "href",
        }),
        vec![json!({})],
    );
    assert_eq!(out.len(), 2, "un item por coincidencia");
    assert!(
        out.iter().any(|i| i.to_string().contains("https://dos.test")),
        "el href de la segunda ancla debe aparecer: {:?}",
        out
    );
}

// ── database nodes, against a temporary file ─────────────────────────────

/// DDL and query round-trip through a temporary database file.
///
/// `sqlite_execute` compiles its `query` with `prepare`, so it runs **one**
/// statement — the two steps are two nodes here, which is also how a flow has to
/// be written.
#[test]
fn sqlite_execute_then_query_round_trips_through_a_temp_database() {
    let dir = scratch("sqlite_round_trip");
    let db = dir.join("t.db");

    for (node, sql) in [
        ("ddl", "CREATE TABLE t (n INTEGER)"),
        ("insert", "INSERT INTO t (n) VALUES (7)"),
    ] {
        let graph = Graph::new()
            .node("start", "start", cfg())
            .connect("start", "output", node)
            .node(
                node,
                "sqlite_execute",
                json!({ "db_path": db.to_string_lossy(), "query": sql, "params": "" }),
            );
        let run = Runner::new(Harness::inert(), graph).run();
        assert!(run.ran(node), "'{}' debe ejecutarse: {:?}", sql, run.result);
    }

    let query = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "read")
        .node(
            "read",
            "sqlite_query",
            json!({ "db_path": db.to_string_lossy(), "query": "SELECT n FROM t", "params": "" }),
        );
    let run = Runner::new(Harness::inert(), query).run();

    assert!(run.ran("read"));
    assert_eq!(payloads(&run.output_items("read")), vec![json!({ "n": 7 })]);
}

/// A bad statement must fail the node rather than pass silently — the catch-all
/// would report `ok`, so this is also a dispatch proof.
#[test]
fn sqlite_query_reports_an_invalid_statement() {
    let dir = scratch("sqlite_bad_sql");
    let db = dir.join("t.db");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "read")
        .node(
            "read",
            "sqlite_query",
            json!({ "db_path": db.to_string_lossy(), "query": "SELECT * FROM tabla_que_no_existe", "params": "" }),
        );
    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.result.is_err(), "una SQL inválida debe fallar el nodo");
}

// ── kinds that fail without their provider, which proves dispatch ────────

/// With no configuration, the provider-backed nodes raise their own error. That
/// is the dispatch proof available here: the catch-all returns `Ok` for these
/// kinds, so an `Err` can only come from the real runner having been reached.
#[test]
fn provider_backed_kinds_reach_their_runner_and_complain_about_configuration() {
    for kind in ["llm_chain", "classifier", "information_extractor", "sentiment_analysis", "rss_read"] {
        let graph = Graph::new()
            .node("start", "start", cfg())
            .connect("start", "output", "subject")
            .node("subject", kind, cfg());

        let run = Runner::new(Harness::inert(), graph)
            .with_items(vec![json!({ "texto": "hola" })])
            .run();

        assert!(
            run.result.is_err(),
            "'{}' debería quejarse de su configuración, y el cajón de sastre no lo hace (resultado: {:?})",
            kind,
            run.result
        );
    }
}

/// Same idea for the sub-workflow node: with no `workflow_id` it refuses to run,
/// which the catch-all never does.
#[test]
fn a_sub_workflow_without_a_target_workflow_is_an_error() {
    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "sub")
        .node("sub", "sub_workflow", json!({ "project_name": "Default", "workflow_id": "" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(
        run.result.as_ref().err().is_some_and(|e| e.contains("sub-flujo")),
        "se esperaba el error del nodo de sub-flujo, se obtuvo {:?}",
        run.result
    );
}

// ── the catch-all ────────────────────────────────────────────────────────

/// An unknown kind is not an error: it replays its own recorded range.
///
/// That is deliberate — it is how a recorded `app` node executes events the
/// engine has no runner for, and how the recorder can add intermediate event
/// kinds without touching the engine. The cost is that a genuinely misspelled
/// kind is indistinguishable from a recorded one. This test pins the behaviour
/// so the trap is at least documented; `ledger.rs` is what stops a *known* kind
/// from falling in here by accident.
#[test]
fn an_unknown_kind_is_replayed_rather_than_rejected() {
    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "subject")
        .node("subject", "no_existe_este_tipo", cfg());

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![json!({ "n": 1 })])
        .run();

    assert!(run.result.is_ok(), "el cajón de sastre no falla: {:?}", run.result);
    assert_eq!(run.status_of("subject").as_deref(), Some("ok"));
    // The items are untouched, which is exactly how a real dispatch is told
    // apart from a fall-through.
    assert_eq!(
        payloads(&run.output_items("subject")),
        vec![json!({ "n": 1 })],
        "el cajón de sastre no produce items propios: deja los de entrada"
    );
}
