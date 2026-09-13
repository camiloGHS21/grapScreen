use std::ffi::c_void;

#[repr(transparent)]
#[derive(Clone, Copy)]
pub struct WinHandle(pub *mut c_void);
unsafe impl Send for WinHandle {}
unsafe impl Sync for WinHandle {}
impl WinHandle {
    pub fn is_null(&self) -> bool {
        self.0.is_null()
    }
}

pub type HWND = WinHandle;
pub type HDESK = WinHandle;
pub type HANDLE = WinHandle;
pub type HDC = *mut c_void;
pub type HBITMAP = *mut c_void;
pub type BOOL = i32;
pub type WPARAM = usize;
pub type LPARAM = isize;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct RECT {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct WINDOWPLACEMENT {
    pub length: u32,
    pub flags: u32,
    pub show_cmd: u32,
    pub pt_min_position: POINT,
    pub pt_max_position: POINT,
    pub rc_normal_position: RECT,
}

#[repr(C)]
pub struct STARTUPINFOW {
    pub cb: u32,
    pub lp_reserved: *mut u16,
    pub lp_desktop: *mut u16,
    pub lp_title: *mut u16,
    pub dw_x: u32,
    pub dw_y: u32,
    pub dw_x_size: u32,
    pub dw_y_size: u32,
    pub dw_x_count_chars: u32,
    pub dw_y_count_chars: u32,
    pub dw_fill_attribute: u32,
    pub dw_flags: u32,
    pub w_show_window: u16,
    pub cb_reserved2: u16,
    pub lp_reserved2: *mut u8,
    pub h_std_input: HANDLE,
    pub h_std_output: HANDLE,
    pub h_std_error: HANDLE,
}

#[repr(C)]
pub struct PROCESS_INFORMATION {
    pub h_process: HANDLE,
    pub h_thread: HANDLE,
    pub dw_process_id: u32,
    pub dw_thread_id: u32,
}

#[repr(C)]
pub struct BITMAPINFOHEADER {
    pub bi_size: u32,
    pub bi_width: i32,
    pub bi_height: i32,
    pub bi_planes: u16,
    pub bi_bit_count: u16,
    pub bi_compression: u32,
    pub bi_size_image: u32,
    pub bi_x_pels_per_meter: i32,
    pub bi_y_pels_per_meter: i32,
    pub bi_clr_used: u32,
    pub bi_clr_important: u32,
}

#[repr(C)]
pub struct BITMAPINFO {
    pub bmi_header: BITMAPINFOHEADER,
    pub bmi_colors: [u32; 1],
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct MOUSEINPUT {
    pub dx: i32,
    pub dy: i32,
    pub mouse_data: u32,
    pub flags: u32,
    pub time: u32,
    pub extra_info: usize,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct KEYBDINPUT {
    pub w_vk: u16,
    pub w_scan: u16,
    pub flags: u32,
    pub time: u32,
    pub extra_info: usize,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub union INPUT_UNION {
    pub mi: MOUSEINPUT,
    pub ki: KEYBDINPUT,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct INPUT {
    pub type_: u32,
    pub u: INPUT_UNION,
}

#[repr(C)]
pub struct KEY_EVENT_RECORD {
    pub bKeyDown: i32,
    pub wRepeatCount: u16,
    pub wVirtualKeyCode: u16,
    pub wVirtualScanCode: u16,
    pub uChar: u16,
    pub dwControlKeyState: u32,
}

#[repr(C)]
pub struct INPUT_RECORD {
    pub EventType: u16,
    pub _pad: u16,
    pub key: KEY_EVENT_RECORD,
}

#[repr(C)]
pub struct PROCESSENTRY32 {
    pub dw_size: u32,
    pub cnt_usage: u32,
    pub th32_process_id: u32,
    pub th32_default_heap_id: usize,
    pub th32_module_id: u32,
    pub cnt_threads: u32,
    pub th32_parent_process_id: u32,
    pub pc_priority_class: i32,
    pub dw_flags: u32,
    pub sz_exe_file: [u16; 260],
}

#[derive(Clone, Copy)]
pub struct KeyMods {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub last_hwnd: HWND,
}

impl Default for KeyMods {
    fn default() -> Self {
        KeyMods {
            shift: false,
            ctrl: false,
            alt: false,
            last_hwnd: WinHandle(std::ptr::null_mut()),
        }
    }
}

// ---- Constants ----
pub const INPUT_MOUSE: u32 = 0;
pub const INPUT_KEYBOARD: u32 = 1;
pub const MOUSEEVENTF_MOVE: u32 = 0x0001;
pub const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
pub const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
pub const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
pub const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
pub const MOUSEEVENTF_WHEEL: u32 = 0x0800;
pub const MOUSEEVENTF_ABSOLUTE: u32 = 0x8000;
pub const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
pub const KEYEVENTF_KEYUP: u32 = 0x0002;
pub const SM_CXSCREEN: i32 = 0;
pub const SM_CYSCREEN: i32 = 1;

pub const WM_MOUSEMOVE: u32 = 0x0200;
pub const WM_LBUTTONDOWN: u32 = 0x0201;
pub const WM_LBUTTONUP: u32 = 0x0202;
pub const WM_RBUTTONDOWN: u32 = 0x0204;
pub const WM_RBUTTONUP: u32 = 0x0205;
pub const WM_MOUSEWHEEL: u32 = 0x020A;
pub const WM_KEYDOWN: u32 = 0x0100;
pub const WM_KEYUP: u32 = 0x0101;
pub const WM_CHAR: u32 = 0x0102;
pub const WM_SETFOCUS: u32 = 0x0007;
pub const WM_ACTIVATE: u32 = 0x0006;
pub const WM_NCACTIVATE: u32 = 0x0086;
pub const MK_LBUTTON: u32 = 0x0001;
pub const MK_RBUTTON: u32 = 0x0002;
pub const SWP_NOMOVE: u32 = 0x0002;
pub const SWP_NOSIZE: u32 = 0x0001;
pub const SWP_NOZORDER: u32 = 0x0004;
pub const SWP_NOACTIVATE: u32 = 0x0010;
pub const SWP_SHOWWINDOW: u32 = 0x0040;
pub const CREATE_NEW_CONSOLE: u32 = 0x00000010;
pub const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
pub const PROCESS_VM_READ: u32 = 0x0010;
pub const GENERIC_ALL: u32 = 0x10000000;
pub const PW_CLIENTONLY: u32 = 0x00000001;
pub const STD_INPUT_HANDLE: u32 = 0xFFFFFFF6;
pub const KEY_EVENT: u16 = 0x0001;

pub const TH32CS_SNAPPROCESS: u32 = 0x00000002;
pub const INVALID_HANDLE_VALUE: isize = -1;

pub fn key_to_vk(name: &str) -> Option<u32> {
    Some(match name {
        "KeyA" => 0x41, "KeyB" => 0x42, "KeyC" => 0x43, "KeyD" => 0x44, "KeyE" => 0x45,
        "KeyF" => 0x46, "KeyG" => 0x47, "KeyH" => 0x48, "KeyI" => 0x49, "KeyJ" => 0x4A,
        "KeyK" => 0x4B, "KeyL" => 0x4C, "KeyM" => 0x4D, "KeyN" => 0x4E, "KeyO" => 0x4F,
        "KeyP" => 0x50, "KeyQ" => 0x51, "KeyR" => 0x52, "KeyS" => 0x53, "KeyT" => 0x54,
        "KeyU" => 0x55, "KeyV" => 0x56, "KeyW" => 0x57, "KeyX" => 0x58, "KeyY" => 0x59,
        "KeyZ" => 0x5A,
        "Num0" => 0x30, "Num1" => 0x31, "Num2" => 0x32, "Num3" => 0x33, "Num4" => 0x34,
        "Num5" => 0x35, "Num6" => 0x36, "Num7" => 0x37, "Num8" => 0x38, "Num9" => 0x39,
        "F1" => 0x70, "F2" => 0x71, "F3" => 0x72, "F4" => 0x73, "F5" => 0x74, "F6" => 0x75,
        "F7" => 0x76, "F8" => 0x77, "F9" => 0x78, "F10" => 0x79, "F11" => 0x7A, "F12" => 0x7B,
        "Return" => 0x0D, "Space" => 0x20, "Tab" => 0x09, "Escape" => 0x1B,
        "Backspace" => 0x08, "Delete" => 0x2E, "Insert" => 0x2D, "Home" => 0x24,
        "End" => 0x23, "PageUp" => 0x21, "PageDown" => 0x22, "LeftArrow" => 0x25,
        "UpArrow" => 0x26, "RightArrow" => 0x27, "DownArrow" => 0x28,
        "ShiftLeft" => 0xA0, "ShiftRight" => 0xA1, "ControlLeft" => 0xA2, "ControlRight" => 0xA3,
        "Alt" => 0xA4, "AltGr" => 0xA5, "MetaLeft" => 0x5B, "MetaRight" => 0x5C,
        "CapsLock" => 0x14, "Enter" => 0x0D,
        _ => return None,
    })
}
