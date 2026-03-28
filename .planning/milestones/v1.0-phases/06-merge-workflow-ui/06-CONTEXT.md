# Phase 06: Merge Workflow UI - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — defaults accepted)

<domain>
## Phase Boundary

Full merge flow UI: preview dialog showing what will change, confirmation step, progress during execution, conflict handling, and post-merge summary. All git operations already exist in Phase 03 backend — this phase wires them to the UI.

</domain>

<decisions>
## Implementation Decisions

### Merge Flow
- Merge button visible on merge-ready branches (ahead > 0, not dirty)
- Multi-step dialog flow: Preview → Confirm → Progress → Summary
- Preview shows: commits to merge, changelog fragments found, current/next build number
- Confirmation step with "Merge Branch" primary action

### Conflict Handling
- Build file conflicts auto-resolved (handled by Rust backend)
- Unexpected conflicts shown in the dialog with file paths
- User can abort merge if unexpected conflicts found

### Post-Merge
- Summary dialog showing: files changed, build number bump, changelog rename
- Merge history log accessible from dashboard (stored in memory per session)

### Claude's Discretion
- Exact dialog component design (stepper vs modal flow)
- Animation/transition between merge steps
- Merge history list placement and design
- Error state presentation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/git/merge.rs` — merge_preview and merge_branch Tauri commands (Phase 03)
- `src-tauri/src/commands/git_commands.rs` — merge_preview, merge_branch commands registered
- `src-ui/src/components/BranchTable.tsx` — Branch rows where merge button goes
- `src-ui/src/components/ui/dialog.tsx` — shadcn Dialog component
- `src-ui/src/stores/branch-store.ts` — Branch data with ahead/behind counts

### Established Patterns
- shadcn Dialog for multi-step flows
- Zustand stores for state management
- invoke() for Tauri commands
- emerald-500 accent for primary actions

### Integration Points
- Merge button in BranchTable rows
- MergePreview and MergeResult types from Rust structs
- Dashboard refresh after successful merge
- Merge history stored in Zustand (session-only)

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: merge sol-lune worktree branch from UI — build bumps, changelog renames, no manual conflict resolution
- Reuse Phase 03's atomic merge with rollback

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
