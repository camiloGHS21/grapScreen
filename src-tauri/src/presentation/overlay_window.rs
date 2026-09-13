use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[cfg(target_os = "windows")]
use windows::core::w;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{CreateSolidBrush, DeleteObject, HBRUSH};
#[cfg(target_os = "windows")]
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, GetMessageW, GetSystemMetrics, LoadCursorW, RegisterClassW,
    ShowWindow, CS_HREDRAW, CS_VREDRAW, HCURSOR, HICON, IDC_ARROW, SM_CXSCREEN, SM_CYSCREEN,
    SW_SHOW, WM_DESTROY, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOPMOST,
    WS_EX_TRANSPARENT, WS_POPUP, MSG,
};
#[cfg(target_os = "windows")]
use super::overlay_proc::{border_wnd_proc, btn_wnd_proc, WindowData};

#[cfg(target_os = "windows")]
pub struct RecordOverlay {
    pub hwnd_border: HWND,
    pub hwnd_btn: HWND,
    running: Arc<AtomicBool>,
    _thread_handle: Option<std::thread::JoinHandle<()>>,
    pub elapsed_secs: Arc<AtomicU64>,
}

#[cfg(target_os = "windows")]
impl RecordOverlay {
    pub fn show(
        stop_flag: Arc<AtomicBool>,
        cancel_flag: Arc<AtomicBool>,
        pause_flag: Arc<AtomicBool>,
        paused: Arc<AtomicBool>,
    ) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let elapsed_secs = Arc::new(AtomicU64::new(0));
        let elapsed_clone = elapsed_secs.clone();
        let _start = std::time::Instant::now();

        let (tx, rx) = std::sync::mpsc::channel::<isize>();

        let thread_handle = std::thread::spawn(move || unsafe {
            let h_instance = GetModuleHandleW(None).unwrap_or_default();
            let class_border = w!("RecordingBorderClass");
            let _class_btn = w!("RecordingButtonClass");

            let black_brush = CreateSolidBrush(COLORREF(0));

            let wnd_class_border = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(border_wnd_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: h_instance.into(),
                hIcon: HICON::default(),
                hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
                hbrBackground: black_brush,
                lpszMenuName: windows::core::PCWSTR::null(),
                lpszClassName: class_border,
            };
            let _ = RegisterClassW(&wnd_class_border);

            let screen_width = GetSystemMetrics(SM_CXSCREEN);
            let screen_height = GetSystemMetrics(SM_CYSCREEN);

            let hwnd_border = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE,
                class_border,
                w!(""),
                WS_POPUP,
                0,
                0,
                screen_width,
                screen_height,
                HWND::default(),
                None,
                h_instance,
                None,
            )
            .unwrap();

            let _ = windows::Win32::UI::WindowsAndMessaging::SetLayeredWindowAttributes(
                hwnd_border,
                COLORREF(0),
                0,
                windows::Win32::UI::WindowsAndMessaging::LWA_COLORKEY,
            );

            let _ = ShowWindow(hwnd_border, SW_SHOW);

            let _ = tx.send(hwnd_border.0 as isize);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                if !running_clone.load(Ordering::Relaxed) {
                    break;
                }
                let _ = windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                let _ = windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
            }

            let _ = DeleteObject(black_brush);
            let _ = DestroyWindow(hwnd_border);
        });

        let hwnd_val = rx.recv().unwrap_or(0);
        let hwnd_border = HWND(hwnd_val as *mut _);

        RecordOverlay {
            hwnd_border,
            hwnd_btn: HWND::default(),
            running,
            _thread_handle: Some(thread_handle),
            elapsed_secs,
        }
    }

    pub fn hide(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::PostMessageW(
                self.hwnd_border,
                WM_DESTROY,
                WPARAM(0),
                LPARAM(0),
            );
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for RecordOverlay {
    fn drop(&mut self) {
        self.hide();
    }
}

#[cfg(target_os = "windows")]
unsafe impl Send for RecordOverlay {}
#[cfg(target_os = "windows")]
unsafe impl Sync for RecordOverlay {}

#[cfg(not(target_os = "windows"))]
pub struct RecordOverlay {
    pub elapsed_secs: Arc<AtomicU64>,
}

#[cfg(not(target_os = "windows"))]
impl RecordOverlay {
    pub fn show(
        _stop_flag: Arc<AtomicBool>,
        _cancel_flag: Arc<AtomicBool>,
        _pause_flag: Arc<AtomicBool>,
        _paused: Arc<AtomicBool>,
    ) -> Self {
        RecordOverlay {
            elapsed_secs: Arc::new(AtomicU64::new(0)),
        }
    }
    pub fn hide(&mut self) {}
}

