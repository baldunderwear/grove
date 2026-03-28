---
phase: "03"
plan: "01"
subsystem: git-operations-backend
tags: [git2, branches, status, tauri-commands, rust]
dependency_graph:
  requires: []
  provides: [git-module, branch-listing, status-check, git-tauri-commands]
  affects: [dashboard-frontend, merge-workflow]
tech_stack:
  added: []
  patterns: [git2-worktree-enumeration, status-options-dirty-check, error-as-string-serialize]
key_files:
  created:
    - src-tauri/src/git/mod.rs
    - src-tauri/src/git/error.rs
    - src-tauri/src/git/branches.rs
    - src-tauri/src/git/status.rs
    - src-tauri/src/commands/git_commands.rs
  modified:
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/lib.rs
decisions:
  - "Open Repository fresh per-command from path string (git2 objects are not Send/Sync)"
  - "Branch OIDs resolved from main repo; dirty status checked by opening worktree path as separate repo"
  - "Windows path normalization with backslash-to-forward-slash before git2 operations"
  - "No Mutex needed for read-only git operations"
metrics:
  duration: "~13 minutes"
  completed: "2026-03-27"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 2
---

# Phase 03 Plan 01: Git Module Foundation Summary

Git module with branch listing (ahead/behind, last commit, dirty state) and status commands, registered as Tauri commands callable from the frontend.

## What Was Built

### Git Error Types (error.rs)
- `GitError` enum with 6 variants: Git, Io, RepoNotFound, BranchNotFound, UnexpectedConflict, MergeAborted
- Follows the ConfigError pattern: `thiserror` derive + `serde::Serialize` as Display string
- Future merge operations (Plan 03-02) will use the UnexpectedConflict and MergeAborted variants

### Branch Listing (branches.rs)
- `BranchInfo` struct with all dashboard fields: name, ahead, behind, last_commit_message, last_commit_timestamp, is_dirty, worktree_path
- `list_worktree_branches(project_path, branch_prefix, merge_target)`:
  - Enumerates worktrees via `repo.worktrees()` + opens each worktree path as separate Repository
  - Also checks main repo's HEAD branch (worktrees() doesn't include it)
  - Filters by branch_prefix
  - Resolves ahead/behind from main repo via `graph_ahead_behind`
  - Gets last commit message (first line) and timestamp
  - Checks dirty status per worktree

### Status Check (status.rs)
- `is_worktree_dirty(worktree_path)`: Boolean dirty check via StatusOptions with include_untracked
- `git_status_summary(project_path)`: Returns `StatusSummary` with modified, added, deleted, untracked counts and is_clean flag
- Categorizes git2 status flags into meaningful buckets (WT_NEW without INDEX_NEW = untracked)

### Tauri Commands (git_commands.rs)
- `list_branches`: Wraps list_worktree_branches
- `branch_status`: Wraps git_status_summary
- `is_worktree_dirty`: Wraps is_worktree_dirty
- All three registered in `generate_handler![]` in lib.rs
- No Mutex needed -- all operations are read-only

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Open repo fresh per command | git2 Repository is not Send/Sync; path string is the shared state |
| Branch OIDs from main repo | Worktree branches share the main repo's refs namespace |
| Dirty check opens worktree as separate repo | Working directory state is per-worktree, not per-branch in main repo |
| Windows path normalization | git2 uses forward slashes internally; backslashes cause lookup failures |
| No Mutex for read-only ops | Following Phase 02 decision: Mutex only for write operations |

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functions are fully implemented with real git2 operations.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5bd9daf | Git module with error types, branch listing, and status |
| 2 | 62482c7 | Tauri command wrappers and registration |

## Verification

- `cargo check` passes (zero errors in git module)
- `cargo clippy` passes (no warnings from git module; only pre-existing suggestions in config_commands.rs)
- All acceptance criteria grep checks pass
- All three Tauri commands registered in generate_handler
