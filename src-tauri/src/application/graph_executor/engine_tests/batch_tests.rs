use crate::application::graph_executor::testkit::{cfg, Graph, Harness, Runner};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("grapscreen_engine_tests").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("directorio temporal");
    dir
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

#[test]
fn split_batches_with_batch_size_chunks_items_and_sets_run_index() {
    let dir = scratch("split_batches_chunked");
    let trace = dir.join("batches.txt");

    let graph = Graph::new()
        .node("start", "start", cfg())
        .connect("start", "output", "batcher")
        .node("batcher", "split_batches", json!({ "batch_size": 2 }))
        .connect("batcher", "body", "body")
        .connect("batcher", "done", "after")
        .node(
            "body",
            "write_file",
            json!({
                "file_path": trace.to_string_lossy(),
                "append": true,
                "content": "batch:{{ runIndex }}-item:{{ itemIndex }}-id:{{ $json.id }};",
            }),
        )
        .node("after", "write_file", json!({ "file_path": dir.join("after.txt").to_string_lossy(), "content": "done" }));

    let items = vec![
        json!({"id": 1}),
        json!({"id": 2}),
        json!({"id": 3}),
        json!({"id": 4}),
        json!({"id": 5}),
    ];

    let run = Runner::new(Harness::inert(), graph)
        .with_items(items)
        .run();

    assert!(run.result.is_ok(), "{:?}", run.result);
    // 5 items with batch_size 2:
    // batch 0: item 0 (id 1), item 1 (id 2)
    // batch 1: item 0 (id 3), item 1 (id 4)
    // batch 2: item 0 (id 5)
    assert_eq!(
        read(&trace),
        "batch:0-item:0-id:1;batch:0-item:1-id:2;batch:1-item:0-id:3;batch:1-item:1-id:4;batch:2-item:0-id:5;"
    );
    assert!(run.ran("after"));
    assert_eq!(read(&dir.join("after.txt")), "done");
}
