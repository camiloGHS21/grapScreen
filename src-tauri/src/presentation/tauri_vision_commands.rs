use crate::domain::entities::{OcrScan, OcrBox};
use base64::Engine;
use crate::AppState;
use tauri::State;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use strsim::normalized_levenshtein;
use image::imageops::crop_imm;

#[derive(Clone, Debug, Serialize)]
pub struct RecoveryResult {
    pub found: bool,
    pub query: String,
    pub matched_text: Option<String>,
    pub confidence: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub moved_px: Option<f64>,
    pub clicked: bool,
    pub strategy: String,
    pub scan_ms: u128,
}

#[derive(Clone, Debug, Serialize)]
pub struct TemplateInfo {
    pub id: String,
    pub path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct VisualMatch {
    pub found: bool,
    pub template_id: String,
    pub confidence: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub scale: Option<f64>,
    pub moved_px: Option<f64>,
    pub clicked: bool,
    pub elapsed_ms: u128,
    pub strategy: String,
}

fn library_dir() -> std::result::Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "No data directory found".to_string())?
        .join("grapScreen")
        .join("projects");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn template_dir() -> std::result::Result<PathBuf, String> {
    let dir = library_dir()?.join("templates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_id(value: &str) -> std::result::Result<String, String> {
    let id: String = value.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_')).take(80).collect();
    if id.is_empty() || id != value {
        Err("Template id contains invalid characters".to_string())
    } else {
        Ok(id)
    }
}

fn template_path(id: &str) -> std::result::Result<PathBuf, String> {
    Ok(template_dir()?.join(format!("{}.png", safe_id(id)?)))
}

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn candidates(scan: &OcrScan, query: &str) -> Vec<OcrBox> {
    let wanted = normalize(query);
    if wanted.is_empty() { return Vec::new(); }
    let mut output = Vec::new();
    for line in 0..scan.boxes.iter().map(|x| x.line).max().unwrap_or(0) + 1 {
        let words: Vec<&OcrBox> = scan.boxes.iter().filter(|x| x.line == line).collect();
        for start in 0..words.len() {
            for length in 1..=words.len().saturating_sub(start).min(8) {
                let slice = &words[start..start + length];
                let phrase = slice.iter().map(|x| x.text.as_str()).collect::<Vec<_>>().join(" ");
                let score = normalized_levenshtein(&wanted, &normalize(&phrase));
                let first = slice[0];
                let last = slice[slice.len() - 1];
                output.push(OcrBox {
                    text: phrase,
                    x: first.x,
                    y: first.y,
                    width: (last.x + last.width - first.x).max(first.width),
                    height: slice.iter().map(|x| x.height).fold(0.0, f64::max),
                    confidence: score,
                    line,
                });
            }
        }
    }
    output.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(Ordering::Equal));
    output.truncate(25);
    output
}

#[tauri::command(async)]
pub fn ocr_scan_screen(state: State<AppState>) -> std::result::Result<OcrScan, String> {
    state.ocr.scan_screen_text().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn ocr_find_text(state: State<AppState>, query: String, threshold: Option<f64>) -> std::result::Result<Vec<OcrBox>, String> {
    let min = threshold.unwrap_or(0.82).clamp(0.0, 1.0);
    let scan = state.ocr.scan_screen_text().map_err(|e| e.to_string())?;
    Ok(candidates(&scan, &query).into_iter().filter(|x| x.confidence >= min).collect())
}

#[tauri::command(async)]
pub fn ocr_recover_step(
    state: State<AppState>,
    query: String,
    expected_x: Option<f64>,
    expected_y: Option<f64>,
    threshold: Option<f64>,
    _click: Option<bool>,
) -> std::result::Result<RecoveryResult, String> {
    let scan = state.ocr.scan_screen_text().map_err(|e| e.to_string())?;
    let min = threshold.unwrap_or(0.82).clamp(0.0, 1.0);
    let mut found = candidates(&scan, &query);
    for item in &mut found {
        if let (Some(ex), Some(ey)) = (expected_x, expected_y) {
            let cx = item.x + item.width / 2.0;
            let cy = item.y + item.height / 2.0;
            let distance = ((cx - ex).powi(2) + (cy - ey).powi(2)).sqrt();
            let proximity = (1.0 - distance / 1200.0).clamp(0.0, 1.0);
            item.confidence = item.confidence * 0.82 + proximity * 0.18;
        }
    }
    found.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(Ordering::Equal));
    let Some(best) = found.into_iter().find(|x| x.confidence >= min) else {
        return Ok(RecoveryResult { found: false, query, matched_text: None, confidence: 0.0, x: None, y: None, moved_px: None, clicked: false, strategy: "ocr_no_match".into(), scan_ms: scan.elapsed_ms });
    };
    let x = best.x + best.width / 2.0;
    let y = best.y + best.height / 2.0;
    let moved_px = expected_x.zip(expected_y).map(|(ex, ey)| ((x - ex).powi(2) + (y - ey).powi(2)).sqrt());
    Ok(RecoveryResult { found: true, query, matched_text: Some(best.text), confidence: best.confidence, x: Some(x), y: Some(y), moved_px, clicked: false, strategy: "windows_media_ocr".into(), scan_ms: scan.elapsed_ms })
}

#[tauri::command(async)]
pub fn save_visual_template(template_id: String, x: u32, y: u32, width: u32, height: u32) -> std::result::Result<TemplateInfo, String> {
    if width < 8 || height < 8 { return Err("Template must be at least 8 by 8 pixels".to_string()); }
    let image = crate::infrastructure::screen_capture::capture_screen_rgba(None)
        .map_err(|e| format!("Screen capture failed: {e}"))?;
    if x.saturating_add(width) > image.width() || y.saturating_add(height) > image.height() {
        return Err("Template region is outside the primary screen".to_string());
    }
    let output = crop_imm(&image, x, y, width, height).to_image();
    let path = template_path(&template_id)?;
    output.save(&path).map_err(|e| format!("Saving template failed: {e}"))?;
    Ok(TemplateInfo { id: template_id, path: path.to_string_lossy().into(), width, height })
}

#[tauri::command]
pub fn import_visual_template(template_id: String, source_path: String) -> std::result::Result<TemplateInfo, String> {
    let source = PathBuf::from(source_path);
    let image = image::open(&source).map_err(|e| format!("Opening imported image failed: {e}"))?;
    if image.width() < 8 || image.height() < 8 { return Err("Template is too small".to_string()); }
    let path = template_path(&template_id)?;
    image.to_rgba8().save(&path).map_err(|e| format!("Saving imported template failed: {e}"))?;
    Ok(TemplateInfo { id: template_id, path: path.to_string_lossy().into(), width: image.width(), height: image.height() })
}

#[tauri::command]
pub fn list_visual_templates() -> std::result::Result<Vec<TemplateInfo>, String> {
    let mut output = Vec::new();
    for entry in fs::read_dir(template_dir()?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|x| x.to_str()) != Some("png") { continue; }
        if let Ok(image) = image::open(&path) {
            output.push(TemplateInfo {
                id: path.file_stem().and_then(|x| x.to_str()).unwrap_or_default().to_string(),
                path: path.to_string_lossy().into(), width: image.width(), height: image.height()
            });
        }
    }
    output.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(output)
}

#[tauri::command]
pub fn delete_visual_template(template_id: String) -> std::result::Result<(), String> {
    let path = template_path(&template_id)?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command(async)]
pub fn find_visual_template(
    state: State<AppState>,
    template_id: String,
    threshold: Option<f64>,
    expected_x: Option<f64>,
    expected_y: Option<f64>,
    _scales: Option<Vec<f64>>,
    _click: Option<bool>,
) -> std::result::Result<VisualMatch, String> {
    let started = std::time::Instant::now();
    let threshold = threshold.unwrap_or(0.86).clamp(0.0, 1.0);
    
    // Read the template file as base64
    let path = template_path(&template_id)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
    
    match state.vision.find_template(&base64_str) {
        Ok((x, y)) => {
            let moved_px = expected_x.zip(expected_y).map(|(ex, ey)| ((x as f64 - ex).powi(2) + (y as f64 - ey).powi(2)).sqrt());
            Ok(VisualMatch { found: true, template_id, confidence: 1.0, x: Some(x as f64), y: Some(y as f64), width: None, height: None, scale: None, moved_px, clicked: false, elapsed_ms: started.elapsed().as_millis(), strategy: "vision_port_matching".into() })
        }
        Err(e) => {
            Ok(VisualMatch { found: false, template_id, confidence: 0.0, x: None, y: None, width: None, height: None, scale: None, moved_px: None, clicked: false, elapsed_ms: started.elapsed().as_millis(), strategy: format!("vision_failed: {}", e) })
        }
    }
}
