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

    /// n8n "Execute step": run ONE node and return what it produced.
    ///
    /// Blocking on purpose — the caller is waiting to display the step's real
    /// input and output. Not every implementation can do this (a legacy linear
    /// recording has no nodes), hence a default that says so plainly rather than
    /// silently running the whole thing.
    fn run_single_node(
        &self,
        project_name: &str,
        file_id: &str,
        node_id: &str,
    ) -> Result<Vec<crate::application::execution_history::NodeRunStatus>> {
        let _ = (project_name, file_id, node_id);
        Err(crate::domain::entities::DomainError::Other(
            "Esta automatización no es un flujo de nodos, así que no se puede ejecutar un paso \
             suelto."
                .to_string(),
        ))
    }

    /// Executes the workflow with a chat message input and returns the agent reply.
    fn test_chat_workflow(
        &self,
        project_name: &str,
        file_id: &str,
        message: &str,
    ) -> Result<String> {
        let _ = (project_name, file_id, message);
        Err(crate::domain::entities::DomainError::Other(
            "Esta automatización no admite pruebas de chat o no está implementada.".to_string(),
        ))
    }
}
