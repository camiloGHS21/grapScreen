//! Walker behaviour: how the graph is traversed and how work is spread.
//!
//! Every test here drives `GraphEngine::run` over a connected graph. Nothing
//! calls `walk` or a runner directly, so the assertions cover the wiring the
//! engine actually performs.

use crate::application::graph_executor::testkit::{
    cfg, declares_untestable, event, payloads, Graph, Harness, Runner, UNTESTABLE_KINDS,
};
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

// ── per-item fan-out ─────────────────────────────────────────────────────

/// An item-based node runs once per incoming item, with `$json` pointing at
/// that item.
///
/// `read_file` is the probe because it is *not* item-aware and its `file_path`
/// is an expression: each of the three items names a different file, so the only
/// way three correctly-different contents can come out is if the node ran three
/// times with a different item in scope each time.
///
/// This is the guard for `Walker::walk_item_based`. Narrowing the condition in
/// `walk` from `incoming.len() > 1` to anything larger skips the fan-out, the
/// runner then interpolates `$json.path` once against the first item and emits
/// that same file's content three times — which the assertion below rejects.
#[test]
fn an_item_based_node_runs_once_per_item_with_its_own_json() {
    let dir = scratch("fan_out_per_item");
    let mut items = Vec::new();
    for n in 1..=3 {
        let path = dir.join(format!("item{}.txt", n));
        fs::write(&path, format!("contenido-{}", n)).expect("fichero de entrada");
        items.push(json!({ "path": path.to_string_lossy(), "n": n }));
    }

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "reader")
        .node(
            "reader",
            "read_file",
            json!({ "file_path": "{{ $json.path }}", "target_field": "content" }),
        );

    let run = Runner::new(Harness::inert(), graph).with_items(items).run();

    assert!(run.result.is_ok(), "el recorrido falló: {:?}", run.result);
    let out = payloads(&run.output_items("reader"));
    assert_eq!(out.len(), 3, "un item de entrada debe producir un item de salida");
    for (i, item) in out.iter().enumerate() {
        assert_eq!(
            item["content"],
            json!(format!("contenido-{}", i + 1)),
            "el item {} debe llevar el contenido de SU fichero, no el del primero",
            i
        );
    }
}

/// Two items is already a batch: the fan-out boundary is `> 1`, not `> 2`.
#[test]
fn two_items_are_enough_to_fan_out() {
    let dir = scratch("fan_out_two");
    let a = dir.join("a.txt");
    let b = dir.join("b.txt");
    fs::write(&a, "AAA").unwrap();
    fs::write(&b, "BBB").unwrap();

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "reader")
        .node("reader", "read_file", json!({ "file_path": "{{ $json.path }}" }));

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![
            json!({ "path": a.to_string_lossy() }),
            json!({ "path": b.to_string_lossy() }),
        ])
        .run();

    let out = payloads(&run.output_items("reader"));
    assert_eq!(out.len(), 2);
    assert_eq!(out[0]["data"], json!("AAA"));
    assert_eq!(out[1]["data"], json!("BBB"));
}

/// A node reached with no items still runs once rather than not at all — the
/// trigger-less case (cron, startup) must execute the body of the flow.
#[test]
fn a_node_with_no_incoming_items_still_runs_once() {
    let dir = scratch("fan_out_none");
    let out_file = dir.join("out.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "writer")
        .node(
            "writer",
            "write_file",
            json!({ "file_path": out_file.to_string_lossy(), "content": "sin items" }),
        );

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("writer"));
    assert_eq!(read(&out_file), "sin items");
}

/// A passthrough node hands every incoming item on untouched — it is item-aware
/// precisely so that it is *not* fanned out and cannot reshape the batch.
#[test]
fn a_passthrough_node_forwards_the_whole_batch_untouched() {
    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "mid")
        .node("mid", "noop", cfg())
        .connect("mid", "output", "end")
        .node("end", "end", cfg());

    let items = vec![json!({"n": 1}), json!({"n": 2}), json!({"n": 3})];
    let run = Runner::new(Harness::inert(), graph).with_items(items.clone()).run();

    assert!(run.ran("mid"));
    assert_eq!(payloads(&run.output_items("mid")), items, "noop no debe tocar la lista");
    assert!(run.ran("end"));
}

// ── ports ────────────────────────────────────────────────────────────────

/// `targets_of(node, None)` returns every outgoing edge; a node with two edges
/// on the same port starts two walks, which is how the canvas draws a fan-out.
#[test]
fn a_node_with_two_edges_on_one_port_starts_both_walks() {
    let dir = scratch("two_edges_one_port");
    let a = dir.join("a.txt");
    let b = dir.join("b.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "wa")
        .connect("start", "output", "wb")
        .node("wa", "write_file", json!({ "file_path": a.to_string_lossy(), "content": "a" }))
        .node("wb", "write_file", json!({ "file_path": b.to_string_lossy(), "content": "b" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("wa") && run.ran("wb"), "ambas ramas deben recorrerese");
    assert_eq!(read(&a), "a");
    assert_eq!(read(&b), "b");
}

/// A node reached twice within one walk runs **once**: `walk` marks every node
/// visited on entry and returns immediately on a second arrival.
///
/// This is the reason a diamond does not merge its two branches — whichever
/// branch the walker reaches first is the one whose items the join sees. It is
/// pinned here so the day someone changes the traversal, the change is visible
/// rather than silent.
#[test]
fn a_node_reached_by_two_branches_runs_once() {
    let dir = scratch("diamond_runs_once");
    let log = dir.join("join.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "a")
        .connect("start", "output", "b")
        .node("a", "write_file", json!({ "file_path": dir.join("a.txt").to_string_lossy(), "content": "rama A" }))
        .node("b", "write_file", json!({ "file_path": dir.join("b.txt").to_string_lossy(), "content": "rama B" }))
        .connect("a", "output", "join")
        .connect("b", "output", "join")
        .node("join", "write_file", json!({ "file_path": log.to_string_lossy(), "append": true, "content": "join\n" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(
        run.observer.statuses_of("join").iter().filter(|s| *s == "ok").count(),
        1,
        "el nodo de unión debe ejecutarse una sola vez"
    );
    // The walker finishes branch A's whole subtree before starting branch B.
    assert_eq!(run.order(), vec!["start", "a", "join", "b"]);
}

// ── skips, stops and single-node runs ────────────────────────────────────

#[test]
fn a_disabled_node_is_skipped_but_its_downstream_still_runs() {
    let dir = scratch("disabled");
    let out = dir.join("after.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "skipped")
        .node("skipped", "write_file", json!({ "file_path": dir.join("never.txt").to_string_lossy(), "content": "x" }))
        .connect("skipped", "output", "after")
        .node("after", "write_file", json!({ "file_path": out.to_string_lossy(), "content": "después" }))
        .disable("skipped");

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.skipped("skipped"), "un nodo deshabilitado no debe reportar estado");
    assert!(!dir.join("never.txt").exists());
    assert!(run.ran("after"), "el flujo debe continuar por detrás del nodo deshabilitado");
    assert_eq!(read(&out), "después");
}

/// `stop_after` is n8n's "Execute previous nodes": everything up to and
/// including the target runs, nothing after it does.
#[test]
fn stop_after_runs_up_to_the_target_and_halts_the_walk() {
    let dir = scratch("stop_after");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "first")
        .node("first", "write_file", json!({ "file_path": dir.join("first.txt").to_string_lossy(), "content": "1" }))
        .connect("first", "output", "second")
        .node("second", "write_file", json!({ "file_path": dir.join("second.txt").to_string_lossy(), "content": "2" }));

    let run = Runner::new(Harness::inert(), graph).stopping_after("first").run();

    assert!(run.ran("first"));
    assert!(run.skipped("second"), "nada después del objetivo debe ejecutarse");
    assert!(!dir.join("second.txt").exists());
}

/// `only_node` is "Execute step": the node runs with whatever the environment
/// already holds, and **nothing upstream** of it does.
///
/// Note the asymmetry, which is real and worth knowing: the downstream walk
/// still happens. `run()` calls `walk(target)` directly, and `walk` follows the
/// node's outgoing edges as it does for any other node — so `only_node` skips
/// the *test setup* of the chain behind the node, not the chain in front of it.
/// The field's doc comment says "nothing else is walked", which overstates it;
/// this test pins what the code does.
#[test]
fn only_node_runs_one_node_and_never_walks_upstream_of_it() {
    let dir = scratch("only_node");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "upstream")
        .node("upstream", "write_file", json!({ "file_path": dir.join("up.txt").to_string_lossy(), "content": "no" }))
        .connect("upstream", "output", "target")
        .node("target", "write_file", json!({ "file_path": dir.join("target.txt").to_string_lossy(), "content": "sí" }))
        .connect("target", "output", "downstream")
        .node("downstream", "write_file", json!({ "file_path": dir.join("down.txt").to_string_lossy(), "content": "sí también" }));

    let run = Runner::new(Harness::inert(), graph).only_node("target").run();

    assert!(run.ran("target"));
    assert!(
        run.skipped("start") && run.skipped("upstream"),
        "nada aguas arriba debe ejecutarse"
    );
    assert!(
        !dir.join("up.txt").exists(),
        "el nodo anterior al objetivo no debe ejecutarse"
    );
    assert!(
        run.ran("downstream"),
        "aguas abajo sí se recorre: es el comportamiento real de walk"
    );
}

/// With no entry-kind node in the graph, the walk starts from the nodes nothing
/// points at. Otherwise a flow whose trigger was deleted would do nothing and
/// report success.
#[test]
fn a_graph_without_an_entry_kind_starts_from_the_nodes_with_no_incoming() {
    let dir = scratch("no_entry_kind");
    let out = dir.join("out.txt");

    let graph = Graph::new()
        .node("alone", "write_file", json!({ "file_path": out.to_string_lossy(), "content": "raíz" }));

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.ran("alone"), "un nodo sin entradas es la raíz del flujo");
    assert_eq!(read(&out), "raíz");
}

/// A cleared stop flag aborts before any node runs — the user pressing Stop must
/// not let one more node through.
#[test]
fn a_cleared_stop_flag_aborts_before_the_first_node() {
    let dir = scratch("stopped");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "writer")
        .node("writer", "write_file", json!({ "file_path": dir.join("x.txt").to_string_lossy(), "content": "no" }));

    let run = Runner::new(Harness::inert(), graph).stopped().run();

    assert!(run.result.is_err(), "un flujo detenido debe devolver error");
    assert!(run.skipped("start") && run.skipped("writer"));
    assert!(!dir.join("x.txt").exists());
}

// ── the recorded-range path ──────────────────────────────────────────────

/// `app` owns the recorded event range and replays it through `exec_range`.
///
/// The spy backend is the point of the test: it is *offered* the translated
/// desktop actions, which proves the range was genuinely walked event by event,
/// and it performs none of them, which proves the walk cannot reach the desktop
/// from a test. A backend that merely refused without recording would leave "the
/// range ran" and "the range was skipped" indistinguishable.
#[test]
fn an_app_node_walks_its_recorded_range_without_touching_the_desktop() {
    let graph = Graph::new()
        .node_with_range("rec", "app", json!({ "name": "grabación" }), (0, 3))
        .raw_event("mouse_move", json!({ "x": 10, "y": 10 }))
        .raw_event("layout_metadata", json!({ "noop": true }))
        .raw_event("button_press", json!({ "button": "Left" }));

    let run = Runner::new(Harness::with_spy_backend(), graph).run();

    assert!(run.ran("rec"), "el rango grabado debe recorrerse: {:?}", run.result);
    assert_eq!(
        run.offered_actions,
        vec!["MouseMove".to_string(), "Click".to_string()],
        "el rango debe traducirse a acciones de escritorio"
    );
    assert!(
        run.performed_actions.is_empty(),
        "ninguna acción puede llegar a ejecutarse desde una prueba"
    );
}

/// A node whose kind the engine does not recognise falls into the catch-all and
/// replays its own event range. A kind that translates to no `ActionRequest`
/// therefore completes silently — see `routing.rs` for the full account.
#[test]
fn an_unrecognised_kind_replays_its_own_range_without_failing() {
    let graph = Graph::new().node("weird", "tipo_que_no_existe", cfg());

    let run = Runner::new(Harness::inert(), graph).run();

    assert!(run.result.is_ok(), "el cajón de sastre no falla: {:?}", run.result);
    assert!(run.ran("weird"));
}

// ── what is deliberately not executed ────────────────────────────────────

/// The kinds this suite refuses to run, checked one by one so the list cannot
/// grow a typo and the exclusion cannot be forgotten.
#[test]
fn the_kinds_that_touch_the_desktop_or_the_network_are_declared_untestable() {
    for kind in UNTESTABLE_KINDS {
        assert!(
            declares_untestable(kind).contains("no se ejecuta"),
            "'{}' está en la lista pero no se declara no comprobable",
            kind
        );
    }
    assert!(
        !UNTESTABLE_KINDS.contains(&"read_file"),
        "read_file sí es comprobable (contra un temporal) y debe seguir ejecutándose"
    );
    assert!(!UNTESTABLE_KINDS.contains(&"write_file"));
}

/// `event` is used by the template harness too; keep its contract pinned.
#[test]
fn the_event_helper_builds_a_recorded_event() {
    let e = event("read_file", json!({ "file_path": "x" }));
    assert_eq!(e.kind, "read_file");
    assert_eq!(e.at_ms, 0);
}
