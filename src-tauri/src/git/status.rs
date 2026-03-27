use git2::Repository;
use serde::Serialize;

use super::error::GitError;

/// Check whether a worktree (or repo) at the given path has uncommitted changes.
pub fn is_worktree_dirty(worktree_path: &str) -> Result<bool, GitError> {
    let repo = Repository::open(worktree_path)
        .map_err(|_| GitError::RepoNotFound(worktree_path.to_string()))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    Ok(!statuses.is_empty())
}

/// Summary of the working tree status for a repository.
#[derive(Debug, Clone, Serialize)]
pub struct StatusSummary {
    pub modified: usize,
    pub added: usize,
    pub deleted: usize,
    pub untracked: usize,
    pub is_clean: bool,
}

/// Get a summary of changes in the repository at the given path.
pub fn git_status_summary(project_path: &str) -> Result<StatusSummary, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false);

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut modified = 0usize;
    let mut added = 0usize;
    let mut deleted = 0usize;
    let mut untracked = 0usize;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::INDEX_MODIFIED
                | git2::Status::WT_RENAMED
                | git2::Status::INDEX_RENAMED,
        ) {
            modified += 1;
        } else if s.intersects(git2::Status::WT_NEW | git2::Status::INDEX_NEW) {
            if s.intersects(git2::Status::WT_NEW) && !s.intersects(git2::Status::INDEX_NEW) {
                untracked += 1;
            } else {
                added += 1;
            }
        } else if s.intersects(git2::Status::WT_DELETED | git2::Status::INDEX_DELETED) {
            deleted += 1;
        } else if s.intersects(git2::Status::IGNORED) {
            // skip ignored files
        } else {
            // Catch-all for other statuses (typechange, etc.)
            modified += 1;
        }
    }

    Ok(StatusSummary {
        modified,
        added,
        deleted,
        untracked,
        is_clean: statuses.is_empty(),
    })
}
