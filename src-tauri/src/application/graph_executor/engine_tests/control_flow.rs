//! Branching, iteration and error routing, driven through the real engine.
//!
//! Each test asserts *which port the flow left by* and *what the downstream node
//! received*, rather than that the run returned `Ok`. A branch node that routes
//! everything to the same port, or a loop that never iterates, still returns
//! `Ok`.

use crate::application::graph_executor::testkit::{cfg, payloads, Graph, Harness, Runner};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("grapscreen_engine_tests").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("directorio temporal");
    dir
}

fn read(path: &PathBuf) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

/// A `write_file` node that leaves a mark only if it runs.
fn mark_node(id: &str, dir: &PathBuf) -> (String, String, serde_json::Value) {
    let file = dir.join(format!("{}.txt", id));
    (
        id.to_string(),
        "write_file".to_string(),
        json!({ "file_path": file.to_string_lossy(), "append": true, "content": "x" }),
    )
}

fn condition(data: serde_json::Value) -> serde_json::Value {
    data
}

// ── condition ────────────────────────────────────────────────────────────

/// The two ports are not interchangeable: a true condition must leave by `true`
/// and a false one by `false`.
///
/// This is the guard for the literal `"true"`/`"false"` pair in `exec_node`.
/// Swapping them inverts every branch in every saved flow while the run still
/// reports success, so nothing but an assertion on the taken branch can catch it.
#[test]
fn condition_routes_to_the_true_port_when_the_expression_holds() {
    let dir = scratch("condition_true");
    let (_, _, a) = mark_node("yes", &dir);
    let (_, _, b) = mark_node("no", &dir);

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "gate")
        .node(
            "gate",
            "condition",
            condition(json!({ "condition_type": "expression", "expression": "2 > 1" })),
        )
        .connect("gate", "true", "yes")
        .connect("gate", "false", "no")
        .node("yes", "write_file", a)
        .node("no", "write_file", b);

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("yes"), "la condición verdadera debe salir por el puerto 'true'");
    assert!(run.skipped("no"), "el puerto 'false' no debe recorrerse");
    assert!(dir.join("yes.txt").exists());
    assert!(!dir.join("no.txt").exists());
}

#[test]
fn condition_routes_to_the_false_port_when_the_expression_fails() {
    let dir = scratch("condition_false");
    let (_, _, a) = mark_node("yes", &dir);
    let (_, _, b) = mark_node("no", &dir);

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "gate")
        .node(
            "gate",
            "condition",
            condition(json!({ "condition_type": "expression", "expression": "2 < 1" })),
        )
        .connect("gate", "true", "yes")
        .connect("gate", "false", "no")
        .node("yes", "write_file", a)
        .node("no", "write_file", b);

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("no"), "la condición falsa debe salir por el puerto 'false'");
    assert!(run.skipped("yes"));
    assert!(!dir.join("yes.txt").exists() && dir.join("no.txt").exists());
}

/// The expression sees the item in scope, which is what makes a condition on
/// `$json` useful at all.
#[test]
fn condition_expressions_see_the_incoming_item() {
    let dir = scratch("condition_item");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "gate")
        .node(
            "gate",
            "condition",
            json!({ "condition_type": "expression", "expression": "{{ $json.total }} > 100" }),
        )
        .connect("gate", "true", "grande")
        .connect("gate", "false", "pequeno")
        .node("grande", "write_file", json!({ "file_path": dir.join("g.txt").to_string_lossy(), "content": "g" }))
        .node("pequeno", "write_file", json!({ "file_path": dir.join("p.txt").to_string_lossy(), "content": "p" }));

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![json!({ "total": 250 })])
        .run();

    assert!(run.ran("grande") && run.skipped("pequeno"));
    assert_eq!(read(&dir.join("g.txt")), "g");
}

// ── switch ───────────────────────────────────────────────────────────────

/// Every case port the editor exposes must be reachable, not just the first.
///
/// `eval_switch` walks at most three cases. That is not an arbitrary cap: the
/// node exposes exactly `case0`, `case1`, `case2` and `default` — see
/// `the_engine_honours_exactly_the_switch_ports_the_editor_draws` below, which
/// pins the two together. Dropping the bound, or raising it without adding a
/// port, silently sends every value to `default`.
#[test]
fn switch_routes_each_case_to_its_own_port() {
    for (index, value) in [(0, "alpha"), (1, "beta"), (2, "gamma")] {
        let dir = scratch(&format!("switch_case{}", index));

        let graph = Graph::new()
            .node("start", "start", cfg())
            .connect("start", "output", "sw")
            .node(
                "sw",
                "switch",
                json!({
                    "field": "estado",
                    "cases": [{ "value": "alpha" }, { "value": "beta" }, { "value": "gamma" }],
                }),
            )
            .connect("sw", &format!("case{}", index), "hit")
            .connect("sw", "default", "miss")
            .node("hit", "write_file", json!({ "file_path": dir.join("hit.txt").to_string_lossy(), "content": "hit" }))
            .node("miss", "write_file", json!({ "file_path": dir.join("miss.txt").to_string_lossy(), "content": "miss" }));

        let run = Runner::new(Harness::inert(), graph).with_vars(&[("estado", value)]).run();

        assert!(
            run.ran("hit"),
            "el valor '{}' debe salir por el puerto case{}",
            value,
            index
        );
        assert!(run.skipped("miss"), "'{}' no debe caer en default", value);
        assert!(!dir.join("miss.txt").exists());
    }
}

/// A value matching no case leaves by `default`.
#[test]
fn switch_falls_back_to_the_default_port() {
    let dir = scratch("switch_default");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "sw")
        .node(
            "sw",
            "switch",
            json!({ "field": "estado", "cases": [{ "value": "alpha" }, { "value": "beta" }] }),
        )
        .connect("sw", "case0", "hit")
        .connect("sw", "default", "miss")
        .node("hit", "write_file", json!({ "file_path": dir.join("hit.txt").to_string_lossy(), "content": "hit" }))
        .node("miss", "write_file", json!({ "file_path": dir.join("miss.txt").to_string_lossy(), "content": "miss" }));

    let run = Runner::new(Harness::inert(), graph).with_vars(&[("estado", "zeta")]).run();

    assert!(run.ran("miss") && run.skipped("hit"));
    assert_eq!(read(&dir.join("miss.txt")), "miss");
}

/// The engine's case cap and the editor's port list are the same number.
///
/// They are declared in two languages and nothing else ties them together: the
/// engine bounds `cases` in `eval_switch`, the canvas draws the ports from
/// `nodePorts.ts`. If someone adds a `case3` port without raising the bound, the
/// new port is dead — the value always falls through to `default`. If someone
/// raises the bound without adding the port, the extra case does the same. This
/// reads the TypeScript file so the two cannot drift apart unnoticed.
#[test]
fn the_engine_honours_exactly_the_switch_ports_the_editor_draws() {
    const PORTS_TS: &str = include_str!("../../../../../src/features/flowchart/utils/nodePorts.ts");

    // The switch arm of `getNodePorts`, up to its `default` port.
    let switch_arm = PORTS_TS
        .split("case \"switch\":")
        .nth(1)
        .and_then(|rest| rest.split("case \"merge\":").next())
        .expect("nodePorts.ts debe seguir declarando el nodo switch");

    let declared: Vec<String> = (0..8)
        .map(|i| format!("id: \"case{}\"", i))
        .filter(|needle| switch_arm.contains(needle))
        .collect();

    assert_eq!(
        declared.len(),
        3,
        "el editor declara {} puertos de caso ({}); el motor honra 3",
        declared.len(),
        declared.join(", ")
    );
    for i in 0..3 {
        assert!(
            switch_arm.contains(&format!("id: \"case{}\"", i)),
            "falta el puerto case{} en nodePorts.ts",
            i
        );
    }
    assert!(
        switch_arm.contains("id: \"default\""),
        "el nodo switch debe seguir teniendo puerto default"
    );
}

// ── loop ─────────────────────────────────────────────────────────────────

/// The loop body runs once per iteration with `loop.index` counting from 0, and
/// the flow then leaves by `done`.
///
/// The body appends `loop.index` to a file, so the file is an exact record of how
/// many times the body ran and with what index. Asserting `loop.index` starts at
/// 0 — not 1 — matters: every template that indexes an array with it depends on
/// the zero base.
#[test]
fn loop_runs_the_body_once_per_iteration_then_leaves_by_done() {
    let dir = scratch("loop_body");
    let trace = dir.join("trace.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "rep")
        .node("rep", "loop", json!({ "iterations": "3" }))
        .connect("rep", "body", "body")
        .connect("rep", "done", "after")
        .node(
            "body",
            "write_file",
            json!({
                "file_path": trace.to_string_lossy(),
                "append": true,
                "content": "{{ loop.index }},",
            }),
        )
        .node("after", "write_file", json!({ "file_path": dir.join("after.txt").to_string_lossy(), "content": "fin" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(read(&trace), "0,1,2,", "loop.index debe ir de 0 a N-1");
    assert!(run.ran("after"), "el flujo debe continuar por el puerto 'done'");
    assert_eq!(read(&dir.join("after.txt")), "fin");
}

/// A loop with no configured count still runs its body once rather than zero
/// times — a body that never runs would make the node a silent no-op.
#[test]
fn loop_without_a_configured_count_runs_once() {
    let dir = scratch("loop_default");
    let trace = dir.join("trace.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "rep")
        .node("rep", "loop", cfg())
        .connect("rep", "body", "body")
        .connect("rep", "done", "after")
        .node(
            "body",
            "write_file",
            json!({ "file_path": trace.to_string_lossy(), "append": true, "content": "{{ loop.index }}," }),
        )
        .node("after", "end", cfg());

    let run = Runner::new(Harness::inert(), graph).run();

    assert_eq!(read(&trace), "0,");
    assert!(run.ran("after"));
}

/// `iterations` is an expression field, so a variable can drive the count.
#[test]
fn loop_iterations_accept_a_variable() {
    let dir = scratch("loop_var");
    let trace = dir.join("trace.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "rep")
        .node("rep", "loop", json!({ "iterations": "{{ veces }}" }))
        .connect("rep", "body", "body")
        .node(
            "body",
            "write_file",
            json!({ "file_path": trace.to_string_lossy(), "append": true, "content": "x" }),
        );

    let run = Runner::new(Harness::inert(), graph).with_vars(&[("veces", "4")]).run();

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(read(&trace), "xxxx");
}

// ── split_batches ────────────────────────────────────────────────────────

/// The body sees one item at a time, in order, and the flow leaves by `done`
/// once every item has been through.
#[test]
fn split_batches_runs_the_body_once_per_item_and_then_leaves_by_done() {
    let dir = scratch("split_batches");
    let trace = dir.join("trace.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "batcher")
        .node("batcher", "split_batches", cfg())
        .connect("batcher", "body", "body")
        .connect("batcher", "done", "after")
        .node(
            "body",
            "write_file",
            json!({
                "file_path": trace.to_string_lossy(),
                "append": true,
                "content": "{{ $json.n }};",
            }),
        )
        .node("after", "write_file", json!({ "file_path": dir.join("after.txt").to_string_lossy(), "content": "fin" }));

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![json!({"n": 1}), json!({"n": 2}), json!({"n": 3})])
        .run();

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(read(&trace), "1;2;3;", "cada item debe pasar una vez, en orden");
    assert!(run.ran("after"), "el flujo debe continuar por 'done'");
    assert_eq!(read(&dir.join("after.txt")), "fin");
}

// ── merge and error_handler are pass-throughs ────────────────────────────

/// `merge` forwards to every outgoing edge, on any port, and does not reshape
/// the item list. It is a join point, not a combiner.
#[test]
fn merge_passes_the_batch_through_and_reaches_every_target() {
    let dir = scratch("merge");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "join")
        .node("join", "merge", cfg())
        .connect("join", "output", "a")
        .connect("join", "output", "b")
        .node("a", "write_file", json!({ "file_path": dir.join("a.txt").to_string_lossy(), "content": "a" }))
        .node("b", "write_file", json!({ "file_path": dir.join("b.txt").to_string_lossy(), "content": "b" }));

    let items = vec![json!({"n": 1}), json!({"n": 2})];
    let run = Runner::new(Harness::inert(), graph).with_items(items.clone()).run();

    assert!(run.ran("a") && run.ran("b"));
    assert_eq!(
        payloads(&run.output_items("join")),
        items,
        "merge no debe tocar los items"
    );
}

/// An error handler receives the failure as `error.message` and the failing node
/// as `error.node`, and — because it completed — the run is then reported as
/// **successful**.
///
/// Both halves are the contract. This is the guard for the
/// `error_handlers.first()` lookup in `walk`: make it always return `None` and
/// the handler never runs, the markers below are never written, and the whole
/// error path of the product goes quiet while the flow still fails.
///
/// The success-on-handled outcome is deliberate — the handler is understood to
/// have dealt with the failure, which is what makes n8n's "Error Trigger"
/// usable. It is asserted here because it is easy to mistake for a bug and
/// "fix" into returning the error, which would report failure for a flow that
/// recovered.
#[test]
fn an_error_handler_receives_the_message_and_the_failing_node() {
    let dir = scratch("error_handler");
    let trace = dir.join("trace.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "boom")
        .node("boom", "stop_error", json!({ "message": "boom en {{ $json.id }}" }))
        .node("handler", "error_handler", cfg())
        .connect("handler", "output", "recorder")
        .node(
            "recorder",
            "write_file",
            json!({
                "file_path": trace.to_string_lossy(),
                "content": "{{ error.message }}|{{ error.node }}",
            }),
        );

    let run = Runner::new(Harness::inert(), graph).with_items(vec![json!({ "id": 7 })]).run();

    assert!(run.ran("recorder"), "el manejador de errores debe ejecutarse");
    assert_eq!(
        read(&trace),
        "boom en 7|boom",
        "el manejador debe recibir el mensaje interpolado y el nodo que falló"
    );
    assert_eq!(
        run.result,
        Ok(()),
        "un manejador que termina bien deja el fallo por resuelto"
    );
    assert_eq!(
        run.status_of("boom").as_deref(),
        Some("error"),
        "el nodo que falló debe quedar registrado como error"
    );
}

/// The handler is a better place to fail than nowhere: without one, the error
/// still surfaces, it just has no handler to route to.
#[test]
fn without_a_handler_the_error_still_surfaces() {
    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "boom")
        .node("boom", "stop_error", json!({ "message": "sin manejador" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert_eq!(run.result, Err("sin manejador".to_string()));
    assert_eq!(run.status_of("boom").as_deref(), Some("error"));
}

// ── delay / wait ─────────────────────────────────────────────────────────

/// `delay` honours its configured duration before continuing.
///
/// Asserted on the node's own reported duration rather than on a wall-clock
/// measurement of the run, so a slow machine cannot turn it into a flake.
#[test]
fn delay_waits_before_continuing() {
    let dir = scratch("delay_ms");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "pause")
        .node("pause", "delay", cfg())
        .connect("pause", "output", "after")
        .node("after", "write_file", json!({ "file_path": dir.join("a.txt").to_string_lossy(), "content": "a" }))
        .set_sleep_ms("pause", 60);

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("pause") && run.ran("after"));
    let waited = run.log_of("pause").and_then(|n| n.duration_ms).unwrap_or(0);
    assert!(waited >= 55, "delay de 60 ms duró {} ms", waited);
}

/// `wait` reads `seconds` from the node configuration when no duration was
/// recorded on the node itself.
#[test]
fn wait_reads_seconds_from_the_configuration() {
    let dir = scratch("wait_seconds");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "pause")
        .node("pause", "wait", json!({ "seconds": 0.06 }))
        .connect("pause", "output", "after")
        .node("after", "write_file", json!({ "file_path": dir.join("a.txt").to_string_lossy(), "content": "a" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("after"));
    let waited = run.log_of("pause").and_then(|n| n.duration_ms).unwrap_or(0);
    assert!(waited >= 55, "wait de 0,06 s duró {} ms", waited);
}
