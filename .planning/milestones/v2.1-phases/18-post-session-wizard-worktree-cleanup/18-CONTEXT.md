# Phase 18: Post-Session Wizard + Worktree Cleanup - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a multi-step post-session wizard that guides users from diff review through merge to worktree cleanup. When a session exits, the existing "Review & Merge" button opens a stepper dialog (replacing direct MergeDialog launch). After successful merge, the user is prompted to delete the worktree and branch. This phase completes the full session lifecycle: launch → monitor → alert → close → review → merge → cleanup.

</domain>

<decisions>
## Implementation Decisions

### Wizard Structure & Navigation
- Stepper inside a modal dialog with step indicator at top — consistent with MergeDialog/MergeQueueDialog patterns
- 4 steps: Diff Summary → Commit Review → Merge → Cleanup — matches POST-03 spec exactly
- Back button on all steps, skip forward not allowed — merge must happen before cleanup, but user can re-review
- Replace existing "Review & Merge" button action — opens wizard instead of MergeDialog directly

### Diff & Commit Review Display
- Git diff --stat level with file tree — file list with +/- counts, no line-by-line diff viewer (per Phase 15 decision)
- Scrollable commit list with hash, message, timestamp — compact table format
- Reuse `get_branch_diff_summary` from Phase 15 — already returns files changed, insertions, deletions, commits vs merge target

### Worktree Cleanup Behavior
- Cleanup deletes worktree directory + local branch via git2. Remote branch untouched (POST-04 scope).
- Final wizard step shows checkbox toggles: "Delete worktree" (default on) + "Delete branch" (default on), user unchecks to keep
- If merge fails mid-wizard: stop at merge step, show error, offer retry or close. Don't proceed to cleanup step.
- Auto-close the session tab after successful cleanup — tab has no purpose once worktree is deleted

### Claude's Discretion
- Exact step indicator design (dots, numbered pills, progress bar)
- Animation/transition between wizard steps
- Whether to show a "success" summary before auto-closing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/components/session/PostSessionActions.tsx` — existing "Review & Merge" button on exited cards
- `src-ui/src/components/session/ExitBanner.tsx` — exit state banner (clean/crash/disconnected)
- `src-ui/src/components/session/SessionCard.tsx` — session card with state indicators
- `src-ui/src/stores/merge-store.ts` — MergeStep state machine, fetchPreview, executeMerge
- `src-ui/src/stores/terminal-store.ts` — SessionState type, tab lifecycle, closeTab
- `src-ui/src/components/MergeDialog.tsx` — existing merge UI (merge step logic can be reused)
- `src-tauri/src/git/pipeline.rs` — composable merge pipeline from Phase 16
- `src-tauri/src/commands/git_commands.rs` — get_branch_diff_summary, merge commands
- `src-ui/src/components/ui/dialog.tsx` — shadcn dialog primitive

### Established Patterns
- Modal dialogs for multi-step flows (MergeDialog, MergeQueueDialog, LaunchDialog)
- Zustand stores for all invoke() calls and state management
- SessionState enum drives card styling and behavior
- Tauri IPC: invoke<T>('command_name', { args }) with kebab-case events

### Integration Points
- `PostSessionActions.tsx` — change onMerge callback to open wizard instead of MergeDialog
- `terminal-store.ts` — add closeTab call after cleanup, possibly add worktree cleanup action
- `git_commands.rs` — new delete_worktree Tauri command
- `git/` module — new worktree deletion function using git2

</code_context>

<specifics>
## Specific Ideas

- Phase 15 already built the exited state, diff summary command, and "Review & Merge" button — Phase 18 wraps this in a wizard flow
- Phase 16's composable merge pipeline can be invoked from the wizard's merge step
- The wizard is the natural successor to the current PostSessionActions → MergeDialog flow

</specifics>

<deferred>
## Deferred Ideas

- Full file-level diff viewer — future milestone
- Remote branch deletion — not in POST-04 scope
- Auto-merge on clean exit — explicitly out of scope (anti-feature per Phase 15 decision)

</deferred>
