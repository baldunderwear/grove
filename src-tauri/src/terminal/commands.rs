use tauri::ipc::Channel;

use super::pty;
use super::{TerminalEvent, TerminalManager};

/// Spawn a new terminal session in the given working directory.
///
/// Resolves UNC paths to drive letters before PTY spawn. Returns the terminal ID
/// which the frontend uses for subsequent write/resize/kill operations.
#[tauri::command]
pub fn terminal_spawn(
    working_dir: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
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

    // Spawn PTY (must NOT hold manager lock during this -- PTY I/O is slow)
    let (id, session) = pty::spawn_pty(&resolved, cols, rows, on_event)?;

    // Brief lock to insert session
    let mut mgr = manager
        .lock()
        .map_err(|e| format!("Manager lock poisoned: {}", e))?;
    mgr.insert(id.clone(), session);

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
