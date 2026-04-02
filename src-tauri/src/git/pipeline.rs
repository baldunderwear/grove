use git2::{BranchType, Repository, Signature, Sort};

use super::build;
use super::changelog;
use super::error::GitError;
use super::merge::{classify_conflicts, extract_worktree_name, resolve_build_conflicts_in_index, MergeResult};
use crate::config::models::{BuildFileConfig, ChangelogConfig};

/// Tracks which phase of the merge pipeline has completed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum MergePhase {
    /// Initial state -- no steps have run.
    Init,
    /// merge_execute() completed -- merged tree is ready.
    Executed,
    /// merge_bump() completed -- build files updated on disk.
    Bumped,
    /// merge_changelog() completed -- changelog fragments renamed.
    Changelogged,
    /// merge_commit() completed -- merge commit created.
    Committed,
}

/// Context object flowing through the merge pipeline.
/// Each step advances `phase` and populates its output fields.
///
/// On error, `phase` remains at the previous step's value, indicating
/// where the failure occurred. The caller can inspect `phase` to
/// determine what cleanup is needed.
pub struct MergeContext {
    // -- Inputs (set at creation) --
    /// Path to the git repository on disk.
    pub project_path: String,
    /// Branch being merged (source).
    pub source_branch: String,
    /// Branch being merged into (target).
    pub merge_target: String,
    /// Build file glob patterns for auto-bump.
    pub build_patterns: Vec<BuildFileConfig>,
    /// Changelog fragment configuration.
    pub changelog_config: Option<ChangelogConfig>,
    /// If set, overrides disk-based build detection.
    /// Used by the queue orchestrator (Phase 17) to own the sequence.
    pub override_build: Option<u32>,

    // -- Pipeline state --
    /// Current phase of the pipeline.
    pub phase: MergePhase,
    /// Accumulated warnings from all steps.
    pub warnings: Vec<String>,

    // -- Populated by merge_execute() --
    /// Number of commits being merged.
    pub commits_merged: usize,
    /// OID of the merged tree (before build bump / changelog changes).
    pub merged_tree_oid: Option<git2::Oid>,
    /// OID of the source branch tip commit.
    pub source_oid: Option<git2::Oid>,
    /// OID of the target branch tip commit.
    pub target_oid: Option<git2::Oid>,

    // -- Populated by merge_bump() --
    /// The new build number, if build patterns were configured.
    pub new_build: Option<u32>,

    // -- Populated by merge_changelog() --
    /// Pairs of (old_path, new_path) for renamed changelog fragments.
    pub changelog_renames: Vec<(String, String)>,

    // -- Populated by merge_commit() --
    /// OID of the created merge commit.
    pub commit_oid: Option<git2::Oid>,
}

impl MergeContext {
    /// Create a new merge context with the given inputs.
    /// All output fields are initialized to their default (empty) values.
    pub fn new(
        project_path: &str,
        source_branch: &str,
        merge_target: &str,
        build_patterns: &[BuildFileConfig],
        changelog_config: &Option<ChangelogConfig>,
        override_build: Option<u32>,
    ) -> Self {
        Self {
            project_path: project_path.to_string(),
            source_branch: source_branch.to_string(),
            merge_target: merge_target.to_string(),
            build_patterns: build_patterns.to_vec(),
            changelog_config: changelog_config.clone(),
            override_build,
            phase: MergePhase::Init,
            warnings: Vec::new(),
            commits_merged: 0,
            merged_tree_oid: None,
            source_oid: None,
            target_oid: None,
            new_build: None,
            changelog_renames: Vec::new(),
            commit_oid: None,
        }
    }

    /// Convert the completed context into a MergeResult for the frontend.
    pub fn into_result(self) -> MergeResult {
        MergeResult {
            success: self.phase == MergePhase::Committed,
            new_build: self.new_build,
            commits_merged: self.commits_merged,
            changelog_renames: self.changelog_renames,
            warnings: self.warnings,
        }
    }
}

/// Execute the merge: resolve branches, checkout target, merge in-memory,
/// handle conflicts, write merged tree. Advances phase to `Executed`.
///
/// This step performs the initial `checkout_head()` to the target branch
/// (necessary for the merge) but does NOT call `checkout_head()` after
/// writing the merged tree. The working directory remains on the pre-merge
/// target state, which is correct for `detect_current_build()` in the
/// bump step.
pub fn merge_execute(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Init {
        return Err(GitError::MergeAborted(format!(
            "merge_execute requires Init phase, got {:?}",
            ctx.phase
        )));
    }

    let repo = Repository::open(&ctx.project_path)
        .map_err(|_| GitError::RepoNotFound(ctx.project_path.clone()))?;

    // Resolve source and target
    let source = repo
        .find_branch(&ctx.source_branch, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(ctx.source_branch.clone()))?;
    let source_oid = source
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(ctx.source_branch.clone()))?;

    let target = repo
        .find_branch(&ctx.merge_target, BranchType::Local)
        .map_err(|_| GitError::BranchNotFound(ctx.merge_target.clone()))?;
    let target_oid = target
        .get()
        .target()
        .ok_or_else(|| GitError::BranchNotFound(ctx.merge_target.clone()))?;

    // Count commits being merged (for the result)
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL)?;
    revwalk.push(source_oid)?;
    revwalk.hide(target_oid)?;
    ctx.commits_merged = revwalk.count();

    // Ensure HEAD is on merge_target
    repo.set_head(&format!("refs/heads/{}", ctx.merge_target))?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;

    let our_commit = repo.find_commit(target_oid)?;
    let their_commit = repo.find_commit(source_oid)?;

    // Perform in-memory merge
    let mut merged_index = repo.merge_commits(&our_commit, &their_commit, None)?;

    // Handle conflicts
    if merged_index.has_conflicts() {
        let conflicts = classify_conflicts(&merged_index, &ctx.build_patterns);

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
        ctx.warnings
            .push("Build file conflicts auto-resolved (target version kept)".to_string());
    }

    // Write merged tree
    let tree_oid = merged_index.write_tree_to(&repo)?;

    ctx.merged_tree_oid = Some(tree_oid);
    ctx.source_oid = Some(source_oid);
    ctx.target_oid = Some(target_oid);
    ctx.phase = MergePhase::Executed;
    Ok(())
}

/// Detect and bump build numbers on disk. Advances phase to `Bumped`.
///
/// If `override_build` is set on the context, uses that value directly
/// instead of detecting from disk. This supports the queue orchestrator
/// (Phase 17) owning the build number sequence.
///
/// If `build_patterns` is empty, this is a no-op that still advances
/// the phase (skip-safe).
pub fn merge_bump(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Executed {
        return Err(GitError::MergeAborted(format!(
            "merge_bump requires Executed phase, got {:?}",
            ctx.phase
        )));
    }

    if ctx.build_patterns.is_empty() {
        ctx.new_build = None;
        ctx.phase = MergePhase::Bumped;
        return Ok(());
    }

    let next = if let Some(override_val) = ctx.override_build {
        override_val
    } else {
        let current = build::detect_current_build(&ctx.project_path, &ctx.build_patterns)?;
        current.map(|n| n + 1).unwrap_or(1)
    };

    build::bump_build_number(&ctx.project_path, &ctx.build_patterns, next)?;
    ctx.new_build = Some(next);
    ctx.phase = MergePhase::Bumped;
    Ok(())
}

/// Rename changelog fragments on disk. Advances phase to `Changelogged`.
///
/// If `changelog_config` is `None` or `new_build` is `None`, this is a
/// no-op that still advances the phase (skip-safe). Errors during rename
/// are caught and recorded as warnings (matching existing behavior).
pub fn merge_changelog(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Bumped {
        return Err(GitError::MergeAborted(format!(
            "merge_changelog requires Bumped phase, got {:?}",
            ctx.phase
        )));
    }

    if ctx.changelog_config.is_none() || ctx.new_build.is_none() {
        ctx.changelog_renames = Vec::new();
        ctx.phase = MergePhase::Changelogged;
        return Ok(());
    }

    let config = ctx.changelog_config.as_ref().unwrap();
    let build_num = ctx.new_build.unwrap();
    let worktree_name = extract_worktree_name(&ctx.source_branch);

    ctx.changelog_renames = match changelog::rename_changelog_fragments(
        &ctx.project_path,
        config,
        &worktree_name,
        build_num,
    ) {
        Ok(renames) => renames,
        Err(e) => {
            ctx.warnings
                .push(format!("Changelog rename failed: {}", e));
            Vec::new()
        }
    };

    ctx.phase = MergePhase::Changelogged;
    Ok(())
}

/// Build the final tree incorporating disk changes (build bump + changelog
/// renames), create the merge commit with two parents, and checkout HEAD.
/// Advances phase to `Committed`.
///
/// This step re-reads bumped build files and renamed changelog files from
/// disk into a git index to create the final tree. It then creates the
/// merge commit and calls `checkout_head(force)` as the final operation.
pub fn merge_commit(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Changelogged {
        return Err(GitError::MergeAborted(format!(
            "merge_commit requires Changelogged phase, got {:?}",
            ctx.phase
        )));
    }

    let repo = Repository::open(&ctx.project_path)
        .map_err(|_| GitError::RepoNotFound(ctx.project_path.clone()))?;

    let tree_oid = ctx.merged_tree_oid.ok_or_else(|| {
        GitError::MergeAborted("merge_commit called without merged_tree_oid".to_string())
    })?;
    let source_oid = ctx.source_oid.ok_or_else(|| {
        GitError::MergeAborted("merge_commit called without source_oid".to_string())
    })?;
    let target_oid = ctx.target_oid.ok_or_else(|| {
        GitError::MergeAborted("merge_commit called without target_oid".to_string())
    })?;

    let our_commit = repo.find_commit(target_oid)?;
    let their_commit = repo.find_commit(source_oid)?;

    // Build the final tree incorporating disk changes (build bump + changelog renames)
    let final_tree = if ctx.new_build.is_some() || !ctx.changelog_renames.is_empty() {
        // We need to add the on-disk changes to the merged tree
        let mut final_index = repo.index()?;

        // First, read the merged tree into the index
        let merged_tree = repo.find_tree(tree_oid)?;
        final_index.read_tree(&merged_tree)?;

        // Add bumped build files from disk
        if !ctx.build_patterns.is_empty() {
            let repo_path_normalized = ctx.project_path.replace('\\', "/");
            for pattern in &ctx.build_patterns {
                let full_pattern = format!("{}/{}", repo_path_normalized, pattern.pattern);
                if let Ok(entries) = glob::glob(&full_pattern) {
                    for entry in entries.flatten() {
                        let rel = entry.to_string_lossy().replace('\\', "/");
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
        for (old_path, new_path) in &ctx.changelog_renames {
            let repo_path_normalized = ctx.project_path.replace('\\', "/");

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

    // Get commit signature (fallback to Grove default)
    let sig = repo
        .signature()
        .unwrap_or_else(|_| Signature::now("Grove", "grove@localhost").unwrap());

    // Build commit message
    let mut message = format!("Merge {} into {}", ctx.source_branch, ctx.merge_target);
    if let Some(build_num) = ctx.new_build {
        message.push_str(&format!("\n\nBuild: {}", build_num));
    }

    // Create merge commit with 2 parents
    let commit_oid = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &final_tree,
        &[&our_commit, &their_commit],
    )?;

    // Checkout HEAD to update working directory
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;

    ctx.commit_oid = Some(commit_oid);
    ctx.phase = MergePhase::Committed;
    Ok(())
}
