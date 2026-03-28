use std::thread;
use std::time::Duration;

use tauri::Emitter;

/// Start a background thread that periodically runs `git fetch` on all
/// registered projects. The interval is read from config each loop iteration
/// so changes take effect without restarting.
pub fn start_auto_fetch(app: tauri::AppHandle) {
    thread::spawn(move || {
        loop {
            let config = match crate::config::persistence::load_or_create_config(&app) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[grove] auto-fetch: failed to load config: {}", e);
                    thread::sleep(Duration::from_secs(60));
                    continue;
                }
            };

            let interval = config.settings.auto_fetch_interval;

            if interval == 0 {
                // Disabled -- sleep and re-check periodically
                thread::sleep(Duration::from_secs(60));
                continue;
            }

            // Enforce minimum 60-second interval
            let interval = interval.max(60);
            thread::sleep(Duration::from_secs(interval as u64));

            // Reload config to get current project list (may have changed during sleep)
            let config = match crate::config::persistence::load_or_create_config(&app) {
                Ok(c) => c,
                Err(_) => continue,
            };

            for project in &config.projects {
                match fetch_remote(&project.path) {
                    Ok(()) => {
                        eprintln!("[grove] auto-fetch: fetched {}", project.path);
                    }
                    Err(e) => {
                        eprintln!("[grove] auto-fetch: error fetching {}: {}", project.path, e);
                    }
                }
            }

            // Emit git-changed so dashboard and notifications refresh
            let _ = app.emit(
                "git-changed",
                crate::watcher::GitChangeEvent {
                    project_path: "all".to_string(),
                    change_type: "fetch_complete".to_string(),
                },
            );
        }
    });
}

/// Run `git fetch --all --prune` on a project directory using the git CLI.
///
/// We shell out to the git CLI rather than using git2::Remote::fetch() because
/// the CLI automatically uses the user's configured SSH agent, credential
/// helpers, and .gitconfig. git2 requires manual credential callback setup
/// which is fragile on Windows.
fn fetch_remote(project_path: &str) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["fetch", "--all", "--prune"])
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("git fetch failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git fetch failed: {}", stderr));
    }

    Ok(())
}
