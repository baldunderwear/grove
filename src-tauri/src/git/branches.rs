use serde::Serialize;
use std::os::windows::process::CommandExt;

use super::error::GitError;
use crate::utils::paths::{get_drive_mappings, resolve_unc_path};

const CREATE_NO_WINDOW: u32 = 0x08000000;

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
/// Resolves UNC paths to drive letters using a single `net use` call.
fn enumerate_worktrees_cli(project_path: &str) -> Vec<WorktreeInfo> {
    let output = match std::process::Command::new("git").creation_flags(CREATE_NO_WINDOW)
        .args(["worktree", "list", "--porcelain"])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    // Fetch drive mappings once for all paths
    let mappings = get_drive_mappings();

    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut current_prunable = false;

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            // Save previous entry (skip prunable worktrees — broken/missing paths)
            if !current_prunable {
                if let (Some(p), Some(b)) = (current_path.take(), current_branch.take()) {
                    worktrees.push(WorktreeInfo { branch: b, path: p });
                }
            }
            current_path = Some(resolve_unc_path(path, &mappings));
            current_branch = None;
            current_prunable = false;
        } else if let Some(branch_ref) = line.strip_prefix("branch refs/heads/") {
            current_branch = Some(branch_ref.to_string());
        } else if line.starts_with("prunable ") {
            current_prunable = true;
        }
    }
    // Don't forget the last entry
    if !current_prunable {
        if let (Some(p), Some(b)) = (current_path, current_branch) {
            worktrees.push(WorktreeInfo { branch: b, path: p });
        }
    }

    worktrees
}

/// Batch-fetch commit info for all branches in ONE git command.
/// Returns a map of branch_name -> (subject, timestamp).
fn batch_commit_info(
    project_path: &str,
    branches: &[&str],
) -> std::collections::HashMap<String, (String, i64)> {
    use std::collections::HashMap;
    let mut map = HashMap::new();
    if branches.is_empty() {
        return map;
    }

    // git for-each-ref gets all branch info in a single call
    // Format: branch_name<TAB>subject<TAB>unix_timestamp
    let output = match std::process::Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "for-each-ref",
            "--format=%(refname:short)\t%(subject)\t%(creatordate:unix)",
            "refs/heads/",
        ])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return map,
    };

    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() == 3 {
            let name = parts[0].to_string();
            let subject = parts[1].to_string();
            let ts: i64 = parts[2].parse().unwrap_or(0);
            map.insert(name, (subject, ts));
        }
    }
    map
}

/// Batch-fetch ahead/behind counts for multiple branches in ONE git command.
/// Uses git for-each-ref with ahead-behind (requires git 2.36+).
/// Falls back to zeros if the git version doesn't support it.
fn batch_ahead_behind(
    project_path: &str,
    merge_target: &str,
) -> std::collections::HashMap<String, (usize, usize)> {
    use std::collections::HashMap;
    let mut map = HashMap::new();

    // git for-each-ref --format with ahead-behind (git 2.36+)
    let format = format!(
        "%(refname:short)\t%(ahead-behind:{})",
        merge_target
    );
    let output = match std::process::Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["for-each-ref", "--format", &format, "refs/heads/"])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return map,
    };

    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            let name = parts[0].to_string();
            let counts: Vec<&str> = parts[1].split_whitespace().collect();
            if counts.len() == 2 {
                let ahead: usize = counts[0].parse().unwrap_or(0);
                let behind: usize = counts[1].parse().unwrap_or(0);
                map.insert(name, (ahead, behind));
            }
        }
    }
    map
}

/// List all worktree branches matching the given prefix.
///
/// Uses only 3 git CLI calls total (not per-branch):
/// 1. git worktree list --porcelain — enumerate worktrees
/// 2. git for-each-ref — commit info for all branches
/// 3. git for-each-ref — ahead/behind for all branches
///
/// Plus 1 net use call for UNC path resolution.
pub fn list_worktree_branches(
    project_path: &str,
    branch_prefix: &str,
    merge_target: &str,
) -> Result<Vec<BranchInfo>, GitError> {
    // Verify the repo exists
    if !std::path::Path::new(project_path).join(".git").exists()
        && !std::path::Path::new(project_path).join("HEAD").exists()
    {
        return Err(GitError::RepoNotFound(project_path.to_string()));
    }

    // 1. Enumerate worktrees (1 subprocess)
    let all_worktrees = enumerate_worktrees_cli(project_path);
    let worktrees: Vec<WorktreeInfo> = all_worktrees
        .into_iter()
        .filter(|wt| wt.branch.starts_with(branch_prefix))
        .collect();

    if worktrees.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Batch commit info (1 subprocess for ALL branches)
    let branch_names: Vec<&str> = worktrees.iter().map(|wt| wt.branch.as_str()).collect();
    let commit_info = batch_commit_info(project_path, &branch_names);

    // 3. Batch ahead/behind (1 subprocess for ALL branches)
    let ahead_behind = batch_ahead_behind(project_path, merge_target);

    let mut results = Vec::new();
    for wt in &worktrees {
        let (message, timestamp) = commit_info
            .get(&wt.branch)
            .cloned()
            .unwrap_or((String::new(), 0));
        let (ahead, behind) = ahead_behind
            .get(&wt.branch)
            .copied()
            .unwrap_or((0, 0));

        results.push(BranchInfo {
            name: wt.branch.clone(),
            ahead,
            behind,
            last_commit_message: message,
            last_commit_timestamp: timestamp,
            is_dirty: false,
            worktree_path: wt.path.clone(),
        });
    }

    Ok(results)
}
