//! n8n-compatible binary data pipeline (`item.binary`).
//!
//! Provides the canonical `BinaryData` structure, MIME detection, base64 encoding/decoding,
//! envelope wrapping/extraction, and native file runners for binary read/write operations.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::Path;

/// Canonical n8n binary object stored under `item.binary[propertyName]`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinaryData {
    pub data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_extension: Option<String>,
}

impl BinaryData {
    /// Constructs a `BinaryData` envelope from raw bytes and optional metadata.
    pub fn from_bytes(bytes: &[u8], file_name: Option<&str>, mime_type: Option<&str>) -> Self {
        let ext = file_name
            .and_then(|n| Path::new(n).extension())
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        let detected_mime = mime_type
            .map(|m| m.to_string())
            .or_else(|| ext.as_deref().and_then(mime_from_extension).map(|s| s.to_string()))
            .or_else(|| mime_from_magic_bytes(bytes).map(|s| s.to_string()))
            .or_else(|| Some("application/octet-stream".to_string()));

        Self {
            data: STANDARD.encode(bytes),
            mime_type: detected_mime,
            file_name: file_name.map(|s| s.to_string()),
            file_size: Some(format_file_size(bytes.len())),
            file_extension: ext,
        }
    }

    /// Decodes base64 payload into raw binary bytes.
    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        let clean: String = self.data.chars().filter(|c| !c.is_whitespace()).collect();
        STANDARD.decode(clean.as_bytes()).map_err(|e| format!("Base64 decoding error: {}", e))
    }

    /// Converts this binary object to a `serde_json::Value`.
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    /// Parses a `BinaryData` from a JSON value.
    pub fn from_value(val: &Value) -> Option<Self> {
        if let Value::Object(map) = val {
            let data = map.get("data").and_then(|v| v.as_str())?.to_string();
            let mime_type = map.get("mimeType").or_else(|| map.get("mime_type")).and_then(|v| v.as_str()).map(String::from);
            let file_name = map.get("fileName").or_else(|| map.get("file_name")).and_then(|v| v.as_str()).map(String::from);
            let file_size = map.get("fileSize").or_else(|| map.get("file_size")).map(|v| match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => format_file_size(n.as_u64().unwrap_or(0) as usize),
                _ => String::new(),
            });
            let file_extension = map.get("fileExtension").or_else(|| map.get("file_extension")).and_then(|v| v.as_str()).map(String::from);
            Some(Self { data, mime_type, file_name, file_size, file_extension })
        } else if let Value::String(s) = val {
            Some(Self {
                data: s.clone(),
                mime_type: Some("application/octet-stream".into()),
                file_name: None,
                file_size: None,
                file_extension: None,
            })
        } else {
            None
        }
    }
}

/// Formats byte count into human-readable n8n string format (e.g. "12 Bytes", "1.5 kB").
pub fn format_file_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{} Bytes", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} kB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

/// Infers MIME type from file extension.
pub fn mime_from_extension(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "pdf" => Some("application/pdf"),
        "json" => Some("application/json"),
        "csv" => Some("text/csv"),
        "txt" => Some("text/plain"),
        "html" | "htm" => Some("text/html"),
        "xml" => Some("application/xml"),
        "zip" => Some("application/zip"),
        "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "mp3" => Some("audio/mpeg"),
        "mp4" => Some("video/mp4"),
        _ => None,
    }
}

/// Infers MIME type from magic header bytes.
pub fn mime_from_magic_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"%PDF") {
        Some("application/pdf")
    } else if bytes.starts_with(b"PK\x03\x04") {
        Some("application/zip")
    } else {
        None
    }
}

/// Wraps an item with an n8n binary envelope: `{ "json": ..., "binary": { prop: ... } }`.
pub fn wrap_binary_item(mut item: Value, prop_name: &str, binary: BinaryData) -> Value {
    let prop = if prop_name.trim().is_empty() { "data" } else { prop_name.trim() };
    if let Value::Object(ref mut map) = item {
        if let Some(Value::Object(ref mut bin_map)) = map.get_mut("binary") {
            bin_map.insert(prop.to_string(), binary.to_value());
            return item;
        }
        if map.contains_key("json") {
            let mut bin_map = Map::new();
            bin_map.insert(prop.to_string(), binary.to_value());
            map.insert("binary".to_string(), Value::Object(bin_map));
            return item;
        }
    }
    let mut bin_map = Map::new();
    bin_map.insert(prop.to_string(), binary.to_value());
    json!({
        "json": item,
        "binary": Value::Object(bin_map)
    })
}

/// Extracts `BinaryData` from an n8n item envelope.
pub fn extract_binary(item: &Value, prop_name: &str) -> Option<BinaryData> {
    let prop = if prop_name.trim().is_empty() { "data" } else { prop_name.trim() };
    if let Some(bin_obj) = item.get("binary") {
        if let Some(target) = bin_obj.get(prop) {
            return BinaryData::from_value(target);
        }
        if prop == "data" {
            if let Some(first_val) = bin_obj.as_object().and_then(|m| m.values().next()) {
                return BinaryData::from_value(first_val);
            }
        }
    }
    if let Some(direct) = item.get(prop) {
        if let Some(b) = BinaryData::from_value(direct) {
            return Some(b);
        }
    }
    BinaryData::from_value(item)
}

/// Extracts raw bytes from an item's binary property or string fallback.
pub fn extract_bytes(item: &Value, prop_name: &str) -> Result<Vec<u8>, String> {
    if let Some(bin) = extract_binary(item, prop_name) {
        return bin.to_bytes();
    }
    if let Some(s) = item.get(prop_name).and_then(|v| v.as_str()) {
        let clean: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        if let Ok(b) = STANDARD.decode(clean.as_bytes()) {
            return Ok(b);
        }
        return Ok(s.as_bytes().to_vec());
    }
    Err(format!("No se encontraron datos binarios en la propiedad '{}'", prop_name))
}

/// Checks if an operation or incoming items require binary pipeline processing.
pub fn is_binary_op(data: &Value, items: &[Value]) -> bool {
    let key = data.get("n8n_key").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
    if key == "readbinaryfile" || key == "readbinaryfiles" || key == "writebinaryfile" {
        return true;
    }
    let op = data.get("operation").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
    if op.contains("binary") {
        return true;
    }
    if data.get("is_binary").and_then(|v| v.as_bool()).unwrap_or(false)
        || data.get("asBinary").and_then(|v| v.as_bool()).unwrap_or(false) {
        return true;
    }
    items.iter().any(|it| it.get("binary").is_some())
}

/// Native runner for binary file reading (`ReadBinaryFile`).
pub fn run_read_binary_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_str = super::utility_nodes::cfg_str(data, "file_path", &["filePath", "path", "filename"]);
    if path_str.trim().is_empty() {
        return Err("ReadBinaryFile: indica la ruta del archivo".into());
    }
    let prop = super::utility_nodes::cfg_str(data, "dataPropertyName", &["binaryPropertyName", "property", "data_property_name"]);
    let prop_name = if prop.trim().is_empty() { "data" } else { prop.trim() };

    let interp_path = crate::application::replay_helpers::interpolate_variables(&path_str);
    let path = Path::new(&interp_path);
    if !path.exists() {
        return Err(format!("ReadBinaryFile: el archivo '{}' no existe", path.display()));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("ReadBinaryFile: {}", e))?;
    let file_name = path.file_name().and_then(|n| n.to_str());
    let bin = BinaryData::from_bytes(&bytes, file_name, None);

    let targets = if items.is_empty() { vec![json!({})] } else { items };
    let mut outputs = Vec::with_capacity(targets.len());
    for item in targets {
        outputs.push(wrap_binary_item(item, prop_name, bin.clone()));
    }
    Ok(outputs)
}

/// Native runner for binary file writing (`WriteBinaryFile`).
pub fn run_write_binary_file(data: &Value, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let path_str = super::utility_nodes::cfg_str(data, "file_path", &["filePath", "path", "filename"]);
    if path_str.trim().is_empty() {
        return Err("WriteBinaryFile: indica la ruta del archivo de destino".into());
    }
    let prop = super::utility_nodes::cfg_str(data, "dataPropertyName", &["binaryPropertyName", "property", "data_property_name"]);
    let prop_name = if prop.trim().is_empty() { "data" } else { prop.trim() };

    let interp_path = crate::application::replay_helpers::interpolate_variables(&path_str);
    let path = Path::new(&interp_path);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let targets = if items.is_empty() { vec![json!({})] } else { items };
    let mut total_written = 0usize;
    for item in &targets {
        let bytes = extract_bytes(item, prop_name)?;
        std::fs::write(path, &bytes).map_err(|e| format!("WriteBinaryFile: error al escribir '{}': {}", path.display(), e))?;
        total_written += bytes.len();
    }

    Ok(vec![json!({
        "success": true,
        "filePath": path.display().to_string(),
        "fileSize": total_written,
        "sizeFormatted": format_file_size(total_written)
    })])
}
