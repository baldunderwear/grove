---
phase: 10-multi-terminal-tabs
plan: 02
subsystem: ui
tags: [xterm.js, zustand, react, tabs, terminal, css-show-hide]

requires:
  - phase: 09-terminal-foundation-conpty-spike
    provides: "Single-terminal TerminalPanel, useTerminal hook, PTY spawn/kill commands"
provides:
  - "Map-based multi-terminal store with tab lifecycle (add/activate/switch/close)"
  - "TerminalTabBar component with branch name, session duration, close button"
  - "Multi-instance TerminalPanel with CSS show/hide for scrollback preservation"
  - "Dashboard wiring: addTab on launch, getTabForWorktree dedup, hasAnyTabs split-pane"
affects: [11-session-state-detection, 12-claude-config-editors]

tech-stack:
  added: []
  patterns: [Map-based Zustand store with manual cloning for reactivity, CSS display toggle for xterm.js instance preservation, refit callback pattern for hidden terminal dimension recovery]

key-files:
  created:
    - src-ui/src/components/terminal/TerminalTabBar.tsx
  modified:
    - src-ui/src/stores/terminal-store.ts
    - src-ui/src/components/terminal/TerminalPanel.tsx
    - src-ui/src/hooks/useTerminal.ts
    - src-ui/src/pages/Dashboard.tsx

key-decisions:
  - "Map cloning pattern for Zustand reactivity with Map-based state (new Map(get().tabs) after mutations)"
  - "CSS display:none/block for tab switching to preserve xterm.js scrollback without unmount/remount"
  - "requestAnimationFrame refit on tab visibility change to handle stale dimensions (Pitfall 4)"
  - "Deleted TerminalToolbar -- tab bar subsumes its branch name and close button functionality"

patterns-established:
  - "Multi-instance pattern: absolute-positioned children with display toggle for show/hide without React unmount"
  - "Pending ID pattern: pending-{uuid} tab IDs promoted to real terminal IDs after PTY spawn completes"

requirements-completed: [TERM-02, TERM-03, TERM-07]

duration: 6min
completed: 2026-03-29
---

# Phase 10 Plan 02: Multi-Terminal Tabs Summary

**Map-based multi-tab terminal store with CSS show/hide instances, tab bar with branch names and session duration, and Dashboard dedup wiring**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-29T17:21:59Z
- **Completed:** 2026-03-29T17:28:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Rewrote terminal store from single-session to Map-based multi-tab with full lifecycle actions
- Created TerminalTabBar with per-tab branch name, auto-updating session duration, and close button
- Multi-instance TerminalPanel preserves xterm.js scrollback via CSS display toggle (no unmount)
- Dashboard prevents duplicate tabs per worktree -- launching same worktree switches to existing tab
- Added refit() to useTerminal hook for dimension recovery when hidden tabs become visible

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite terminal store and create TerminalTabBar** - `020ca45` (feat)
2. **Task 2: Multi-instance TerminalPanel, Dashboard wiring, delete TerminalToolbar** - `67f5bee` (feat)

## Files Created/Modified
- `src-ui/src/stores/terminal-store.ts` - Map-based multi-tab state with TerminalTab interface and full lifecycle actions
- `src-ui/src/components/terminal/TerminalTabBar.tsx` - Horizontal tab bar with branch name, duration timer, close button
- `src-ui/src/components/terminal/TerminalPanel.tsx` - Multi-instance container with TerminalInstance (CSS show/hide) and TerminalTabBar
- `src-ui/src/hooks/useTerminal.ts` - Added refit() callback for dimension recovery on tab switch
- `src-ui/src/pages/Dashboard.tsx` - Multi-tab wiring: addTab, getTabForWorktree dedup, hasAnyTabs split-pane

## Decisions Made
- Used Map cloning pattern (`new Map(get().tabs)`) for Zustand reactivity since Zustand doesn't detect Map mutations
- CSS `display: none/block` for tab switching preserves xterm.js instances and scrollback (vs unmount which destroys them)
- `requestAnimationFrame` refit on visibility change handles stale dimensions from hidden containers (Pitfall 4)
- Deleted TerminalToolbar entirely -- TerminalTabBar provides branch name and close button per tab, making it redundant

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources are wired (tabs Map from store, PTY spawn from Tauri commands).

## Next Phase Readiness
- Multi-tab terminal UI complete, ready for session state detection (phase 11)
- Tab bar provides mounting point for future status indicators per session
- Store provides the data model for tracking session metadata

---
*Phase: 10-multi-terminal-tabs*
*Completed: 2026-03-29*
