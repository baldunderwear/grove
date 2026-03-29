use std::collections::HashMap;
use tauri::ipc::Channel;

use super::history::HistoryManager;
use super::pty;
use super::{TerminalEvent, TerminalManager};

/// Spawn a new terminal session in the given working directory.
///
/// Resolves UNC paths to drive letters before PTY spawn. Returns the terminal ID
/// which the frontend uses for subsequent write/resize/kill operations.
///
/// When `project_id` is provided, the project's assigned profile (or the default
/// profile) is looked up and its `env_vars` are injected into the PTY process.
#[tauri::command]
pub fn terminal_spawn(
    working_dir: String,
    cols: u16,
    rows: u16,
    project_id: Option<String>,
    on_event: Channel<TerminalEvent>,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
    history_manager: tauri::State<'_, std::sync::Mutex<HistoryManager>>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // Resolve UNC paths to drive letters (NAS worktrees use UNC)
    let mappings = crate::utils::paths::get_drive_mappings();
    let resolved = crate::utils::paths::resolve_unc_path(&working_dir, &mappings);

    // Reject if still a UNC path (no drive mapping found)
    if resolved.starts_with("//") {
        return Err(format!(
            "Cannot spawn terminal: no drive mapping found for UNC path '{}'",
            working_dir
        ));
    }

    // Resolve full profile for this project (env_vars, launch_flags, ssh_key, claude_config_dir)
    let mut env_overrides: HashMap<String, String> = HashMap::new();
    let mut extra_args: Vec<String> = Vec::new();

    if let Some(ref pid) = project_id {
        if let Ok(config) = crate::config::persistence::load_or_create_config(&app_handle) {
            let profile = if let Some(project) = config.projects.iter().find(|p| p.id == *pid) {
                if let Some(ref profile_id) = project.profile_id {
                    config.profiles.iter().find(|p| p.id == *profile_id).cloned()
                } else {
                    config.profiles.iter().find(|p| p.is_default).cloned()
                }
            } else {
                None
            };

            if let Some(p) = profile {
                env_overrides = p.env_vars;
                extra_args = p.launch_flags;
                if let Some(ssh_key) = p.ssh_key {
                    env_overrides.insert("GIT_SSH_COMMAND".to_string(), format!("ssh -i {}", ssh_key));
                }
                if let Some(config_dir) = p.claude_config_dir {
                    env_overrides.insert("CLAUDE_CONFIG_DIR".to_string(), config_dir);
                }
            }
        }
    }

    // Spawn PTY (must NOT hold manager lock during this -- PTY I/O is slow)
    let (id, session) = pty::spawn_pty(&resolved, cols, rows, on_event, app_handle, env_overrides, &extra_args)?;

    // Brief lock to insert session
    let mut mgr = manager
        .lock()
        .map_err(|e| format!("Manager lock poisoned: {}", e))?;
    mgr.insert(id.clone(), session);

    // Start history tracking
    let mut hist = history_manager
        .lock()
        .map_err(|e| format!("History lock poisoned: {}", e))?;
    hist.start_session(&id, &resolved);

    Ok(id)
}

/// Write data (keystrokes) to an active terminal.
#[tauri::command]
pub fn terminal_write(
    terminal_id: String,
    data: String,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
) -> Result<(), String> {
    let mut mgr = manager
        .lock()
        .map_err(|e| format!("Manager lock poisoned: {}", e))?;
    mgr.write(&terminal_id, data.as_bytes())
}

/// Resize an active terminal's PTY dimensions.
#[tauri::command]
pub fn terminal_resize(
    terminal_id: String,
    cols: u16,
    rows: u16,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
) -> Result<(), String> {
    let mgr = manager
        .lock()
        .map_err(|e| format!("Manager lock poisoned: {}", e))?;
    mgr.resize(&terminal_id, cols, rows)
}

/// Kill a terminal's process and remove it from the manager.
#[tauri::command]
pub fn terminal_kill(
    terminal_id: String,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
) -> Result<(), String> {
    let mut mgr = manager
        .lock()
        .map_err(|e| format!("Manager lock poisoned: {}", e))?;
    mgr.kill(&terminal_id)
}

/// Get session history (duration, state timeline, git diff) for a terminal.
#[tauri::command]
pub fn terminal_get_history(
    terminal_id: String,
    history_manager: tauri::State<'_, std::sync::Mutex<HistoryManager>>,
) -> Result<super::history::SessionHistoryResponse, String> {
    let mgr = history_manager
        .lock()
        .map_err(|e| format!("History lock poisoned: {}", e))?;
    mgr.get_history(&terminal_id)
        .ok_or_else(|| format!("No history for terminal {}", terminal_id))
}
