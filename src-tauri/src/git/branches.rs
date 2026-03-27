use git2::{BranchType, Repository};
use serde::Serialize;

use super::error::GitError;
use super::status::is_worktree_dirty;

/// Information about a single worktree branch, sent to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub ahead: usize,
    pub behind: usize,
    pub last_commit_message: String,
    pub last_commit_timestamp: i64,
    pub is_dirty: bool,
    pub worktree_path: String,
}

/// Internal struct for worktree enumeration.
struct WorktreeInfo {
    branch: String,
    path: String,
}

/// List all worktree branches matching the given prefix, including ahead/behind
/// counts relative to the merge target and dirty status.
///
/// Opens the main repository at `project_path`, enumerates worktrees, and also
/// checks the main repo's own HEAD branch. For each matching branch, computes
/// ahead/behind against `merge_target` and checks dirty state.
pub fn list_worktree_branches(
    project_path: &str,
    branch_prefix: &str,
    merge_target: &str,
) -> Result<Vec<BranchInfo>, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    let mut worktrees = Vec::new();

    // Collect worktree branches
    let wt_names = repo.worktrees()?;
    for name in wt_names.iter() {
        let name = match name {
            Some(n) => n,
            None => continue,
        };

        let wt = match repo.find_worktree(name) {
            Ok(wt) => wt,
            Err(_) => continue,
        };

        let wt_path = wt.path().to_string_lossy().to_string();
        // Normalize Windows backslashes
        let wt_path_normalized = wt_path.replace('\\', "/");

        // Open worktree as its own repository to get HEAD
        let wt_repo = match Repository::open(&wt_path_normalized) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let head = match wt_repo.head() {
            Ok(h) => h,
            Err(_) => continue,
        };

        let branch_name = head.shorthand().unwrap_or("").to_string();

        if branch_name.starts_with(branch_prefix) {
            worktrees.push(WorktreeInfo {
                branch: branch_name,
                path: wt_path_normalized,
            });
        }
    }

    // Also check the main repo's own HEAD branch (worktrees() doesn't list it)
    if let Ok(head) = repo.head() {
        let main_branch = head.shorthand().unwrap_or("").to_string();
        if main_branch.starts_with(branch_prefix) {
            let main_path = project_path.replace('\\', "/");
            worktrees.push(WorktreeInfo {
                branch: main_branch,
                path: main_path,
            });
        }
    }

    // Resolve merge target OID from the main repo
    let target_oid = match repo.find_branch(merge_target, BranchType::Local) {
        Ok(target) => target.get().target(),
        Err(_) => None,
    };

    let mut results = Vec::new();

    for wt in &worktrees {
        // Look up branch OID from main repo (branches live in main repo's refs)
        let branch_oid = match repo.find_branch(&wt.branch, BranchType::Local) {
            Ok(branch) => match branch.get().target() {
                Some(oid) => oid,
                None => continue,
            },
            Err(_) => continue,
        };

        // Compute ahead/behind relative to merge target
        let (ahead, behind) = match target_oid {
            Some(t_oid) => repo.graph_ahead_behind(branch_oid, t_oid).unwrap_or((0, 0)),
            None => (0, 0),
        };

        // Get last commit info
        let (message, timestamp) = match repo.find_commit(branch_oid) {
            Ok(commit) => {
                let msg = commit
                    .message()
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string();
                let time = commit.time().seconds();
                (msg, time)
            }
            Err(_) => (String::new(), 0),
        };

        // Check dirty status by opening the worktree path
        let dirty = is_worktree_dirty(&wt.path).unwrap_or(false);

        results.push(BranchInfo {
            name: wt.branch.clone(),
            ahead,
            behind,
            last_commit_message: message,
            last_commit_timestamp: timestamp,
            is_dirty: dirty,
            worktree_path: wt.path.clone(),
        });
    }

    Ok(results)
}
