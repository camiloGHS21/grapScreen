//! Runs the shipped templates through the real engine.
//!
//! `npm run verify:templates` checks every template statically and writes
//! `src/data/template-seeds.json`: the exact events the canvas would create,
//! defaults already merged with the template's own configuration. This module
//! reads that artifact and **builds the connected graph the canvas would draw**,
//! then runs it through `GraphEngine` — the same `walk` → `exec_node` → runner
//! path the app uses.
//!
//! Two things this deliberately does *not* do:
//!
//! * It does not re-implement the dispatch. An earlier version of this file
//!   carried its own copy of `exec_node`'s match, which meant a template could
//!   pass here while the engine routed it somewhere else entirely.
//! * It does not count a node as executed because it appeared in the seed. The
//!   run has to have reported a status for it, which is what `no node is skipped`
//!   below asserts.
//!
//! What it cannot do is open a window: `handle_form_event` returns `false`
//! without an `AppHandle`, so a `form` step cannot execute headlessly. Those
//! steps are **substituted** — the answers the window would collect are
//! installed as variables, exactly as `form_helper` installs them — and the
//! substitution is counted and printed rather than hidden. `delay`/`wait` are
//! capped for the same reason: the wait is not what a template can get wrong.

#[cfg(test)]
mod tests {
    use crate::application::graph_executor::testkit::{Graph, Harness, Runner};
    use crate::application::replay_helpers;
    use crate::domain::entities::RecordedEvent;
    use serde_json::Value;
    use std::collections::HashSet;
    use std::fs;
    use std::path::{Path, PathBuf};

    /// The artifact the TypeScript validator writes. Not a copy of the seeds:
    /// the very object the validator checked, so the two cannot disagree.
    const SEEDS: &str = include_str!("../../../src/data/template-seeds.json");

    /// How long a `delay`/`wait` step is allowed to take here.
    const MAX_WAIT_MS: u64 = 50;

    /// Variables the engine sets on its own, which no template declares.
    const ENGINE_VARS: &[&str] = &[
        "items", "items_count", "item", "$json", "item.index", "item.count", "runIndex",
        "loop.index", "error.message", "error.node", "trigger.kind",
    ];

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("grapscreen_template_e2e").join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("directorio de trabajo");
        dir
    }

    /// A value a user would plausibly type, chosen so SQL casts and text
    /// comparisons in the templates still succeed.
    fn sample_for(field_id: &str) -> String {
        let id = field_id.to_lowercase();
        if id.contains("email") || id.contains("correo") || id.contains("destinatario") {
            "ana@mail.com".to_string()
        } else if ["importe", "cantidad", "precio", "horas", "total"].iter().any(|k| id.contains(k)) {
            "12".to_string()
        } else {
            "dato de prueba".to_string()
        }
    }

    /// Files a template expects to read. Keyed by extension, because that is all
    /// the template tells us about the shape it wants back.
    fn fixture_for(path: &Path) -> String {
        match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "csv" => "nombre,email,ciudad\nAna,ana@mail.com,Madrid\nLuis,luis@mail.com,Sevilla\n".to_string(),
            "json" => r#"[{"nombre":"Ana","email":"ana@mail.com"},{"nombre":"Luis","email":"luis@mail.com"}]"#.to_string(),
            "xml" => "<root><item><n>1</n></item><item><n>2</n></item><url><loc>https://ejemplo.com/a</loc></url><url><loc>https://ejemplo.com/b</loc></url></root>".to_string(),
            _ => "linea uno\nANTIGUO valor\n\nlinea cuatro\n".to_string(),
        }
    }

    /// The node type the canvas assigns to a seeded event kind.
    ///
    /// Only `loop_start` differs: `buildNodes.ts` turns that event into a `loop`
    /// node, which is why the seed carries the event kind and the engine expects
    /// the node kind. Every other step type is its own node type.
    fn node_type_for(event_kind: &str) -> &str {
        match event_kind {
            "loop_start" => "loop",
            other => other,
        }
    }

    /// The ports the chain leaves by. The seeds carry the step order but not the
    /// port each step continues on, so the harness picks the one the template
    /// was written to take: the `true` branch of a condition (a template that
    /// took `false` would have nothing left to run), every `switch` case plus
    /// `default`, and `done` for the two iterating nodes.
    fn exit_ports(node_type: &str) -> Vec<&'static str> {
        match node_type {
            "condition" => vec!["true"],
            "switch" => vec!["case0", "case1", "case2", "default"],
            "loop" | "split_batches" => vec!["done"],
            _ => vec!["output"],
        }
    }

    /// Points every path a node touches at the scratch directory, keeping the
    /// final name so the template's own naming still applies.
    fn localise(event: &mut RecordedEvent, dir: &Path) {
        let name = match event.kind.as_str() {
            "read_file" | "write_file" | "excel_local" => "file_path",
            "sqlite_query" | "sqlite_execute" => "db_path",
            _ => return,
        };
        let Some(raw) = event.data.get(name).and_then(|v| v.as_str()) else { return };
        let leaf = raw.rsplit(['/', '\\']).next().unwrap_or(raw).to_string();
        event.data[name] = Value::String(dir.join(leaf).to_string_lossy().to_string());
    }

    /// What the harness had to do to a step to run it headlessly.
    #[derive(PartialEq, Eq, Clone, Copy)]
    enum Handling {
        /// The engine runs it as it ships.
        AsShipped,
        /// A window cannot open in a test; the answers the window would collect
        /// are installed as variables and the step becomes a pass-through.
        FormAnswersInstalled,
    }

    fn handling_for(node_type: &str) -> Handling {
        match node_type {
            "form" => Handling::FormAnswersInstalled,
            _ => Handling::AsShipped,
        }
    }

    struct Outcome {
        id: String,
        /// `Err` when the graph did not complete, or a node was never reached.
        result: Result<(), String>,
        /// Steps the engine reported a status for.
        nodes_reached: usize,
        nodes_total: usize,
        substitutions: Vec<&'static str>,
        /// Variables the validator says the chain leaves behind that the real
        /// run did not produce.
        missing_vars: Vec<String>,
    }

    /// Builds the connected graph the canvas would draw from a template's seed.
    ///
    /// Returns the graph, the substitutions it needed, and the variables that
    /// stand in for what the substituted steps would have produced — the caller
    /// seeds those, because a run resets the environment before it starts.
    fn graph_for(
        events: &mut Vec<RecordedEvent>,
        dir: &Path,
    ) -> (Graph, Vec<&'static str>, Vec<(String, String)>) {
        let mut graph = Graph::new();
        let mut ids: Vec<String> = Vec::new();
        let mut routed_by: Vec<Vec<&'static str>> = Vec::new();
        let mut substitutions: Vec<&'static str> = Vec::new();
        let mut seed_vars: Vec<(String, String)> = Vec::new();

        for (i, event) in events.iter_mut().enumerate() {
            localise(event, dir);
            if event.kind == "read_file" {
                if let Some(path) = event.data.get("file_path").and_then(|v| v.as_str()) {
                    let path = PathBuf::from(path);
                    if let Some(parent) = path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if !path.exists() {
                        fs::write(&path, fixture_for(&path)).expect("fichero de entrada");
                    }
                }
            }

            let node_type = node_type_for(&event.kind);
            let handling = handling_for(node_type);
            if handling == Handling::FormAnswersInstalled {
                if let Some(fields) = event.data.get("fields").and_then(|v| v.as_array()) {
                    for field in fields {
                        if let Some(id) = field.get("id").and_then(|v| v.as_str()) {
                            seed_vars.push((id.to_string(), sample_for(id)));
                        }
                    }
                }
                substitutions.push("form (respuestas instaladas como variables)");
            }

            let mut data = event.data.clone();
            if event.kind == "delay" || event.kind == "wait" {
                // Trim the wait, not the node: `exec_node` would otherwise honour
                // the configured seconds, which is not what a template can get
                // wrong.
                substitutions.push("delay/wait (espera recortada)");
                data["seconds"] = serde_json::json!(MAX_WAIT_MS as f64 / 1000.0);
            }

            // The step still exists on the canvas, so it still occupies a node —
            // it is the engine's view of it that is substituted.
            let engine_kind = if handling == Handling::FormAnswersInstalled { "noop" } else { node_type };
            let id = format!("{}-{}", node_type, i);
            graph = graph.node(&id, engine_kind, data);
            ids.push(id);
            routed_by.push(exit_ports(node_type));
        }

        for i in 0..ids.len().saturating_sub(1) {
            for port in &routed_by[i] {
                graph = graph.connect(&ids[i], port, &ids[i + 1]);
            }
        }
        substitutions.dedup();
        (graph, substitutions, seed_vars)
    }

    /// Reads the catalog, runs the local subset through the engine, and reports.
    fn run_catalog() -> Vec<Outcome> {
        let parsed: Value = serde_json::from_str(SEEDS).expect("el artefacto de semillas debe ser JSON válido");
        let templates = parsed["templates"].as_array().expect("debe traer una lista de plantillas");
        let mut outcomes = Vec::new();

        for tmpl in templates {
            if tmpl["locallyVerifiable"].as_bool() != Some(true) {
                continue;
            }
            let id = tmpl["id"].as_str().unwrap_or("?").to_string();
            let mut events: Vec<RecordedEvent> = tmpl["events"]
                .as_array()
                .expect("cada plantilla trae sus eventos")
                .iter()
                .map(|ev| serde_json::from_value(ev.clone()).expect("evento válido"))
                .collect();

            let dir = scratch(&id);
            let (graph, substitutions, form_answers) = graph_for(&mut events, &dir);
            let kind_of: Vec<&str> = events.iter().map(|e| node_type_for(&e.kind)).collect();
            let nodes_total = kind_of.len();
            let node_ids: Vec<String> = (0..nodes_total).map(|i| format!("{}-{}", kind_of[i], i)).collect();

            let mut seed: Vec<(&str, &str)> = vec![("trigger.kind", "test")];
            seed.extend(form_answers.iter().map(|(k, v)| (k.as_str(), v.as_str())));
            let run = Runner::new(Harness::inert(), graph).with_vars(&seed).run();

            // Every variable the template itself introduces: the names its
            // `set_var` steps write, and the field ids its form collects. If one
            // of these is missing after the run, every `{{ name }}` downstream
            // resolved to an empty string — which is how a template breaks
            // without failing.
            let variables = replay_helpers::get_all_vars();
            let expected: HashSet<String> = events
                .iter()
                .flat_map(|e| match e.kind.as_str() {
                    "set_var" => e
                        .data
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| vec![s.to_string()])
                        .unwrap_or_default(),
                    "form" => e
                        .data
                        .get("fields")
                        .and_then(|f| f.as_array())
                        .map(|fs| {
                            fs.iter()
                                .filter_map(|f| f.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                    _ => Vec::new(),
                })
                .collect();
            let mut missing_vars: Vec<String> = expected
                .iter()
                .filter(|v| !variables.contains_key(*v) && !ENGINE_VARS.contains(&v.as_str()))
                .cloned()
                .collect();
            missing_vars.sort();

            let nodes_reached = run.observer.visited().iter().filter(|id| node_ids.contains(id)).count();

            let result = match run.result {
                Err(e) => Err(e),
                Ok(()) if nodes_reached != nodes_total => Err(format!(
                    "sólo {} de {} pasos se ejecutaron: la cadena se cortó",
                    nodes_reached, nodes_total
                )),
                Ok(()) => Ok(()),
            };

            outcomes.push(Outcome {
                id,
                result,
                nodes_reached,
                nodes_total,
                substitutions,
                missing_vars,
            });
        }
        outcomes
    }

    /// Runs the catalog once per test binary.
    ///
    /// Several tests assert on the same run, and `scratch` deletes and recreates
    /// each template's directory — so running the catalog twice in parallel made
    /// the two runs delete each other's input files. One shared run removes the
    /// race and does the work once.
    fn outcomes() -> &'static [Outcome] {
        static ONCE: std::sync::OnceLock<Vec<Outcome>> = std::sync::OnceLock::new();
        ONCE.get_or_init(run_catalog)
    }

    /// The test the whole catalog exists to pass.
    #[test]
    fn every_locally_verifiable_template_runs_through_the_engine() {
        // `node` runs the Código steps; without it the subset would silently
        // shrink, so the absence is reported as a failure rather than skipped.
        assert!(
            std::process::Command::new("node").arg("--version").output().map(|o| o.status.success()).unwrap_or(false),
            "hace falta `node` en PATH para ejecutar las plantillas con el nodo Código"
        );

        let outcomes = outcomes();
        assert!(!outcomes.is_empty(), "no se ejecutó ninguna plantilla");

        let failures: Vec<String> = outcomes
            .iter()
            .filter_map(|o| {
                let mut reasons = Vec::new();
                if let Err(e) = &o.result {
                    reasons.push(e.clone());
                }
                if !o.missing_vars.is_empty() {
                    reasons.push(format!(
                        "el validador promete las variables {:?} y la ejecución no las produce",
                        o.missing_vars
                    ));
                }
                if reasons.is_empty() {
                    None
                } else {
                    Some(format!("  ✗ {}: {}", o.id, reasons.join(" · ")))
                }
            })
            .collect();

        let nodes: usize = outcomes.iter().map(|o| o.nodes_reached).sum();
        let total: usize = outcomes.iter().map(|o| o.nodes_total).sum();
        let substituted: usize = outcomes.iter().filter(|o| !o.substitutions.is_empty()).count();
        println!(
            "plantillas locales ejecutadas por el grafo: {}/{} · pasos alcanzados: {}/{} · \
             plantillas con alguna sustitución: {} (form: respuestas instaladas sin abrir ventana; \
             delay/wait: espera recortada a {} ms) · saltados en silencio: 0",
            outcomes.len() - failures.len(),
            outcomes.len(),
            nodes,
            total,
            substituted,
            MAX_WAIT_MS
        );

        assert!(
            failures.is_empty(),
            "{} de {} plantillas fallaron:\n{}",
            failures.len(),
            outcomes.len(),
            failures.join("\n")
        );
    }

    /// Every local template must have been reached, and the ones that cannot run
    /// headlessly must be named rather than quietly dropped from the run.
    #[test]
    fn the_run_covers_the_whole_local_subset() {
        let outcomes = outcomes();
        assert_eq!(outcomes.len(), 99, "el subconjunto local debe tener 99 plantillas");

        let ids: HashSet<&str> = outcomes.iter().map(|o| o.id.as_str()).collect();
        assert_eq!(ids.len(), outcomes.len(), "hay plantillas locales repetidas");

        let total_reached: usize = outcomes.iter().map(|o| o.nodes_reached).sum();
        assert_eq!(
            total_reached,
            outcomes.iter().map(|o| o.nodes_total).sum::<usize>(),
            "algún paso no se alcanzó durante el recorrido"
        );

        let with_form = outcomes.iter().filter(|o| o.substitutions.iter().any(|s| s.starts_with("form"))).count();
        assert_eq!(
            with_form, 31,
            "se esperaban 31 plantillas locales con formulario; si cambió, actualiza el recuento"
        );
    }

    /// The artifact has to describe the catalog it claims to, or the test above
    /// would pass by executing a smaller set than it appears to.
    #[test]
    fn the_seed_artifact_covers_the_catalog() {
        let parsed: Value = serde_json::from_str(SEEDS).expect("JSON válido");
        let templates = parsed["templates"].as_array().expect("lista");
        assert_eq!(templates.len(), 250, "el catálogo debe tener 250 plantillas");

        for tmpl in templates {
            let id = tmpl["id"].as_str().unwrap_or("?");
            let events = tmpl["events"].as_array().unwrap_or_else(|| panic!("{} sin eventos", id));
            let chain = tmpl["chain"].as_array().unwrap_or_else(|| panic!("{} sin cadena", id));
            // A desktop step can seed several events (`type` is a run of
            // press/release pairs, `click` a move plus a press and a release), so
            // the local subset — where the harness builds one node per event — is
            // the one that must match exactly.
            if tmpl["locallyVerifiable"].as_bool() == Some(true) {
                assert_eq!(
                    events.len(),
                    chain.len(),
                    "{} es local y tiene {} eventos para {} pasos: el grafo del arnés ya no coincidiría con la cadena",
                    id,
                    events.len(),
                    chain.len()
                );
            } else {
                assert!(
                    events.len() >= chain.len(),
                    "{} tiene menos eventos ({}) que pasos ({})",
                    id,
                    events.len(),
                    chain.len()
                );
            }
            for event in events {
                assert!(event["kind"].as_str().is_some_and(|k| !k.is_empty()), "{} tiene un evento sin tipo", id);
            }
        }

        let local = templates.iter().filter(|t| t["locallyVerifiable"].as_bool() == Some(true)).count();
        assert_eq!(
            local, 99,
            "se ejecutan {} plantillas en local; se esperaba un recuento fijo del catálogo sin credenciales",
            local
        );
    }

    /// Guards the seam the TypeScript validator cannot: that the catalog the
    /// app imports and the artifact this test executes are the same list.
    #[test]
    fn the_artifact_matches_the_typescript_catalog() {
        let index = include_str!("../../../src/features/templates/catalog/index.ts");
        for file in [
            "formularios-datos", "hojas-archivos", "notificaciones", "ia-texto", "web-apis",
            "bases-datos", "archivos-disco", "escritorio-rpa", "control-flujo", "programadas",
            "scraping-parseo", "productividad",
        ] {
            let needle = format!("./{}.json", file);
            assert!(index.contains(&needle), "catalog/index.ts ya no importa {}", needle);
        }

        let parsed: Value = serde_json::from_str(SEEDS).expect("JSON válido");
        let ids: Vec<&str> = parsed["templates"].as_array().unwrap().iter().filter_map(|t| t["id"].as_str()).collect();
        assert_eq!(ids.len(), 250);
        let unique: std::collections::HashSet<&&str> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len(), "hay identificadores de plantilla repetidos");
    }
}
