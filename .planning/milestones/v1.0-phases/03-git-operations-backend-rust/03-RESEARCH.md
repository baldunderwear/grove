# Phase 03: Git Operations Backend (Rust) - Research

**Researched:** 2026-03-27
**Domain:** Rust git operations (git2), file system watching (notify), Tauri event system
**Confidence:** HIGH

## Summary

This phase builds the Rust backend for all git operations Grove needs: listing worktree branches with status, computing ahead/behind counts, checking dirty state, previewing merges, executing atomic merges with build number bump and changelog rename, and watching the filesystem for changes. The project already has git2 0.20.4 in Cargo.toml and uses it for repo detection in Phase 02, so this phase extends that foundation heavily.

The core challenge is the merge workflow: it must be atomic (rollback on any failure), handle build file conflict auto-resolution, bump build numbers, rename changelog fragments, and create a merge commit -- all through git2's libgit2 bindings rather than shelling out to git CLI. The file watcher (notify crate) feeds events through Tauri's event system to trigger frontend refreshes.

**Primary recommendation:** Use git2 0.20.4 for all git operations, notify 8.x with notify-debouncer-mini for filesystem watching, and glob 0.3.x for build file pattern matching. Implement merge as a multi-step transaction with explicit rollback points.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion (infrastructure phase).

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-02.1 | Display all worktree branches matching branch prefix | git2 `Repository::worktrees()` + `Worktree::path()` + `Repository::open()` per worktree |
| FR-02.2 | Show per-branch: name, commits ahead/behind, last commit message/date | git2 `graph_ahead_behind()`, `revwalk()`, `Commit::message()`, `Commit::time()` |
| FR-02.3 | Show per-branch: dirty/clean status | git2 `Repository::statuses()` with `StatusOptions` |
| FR-04.1 | Preview merge: commits to merge, changelog fragments, build number | git2 `merge_analysis()`, `revwalk()`, filesystem scan for changelog/build files |
| FR-04.2 | Execute merge with auto-resolve build file conflicts, bump build number | git2 `merge_commits()`, `checkout_index()`, `repo.commit()` with 2 parents |
| FR-04.3 | Handle changelog fragments: rename worktree-{name}.md to {build}.md | std::fs operations within atomic merge transaction |
| FR-04.4 | Handle legacy numbered changelogs from branches using old protocol | Glob pattern matching on changelog directory |
| FR-04.5 | Detect unexpected conflicts (non-build files) and surface to user | git2 `Index::has_conflicts()` after merge, iterate conflict entries |
| FR-04.6 | Confirmation dialog before merge | Frontend concern -- backend provides preview data |
| FR-04.7 | Post-merge summary | Return struct with build number, commit count, warnings |
| FR-04.8 | Merge is local only -- never pushes | git2 merge is inherently local; no push commands implemented |
| FR-06.1 | Watch registered project directories for git changes | notify crate with debouncer watching .git dirs and worktree paths |
| FR-06.2 | Detect new worktree branches created outside app | File watcher on .git/worktrees/ directory + periodic rescan |
| FR-06.3 | Detect worktree branch deletion | Same watcher -- deletion events on worktree dirs |
| FR-06.4 | Update dashboard in real-time | Tauri `app.emit()` event system to push changes to frontend |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 | 0.20.4 | All git operations (branches, status, merge, commits) | Already in project; safe Rust bindings to libgit2; no CLI dependency |
| notify | 8.2.0 | Filesystem event watching | De facto standard for Rust FS watching; used by rust-analyzer, deno, watchexec |
| notify-debouncer-mini | 0.4.x | Debounce rapid FS events | Prevents event flooding; one event per file per timeframe |
| glob | 0.3.3 | Build file pattern matching | Standard library for Unix-style glob patterns in Rust |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| serde | 1.x | Serialization (already present) | All data structures passed to frontend |
| thiserror | 2.x | Error types (already present) | GitError enum definition |
| tauri | 2.10.x | Event emission + command system (already present) | Emitting git-change events to frontend |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git2 | std::process::Command + git CLI | CLI is simpler for some ops but requires git installed; git2 gives programmatic control, no parsing |
| notify | polling loop | Polling wastes CPU; notify uses OS-native APIs (ReadDirectoryChangesW on Windows) |
| glob | globset | globset is more powerful (regex-based) but overkill for simple build file patterns |
| notify-debouncer-mini | notify-debouncer-full | full tracks renames and FS IDs -- unnecessary for git change detection |

**Installation (add to Cargo.toml):**
```toml
notify = "8.2"
notify-debouncer-mini = "0.4"
glob = "0.3"
```

## Architecture Patterns

### Recommended Module Structure
```
src-tauri/src/
  git/
    mod.rs            # Public API, re-exports
    branches.rs       # Branch listing, status, ahead/behind
    status.rs         # Dirty check, file status
    merge.rs          # Merge workflow (preview, execute, rollback)
    build.rs          # Build number detection, bump, conflict resolution
    changelog.rs      # Changelog fragment rename logic
    error.rs          # GitError enum
  watcher/
    mod.rs            # File watcher setup, event routing
  commands/
    mod.rs            # Re-exports (add git_commands)
    config_commands.rs  # Existing
    git_commands.rs   # New Tauri commands for git operations
  config/             # Existing
  lib.rs              # Add git + watcher modules, register commands
```

### Pattern 1: Git Error Handling (matching existing ConfigError pattern)
**What:** Dedicated error enum with thiserror, serialized as string for Tauri
**When to use:** All git operations
**Example:**
```rust
// Source: Established pattern from config/persistence.rs
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Repository not found: {0}")]
    RepoNotFound(String),

    #[error("Branch not found: {0}")]
    BranchNotFound(String),

    #[error("Merge conflict in non-build files")]
    UnexpectedConflict(Vec<String>),

    #[error("Merge aborted: {0}")]
    MergeAborted(String),
}

impl serde::Serialize for GitError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

### Pattern 2: Tauri Command with AppHandle for Events
**What:** Commands that need both config state and event emission
**When to use:** Git commands that trigger frontend updates
**Example:**
```rust
// Source: Tauri 2 docs - https://v2.tauri.app/develop/calling-frontend/
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct GitChangeEvent {
    project_id: String,
    change_type: String, // "branch_added", "branch_removed", "status_changed"
}

#[tauri::command]
pub fn list_branches(
    app_handle: tauri::AppHandle,
    project_path: String,
    branch_prefix: String,
) -> Result<Vec<BranchInfo>, GitError> {
    // Use git2 to list branches
    // No Mutex needed -- git2 operations are read-only here
    let repo = git2::Repository::open(&project_path)?;
    // ... branch listing logic
}
```

### Pattern 3: Atomic Merge Transaction
**What:** Multi-step merge with explicit rollback on any failure
**When to use:** The merge_branch command
**Example:**
```rust
// Conceptual flow -- NOT a complete implementation
pub fn execute_merge(repo: &Repository, source_branch: &str, target_branch: &str,
                     build_files: &[BuildFileConfig], changelog: &Option<ChangelogConfig>)
    -> Result<MergeResult, GitError>
{
    // 1. Save rollback point (current HEAD oid of target)
    let original_head = repo.head()?.target().unwrap();

    // 2. Perform merge analysis
    let their_commit = find_branch_commit(repo, source_branch)?;
    let analysis = repo.merge_analysis(&[&their_annotated])?;

    // 3. Execute merge_commits to get merged index
    let our_commit = repo.head()?.peel_to_commit()?;
    let mut merged_index = repo.merge_commits(&our_commit, &their_commit, None)?;

    // 4. Check for conflicts
    if merged_index.has_conflicts() {
        let conflicts = categorize_conflicts(&merged_index, build_files);
        if conflicts.has_unexpected {
            // Rollback: reset HEAD to original
            return Err(GitError::UnexpectedConflict(conflicts.unexpected_paths));
        }
        // Auto-resolve build file conflicts (take "ours" version)
        resolve_build_conflicts(&mut merged_index, &conflicts.build_paths)?;
    }

    // 5. Write merged index to tree
    let tree_oid = merged_index.write_tree_to(repo)?;
    let tree = repo.find_tree(tree_oid)?;

    // 6. Bump build number in working tree, stage changes
    // 7. Rename changelog fragments
    // 8. Create merge commit with 2 parents
    let merge_oid = repo.commit(
        Some("HEAD"), &sig, &sig, &message,
        &final_tree, &[&our_commit, &their_commit]
    )?;

    // 9. If anything above failed, we never updated HEAD -- safe by default
    Ok(MergeResult { new_build, commits_merged, .. })
}
```

### Pattern 4: File Watcher with Tauri Event Bridge
**What:** Notify watcher in background thread, emits Tauri events
**When to use:** FR-06.1-FR-06.4, real-time dashboard updates
**Example:**
```rust
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start_watcher(app: AppHandle, paths: Vec<String>) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_secs(2), tx)?;

    for path in &paths {
        debouncer.watcher().watch(
            std::path::Path::new(path),
            notify::RecursiveMode::Recursive,
        )?;
    }

    // Spawn thread to forward events to Tauri
    std::thread::spawn(move || {
        while let Ok(events) = rx.recv() {
            if let Ok(events) = events {
                // Filter for git-relevant changes
                let git_events: Vec<_> = events.iter()
                    .filter(|e| is_git_relevant(&e.path))
                    .collect();
                if !git_events.is_empty() {
                    let _ = app.emit("git-changed", "refresh");
                }
            }
        }
    });

    Ok(())
}
```

### Anti-Patterns to Avoid
- **Shelling out to git CLI:** The project chose git2 -- stay consistent. CLI introduces parsing fragility and requires git on PATH.
- **Holding git2 Repository in Mutex state:** Repository objects are not Send/Sync. Open fresh per-command from the path string. This is fast (local file open).
- **Blocking Tauri commands with long git ops:** Merge operations could take seconds. Mark long-running commands as `async` or use `tauri::async_runtime::spawn_blocking`.
- **Watching entire repo trees recursively:** Watch `.git/refs/`, `.git/worktrees/`, and worktree root `.git` files, not the entire working directory.
- **Using merge() instead of merge_commits():** `repo.merge()` modifies the working directory and index directly -- harder to control. `merge_commits()` returns an in-memory Index that you can inspect before committing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File system watching | Custom polling loop | notify 8.x + debouncer | OS-native APIs, handles edge cases (network drives, symlinks) |
| Glob matching | Regex-based file matching | glob 0.3.x | Battle-tested, handles edge cases in path separators on Windows |
| Git merge | Parsing `git merge` output | git2 merge_commits + merge_analysis | Programmatic control, no CLI dependency, structured error data |
| Event debouncing | Custom timer-based dedup | notify-debouncer-mini | Handles rapid bursts, tested with real FS edge cases |
| Error display | Manual format strings | thiserror derive | Already in project, consistent with ConfigError |

**Key insight:** git2's merge API works on in-memory Index objects, letting you inspect conflicts and modify the tree before ever touching the working directory or HEAD. This is the foundation for atomic merge-with-rollback.

## Common Pitfalls

### Pitfall 1: git2 Repository is Not Send
**What goes wrong:** Trying to store `Repository` in Tauri state or pass across threads causes compile errors.
**Why it happens:** libgit2 objects contain raw pointers that are not thread-safe.
**How to avoid:** Open `Repository::open(path)` fresh in each command. The path string (from config) is the shared state, not the repo handle. Opening is fast (microseconds for local repos).
**Warning signs:** Compilation errors about `Send` or `Sync` bounds on git2 types.

### Pitfall 2: Worktree Branch Discovery
**What goes wrong:** Using `repo.branches()` on the main repo doesn't list worktree-specific branches correctly.
**Why it happens:** Worktrees share the same .git/refs namespace. The branch exists in the main repo's branch list, but you need to filter by prefix and check which are actually worktree checkouts.
**How to avoid:** Use `repo.worktrees()` to get worktree names, then for each: open the worktree path as a new Repository, get its HEAD to find the checked-out branch. Cross-reference with `branch_prefix` filter.
**Warning signs:** Branches listed that aren't actual worktrees, or worktrees missing from the list.

### Pitfall 3: Merge Conflicts in Index
**What goes wrong:** After `merge_commits()`, the returned Index has conflicts but `write_tree_to()` fails because conflicts must be resolved first.
**Why it happens:** git2 requires all conflicts to be resolved (removed from conflict list) before an Index can be written to a tree.
**How to avoid:** After detecting build-file-only conflicts, use `index.remove()` to clear the conflict entries, then `index.add()` with the resolved content (the "ours" version for build files). Only then call `write_tree_to()`.
**Warning signs:** `write_tree_to()` returns error about unresolved conflicts.

### Pitfall 4: Windows Path Handling with git2
**What goes wrong:** git2 uses forward slashes internally; Windows paths with backslashes cause lookup failures.
**Why it happens:** libgit2 normalizes to Unix paths internally.
**How to avoid:** Always normalize paths before passing to git2. The existing codebase already does `replace('\\', "/")` for path comparison -- apply the same pattern.
**Warning signs:** "path not found" errors on Windows that work fine on macOS/Linux.

### Pitfall 5: File Watcher on Network Drives (NAS)
**What goes wrong:** notify's OS-native watcher doesn't work on network-mounted drives (like the Z: drive this project lives on).
**Why it happens:** ReadDirectoryChangesW requires local filesystem or SMB with change notifications enabled. NAS drives often don't support this.
**How to avoid:** Use notify's `PollWatcher` as fallback when `RecommendedWatcher` fails. Detect failure on watcher creation and fall back gracefully. The polling interval can be set higher (5-10s) to reduce load.
**Warning signs:** Watcher creation fails silently or never fires events on Z: drive paths.

### Pitfall 6: Merge Commit Signature
**What goes wrong:** Creating a commit fails because no git user.name/user.email is configured.
**Why it happens:** git2 `Signature::now()` reads from git config; if not set, it fails.
**How to avoid:** Try `repo.signature()` first (reads .gitconfig), fall back to `Signature::now("Grove", "grove@localhost")` if that fails. Or read from repo config explicitly.
**Warning signs:** "config value 'user.name' was not found" error.

## Code Examples

### Branch Listing with Ahead/Behind
```rust
// Source: git2 docs - https://docs.rs/git2/latest/git2/struct.Repository.html
fn get_branch_info(repo: &Repository, branch_name: &str, merge_target: &str)
    -> Result<BranchInfo, GitError>
{
    let branch = repo.find_branch(branch_name, BranchType::Local)?;
    let branch_oid = branch.get().target().ok_or(GitError::BranchNotFound(branch_name.into()))?;

    let target = repo.find_branch(merge_target, BranchType::Local)?;
    let target_oid = target.get().target().ok_or(GitError::BranchNotFound(merge_target.into()))?;

    let (ahead, behind) = repo.graph_ahead_behind(branch_oid, target_oid)?;

    let commit = repo.find_commit(branch_oid)?;
    let message = commit.message().unwrap_or("").to_string();
    let time = commit.time(); // git_time -- seconds since epoch

    Ok(BranchInfo {
        name: branch_name.to_string(),
        ahead,
        behind,
        last_commit_message: message,
        last_commit_timestamp: time.seconds(),
        is_dirty: check_dirty(repo)?,
    })
}
```

### Dirty Status Check
```rust
// Source: git2 StatusOptions docs
fn check_dirty(repo: &Repository) -> Result<bool, GitError> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    Ok(!statuses.is_empty())
}
```

### Worktree Enumeration
```rust
// Source: git2 worktree API docs
fn list_worktree_branches(main_repo_path: &str, prefix: &str)
    -> Result<Vec<WorktreeInfo>, GitError>
{
    let repo = Repository::open(main_repo_path)?;
    let worktree_names = repo.worktrees()?;
    let mut results = Vec::new();

    for name in worktree_names.iter() {
        let name = match name {
            Some(n) => n,
            None => continue,
        };
        let wt = repo.find_worktree(name)?;
        let wt_path = wt.path();

        // Open the worktree as its own repository
        let wt_repo = Repository::open(wt_path)?;
        let head = wt_repo.head()?;
        let branch_name = head.shorthand().unwrap_or("").to_string();

        // Filter by prefix
        if !branch_name.starts_with(prefix) {
            continue;
        }

        results.push(WorktreeInfo {
            name: name.to_string(),
            branch: branch_name,
            path: wt_path.to_string_lossy().to_string(),
        });
    }

    Ok(results)
}
```

### Build Number Bump
```rust
// Conceptual -- build file is JSON/TOML with a version/build field
fn bump_build_number(repo_path: &str, build_patterns: &[BuildFileConfig])
    -> Result<u32, GitError>
{
    let mut max_build = 0u32;
    for pattern in build_patterns {
        for entry in glob::glob(&format!("{}/{}", repo_path, pattern.pattern))
            .map_err(|e| GitError::MergeAborted(format!("Bad glob: {}", e)))?
        {
            let path = entry.map_err(|e| GitError::Io(e.into_error()))?;
            let content = std::fs::read_to_string(&path)?;
            // Parse build number from file content (project-specific format)
            if let Some(num) = extract_build_number(&content) {
                max_build = max_build.max(num);
            }
        }
    }
    let new_build = max_build + 1;
    // Write new build number back to files
    Ok(new_build)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git2 0.19.x | git2 0.20.x | 2024 | Minor API changes; 0.20.4 is latest stable |
| notify 6.x | notify 8.2.0 | 2024-2025 | Major version bump; API simplified; separate debouncer crates |
| Tauri 1 events | Tauri 2 Emitter trait | 2024 | `emit_all` replaced by `emit`; requires `use tauri::Emitter` |

**Deprecated/outdated:**
- `app.emit_all()` -- Tauri 1 API. Use `app.emit()` in Tauri 2 (it broadcasts globally).
- notify 5.x/6.x debounce built-in -- removed in 7+. Use separate debouncer crates.

## Open Questions

1. **Build file format**
   - What we know: ProjectConfig has `build_files: Vec<BuildFileConfig>` with a `pattern` field (glob). The sol-lune project has build numbers.
   - What's unclear: The exact format of build files (JSON? TOML? plain text?). How the build number is encoded.
   - Recommendation: Make the build number parser configurable or support common formats (JSON field, TOML field, regex-based extraction). Start with a simple approach and extend.

2. **Changelog fragment naming convention**
   - What we know: Config has `fragment_pattern: "worktree-{name}.md"` default and `directory: "docs/changelog"` default.
   - What's unclear: Exact rename logic for legacy numbered changelogs (FR-04.4).
   - Recommendation: Implement standard rename (worktree-{name}.md to {build}.md) first. Add legacy handling as a pattern match on existing files in the changelog directory.

3. **Watcher lifecycle management**
   - What we know: Watcher needs to run for the app's lifetime, watching all registered project paths.
   - What's unclear: How to add/remove watched paths when projects are added/removed without restarting the watcher.
   - Recommendation: Store the debouncer handle in Tauri managed state. Provide add_watch/remove_watch methods. Or restart the watcher when project list changes (simpler, acceptable given low frequency of project registration).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | Compilation | Yes | 1.94.1 (2026-03-25) | -- |
| Cargo | Dependency management | Yes | 1.94.1 | -- |
| git2 crate | Git operations | Yes (in Cargo.toml) | 0.20.4 | -- |
| notify crate | File watching | Not yet added | 8.2.0 target | -- |
| glob crate | Build file patterns | Not yet added | 0.3.3 target | -- |

**Missing dependencies with no fallback:** None -- all dependencies are crate-level, added via Cargo.toml.

**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

- **Tauri 2 + React 19 + TypeScript** architecture -- backend in Rust, frontend in React
- **Commands pattern:** Use `#[tauri::command]` with `State<Mutex<()>>` for write operations (read-only git ops don't need the lock)
- **Error handling:** Serialize errors as strings via Display (matching ConfigError pattern)
- **serde naming:** snake_case TypeScript types to match Rust serde (Phase 02 decision)
- **Config is source of truth:** Disk file is single source of truth, Mutex for write safety
- **Windows-first:** Path normalization with backslash handling required
- **NAS awareness:** Project lives on Z: drive (NAS) -- file watcher must handle this gracefully
- **Dev commands:** `cargo tauri dev` for full app, `cargo check` / `cargo clippy` for Rust checking
- **GSD workflow:** Start work through GSD commands, not ad-hoc edits

## Sources

### Primary (HIGH confidence)
- [git2 Repository docs](https://docs.rs/git2/latest/git2/struct.Repository.html) - merge, branch, status, worktree APIs
- [git2 Worktree docs](https://docs.rs/git2/latest/git2/struct.Worktree.html) - worktree struct methods
- [Tauri 2 Calling Frontend](https://v2.tauri.app/develop/calling-frontend/) - event emission API
- [notify crate docs](https://docs.rs/notify/latest/notify/) - filesystem watcher API
- [notify-debouncer-mini docs](https://docs.rs/notify-debouncer-mini/latest/notify_debouncer_mini/) - debouncing

### Secondary (MEDIUM confidence)
- [notify-rs GitHub](https://github.com/notify-rs/notify) - version info, feature comparison
- [glob crate](https://crates.io/crates/glob) - version 0.3.3 confirmed
- [git2-rs source](https://github.com/rust-lang/git2-rs/blob/master/src/repo.rs) - merge implementation details

### Tertiary (LOW confidence)
- Merge transaction pattern (rollback approach) -- assembled from git2 API docs, not from a verified example. The general approach is sound but exact API call sequence needs validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - git2 already in project, notify is de facto standard, all verified on docs.rs
- Architecture: HIGH - follows established patterns from Phase 02, module structure mirrors existing code
- Pitfalls: HIGH - Windows path issues and NAS watcher limitations are well-documented; git2 Send/Sync issues are fundamental to the library
- Merge workflow: MEDIUM - the multi-step transaction pattern is assembled from API docs but the exact conflict resolution flow needs implementation-time validation

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable libraries, unlikely to change)
