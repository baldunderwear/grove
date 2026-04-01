# Codebase Concerns

**Analysis Date:** 2026-04-01

## Tech Debt

**No config schema versioning/migration:**
- Issue: `AppConfig.version` field exists in `src-tauri/src/config/models.rs` (hardcoded to `1`) but `load_or_create_config` in `src-tauri/src/config/persistence.rs` does nothing with it. Any structural change to `AppConfig` will silently corrupt or fail on existing user configs.
- Files: `src-tauri/src/config/models.rs`, `src-tauri/src/config/persistence.rs`
- Impact: Schema additions use `#[serde(default)]` which handles forward-compat, but removing or renaming fields breaks deserialization for existing users with no recovery path.
- Fix approach: Add a migration pass in `load_or_create_config` that inspects `version` and reshapes data before returning.

**File watcher does not update when projects are added/removed at runtime:**
- Issue: `watcher::start_watcher` is called once during `setup()` with the project list at that moment (`src-tauri/src/lib.rs` line 87). `stop_watcher()` is a documented no-op. New projects registered after launch are not watched.
- Files: `src-tauri/src/watcher/mod.rs`, `src-tauri/src/lib.rs`
- Impact: Users who add a project after initial launch get no real-time git-change events for it until app restart.
- Fix approach: Expose a `add_watch_path` command; or restart the watcher when `add_project` is called.

**`launch_session` (external terminal window) is a dead code path in the SessionManager flow:**
- Issue: `src-tauri/src/process/launch.rs` spawns external wt.exe/cmd.exe windows. `src-ui/src/components/session/SessionManager.tsx` uses the embedded PTY path entirely. The external-launch path persists in `session_commands.rs` and `process/launch.rs` but `Dashboard.tsx` still calls it via `LaunchDialog`.
- Files: `src-tauri/src/commands/session_commands.rs`, `src-tauri/src/process/launch.rs`, `src-ui/src/pages/Dashboard.tsx`
- Impact: Two separate code paths for "launching a session" creates confusion and split maintenance surface. The external-launch path cannot be monitored, state-tracked, or killed by Grove.
- Fix approach: Decide on one path. If embedded PTY is canonical, deprecate `launch_session` command and update `Dashboard.tsx` to always use the PTY flow.

**`SessionDetector` / `get_active_sessions` orphaned after PTY integration:**
- Issue: `src-tauri/src/process/detect.rs` polls all OS processes to find claude.exe by name/cwd. The embedded PTY path tracks sessions natively in `TerminalManager`. Both systems coexist with no reconciliation.
- Files: `src-tauri/src/process/detect.rs`, `src-tauri/src/commands/session_commands.rs`, `src-ui/src/stores/session-store.ts`
- Impact: `session-store.ts` references `get_active_sessions` invoke calls that are populated independently of `terminal-store.ts` tabs. Data can contradict.
- Fix approach: Remove `SessionDetector` and `get_active_sessions` command once external-launch is retired; drive session state purely from `TerminalManager`.

**`merge_branch` tree-building is fragile for files with Windows line endings:**
- Issue: In `src-tauri/src/git/merge.rs` lines 284-300, disk file content is read with `std::fs::read_to_string` and written as a git blob. On Windows, files with CRLF line endings will produce blobs that differ from what git would create under `core.autocrlf`, potentially causing spurious diff noise or checkout conflicts.
- Files: `src-tauri/src/git/merge.rs`
- Impact: Build bump and changelog rename after merge may produce blobs that don't match what `git checkout` writes, causing working-tree modifications immediately after merge.
- Fix approach: Read file bytes directly (`fs::read`) and write blob from bytes, letting git handle line-ending normalization, or check `core.autocrlf` setting.

**`auto_fetch_interval` minimum enforcement at the wrong layer:**
- Issue: The minimum 60-second interval is enforced in `src-tauri/src/fetch.rs` (runtime loop) but not in `update_settings` command or the frontend `Settings` component. A user can set 0 or 1 seconds through the UI.
- Files: `src-tauri/src/fetch.rs`, `src-tauri/src/commands/config_commands.rs`, `src-ui/src/pages/Settings.tsx`
- Impact: Setting interval to 0 correctly disables fetch, but setting 1-59 feels broken (silently clamps to 60 with no feedback).
- Fix approach: Add validation in `update_settings` to reject or clamp values between 1-59; document that 0 = disabled.

---

## Known Bugs

**Prompt auto-send fires on first data chunk, not on Claude's ready prompt:**
- Symptoms: Initial prompt from `launchOptions.prompt` is sent 2000ms after the first PTY data chunk arrives, using a hardcoded `setTimeout`. If the PTY is slow (NAS, large worktree) or Claude's startup banner is long, the prompt may be injected before Claude's `>` prompt appears, causing it to be echoed as shell input rather than received by Claude.
- Files: `src-ui/src/components/session/SessionManager.tsx` lines 67-91
- Trigger: Launching a session with an initial prompt on a slow machine or large repo.
- Workaround: None for users; 2000ms delay is a heuristic.

**Tab ID two-phase swap can lose `appendOutput` updates:**
- Symptoms: `appendOutput` uses `terminalIdRef.current ?? tab.id` — but between PTY spawn and `activateTab`, the tab still has `pending-*` as its ID. Output arriving during that window is appended under `pending-*`. After `activateTab` swaps the key to the real terminal ID, those `lastLines` entries are orphaned.
- Files: `src-ui/src/stores/terminal-store.ts`, `src-ui/src/components/session/SessionManager.tsx`
- Trigger: Fast PTY startup or high-throughput initial output (Claude startup banner).

**UNC path resolution is called on every `terminal_spawn` without caching:**
- Symptoms: `get_drive_mappings()` shells out to `net use` synchronously on every PTY spawn (`src-tauri/src/utils/paths.rs`). On networks where `net use` is slow, this blocks the command thread.
- Files: `src-tauri/src/terminal/commands.rs` line 27, `src-tauri/src/utils/paths.rs`
- Trigger: Spawning a terminal on a machine with slow network drive enumeration.

**Watcher misses git-dir changes for worktrees with non-standard gitdir pointers:**
- Symptoms: `resolve_git_dir` in `src-tauri/src/watcher/mod.rs` assumes worktree gitdir pointers are exactly two levels under `.git` (`.git/worktrees/<name>`). If the pointer resolves to a deeper path, `parent().and_then(|p| p.parent())` silently returns the pointer path itself.
- Files: `src-tauri/src/watcher/mod.rs` line 133
- Trigger: Non-standard git configurations (e.g., `--separate-git-dir`).

---

## Security Considerations

**`write_text_file` accepts arbitrary absolute paths with no sandboxing:**
- Risk: The Tauri command `write_text_file` in `src-tauri/src/commands/file_commands.rs` accepts any filesystem path from the frontend, including paths outside the project directory. A compromised webview or XSS could overwrite any file the app process can write.
- Files: `src-tauri/src/commands/file_commands.rs`
- Current mitigation: Tauri's CSP restricts webview navigation; no input from external sources.
- Recommendations: Add an allowlist check that restricts writes to paths within registered project directories or the app data dir. Reject paths traversing above a registered project root.

**`delete_file` has no path restriction:**
- Risk: Same surface as `write_text_file`. Can delete any file accessible to the process.
- Files: `src-tauri/src/commands/file_commands.rs`
- Current mitigation: Tauri CSP; internal use only.
- Recommendations: Same allowlist approach as `write_text_file`.

**SSH key path is stored in plaintext in config.json:**
- Risk: `Profile.ssh_key` in `src-tauri/src/config/models.rs` is stored as a plain path string in `%APPDATA%/grove/config.json`. The private key file itself is not stored by Grove, but the path to it is. If `CLAUDE_CONFIG_DIR` and `GIT_SSH_COMMAND` env vars are set, they are also visible in the config JSON.
- Files: `src-tauri/src/config/models.rs`, `src-tauri/src/terminal/commands.rs`
- Current mitigation: Config file is in user's AppData, user-readable only by default on Windows.
- Recommendations: Document that profiles containing credentials should use filesystem-level ACLs; consider encrypting sensitive profile fields using Windows DPAPI.

**`import_config` replaces the entire config without validation:**
- Risk: `import_config` in `src-tauri/src/commands/config_commands.rs` reads any JSON file from disk and replaces the current config if it deserializes correctly. A maliciously crafted import could inject arbitrary project paths or profile env vars (including `GIT_SSH_COMMAND` with injected arguments).
- Files: `src-tauri/src/commands/config_commands.rs`
- Current mitigation: Import is user-initiated via file picker.
- Recommendations: Add structural validation: reject configs with suspiciously long env var values, disallow shell metacharacters in `ssh_key` paths.

---

## Performance Bottlenecks

**`check_and_notify` runs full `list_worktree_branches` for every project on every `git-changed` event:**
- Problem: `src-tauri/src/lib.rs` listens for `git-changed` and calls `notifications::check_and_notify`, which calls `git::branches::list_worktree_branches` (git2 + ahead/behind counting) for every project. The debounce is 10 seconds but the git operations are synchronous on the listener thread.
- Files: `src-tauri/src/lib.rs` lines 113-126, `src-tauri/src/notifications.rs`
- Cause: Notification check and branch listing share no cached state with the frontend's branch store; data is fetched again from scratch.
- Improvement path: Move notification check to a separate background thread; cache the last known branch states; only re-check the project whose path triggered the event.

**`get_drive_mappings` shells out on every terminal spawn:**
- Problem: `net use` is executed synchronously per spawn rather than cached at startup or on a timer.
- Files: `src-tauri/src/utils/paths.rs`, `src-tauri/src/terminal/commands.rs`
- Cause: No caching layer; function returns a fresh `Vec<DriveMapping>` every call.
- Improvement path: Cache mappings in Tauri managed state with a TTL (e.g., 60s); invalidate on new drive connections.

**`appendOutput` creates a full `Map` copy on every PTY data event:**
- Problem: `terminal-store.ts` `appendOutput` does `new Map(current)` then `next.set(...)` on every data chunk from the PTY reader. With multiple active sessions this causes high GC pressure.
- Files: `src-ui/src/stores/terminal-store.ts` lines 182-204
- Cause: Zustand immutability pattern; no batching of PTY output before store updates.
- Improvement path: Debounce `appendOutput` calls (16ms RAF-aligned), or move `lastLines` out of Zustand into a mutable ref updated outside React's render cycle, and only push to Zustand for `SessionCard` preview updates.

---

## Fragile Areas

**Merge commit creation modifies HEAD without checking for dirty working tree:**
- Files: `src-tauri/src/git/merge.rs` lines 186-187
- Why fragile: `repo.set_head(...)` and `repo.checkout_head(force())` are called unconditionally. If the target branch worktree has uncommitted changes, they are silently blown away by the forced checkout.
- Safe modification: Add a `repo.statuses()` dirty check before `set_head`; return `GitError::UnexpectedConflict` or a new `DirtyWorkingTree` error if changes would be lost.
- Test coverage: No test covers this case; `src-tauri/src/git/merge.rs` has no `#[cfg(test)]` block.

**`StateParser` prompt-detection uses line-length heuristic (`< 80` chars) that will fail on wide prompts:**
- Files: `src-tauri/src/terminal/state_parser.rs` lines 192-197
- Why fragile: Claude Code may display prompts wider than 80 characters in future versions or when branch names are long. The heuristic `line.ends_with("> ")` with `line.len() < 80` would miss those prompts entirely.
- Safe modification: Remove the line-length guard; add more specific prompt patterns instead of relying on length.
- Test coverage: Unit tests exist for ANSI stripping and individual patterns but not for the 80-char edge case.

**`activateTab` swaps the tab's key in the `Map`; any code holding a stale `tabId` will fail silently:**
- Files: `src-ui/src/stores/terminal-store.ts` lines 99-113
- Why fragile: The ID changes from `pending-*` to the real terminal UUID after spawn. Components holding the pending ID (e.g., `focusedSessionId` from before activation) may point at a nonexistent key.
- Safe modification: Keep the pending ID as a stable component key; store the real terminal ID as a separate field on `TerminalTab`. This decouples display identity from backend identity.
- Test coverage: None; no frontend tests exist.

**`extract_worktree_name` only strips three hardcoded prefixes:**
- Files: `src-tauri/src/git/merge.rs` lines 482-491
- Why fragile: Changelog fragment filenames are derived from the worktree name. If a project uses a branch prefix other than `wt/`, `worktree-`, or `worktree/` (e.g., the user-configured `branch_prefix`), changelog fragments will be named with the full branch name including prefix, and the rename target will mismatch.
- Safe modification: Pass the project's configured `branch_prefix` into `extract_worktree_name` and strip it dynamically.
- Test coverage: No tests for this function.

**`Box::leak` in watcher for both native and poll watchers:**
- Files: `src-tauri/src/watcher/mod.rs` lines 52, 181
- Why fragile: Watchers are intentionally leaked because there is no mechanism to stop them. This means adding a watched path requires restarting the app. It also means any future attempt to implement dynamic project management must be rearchitected.
- Safe modification: Store watchers in Tauri managed state (`Mutex<Option<Box<dyn Watcher>>>`) for proper lifecycle management.
- Test coverage: Watcher tests only cover helper functions, not the leak pattern.

---

## Scaling Limits

**TerminalManager stores all sessions in a single `Mutex<HashMap>`:**
- Current capacity: Works for typical use (2-8 concurrent sessions).
- Limit: Every PTY write (`terminal_write`) and resize (`terminal_resize`) acquires the manager mutex. With many concurrent sessions, high-frequency typing in one session delays resize signals to others.
- Scaling path: Store sessions in `DashMap` (concurrent HashMap) or use per-session `Arc<Mutex<TerminalSession>>` so writes to different sessions don't contend.

**`config.json` grows unbounded with session history transitions:**
- Current capacity: History is in-memory only (`HistoryManager`), not persisted. Config only grows with projects/profiles/templates.
- Limit: Not a current issue; noted for future if session history is persisted.

---

## Dependencies at Risk

**`portable-pty` is the sole PTY implementation with no abstraction layer:**
- Risk: The entire terminal subsystem depends on `portable_pty`. The crate has limited maintenance activity. Any breaking change or abandonment would require a full PTY rewrite.
- Impact: All of `src-tauri/src/terminal/pty.rs` and `src-tauri/src/terminal/mod.rs` break.
- Migration plan: The PTY spawn interface is isolated in `pty.rs`; a thin trait abstraction over `spawn_pty` would allow swapping to `wezterm-pty` or `conpty` bindings.

**`notify` + `notify-debouncer-mini` version fragility:**
- Risk: `Box::leak` on the watcher means the watcher lifetime is tied to the binary. If `notify`'s internal event format changes, the manually-constructed `DebouncedEvent` adapter in `start_poll_watcher` (`src-tauri/src/watcher/mod.rs` lines 156-168) will silently emit wrong data.
- Impact: Silent failure of the PollWatcher fallback path.
- Migration plan: Replace the manual event adapter with `notify`'s own debouncer abstractions.

---

## Missing Critical Features

**No config backup before destructive operations:**
- Problem: `import_config` and `remove_project` overwrite or mutate `config.json` immediately with no backup. A failed write (disk full, permissions) could leave the config corrupt with no recovery.
- Blocks: Safe config import/export workflow.

**No test suite for the frontend:**
- Problem: Zero `.test.tsx` or `.spec.ts` files exist in `src-ui/`. All logic in stores, hooks, and complex components (`SessionManager`, `MergeDialog`, `BranchTable`) is untested.
- Blocks: Refactoring stores (e.g., the two-phase tab ID issue) without regression risk.

**Watcher is not restarted when projects are added at runtime:**
- Problem: Documented above under Tech Debt. No mechanism to add watched paths without restarting Grove.
- Blocks: Real-time refresh for newly added projects.

---

## Test Coverage Gaps

**Git merge logic (`src-tauri/src/git/merge.rs`):**
- What's not tested: `merge_branch` execution path, dirty working tree detection, build-file conflict auto-resolution, changelog fragment rename, two-parent commit creation.
- Files: `src-tauri/src/git/merge.rs`
- Risk: Silent data loss (overwriting working tree) or corrupt commits go undetected.
- Priority: High

**Terminal store two-phase tab ID swap:**
- What's not tested: The `activateTab` Map key replacement and subsequent lookups by stale ID.
- Files: `src-ui/src/stores/terminal-store.ts`
- Risk: `focusedSessionId` or `closeTab` calls fail silently against a nonexistent key.
- Priority: High

**UNC path resolution (`src-tauri/src/utils/paths.rs`):**
- What's not tested: `resolve_unc_path` when no mapping matches, when `net use` returns non-standard output, or when a path contains mixed separators.
- Files: `src-tauri/src/utils/paths.rs`
- Risk: PTY spawn silently fails or uses wrong working directory for NAS-hosted repos.
- Priority: Medium

**Config persistence round-trip:**
- What's not tested: `load_or_create_config` with a corrupt JSON, missing fields, or a future `version: 2` file.
- Files: `src-tauri/src/config/persistence.rs`
- Risk: User data loss or panic on startup after a partial write.
- Priority: High

**Session state parser edge cases:**
- What's not tested: State transitions with very wide prompt lines (> 80 chars), rapid state flipping within the 2-second debounce window, idle detection when the reader thread is alive but PTY is paused.
- Files: `src-tauri/src/terminal/state_parser.rs`
- Risk: False positive "waiting" or "error" states shown in the UI, spurious notifications.
- Priority: Medium

---

*Concerns audit: 2026-04-01*
