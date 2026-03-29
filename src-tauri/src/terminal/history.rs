use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use super::state_parser::SessionState;

#[derive(Debug, Clone, serde::Serialize)]
pub struct StateTransition {
    pub state: SessionState,
    pub timestamp: u64, // Unix millis
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionHistory {
    pub terminal_id: String,
    pub working_dir: String,
    pub started_at: u64,    // Unix millis
    pub start_head: String, // Git HEAD at session start
    pub transitions: Vec<StateTransition>,
}

/// Manages session histories for all active and recently closed terminals.
pub struct HistoryManager {
    histories: HashMap<String, SessionHistory>,
}

impl HistoryManager {
    pub fn new() -> Self {
        Self {
            histories: HashMap::new(),
        }
    }

    /// Start tracking a new session. Captures the current git HEAD.
    pub fn start_session(&mut self, terminal_id: &str, working_dir: &str) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let start_head = get_git_head(working_dir).unwrap_or_else(|| "unknown".to_string());

        self.histories.insert(
            terminal_id.to_string(),
            SessionHistory {
                terminal_id: terminal_id.to_string(),
                working_dir: working_dir.to_string(),
                started_at: now,
                start_head,
                transitions: Vec::new(),
            },
        );
    }

    /// Record a state transition for a session.
    pub fn record_transition(&mut self, terminal_id: &str, state: SessionState) {
        if let Some(history) = self.histories.get_mut(terminal_id) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            history.transitions.push(StateTransition {
                state,
                timestamp: now,
            });
        }
    }

    /// Get the full history for a session, including a live git diff --stat.
    pub fn get_history(&self, terminal_id: &str) -> Option<SessionHistoryResponse> {
        let history = self.histories.get(terminal_id)?;
        let git_diff = get_git_diff_stat(&history.working_dir, &history.start_head);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Some(SessionHistoryResponse {
            terminal_id: history.terminal_id.clone(),
            working_dir: history.working_dir.clone(),
            started_at: history.started_at,
            duration_ms: now - history.started_at,
            start_head: history.start_head.clone(),
            git_diff_stat: git_diff,
            transitions: history.transitions.clone(),
        })
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionHistoryResponse {
    pub terminal_id: String,
    pub working_dir: String,
    pub started_at: u64,
    pub duration_ms: u64,
    pub start_head: String,
    pub git_diff_stat: Option<String>,
    pub transitions: Vec<StateTransition>,
}

/// Get the current HEAD commit hash (short) for a working directory.
fn get_git_head(working_dir: &str) -> Option<String> {
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = std::process::Command::new("git");
    cmd.args(["rev-parse", "--short", "HEAD"])
        .current_dir(working_dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().ok()?;
    if output.status.success() {
        Some(
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string(),
        )
    } else {
        None
    }
}

/// Get git diff --stat from a starting commit to current state.
fn get_git_diff_stat(working_dir: &str, start_head: &str) -> Option<String> {
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Include both committed and uncommitted changes
    let mut cmd = std::process::Command::new("git");
    cmd.args(["diff", "--stat", start_head])
        .current_dir(working_dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().ok()?;
    if output.status.success() {
        let stat = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();
        if stat.is_empty() {
            None
        } else {
            Some(stat)
        }
    } else {
        None
    }
}
