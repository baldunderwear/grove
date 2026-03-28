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

/// Parse `git worktree list --porcelain` output into WorktreeInfo entries.
/// Uses CLI instead of git2's worktrees() which fails on NAS paths.
fn enumerate_worktrees_cli(project_path: &str) -> Vec<WorktreeInfo> {
    let output = match std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            // Save previous entry
            if let (Some(p), Some(b)) = (current_path.take(), current_branch.take()) {
                worktrees.push(WorktreeInfo { branch: b, path: p });
            }
            current_path = Some(path.replace('\\', "/"));
            current_branch = None;
        } else if let Some(branch_ref) = line.strip_prefix("branch refs/heads/") {
            current_branch = Some(branch_ref.to_string());
        }
    }
    // Don't forget the last entry
    if let (Some(p), Some(b)) = (current_path, current_branch) {
        worktrees.push(WorktreeInfo { branch: b, path: p });
    }

    worktrees
}

/// List all worktree branches matching the given prefix, including ahead/behind
/// counts relative to the merge target and dirty status.
///
/// Uses `git worktree list --porcelain` (CLI) to enumerate worktrees — this
/// works on NAS paths where git2's worktrees() API fails. Then uses git2 for
/// ahead/behind computation and commit info.
pub fn list_worktree_branches(
    project_path: &str,
    branch_prefix: &str,
    merge_target: &str,
) -> Result<Vec<BranchInfo>, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    // Use CLI to enumerate worktrees (git2 fails on NAS)
    let all_worktrees = enumerate_worktrees_cli(project_path);

    // Filter to matching prefix
    let worktrees: Vec<WorktreeInfo> = all_worktrees
        .into_iter()
        .filter(|wt| wt.branch.starts_with(branch_prefix))
        .collect();

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
