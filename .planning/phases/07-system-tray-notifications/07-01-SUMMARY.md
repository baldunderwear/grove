---
phase: 07-system-tray-notifications
plan: 01
subsystem: tray
tags: [tauri-plugin-notification, tauri-plugin-autostart, system-tray, dynamic-menu]

requires:
  - phase: 01-scaffold
    provides: Tauri app scaffold with basic tray icon
  - phase: 02-config
    provides: Config persistence model, Settings struct
provides:
  - Dynamic tray menu with Recent Worktrees submenu
  - Notification and autostart plugin registration
  - Extended Settings model with notification prefs and auto_fetch_interval
  - refresh_tray Tauri command for frontend-triggered rebuilds
affects: [07-02, 07-03, settings-ui]

tech-stack:
  added: [tauri-plugin-notification, tauri-plugin-autostart, "@tauri-apps/plugin-notification", "@tauri-apps/plugin-autostart"]
  patterns: [tray-module-extraction, dynamic-menu-rebuild, menu-id-prefix-matching]

key-files:
  created: [src-tauri/src/tray.rs]
  modified: [src-tauri/src/lib.rs, src-tauri/Cargo.toml, src-tauri/src/config/models.rs, src-tauri/capabilities/default.json, src-ui/src/types/config.ts, src-ui/package.json]

key-decisions:
  - "Menu event handler uses ID prefix matching (wt-*) for dynamic worktree items"
  - "Tray module owns both tray build and window close-intercept logic"
  - "rebuild_tray_menu loads config and branches fresh each call for accuracy"

patterns-established:
  - "Tray module pattern: build_tray() for one-time setup, rebuild_tray_menu() for dynamic updates"
  - "Menu ID prefix convention: wt-{index} for worktree items, plain strings for static items"

requirements-completed: [FR-05.1, FR-05.2, FR-05.4, FR-05.5, FR-05.6]

duration: 21min
completed: 2026-03-28
---

# Phase 07 Plan 01: Tray Plugins and Dynamic Menu Summary

**Notification/autostart Tauri plugins registered, Settings model extended with notification prefs and auto-fetch interval, tray logic extracted to dedicated module with dynamic Recent Worktrees submenu**

## Performance

- **Duration:** 21 min
- **Started:** 2026-03-28T03:24:53Z
- **Completed:** 2026-03-28T03:46:08Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Installed tauri-plugin-notification and tauri-plugin-autostart (Rust + JS)
- Extended Settings model with auto_fetch_interval, notify_merge_ready, notify_stale_branch, notify_merge_complete
- Extracted all tray logic from lib.rs into dedicated tray.rs module
- Dynamic tray menu rebuilds with Recent Worktrees submenu (up to 10, sorted by recency)
- Added refresh_tray Tauri command for frontend-triggered menu updates
- Capabilities updated with notification and autostart permissions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install plugins, extend Settings model, update capabilities** - `e260eeb` (feat)
2. **Task 2: Extract tray into dedicated module with dynamic menu rebuild** - `e551734` (feat)

## Files Created/Modified
- `src-tauri/src/tray.rs` - New module: build_tray(), rebuild_tray_menu(), refresh_tray command
- `src-tauri/src/lib.rs` - Simplified: mod tray, plugin registration, delegated tray build
- `src-tauri/Cargo.toml` - Added tauri-plugin-notification and tauri-plugin-autostart deps
- `src-tauri/src/config/models.rs` - Extended Settings with 4 new fields + default functions
- `src-tauri/capabilities/default.json` - Added notification and autostart permissions
- `src-ui/src/types/config.ts` - TypeScript Settings interface matches Rust model
- `src-ui/package.json` - Added @tauri-apps/plugin-notification and plugin-autostart

## Decisions Made
- Menu event handler uses ID prefix matching (`wt-*`) for dynamic worktree items rather than storing worktree paths in a side map. This keeps the handler stateless and works because menu items are rebuilt with consistent indices.
- Tray module owns both the tray icon build and the window close-intercept logic, since they are conceptually part of the "tray-resident" behavior.
- rebuild_tray_menu loads config and branches fresh each call rather than caching, ensuring accuracy after any config change.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- NAS environment prevents npm install in src-ui directory directly; used local mirror at `%USERPROFILE%/grove-src-ui/` per established Phase 01 pattern
- Background cargo check caused file lock contention; resolved by waiting for background process to complete

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Notification and autostart plugins are registered and ready for use in 07-02 (notification triggers)
- Settings model has all fields needed for 07-02 and 07-03 (auto-fetch, notification preferences)
- Dynamic tray menu can be rebuilt from anywhere via refresh_tray command
- TypeScript types are in sync for frontend settings UI updates

## Self-Check: PASSED

All 7 files verified present. Both task commits (e260eeb, e551734) verified in git log.

---
*Phase: 07-system-tray-notifications*
*Completed: 2026-03-28*
