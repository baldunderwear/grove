use std::sync::Mutex;

use crate::config::models::{BuildFileConfig, ChangelogConfig};
use crate::git::branches::BranchInfo;
use crate::git::error::GitError;
use crate::git::merge::{MergePreview, MergeResult};
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

/// Preview a merge: shows commits to merge, changelog fragments, build numbers,
/// and whether conflicts exist. Read-only -- no mutations.
#[tauri::command]
pub fn merge_preview(
    project_path: String,
    source_branch: String,
    merge_target: String,
    build_patterns: Vec<BuildFileConfig>,
    changelog_config: Option<ChangelogConfig>,
) -> Result<MergePreview, GitError> {
    crate::git::merge::merge_preview(
        &project_path,
        &source_branch,
        &merge_target,
        &build_patterns,
        &changelog_config,
    )
}

/// Execute an atomic merge of source_branch into merge_target.
/// Takes a Mutex lock since this is a write operation.
/// Auto-resolves build file conflicts, bumps build number, renames changelogs.
/// Returns error with conflict paths if non-build conflicts are found.
#[tauri::command]
pub fn merge_branch(
    app_handle: tauri::AppHandle,
    project_path: String,
    project_name: String,
    source_branch: String,
    merge_target: String,
    build_patterns: Vec<BuildFileConfig>,
    changelog_config: Option<ChangelogConfig>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<MergeResult, GitError> {
    let _guard = _lock.lock().map_err(|e| {
        GitError::MergeAborted(format!("Failed to acquire write lock: {}", e))
    })?;
    let result = crate::git::merge::merge_branch(
        &project_path,
        &source_branch,
        &merge_target,
        &build_patterns,
        &changelog_config,
    )?;

    // Fire merge-completed notification
    let build_num = result.new_build.map(|n| n.to_string()).unwrap_or_else(|| "none".to_string());
    crate::notifications::notify_merge_complete(
        &app_handle,
        &source_branch,
        &project_name,
        &build_num,
    );

    Ok(result)
}

/// Get a diff summary between a source branch and its merge target.
/// Returns files changed, per-file stats, aggregate stats, and commit list.
#[tauri::command]
pub fn get_branch_diff_summary(
    project_path: String,
    source_branch: String,
    merge_target: String,
) -> Result<crate::git::diff::DiffSummaryData, crate::git::error::GitError> {
    crate::git::diff::get_branch_diff_summary(&project_path, &source_branch, &merge_target)
}

/// Execute a sequential merge queue: merges multiple branches into the target
/// with in-memory build number sequencing and atomic rollback on failure.
/// Takes the write lock for the entire queue duration.
#[tauri::command]
pub fn merge_queue_execute(
    app_handle: tauri::AppHandle,
    project_path: String,
    project_name: String,
    branches: Vec<String>,
    merge_target: String,
    build_patterns: Vec<BuildFileConfig>,
    changelog_config: Option<ChangelogConfig>,
    _lock: tauri::State<'_, Mutex<()>>,
    queue_flag: tauri::State<'_, crate::git::queue::QueueActiveFlag>,
) -> Result<crate::git::queue::QueueResult, GitError> {
    let _guard = _lock.lock().map_err(|e| {
        GitError::MergeAborted(format!("Failed to acquire write lock: {}", e))
    })?;
    // project_name accepted for IPC symmetry with merge_branch but unused in queue logic
    let _ = project_name;
    crate::git::queue::execute_queue(
        &app_handle,
        &project_path,
        branches,
        &merge_target,
        &build_patterns,
        &changelog_config,
        &queue_flag,
    )
}

/// Standalone build conflict resolution for partial merge recovery.
/// Opens repo, checks index for build file conflicts, resolves them.
#[tauri::command]
pub fn resolve_build_conflicts(
    project_path: String,
    build_patterns: Vec<BuildFileConfig>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<(), GitError> {
    let _guard = _lock.lock().map_err(|e| {
        GitError::MergeAborted(format!("Failed to acquire write lock: {}", e))
    })?;

    let repo = git2::Repository::open(&project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.clone()))?;

    let mut index = repo.index()?;

    if !index.has_conflicts() {
        return Ok(());
    }

    // Resolve build file conflicts by taking ours version
    let conflict_paths: Vec<String> = index
        .conflicts()?
        .filter_map(|c| c.ok())
        .filter_map(|conflict| {
            conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|entry| String::from_utf8_lossy(&entry.path).to_string())
        })
        .filter(|path| {
            build_patterns.iter().any(|p| {
                glob::Pattern::new(&p.pattern)
                    .map(|g| g.matches(path))
                    .unwrap_or(false)
            })
        })
        .collect();

    let head_commit = repo.head()?.peel_to_commit()?;
    let head_tree = head_commit.tree()?;

    for path in &conflict_paths {
        index.remove(std::path::Path::new(path), 0)?;

        if let Ok(entry) = head_tree.get_path(std::path::Path::new(path)) {
            let blob = repo.find_blob(entry.id())?;
            let content = blob.content();
            let index_entry = git2::IndexEntry {
                ctime: git2::IndexTime::new(0, 0),
                mtime: git2::IndexTime::new(0, 0),
                dev: 0,
                ino: 0,
                mode: 0o100644,
                uid: 0,
                gid: 0,
                file_size: content.len() as u32,
                id: entry.id(),
                flags: 0,
                flags_extended: 0,
                path: path.as_bytes().to_vec(),
            };
            index.add_frombuffer(&index_entry, content)?;
        }
    }

    index.write()?;
    Ok(())
}
