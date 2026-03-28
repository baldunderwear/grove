use std::collections::HashMap;
use std::sync::Mutex;

use crate::git::error::GitError;
use crate::process::detect::SessionDetector;

/// Launch a Claude Code session in a new terminal window.
/// Returns the spawned process PID.
#[tauri::command]
pub fn launch_session(
    worktree_path: String,
    worktree_name: String,
    launch_flags: Vec<String>,
) -> Result<u32, String> {
    crate::process::launch::launch_claude_session(&worktree_path, &worktree_name, &launch_flags)
}

/// Poll for active Claude Code sessions across the given worktree paths.
/// Returns a map of worktree_path -> PID for detected sessions.
#[tauri::command]
pub fn get_active_sessions(
    worktree_paths: Vec<String>,
    detector: tauri::State<'_, Mutex<SessionDetector>>,
) -> Result<HashMap<String, u32>, String> {
    let mut detector = detector.lock().map_err(|e| e.to_string())?;
    Ok(detector.detect_active_sessions(&worktree_paths))
}

/// Open a worktree path in VS Code (or Cursor).
#[tauri::command]
pub fn open_in_vscode(worktree_path: String) -> Result<(), String> {
    crate::process::launch::launch_vscode(&worktree_path)
}

/// Reveal a worktree path in Windows Explorer via tauri-plugin-opener.
#[tauri::command]
pub fn open_in_explorer(worktree_path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&worktree_path)
        .map_err(|e| format!("Failed to open Explorer: {}", e))
}

/// Create a new git worktree with the given branch name.
/// Returns the path to the newly created worktree directory.
/// Uses git CLI instead of git2 to handle NAS paths where git2 cannot create
/// directories inside .git/worktrees/.
#[tauri::command]
pub fn create_worktree(
    project_path: String,
    branch_name: String,
    branch_prefix: String,
) -> Result<String, GitError> {
    let full_branch = format!("{}{}", branch_prefix, branch_name);

    // Create worktree directory alongside the main repo
    let parent = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| GitError::Other("Cannot determine parent directory".into()))?;
    let wt_path = parent.join(&full_branch);

    // Use git CLI — handles NAS paths where git2 fails on .git/worktrees/ creation
    let output = std::process::Command::new("git")
        .args(["worktree", "add", "-b", &full_branch, &wt_path.to_string_lossy()])
        .current_dir(&project_path)
        .output()
        .map_err(|e| GitError::Other(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::Other(format!("Failed to create worktree: {}", stderr.trim())));
    }

    Ok(wt_path.to_string_lossy().to_string())
}
