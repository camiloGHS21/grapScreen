use super::win_types::*;
use std::ffi::c_void;

/// Raster operation: copy source rectangle directly to destination.
pub const SRCCOPY: u32 = 0x00CC0020;

#[link(name = "user32")]
extern "system" {
    pub fn CreateDesktopW(lpsz_desktop: *const u16, lpsz_device: *const u16, p_devmode: *const c_void, dw_flags: u32, dw_desired_access: u32, lpsa: *const c_void) -> HDESK;
    pub fn GetWindowRect(h_wnd: HWND, lp_rect: *mut RECT) -> BOOL;
    pub fn IsZoomed(h_wnd: HWND) -> BOOL;
    pub fn IsIconic(h_wnd: HWND) -> BOOL;
    pub fn GetWindowPlacement(h_wnd: HWND, lpwndpl: *mut WINDOWPLACEMENT) -> BOOL;
    pub fn ScreenToClient(h_wnd: HWND, lp_point: *mut POINT) -> BOOL;
    pub fn ClientToScreen(h_wnd: HWND, lp_point: *mut POINT) -> BOOL;
    pub fn ChildWindowFromPoint(h_wnd: HWND, pt: POINT) -> HWND;
    pub fn OpenDesktopW(lpsz_desktop: *const u16, dw_flags: u32, f_inherit: BOOL, dw_desired_access: u32) -> HDESK;
    pub fn SetThreadDesktop(h_desktop: HDESK) -> BOOL;
    pub fn SwitchDesktop(h_desktop: HDESK) -> BOOL;
    pub fn CloseDesktop(h_desktop: HDESK) -> BOOL;
    pub fn EnumDesktopWindows(h_desktop: HDESK, lpfn: Option<unsafe extern "system" fn(HWND, LPARAM) -> BOOL>, l_param: LPARAM) -> BOOL;
    pub fn PostMessageW(h_wnd: HWND, msg: u32, w_param: WPARAM, l_param: LPARAM) -> BOOL;
    pub fn SendMessageW(h_wnd: HWND, msg: u32, w_param: WPARAM, l_param: LPARAM) -> LPARAM;
    pub fn SetWindowPos(h_wnd: HWND, h_wnd_insert_after: HWND, x: i32, y: i32, cx: i32, cy: i32, u_flags: u32) -> BOOL;
    pub fn GetClassNameW(h_wnd: HWND, lp_class_name: *mut u16, n_max_count: i32) -> i32;
    pub fn GetWindowTextW(h_wnd: HWND, lp_string: *mut u16, n_max_count: i32) -> i32;
    pub fn GetForegroundWindow() -> HWND;
    pub fn GetWindowThreadProcessId(h_wnd: HWND, lpdw_process_id: *mut u32) -> u32;
    pub fn SetForegroundWindow(h_wnd: HWND) -> BOOL;
    pub fn AllowSetForegroundWindow(dw_process_id: u32) -> BOOL;
    pub fn MapVirtualKeyW(u_code: u32, u_map_type: u32) -> u32;
    pub fn ToUnicode(vk: u32, sc: u32, keystate: *const u8, pwsz_buff: *mut u16, cch_buff: i32, flags: u32) -> i32;
    pub fn PrintWindow(hwnd: HWND, hdc_blt: HDC, n_flags: u32) -> BOOL;
    pub fn GetDC(hwnd: HWND) -> HDC;
    pub fn ReleaseDC(hwnd: HWND, hdc: HDC) -> i32;
    pub fn BitBlt(hdc: HDC, x: i32, y: i32, cx: i32, cy: i32, hdc_src: HDC, x1: i32, y1: i32, rop: u32) -> BOOL;
    pub fn SendInput(c_inputs: u32, p_inputs: *const INPUT, cb_size: i32) -> u32;
    pub fn GetMessageExtraInfo() -> LPARAM;
    pub fn GetSystemMetrics(n_index: i32) -> i32;
    pub fn GetCursorPos(lp_point: *mut POINT) -> BOOL;
    pub fn SetCursorPos(x: i32, y: i32) -> BOOL;
    pub fn EnumWindows(lpEnumFunc: Option<unsafe extern "system" fn(HWND, LPARAM) -> BOOL>, lParam: LPARAM) -> BOOL;
    pub fn IsWindowVisible(hWnd: HWND) -> BOOL;
    pub fn ShowWindowAsync(hWnd: HWND, nCmdShow: i32) -> BOOL;
}

#[link(name = "kernel32")]
extern "system" {
    pub fn OpenProcess(dw_desired_access: u32, b_inherit_handle: BOOL, dw_process_id: u32) -> HANDLE;
    pub fn WaitForSingleObject(h_handle: HANDLE, dw_milliseconds: u32) -> u32;
    pub fn QueryFullProcessImageNameW(h_process: HANDLE, dw_flags: u32, lp_exe_name: *mut u16, lpdw_size: *mut u32) -> BOOL;
    pub fn CreateProcessW(
        lp_application_name: *const u16,
        lp_command_line: *mut u16,
        lp_process_attributes: *const c_void,
        lp_thread_attributes: *const c_void,
        b_inherit_handles: BOOL,
        dw_creation_flags: u32,
        lp_environment: *const c_void,
        lp_current_directory: *const u16,
        lp_startup_info: *const STARTUPINFOW,
        lp_process_information: *mut PROCESS_INFORMATION,
    ) -> BOOL;
    pub fn TerminateProcess(h_process: HANDLE, u_exit_code: u32) -> BOOL;
    pub fn CloseHandle(h_object: HANDLE) -> BOOL;
    pub fn FreeConsole() -> BOOL;
    pub fn AttachConsole(dw_process_id: u32) -> BOOL;
    pub fn GetStdHandle(n_std_handle: u32) -> HANDLE;
    pub fn WriteConsoleInputW(h_console_input: HANDLE, lp_buffer: *const INPUT_RECORD, n_length: u32, lp_number_of_events_written: *mut u32) -> BOOL;
    pub fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> HANDLE;
    pub fn Process32FirstW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32) -> BOOL;
    pub fn Process32NextW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32) -> BOOL;
}

#[link(name = "gdi32")]
extern "system" {
    pub fn CreateCompatibleDC(hdc: HDC) -> HDC;
    pub fn CreateCompatibleBitmap(hdc: HDC, cx: i32, cy: i32) -> HBITMAP;
    pub fn DeleteDC(hdc: HDC) -> i32;
    pub fn SelectObject(hdc: HDC, h: *mut c_void) -> *mut c_void;
    pub fn GetDIBits(hdc: HDC, hbmp: HBITMAP, u_start_scan: u32, c_scan_lines: u32, lpv_bits: *mut c_void, lpbi: *mut BITMAPINFO, u_usage: u32) -> i32;
    pub fn DeleteObject(h: *mut c_void) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    pub fn CoIncrementMTAUsage() -> i32;
}
