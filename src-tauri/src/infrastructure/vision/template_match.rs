use crate::domain::entities::{Result, DomainError};
use crate::domain::ports_out::VisionPort;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::{imageops::{resize, FilterType}, DynamicImage, GrayImage, ImageBuffer, Rgba};
use imageproc::template_matching::{find_extremes, match_template, MatchTemplateMethod};

/// Infrastructure adapter implementing VisionPort using template matching.
pub struct TemplateMatchAdapter;

impl TemplateMatchAdapter {
    pub fn new() -> Self {
        Self
    }
}

fn capture_primary() -> std::result::Result<ImageBuffer<Rgba<u8>, Vec<u8>>, DomainError> {
    crate::infrastructure::screen_capture::capture_screen_rgba(None)
}

fn confidence_from_sse(value: f32) -> f64 {
    (1.0 - value as f64).clamp(0.0, 1.0)
}

fn best_match(screen: &GrayImage, original: &GrayImage, scales: &[f64]) -> Option<(f64, u32, u32, u32, u32, f64)> {
    let mut best: Option<(f64, u32, u32, u32, u32, f64)> = None;
    for &scale in scales {
        if !(0.5..=2.0).contains(&scale) {
            continue;
        }
        let width = ((original.width() as f64 * scale).round() as u32).max(4);
        let height = ((original.height() as f64 * scale).round() as u32).max(4);
        if width >= screen.width() || height >= screen.height() {
            continue;
        }
        let template = if width == original.width() && height == original.height() {
            original.clone()
        } else {
            resize(original, width, height, FilterType::Triangle)
        };
        let scores = match_template(screen, &template, MatchTemplateMethod::SumOfSquaredErrorsNormalized);
        let extremes = find_extremes(&scores);
        let confidence = confidence_from_sse(extremes.min_value);
        let candidate = (confidence, extremes.min_value_location.0, extremes.min_value_location.1, width, height, scale);
        if best.as_ref().map(|x| candidate.0 > x.0).unwrap_or(true) {
            best = Some(candidate);
        }
    }
    best
}

impl VisionPort for TemplateMatchAdapter {
    fn find_template(&self, template_png_base64: &str) -> Result<(i32, i32)> {
        let dec = STANDARD.decode(template_png_base64)
            .map_err(|e| DomainError::Other(format!("Base64 template decode failed: {e}")))?;
        let template_img = image::load_from_memory(&dec)
            .map_err(|e| DomainError::Other(format!("Image load from memory failed: {e}")))?
            .to_luma8();
        
        let screen = DynamicImage::ImageRgba8(capture_primary()?).to_luma8();
        let scales = vec![0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15];
        
        let Some((confidence, left, top, width, height, _scale)) = best_match(&screen, &template_img, &scales) else {
            return Err(DomainError::Other("Template matching failed to find any candidate".into()));
        };
        
        if confidence < 0.86 {
            return Err(DomainError::Other(format!("Confidence ({}) below threshold (0.86)", confidence)));
        }
        
        let x = left + width / 2;
        let y = top + height / 2;
        Ok((x as i32, y as i32))
    }
}
