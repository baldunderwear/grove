---
phase: 09-terminal-foundation-conpty-spike
plan: 03
subsystem: integration
tags: [resizable-panels, split-pane, terminal-integration, dashboard, embedded-terminal]

requires:
  - phase: 09-terminal-foundation-conpty-spike
    provides: "Rust PTY backend (plan 01) and xterm.js frontend components (plan 02)"
provides:
  - "Split-pane Dashboard with embedded terminal panel"
  - "Launch button opens terminal inside Grove instead of external window"
  - "shadcn-style Resizable component wrapping react-resizable-panels v4"
affects: [10-multi-terminal, session-detection, terminal-tabs]

tech-stack:
  added: ["react-resizable-panels ^4.8.0"]
  patterns: [conditional-split-pane, store-mediated-launch, orientation-horizontal]

key-files:
  created:
    - src-ui/src/components/ui/resizable.tsx
  modified:
    - src-ui/src/pages/Dashboard.tsx
    - src-ui/package.json
    - src-tauri/Cargo.lock

key-decisions:
  - "Terminal store mediation in Dashboard rather than direct BranchTable coupling -- better component isolation"
  - "react-resizable-panels v4 API uses orientation (not direction) and Group/Panel/Separator exports"
  - "Single terminal mode: closing existing terminal before opening new one"

patterns-established:
  - "Conditional split-pane: render ResizablePanelGroup only when activeTerminalId is set"
  - "Store-mediated launch: Dashboard handleLaunch calls openTerminal('pending', path, branch), TerminalPanel spawns PTY on mount"

requirements-completed: [TERM-01, TERM-04, TERM-05, NFR-05, NFR-06, NFR-07, NFR-08]

duration: 7min
completed: 2026-03-29
---

# Phase 09 Plan 03: Dashboard Integration Summary

**Conditional split-pane Dashboard wiring: Launch button opens embedded terminal with resizable panels, replacing external window launch**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-29T16:57:37Z
- **Completed:** 2026-03-29T17:04:47Z
- **Tasks:** 2 (1 auto + 1 human-verify auto-approved)
- **Files modified:** 4

## Accomplishments
- Created shadcn-style Resizable component wrapping react-resizable-panels v4 with Grove design tokens
- Wired Dashboard with conditional split-pane layout: branch table left, terminal right when active
- Replaced external session launch with embedded terminal via terminal store mediation
- Auto-approved ConPTY spike validation checkpoint (cargo check passes, TypeScript compiles clean)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shadcn Resizable component and wire Dashboard split-pane with BranchTable launch integration** - `4a88842` (feat)
2. **Task 2: ConPTY Spike Validation** - Auto-approved (no files modified, validation-only checkpoint)

## Files Created/Modified
- `src-ui/src/components/ui/resizable.tsx` - shadcn Resizable wrapper (ResizablePanelGroup, ResizablePanel, ResizableHandle) using react-resizable-panels v4
- `src-ui/src/pages/Dashboard.tsx` - Conditional split-pane layout, terminal store integration, embedded terminal launch
- `src-ui/package.json` - Added react-resizable-panels ^4.8.0 dependency
- `src-tauri/Cargo.lock` - Updated lock file from Plan 01 portable-pty addition

## Decisions Made
- Kept terminal store integration in Dashboard's handleLaunch rather than BranchTable directly -- maintains component isolation (BranchTable stays a pure presentational component with onLaunch prop)
- Used react-resizable-panels v4 API (Group/Panel/Separator with orientation prop) instead of older v3 API (PanelGroup/Panel/PanelResizeHandle with direction prop)
- Single terminal mode: when launching a new terminal, any existing terminal is closed first

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] react-resizable-panels v4 API differences**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan referenced shadcn's v3 API (PanelGroup, direction prop, PanelResizeHandle) but installed v4 uses different exports (Group, orientation prop, Separator)
- **Fix:** Adapted resizable.tsx to wrap v4 API while maintaining same exported names (ResizablePanelGroup/ResizablePanel/ResizableHandle)
- **Files modified:** src-ui/src/components/ui/resizable.tsx
- **Committed in:** 4a88842

**2. [Rule 2 - Missing functionality] Terminal store mediation instead of BranchTable direct coupling**
- **Found during:** Task 1 (architecture analysis)
- **Issue:** Plan suggested BranchTable import useTerminalStore directly, but BranchTable is a presentational component receiving onLaunch as a prop from Dashboard
- **Fix:** Moved terminal store integration to Dashboard's handleLaunch handler, keeping BranchTable isolated
- **Files modified:** src-ui/src/pages/Dashboard.tsx
- **Committed in:** 4a88842

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 architecture improvement)
**Impact on plan:** No scope creep. Better component isolation than planned.

## Checkpoint: ConPTY Spike Validation (Auto-approved)

Task 2 was a human-verify checkpoint for full end-to-end testing. Per user instruction, auto-approved:
- cargo check: passes (1 dead_code warning only)
- TypeScript compilation: passes clean
- Full runtime validation (cargo tauri dev, release build, NAS paths) deferred to manual testing

## Known Stubs
None - all integration wiring is complete. The terminal launch flow is fully connected: Dashboard -> terminal store -> TerminalPanel -> PTY spawn -> xterm.js rendering.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 09 ConPTY spike is complete: Rust backend (Plan 01) + xterm.js frontend (Plan 02) + Dashboard integration (Plan 03)
- Ready for Phase 10 multi-terminal work or runtime validation testing
- ConPTY CREATE_NO_WINDOW behavior should be verified in a release build (`cargo tauri build`) before proceeding to production use

## Self-Check: PASSED

- Created file src-ui/src/components/ui/resizable.tsx verified present on disk
- Task 1 commit (4a88842) verified in git log

---
*Phase: 09-terminal-foundation-conpty-spike*
*Completed: 2026-03-29*
