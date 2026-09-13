use std::ffi::c_void;
use super::win_types::*;
use super::win_api::*;

pub unsafe fn position_window(hwnd: HWND, rect: (i32, i32, i32, i32)) {
    SetWindowPos(hwnd, WinHandle(std::ptr::null_mut()), rect.0, rect.1, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_SHOWWINDOW);
}

pub fn get_window_rect_coords(hwnd_val: isize) -> Option<(i32, i32, i32, i32)> {
    let hwnd = WinHandle(hwnd_val as *mut c_void);
    let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    unsafe {
        if GetWindowRect(hwnd, &mut rect) != 0 {
            Some((rect.left, rect.top, rect.right, rect.bottom))
        } else {
            None
        }
    }
}

pub fn move_window_to(hwnd_val: isize, x: i32, y: i32, width: i32, height: i32) -> bool {
    let hwnd = WinHandle(hwnd_val as *mut c_void);
    unsafe {
        SetWindowPos(
            hwnd,
            WinHandle(std::ptr::null_mut()),
            x,
            y,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        ) != 0
    }
}
