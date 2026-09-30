use super::engine::{GraphEngine, ITEM_AWARE_KINDS, STOPPED};
use super::extract::GraphNode;
use super::node_options::{build_input_json, build_output_json, NodeOptions};
use crate::application::replay_helpers;
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Instant;

impl<'a> GraphEngine<'a> {
    /// Human-readable name of a node, as authored by the user.
    pub(crate) fn node_label(&self, node: &GraphNode) -> String {
        self.node_event(node)
            .and_then(|ev| ev.data.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| node.kind.clone())
    }

    /// Executes a node with retry resilience, respecting NodeOptions.
    pub(crate) fn exec_node_with_retry(
        &mut self,
        node: &GraphNode,
        depth: usize,
        opts: &NodeOptions,
    ) -> Result<Vec<String>, String> {
        let tries = if opts.retry_on_fail { opts.max_tries } else { 1 };
        let mut last_err = String::new();
        for attempt in 1..=tries {
            match self.exec_node(node, depth) {
                Ok(val) => return Ok(val),
                Err(err) => {
                    if err == STOPPED {
                        return Err(err);
                    }
                    last_err = err;
                    if attempt < tries && opts.wait_between_tries_ms > 0 {
                        self.sleep_interruptible(opts.wait_between_tries_ms)?;
                    }
                }
            }
        }
        Err(last_err)
    }

    /// Runs an item-based node once per incoming item, observing n8n resilience options.
    pub(crate) fn walk_item_based(
        &mut self,
        node: &GraphNode,
        incoming: Vec<serde_json::Value>,
        visited: &mut HashSet<String>,
        depth: usize,
    ) -> Result<(), String> {
        let start_inst = Instant::now();
        let ev_data = self.node_event(node).map(|e| &e.data);
        let opts = NodeOptions::from_data(ev_data);
        let input_json = build_input_json(&replay_helpers::get_all_vars(), &incoming, ev_data);

        let total = incoming.len();
        let mut collected: Vec<serde_json::Value> = Vec::new();

        let items_to_process = if opts.execute_once && !incoming.is_empty() {
            &incoming[..1]
        } else {
            &incoming[..]
        };

        let mut had_continued_error = false;

        for (i, item) in items_to_process.iter().enumerate() {
            self.check_stop()?;
            if self.finished_early {
                break;
            }
            replay_helpers::set_items(vec![item.clone()]);
            replay_helpers::set_var("item.index", &i.to_string());
            replay_helpers::set_var("item.count", &total.to_string());
            replay_helpers::set_var("runIndex", &i.to_string());

            let res = self.exec_node_with_retry(node, depth, &opts);

            match res {
                Ok(_) => {
                    let produced = replay_helpers::get_items();
                    if produced.is_empty() {
                        collected.push(item.clone());
                    } else {
                        collected.extend(produced);
                    }
                }
                Err(err) if err == STOPPED => {
                    replay_helpers::set_items(vec![item.clone()]);
                    self.log_node(node, "stopped", Some(input_json.clone()), None, Some(start_inst.elapsed().as_millis() as u64));
                    return Err(err);
                }
                Err(err) if opts.continue_on_fail => {
                    had_continued_error = true;
                    let err_item = NodeOptions::make_error_item(&err, Some(i));
                    collected.push(err_item);
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
        }

        opts.ensure_output_items(&mut collected);

        // Restore the full output for downstream nodes.
        replay_helpers::set_items(collected.clone());
        let label = self.node_label(node);
        replay_helpers::set_node_output(&node.id, &label, collected.clone());

        let duration_ms = start_inst.elapsed().as_millis() as u64;
        let output_json = serde_json::json!({
            "items": collected,
            "items_count": collected.len(),
            "continued_on_fail": had_continued_error,
        });

        let status = if had_continued_error { "warning" } else { "ok" };
        self.service.observer().on_node_status(self.file_id, &node.id, status);
        self.log_node(node, status, Some(input_json), Some(output_json), Some(duration_ms));

        if self.stop_after.as_deref() == Some(node.id.as_str()) {
            self.finished_early = true;
            return Ok(());
        }
        for t in self.targets_of(&node.id, None) {
            self.walk(&t, visited, depth + 1)?;
        }
        Ok(())
    }

    /// Recursively executes the execution graph node-by-node starting from `id`.
    pub(crate) fn walk(&mut self, id: &str, visited: &mut HashSet<String>, depth: usize) -> Result<(), String> {
        if depth > 1000 {
            return Err("Profundidad de ejecución superada (>1000 pasos)".into());
        }
        if self.stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
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
        let ev_data = self.node_event(&node).map(|e| &e.data);
        let opts = NodeOptions::from_data(ev_data);
        let input_vars = replay_helpers::get_all_vars();
        let input_items = replay_helpers::get_items();
        let input_json = build_input_json(&input_vars, &input_items, ev_data);

        if let Some(s) = node.start {
            self.service.observer().on_node_progress(self.file_id, &node.id, s);
        }
        self.service.observer().on_node_status(self.file_id, &node.id, "running");

        let prev_credential = super::credentials::install_for_node(
            &self.node_event(&node).map(|ev| ev.data.clone()).unwrap_or(serde_json::Value::Null),
        );

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

        let (exec_res, output_json, was_continued) = if is_pinned && pinned_val.is_some() {
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
            (Ok(self.targets_of(&node.id, None)), pdata, false)
        } else {
            let prev_vars = replay_helpers::get_all_vars();
            let res = self.exec_node_with_retry(&node, depth, &opts);
            let curr_vars = replay_helpers::get_all_vars();
            let mut curr_items = replay_helpers::get_items();

            let (final_res, is_cont) = match res {
                Ok(targets) => (Ok(targets), false),
                Err(err) if err == STOPPED => (Err(err), false),
                Err(err) if opts.continue_on_fail => {
                    let err_item = NodeOptions::make_error_item(&err, None);
                    let items = vec![err_item];
                    replay_helpers::set_items(items.clone());
                    curr_items = items;
                    (Ok(self.targets_of(&node.id, None)), true)
                }
                Err(err) => (Err(err), false),
            };

            opts.ensure_output_items(&mut curr_items);
            if opts.always_output_data {
                replay_helpers::set_items(curr_items.clone());
            }

            let label = self.node_label(&node);
            replay_helpers::set_node_output(&node.id, &label, curr_items.clone());
            let out_val = build_output_json(&curr_vars, &prev_vars, &curr_items, is_cont);
            (final_res, out_val, is_cont)
        };

        super::credentials::restore(prev_credential);

        let duration_ms = start_inst.elapsed().as_millis() as u64;

        match exec_res {
            Ok(targets) => {
                let status = if was_continued { "warning" } else { "ok" };
                self.service.observer().on_node_status(self.file_id, &node.id, status);
                self.log_node(&node, status, Some(input_json), Some(output_json), Some(duration_ms));
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
