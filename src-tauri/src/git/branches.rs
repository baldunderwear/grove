use serde::Serialize;

use super::error::GitError;

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

/// Get ahead/behind counts for a branch vs target using git CLI.
/// Much faster than git2's graph_ahead_behind on NAS.
fn cli_ahead_behind(project_path: &str, branch: &str, target: &str) -> (usize, usize) {
    let range = format!("{}...{}", target, branch);
    let output = match std::process::Command::new("git")
        .args(["rev-list", "--left-right", "--count", &range])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return (0, 0),
    };
    let parts: Vec<&str> = output.trim().split_whitespace().collect();
    if parts.len() == 2 {
        let behind = parts[0].parse().unwrap_or(0);
        let ahead = parts[1].parse().unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    }
}

/// Get last commit info for a branch using git CLI.
fn cli_last_commit(project_path: &str, branch: &str) -> (String, i64) {
    let output = match std::process::Command::new("git")
        .args(["log", "-1", "--format=%s%n%ct", branch, "--"])
        .current_dir(project_path)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return (String::new(), 0),
    };
    let lines: Vec<&str> = output.trim().lines().collect();
    if lines.len() >= 2 {
        let msg = lines[0].to_string();
        let ts = lines[1].parse().unwrap_or(0);
        (msg, ts)
    } else {
        (String::new(), 0)
    }
}

/// List all worktree branches matching the given prefix, including ahead/behind
/// counts relative to the merge target.
///
/// Uses git CLI for all operations — much faster on NAS than git2.
/// Dirty status is NOT checked here (too slow on NAS with 30+ worktrees).
/// Frontend can call is_worktree_dirty lazily for visible branches.
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

    // Use CLI to enumerate worktrees (git2 fails on NAS)
    let all_worktrees = enumerate_worktrees_cli(project_path);

    // Filter to matching prefix
    let worktrees: Vec<WorktreeInfo> = all_worktrees
        .into_iter()
        .filter(|wt| wt.branch.starts_with(branch_prefix))
        .collect();

    let mut results = Vec::new();

    for wt in &worktrees {
        let (ahead, behind) = cli_ahead_behind(project_path, &wt.branch, merge_target);
        let (message, timestamp) = cli_last_commit(project_path, &wt.branch);

        results.push(BranchInfo {
            name: wt.branch.clone(),
            ahead,
            behind,
            last_commit_message: message,
            last_commit_timestamp: timestamp,
            is_dirty: false, // Deferred — too slow on NAS for 30+ worktrees
            worktree_path: wt.path.clone(),
        });
    }

    Ok(results)
}
