# Phase 17: Multi-Branch Merge Queue - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the multi-branch merge queue: users select branches via checkboxes, drag-reorder them in a dialog, and execute sequential merges with automatic build number handling. Queue runs in Rust for atomicity, rolls back on failure, suppresses file watcher during execution, and communicates progress via in-place toast updates.

</domain>

<decisions>
## Implementation Decisions

### Queue UI & Interaction
- Dedicated MergeQueueDialog (modal) with branch list, drag reorder, execute button
- Branch selection via checkboxes on branch table rows + "Merge Selected" button
- @dnd-kit/react for drag-to-reorder (React 19 compatible, ~12kB)
- Progress shown in both: in-place toast updates AND dialog progress bar

### Queue Execution & Safety
- Queue orchestration in Rust: `merge_queue_execute` Tauri command — frontend sends ordered branch list, Rust handles everything
- Rollback: record HEAD OID before queue start, `git reset --hard` to snapshot on any failure
- Build numbers: detect once before queue, increment in-memory per branch using `override_build` from Phase 16 pipeline
- File watcher suppression via boolean flag in Tauri managed state — watcher checks flag, skips refresh while true

### Toast & Progress Communication
- Single persistent progress toast, updated in-place via toast ID: "Merging 2/5: branch-name"
- Success: summary toast "Queue complete: 5/5 merged"
- Failure: persistent error toast "Queue failed on branch-name (3/5). Rolled back."

### Claude's Discretion
- MergeQueueDialog layout details (spacing, sections)
- Exact Tauri event names for progress streaming
- merge-queue-store.ts vs extending merge-store.ts
- @dnd-kit/react exact API usage for sortable list

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/git/pipeline.rs` — MergeContext with override_build, composable step functions (from Phase 16)
- `src-tauri/src/git/merge.rs` — merge_branch() thin wrapper (calls pipeline steps)
- `src-ui/src/stores/merge-store.ts` — MergeStep state machine pattern (model for queue store)
- `src-ui/src/lib/alerts.ts` — toast system with priority queue, fireSessionToast pattern
- `src-ui/src/stores/branch-store.ts` — branch data for selection
- Sonner's `toast()` returns ID, `toast.loading()` for progress, `toast.dismiss(id)` for cleanup

### Established Patterns
- Zustand Map cloning for reactivity
- Tauri events for broadcast (progress updates), Channels for 1:1 PTY I/O
- Modal dialogs via state flag in store (mergeTabId pattern from Phase 15)

### Integration Points
- `src-tauri/src/git/queue.rs` — NEW module for queue execution
- `src-tauri/src/watcher/` — add suppression flag check
- `src-ui/src/components/BranchTable.tsx` — add checkboxes + "Merge Selected" button
- `src-ui/src/components/MergeQueueDialog.tsx` — NEW dialog
- `src-ui/src/stores/merge-queue-store.ts` — NEW store (or extend merge-store)

</code_context>

<specifics>
## Specific Ideas

- Research recommended @dnd-kit/react ^0.3.2 — pin exact version (0.x API)
- TOAST-05 requirement: merge queue progress updates existing toast in-place
- Queue progress streaming via Tauri events (not channels) — one-to-many broadcast pattern
- File watcher suppression must be paired with a "resume + force refresh" after queue completes

</specifics>

<deferred>
## Deferred Ideas

- Branch-level merge policies (auto-merge rules per branch pattern) — v2.2+
- Merge conflict resolution UI beyond auto-resolve — v2.2+
- Parallel merge queue execution — explicitly anti-feature (defeats build number serialization)

</deferred>
