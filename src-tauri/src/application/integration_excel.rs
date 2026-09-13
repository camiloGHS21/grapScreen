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
    let format = event.data["format"].as_str().unwrap_or("csv").to_string().to_lowercase();

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
