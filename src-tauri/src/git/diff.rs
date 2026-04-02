use git2::{BranchType, Repository, Sort};
use serde::Serialize;
use std::collections::HashMap;

use super::error::GitError;
use super::merge::CommitInfo;

/// Summary of changes between a source branch and its merge target.
#[derive(Debug, Clone, Serialize)]
pub struct DiffSummaryData {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub files: Vec<DiffFileEntry>,
    pub commits: Vec<CommitInfo>,
}

/// Per-file insertion/deletion counts.
#[derive(Debug, Clone, Serialize)]
pub struct DiffFileEntry {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
}

/// Compute a diff summary between `source_branch` and `merge_target`.
///
/// Returns aggregate stats (files changed, insertions, deletions),
/// per-file stats, and the list of commits on source that are not
/// reachable from target.
pub fn get_branch_diff_summary(
    project_path: &str,
    source_branch: &str,
    merge_target: &str,
) -> Result<DiffSummaryData, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    // Resolve branches
    let source_ref = repo
        .find_branch(source_branch, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(source_branch.to_string()))?;
    let source_oid = source_ref
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(source_branch.to_string()))?;

    let target_ref = repo
        .find_branch(merge_target, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(merge_target.to_string()))?;
    let target_oid = target_ref
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(merge_target.to_string()))?;

    // Edge case: same commit means 0 changes
    if source_oid == target_oid {
        return Ok(DiffSummaryData {
            files_changed: 0,
            insertions: 0,
            deletions: 0,
            files: Vec::new(),
            commits: Vec::new(),
        });
    }

    // Get trees for diff
    let source_tree = source_ref.get().peel_to_tree()?;
    let target_tree = target_ref.get().peel_to_tree()?;

    // Diff: target -> source (shows what source adds relative to target)
    let diff = repo.diff_tree_to_tree(Some(&target_tree), Some(&source_tree), None)?;

    // Aggregate stats
    let stats = diff.stats()?;

    // Per-file stats via line callback
    let mut file_stats: HashMap<String, (usize, usize)> = HashMap::new();
    diff.foreach(
        &mut |_delta, _progress| true,
        None,
        Some(&mut |_delta, _hunk| true),
        Some(&mut |delta, _hunk, line| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let entry = file_stats.entry(path).or_insert((0, 0));
            match line.origin() {
                '+' => entry.0 += 1,
                '-' => entry.1 += 1,
                _ => {}
            }
            true
        }),
    )?;

    let mut files: Vec<DiffFileEntry> = file_stats
        .into_iter()
        .map(|(path, (ins, del))| DiffFileEntry {
            path,
            insertions: ins,
            deletions: del,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));

    // Commit list: walk from source tip, hiding merge base
    let merge_base = repo.merge_base(source_oid, target_oid);
    let commits = match merge_base {
        Ok(base_oid) => {
            let mut revwalk = repo.revwalk()?;
            revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
            revwalk.push(source_oid)?;
            revwalk.hide(base_oid)?;

            let mut commit_list = Vec::new();
            for oid_result in revwalk {
                let oid = oid_result?;
                let commit = repo.find_commit(oid)?;
                commit_list.push(CommitInfo {
                    oid: oid.to_string(),
                    message: commit
                        .message()
                        .unwrap_or("")
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                    author: commit.author().name().unwrap_or("Unknown").to_string(),
                    timestamp: commit.time().seconds(),
                });
            }
            commit_list
        }
        Err(_) => {
            return Err(GitError::Other("No common ancestor found".to_string()));
        }
    };

    Ok(DiffSummaryData {
        files_changed: stats.files_changed(),
        insertions: stats.insertions(),
        deletions: stats.deletions(),
        files,
        commits,
    })
}
