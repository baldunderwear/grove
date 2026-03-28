use std::collections::HashMap;
use sysinfo::System;

/// Detects active Claude Code sessions by polling running processes.
///
/// Kept in Tauri managed state so the System instance is reused across polls
/// (avoids expensive re-creation per Pitfall 4 in research).
pub struct SessionDetector {
    system: System,
}

impl SessionDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
        }
    }

    /// Returns a map of worktree_path -> PID for active Claude sessions.
    ///
    /// Refreshes the process list, then matches processes whose name or command
    /// args contain "claude" against the provided worktree paths (normalized
    /// to lowercase forward slashes for Windows compatibility).
    pub fn detect_active_sessions(&mut self, worktree_paths: &[String]) -> HashMap<String, u32> {
        self.system
            .refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let mut active = HashMap::new();

        // Pre-normalize worktree paths for comparison
        let normalized_paths: Vec<(String, &String)> = worktree_paths
            .iter()
            .map(|p| (p.replace('\\', "/").to_lowercase(), p))
            .collect();

        for process in self.system.processes().values() {
            let name = process.name().to_string_lossy().to_lowercase();

            // Check process name for "claude"
            let name_matches = name.contains("claude");

            // Check command-line args for "claude" (handles Node.js wrapper case)
            let cmd_args: Vec<String> = process
                .cmd()
                .iter()
                .take(5) // Only check first few args
                .map(|s| s.to_string_lossy().to_string())
                .collect();
            let cmd_has_claude = cmd_args
                .iter()
                .any(|arg| arg.to_lowercase().contains("claude"));

            if !name_matches && !cmd_has_claude {
                continue;
            }

            // Try to match this claude process to a worktree path
            for (normalized_wt, original_wt) in &normalized_paths {
                // Check cwd
                if let Some(cwd) = process.cwd() {
                    let cwd_str = cwd.to_string_lossy().replace('\\', "/").to_lowercase();
                    if cwd_str.starts_with(normalized_wt.as_str()) {
                        active.insert((*original_wt).clone(), process.pid().as_u32());
                        break;
                    }
                }

                // Check command-line args for worktree path
                let cmd_joined = cmd_args.join(" ").replace('\\', "/").to_lowercase();
                if cmd_joined.contains(normalized_wt.as_str()) {
                    active.insert((*original_wt).clone(), process.pid().as_u32());
                    break;
                }
            }
        }

        active
    }
}
