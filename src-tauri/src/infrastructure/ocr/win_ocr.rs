use crate::domain::entities::{Result, DomainError, OcrScan, OcrBox};
use crate::domain::ports_out::OcrPort;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;
use screenshots::Screen;

#[cfg(target_os = "windows")]
use windows::core::HSTRING;
#[cfg(target_os = "windows")]
use windows::Graphics::Imaging::BitmapDecoder;
#[cfg(target_os = "windows")]
use windows::Media::Ocr::OcrEngine;
#[cfg(target_os = "windows")]
use windows::Storage::FileAccessMode;
#[cfg(target_os = "windows")]
use windows::Storage::StorageFile;

/// Infrastructure adapter implementing OcrPort using Windows Media OCR.
pub struct WinOcrAdapter;

impl WinOcrAdapter {
    pub fn new() -> Self {
        Self
    }
}

fn temp_png() -> std::result::Result<PathBuf, DomainError> {
    let dir = std::env::temp_dir().join("grapScreen").join("ocr");
    fs::create_dir_all(&dir).map_err(|e| DomainError::Io(e.to_string()))?;
    Ok(dir.join(format!("{}.png", Uuid::new_v4())))
}

fn capture_primary(path: &PathBuf) -> std::result::Result<(u32, u32), DomainError> {
    let screens = Screen::all().map_err(|e| DomainError::Other(format!("Screen enumeration failed: {e}")))?;
    let screen = screens.first().ok_or_else(|| DomainError::Other("No screen found".into()))?;
    let image = screen.capture().map_err(|e| DomainError::Other(format!("Screen capture failed: {e}")))?;
    let size = (image.width(), image.height());
    image.save(path).map_err(|e| DomainError::Other(format!("Saving OCR frame failed: {e}")))?;
    Ok(size)
}

#[cfg(target_os = "windows")]
fn recognize_native(path: &PathBuf, width: u32, height: u32) -> std::result::Result<OcrScan, DomainError> {
    let started = std::time::Instant::now();
    let clean_path = path.canonicalize().map_err(|e| DomainError::Io(e.to_string()))?.to_string_lossy().replace("\\\\?\\", "");
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(clean_path))
        .map_err(|e| DomainError::Other(format!("Windows OCR file open failed: {e}")))?
        .get().map_err(|e| DomainError::Other(format!("Windows OCR file access failed: {e}")))?;
    let stream = file.OpenAsync(FileAccessMode::Read)
        .map_err(|e| DomainError::Other(format!("Windows OCR stream failed: {e}")))?
        .get().map_err(|e| DomainError::Other(format!("Windows OCR stream access failed: {e}")))?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| DomainError::Other(format!("Bitmap decoder failed: {e}")))?
        .get().map_err(|e| DomainError::Other(format!("Bitmap decode failed: {e}")))?;
    let bitmap = decoder.GetSoftwareBitmapAsync()
        .map_err(|e| DomainError::Other(format!("Software bitmap failed: {e}")))?
        .get().map_err(|e| DomainError::Other(format!("Software bitmap decode failed: {e}")))?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| DomainError::Other(format!("No Windows OCR language is installed: {e}")))?;
    let language = engine.RecognizerLanguage().ok()
        .and_then(|x| x.LanguageTag().ok()).map(|x| x.to_string()).unwrap_or_else(|| "system".into());
    let result = engine.RecognizeAsync(&bitmap)
        .map_err(|e| DomainError::Other(format!("OCR recognition failed: {e}")))?
        .get().map_err(|e| DomainError::Other(format!("OCR result failed: {e}")))?;
    let mut boxes = Vec::new();
    let lines = result.Lines().map_err(|e| DomainError::Other(format!("OCR lines failed: {e}")))?;
    for line_index in 0..lines.Size().unwrap_or(0) {
        let line = lines.GetAt(line_index).map_err(|e| DomainError::Other(e.to_string()))?;
        let words = line.Words().map_err(|e| DomainError::Other(e.to_string()))?;
        for word_index in 0..words.Size().unwrap_or(0) {
            let word = words.GetAt(word_index).map_err(|e| DomainError::Other(e.to_string()))?;
            let rect = word.BoundingRect().map_err(|e| DomainError::Other(e.to_string()))?;
            let text = word.Text().map_err(|e| DomainError::Other(e.to_string()))?.to_string();
            boxes.push(OcrBox { text, x: rect.X as f64, y: rect.Y as f64, width: rect.Width as f64, height: rect.Height as f64, confidence: 1.0, line: line_index as usize });
        }
    }
    let text = result.Text().map_err(|e| DomainError::Other(e.to_string()))?.to_string();
    Ok(OcrScan { screen_width: width, screen_height: height, language, elapsed_ms: started.elapsed().as_millis(), text, boxes })
}

#[cfg(not(target_os = "windows"))]
fn recognize_native(path: &PathBuf, width: u32, height: u32) -> std::result::Result<OcrScan, DomainError> {
    let started = std::time::Instant::now();

    // Try to run tesseract CLI
    let output = std::process::Command::new("tesseract")
        .arg(path.as_os_str())
        .arg("stdout")
        .arg("--psm")
        .arg("3")
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            let mut boxes = Vec::new();
            for (line_idx, line) in text.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.is_empty() { continue; }
                for word in trimmed.split_whitespace() {
                    boxes.push(OcrBox {
                        text: word.to_string(),
                        x: 0.0, y: 0.0,
                        width: 0.0, height: 0.0,
                        confidence: 0.8,
                        line: line_idx,
                    });
                }
            }
            Ok(OcrScan {
                screen_width: width,
                screen_height: height,
                language: "tesseract".into(),
                elapsed_ms: started.elapsed().as_millis(),
                text: text.trim().to_string(),
                boxes,
            })
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(DomainError::Other(format!(
                "Tesseract OCR falló: {}. Instale con: sudo apt install tesseract-ocr (Linux) o brew install tesseract (macOS)",
                stderr.trim()
            )))
        }
        Err(_) => {
            Err(DomainError::Other(
                "Tesseract no encontrado. Instale con: sudo apt install tesseract-ocr (Linux) o brew install tesseract (macOS)".into()
            ))
        }
    }
}

impl OcrPort for WinOcrAdapter {
    fn scan_screen_text(&self) -> Result<OcrScan> {
        let path = temp_png()?;
        let (width, height) = capture_primary(&path)?;
        let result = recognize_native(&path, width, height);
        let _ = fs::remove_file(path);
        result
    }
}
