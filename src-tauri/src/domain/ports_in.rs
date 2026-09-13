use super::entities::{Result, TargetApp, AutomationFile, RecordedEvent};

/// Input Port (Use Case) representing the ability to record user inputs.
pub trait RecordingUseCase: Send + Sync {
    fn start_recording(&self, project_name: &str, automation_name: &str, generate_mp4: bool, target_app: Option<TargetApp>) -> Result<()>;
    fn stop_recording(&self) -> Result<Option<AutomationFile>>;
    fn pause_recording(&self) -> Result<()>;
    fn resume_recording(&self) -> Result<()>;
    fn cancel_recording(&self) -> Result<()>;
    fn is_recording(&self) -> bool;
    fn record_event(&self, event: RecordedEvent);
    fn update_target_app(&self, target_app: TargetApp) -> Result<()>;
    fn get_paused_flag(&self) -> Option<std::sync::Arc<std::sync::atomic::AtomicBool>>;
}

/// Input Port (Use Case) representing the ability to replay recorded automations.
pub trait ReplayUseCase: Send + Sync {
    fn execute_replay(&self, project_name: &str, file_id: &str, is_background: bool) -> Result<()>;
    /// n8n "Execute previous nodes": run the graph but stop after `node_id`.
    /// Default: full run (linear implementations can't limit the graph).
    fn execute_replay_until(&self, project_name: &str, file_id: &str, node_id: &str) -> Result<()> {
        let _ = node_id;
        self.execute_replay(project_name, file_id, false)
    }
    fn stop_replay(&self, file_id: &str) -> Result<()>;
    fn stop_all_replays(&self) -> Result<()>;
}
