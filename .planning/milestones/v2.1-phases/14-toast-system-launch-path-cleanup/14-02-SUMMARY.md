---
phase: 14-toast-system-launch-path-cleanup
plan: 02
subsystem: frontend, backend
tags: [launch-path, session-store, terminal-store, cleanup, dead-code-removal]

# Dependency graph
requires: [14-01]
provides:
  - Single launch path via terminal-store addTab
  - shell.ts utility with openInVscode and openInExplorer
  - Removal of external launch infrastructure (wt.exe/cmd.exe, PID-based detection)
affects: [session-manager, dashboard, all-projects, app]

# Tech tracking
tech-stack:
  added: []
  removed: [sysinfo ^0.38]
  patterns: [terminal-store as sole launch path, shell utility for non-session actions]

key-files:
  created:
    - src-ui/src/lib/shell.ts
  modified:
    - src-ui/src/pages/Dashboard.tsx
    - src-ui/src/pages/AllProjects.tsx
    - src-ui/src/components/session/SessionManager.tsx
    - src-ui/src/components/NewWorktreeDialog.tsx
    - src-ui/src/App.tsx
    - src-tauri/src/commands/session_commands.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
  deleted:
    - src-ui/src/stores/session-store.ts
    - src-tauri/src/process/detect.rs
    - src-tauri/src/process/launch.rs
    - src-tauri/src/process/mod.rs

key-decisions:
  - "Derive activeSessions from terminal-store tabs for BranchTable prop compatibility instead of modifying BranchTable interface"
  - "AllProjects launch navigates to project dashboard via selectProject after addTab"

patterns-established:
  - "terminal-store addTab is the sole code path for launching Claude Code sessions"
  - "shell.ts provides standalone openInVscode and openInExplorer without store coupling"

requirements-completed: [LPATH-01, LPATH-02, LPATH-03]

# Metrics
duration: 33min
completed: 2026-04-01
---

# Phase 14 Plan 02: Launch Path Cleanup Summary

**Removed entire external launch path (wt.exe/cmd.exe, PID-based session detection, session-store) and rewired all consumers to embedded terminal via terminal-store**

## Performance

- **Duration:** 33 min
- **Started:** 2026-04-01T19:42:25Z
- **Completed:** 2026-04-01T20:15:48Z
- **Tasks:** 2/2
- **Files created:** 1
- **Files modified:** 8
- **Files deleted:** 4

## Accomplishments

- Created `src-ui/src/lib/shell.ts` with standalone `openInVscode` and `openInExplorer` utility functions
- Rewired Dashboard.tsx to derive active session indicators from terminal-store tabs instead of PID-based polling
- Rewired AllProjects.tsx launch button to use `terminal-store.addTab` + navigate to project dashboard
- Rewired SessionManager.tsx FocusTopBar to use shell.ts imports instead of session-store hooks
- Rewired NewWorktreeDialog.tsx "launch after create" to use `terminal-store.addTab`
- Rewired App.tsx tray `launch-worktree` handler to use `terminal-store.addTab` + project navigation
- Deleted `session-store.ts` entirely (zero remaining imports)
- Deleted entire `src-tauri/src/process/` directory (detect.rs, launch.rs, mod.rs)
- Inlined VS Code launch logic directly into `open_in_vscode` Tauri command
- Removed `launch_session` and `get_active_sessions` commands from invoke handler
- Removed `SessionDetector` managed state from Tauri builder
- Removed `sysinfo` crate dependency from Cargo.toml

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shell.ts utility + rewire all frontend consumers off session-store** - `1a0705a` (feat)
2. **Task 2: Delete session-store + Rust process module + sysinfo crate** - `865692f` (feat)

## Decisions Made

- Derived `activeSessions` record from terminal-store tabs for BranchTable prop compatibility rather than modifying BranchTable's interface (out of scope for this plan)
- AllProjects launch action calls `selectProject(projectId)` after `addTab` to navigate the user to the project dashboard where the embedded terminal is visible

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all code paths are fully wired.

## Verification Results

- `npm run typecheck` passes cleanly
- `cargo check` passes (2 pre-existing dead code warnings in unrelated files)
- Zero references to `session-store`, `launch_session`, `get_active_sessions`, `SessionDetector`, `process::detect`, `process::launch` remain in codebase

---
*Phase: 14-toast-system-launch-path-cleanup*
*Completed: 2026-04-01*

## Self-Check: PASSED
- shell.ts exists
- session-store.ts deleted
- process/ directory deleted
- Commit 1a0705a found
- Commit 865692f found
