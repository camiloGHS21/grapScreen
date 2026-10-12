//! Utility kinds reached through the engine: binary read/write and spreadsheets.
//!
//! Every test drives `GraphEngine::run` over a connected graph and asserts the
//! result — the bytes a node published or the file it left on disk — never the
//! runner's internals. These three kinds were dispatched by `exec_action` but
//! had no engine-level proof that the wiring reaches the right runner.

use crate::application::graph_executor::testkit::{cfg, payloads, Graph, Harness, Runner};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("grapscreen_engine_tests").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("directorio temporal");
    dir
}

fn encode(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

// ── read_binary_file ─────────────────────────────────────────────────────

/// The file's bytes reach the item as base64 inside `binary.data`.
///
/// `read_binary_file` is binary by declaration: if the dispatch falls back to
/// the text reader the node publishes a UTF-8 string field and no `binary`
/// envelope at all, so the assertion below is also the guard for the dispatch.
#[test]
fn read_binary_file_wraps_file_bytes_into_the_binary_property() {
    let dir = scratch("read_binary_file");
    let path = dir.join("datos.bin");
    let contenido = b"contenido binario";
    fs::write(&path, contenido).expect("fichero de entrada");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "reader")
        .node(
            "reader",
            "read_binary_file",
            json!({ "file_path": path.to_string_lossy() }),
        );

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![json!({ "n": 1 })])
        .run();

    assert!(run.result.is_ok(), "el recorrido falló: {:?}", run.result);
    let items = run.output_items("reader");
    assert_eq!(items.len(), 1, "el nodo debió publicar un item: {:?}", items);
    assert_eq!(
        items[0]["binary"]["data"]["data"],
        json!(encode(contenido)),
        "el contenido del fichero debía viajar en base64 dentro de binary.data"
    );
    assert_eq!(
        items[0]["binary"]["data"]["fileName"],
        json!("datos.bin"),
        "el nombre del fichero debía acompañar al binario"
    );
}

// ── write_binary_file ────────────────────────────────────────────────────

/// The bytes in `binary.data` land on disk, and the node says so.
///
/// The seed item is the full envelope (`json` + `binary`), which is the shape
/// upstream nodes publish, so this covers the extraction from an enveloped item
/// and not just from a bare payload.
#[test]
fn write_binary_file_lands_item_bytes_on_disk() {
    let dir = scratch("write_binary_file");
    let destino = dir.join("salida.bin");
    let contenido = b"escrito en disco";
    let semilla = json!({
        "json": { "etiqueta": "uno" },
        "binary": { "data": { "data": encode(contenido), "fileName": "salida.bin" } }
    });

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "writer")
        .node(
            "writer",
            "write_binary_file",
            json!({ "file_path": destino.to_string_lossy() }),
        );

    let run = Runner::new(Harness::inert(), graph)
        .with_items(vec![semilla])
        .run();

    assert!(run.result.is_ok(), "el recorrido falló: {:?}", run.result);
    let en_disco = fs::read(&destino).expect("fichero escrito");
    assert_eq!(en_disco, contenido.to_vec(), "los bytes en disco no son los del item");
    let resumen = &payloads(&run.output_items("writer"))[0];
    assert_eq!(
        resumen["success"],
        json!(true),
        "el nodo debió confirmar la escritura: {:?}",
        resumen
    );
}

// ── excel_local ──────────────────────────────────────────────────────────

/// Two items go in as rows and come back as rows.
///
/// The write runs with the whole batch (the kind is item-aware) over the
/// enveloped items the engine hands every runner, and the reader's rows must
/// match the originals field by field — the guard for the envelope unwrap on
/// the write side: without it the CSV would hold a single `json` column and
/// the round trip below would come back mangled.
#[test]
fn excel_local_round_trips_rows_through_a_csv_file() {
    let dir = scratch("excel_local");
    let path = dir.join("tabla.csv");
    let filas = vec![
        json!({ "name": "Alice", "city": "Bogota" }),
        json!({ "name": "Bob", "city": "Medellin" }),
    ];

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "writer")
        .node(
            "writer",
            "excel_local",
            json!({ "file_path": path.to_string_lossy(), "operation": "write" }),
        )
        .connect("writer", "output", "reader")
        .node(
            "reader",
            "excel_local",
            json!({ "file_path": path.to_string_lossy(), "operation": "fromFile" }),
        );

    let run = Runner::new(Harness::inert(), graph)
        .with_items(filas.clone())
        .run();

    assert!(run.result.is_ok(), "el recorrido falló: {:?}", run.result);
    assert!(path.exists(), "el CSV debió escribirse en {:?}", path);
    assert_eq!(
        payloads(&run.output_items("reader")),
        filas,
        "las filas escritas no vuelven igual al leerlas"
    );
}
