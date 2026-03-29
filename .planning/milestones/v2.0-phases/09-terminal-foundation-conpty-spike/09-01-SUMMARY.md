---
phase: 09-terminal-foundation-conpty-spike
plan: 01
subsystem: terminal
tags: [portable-pty, conpty, tauri-channel, pty, terminal-manager, unc-path]

requires:
  - phase: v1.1-patches
    provides: "UNC path resolution utilities (get_drive_mappings, resolve_unc_path)"
provides:
  - "TerminalManager struct managing terminal lifecycle by ID"
  - "PTY spawn with dedicated OS reader thread and Channel streaming"
  - "4 Tauri commands: terminal_spawn, terminal_write, terminal_resize, terminal_kill"
  - "Shared UNC path utilities in utils/paths.rs"
affects: [09-02-conpty-spike-xterm, 09-03-conpty-spike-integration, 10-multi-terminal]

tech-stack:
  added: [portable-pty 0.9]
  patterns: [tauri-channel-streaming, dedicated-os-thread-per-pty, shared-utils-module]

key-files:
  created:
    - src-tauri/src/utils/mod.rs
    - src-tauri/src/utils/paths.rs
    - src-tauri/src/terminal/mod.rs
    - src-tauri/src/terminal/pty.rs
    - src-tauri/src/terminal/commands.rs
  modified:
    - src-tauri/src/git/branches.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml

key-decisions:
  - "Extracted UNC utils to shared utils/paths.rs module for reuse across git and terminal"
  - "TerminalSession fields are pub(crate) for cross-submodule construction"
  - "PTY spawn uses cmd.exe /c claude as command builder"
  - "Manager lock NOT held during PTY I/O -- only brief lock for insert/remove/lookup"

patterns-established:
  - "Shared utils module: crate::utils::paths for cross-module utilities"
  - "Channel streaming: dedicated std::thread per terminal, 4KB buffer, from_utf8_lossy"
  - "Tauri managed state: Mutex<TerminalManager> for terminal lifecycle"

requirements-completed: [TERM-01, NFR-05, NFR-06, NFR-07]

duration: 33min
completed: 2026-03-29
---

# Phase 09 Plan 01: Terminal Rust Backend Summary

**portable-pty 0.9 ConPTY integration with TerminalManager, Channel-based PTY streaming, and shared UNC path utilities**

## Performance

- **Duration:** 33 min
- **Started:** 2026-03-29T16:21:46Z
- **Completed:** 2026-03-29T16:54:21Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extracted UNC path resolution to shared utils module, eliminating duplication between git and terminal modules
- Built TerminalManager with full lifecycle management (spawn, write, resize, kill)
- Implemented PTY spawn with dedicated OS thread per terminal for blocking reads, streaming via Tauri Channel
- Registered all 4 terminal Tauri commands with UNC path resolution before PTY operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract UNC utilities and add portable-pty dependency** - `fdcd7c5` (feat)
2. **Task 2: Create terminal module with TerminalManager, PTY spawn, Channel streaming, and Tauri commands** - `e496a26` (feat)

## Files Created/Modified
- `src-tauri/src/utils/mod.rs` - Shared utilities module declaration
- `src-tauri/src/utils/paths.rs` - UNC path resolution (DriveMapping, get_drive_mappings, resolve_unc_path)
- `src-tauri/src/terminal/mod.rs` - TerminalManager, TerminalSession, TerminalEvent enum
- `src-tauri/src/terminal/pty.rs` - PTY spawn with dedicated reader thread and Channel streaming
- `src-tauri/src/terminal/commands.rs` - Tauri command handlers (spawn, write, resize, kill)
- `src-tauri/src/git/branches.rs` - Updated to use shared utils instead of local UNC functions
- `src-tauri/src/lib.rs` - Registered terminal module, managed state, and 4 commands
- `src-tauri/Cargo.toml` - Added portable-pty 0.9 dependency

## Decisions Made
- Extracted UNC utilities to `utils/paths.rs` rather than keeping copies in both git and terminal modules (DRY, matches NFR-06)
- Made TerminalSession fields `pub(crate)` to allow pty.rs submodule to construct sessions
- Used `cmd.exe /c claude` as the PTY command (matches existing session launch pattern)
- Manager mutex is NOT held during PTY I/O -- reader thread operates independently, lock only for insert/remove/lookup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made TerminalSession fields pub(crate)**
- **Found during:** Task 2 (terminal module creation)
- **Issue:** pty.rs submodule could not construct TerminalSession because fields were private
- **Fix:** Changed struct fields to `pub(crate)` visibility
- **Files modified:** src-tauri/src/terminal/mod.rs
- **Verification:** cargo check passes
- **Committed in:** e496a26 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor visibility fix necessary for cross-submodule construction. No scope creep.

## Issues Encountered
- NAS file lock conflict on target directory from background cargo process -- resolved by killing stale process and deleting locked .rmeta file
- cargo not in PATH for bash shell -- resolved by explicitly adding ~/.cargo/bin to PATH

## Known Stubs
None - all functions are fully implemented with real logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal Rust backend compiles and is registered in Tauri
- Ready for Plan 02 (xterm.js frontend) and Plan 03 (integration wiring)
- ConPTY spike validation (no visible window flash) will occur when Plan 03 runs the full pipeline in a release build

## Self-Check: PASSED

- All 5 created files verified present on disk
- Both task commits (fdcd7c5, e496a26) verified in git log

---
*Phase: 09-terminal-foundation-conpty-spike*
*Completed: 2026-03-29*
