use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::Serialize;
use tauri::Emitter;

/// Payload emitted on the "git-changed" Tauri event channel.
#[derive(Debug, Clone, Serialize)]
pub struct GitChangeEvent {
    pub project_path: String,
    pub change_type: String,
}

/// Start watching registered project directories for git-relevant changes.
///
/// Monitors `.git/refs/`, `.git/worktrees/`, and `.git/HEAD` in each project.
/// Emits `"git-changed"` events via Tauri's event system so the frontend can
/// refresh the dashboard in real time.
///
/// Falls back to `PollWatcher` when the OS-native watcher fails (e.g. NAS/network drives).
pub fn start_watcher(app: tauri::AppHandle, project_paths: Vec<String>) -> Result<(), String> {
    if project_paths.is_empty() {
        return Ok(());
    }

    // Collect watch targets: for each project, derive the git-internal paths to monitor.
    let watch_targets = collect_watch_targets(&project_paths);
    if watch_targets.is_empty() {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel();

    // Try the recommended (OS-native) debounced watcher first.
    let use_poll = match new_debouncer(Duration::from_secs(2), tx.clone()) {
        Ok(mut debouncer) => {
            let mut any_failed = false;
            for (path, mode) in &watch_targets {
                if debouncer.watcher().watch(path, *mode).is_err() {
                    any_failed = true;
                    break;
                }
            }
            if any_failed {
                // Drop the native watcher; we'll fall back to polling.
                drop(debouncer);
                true
            } else {
                // Leak the debouncer so it lives for the entire app lifetime.
                Box::leak(Box::new(debouncer));
                false
            }
        }
        Err(_) => true,
    };

    if use_poll {
        eprintln!("[grove] OS-native watcher unavailable, falling back to PollWatcher (5s interval)");
        start_poll_watcher(&watch_targets, tx)
            .map_err(|e| format!("PollWatcher failed to start: {}", e))?;
    }

    // Clone project paths for the event-processing thread.
    let paths = project_paths.clone();

    std::thread::spawn(move || {
        process_events(rx, &app, &paths);
    });

    Ok(())
}

/// Placeholder for future dynamic stop support.
/// Currently the watcher runs for the app's full lifetime.
pub fn stop_watcher() {
    // No-op. Extension point for dynamic add/remove of watched paths.
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// For each project path, derive the git-internal paths we want to watch.
fn collect_watch_targets(project_paths: &[String]) -> Vec<(PathBuf, RecursiveMode)> {
    let mut targets = Vec::new();

    for project_path in project_paths {
        let base = Path::new(project_path);
        let git_dir = resolve_git_dir(base);

        let refs_dir = git_dir.join("refs");
        let worktrees_dir = git_dir.join("worktrees");
        let head_file = git_dir.join("HEAD");

        // Only watch paths that actually exist on disk.
        if refs_dir.is_dir() {
            targets.push((refs_dir, RecursiveMode::Recursive));
        }
        if worktrees_dir.is_dir() {
            targets.push((worktrees_dir, RecursiveMode::Recursive));
        }
        if head_file.exists() {
            // Watch the .git directory non-recursively for HEAD changes.
            targets.push((git_dir, RecursiveMode::NonRecursive));
        }
    }

    targets
}

/// Resolve the actual `.git` directory for a path.
/// If the path is a worktree checkout (`.git` is a file containing `gitdir: ...`),
/// follow the pointer to the real git directory.
fn resolve_git_dir(project_path: &Path) -> PathBuf {
    let dot_git = project_path.join(".git");
    if dot_git.is_file() {
        // Worktree: .git is a file with content like "gitdir: /path/to/.git/worktrees/branch"
        if let Ok(contents) = std::fs::read_to_string(&dot_git) {
            let trimmed = contents.trim();
            if let Some(gitdir) = trimmed.strip_prefix("gitdir:") {
                let gitdir = gitdir.trim();
                let gitdir_path = Path::new(gitdir);
                // If relative, resolve against the project directory.
                let resolved = if gitdir_path.is_absolute() {
                    gitdir_path.to_path_buf()
                } else {
                    project_path.join(gitdir_path)
                };
                // Go up from .git/worktrees/<name> to the actual .git dir.
                if let Some(parent_git) = resolved.parent().and_then(|p| p.parent()) {
                    return parent_git.to_path_buf();
                }
                return resolved;
            }
        }
    }
    dot_git
}

/// Start a `PollWatcher` as fallback for network drives / NAS.
fn start_poll_watcher(
    watch_targets: &[(PathBuf, RecursiveMode)],
    tx: mpsc::Sender<Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>>,
) -> Result<(), notify::Error> {
    use notify::{PollWatcher, Watcher};

    let poll_config = notify::Config::default()
        .with_poll_interval(Duration::from_secs(5));

    // PollWatcher sends raw notify events. We wrap them to match the debouncer channel type.
    let tx_clone = tx;
    let mut watcher = PollWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            let debounced = match result {
                Ok(event) => {
                    let debounced_events: Vec<notify_debouncer_mini::DebouncedEvent> = event
                        .paths
                        .into_iter()
                        .map(|p| notify_debouncer_mini::DebouncedEvent {
                            path: p,
                            kind: DebouncedEventKind::Any,
                        })
                        .collect();
                    Ok(debounced_events)
                }
                Err(e) => Err(e),
            };
            let _ = tx_clone.send(debounced);
        },
        poll_config,
    )?;

    for (path, mode) in watch_targets {
        watcher.watch(path, *mode)?;
    }

    // Leak so the watcher lives for the app's lifetime.
    Box::leak(Box::new(watcher));
    Ok(())
}

/// Process debounced filesystem events on a background thread.
fn process_events(
    rx: mpsc::Receiver<Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>>,
    app: &tauri::AppHandle,
    project_paths: &[String],
) {
    loop {
        match rx.recv() {
            Ok(Ok(events)) => {
                // Deduplicate: emit at most one event per project per batch.
                let mut emitted: std::collections::HashSet<String> = std::collections::HashSet::new();

                for event in &events {
                    if !is_git_relevant(&event.path) {
                        continue;
                    }

                    let change_type = classify_change(&event.path);

                    // Match the changed path back to a registered project.
                    if let Some(project_path) = find_project_for_path(&event.path, project_paths) {
                        let key = format!("{}:{}", project_path, change_type);
                        if emitted.insert(key) {
                            let _ = app.emit(
                                "git-changed",
                                GitChangeEvent {
                                    project_path,
                                    change_type: change_type.to_string(),
                                },
                            );
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                eprintln!("[grove] watcher error: {}", e);
            }
            Err(_) => {
                // Channel closed -- watcher was dropped. Exit thread.
                break;
            }
        }
    }
}

/// Check whether a path is relevant to git state changes.
fn is_git_relevant(path: &Path) -> bool {
    // Normalize to forward slashes for consistent matching.
    let s = path.to_string_lossy().replace('\\', "/");
    s.contains(".git/refs/")
        || s.contains(".git/worktrees/")
        || s.contains(".git/HEAD")
        || s.contains(".git/index")
        || s.contains(".git/MERGE_HEAD")
}

/// Classify a git-relevant path change into a semantic change type.
fn classify_change(path: &Path) -> &'static str {
    let s = path.to_string_lossy().replace('\\', "/");

    if s.contains(".git/worktrees/") {
        // Heuristic: new worktree directories appear, deleted ones disappear.
        // We can't distinguish create vs delete from the path alone in all cases,
        // so we check if the path still exists on disk.
        if path.exists() {
            "branch_added"
        } else {
            "branch_removed"
        }
    } else if s.contains(".git/refs/") {
        "refs_changed"
    } else {
        "status_changed"
    }
}

/// Find which registered project a changed path belongs to.
fn find_project_for_path(changed_path: &Path, project_paths: &[String]) -> Option<String> {
    let changed = changed_path.to_string_lossy().replace('\\', "/").to_lowercase();

    for pp in project_paths {
        let normalized = pp.replace('\\', "/").to_lowercase();
        if changed.starts_with(&normalized) {
            return Some(pp.clone());
        }
    }

    // Also check if the changed path is inside a .git dir that belongs to a project.
    // This handles the case where the .git dir is elsewhere (worktree gitdir pointer).
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_git_relevant() {
        assert!(is_git_relevant(Path::new("/repo/.git/refs/heads/main")));
        assert!(is_git_relevant(Path::new("/repo/.git/worktrees/feature")));
        assert!(is_git_relevant(Path::new("/repo/.git/HEAD")));
        assert!(is_git_relevant(Path::new("/repo/.git/index")));
        assert!(is_git_relevant(Path::new("/repo/.git/MERGE_HEAD")));
        assert!(!is_git_relevant(Path::new("/repo/src/main.rs")));
        assert!(!is_git_relevant(Path::new("/repo/.gitignore")));
    }

    #[test]
    fn test_classify_change() {
        assert_eq!(
            classify_change(Path::new("/repo/.git/refs/heads/main")),
            "refs_changed"
        );
        // Non-existent worktree path => branch_removed
        assert_eq!(
            classify_change(Path::new("/nonexistent/.git/worktrees/feature")),
            "branch_removed"
        );
        assert_eq!(
            classify_change(Path::new("/repo/.git/HEAD")),
            "status_changed"
        );
    }

    #[test]
    fn test_find_project_for_path() {
        let projects = vec![
            "Z:/data/development/grove".to_string(),
            "Z:/data/development/other".to_string(),
        ];
        let result = find_project_for_path(
            Path::new("Z:/data/development/grove/.git/refs/heads/main"),
            &projects,
        );
        assert_eq!(result, Some("Z:/data/development/grove".to_string()));

        let result = find_project_for_path(
            Path::new("Z:/data/development/unknown/.git/HEAD"),
            &projects,
        );
        assert!(result.is_none());
    }
}
