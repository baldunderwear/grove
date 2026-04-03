---
phase: 18-post-session-wizard-worktree-cleanup
plan: 03
subsystem: ui
tags: [react, session-manager, wizard, wiring, integration]

requires:
  - phase: 18-post-session-wizard-worktree-cleanup
    plan: 01
    provides: delete_worktree Tauri command
  - phase: 18-post-session-wizard-worktree-cleanup
    plan: 02
    provides: PostSessionWizard component and all step components
provides:
  - PostSessionWizard wired into SessionManager replacing MergeDialog for session-originated merges
affects: [session-manager, post-session-flow]

tech-stack:
  added: []
  patterns:
    - "Conditional wizard vs dialog rendering based on merge origin (session vs branch-table)"

key-files:
  created: []
  modified:
    - src-ui/src/components/session/SessionManager.tsx

key-decisions:
  - "PostSessionWizard replaces MergeDialog only for session-originated merges; BranchTable retains MergeDialog"
  - "Fixed broken useSessionStore import (deleted store) by switching to lib/shell functions"

patterns-established:
  - "Session-originated merges route through wizard; non-session merges route through MergeDialog"

requirements-completed: [POST-03, POST-04]

duration: 3min
completed: 2026-04-03
---

# Phase 18 Plan 03: Wire PostSessionWizard into SessionManager Summary

**Replaced MergeDialog IIFE with PostSessionWizard in SessionManager so session-exit "Review & Merge" opens the 4-step wizard**

## Performance

- **Duration:** 3 min
- **Completed:** 2026-04-03
- **Tasks:** 2 (1 auto, 1 checkpoint deferred)
- **Files modified:** 1

## Accomplishments
- Replaced MergeDialog import and IIFE block with PostSessionWizard in SessionManager
- Wired tab, branchName, and mergeTarget props for wizard's step-through flow
- Fixed broken useSessionStore import (deleted store) with lib/shell functions
- Removed unused setTabConnected destructure
- BranchTable MergeDialog usage unchanged (non-session merges unaffected)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace MergeDialog IIFE with PostSessionWizard in SessionManager** - `dffd814` (feat)
2. **Task 2: Verify complete post-session wizard flow** - Checkpoint deferred by user (continue without validation)

## Files Created/Modified
- `src-ui/src/components/session/SessionManager.tsx` - Replaced MergeDialog with PostSessionWizard for session-originated merges, fixed broken import

## Decisions Made
- PostSessionWizard replaces MergeDialog only for session-originated merges; BranchTable retains MergeDialog independently
- Fixed broken useSessionStore import as auto-fix (Rule 1 - bug found during task execution)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken useSessionStore import**
- **Found during:** Task 1
- **Issue:** SessionManager imported from a deleted useSessionStore; needed to switch to lib/shell functions
- **Fix:** Replaced import with working lib/shell utility functions
- **Files modified:** src-ui/src/components/session/SessionManager.tsx
- **Commit:** dffd814

**2. [Rule 1 - Bug] Removed unused setTabConnected destructure**
- **Found during:** Task 1
- **Issue:** Unused variable from store destructuring causing lint warning
- **Fix:** Removed the destructure
- **Files modified:** src-ui/src/components/session/SessionManager.tsx
- **Commit:** dffd814

## Issues Encountered
None

## User Setup Required
None

## Known Stubs
None - PostSessionWizard is fully wired to its data sources (diff summary, commit list, merge store, delete_worktree command).

## Verification Status
- Task 2 (human-verify checkpoint) was deferred by user — manual end-to-end testing not yet performed
- TypeScript typecheck and lint passed at Task 1 commit time

## Self-Check: PASSED

- SessionManager.tsx exists on disk
- Task commit dffd814 verified in git log
- SUMMARY.md created successfully

---
*Phase: 18-post-session-wizard-worktree-cleanup*
*Completed: 2026-04-03*
