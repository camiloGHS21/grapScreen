use super::engine::{GraphEngine, PASSTHROUGH_KINDS, TRANSFORM_KINDS};
use super::extract::GraphNode;
use crate::application::replay_helpers;
use crate::domain::entities::RecordedEvent;
use std::collections::HashSet;

impl<'a> GraphEngine<'a> {
    pub(crate) fn node_event(&self, node: &GraphNode) -> Option<&RecordedEvent> {
        node.data_idx
            .or(node.start)
            .and_then(|s| self.events.get(s))
    }

    pub(crate) fn exec_node(&mut self, node: &GraphNode, depth: usize) -> Result<Vec<String>, String> {
        // Data-transforming nodes replace the current item list with their own
        // output. They run once, with the whole array visible.
        if TRANSFORM_KINDS.contains(&node.kind.as_str()) {
            self.exec_transform(node)?;
            return Ok(self.targets_of(&node.id, None));
        }

        match node.kind.as_str() {
            k if PASSTHROUGH_KINDS.contains(&k) => Ok(self.targets_of(&node.id, None)),
            "delay" | "wait" => {
                let ms = node
                    .sleep_ms
                    .or_else(|| {
                        self.node_event(node)
                            .and_then(|e| e.data["seconds"].as_f64().map(|s| (s * 1000.0) as u64))
                    })
                    .unwrap_or(1000)
                    .min(600_000);
                self.sleep_interruptible(ms)?;
                Ok(self.targets_of(&node.id, None))
            }
            "condition" => {
                let ok = match self.node_event(node) {
                    Some(ev) => replay_helpers::evaluate_condition_event(&ev.data, &*self.service.ocr()),
                    None => true,
                };
                Ok(self.targets_of(&node.id, Some(if ok { "true" } else { "false" })))
            }
            "switch" => {
                let port = self.eval_switch(node);
                Ok(self.targets_of(&node.id, Some(&port)))
            }
            "loop" => self.exec_loop(node, depth),
            "split_batches" => self.exec_split_batches(node, depth),
            "sub_workflow" => self.exec_sub_workflow(node, depth),
            // Phase 11 — action nodes: each item triggers one external call.
            "send_email" | "slack_webhook" | "discord_webhook" | "notion" | "airtable" => {
                self.exec_action(node)?;
                Ok(self.targets_of(&node.id, None))
            }
            // n8n Core — file actions: each item reads or writes once.
            "read_file" | "write_file" => {
                self.exec_action(node)?;
                Ok(self.targets_of(&node.id, None))
            }
            // Phase 11 — stop_error aborts the flow with a message.
            "stop_error" => {
                let data = self.node_event(node).map(|ev| ev.data.clone()).unwrap_or(serde_json::Value::Null);
                let msg = data
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| replay_helpers::interpolate_variables(s))
                    .unwrap_or_else(|| "Detenido por nodo Stop & Error".into());
                Err(msg)
            }
            _ => {
                self.exec_range(node)?;
                Ok(self.targets_of(&node.id, None))
            }
        }
    }

    /// Runs a data-transformation node and publishes its output items, so both
    /// the node's own log entry and downstream `$node["..."]` lookups see them.
    pub(crate) fn exec_transform(&mut self, node: &GraphNode) -> Result<(), String> {
        let data = self.node_event(node).map(|ev| ev.data.clone()).unwrap_or(serde_json::Value::Null);
        let incoming = replay_helpers::get_items();

        let produced = match node.kind.as_str() {
            "filter" => super::transform::run_filter(&data, incoming),
            "sort" => super::transform::run_sort(&data, incoming),
            "limit" => super::transform::run_limit(&data, incoming),
            "aggregate" => super::transform::run_aggregate(&data, incoming),
            "edit_fields" => super::transform::run_edit_fields(&data, incoming),
            "date_time" => super::transform::run_date_time(&data, incoming),
            "remove_duplicates" => super::transform::run_remove_duplicates(&data, incoming),
            "compare_datasets" => super::transform::run_compare_datasets(&data, incoming),
            "llm_chain" => super::ai_nodes::run_llm_chain(&data, incoming),
            "classifier" => super::ai_nodes::run_classifier(&data, incoming),
            "information_extractor" => super::ai_nodes::run_information_extractor(&data, incoming),
            "sentiment_analysis" => super::ai_nodes::run_sentiment_analysis(&data, incoming),
            "sqlite_query" => super::db_nodes::run_sqlite_query(&data, incoming),
            "sqlite_execute" => super::db_nodes::run_sqlite_execute(&data, incoming),
            // Phase 11
            "rss_read" => super::integration_nodes::run_rss_read(&data, incoming),
            "xml_parse" => super::parse_nodes::run_xml_parse(&data, incoming),
            "html_extract" => super::parse_nodes::run_html_extract(&data, incoming),
            // n8n Core nodes
            "split_out" => super::core_nodes::run_split_out(&data, incoming),
            "summarize" => super::core_nodes::run_summarize(&data, incoming),
            "rename_keys" => super::core_nodes::run_rename_keys(&data, incoming),
            "markdown" => super::core_nodes::run_markdown(&data, incoming),
            "crypto" => super::core_nodes::run_crypto(&data, incoming),
            // Unreachable while TRANSFORM_KINDS and this match stay in sync.
            other => Err(format!("Nodo de transformación desconocido: {}", other)),
        }?;

        replay_helpers::set_items(produced.clone());
        let label = self.node_label(node);
        replay_helpers::set_node_output(&node.id, &label, produced);
        Ok(())
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
        let mut processed_results: Vec<serde_json::Value> = Vec::new();

        for (i, item) in items.into_iter().enumerate() {
            self.check_stop()?;
            let single_item_list = vec![item.clone()];
            replay_helpers::set_items(single_item_list);

            replay_helpers::set_var("item.index", &i.to_string());
            replay_helpers::set_var("item.count", &total.to_string());
            replay_helpers::set_var("loop.index", &i.to_string());

            let mut body_visited = HashSet::new();
            body_visited.insert(node.id.clone());
            for t in &body {
                self.walk(t, &mut body_visited, depth + 1)?;
            }

            let iter_items = replay_helpers::get_items();
            if let Some(last_out) = iter_items.last() {
                processed_results.push(last_out.clone());
            } else {
                processed_results.push(item);
            }
        }

        if !processed_results.is_empty() {
            replay_helpers::set_items(processed_results);
        }

        Ok(done)
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

    /// Phase 11 — runs an external-service action node once per incoming item.
    /// Called from `exec_node` for `send_email`, `slack_webhook`, etc.
    pub(crate) fn exec_action(&self, node: &GraphNode) -> Result<(), String> {
        let data = self.node_event(node).map(|ev| ev.data.clone()).unwrap_or(serde_json::Value::Null);
        let incoming = replay_helpers::get_items();
        let produced = match node.kind.as_str() {
            "send_email" => super::integration_nodes::run_send_email(&data, incoming),
            "slack_webhook" => super::integration_nodes::run_slack(&data, incoming),
            "discord_webhook" => super::integration_nodes::run_discord(&data, incoming),
            "notion" => super::integration_nodes::run_notion(&data, incoming),
            "airtable" => super::integration_nodes::run_airtable(&data, incoming),
            // n8n Core — Read/Write Files from Disk.
            "read_file" => super::core_nodes::run_read_file(&data, incoming),
            "write_file" => super::core_nodes::run_write_file(&data, incoming),
            other => Err(format!("Acción desconocida: {}", other)),
        }?;
        replay_helpers::set_items(produced.clone());
        let label = self.node_label(node);
        replay_helpers::set_node_output(&node.id, &label, produced);
        Ok(())
    }

    pub(crate) fn exec_range(&self, node: &GraphNode) -> Result<(), String> {
        let (s, e) = match (node.start, node.end) {
            (Some(s), Some(e)) if s <= e && e < self.events.len() => (s, e),
            _ => return Ok(()),
        };
        let mut prev: Option<u64> = None;
        for ev in self.events[s..=e].iter() {
            self.check_stop()?;
            if ev.kind == "layout_metadata" {
                continue;
            }
            if ev.data.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false) {
                prev = Some(ev.at_ms);
                continue;
            }
            if let Some(p) = prev {
                let gap = ev.at_ms.saturating_sub(p).min(5000);
                if gap > 0 {
                    self.sleep_interruptible(gap)?;
                }
            }
            prev = Some(ev.at_ms);
            self.service
                .run_single_event(ev, self.target, self.is_background, self.stop_flag)?;
        }
        Ok(())
    }
}
