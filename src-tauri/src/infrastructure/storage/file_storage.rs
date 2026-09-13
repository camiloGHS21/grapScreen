use crate::domain::entities::{Result, DomainError, AutomationFile};
use crate::domain::ports_out::StoragePort;
use std::fs;
use std::path::PathBuf;

/// Infrastructure adapter implementing StoragePort using local filesystem JSON files.
pub struct FileStorageAdapter;

impl FileStorageAdapter {
    pub fn new() -> Self {
        Self
    }

    fn get_automation_dir(&self, project_name: &str) -> std::result::Result<PathBuf, DomainError> {
        let dir = dirs::data_dir()
            .ok_or_else(|| DomainError::Other("No data directory found".into()))?
            .join("grapScreen")
            .join("projects")
            .join(project_name)
            .join("automations");
        fs::create_dir_all(&dir).map_err(|e| DomainError::Io(e.to_string()))?;
        Ok(dir)
    }
}

impl StoragePort for FileStorageAdapter {
    fn save_automation(&self, project_name: &str, file: &AutomationFile) -> Result<()> {
        let dir = self.get_automation_dir(project_name)?;
        let path = dir.join(format!("{}.json", file.id));
        let content = serde_json::to_string_pretty(file)
            .map_err(|e| DomainError::Serde(e.to_string()))?;
        fs::write(path, content).map_err(|e| DomainError::Io(e.to_string()))?;
        Ok(())
    }

    fn load_automation(&self, project_name: &str, file_id: &str) -> Result<AutomationFile> {
        let dir = self.get_automation_dir(project_name)?;
        let path = dir.join(format!("{}.json", file_id));
        let content = fs::read_to_string(path).map_err(|e| DomainError::Io(e.to_string()))?;
        let file = serde_json::from_str(&content).map_err(|e| DomainError::Serde(e.to_string()))?;
        Ok(file)
    }

    fn list_automations(&self, project_name: &str) -> Result<Vec<AutomationFile>> {
        let dir = self.get_automation_dir(project_name)?;
        let mut list = Vec::new();
        let paths = fs::read_dir(dir).map_err(|e| DomainError::Io(e.to_string()))?;
        for entry in paths {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(file) = serde_json::from_str::<AutomationFile>(&content) {
                            list.push(file);
                        }
                    }
                }
            }
        }
        // Sort by created_at descending
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(list)
    }
}
