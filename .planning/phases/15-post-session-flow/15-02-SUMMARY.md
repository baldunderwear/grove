---
phase: 15-post-session-flow
plan: 02
subsystem: session-ui
tags: [exit-banner, diff-summary, post-session, merge-bridge, session-card]

requires:
  - phase: 15-post-session-flow
    plan: 01
    provides: get_branch_diff_summary command, DiffSummaryData types, exited/disconnected store states, exit toasts
provides:
  - ExitBanner component (color-coded exit status)
  - DiffSummary component (inline diff stats with file list)
  - PostSessionActions component (duration + Review & Merge button)
  - SessionCard exited state rendering
  - MergeDialog bridge from post-session cards
affects: [18-wizard]

tech-stack:
  added: []
  patterns: [conditional card rendering based on session state, lazy diff fetch on exited mount]

key-files:
  created:
    - src-ui/src/components/session/ExitBanner.tsx
    - src-ui/src/components/session/DiffSummary.tsx
    - src-ui/src/components/session/PostSessionActions.tsx
  modified:
    - src-ui/src/components/session/SessionCard.tsx
    - src-ui/src/components/session/SessionManager.tsx

key-decisions:
  - "Used branch-store ahead count for merge button visibility rather than separate diff query"
  - "MergeDialog rendered via IIFE in JSX to keep branch lookup scoped and avoid stale closures"
  - "PostSessionActions uses fixed duration (createdAt to exitedAt) for exited sessions"

requirements-completed: [POST-01, POST-02, POST-05, POST-06]

duration: 8min
completed: 2026-04-02
---

# Phase 15 Plan 02: Post-Session UI Components Summary

**ExitBanner, DiffSummary, PostSessionActions components wired into SessionCard with MergeDialog bridge for one-click merge from exited sessions**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-04-02
- **Tasks:** 2 (Task 3 is a human-verify checkpoint, documented below)
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- ExitBanner renders green/red/gray banners based on clean exit, crash, or disconnected state
- DiffSummary lazily fetches and displays file-level diff stats with scrollable file list, loading skeleton, and error/empty states
- PostSessionActions shows fixed session duration and conditional "Review & Merge" button with color based on exit code
- SessionCard conditionally renders post-session UI (banner + diff + actions) when session state is exited or disconnected
- SessionManager renders MergeDialog triggered from post-session cards, pre-populated with branch info
- Exit handler uses setTabExited (preserving exit code), Error handler uses setTabDisconnected
- Exited tabs persist in card grid until explicit X button dismissal
- No auto-triggering of merge dialog on session exit (POST-06 compliant)

## Task Commits

1. **Task 1: Create ExitBanner, DiffSummary, PostSessionActions** - `8b314f3` (feat) - by previous agent
2. **Task 2: Wire into SessionCard and SessionManager** - `904b4af` (feat)

## Files Created/Modified

- `src-ui/src/components/session/ExitBanner.tsx` - Color-coded exit status banner (green/red/gray)
- `src-ui/src/components/session/DiffSummary.tsx` - Lazy diff data fetch with loading/error/empty/normal states
- `src-ui/src/components/session/PostSessionActions.tsx` - Duration display and conditional merge button
- `src-ui/src/components/session/SessionCard.tsx` - Added imports, onMerge prop, exited/disconnected conditional rendering
- `src-ui/src/components/session/SessionManager.tsx` - Added MergeDialog rendering, handleMerge callback, exited close guard

## Decisions Made

- Used `useBranchStore` ahead count for merge button visibility rather than querying diff data separately
- Rendered MergeDialog via IIFE pattern in JSX to keep branch lookup scoped without extra state variables
- PostSessionActions calculates fixed duration from createdAt to exitedAt for consistent display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] MergeDialog not rendered in JSX**
- **Found during:** Task 2 continuation
- **Issue:** Previous agent added mergeTabId state and handleMerge callback but did not render the MergeDialog component in the JSX tree
- **Fix:** Added MergeDialog rendering with IIFE pattern after terminal instances section
- **Files modified:** src-ui/src/components/session/SessionManager.tsx
- **Commit:** 904b4af

---

**Total deviations:** 1 auto-fixed (missing functionality)
**Impact on plan:** Critical fix -- without MergeDialog rendering, the "Review & Merge" button would have been non-functional.

## Checkpoint: Task 3 (Human Verification)

**Type:** checkpoint:human-verify
**Status:** Documented for future verification

The following needs visual verification with `cargo tauri dev`:
1. Launch a session, type `exit 0` -- verify green "Session complete" banner, diff summary, merge button
2. Launch a session, type `exit 1` -- verify red "Session crashed (exit code 1)" banner, amber merge button
3. Click "Review & Merge" -- verify MergeDialog opens with correct branch
4. Click X on exited card -- verify card removed from grid
5. Verify NO dialog auto-opens on session exit (POST-06)

## Known Stubs

None - all components are fully wired to real data sources (branch store, diff summary command, terminal store).

## Self-Check: PASSED

- All 5 files exist on disk
- Both commits (8b314f3, 904b4af) found in git log
- TypeScript compilation passes (only baseUrl deprecation warning)
