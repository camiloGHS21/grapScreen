use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

use image::{DynamicImage, GenericImageView, RgbaImage};
use screenshots::Screen;

use crate::domain::entities::{DomainError, Result};

/// How many times we retry a capture before giving up.
const MAX_ATTEMPTS: usize = 4;
/// Milliseconds to wait between retries (lets the DDA handle recover).
const RETRY_DELAY_MS: u64 = 150;
/// Per-channel color range below this is considered a blank/black frame.
const BLANK_THRESHOLD: u8 = 6;

/// Returns true when the image looks like a failed/blank capture
/// (all sampled pixels are essentially the same color, e.g. solid black).
fn is_blank(img: &DynamicImage) -> bool {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return true;
    }
    // Deterministic pseudo-random sampling so we don't depend on RNG.
    let samples: u64 = 220;
    let mut min = [255u8; 3];
    let mut max = [0u8; 3];
    for i in 0..samples {
        let x = ((i.wrapping_mul(2654435761)) % w as u64) as u32 % w;
        let y = ((i.wrapping_mul(40503)) % h as u64) as u32 % h;
        let p = img.get_pixel(x, y);
        for c in 0..3 {
            min[c] = min[c].min(p[c]);
            max[c] = max[c].max(p[c]);
        }
    }
    let range = (0..3).map(|c| max[c].saturating_sub(min[c])).max().unwrap_or(0);
    range < BLANK_THRESHOLD
}

/// Capture a screen into a `DynamicImage`, retrying and skipping blank frames.
///
/// * `monitor` – `Some(i)` captures only monitor `i` (0-based). `None` tries the
///   primary monitor first, then every other monitor as a fallback.
/// * Returns the first non-blank capture, or the last capture if every attempt
///   produced a blank frame (so the caller still gets a file instead of nothing).
pub fn capture_screen(monitor: Option<usize>) -> Result<DynamicImage> {
    let screens = Screen::all()
        .map_err(|e| DomainError::Other(format!("Screen enumeration failed: {e}")))?;
    if screens.is_empty() {
        return Err(DomainError::Other("No screen found".into()));
    }

    // Build the try order: preferred monitor first, then all others.
    let mut order: Vec<usize> = Vec::with_capacity(screens.len());
    if let Some(i) = monitor {
        if i < screens.len() {
            order.push(i);
        }
    }
    for i in 0..screens.len() {
        if !order.contains(&i) {
            order.push(i);
        }
    }

    let mut last_img: Option<DynamicImage> = None;
    let mut last_err: String = String::new();

    for attempt in 0..MAX_ATTEMPTS {
        for &idx in &order {
            match screens[idx].capture() {
                Ok(rgba) => {
                    let img = DynamicImage::ImageRgba8(rgba);
                    last_img = Some(img.clone());
                    if !is_blank(&img) {
                        return Ok(img);
                    }
                }
                Err(e) => {
                    last_err = format!("Screen {idx} capture failed: {e}");
                }
            }
        }
        if attempt + 1 < MAX_ATTEMPTS {
            sleep(Duration::from_millis(RETRY_DELAY_MS));
        }
    }

    // Every attempt was blank (or failed); return the last frame we got so a
    // file is still produced, but surface a warning.
    if let Some(img) = last_img {
        eprintln!("[Capture] Warning: all capture attempts looked blank; saving last frame.");
        Ok(img)
    } else {
        Err(DomainError::Other(if last_err.is_empty() {
            "Screen capture failed".into()
        } else {
            last_err
        }))
    }
}

/// Capture a screen and save it as a PNG file.
pub fn capture_screen_to_file(path: &Path, monitor: Option<usize>) -> Result<()> {
    let img = capture_screen(monitor)?;
    img.save(path)
        .map_err(|e| DomainError::Other(format!("Saving screenshot failed: {e}")))
}

/// Convenience helper returning the raw RGBA buffer for vision/template matching.
pub fn capture_screen_rgba(monitor: Option<usize>) -> Result<RgbaImage> {
    Ok(capture_screen(monitor)?.to_rgba8())
}
