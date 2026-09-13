use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecordedEvent {
    pub at_ms: u64,
    pub kind: String,
    pub data: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutomationFile {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub duration_ms: u64,
    pub generate_mp4: bool,
    pub events: Vec<RecordedEvent>,
    #[serde(default)]
    pub target_app: Option<TargetApp>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct TargetApp {
    pub exe: String,
    pub title: String,
    pub class: String,
    #[serde(default)]
    pub name: String,
    pub rect: (i32, i32, i32, i32),
    #[serde(default)]
    pub pid: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl MouseButton {
    pub fn from_str(s: &str) -> Self {
        match s {
            "Right" => Self::Right,
            "Middle" => Self::Middle,
            _ => Self::Left,
        }
    }
}

#[derive(Debug, Clone)]
pub enum ActionRequest {
    MouseMove {
        x: i32,
        y: i32,
    },
    Click {
        x: i32,
        y: i32,
        button: MouseButton,
        window: Option<WindowContext>,
    },
    ButtonRelease {
        x: i32,
        y: i32,
        button: MouseButton,
        window: Option<WindowContext>,
    },
    TypeText {
        text: String,
        window: Option<WindowContext>,
    },
    KeyPress {
        key: String,
        modifiers: Vec<String>,
        window: Option<WindowContext>,
    },
    KeyRelease {
        key: String,
        modifiers: Vec<String>,
        window: Option<WindowContext>,
    },
    Scroll {
        x: i32,
        y: i32,
        delta_x: i64,
        delta_y: i64,
        window: Option<WindowContext>,
    },
    WindowFocus {
        window: WindowContext,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowContext {
    pub title: String,
    pub class: String,
    pub exe: String,
    pub pid: u32,
    pub hwnd: Option<isize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionResult {
    Executed {
        backend: String,
        intrusive: bool,
    },
    Unsupported,
    Failed(String),
}

#[derive(Debug, thiserror::Error, Serialize, Deserialize, Clone)]
pub enum DomainError {
    #[error("IO Error: {0}")]
    Io(String),
    #[error("Tauri Error: {0}")]
    Tauri(String),
    #[error("Serialization Error: {0}")]
    Serde(String),
    #[error("Other Error: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, DomainError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrBox {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub confidence: f64,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrScan {
    pub screen_width: u32,
    pub screen_height: u32,
    pub language: String,
    pub elapsed_ms: u128,
    pub text: String,
    pub boxes: Vec<OcrBox>,
}
