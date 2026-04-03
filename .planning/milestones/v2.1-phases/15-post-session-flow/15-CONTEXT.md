# Phase 15: Post-Session Flow - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the post-session review experience: when a PTY session exits, the session card transitions to an "exited" state showing a diff summary (files changed, insertions, deletions, commits) and a "Review & Merge" button that opens the existing MergeDialog pre-populated for that branch. Crashed sessions show a distinct red banner. No auto-triggering — user must explicitly click to review.

</domain>

<decisions>
## Implementation Decisions

### Session Exit State & Diff Display
- Add `'exited'` to SessionState type; tab survives PTY exit for post-session review
- Diff summary displays inline in the session card, replacing live terminal preview
- Diff at git diff --stat level: file list with +/- counts, commit list. No line-by-line diff viewer.
- New Rust command `get_branch_diff_summary` returns files changed, insertions, deletions, commits vs merge target

### Session-to-Merge Bridge
- "Review & Merge" button on exited session card, visible when branch has commits ahead of merge target
- Button opens existing MergeDialog pre-populated with branch info — reuses v1.0 merge UI
- Crashed sessions also get merge button but with warning styling (partial work may exist)
- Color-coded exit banner: green "Session complete" vs red "Session crashed (exit code N)"

### Safety & Trigger Behavior
- Post-session UI never auto-triggers — user must click "Review" on exited card (POST-06)
- Distinguish PTY disconnect (network blip) from real exit: show "Disconnected" state, not "Exited"
- `delete_worktree` deferred to Phase 18 (wizard) — this phase only bridges session-to-merge

### Claude's Discretion
- Exact diff summary layout within the card (spacing, typography)
- How to detect exit code from PTY process (platform-specific)
- Whether to add `'disconnected'` as separate SessionState or handle via isConnected flag

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/stores/terminal-store.ts` — SessionState type, tab lifecycle, focusSession
- `src-ui/src/stores/merge-store.ts` — MergeStep state machine, fetchPreview, executeMerge
- `src-ui/src/components/session/SessionCard.tsx` — session card with state indicators
- `src-ui/src/components/session/SessionManager.tsx` — card grid, focus mode
- `src-ui/src/components/terminal/SessionHistoryPanel.tsx` — existing session history display
- `src-tauri/src/commands/git_commands.rs` — merge_preview command already exists
- `src-tauri/src/git/merge.rs` — merge logic with build bump
- `src-ui/src/lib/alerts.ts` — toast system from Phase 14

### Established Patterns
- SessionState enum drives card styling and behavior
- Zustand Map cloning for tab state reactivity
- Tauri Channel for PTY I/O, events for state broadcasts
- MergeDialog accepts branch info and drives merge flow

### Integration Points
- `terminal-store.ts` — add 'exited' to SessionState, capture exit code
- `SessionCard.tsx` — show diff summary + merge button when state is 'exited'
- `pty.rs` — detect exit code and send to frontend
- `git_commands.rs` — new diff summary command
- `merge-store.ts` — pre-populate from session card context

</code_context>

<specifics>
## Specific Ideas

- Research recommended: exited session state keeps tab alive; tab closes only when user dismisses or starts wizard (Phase 18)
- Pitfalls research warned: PTY exit signals on Windows are unreliable — never auto-trigger, always explicit user action
- Reuse existing `merge_preview` data shape for diff summary if possible

</specifics>

<deferred>
## Deferred Ideas

- POST-03 (multi-step wizard) — deferred to Phase 18
- POST-04 (worktree cleanup prompt) — deferred to Phase 18
- Full file-level diff viewer — future milestone
- Auto-merge on clean exit — explicitly out of scope (anti-feature)

</deferred>
