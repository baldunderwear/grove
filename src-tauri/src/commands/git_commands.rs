use crate::git::branches::BranchInfo;
use crate::git::error::GitError;
use crate::git::status::StatusSummary;

/// List all worktree branches matching the project's branch prefix,
/// with ahead/behind counts relative to the merge target.
#[tauri::command]
pub fn list_branches(
    project_path: String,
    branch_prefix: String,
    merge_target: String,
) -> Result<Vec<BranchInfo>, GitError> {
    crate::git::branches::list_worktree_branches(&project_path, &branch_prefix, &merge_target)
}

/// Get a summary of changes (modified, added, deleted, untracked) for a repo.
#[tauri::command]
pub fn branch_status(project_path: String) -> Result<StatusSummary, GitError> {
    crate::git::status::git_status_summary(&project_path)
}

/// Check whether a worktree path has uncommitted changes.
#[tauri::command]
pub fn is_worktree_dirty(worktree_path: String) -> Result<bool, GitError> {
    crate::git::status::is_worktree_dirty(&worktree_path)
}
