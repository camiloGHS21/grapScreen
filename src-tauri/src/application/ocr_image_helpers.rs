use std::time::Instant;
use std::path::PathBuf;
use crate::domain::ports_out::OcrPort;
use super::replay_helpers::interpolate_variables;

pub fn check_ocr_condition(ocr_port: &dyn OcrPort, query: &str) -> bool {
    let query = interpolate_variables(query).to_lowercase();
    if query.is_empty() {
        return true;
    }
    if let Ok(scan) = ocr_port.scan_screen_text() {
        for item in scan.boxes {
            if item.text.to_lowercase().contains(&query) {
                return true;
            }
        }
    }
    false
}

fn template_path(id: &str) -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("grapScreen").join("projects").join("templates");
    Some(dir.join(format!("{}.png", id)))
}

pub fn check_image_match(template_id: &str) -> bool {
    let template_id = interpolate_variables(template_id);
    let Some(path) = template_path(&template_id) else {
        return false;
    };
    if !path.exists() {
        return false;
    }
    let Ok(template_img) = image::open(&path) else {
        return false;
    };
    let template_luma = template_img.to_luma8();
    
    let Ok(screen_img) = crate::infrastructure::screen_capture::capture_screen_rgba(None) else {
        return false;
    };
    let screen_luma = image::DynamicImage::ImageRgba8(screen_img).to_luma8();
    
    if template_luma.width() >= screen_luma.width() || template_luma.height() >= screen_luma.height() {
        return false;
    }
    let scores = imageproc::template_matching::match_template(
        &screen_luma,
        &template_luma,
        imageproc::template_matching::MatchTemplateMethod::SumOfSquaredErrorsNormalized
    );
    let extremes = imageproc::template_matching::find_extremes(&scores);
    let confidence = 1.0 - extremes.min_value as f64;
    confidence >= 0.86
}
