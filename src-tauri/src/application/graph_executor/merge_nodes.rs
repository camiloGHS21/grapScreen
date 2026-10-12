//! Native runner for n8n `Merge` node (`n8n-nodes-base.merge`).
//!
//! Supports all canonical n8n merge modes:
//! - `append`: Concatenates input 2 onto input 1.
//! - `chooseBranch`: Selects either input 1 or input 2.
//! - `combine` by position: Merges item fields index-by-index.
//! - `combine` by fields: SQL-style joins (inner, left/enrichInput1, right, outer, keepNonMatches).
//! - `combine` multiplex: Cartesian product of all items.
//! - `wait`: Synchronizes branches, returning input 1.

use super::extract::GraphConnection;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Resolves input1 and input2 arrays for a merge node from incoming connections and node outputs.
pub fn resolve_inputs(
    outgoing: &HashMap<String, Vec<GraphConnection>>,
    node_id: &str,
) -> (Vec<Value>, Vec<Value>) {
    let incoming_conns: Vec<&GraphConnection> = outgoing
        .values()
        .flatten()
        .filter(|c| c.targetNodeId == node_id)
        .collect();

    let outputs = crate::application::replay_helpers::get_node_outputs();
    let current = crate::application::replay_helpers::get_items();

    if incoming_conns.is_empty() {
        return (current, Vec::new());
    }

    if incoming_conns.len() == 1 {
        let src = &incoming_conns[0].sourceNodeId;
        let items = outputs.get(src).cloned().unwrap_or(current);
        return (items, Vec::new());
    }

    let mut in1_src = None;
    let mut in2_src = None;

    for c in &incoming_conns {
        let p = c.targetPortId.to_lowercase();
        if p == "in2" || p == "input2" || p.ends_with('2') || p == "1" {
            in2_src = Some(&c.sourceNodeId);
        } else if p == "in1" || p == "input1" || p.ends_with('1') || p == "0" {
            in1_src = Some(&c.sourceNodeId);
        }
    }

    let in1_id = in1_src.unwrap_or(&incoming_conns[0].sourceNodeId);
    let in2_id = in2_src.unwrap_or(&incoming_conns[1].sourceNodeId);

    let items1 = outputs.get(in1_id).cloned().unwrap_or_else(|| current.clone());
    let items2 = outputs.get(in2_id).cloned().unwrap_or_default();

    (items1, items2)
}

/// Dispatches merge node execution, updating thread-local items and recording output.
pub fn exec_merge(
    outgoing: &HashMap<String, Vec<GraphConnection>>,
    ev_data: Option<&Value>,
    node_id: &str,
    node_label: &str,
) -> Result<(), String> {
    let empty_map = json!({});
    let data = ev_data.unwrap_or(&empty_map);
    let (input1, input2) = resolve_inputs(outgoing, node_id);
    let produced = run_merge(data, input1, input2)?;

    crate::application::replay_helpers::set_items(produced.clone());
    crate::application::replay_helpers::set_node_output(node_id, node_label, produced);
    Ok(())
}

/// Merges two items, properly combining their `json` and `binary` envelopes if present.
pub fn merge_items(item1: &Value, item2: &Value) -> Value {
    let mut out_json = Map::new();
    let mut out_bin = Map::new();
    let mut has_envelope = false;

    // Helper to absorb JSON and binary from an item
    let mut absorb = |item: &Value| {
        if let Value::Object(map) = item {
            if let Some(j) = map.get("json") {
                has_envelope = true;
                if let Value::Object(jm) = j {
                    for (k, v) in jm {
                        out_json.insert(k.clone(), v.clone());
                    }
                }
            } else {
                for (k, v) in map {
                    if k != "binary" {
                        out_json.insert(k.clone(), v.clone());
                    }
                }
            }
            if let Some(Value::Object(bm)) = map.get("binary") {
                has_envelope = true;
                for (k, v) in bm {
                    out_bin.insert(k.clone(), v.clone());
                }
            }
        } else if !item.is_null() {
            out_json.insert("data".to_string(), item.clone());
        }
    };

    absorb(item1);
    absorb(item2);

    if has_envelope || !out_bin.is_empty() {
        let mut envelope = Map::new();
        envelope.insert("json".to_string(), Value::Object(out_json));
        if !out_bin.is_empty() {
            envelope.insert("binary".to_string(), Value::Object(out_bin));
        }
        Value::Object(envelope)
    } else {
        Value::Object(out_json)
    }
}

/// Extracts a string representation of a field for joining.
fn get_field_val(item: &Value, field: &str) -> Option<String> {
    let unwrapped = crate::application::expressions::unwrap_item(item);
    if let Value::Object(map) = unwrapped {
        if let Some(val) = map.get(field) {
            return match val {
                Value::String(s) => Some(s.clone()),
                Value::Number(n) => Some(n.to_string()),
                Value::Bool(b) => Some(b.to_string()),
                other => Some(other.to_string()),
            };
        }
    }
    None
}

/// Executes the merge operation between `input1` and `input2`.
pub fn run_merge(data: &Value, input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    let mode = super::utility_nodes::cfg_str(data, "mode", &["operation"]).to_lowercase();
    match mode.as_str() {
        "choosebranch" | "choose_branch" => run_choose_branch(data, input1, input2),
        "combine" => run_combine(data, input1, input2),
        "wait" | "passthrough" => Ok(if input1.is_empty() { input2 } else { input1 }),
        _ => run_append(input1, input2), // default: append
    }
}

/// `append` mode: concatenates input 2 onto input 1.
fn run_append(mut input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    input1.extend(input2);
    Ok(input1)
}

/// `chooseBranch` mode: outputs only the selected input.
fn run_choose_branch(data: &Value, input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    let branch = super::utility_nodes::cfg_str(data, "output", &["branch", "chooseBranch"]).to_lowercase();
    if branch == "input2" || branch == "2" || branch == "branch2" {
        Ok(input2)
    } else {
        Ok(input1)
    }
}

/// `combine` mode: position-based, field-based (SQL join), or cartesian multiplex.
fn run_combine(data: &Value, input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    let combo = super::utility_nodes::cfg_str(data, "combinationMode", &["combineMode", "type"]).to_lowercase();
    if combo.contains("field") || combo.contains("join") {
        run_merge_by_fields(data, input1, input2)
    } else if combo.contains("multiplex") || combo.contains("cartesian") {
        run_multiplex(input1, input2)
    } else {
        run_merge_by_position(data, input1, input2)
    }
}

/// Combine by position: merges item $i$ with item $i$.
fn run_merge_by_position(data: &Value, input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    let output_type = super::utility_nodes::cfg_str(data, "outputType", &["type"]).to_lowercase();
    let is_matching_only = output_type == "matching" || output_type == "inner";

    let len = if is_matching_only {
        input1.len().min(input2.len())
    } else {
        input1.len().max(input2.len())
    };

    let mut out = Vec::with_capacity(len);
    for i in 0..len {
        match (input1.get(i), input2.get(i)) {
            (Some(a), Some(b)) => out.push(merge_items(a, b)),
            (Some(a), None) if !is_matching_only => out.push(a.clone()),
            (None, Some(b)) if !is_matching_only => out.push(b.clone()),
            _ => {}
        }
    }
    Ok(out)
}

/// Multiplex: computes Cartesian product (every item in input 1 merged with every item in input 2).
fn run_multiplex(input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    if input1.is_empty() {
        return Ok(input2);
    }
    if input2.is_empty() {
        return Ok(input1);
    }
    let mut out = Vec::with_capacity(input1.len() * input2.len());
    for a in &input1 {
        for b in &input2 {
            out.push(merge_items(a, b));
        }
    }
    Ok(out)
}

/// Combine by fields: SQL-like join on key fields.
fn run_merge_by_fields(data: &Value, input1: Vec<Value>, input2: Vec<Value>) -> Result<Vec<Value>, String> {
    let field1 = super::utility_nodes::cfg_str(data, "field1", &["propertyName1", "key1"]);
    let field2_raw = super::utility_nodes::cfg_str(data, "field2", &["propertyName2", "key2"]);
    let field2 = if field2_raw.is_empty() { field1.clone() } else { field2_raw };

    if field1.trim().is_empty() {
        return Err("Merge: indica el campo de unión (field1 / propertyName1)".into());
    }

    let join_mode = super::utility_nodes::cfg_str(data, "joinMode", &["joinType", "mode"]).to_lowercase();
    let mut out = Vec::new();
    let mut matched2 = vec![false; input2.len()];

    for it1 in &input1 {
        let val1 = get_field_val(it1, &field1);
        let mut found = false;

        for (idx2, it2) in input2.iter().enumerate() {
            let val2 = get_field_val(it2, &field2);
            if val1.is_some() && val1 == val2 {
                found = true;
                matched2[idx2] = true;
                if join_mode != "keepnonmatches" {
                    out.push(merge_items(it1, it2));
                }
            }
        }

        if !found
            && (join_mode == "keepnonmatches" || join_mode == "left" || join_mode == "enrichinput1" || join_mode == "outer" || join_mode == "keepall" || join_mode.is_empty()) {
                out.push(it1.clone());
            }
    }

    // Right / outer joins append unmatched items from input 2
    if join_mode == "right" || join_mode == "outer" || join_mode == "keepall" {
        for (idx2, it2) in input2.iter().enumerate() {
            if !matched2[idx2] {
                out.push(it2.clone());
            }
        }
    }

    Ok(out)
}
