use crate::domain::entities::{Result, DomainError};
use crate::domain::ports_out::VideoRecorderPort;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::path::{Path, PathBuf};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Manager, Emitter};
use std::io::Write;

/// If the output file does not grow for this many consecutive seconds we assume
/// ffmpeg's desktop-duplication handle died (black/blank video) and restart it.
const STALL_LIMIT_SECS: u64 = 4;

/// Infrastructure adapter implementing VideoRecorderPort using FFmpeg.
pub struct FfmpegVideoRecorderAdapter {
    app: AppHandle,
    child: Arc<Mutex<Option<Child>>>,
    output: Arc<Mutex<Option<PathBuf>>>,
    running: Arc<Mutex<bool>>,
    watchdog: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl FfmpegVideoRecorderAdapter {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            child: Arc::new(Mutex::new(None)),
            output: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
            watchdog: Arc::new(Mutex::new(None)),
        }
    }

    fn locate_ffmpeg(&self) -> Option<PathBuf> {
        let bin_name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };

        if let Ok(resource) = self.app.path().resource_dir() {
            let bundled = resource.join("resources").join(bin_name);
            if bundled.exists() { return Some(bundled); }
            let direct = resource.join(bin_name);
            if direct.exists() { return Some(direct); }
        }

        // Check common install paths on macOS (Homebrew)
        #[cfg(target_os = "macos")]
        {
            let homebrew = PathBuf::from("/opt/homebrew/bin/ffmpeg");
            if homebrew.exists() { return Some(homebrew); }
            let usr_local = PathBuf::from("/usr/local/bin/ffmpeg");
            if usr_local.exists() { return Some(usr_local); }
        }

        // Fall back to PATH lookup
        Command::new(bin_name)
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .ok()
            .filter(|s| s.success())
            .map(|_| PathBuf::from(bin_name))
    }

    /// Spawn a background thread that watches the output file. If ffmpeg's
    /// desktop-duplication handle dies (a known gdigrab issue that produces a
    /// black/blank video), the file stops growing; we detect that and restart
    /// ffmpeg so the recording recovers instead of staying blank.
    fn spawn_watchdog(&self, ffmpeg: PathBuf) {
        let child = self.child.clone();
        let output = self.output.clone();
        let running = self.running.clone();
        let app = self.app.clone();
        let handle = thread::spawn(move || {
            let mut last_size: u64 = 0;
            let mut stall: u64 = 0;
            loop {
                thread::sleep(Duration::from_secs(1));
                if !*running.lock().unwrap() {
                    break;
                }
                let path = output.lock().unwrap().clone();
                let size = path
                    .and_then(|p| std::fs::metadata(&p).ok().map(|m| m.len()))
                    .unwrap_or(0);
                if size > last_size {
                    last_size = size;
                    stall = 0;
                } else {
                    stall += 1;
                    if stall >= STALL_LIMIT_SECS {
                        eprintln!("[Recorder] Output stalled {}s, restarting ffmpeg", stall);
                        if let Some(p) = output.lock().unwrap().clone() {
                            if let Some(mut old) = child.lock().unwrap().take() {
                                let _ = old.kill();
                                let _ = old.wait();
                            }
                            match spawn_recorder(&ffmpeg, &p) {
                                Ok(new_child) => {
                                    *child.lock().unwrap() = Some(new_child);
                                    last_size = 0;
                                    stall = 0;
                                    let _ = app.emit("recording-restarted", ());
                                }
                                Err(e) => eprintln!("[Recorder] Restart failed: {}", e),
                            }
                        }
                    }
                }
            }
        });
        *self.watchdog.lock().unwrap() = Some(handle);
    }
}

/// Spawn an ffmpeg process that records the desktop to `output`.
fn spawn_recorder(ffmpeg: &Path, output: &Path) -> std::io::Result<Child> {
    let mut cmd = Command::new(ffmpeg);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd.args(&[
            "-f", "gdigrab",
            "-framerate", "15",
            "-i", "desktop",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "23",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            "-fps_mode", "cfr",
            "-y",
        ]);
    }

    #[cfg(target_os = "macos")]
    {
        cmd.args(&[
            "-f", "avfoundation",
            "-framerate", "15",
            "-i", "1",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "23",
            "-preset", "veryfast",
            "-fps_mode", "cfr",
            "-y",
        ]);
    }

    #[cfg(target_os = "linux")]
    {
        cmd.args(&[
            "-f", "x11grab",
            "-framerate", "15",
            "-video_size", "1920x1080",
            "-i", ":0.0",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "23",
            "-preset", "veryfast",
            "-fps_mode", "cfr",
            "-y",
        ]);
    }

    cmd.arg(output);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    cmd.spawn()
}

impl VideoRecorderPort for FfmpegVideoRecorderAdapter {
    fn start_video_recording(&self, project_name: &str, file_id: &str) -> Result<()> {
        let ffmpeg_path = match self.locate_ffmpeg() {
            Some(p) => p,
            None => return Err(DomainError::Other("FFmpeg not found. Put ffmpeg.exe in resources before building.".into())),
        };

        let docs = dirs::document_dir()
            .ok_or_else(|| DomainError::Other("Documents folder not found".into()))?;
        let out_dir = docs.join("automateScreen").join(project_name);
        std::fs::create_dir_all(&out_dir).map_err(|e| DomainError::Io(e.to_string()))?;
        let mp4_path = out_dir.join(format!("{}.mp4", file_id));

        let child = spawn_recorder(&ffmpeg_path, &mp4_path)
            .map_err(|e| DomainError::Other(format!("Failed to spawn ffmpeg: {e}")))?;

        *self.child.lock().unwrap() = Some(child);
        *self.output.lock().unwrap() = Some(mp4_path);
        *self.running.lock().unwrap() = true;

        self.spawn_watchdog(ffmpeg_path);
        Ok(())
    }

    fn stop_video_recording(&self) -> Result<()> {
        // Tell the watchdog to stop first so it doesn't restart a killed process.
        *self.running.lock().unwrap() = false;
        if let Some(handle) = self.watchdog.lock().unwrap().take() {
            let _ = handle.join();
        }
        if let Some(mut child) = self.child.lock().unwrap().take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q");
                let _ = stdin.flush();
            }
            let _ = child.wait();
        }
        Ok(())
    }
}
