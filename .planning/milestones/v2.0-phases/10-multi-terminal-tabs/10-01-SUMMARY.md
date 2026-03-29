---
phase: 10-multi-terminal-tabs
plan: 01
subsystem: terminal
tags: [windows-sys, job-objects, process-tree, pty, cleanup]

requires:
  - phase: 09-terminal-foundation-conpty-spike
    provides: TerminalSession/TerminalManager with PTY spawn and kill
provides:
  - Windows Job Object module for process tree cleanup
  - TerminalSession with job_handle field and Drop safety net
  - Kill flow that terminates entire process tree (not just immediate child)
affects: [10-02, terminal, process-management]

tech-stack:
  added: [windows-sys 0.59]
  patterns: [Job Object process tree cleanup, graceful degradation on Win32 API failure, isize handle storage for Send safety]

key-files:
  created: [src-tauri/src/terminal/job_object.rs]
  modified: [src-tauri/Cargo.toml, src-tauri/src/terminal/mod.rs, src-tauri/src/terminal/pty.rs]

key-decisions:
  - "HANDLE stored as isize for Send-safe struct storage, cast back to *mut c_void when calling Win32 APIs"
  - "Graceful degradation: Job Object failure logs error but does not prevent terminal spawn"
  - "Belt-and-suspenders kill: close Job Object first, then child.kill() as fallback"

patterns-established:
  - "Win32 handle pattern: store as isize in Rust structs, convert via to_handle/from_handle helpers"
  - "Graceful degradation: Win32 API failures log and continue rather than propagating errors"

requirements-completed: [TERM-06]

duration: 28min
completed: 2026-03-29
---

# Phase 10 Plan 01: Job Object Process Tree Cleanup Summary

**Windows Job Object integration for terminal process tree cleanup -- closing a tab kills cmd.exe AND all child processes (claude, node, git) via KILL_ON_JOB_CLOSE**

## Performance

- **Duration:** 28 min
- **Started:** 2026-03-29T17:21:54Z
- **Completed:** 2026-03-29T17:50:15Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created job_object.rs module with create/assign/close Win32 API wrappers
- Integrated Job Object into PTY spawn flow (assigned before reader thread starts)
- Updated kill() to close Job Object first (tree kill), then child.kill() as fallback
- Added Drop impl on TerminalSession as safety net for crash recovery

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Job Object module and add windows-sys dependency** - `1ebbb24` (feat)
2. **Task 2: Integrate Job Object into PTY spawn and kill flow** - `ea5e09c` (feat)

## Files Created/Modified
- `src-tauri/src/terminal/job_object.rs` - Win32 Job Object wrapper (create, assign, close)
- `src-tauri/Cargo.toml` - Added windows-sys 0.59 with JobObjects/Foundation/Security/Threading features
- `src-tauri/src/terminal/mod.rs` - Added job_handle field, Drop impl, Job Object close in kill()
- `src-tauri/src/terminal/pty.rs` - Job Object creation and assignment after child spawn

## Decisions Made
- Used `isize` for handle storage instead of raw `*mut c_void` to satisfy Send requirements on TerminalSession struct. Helper functions `to_handle`/`from_handle` convert at API boundaries.
- Belt-and-suspenders kill: close Job Object first (which terminates all processes in the tree), then still call `child.kill()` and `child.wait()` as fallback cleanup.
- Graceful degradation: if Job Object creation or process assignment fails, terminal still spawns normally -- just without tree cleanup on kill.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed HANDLE type mismatch with windows-sys 0.59**
- **Found during:** Task 1 (Job Object module creation)
- **Issue:** Plan specified `isize` as the return type matching older windows-sys conventions, but windows-sys 0.59 uses `*mut c_void` (HANDLE type alias) for all Win32 handle parameters
- **Fix:** Added `to_handle(isize -> HANDLE)` and `from_handle(HANDLE -> isize)` conversion helpers. Public API still uses isize (Send-safe), internal calls convert to HANDLE
- **Files modified:** src-tauri/src/terminal/job_object.rs
- **Verification:** cargo check passes clean
- **Committed in:** 1ebbb24 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary adaptation to actual windows-sys 0.59 API. No scope creep.

## Issues Encountered
- cargo not on PATH in the bash environment -- resolved by adding `~/.cargo/bin` to PATH
- First cargo check took ~3 minutes due to windows-sys crate compilation (one-time cost)

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functions are fully implemented.

## Next Phase Readiness
- Job Object process tree cleanup ready for use in multi-terminal tab management
- Plan 10-02 can build on TerminalSession's job_handle field for tab lifecycle management
- No blockers

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 10-multi-terminal-tabs*
*Completed: 2026-03-29*
