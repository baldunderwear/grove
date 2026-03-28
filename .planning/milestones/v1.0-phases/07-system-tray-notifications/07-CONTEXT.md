# Phase 07: System Tray & Notifications - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — defaults accepted)

<domain>
## Phase Boundary

Enhance existing tray with quick actions (recent worktrees, dashboard, settings, quit). Add Windows notifications for merge-ready/stale branches and merge completion. Start with Windows via registry. Auto-fetch from remote on configurable interval.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase with established patterns. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/lib.rs` — Existing tray icon with basic Open/Quit menu (Phase 01)
- `src-tauri/src/watcher/mod.rs` — File watcher with event emission (Phase 03)
- `src-tauri/src/config/models.rs` — Settings with start_on_login, start_minimized fields
- `src-tauri/src/git/branches.rs` — Branch listing with ahead/behind counts
- `src-tauri/src/process/detect.rs` — Session detection for recent worktrees

### Established Patterns
- TrayIconBuilder with menu items and event handlers
- Tauri event emission for frontend communication
- Mutex<AppConfig> for shared state

### Integration Points
- Tray menu items trigger Tauri commands or emit events
- Notifications use Tauri notification plugin
- Start-on-login writes to Windows registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
- Auto-fetch from remote via scheduled git fetch on registered projects

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: app starts with Windows, lives in tray, notifies when a branch is merge-ready
- Extend existing tray from Phase 01 (don't rebuild)

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
