#![cfg(target_os = "windows")]

use std::sync::atomic::{Ordering, AtomicBool, AtomicU64};
use std::sync::Arc;
use std::time::Instant;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM, RECT, COLORREF};
use windows::Win32::Graphics::Gdi::{
    CreateSolidBrush, DeleteObject, FillRect, BeginPaint, EndPaint, PAINTSTRUCT,
    GetStockObject, WHITE_BRUSH, DrawTextW, SetTextColor, SetBkMode, SelectObject,
    RoundRect, CreatePen, PS_SOLID, HDC, DT_CENTER, DT_VCENTER, DT_LEFT, TRANSPARENT,
    InvalidateRect, Ellipse,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, PostQuitMessage, WM_DESTROY, WM_PAINT, WM_LBUTTONDOWN, WM_TIMER,
    GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
};

pub struct WindowData {
    pub stop_flag: Arc<AtomicBool>,
    pub cancel_flag: Arc<AtomicBool>,
    pub pause_flag: Arc<AtomicBool>,
    pub elapsed_secs: Arc<AtomicU64>,
    pub paused: Arc<AtomicBool>,
    pub start: Instant,
}

pub extern "system" fn border_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);
                let screen_width = GetSystemMetrics(SM_CXSCREEN);
                let screen_height = GetSystemMetrics(SM_CYSCREEN);
                
                let black_brush = CreateSolidBrush(COLORREF(0x00000000));
                let thickness = 4;
                
                FillRect(hdc, &RECT { left: 0, top: 0, right: screen_width, bottom: thickness }, black_brush);
                FillRect(hdc, &RECT { left: 0, top: screen_height - thickness, right: screen_width, bottom: screen_height }, black_brush);
                FillRect(hdc, &RECT { left: 0, top: 0, right: thickness, bottom: screen_height }, black_brush);
                FillRect(hdc, &RECT { left: screen_width - thickness, top: 0, right: screen_width, bottom: screen_height }, black_brush);
                
                let _ = DeleteObject(black_brush);
                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            WM_DESTROY => { PostQuitMessage(0); LRESULT(0) }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

pub extern "system" fn btn_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_TIMER => { let _ = InvalidateRect(hwnd, None, false); LRESULT(0) }
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);
                let ptr = windows::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(
                    hwnd, windows::Win32::UI::WindowsAndMessaging::GWLP_USERDATA,
                ) as *const WindowData;
                let paused = if !ptr.is_null() { (*ptr).paused.load(Ordering::Relaxed) } else { false };
                if !ptr.is_null() {
                    let data = &*ptr;
                    if !paused {
                        let secs = data.start.elapsed().as_secs() + (data.start.elapsed().subsec_millis() as u64 + 500) / 1000;
                        data.elapsed_secs.store(secs, Ordering::Relaxed);
                    }
                }
                let total = if !ptr.is_null() { (*ptr).elapsed_secs.load(Ordering::Relaxed) } else { 0 };
                let mm = (total % 3600) / 60;
                let ss = total % 60;
                let (panel_w, panel_h) = (430, 70);

                let bg_brush = CreateSolidBrush(COLORREF(0x0026262E));
                let bg_pen = CreatePen(PS_SOLID, 1, COLORREF(0x005A5A66));
                let old_pen = SelectObject(hdc, bg_pen);
                let old_brush = SelectObject(hdc, bg_brush);
                let _ = RoundRect(hdc, 0, 0, panel_w, panel_h, 16, 16);
                let _ = SelectObject(hdc, old_brush);
                let _ = SelectObject(hdc, old_pen);
                let _ = DeleteObject(bg_brush);
                let _ = DeleteObject(bg_pen);

                let accent_brush = CreateSolidBrush(COLORREF(0x0028C840));
                let old_acc = SelectObject(hdc, accent_brush);
                let _ = RoundRect(hdc, 8, 12, 14, panel_h - 12, 3, 3);
                let _ = SelectObject(hdc, old_acc);
                let _ = DeleteObject(accent_brush);

                let dot_color = if paused { COLORREF(0x00AAAAAA) } else if (total % 2) == 0 { COLORREF(0x00E53935) } else { COLORREF(0x00800040) };
                let dot_brush = CreateSolidBrush(dot_color);
                let old = SelectObject(hdc, dot_brush);
                let _ = Ellipse(hdc, 26, 27, 40, 41);
                let _ = SelectObject(hdc, old);
                let _ = DeleteObject(dot_brush);

                let _ = SetTextColor(hdc, if paused { COLORREF(0x00AAAAAA) } else { COLORREF(0x00FFFFFF) });
                let _ = SetBkMode(hdc, TRANSPARENT);
                let rec_label = if paused { "PAUSADO" } else { "REC" };
                let rec_text = windows::core::HSTRING::from(rec_label);
                let mut rec_buf: Vec<u16> = rec_text.as_wide().to_vec();
                let mut rec_rect = RECT { left: 50, top: 16, right: 110, bottom: 36 };
                let _ = DrawTextW(hdc, &mut rec_buf, &mut rec_rect, DT_LEFT | DT_VCENTER);

                let _ = SetTextColor(hdc, COLORREF(0x0028C840));
                let time_str = format!("{:02}:{:02}", mm, ss);
                let time_text = windows::core::HSTRING::from(time_str);
                let mut time_buf: Vec<u16> = time_text.as_wide().to_vec();
                let mut time_rect = RECT { left: 46, top: 34, right: 150, bottom: panel_h };
                let _ = DrawTextW(hdc, &mut time_buf, &mut time_rect, DT_LEFT | DT_VCENTER);

                draw_button(hdc, 150, 16, 80, 32, if paused { "REANUD" } else { "PAUSA" }, 0x00E0A93B, 0x001A1A1A);
                draw_button(hdc, 240, 16, 90, 32, "DETENER", 0x0028C840, 0x00FFFFFF);
                draw_button(hdc, 340, 16, 84, 32, "CANCELAR", 0x00E53935, 0x00FFFFFF);

                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            0x0021 => LRESULT(3),
            WM_LBUTTONDOWN => {
                let x = (lparam.0 & 0xFFFF) as i16 as i32;
                let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
                let ptr = windows::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(
                    hwnd, windows::Win32::UI::WindowsAndMessaging::GWLP_USERDATA,
                ) as *mut WindowData;
                if !ptr.is_null() {
                    let data = &mut *ptr;
                    if x >= 150 && x <= 230 && y >= 16 && y <= 48 {
                        let now = !data.paused.load(Ordering::Relaxed);
                        data.paused.store(now, Ordering::Relaxed);
                        data.pause_flag.store(true, Ordering::Relaxed);
                    } else if x >= 240 && x <= 330 && y >= 16 && y <= 48 {
                        data.stop_flag.store(true, Ordering::Relaxed);
                    } else if x >= 340 && x <= 424 && y <= 48 {
                        data.cancel_flag.store(true, Ordering::Relaxed);
                    }
                    let _ = InvalidateRect(hwnd, None, false);
                }
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

fn draw_button(hdc: HDC, x: i32, y: i32, w: i32, h: i32, label: &str, fill: u32, text_color: u32) {
    unsafe {
        let bg = CreateSolidBrush(COLORREF(fill));
        let pen = CreatePen(PS_SOLID, 1, COLORREF(0x00000000));
        let old_pen = SelectObject(hdc, pen);
        let old_brush = SelectObject(hdc, bg);
        let _ = RoundRect(hdc, x, y, x + w, y + h, 16, 16);
        let _ = SelectObject(hdc, old_brush);
        let _ = SelectObject(hdc, old_pen);
        let _ = DeleteObject(bg);
        let _ = DeleteObject(pen);
        let _ = SetTextColor(hdc, COLORREF(text_color));
        let _ = SetBkMode(hdc, TRANSPARENT);
        let text = windows::core::HSTRING::from(label);
        let mut buf: Vec<u16> = text.as_wide().to_vec();
        let mut rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
        let _ = DrawTextW(hdc, &mut buf, &mut rect, DT_CENTER | DT_VCENTER);
        let _ = GetStockObject(WHITE_BRUSH);
    }
}
