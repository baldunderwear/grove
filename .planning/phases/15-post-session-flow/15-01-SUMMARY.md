---
phase: 15-post-session-flow
plan: 01
subsystem: terminal, git
tags: [git2, pty, exit-code, zustand, sonner, toast, diff]

requires:
  - phase: 09-terminal-embedding
    provides: PTY spawn/reader thread, TerminalSession, TerminalEvent
  - phase: 14-session-alerts
    provides: Toast notification system (alerts.ts)
provides:
  - get_branch_diff_summary Tauri command (files changed, insertions, deletions, commits)
  - PTY exit code capture via Arc<Mutex<>> child sharing
  - Exited/disconnected session states in terminal store
  - Exit toast notifications (clean vs crash)
  - DiffSummaryData TypeScript types
affects: [15-02-post-session-ui, 18-wizard]

tech-stack:
  added: [sonner (toast library, was in main but missing from worktree)]
  patterns: [Arc<Mutex<>> child sharing for PTY exit code, exited tab lifecycle]

key-files:
  created:
    - src-tauri/src/git/diff.rs
    - src-ui/src/types/diff.ts
  modified:
    - src-tauri/src/git/mod.rs
    - src-tauri/src/commands/git_commands.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/terminal/mod.rs
    - src-tauri/src/terminal/pty.rs
    - src-ui/src/stores/terminal-store.ts
    - src-ui/src/lib/alerts.ts
    - src-ui/src/App.tsx
    - src-ui/src/components/session/SessionManager.tsx
    - src-ui/package.json

key-decisions:
  - "Used portable_pty success() boolean mapping (0 vs 1) since raw exit codes not exposed"
  - "Added sonner to worktree package.json (was in main repo, missing from this worktree)"
  - "Mounted Toaster in App.tsx to enable toast system"
  - "Updated alerts.ts to full version from main repo (was stale in worktree) plus new fireExitToast"

patterns-established:
  - "Arc<Mutex<>> pattern for sharing PTY child between session owner and reader thread"
  - "setTabExited/setTabDisconnected separation for exit vs network blip distinction"
  - "Exit toast pattern: clean=5s auto-dismiss, crash=persistent until dismissed"

requirements-completed: [POST-01, POST-05, POST-06]

duration: 23min
completed: 2026-04-02
---

# Phase 15 Plan 01: Post-Session Data Layer Summary

**Rust diff summary command via git2, PTY exit code capture via Arc<Mutex<>> child sharing, expanded terminal store with exited/disconnected states, exit toasts via sonner**

## Performance

- **Duration:** 23 min
- **Started:** 2026-04-02T00:27:35Z
- **Completed:** 2026-04-02T00:50:52Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- New `get_branch_diff_summary` Tauri command returning file-level diff stats and commit list between branches
- PTY reader thread now captures real exit code by sharing child process via Arc<Mutex<>>
- Terminal store supports exited/disconnected session states with exitCode and exitedAt fields
- Exit toasts distinguish clean exit (info, 5s) from crash (persistent error toast)
- DiffSummaryData TypeScript types mirror Rust structs for frontend consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Rust diff summary command** - `e4ef71b` (feat)
2. **Task 2: Exit code capture + store expansion + exit toasts** - `350e006` (feat)

## Files Created/Modified
- `src-tauri/src/git/diff.rs` - New module: DiffSummaryData, DiffFileEntry structs, get_branch_diff_summary function
- `src-tauri/src/git/mod.rs` - Added pub mod diff
- `src-tauri/src/commands/git_commands.rs` - New get_branch_diff_summary Tauri command
- `src-tauri/src/lib.rs` - Registered new command in invoke_handler
- `src-tauri/src/terminal/mod.rs` - Changed child to Arc<Mutex<>>, updated kill() to lock mutex
- `src-tauri/src/terminal/pty.rs` - Wrap child in Arc<Mutex<>>, reader thread calls child.wait() on EOF
- `src-ui/src/types/diff.ts` - DiffSummaryData, DiffFileEntry, CommitInfo TypeScript interfaces
- `src-ui/src/stores/terminal-store.ts` - Added exited/disconnected states, exitCode/exitedAt, setTabExited/setTabDisconnected
- `src-ui/src/lib/alerts.ts` - Full toast system with fireExitToast, fireSessionToast, fireSessionAlert
- `src-ui/src/App.tsx` - Mounted Toaster from sonner
- `src-ui/src/components/session/SessionManager.tsx` - Exit handler uses setTabExited, Error uses setTabDisconnected
- `src-ui/package.json` - Added sonner dependency

## Decisions Made
- Used `portable_pty::ExitStatus::success()` boolean mapping (0 vs 1) since the crate does not expose raw Windows exit codes
- Brought alerts.ts up to parity with main repo (was stale in worktree, missing toast infrastructure)
- Added sonner to package.json as it was present in main repo but missing from this worktree

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sonner not in worktree package.json**
- **Found during:** Task 2 (exit toast implementation)
- **Issue:** sonner ^2.0.7 was in main repo's package.json but missing from this worktree
- **Fix:** Added sonner to dependencies in package.json, mounted Toaster in App.tsx
- **Files modified:** src-ui/package.json, src-ui/src/App.tsx
- **Verification:** TypeScript check passes, toast imports resolve
- **Committed in:** 350e006 (Task 2 commit)

**2. [Rule 3 - Blocking] alerts.ts was stale, missing toast infrastructure**
- **Found during:** Task 2 (exit toast implementation)
- **Issue:** Worktree alerts.ts only had chime+attention functions, missing entire toast system from main repo
- **Fix:** Rewrote alerts.ts with full toast system (trackToast, dismissOldestIfAtCapacity, toastConfig, fireSessionToast, fireSessionAlert, fireErrorToast) plus new fireExitToast
- **Files modified:** src-ui/src/lib/alerts.ts
- **Verification:** TypeScript check passes, all exports available
- **Committed in:** 350e006 (Task 2 commit)

**3. [Rule 1 - Bug] git2 diff.foreach callback signatures**
- **Found during:** Task 1 (diff summary compilation)
- **Issue:** git2's foreach method requires Option-wrapped hunk and line callbacks, not bare closures
- **Fix:** Wrapped hunk and line callbacks in Some(...), let Rust infer types
- **Files modified:** src-tauri/src/git/diff.rs
- **Verification:** cargo check passes
- **Committed in:** e4ef71b (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for compilation and functionality. No scope creep.

## Issues Encountered
- git2 `Diff::foreach` API signature required Some-wrapped optional callbacks -- resolved by checking compiler suggestions
- portable_pty child type mismatch (`Send + Sync` vs `Send`) when wrapping in Arc<Mutex<>> -- resolved with explicit type annotation

## Known Stubs
None - all data layer functions are fully wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can consume: DiffSummaryData types, get_branch_diff_summary command, exited/disconnected store states
- ExitBanner, DiffSummary, PostSessionActions components (Plan 02) can use setTabExited and exitCode/exitedAt fields
- Toast system fully operational for session lifecycle notifications

---
*Phase: 15-post-session-flow*
*Completed: 2026-04-02*
