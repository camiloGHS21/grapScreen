use image::{DynamicImage, ImageFormat, RgbaImage, imageops::FilterType};
use std::io::Cursor;
use std::ffi::c_void;

use super::win_types::*;
use super::win_api::*;
use super::win_window_search::find_existing_window;
use crate::domain::entities::TargetApp;

/// Read the selected bitmap out of `mem` into a RGBA byte buffer (BGR swap done).
unsafe fn read_window_bits(mem: HDC, bmp: HBITMAP, w: i32, h: i32) -> Option<Vec<u8>> {
    let mut bi = BITMAPINFO {
        bmi_header: BITMAPINFOHEADER {
            bi_size: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            bi_width: w,
            bi_height: -h,
            bi_planes: 1,
            bi_bit_count: 32,
            bi_compression: 0,
            bi_size_image: (w as u32 * h as u32 * 4),
            bi_x_pels_per_meter: 0,
            bi_y_pels_per_meter: 0,
            bi_clr_used: 0,
            bi_clr_important: 0,
        },
        bmi_colors: [0],
    };
    let mut buf = vec![0u8; w as usize * h as usize * 4];
    GetDIBits(mem, bmp, 0, h as u32, buf.as_mut_ptr() as *mut c_void, &mut bi, 0);

    for i in (0..buf.len()).step_by(4) {
        let (b, r) = (buf[i], buf[i + 2]);
        buf[i] = r;
        buf[i + 2] = b;
    }
    Some(buf)
}

/// A captured window is considered blank when its sampled pixels share almost
/// the same color (e.g. solid black from a failed PrintWindow on a GPU app).
unsafe fn is_blank_bits(buf: &[u8], w: i32, h: i32) -> bool {
    if w <= 0 || h <= 0 || buf.len() < 4 {
        return true;
    }
    let samples: u64 = 200;
    let mut min = [255u8; 3];
    let mut max = [0u8; 3];
    for i in 0..samples {
        let x = ((i.wrapping_mul(2654435761)) % w as u64) as usize % w as usize;
        let y = ((i.wrapping_mul(40503)) % h as u64) as usize % h as usize;
        let o = (y * w as usize + x) * 4;
        if o + 2 >= buf.len() {
            continue;
        }
        for c in 0..3 {
            min[c] = min[c].min(buf[o + c]);
            max[c] = max[c].max(buf[o + c]);
        }
    }
    let range = (0..3).map(|c| max[c].saturating_sub(min[c])).max().unwrap_or(0);
    range < 6
}

pub unsafe fn capture_window_png(hwnd: HWND) -> Option<Vec<u8>> {
    let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    GetWindowRect(hwnd, &mut rect);
    let w = ((rect.right - rect.left).max(1)) as i32;
    let h = ((rect.bottom - rect.top).max(1)) as i32;

    let screen = GetDC(WinHandle(std::ptr::null_mut()));
    if screen.is_null() {
        return None;
    }
    let mem = CreateCompatibleDC(screen);
    let bmp = CreateCompatibleBitmap(screen, w, h);
    let old = SelectObject(mem, bmp as *mut c_void);

    // PW_RENDERFULLCONTENT (2) forces DWM to paint even GPU-accelerated content,
    // which is what most modern apps (Chrome, Electron, WPF) need.
    let grab_print = |flag: u32| -> Option<Vec<u8>> {
        SelectObject(mem, bmp as *mut c_void);
        let _ = PrintWindow(hwnd, mem, flag);
        read_window_bits(mem, bmp, w, h)
    };
    // BitBlt of the on-screen pixels is the most reliable fallback, though it
    // can include overlapping windows.
    let grab_blit = || -> Option<Vec<u8>> {
        SelectObject(mem, bmp as *mut c_void);
        let _ = BitBlt(mem, 0, 0, w, h, screen, rect.left, rect.top, SRCCOPY);
        read_window_bits(mem, bmp, w, h)
    };

    let buf = grab_print(2)
        .filter(|b| !is_blank_bits(b, w, h))
        .or_else(|| grab_print(1).filter(|b| !is_blank_bits(b, w, h)))
        .or_else(|| grab_blit().filter(|b| !is_blank_bits(b, w, h)))
        .or_else(|| grab_print(2));

    SelectObject(mem, old);
    DeleteObject(bmp as *mut c_void);
    DeleteDC(mem);
    ReleaseDC(WinHandle(std::ptr::null_mut()), screen);

    let buf = buf?;
    let img = RgbaImage::from_raw(w as u32, h as u32, buf)?;

    let nw = 460u32.min(w as u32);
    let nh = if w > 0 { h as u32 * nw / w as u32 } else { h as u32 };
    let small = DynamicImage::ImageRgba8(img).resize(nw, nh, FilterType::Nearest);

    let mut out: Vec<u8> = Vec::new();
    if small.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).is_ok() {
        Some(out)
    } else {
        None
    }
}

pub fn capture_target_preview(target: &TargetApp) -> Option<Vec<u8>> {
    let hwnd = find_existing_window(target)?;
    unsafe { capture_window_png(hwnd) }
}
