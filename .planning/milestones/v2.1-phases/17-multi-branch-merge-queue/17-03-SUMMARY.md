---
phase: 17-multi-branch-merge-queue
plan: 03
subsystem: ui
tags: [react, dnd-kit, dialog, merge-queue, branch-table]

requires:
  - phase: 17-multi-branch-merge-queue/01
    provides: Queue orchestrator backend (execute_queue, merge-queue-progress event)
  - phase: 17-multi-branch-merge-queue/02
    provides: Zustand merge-queue-store, TypeScript queue types, toast helpers, @dnd-kit/react
provides:
  - MergeQueueDialog component with drag-reorder, execution progress display, and contextual footer
  - "Merge Selected" button in BranchTable header when 2+ eligible branches checked
  - End-to-end queue flow from branch selection through dialog to execution
affects: []

tech-stack:
  added: []
  patterns: ["DragDropProvider + useSortable render-props pattern for drag-reorder", "SortableQueueItem wrapper with containerRef/handleRef split"]

key-files:
  created:
    - src-ui/src/components/MergeQueueDialog.tsx
  modified:
    - src-ui/src/components/BranchTable.tsx

key-decisions:
  - "SortableQueueItem uses render-props pattern to expose containerRef, handleRef, and isDragging"
  - "Remove button always visible (not group-hover gated) for discoverability in compact list"
  - "Eligible branches for queue: ahead > 0 AND not dirty -- same criteria as single-branch merge"
  - "Dialog state managed locally in BranchTable (self-contained, no prop threading through Dashboard)"

patterns-established:
  - "onDragEnd uses source.sortable.initialIndex/index only (no target) per dnd-kit 0.3.x API"
  - "Prevent dialog close during execution via onPointerDownOutside + onEscapeKeyDown + onInteractOutside"

requirements-completed: [MERGE-02, MERGE-03, MERGE-07]

duration: 6min
completed: 2026-04-03
---

# Phase 17 Plan 03: Merge Queue Dialog and Branch Table Wiring Summary

MergeQueueDialog with dnd-kit drag-reorder, per-branch status icons, progress bar, and BranchTable "Merge Selected" button wiring.

## What Was Built

### Task 1: MergeQueueDialog Component (MergeQueueDialog.tsx)

Modal dialog implementing the full queue UI with five sections per UI-SPEC:

1. **Header** -- "Merge Queue" title with "{N} branches selected" description
2. **Queue List (pre-execution)** -- DragDropProvider wrapping SortableQueueItem components. GripVertical drag handle, branch name with "+N commits" subtitle, X remove button. Drag active state with ring highlight and slight scale.
3. **Queue List (during execution)** -- Same list with drag disabled. Status icons replace drag handles: Circle (pending), Loader2 spinning (active), CheckCircle2 (complete), XCircle (failed), RotateCcw (rolled_back).
4. **Progress Section** -- 1px progress bar (grove-leaf fill, red-500 on failure) with "Merging N/M: branch-name" text below.
5. **Footer** -- Contextual buttons: Discard Queue + Start Queue (ready), Merging... disabled (executing), Done (success), Close (failure).

### Task 2: BranchTable "Merge Selected" Integration

Added to existing BranchTable component:
- `eligibleSelected` computation: branches in selection set with `ahead > 0` and not dirty
- "Merge Selected (N)" button appears in header row when `showSelection && eligibleSelected.length >= 2`
- Button click populates merge-queue-store via `setBranches()` and opens dialog
- MergeQueueDialog rendered at bottom of BranchTable, receiving project config from useConfigStore
- Selection cleared when dialog closes
- Existing single-branch merge flow completely untouched

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 4cba6f7 | feat(17-03): create MergeQueueDialog with drag-reorder and execution progress |
| 2 | 4d9b7f4 | feat(17-03): add Merge Selected button to BranchTable and wire queue dialog |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation passes (`npx tsc --noEmit` -- zero errors)
- Manual testing deferred (checkpoint approved without validation)

## Known Stubs

None -- all data flows are wired to live store state and Tauri backend invocations.
