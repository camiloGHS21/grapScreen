use std::path::PathBuf;
use tauri::State;
use crate::AppState;

#[derive(serde::Serialize)]
pub struct InstalledApp {
    pub name: String,
    pub exe: String,
    pub icon: String,
}

#[tauri::command]
pub fn get_host_os() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn pick_executable_file() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Seleccionar ejecutable de aplicación")
        .add_filter("Ejecutables y Aplicaciones", &["exe", "AppImage", "app", "bin", "sh", "bat", "cmd"])
        .add_filter("Todos los archivos", &["*"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_system_installed_apps() -> Vec<InstalledApp> {
    let mut apps = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let prog_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

        let candidates = vec![
            ("Google Chrome", format!("{}\\Google\\Chrome\\Application\\chrome.exe", prog_files)),
            ("Google Chrome (x86)", format!("{}\\Google\\Chrome\\Application\\chrome.exe", prog_files_x86)),
            ("Microsoft Edge", format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", prog_files_x86)),
            ("Microsoft Excel", format!("{}\\Microsoft Office\\root\\Office16\\EXCEL.EXE", prog_files)),
            ("Bloc de Notas", format!("{}\\notepad.exe", sys_root)),
            ("Calculadora", format!("{}\\System32\\calc.exe", sys_root)),
            ("PowerShell", format!("{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", sys_root)),
            ("Símbolo del sistema", format!("{}\\System32\\cmd.exe", sys_root)),
            ("Explorador de archivos", format!("{}\\explorer.exe", sys_root)),
        ];

        for (name, path) in candidates {
            if std::path::Path::new(&path).exists() {
                apps.push(InstalledApp {
                    name: name.to_string(),
                    exe: path,
                    icon: "app".to_string(),
                });
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/usr/share/applications") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let mut name = String::new();
                        let mut exec = String::new();
                        for line in content.lines() {
                            if line.starts_with("Name=") && name.is_empty() {
                                name = line.trim_start_matches("Name=").to_string();
                            } else if line.starts_with("Exec=") && exec.is_empty() {
                                exec = line.trim_start_matches("Exec=").split_whitespace().next().unwrap_or("").to_string();
                            }
                        }
                        if !name.is_empty() && !exec.is_empty() {
                            apps.push(InstalledApp { name, exe: exec, icon: "app".to_string() });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = std::fs::read_dir("/Applications") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("app") {
                    let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    if !name.is_empty() {
                        apps.push(InstalledApp {
                            name,
                            exe: path.to_string_lossy().to_string(),
                            icon: "app".to_string(),
                        });
                    }
                }
            }
        }
    }

    apps
}

#[tauri::command]
pub fn select_save_file(default_name: String) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().set_file_name(&default_name);
    
    if default_name.ends_with(".AppImage") {
        dialog = dialog.add_filter("Linux AppImage / Binary (*.AppImage)", &["AppImage", "bin"]);
    } else if default_name.ends_with(".app") {
        dialog = dialog.add_filter("macOS App Bundle (*.app)", &["app", "command"]);
    } else if default_name.ends_with(".json") {
        dialog = dialog.add_filter("Flujo JSON (*.json)", &["json"]);
    } else if default_name.ends_with(".exe") {
        dialog = dialog.add_filter("Windows Executable (*.exe)", &["exe"]);
    } else {
        dialog = dialog.add_filter("Todos los archivos", &["*"]);
    }

    dialog.save_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Seleccionar carpeta a monitorear")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

/// Open an existing Excel/CSV file or create a new one. `format` is "xlsx" or "csv".
#[tauri::command]
pub fn select_excel_file(format: String) -> Option<String> {
    let is_xlsx = format.eq_ignore_ascii_case("xlsx");
    let default_name = if is_xlsx { "registro.xlsx" } else { "registro.csv" };
    let (label, ext) = if is_xlsx {
        ("Excel", vec!["xlsx"])
    } else {
        ("CSV", vec!["csv"])
    };
    let picked = rfd::FileDialog::new()
        .set_title("Seleccionar o crear archivo de Excel/CSV")
        .set_file_name(default_name)
        .add_filter(label, &ext)
        .pick_file();
    if let Some(p) = picked {
        return Some(p.to_string_lossy().to_string());
    }
    // Fall back to "save" so the user can type a new name.
    rfd::FileDialog::new()
        .set_title("Crear nuevo archivo de Excel/CSV")
        .set_file_name(default_name)
        .add_filter(label, &ext)
        .save_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_automation_exe(
    state: State<AppState>,
    project_name: String,
    id: String,
    dest_path: String,
    target_os: Option<String>,
) -> std::result::Result<(), String> {
    let file_data = state.storage.load_automation(&project_name, &id).map_err(|e| e.to_string())?;
    let json_str = serde_json::to_string(&file_data).map_err(|e| e.to_string())?;
    
    let target = target_os.unwrap_or_else(|| "windows".to_string());

    // Sanitize destination path if Windows FileDialog appended .exe to non-windows targets
    let mut final_path = dest_path;
    if target == "linux" && final_path.ends_with(".AppImage.exe") {
        final_path = final_path.trim_end_matches(".exe").to_string();
    } else if target == "macos" && final_path.ends_with(".app.exe") {
        final_path = final_path.trim_end_matches(".exe").to_string();
    } else if target == "json" && final_path.ends_with(".json.exe") {
        final_path = final_path.trim_end_matches(".exe").to_string();
    }

    if target == "json" || final_path.ends_with(".json") {
        std::fs::write(&final_path, json_str.as_bytes()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut exe_bytes = std::fs::read(&exe_path).map_err(|e| e.to_string())?;
    
    let marker = b"//GRAPSCREEN_FLOW_DATA//";
    let marker_len = marker.len();
    let total_len = exe_bytes.len();
    let mut clean_len = total_len;
    
    if total_len >= 8 + marker_len {
        let len_pos = total_len - 8;
        let mut len_bytes = [0u8; 8];
        len_bytes.copy_from_slice(&exe_bytes[len_pos..]);
        let json_len = u64::from_le_bytes(len_bytes) as usize;
        
        if json_len > 0 && json_len < total_len {
            let marker_pos = total_len - 8 - marker_len;
            if &exe_bytes[marker_pos..marker_pos + marker_len] == marker {
                clean_len = total_len - 8 - marker_len - json_len;
            }
        }
    }
    
    exe_bytes.truncate(clean_len);
    
    let json_bytes = json_str.as_bytes();
    exe_bytes.extend_from_slice(json_bytes);
    exe_bytes.extend_from_slice(marker);
    exe_bytes.extend_from_slice(&(json_bytes.len() as u64).to_le_bytes());
    
    std::fs::write(&final_path, exe_bytes).map_err(|e| e.to_string())?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&final_path, std::fs::Permissions::from_mode(0o755));
    }
    
    Ok(())
}
