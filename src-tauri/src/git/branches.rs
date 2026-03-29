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

/// A mapping from UNC prefix to drive letter, cached per list_branches call.
struct DriveMapping {
    unc_prefix: String, // lowercase, forward slashes, e.g. "//the-batman/mnt"
    drive: String,      // e.g. "Z:"
}

/// Query `net use` once and build a list of UNC → drive letter mappings.
fn get_drive_mappings() -> Vec<DriveMapping> {
    let output = match std::process::Command::new("net").arg("use").output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut mappings = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for (i, part) in parts.iter().enumerate() {
            if part.len() == 2 && part.ends_with(':') {
                if let Some(unc) = parts.get(i + 1) {
                    if unc.starts_with("\\\\") || unc.starts_with("//") {
                        mappings.push(DriveMapping {
                            unc_prefix: unc.replace('\\', "/").to_lowercase(),
                            drive: part.to_string(),
                        });
                    }
                }
            }
        }
    }
    mappings
}

/// Resolve a UNC path to a drive letter using pre-fetched mappings.
fn resolve_unc_path(path: &str, mappings: &[DriveMapping]) -> String {
    let normalized = path.replace('\\', "/");
    if !normalized.starts_with("//") {
        return normalized;
    }
    let path_lower = normalized.to_lowercase();
    for m in mappings {
        if path_lower.starts_with(&m.unc_prefix) {
            let remainder = &normalized[m.unc_prefix.len()..];
            return format!("{}{}", m.drive, remainder);
        }
    }
    normalized
}

/// Parse `git worktree list --porcelain` output into WorktreeInfo entries.
/// Uses CLI instead of git2's worktrees() which fails on NAS paths.
/// Resolves UNC paths to drive letters using a single `net use` call.
fn enumerate_worktrees_cli(project_path: &str) -> Vec<WorktreeInfo> {
    let output = match std::process::Command::new("git")
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

        // Check dirty status — skip if path doesn't exist (avoids NAS errors)
        let dirty = if std::path::Path::new(&wt.path).exists() {
            is_worktree_dirty(&wt.path).unwrap_or(false)
        } else {
            false
        };

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
