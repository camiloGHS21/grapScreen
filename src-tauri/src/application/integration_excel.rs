use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use crate::domain::entities::RecordedEvent;
use crate::application::replay_helpers::interpolate_variables;

pub fn execute_excel_local(event: &RecordedEvent) -> bool {
    let file_path = event.data["file_path"].as_str().unwrap_or("").to_string();
    let header_str = event.data["header"].as_str().unwrap_or("");
    let values_str = event.data["values"].as_str().unwrap_or("[]");
    let delimiter = event.data["delimiter"].as_str().unwrap_or(",").to_string();
    let overwrite = event.data["overwrite"].as_bool().unwrap_or(false);
    // A flow saved before the format selector existed states its intent through
    // the path alone. Defaulting to csv in that case rewrote the user's
    // `datos.xlsx` into `datos.csv` (see `normalize_ext`), so an .xlsx path now
    // means a real workbook. Anything else keeps the historical csv default.
    let format = match event.data["format"].as_str() {
        Some(f) if !f.trim().is_empty() => f.to_lowercase(),
        _ => match Path::new(&file_path).extension().and_then(|e| e.to_str()) {
            Some(ext) if ext.eq_ignore_ascii_case("xlsx") => "xlsx".to_string(),
            _ => "csv".to_string(),
        },
    };

    let vars = crate::application::replay_helpers::get_all_vars();
    eprintln!("[ExcelLocal] Variables disponibles: {:?}", vars);

    let path_interp = interpolate_variables(&file_path);
    if path_interp.trim().is_empty() {
        return false;
    }
    let header_interp = interpolate_variables(header_str);
    let values_interp = interpolate_variables(values_str);

    let header: Vec<String> = if header_interp.trim().is_empty() {
        Vec::new()
    } else {
        match serde_json::from_str::<Vec<serde_json::Value>>(&header_interp) {
            Ok(arr) => arr
                .into_iter()
                .map(|v| v.to_string().trim_matches('"').to_string())
                .collect(),
            Err(_) => Vec::new(),
        }
    };

    let rows: Vec<Vec<String>> =
        match serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&values_interp) {
            Ok(arr) => arr
                .into_iter()
                .map(|row| {
                    row.into_iter()
                        .map(|v| {
                            if v.is_string() {
                                v.as_str().unwrap_or("").to_string()
                            } else {
                                v.to_string()
                            }
                        })
                        .collect()
                })
                .collect(),
            Err(e) => {
                eprintln!(
                    "[ExcelLocal] Valores no son JSON válido ({}); se escribe la línea tal cual: {}",
                    e, values_interp
                );
                vec![vec![values_interp.clone()]]
            }
        };

    let path_raw = Path::new(&path_interp);
    let resolved = if path_raw.is_absolute() {
        path_raw.to_path_buf()
    } else {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("grapScreen");
        let _ = fs::create_dir_all(&base);
        base.join(&path_interp)
    };

    let path = normalize_ext(&resolved, &format);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    eprintln!(
        "[ExcelLocal] Formato={} | Escribiendo en: {} | overwrite={} | filas={} | valores_interp={}",
        format,
        path.display(),
        overwrite,
        rows.len(),
        values_interp
    );

    if format == "xlsx" {
        let existing_rows = if !overwrite && path.exists() {
            crate::application::xlsx_writer::read_xlsx_rows(&path)
        } else {
            None
        };
        let write_result = if let Some(mut prev) = existing_rows {
            if !header.is_empty() && prev.first().map(|r| r == &header).unwrap_or(false) {
                prev.remove(0);
            }
            prev.extend(rows);
            crate::application::xlsx_writer::write_xlsx(&path, &[], &prev)
        } else {
            crate::application::xlsx_writer::write_xlsx(&path, &header, &rows)
        };
        return write_result.is_ok();
    }

    let csv_field = |s: &str| -> String {
        if s.contains(&delimiter) || s.contains('"') || s.contains('\n') || s.contains('\r') {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s.to_string()
        }
    };
    let join_row = |row: &[String]| -> String {
        row.iter().map(|c| csv_field(c)).collect::<Vec<_>>().join(&delimiter)
    };

    let lines: Vec<String> = if header.is_empty() {
        rows.iter().map(|r| join_row(r)).collect()
    } else {
        let mut all = vec![join_row(&header)];
        all.extend(rows.iter().map(|r| join_row(r)));
        all
    };

    let content = lines.join("\r\n");
    let file_exists = path.exists();

    let result = if overwrite || !file_exists {
        fs::write(&path, content)
    } else {
        let existing = fs::read_to_string(&path).unwrap_or_default();
        let needs_newline =
            !existing.is_empty() && !existing.ends_with('\n') && !existing.ends_with("\r\n");
        match fs::OpenOptions::new().append(true).open(&path) {
            Ok(mut f) => {
                let mut body = if needs_newline { "\r\n".to_string() } else { String::new() };
                body.push_str(&content);
                f.write_all(body.as_bytes())
            }
            Err(_) => return false,
        }
    };
    result.is_ok()
}

#[cfg(test)]
mod template_seed_tests {
    //! End-to-end tests for the "Formulario → Excel" template.
    //!
    //! They start from the exact event the canvas seeds for `excel_local` and
    //! the exact variables the `form` window hands over, then run the real
    //! writer. The fixtures mirror `buildAddedEvents` in
    //! `src/features/flowchart/utils/eventModifiers.ts`; the last test in this
    //! module re-reads that file so a seed change that drifts away from these
    //! fixtures fails loudly instead of silently passing.
    use super::*;
    use crate::application::replay_helpers::{reset_execution_state, VARIABLES};
    use crate::domain::entities::RecordedEvent;

    /// Config the template seeds on the `excel_local` node.
    const SEEDED_EXCEL: &str = r#"{
        "file_path": "datos.xlsx",
        "header": "[\"Nombre\",\"Email\",\"Telefono\"]",
        "values": "[[\"{{ nombre }}\",\"{{ email }}\",\"{{ telefono }}\"]]",
        "delimiter": ",",
        "overwrite": false,
        "format": "xlsx"
    }"#;

    /// One key per field the template seeds on the `form` node, paired with the
    /// value a user would type into it. Order matches the Excel `values` row.
    const SEEDED_FORM_RESPONSE: &[(&str, &str)] = &[
        ("nombre", "Ana"),
        ("email", "ana@mail.com"),
        ("telefono", "600123456"),
    ];

    /// A fresh directory per test: never the user's real data dir.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("grapscreen_template_tests").join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    /// Loads the seeded event, pointing `file_path` at `dir` so the run never
    /// touches `%APPDATA%`. Only the base directory changes: every other field
    /// is the seeded one, verbatim. `drop` removes keys to recreate flows saved
    /// before those keys existed.
    fn seeded_event(
        dir: &Path,
        drop: &[&str],
        overrides: &[(&str, serde_json::Value)],
    ) -> RecordedEvent {
        let mut data: serde_json::Value = serde_json::from_str(SEEDED_EXCEL).expect("seeded JSON");
        let file_name = data["file_path"].as_str().unwrap().to_string();
        data["file_path"] = serde_json::Value::String(
            dir.join(file_name).to_string_lossy().to_string(),
        );
        if let Some(map) = data.as_object_mut() {
            for key in drop {
                map.remove(*key);
            }
        }
        for (key, value) in overrides {
            data[*key] = value.clone();
        }
        RecordedEvent { at_ms: 0, kind: "excel_local".to_string(), data }
    }

    /// Installs the form's answers the way `form_helper::handle_form_event` does.
    fn install_form_response(values: &[(&str, &str)]) {
        reset_execution_state();
        VARIABLES.with(|vars| {
            let mut vars = vars.borrow_mut();
            for (k, v) in values {
                vars.insert((*k).to_string(), (*v).to_string());
            }
        });
    }

    /// The test the bug report asks for: type into the form, run the flow, get
    /// the typed values back out of a real .xlsx.
    #[test]
    fn form_to_excel_template_writes_typed_values_into_xlsx() {
        let dir = scratch("form_to_excel");
        install_form_response(SEEDED_FORM_RESPONSE);

        let event = seeded_event(&dir, &[], &[]);
        assert!(
            execute_excel_local(&event),
            "the seeded excel_local step must succeed"
        );

        let xlsx_path = dir.join("datos.xlsx");
        assert!(
            xlsx_path.exists(),
            "the template promises Excel, so it must write {} — dir contains {:?}",
            xlsx_path.display(),
            fs::read_dir(&dir).map(|d| d.filter_map(|e| e.ok().map(|e| e.file_name())).collect::<Vec<_>>())
        );

        let rows = crate::application::xlsx_writer::read_xlsx_rows(&xlsx_path)
            .expect("the written file must be a readable xlsx");
        assert_eq!(rows[0], vec!["Nombre", "Email", "Telefono"], "header row");
        let typed: Vec<String> = SEEDED_FORM_RESPONSE.iter().map(|(_, v)| v.to_string()).collect();
        assert_eq!(
            rows[1], typed,
            "the row must carry what the user typed, not the raw placeholders"
        );
    }

    /// A saved flow predating the `format` field must keep working, and its
    /// `.csv` path must stay a CSV.
    #[test]
    fn excel_event_without_format_keeps_csv_paths_as_csv() {
        let dir = scratch("legacy_csv");
        install_form_response(&[]);

        let event = seeded_event(&dir, &["format"], &[
            ("file_path", serde_json::Value::String(dir.join("legacy.csv").to_string_lossy().to_string())),
            ("header", serde_json::Value::String(String::new())),
            ("values", serde_json::Value::String("[[\"a\",\"b\"]]".to_string())),
        ]);
        assert!(execute_excel_local(&event), "legacy csv write must succeed");

        assert!(dir.join("legacy.csv").exists(), "csv path must stay a csv");
        assert!(!dir.join("legacy.xlsx").exists(), "no surprise xlsx");
        let content = fs::read_to_string(dir.join("legacy.csv")).unwrap();
        assert!(content.contains("a,b"), "csv body: {content:?}");
    }

    /// The other half of the same compatibility rule: a saved flow that asked
    /// for `datos.xlsx` and carries no `format` must not be downgraded to CSV.
    #[test]
    fn excel_event_without_format_follows_the_path_extension() {
        let dir = scratch("legacy_xlsx");
        install_form_response(&[]);

        let event = seeded_event(&dir, &["format"], &[
            ("header", serde_json::Value::String(String::new())),
            ("values", serde_json::Value::String("[[\"a\",\"b\"]]".to_string())),
        ]);
        assert!(execute_excel_local(&event), "write must succeed");

        let xlsx_path = dir.join("datos.xlsx");
        assert!(
            xlsx_path.exists(),
            "path says .xlsx, so the file must be an .xlsx — dir contains {:?}",
            fs::read_dir(&dir).map(|d| d.filter_map(|e| e.ok().map(|e| e.file_name())).collect::<Vec<_>>())
        );
        let rows = crate::application::xlsx_writer::read_xlsx_rows(&xlsx_path).unwrap();
        assert_eq!(rows[0], vec!["a", "b"]);
    }

    /// Guards the seam no Rust test can otherwise see: the variables one seeded
    /// node writes must be the ones the next seeded node interpolates. Reads the
    /// TypeScript source directly, so the seed and the engine cannot drift apart
    /// unnoticed.
    #[test]
    fn template_seeds_are_coherent_with_the_engine() {
        let src = include_str!("../../../src/features/flowchart/utils/eventModifiers.ts");

        /// The full body of one `if (type === "…")` seed branch, however many
        /// lines it spans.
        fn branch<'a>(src: &'a str, needle: &str) -> String {
            let lines: Vec<&str> = src.lines().collect();
            let start = lines
                .iter()
                .position(|l| l.contains(needle))
                .unwrap_or_else(|| panic!("seed branch not found: {needle}"));
            let mut body = vec![lines[start]];
            for line in &lines[start + 1..] {
                if line.contains("if (type === ") {
                    break;
                }
                body.push(line);
            }
            body.join("\n")
        }

        let excel = branch(src, r#"if (type === "excel_local")"#);
        assert!(
            excel.contains(r#"format: "xlsx""#),
            "the seeded Excel node must state format: \"xlsx\", otherwise the writer \
             falls back to the extension: {excel}"
        );

        let form = branch(src, r#"if (type === "form")"#);
        // Every `{{ var }}` the Excel node writes has to be a field id the form
        // creates, or the writer stores the literal placeholder instead of the
        // value the user typed.
        for placeholder in ["nombre", "email", "telefono"] {
            assert!(
                excel.contains(&format!("{{{{ {placeholder} }}}}")),
                "the Excel seed should still write the {placeholder} column: {excel}"
            );
            assert!(
                form.contains(&format!(r#"id: "{placeholder}""#)),
                "the form seed must create a field with id \"{placeholder}\" for \
                 {{{{ {placeholder} }}}} to resolve: {form}"
            );
        }

        // Same rule for the other chains: `set_var` fills a variable that both
        // the Telegram alert and the AI step read, and the agent's output var is
        // what the Docs step writes.
        let set_var = branch(src, r#"if (type === "set_var")"#);
        assert!(
            set_var.contains(r#"name: "entrada""#),
            "set_var must name the variable its consumers read: {set_var}"
        );
        let telegram = branch(src, r#"if (type === "telegram")"#);
        assert!(
            telegram.contains("{{ entrada }}"),
            "the runner rejects an empty message, so the alert must read the \
             set_var output: {telegram}"
        );
        let agent = branch(src, r#"if (type === "ai_agent")"#);
        assert!(
            agent.contains("{{ entrada }}"),
            "the AI step must consume the set_var output: {agent}"
        );
        let docs = branch(src, r#"if (type === "google_docs")"#);
        assert!(
            docs.contains("{{ ai_response }}"),
            "the Docs step must write the agent's output_var: {docs}"
        );
        let sheets = branch(src, r#"if (type === "google_sheets")"#);
        assert!(
            sheets.contains("{{ nombre }}"),
            "the Sheets step must write the form's variables instead of a blank \
             row: {sheets}"
        );
    }
}

fn normalize_ext(path: &Path, format: &str) -> PathBuf {
    let s = path.to_string_lossy().to_string();
    let lower = s.to_lowercase();
    if format == "xlsx" {
        if lower.ends_with(".xlsx") {
            path.to_path_buf()
        } else {
            let base = lower.strip_suffix(".csv").unwrap_or(&s);
            PathBuf::from(format!("{}.xlsx", base))
        }
    } else {
        if lower.ends_with(".xlsx") {
            let base = &s[..s.len() - ".xlsx".len()];
            PathBuf::from(format!("{}.csv", base))
        } else {
            path.to_path_buf()
        }
    }
}
