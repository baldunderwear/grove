# Phase 10: Multi-Terminal Tabs - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Multiple terminal tabs open simultaneously, each tied to a worktree. Tab bar with branch name + duration. Tab switching preserves scrollback. Process tree cleanup on tab close via Windows Job Objects. Tray hide/restore preserves tabs.

</domain>

<decisions>
## Implementation Decisions

### Tab Architecture
- Tab bar above terminal pane with branch name and session duration per tab
- Switching tabs hides/shows xterm.js instances (don't destroy — preserve scrollback)
- Terminal store tracks multiple sessions (Map of terminalId → session state)
- TerminalManager on Rust side already supports multiple sessions via HashMap

### Process Lifecycle
- Windows Job Objects for process tree cleanup (research mandated this)
- When tab closes: kill Job Object → all child processes die
- TerminalManager.kill() must use Job Object, not just process kill
- Verify no zombie processes in Task Manager after close

### Claude's Discretion
- Tab bar visual design (horizontal tabs, pill tabs, etc.)
- Tab overflow behavior (scroll vs dropdown for many tabs)
- Tab reordering (drag-and-drop or not)
- Duration display format

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/terminal/mod.rs` — TerminalManager with HashMap<String, TerminalSession> (from Phase 09)
- `src-tauri/src/terminal/pty.rs` — PTY spawn with reader thread
- `src-tauri/src/terminal/commands.rs` — terminal_spawn, terminal_write, terminal_resize, terminal_kill
- `src-ui/src/stores/terminal-store.ts` — Zustand store (currently single terminal, needs multi)
- `src-ui/src/components/terminal/TerminalPanel.tsx` — Terminal panel component
- `src-ui/src/components/terminal/TerminalToolbar.tsx` — Toolbar with branch name and close

### Integration Points
- Terminal store needs Map<terminalId, TerminalState> instead of single active terminal
- Dashboard needs tab bar component above terminal pane
- TerminalPanel needs to support multiple instances (one per tab, hidden when not active)
- BranchTable launch should add a new tab (not replace current terminal)

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: multiple tabs open simultaneously, switching preserves state, closing kills process tree, tray hide/restore works

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
