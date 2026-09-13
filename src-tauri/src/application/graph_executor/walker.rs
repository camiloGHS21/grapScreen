use super::engine::{GraphEngine, ITEM_AWARE_KINDS, STOPPED};
use super::extract::GraphNode;
use crate::application::replay_helpers;
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Instant;

impl<'a> GraphEngine<'a> {
    /// Human-readable name of a node, as authored by the user.
    ///
    /// `GraphNode` only carries structural fields (id, kind, ranges), so the
    /// display name lives in the node's configuration event under `name`.
    /// This is the identifier users type in `{{ $node["<name>"].json.x }}`,
    /// which is why output registration keys on it.
    pub(crate) fn node_label(&self, node: &GraphNode) -> String {
        self.node_event(node)
            .and_then(|ev| ev.data.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| node.kind.clone())
    }

    /// Runs an item-based node once per incoming item.
    ///
    /// For each item we narrow `CURRENT_ITEMS` to that single item, execute the
    /// node (so `{{ $json.x }}` resolves against it), and collect whatever the
    /// node produced. The accumulated list becomes this node's output, which is
    /// what downstream nodes — and `$node["<label>"]` — will see.
    pub(crate) fn walk_item_based(
        &mut self,
        node: &GraphNode,
        incoming: Vec<serde_json::Value>,
        visited: &mut HashSet<String>,
        depth: usize,
    ) -> Result<(), String> {
        let start_inst = Instant::now();
        let vars_snapshot = replay_helpers::get_all_vars();
        let mut input_map = serde_json::Map::new();
        input_map.insert(
            "variables".to_string(),
            serde_json::to_value(&vars_snapshot).unwrap_or(serde_json::Value::Null),
        );
        input_map.insert(
            "items".to_string(),
            serde_json::to_value(&incoming).unwrap_or(serde_json::Value::Null),
        );
        if let Some(ev) = self.node_event(node) {
            input_map.insert("config".to_string(), ev.data.clone());
        }
        let input_json = serde_json::Value::Object(input_map);

        let total = incoming.len();
        let mut collected: Vec<serde_json::Value> = Vec::new();

        for (i, item) in incoming.iter().enumerate() {
            self.check_stop()?;
            if self.finished_early {
                break;
            }
            // Narrow the thread-local item list to just this item.
            replay_helpers::set_items(vec![item.clone()]);
            replay_helpers::set_var("item.index", &i.to_string());
            replay_helpers::set_var("item.count", &total.to_string());
            replay_helpers::set_var("runIndex", &i.to_string());

            let res = self.exec_node(node, depth);
            match res {
                Ok(_) => {}
                Err(err) if err == STOPPED => {
                    replay_helpers::set_items(vec![item.clone()]);
                    self.log_node(node, "stopped", Some(input_json.clone()), None, Some(start_inst.elapsed().as_millis() as u64));
                    return Err(err);
                }
                Err(err) => {
                    self.service.observer().on_node_status(self.file_id, &node.id, "error");
                    self.log_node(
                        node,
                        "error",
                        Some(input_json.clone()),
                        Some(serde_json::json!({ "failed_item_index": i, "error": err })),
                        Some(start_inst.elapsed().as_millis() as u64),
                    );
                    return Err(err);
                }
            }

            // Whatever the node produced becomes the output for this item.
            let produced = replay_helpers::get_items();
            if produced.is_empty() {
                collected.push(item.clone());
            } else {
                collected.extend(produced);
            }
        }

        // Restore the full output for downstream nodes.
        replay_helpers::set_items(collected.clone());
        let label = self.node_label(node);
        replay_helpers::set_node_output(&node.id, &label, collected.clone());

        let duration_ms = start_inst.elapsed().as_millis() as u64;
        let output_json = serde_json::json!({
            "items": collected,
            "items_count": collected.len(),
        });
        self.service.observer().on_node_status(self.file_id, &node.id, "ok");
        self.log_node(node, "ok", Some(input_json), Some(output_json), Some(duration_ms));

        if self.stop_after.as_deref() == Some(node.id.as_str()) {
            self.finished_early = true;
            return Ok(());
        }
        for t in self.targets_of(&node.id, None) {
            self.walk(&t, visited, depth + 1)?;
        }
        Ok(())
    }

    pub(crate) fn walk(&mut self, id: &str, visited: &mut HashSet<String>, depth: usize) -> Result<(), String> {
        if depth > 600 {
            return Ok(());
        }
        if self.finished_early {
            return Ok(());
        }
        self.check_stop()?;
        if visited.contains(id) {
            return Ok(());
        }
        visited.insert(id.to_string());
        let node = match self.nodes.get(id) {
            Some(n) => n.clone(),
            None => return Ok(()),
        };

        if self.disabled.contains(id) {
            for t in self.targets_of(id, None) {
                self.walk(&t, visited, depth + 1)?;
            }
            return Ok(());
        }

        let start_inst = Instant::now();
        let input_vars = replay_helpers::get_all_vars();
        let input_items = replay_helpers::get_items();
        let mut input_map = serde_json::Map::new();
        input_map.insert("variables".to_string(), serde_json::to_value(&input_vars).unwrap_or(serde_json::Value::Null));
        if !input_items.is_empty() {
            input_map.insert("items".to_string(), serde_json::to_value(&input_items).unwrap_or(serde_json::Value::Null));
        }
        if let Some(ev) = self.node_event(&node) {
            input_map.insert("config".to_string(), ev.data.clone());
        }
        let input_json = serde_json::Value::Object(input_map);

        if let Some(s) = node.start {
            self.service.observer().on_node_progress(self.file_id, &node.id, s);
        }
        self.service.observer().on_node_status(self.file_id, &node.id, "running");

        // Install this node's vault credential (if it references one) so
        // `{{ $credentials.field }}` works everywhere inside it — including the
        // per-item path below, which inherits the thread-local value.
        // The previous value is restored on the way out, so nesting a
        // sub-workflow cannot leak the parent's secret into the child.
        let prev_credential = super::credentials::install_for_node(
            &self.node_event(&node).map(|ev| ev.data.clone()).unwrap_or(serde_json::Value::Null),
        );

        // ── Item-based execution ──
        // Nodes that carry no special control semantics run once per incoming
        // item, so `{{ $json }}` inside their config refers to that item.
        // Control-flow nodes (loops, branches, delays…) run once and manage
        // their own iteration.
        let is_item_based = !ITEM_AWARE_KINDS.contains(&node.kind.as_str());
        let incoming = replay_helpers::get_items();
        if is_item_based && incoming.len() > 1 {
            let result = self.walk_item_based(&node, incoming, visited, depth);
            super::credentials::restore(prev_credential);
            return result;
        }

        let is_pinned = self
            .node_event(&node)
            .and_then(|ev| ev.data.get("pinEnabled").and_then(|v| v.as_bool()))
            .unwrap_or(false);
        let pinned_val = self
            .node_event(&node)
            .and_then(|ev| ev.data.get("pinnedData").cloned());

        let (exec_res, output_json) = if is_pinned && pinned_val.is_some() {
            let pdata = pinned_val.unwrap();
            if let Some(arr) = pdata.as_array() {
                replay_helpers::set_items(arr.clone());
            } else if let Some(obj) = pdata.as_object() {
                for (k, v) in obj {
                    let val_str = match v {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    replay_helpers::set_var(k, &val_str);
                }
            }
            (Ok(self.targets_of(&node.id, None)), pdata)
        } else {
            let prev_vars = replay_helpers::get_all_vars();
            let res = self.exec_node(&node, depth);
            let curr_vars = replay_helpers::get_all_vars();
            let curr_items = replay_helpers::get_items();

            // Publish this node's output so later nodes can read it through
            // `{{ $node["<name>"].json.<field> }}`.
            let label = self.node_label(&node);
            replay_helpers::set_node_output(&node.id, &label, curr_items.clone());

            let mut out_map = serde_json::Map::new();
            let mut diff_vars = HashMap::new();
            for (k, v) in &curr_vars {
                if prev_vars.get(k) != Some(v) {
                    diff_vars.insert(k.clone(), v.clone());
                }
            }
            if !diff_vars.is_empty() {
                out_map.insert("variables_updated".to_string(), serde_json::to_value(diff_vars).unwrap_or(serde_json::Value::Null));
            }
            if !curr_items.is_empty() {
                out_map.insert("items".to_string(), serde_json::to_value(&curr_items).unwrap_or(serde_json::Value::Null));
                out_map.insert("items_count".to_string(), serde_json::Value::Number(curr_items.len().into()));
            }
            if let Some(val) = curr_vars.get("http_response") {
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(val) {
                    out_map.insert("http_response".to_string(), j);
                } else {
                    out_map.insert("http_response".to_string(), serde_json::Value::String(val.clone()));
                }
            }
            if let Some(val) = curr_vars.get("code_output") {
                out_map.insert("code_output".to_string(), serde_json::Value::String(val.clone()));
            }

            let out_val = if out_map.is_empty() {
                serde_json::json!({ "executed": true, "total_vars": curr_vars.len() })
            } else {
                serde_json::Value::Object(out_map)
            };
            (res, out_val)
        };

        // This node is done with its credential: restore the outer one before
        // walking downstream so each node resolves its own.
        super::credentials::restore(prev_credential);

        let duration_ms = start_inst.elapsed().as_millis() as u64;

        match exec_res {
            Ok(targets) => {
                self.service.observer().on_node_status(self.file_id, &node.id, "ok");
                self.log_node(&node, "ok", Some(input_json), Some(output_json), Some(duration_ms));
                if self.stop_after.as_deref() == Some(id) {
                    self.finished_early = true;
                    return Ok(());
                }
                for t in targets {
                    self.walk(&t, visited, depth + 1)?;
                }
                Ok(())
            }
            Err(err) => {
                if err == STOPPED {
                    self.log_node(&node, "stopped", Some(input_json), Some(output_json), Some(duration_ms));
                    return Err(err);
                }
                self.service.observer().on_node_status(self.file_id, &node.id, "error");
                self.log_node(&node, "error", Some(input_json), Some(output_json), Some(duration_ms));
                if let Some(handler_id) = self.error_handlers.first().cloned() {
                    if handler_id != node.id && !visited.contains(&handler_id) {
                        replay_helpers::set_var("error.message", &err);
                        replay_helpers::set_var("error.node", &node.id);
                        return self.walk(&handler_id, visited, depth + 1);
                    }
                }
                Err(err)
            }
        }
    }
}
