# Phase 05: Session Launch & Process Tracking - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — defaults accepted)

<domain>
## Phase Boundary

Launch Claude Code sessions from the dashboard and track active processes. Detect active sessions per worktree, show badges, handle session lifecycle.

</domain>

<decisions>
## Implementation Decisions

### Session Launch
- Launch button per branch row in the dashboard table
- Spawns `claude --worktree <name>` in a new Windows terminal window via Rust Command
- Configurable launch flags stored per-project in config
- "New Worktree" flow: create worktree via git, then launch session

### Process Tracking
- Rust backend polls for Claude Code processes, matches by working directory to worktree path
- PID tracking stored in Tauri managed state (not persisted to disk)
- Polling interval matches the dashboard refresh interval
- Active session badge (emerald pulse dot) on branch rows

### Quick Actions
- "Open in Explorer" button per branch (opens worktree path in Windows Explorer)
- "Open in VS Code" button per branch (runs `code <worktree_path>`)
- Action buttons visible on hover or as icon buttons in branch row

### Claude's Discretion
- Exact process detection method (command line parsing vs PID file)
- Terminal emulator choice for launching (Windows Terminal, cmd, powershell)
- Exact placement of action buttons in branch row
- New worktree dialog design

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/components/BranchTable.tsx` — Branch table with badge column (placeholder for active session)
- `src-ui/src/stores/branch-store.ts` — Branch store with refresh capabilities
- `src-tauri/src/commands/git_commands.rs` — Existing git command pattern
- `src-tauri/src/config/models.rs` — ProjectConfig with configurable fields

### Established Patterns
- Tauri commands with State<Mutex<>> for shared state
- Zustand stores with invoke() calls
- shadcn components for UI elements
- File watcher event emission pattern

### Integration Points
- Branch table rows gain launch/action buttons
- Active session badge wires into existing BranchInfo display
- Process state managed alongside config state in Tauri
- New worktree creation uses existing git2 integration

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: launch Claude Code from dashboard, see active badge, badge disappears when session ends
- FR-02.4 (active session badge) was deferred from Phase 04 to this phase

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
