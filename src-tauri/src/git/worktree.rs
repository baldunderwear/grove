use std::os::windows::process::CommandExt;

use crate::git::error::GitError;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Remove a git worktree directory via `git worktree remove --force`.
///
/// Uses git CLI (not git2) for NAS/UNC path compatibility,
/// matching the create_worktree pattern in session_commands.rs.
pub fn remove_worktree(project_path: &str, worktree_path: &str) -> Result<(), GitError> {
    let output = std::process::Command::new("git")
        .args(["worktree", "remove", "--force", worktree_path])
        .current_dir(project_path)
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::Other(format!(
            "Failed to remove worktree: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

/// Force-delete a local branch via `git branch -D`.
///
/// Uses force delete (-D) because the user explicitly opted in via a checkbox.
/// The worktree must already be removed before calling this (git refuses to
/// delete a branch that is checked out in a worktree).
pub fn delete_local_branch(project_path: &str, branch_name: &str) -> Result<(), GitError> {
    let output = std::process::Command::new("git")
        .args(["branch", "-D", branch_name])
        .current_dir(project_path)
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::Other(format!(
            "Failed to delete branch: {}",
            stderr.trim()
        )));
    }

    Ok(())
}
