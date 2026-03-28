use git2::{BranchType, MergeAnalysis, Repository, Signature, Sort};
use serde::Serialize;

use super::build;
use super::changelog::{self, ChangelogFragment};
use super::error::GitError;
use crate::config::models::{BuildFileConfig, ChangelogConfig};

/// Preview of what a merge will do, without mutating anything.
#[derive(Debug, Clone, Serialize)]
pub struct MergePreview {
    pub source_branch: String,
    pub target_branch: String,
    pub commits_to_merge: Vec<CommitInfo>,
    pub changelog_fragments: Vec<ChangelogFragment>,
    pub current_build: Option<u32>,
    pub next_build: Option<u32>,
    pub can_fast_forward: bool,
    pub has_conflicts: bool,
}

/// A single commit in the merge preview.
#[derive(Debug, Clone, Serialize)]
pub struct CommitInfo {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

/// Result of a completed merge operation.
#[derive(Debug, Clone, Serialize)]
pub struct MergeResult {
    pub success: bool,
    pub new_build: Option<u32>,
    pub commits_merged: usize,
    pub changelog_renames: Vec<(String, String)>,
    pub warnings: Vec<String>,
}

/// Information about a conflicting file.
#[derive(Debug, Clone, Serialize)]
pub struct ConflictInfo {
    pub path: String,
    pub is_build_file: bool,
}

/// Preview what a merge of source_branch into merge_target would do.
/// This is read-only -- no mutations to the repo or working directory.
pub fn merge_preview(
    project_path: &str,
    source_branch: &str,
    merge_target: &str,
    build_patterns: &[BuildFileConfig],
    changelog_config: &Option<ChangelogConfig>,
) -> Result<MergePreview, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    // Resolve source and target branch OIDs
    let source = repo
        .find_branch(source_branch, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(source_branch.to_string()))?;
    let source_oid = source
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(source_branch.to_string()))?;

    let target = repo
        .find_branch(merge_target, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(merge_target.to_string()))?;
    let target_oid = target
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(merge_target.to_string()))?;

    // Check fast-forward possibility
    let source_annotated = repo.find_annotated_commit(source_oid)?;
    let (analysis, _) = repo.merge_analysis(&[&source_annotated])?;
    let can_fast_forward = analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD);

    // Walk commits from source that are not reachable from target
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    revwalk.push(source_oid)?;
    revwalk.hide(target_oid)?;

    let mut commits_to_merge = Vec::new();
    for oid_result in revwalk {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;
        commits_to_merge.push(CommitInfo {
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

    // Detect current build number
    let current_build = build::detect_current_build(project_path, build_patterns)?;
    let next_build = current_build.map(|n| n + 1);

    // Find changelog fragments
    let changelog_fragments = if let Some(config) = changelog_config {
        let worktree_name = extract_worktree_name(source_branch);
        changelog::find_changelog_fragments(project_path, config, &worktree_name)?
    } else {
        Vec::new()
    };

    // Check for conflicts (in-memory merge, no mutations)
    let our_commit = repo.find_commit(target_oid)?;
    let their_commit = repo.find_commit(source_oid)?;
    let index = repo.merge_commits(&our_commit, &their_commit, None)?;
    let has_conflicts = index.has_conflicts();

    Ok(MergePreview {
        source_branch: source_branch.to_string(),
        target_branch: merge_target.to_string(),
        commits_to_merge,
        changelog_fragments,
        current_build,
        next_build,
        can_fast_forward,
        has_conflicts,
    })
}

/// Execute an atomic merge of source_branch into merge_target.
///
/// Steps:
/// 1. Merge commits in-memory, check for conflicts
/// 2. Auto-resolve build file conflicts (take target version)
/// 3. Write merged tree
/// 4. Bump build numbers on disk and update tree
/// 5. Rename changelog fragments and update tree
/// 6. Create merge commit with two parents
/// 7. Checkout HEAD to update working directory
///
/// If unexpected (non-build) conflicts are found, returns
/// `GitError::UnexpectedConflict` without modifying HEAD.
pub fn merge_branch(
    project_path: &str,
    source_branch: &str,
    merge_target: &str,
    build_patterns: &[BuildFileConfig],
    changelog_config: &Option<ChangelogConfig>,
) -> Result<MergeResult, GitError> {
    let repo = Repository::open(project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;

    let mut warnings = Vec::new();

    // Resolve source and target
    let source = repo
        .find_branch(source_branch, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(source_branch.to_string()))?;
    let source_oid = source
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(source_branch.to_string()))?;

    let target = repo
        .find_branch(merge_target, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(merge_target.to_string()))?;
    let target_oid = target
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(merge_target.to_string()))?;

    // Count commits being merged (for the result)
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL)?;
    revwalk.push(source_oid)?;
    revwalk.hide(target_oid)?;
    let commits_merged = revwalk.count();

    // Ensure HEAD is on merge_target
    repo.set_head(&format!("refs/heads/{}", merge_target))?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;

    let our_commit = repo.find_commit(target_oid)?;
    let their_commit = repo.find_commit(source_oid)?;

    // Perform in-memory merge
    let mut merged_index = repo.merge_commits(&our_commit, &their_commit, None)?;

    // Handle conflicts
    if merged_index.has_conflicts() {
        let conflicts = classify_conflicts(&merged_index, build_patterns);

        // If ANY non-build conflicts exist, abort
        let unexpected: Vec<String> = conflicts
            .iter()
            .filter(|c| !c.is_build_file)
            .map(|c| c.path.clone())
            .collect();

        if !unexpected.is_empty() {
            return Err(GitError::UnexpectedConflict(unexpected));
        }

        // Auto-resolve build file conflicts: take "ours" (target) version
        resolve_build_conflicts_in_index(&repo, &mut merged_index, &our_commit)?;
        warnings.push("Build file conflicts auto-resolved (target version kept)".to_string());
    }

    // Write merged tree
    let tree_oid = merged_index.write_tree_to(&repo)?;

    // Detect and bump build number
    let new_build = if !build_patterns.is_empty() {
        let current = build::detect_current_build(project_path, build_patterns)?;
        let next = current.map(|n| n + 1).unwrap_or(1);

        // Bump on disk
        let modified_files = build::bump_build_number(project_path, build_patterns, next)?;

        if !modified_files.is_empty() {
            // Need to update the tree with bumped files
            // We do this by reading the bumped file contents and writing a new tree
            Some(next)
        } else {
            Some(next)
        }
    } else {
        None
    };

    // Rename changelog fragments
    let changelog_renames = if let Some(config) = changelog_config {
        let worktree_name = extract_worktree_name(source_branch);
        if let Some(build_num) = new_build {
            match changelog::rename_changelog_fragments(
                project_path,
                config,
                &worktree_name,
                build_num,
            ) {
                Ok(renames) => renames,
                Err(e) => {
                    warnings.push(format!("Changelog rename failed: {}", e));
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Build the final tree incorporating disk changes (build bump + changelog renames)
    // Re-read the working directory state into an index for the commit
    let final_tree = if new_build.is_some() || !changelog_renames.is_empty() {
        // We need to add the on-disk changes to the merged tree
        let mut final_index = repo.index()?;

        // First, read the merged tree into the index
        let merged_tree = repo.find_tree(tree_oid)?;
        final_index.read_tree(&merged_tree)?;

        // Add bumped build files from disk
        if !build_patterns.is_empty() {
            let repo_path_normalized = project_path.replace('\\', "/");
            for pattern in build_patterns {
                let full_pattern = format!("{}/{}", repo_path_normalized, pattern.pattern);
                if let Ok(entries) = glob::glob(&full_pattern) {
                    for entry in entries.flatten() {
                        let rel = entry
                            .to_string_lossy()
                            .replace('\\', "/");
                        let rel = rel
                            .strip_prefix(&repo_path_normalized)
                            .unwrap_or(&rel)
                            .trim_start_matches('/');
                        let content = std::fs::read_to_string(&entry)?;
                        let blob_oid = repo.blob(content.as_bytes())?;
                        let index_entry = git2::IndexEntry {
                            ctime: git2::IndexTime::new(0, 0),
                            mtime: git2::IndexTime::new(0, 0),
                            dev: 0,
                            ino: 0,
                            mode: 0o100644,
                            uid: 0,
                            gid: 0,
                            file_size: content.len() as u32,
                            id: blob_oid,
                            flags: 0,
                            flags_extended: 0,
                            path: rel.as_bytes().to_vec(),
                        };
                        final_index.add_frombuffer(&index_entry, content.as_bytes())?;
                    }
                }
            }
        }

        // Add renamed changelog files
        for (old_path, new_path) in &changelog_renames {
            let repo_path_normalized = project_path.replace('\\', "/");

            // Remove old path from index
            let old_rel = old_path
                .replace('\\', "/")
                .strip_prefix(&format!("{}/", repo_path_normalized))
                .unwrap_or(old_path)
                .to_string();
            let _ = final_index.remove(std::path::Path::new(&old_rel), 0);

            // Add new path
            if let Ok(content) = std::fs::read_to_string(new_path) {
                let blob_oid = repo.blob(content.as_bytes())?;
                let new_rel = new_path
                    .replace('\\', "/")
                    .strip_prefix(&format!("{}/", repo_path_normalized))
                    .unwrap_or(new_path)
                    .to_string();
                let index_entry = git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: 0o100644,
                    uid: 0,
                    gid: 0,
                    file_size: content.len() as u32,
                    id: blob_oid,
                    flags: 0,
                    flags_extended: 0,
                    path: new_rel.as_bytes().to_vec(),
                };
                final_index.add_frombuffer(&index_entry, content.as_bytes())?;
            }
        }

        let final_tree_oid = final_index.write_tree_to(&repo)?;
        repo.find_tree(final_tree_oid)?
    } else {
        repo.find_tree(tree_oid)?
    };

    // Get commit signature (fallback to Grove default per Pitfall 6)
    let sig = repo
        .signature()
        .unwrap_or_else(|_| Signature::now("Grove", "grove@localhost").unwrap());

    // Build commit message
    let mut message = format!("Merge {} into {}", source_branch, merge_target);
    if let Some(build_num) = new_build {
        message.push_str(&format!("\n\nBuild: {}", build_num));
    }

    // Create merge commit with 2 parents
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &final_tree,
        &[&our_commit, &their_commit],
    )?;

    // Checkout HEAD to update working directory
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;

    Ok(MergeResult {
        success: true,
        new_build,
        commits_merged,
        changelog_renames,
        warnings,
    })
}

/// Classify conflicts in a merged index as build-file or non-build-file.
fn classify_conflicts(
    index: &git2::Index,
    build_patterns: &[BuildFileConfig],
) -> Vec<ConflictInfo> {
    let mut conflicts = Vec::new();

    if let Ok(conflict_iter) = index.conflicts() {
        for conflict in conflict_iter.flatten() {
            // A conflict has ancestor, our, and their entries -- get the path from whichever exists
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|entry| {
                    String::from_utf8_lossy(&entry.path).to_string()
                })
                .unwrap_or_default();

            let is_build = is_build_file_conflict(&path, build_patterns);
            conflicts.push(ConflictInfo {
                path,
                is_build_file: is_build,
            });
        }
    }

    conflicts
}

/// Auto-resolve build file conflicts in the index by taking "ours" (target) version.
fn resolve_build_conflicts_in_index(
    repo: &Repository,
    index: &mut git2::Index,
    our_commit: &git2::Commit,
) -> Result<(), GitError> {
    // Collect conflicts first (can't mutate index while iterating)
    let conflict_paths: Vec<(String, Option<git2::Oid>)> = index
        .conflicts()?
        .filter_map(|c| c.ok())
        .map(|conflict| {
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|entry| String::from_utf8_lossy(&entry.path).to_string())
                .unwrap_or_default();
            let our_oid = conflict.our.as_ref().map(|e| e.id);
            (path, our_oid)
        })
        .collect();

    let our_tree = our_commit.tree()?;

    for (path, _our_oid) in &conflict_paths {
        // Remove conflict entries
        index.remove(std::path::Path::new(path), 0)?;

        // Add "ours" version back from the target tree
        if let Ok(entry) = our_tree.get_path(std::path::Path::new(path)) {
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

    Ok(())
}

/// Check whether a file path matches any of the build file patterns.
fn is_build_file_conflict(path: &str, build_patterns: &[BuildFileConfig]) -> bool {
    for pattern in build_patterns {
        if let Ok(glob_pattern) = glob::Pattern::new(&pattern.pattern) {
            if glob_pattern.matches(path) {
                return true;
            }
        }
    }
    false
}

/// Extract the worktree name from a branch name by stripping common prefixes.
/// e.g. "wt/feature-x" -> "feature-x", "worktree-feature" -> "feature"
fn extract_worktree_name(branch_name: &str) -> String {
    // Try common prefixes
    for prefix in &["wt/", "worktree-", "worktree/"] {
        if let Some(name) = branch_name.strip_prefix(prefix) {
            return name.to_string();
        }
    }
    // Fallback: use the full branch name
    branch_name.to_string()
}
