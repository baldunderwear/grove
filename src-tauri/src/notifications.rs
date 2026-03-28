use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri_plugin_notification::NotificationExt;

/// Tracks per-branch notification state so we only fire on transitions (false -> true).
pub struct NotificationState {
    /// branch_key ("project_name:branch_name") -> was merge-ready last check
    merge_ready: HashMap<String, bool>,
    /// branch_key -> was stale last check
    stale: HashMap<String, bool>,
}

impl NotificationState {
    pub fn new() -> Self {
        Self {
            merge_ready: HashMap::new(),
            stale: HashMap::new(),
        }
    }
}

/// Seven days in seconds.
const STALE_THRESHOLD_SECS: i64 = 7 * 24 * 3600;

/// Check all registered projects for merge-ready / stale branch transitions
/// and fire OS notifications only when the state changes from false to true.
pub fn check_and_notify(
    app: &tauri::AppHandle,
    state: &std::sync::Mutex<NotificationState>,
) {
    let config = match crate::config::persistence::load_or_create_config(app) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[grove] notifications: failed to load config: {}", e);
            return;
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let mut guard = match state.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("[grove] notifications: lock poisoned: {}", e);
            return;
        }
    };

    for project in &config.projects {
        let branches = match crate::git::branches::list_worktree_branches(
            &project.path,
            &project.branch_prefix,
            &project.merge_target,
        ) {
            Ok(b) => b,
            Err(e) => {
                eprintln!(
                    "[grove] notifications: failed to list branches for {}: {}",
                    project.name, e
                );
                continue;
            }
        };

        for branch in &branches {
            let key = format!("{}:{}", project.name, branch.name);

            // --- Merge-ready check ---
            if config.settings.notify_merge_ready {
                let is_merge_ready = branch.ahead > 0 && !branch.is_dirty;
                let was_notified = *guard.merge_ready.get(&key).unwrap_or(&false);

                if is_merge_ready && !was_notified {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Branch Ready to Merge")
                        .body(&format!(
                            "{} in {} is merge-ready",
                            branch.name, project.name
                        ))
                        .show();
                }

                guard.merge_ready.insert(key.clone(), is_merge_ready);
            }

            // --- Stale check ---
            if config.settings.notify_stale_branch {
                let age = now - branch.last_commit_timestamp;
                let is_stale = age > STALE_THRESHOLD_SECS;
                let was_stale = *guard.stale.get(&key).unwrap_or(&false);

                if is_stale && !was_stale {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Stale Branch Detected")
                        .body(&format!(
                            "{} in {} has no activity for 7+ days",
                            branch.name, project.name
                        ))
                        .show();
                }

                guard.stale.insert(key, is_stale);
            }
        }
    }
}

/// Fire a one-shot notification after a merge completes.
/// Called from the merge command handler.
pub fn notify_merge_complete(
    app: &tauri::AppHandle,
    branch_name: &str,
    project_name: &str,
    build_number: &str,
) {
    let config = match crate::config::persistence::load_or_create_config(app) {
        Ok(c) => c,
        Err(_) => return,
    };

    if !config.settings.notify_merge_complete {
        return;
    }

    let _ = app
        .notification()
        .builder()
        .title("Merge Complete")
        .body(&format!(
            "{} merged into {} (build {})",
            branch_name, project_name, build_number
        ))
        .show();
}
