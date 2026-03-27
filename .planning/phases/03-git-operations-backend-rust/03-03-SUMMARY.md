---
phase: 03-git-operations-backend-rust
plan: 03
subsystem: infra
tags: [notify, file-watcher, tauri-events, poll-watcher, debouncer]

# Dependency graph
requires:
  - phase: 02-project-config-persistence
    provides: "ProjectConfig with path field, load_or_create_config"
provides:
  - "File system watcher module (watcher::start_watcher)"
  - "GitChangeEvent Tauri event on git-changed channel"
  - "NAS/network drive PollWatcher fallback"
affects: [04-merge-workflow, 05-frontend-dashboard]

# Tech tracking
tech-stack:
  added: [notify 8.2, notify-debouncer-mini 0.7]
  patterns: [tauri-event-bridge, poll-watcher-fallback, box-leak-lifetime]

key-files:
  created: [src-tauri/src/watcher/mod.rs]
  modified: [src-tauri/src/lib.rs, src-tauri/Cargo.toml]

key-decisions:
  - "notify-debouncer-mini 0.7 (not 0.4 per plan) for notify 8.x compatibility"
  - "Box::leak for watcher lifetime management (runs for entire app lifetime)"
  - "Per-batch dedup: at most one event per project per change_type per batch"

patterns-established:
  - "Tauri event bridge: Rust background thread emits events via app.emit() for frontend consumption"
  - "NAS fallback: try OS-native watcher first, fall back to PollWatcher on failure"
  - "Non-fatal setup: watcher failure logged but does not block app startup"

requirements-completed: [FR-06.1, FR-06.2, FR-06.3, FR-06.4]

# Metrics
duration: 10min
completed: 2026-03-27
---

# Phase 03 Plan 03: File Watcher Summary

**File system watcher using notify 8.x with NAS polling fallback, emitting git-changed Tauri events for dashboard refresh**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-27T23:41:43Z
- **Completed:** 2026-03-27T23:52:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Watcher module monitors .git/refs/, .git/worktrees/, .git/HEAD for all registered projects
- Emits typed GitChangeEvent via Tauri event system (branch_added, branch_removed, refs_changed, status_changed)
- Graceful PollWatcher fallback for NAS/network drives (5s interval)
- Worktree gitdir pointer resolution for nested worktree checkouts
- Non-fatal integration: watcher failure does not block app startup

## Task Commits

Each task was committed atomically:

1. **Task 1: File watcher module with NAS fallback** - `448251e` (feat)
2. **Task 2: Wire watcher into Tauri setup and register module** - `adba4e4` (feat)

## Files Created/Modified
- `src-tauri/src/watcher/mod.rs` - File system watcher with Tauri event bridge, NAS fallback, event classification
- `src-tauri/src/lib.rs` - Added mod watcher, watcher initialization in setup hook
- `src-tauri/Cargo.toml` - Added notify 8.2, notify-debouncer-mini 0.7

## Decisions Made
- Used notify-debouncer-mini 0.7 instead of 0.4 (plan spec) because 0.4 depends on notify 6.x which is incompatible with notify 8.x
- Box::leak for debouncer/watcher handles to prevent Drop from stopping them (watcher runs for app lifetime)
- Per-batch event deduplication to avoid flooding frontend with redundant refresh triggers
- Path matching uses case-insensitive comparison with backslash normalization for Windows compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] notify-debouncer-mini version bump from 0.4 to 0.7**
- **Found during:** Task 2 (cargo check)
- **Issue:** notify-debouncer-mini 0.4 depends on notify 6.x; our Cargo.toml specifies notify 8.2, causing type mismatch errors (notify::Error from two different major versions)
- **Fix:** Changed notify-debouncer-mini from "0.4" to "0.7" which is compatible with notify 8.x
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** cargo check passes, cargo clippy has no new warnings
- **Committed in:** adba4e4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Version bump necessary for compilation. No scope creep. API is compatible.

## Issues Encountered
None beyond the version incompatibility handled above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- File watcher complete, emitting events that frontend can listen to
- Frontend dashboard (Phase 05) can subscribe to "git-changed" events for real-time updates
- Watcher currently starts with config-time project paths; dynamic add/remove is a future extension (stop_watcher placeholder exists)

---
*Phase: 03-git-operations-backend-rust*
*Completed: 2026-03-27*
