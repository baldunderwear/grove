use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use git2::Repository;
use serde::Serialize;
use tauri::Emitter;

use super::build;
use super::error::GitError;
use super::pipeline::{merge_bump, merge_changelog, merge_commit, merge_execute, MergeContext};
use crate::config::models::{BuildFileConfig, ChangelogConfig};

/// Managed state wrapper for watcher suppression during queue execution.
/// Shares an `Arc<AtomicBool>` with the file watcher thread so both can
/// read/write the same flag without coupling types.
pub struct QueueActiveFlag(pub Arc<AtomicBool>);

/// Progress event payload sent to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct QueueProgress {
    pub index: usize,
    pub total: usize,
    pub branch: String,
    pub status: String, // "active" | "complete" | "failed" | "rolled_back"
}

/// Result of the entire queue execution.
#[derive(Debug, Clone, Serialize)]
pub struct QueueResult {
    pub success: bool,
    pub completed: usize,
    pub total: usize,
    pub failed_branch: Option<String>,
    pub error: Option<String>,
    pub build_range: Option<(u32, u32)>,
}

/// Execute a sequential merge queue.
///
/// 1. Record HEAD OID snapshot for rollback
/// 2. Detect build number once from disk (no reads between merges)
/// 3. For each branch: create MergeContext with override_build, run pipeline
/// 4. On failure: git reset --hard to snapshot, emit rolled_back for completed branches
/// 5. Emit progress events throughout
pub fn execute_queue(
    app: &tauri::AppHandle,
    project_path: &str,
    branches: Vec<String>,
    merge_target: &str,
    build_patterns: &[BuildFileConfig],
    changelog_config: &Option<ChangelogConfig>,
    queue_flag: &QueueActiveFlag,
) -> Result<QueueResult, GitError> {
    // Set suppression flag
    queue_flag.0.store(true, Ordering::SeqCst);

    // Record snapshot OID for rollback. Open and drop repo immediately
    // to avoid Windows file lock issues during pipeline execution.
    let snapshot_oid = {
        let repo = Repository::open(project_path)
            .map_err(|_| GitError::RepoNotFound(project_path.to_string()))?;
        let oid = repo
            .head()?
            .target()
            .ok_or_else(|| GitError::MergeAborted("HEAD has no target".into()))?;
        // repo dropped here
        oid
    };

    // Detect build number once before queue starts (MERGE-05)
    let base_build = build::detect_current_build(project_path, build_patterns)?;
    let mut current_build = base_build.unwrap_or(0);

    let total = branches.len();
    let mut completed = 0;
    let first_build = current_build + 1;

    for (i, branch) in branches.iter().enumerate() {
        // Emit "active" progress
        let _ = app.emit(
            "merge-queue-progress",
            QueueProgress {
                index: i,
                total,
                branch: branch.clone(),
                status: "active".into(),
            },
        );

        current_build += 1;
        let override_build = if build_patterns.is_empty() {
            None
        } else {
            Some(current_build)
        };

        let mut ctx = MergeContext::new(
            project_path,
            branch,
            merge_target,
            build_patterns,
            changelog_config,
            override_build,
        );

        // Run full pipeline
        let result = merge_execute(&mut ctx)
            .and_then(|_| merge_bump(&mut ctx))
            .and_then(|_| merge_changelog(&mut ctx))
            .and_then(|_| merge_commit(&mut ctx));

        match result {
            Ok(()) => {
                completed += 1;
                let _ = app.emit(
                    "merge-queue-progress",
                    QueueProgress {
                        index: i,
                        total,
                        branch: branch.clone(),
                        status: "complete".into(),
                    },
                );
            }
            Err(e) => {
                // Emit failure for current branch
                let _ = app.emit(
                    "merge-queue-progress",
                    QueueProgress {
                        index: i,
                        total,
                        branch: branch.clone(),
                        status: "failed".into(),
                    },
                );

                // Rollback: reset to snapshot OID (MERGE-04)
                if let Ok(repo) = Repository::open(project_path) {
                    if let Ok(commit) = repo.find_commit(snapshot_oid) {
                        let _ =
                            repo.reset(commit.as_object(), git2::ResetType::Hard, None);
                    }
                }

                // Emit rolled_back status for each previously completed branch
                for j in 0..completed {
                    let _ = app.emit(
                        "merge-queue-progress",
                        QueueProgress {
                            index: j,
                            total,
                            branch: branches[j].clone(),
                            status: "rolled_back".into(),
                        },
                    );
                }

                // Clear suppression flag + force refresh
                queue_flag.0.store(false, Ordering::SeqCst);
                let _ = app.emit(
                    "git-changed",
                    serde_json::json!({
                        "project_path": project_path,
                        "change_type": "refs_changed"
                    }),
                );

                return Ok(QueueResult {
                    success: false,
                    completed,
                    total,
                    failed_branch: Some(branch.clone()),
                    error: Some(e.to_string()),
                    build_range: None,
                });
            }
        }
    }

    // Success: clear flag + force refresh
    queue_flag.0.store(false, Ordering::SeqCst);
    let _ = app.emit(
        "git-changed",
        serde_json::json!({
            "project_path": project_path,
            "change_type": "refs_changed"
        }),
    );

    Ok(QueueResult {
        success: true,
        completed,
        total,
        failed_branch: None,
        error: None,
        build_range: if build_patterns.is_empty() {
            None
        } else {
            Some((first_build, current_build))
        },
    })
}
