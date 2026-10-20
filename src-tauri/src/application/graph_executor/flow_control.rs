use super::engine::GraphEngine;
use super::extract::GraphNode;
use crate::application::replay_helpers;
use std::collections::HashSet;

impl<'a> GraphEngine<'a> {
    pub(crate) fn exec_loop(&mut self, node: &GraphNode, depth: usize) -> Result<Vec<String>, String> {
        let iterations = self
            .node_event(node)
            .map(|e| {
                let raw = e.data["iterations"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| e.data["iterations"].to_string());
                replay_helpers::interpolate_variables(raw.trim_matches('"'))
                    .trim()
                    .parse::<usize>()
                    .unwrap_or(1)
            })
            .unwrap_or(1)
            .min(1000);
        let body = self.targets_of(&node.id, Some("body"));
        let done = self.targets_of(&node.id, Some("done"));
        for i in 0..iterations {
            self.check_stop()?;
            replay_helpers::set_var("loop.index", &i.to_string());
            let mut body_visited = HashSet::new();
            body_visited.insert(node.id.clone());
            for t in &body {
                self.walk(t, &mut body_visited, depth + 1)?;
            }
        }
        Ok(done)
    }

    pub(crate) fn exec_split_batches(&mut self, node: &GraphNode, depth: usize) -> Result<Vec<String>, String> {
        let body = self.targets_of(&node.id, Some("body"));
        let done = self.targets_of(&node.id, Some("done"));

        let current_items = replay_helpers::get_items();
        let items: Vec<serde_json::Value> = if !current_items.is_empty() {
            current_items
        } else {
            match self.node_event(node) {
                Some(ev) => {
                    let var_name = ev.data["array_var"].as_str().unwrap_or("items");
                    let raw = if var_name.contains("{{") {
                        replay_helpers::interpolate_variables(var_name)
                    } else {
                        replay_helpers::get_var(var_name).unwrap_or_default()
                    };
                    match serde_json::from_str::<serde_json::Value>(&raw) {
                        Ok(serde_json::Value::Array(arr)) => arr,
                        _ => raw
                            .lines()
                            .map(|l| serde_json::Value::String(l.trim().to_string()))
                            .filter(|v| !v.as_str().unwrap_or("").is_empty())
                            .collect(),
                    }
                }
                None => Vec::new(),
            }
        };

        let total = items.len();
        let batch_size = self
            .node_event(node)
            .and_then(|ev| {
                ev.data
                    .get("batch_size")
                    .or_else(|| ev.data.get("batchSize"))
                    .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            })
            .unwrap_or(1)
            .max(1) as usize;

        let chunks: Vec<Vec<serde_json::Value>> = items.chunks(batch_size).map(|c| c.to_vec()).collect();
        let total_batches = chunks.len();
        let mut processed_results: Vec<serde_json::Value> = Vec::new();

        for (run_idx, batch) in chunks.into_iter().enumerate() {
            self.check_stop()?;
            replay_helpers::set_items(batch.clone());

            let run_idx_str = run_idx.to_string();
            replay_helpers::set_var("runIndex", &run_idx_str);
            replay_helpers::set_var("$runIndex", &run_idx_str);
            replay_helpers::set_var("loop.index", &run_idx_str);
            replay_helpers::set_var("item.index", &run_idx_str);
            replay_helpers::set_var("item.count", &total.to_string());
            replay_helpers::set_var("batch.count", &total_batches.to_string());

            let mut body_visited = HashSet::new();
            body_visited.insert(node.id.clone());
            for t in &body {
                self.walk(t, &mut body_visited, depth + 1)?;
            }

            let iter_items = replay_helpers::get_items();
            if !iter_items.is_empty() {
                processed_results.extend(iter_items);
            } else {
                processed_results.extend(batch);
            }
        }

        if !processed_results.is_empty() {
            replay_helpers::set_items(processed_results);
        }

        Ok(done)
    }

    pub(crate) fn eval_switch(&self, node: &GraphNode) -> String {
        let ev = match self.node_event(node) {
            Some(e) => e,
            None => return "default".into(),
        };
        let field = ev.data["field"].as_str().unwrap_or("");
        let value = if field.contains("{{") {
            replay_helpers::interpolate_variables(field)
        } else {
            replay_helpers::get_var(field).unwrap_or_default()
        };
        if let Some(cases) = ev.data["cases"].as_array() {
            for (i, case) in cases.iter().enumerate().take(3) {
                let case_val = case
                    .get("value")
                    .and_then(|v| v.as_str())
                    .or_else(|| case.as_str())
                    .unwrap_or("");
                let case_interp = replay_helpers::interpolate_variables(case_val);
                let expr = format!("\"{}\" == \"{}\"", value.replace('"', "'"), case_interp.replace('"', "'"));
                if replay_helpers::eval_expression(&expr) {
                    return format!("case{}", i);
                }
            }
        }
        "default".into()
    }

    pub(crate) fn exec_sub_workflow(&mut self, node: &GraphNode, depth: usize) -> Result<Vec<String>, String> {
        if depth > 50 {
            return Err("Se alcanzó el límite de profundidad de sub-flujos (posible bucle infinito)".into());
        }
        let ev = match self.node_event(node) {
            Some(e) => e,
            None => return Err("Configuración del sub-flujo no encontrada".into()),
        };
        let project_name = ev
            .data
            .get("project_name")
            .and_then(|v| v.as_str())
            .unwrap_or("Default");
        let workflow_id = ev
            .data
            .get("workflow_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if workflow_id.is_empty() {
            return Err("No se ha especificado el ID del sub-flujo en la configuración del nodo".into());
        }

        let sub_file = self
            .service
            .inner
            .storage_port
            .load_automation(project_name, workflow_id)
            .map_err(|e| format!("Error al cargar el sub-flujo '{}/{}': {}", project_name, workflow_id, e))?;

        if let Some((sub_nodes, sub_conns, sub_disabled)) = super::extract::extract_graph(&sub_file.events) {
            let _ = super::run_graph_with_options(
                self.service,
                &sub_file.id,
                &sub_file.events,
                &sub_file.target_app,
                self.is_background,
                self.stop_flag,
                sub_nodes,
                sub_conns,
                sub_disabled,
                None,
            )?;
        }
        Ok(self.targets_of(&node.id, None))
    }
}
