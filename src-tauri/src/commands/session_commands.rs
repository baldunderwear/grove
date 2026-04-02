use std::os::windows::process::CommandExt;

use crate::git::error::GitError;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Launch a Claude Code session in a worktree directory.
/// Stub -- full implementation uses SessionManager (Phase 15+).
#[tauri::command]
pub fn launch_session(worktree_path: String) -> Result<(), String> {
    std::process::Command::new("claude")
        .creation_flags(CREATE_NO_WINDOW)
        .current_dir(&worktree_path)
        .spawn()
        .map_err(|e| format!("Failed to launch session: {}", e))?;
    Ok(())
}

/// Get list of currently active Claude Code sessions.
/// Stub -- returns empty vec until full SessionManager integration.
#[tauri::command]
pub fn get_active_sessions() -> Vec<String> {
    Vec::new()
}

/// Open a worktree path in VS Code (or Cursor).
#[tauri::command]
pub fn open_in_vscode(worktree_path: String) -> Result<(), String> {
    std::process::Command::new("code")
        .arg(&worktree_path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    Ok(())
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
    // Try creating with new branch first, fall back to existing branch
    let output = std::process::Command::new("git").creation_flags(CREATE_NO_WINDOW)
        .args(["worktree", "add", "-b", &full_branch, &wt_path.to_string_lossy()])
        .current_dir(&project_path)
        .output()
        .map_err(|e| GitError::Other(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If branch already exists, try attaching it as a worktree without -b
        if stderr.contains("already exists") {
            let retry = std::process::Command::new("git").creation_flags(CREATE_NO_WINDOW)
                .args(["worktree", "add", &wt_path.to_string_lossy(), &full_branch])
                .current_dir(&project_path)
                .output()
                .map_err(|e| GitError::Other(format!("Failed to run git: {}", e)))?;

            if !retry.status.success() {
                let retry_stderr = String::from_utf8_lossy(&retry.stderr);
                return Err(GitError::Other(format!("Failed to create worktree: {}", retry_stderr.trim())));
            }
        } else {
            return Err(GitError::Other(format!("Failed to create worktree: {}", stderr.trim())));
        }
    }

    Ok(wt_path.to_string_lossy().to_string())
}
