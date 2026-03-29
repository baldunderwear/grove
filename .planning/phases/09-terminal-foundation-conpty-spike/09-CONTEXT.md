# Phase 09: Terminal Foundation (ConPTY Spike) - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — research-informed defaults)

<domain>
## Phase Boundary

Single embedded terminal that launches Claude Code inside Grove. ConPTY on Windows via portable-pty, rendered with xterm.js, data streamed via Tauri Channels. Must work on NAS-mounted drives (UNC path resolution). No visible CMD windows.

</domain>

<decisions>
## Implementation Decisions

### Terminal Architecture (from research)
- portable-pty 0.9.0 for PTY (direct, not tauri-plugin-pty — need raw stream access for future state detection)
- @xterm/xterm 6.0 for terminal rendering in React
- Tauri Channels (NOT events) for PTY I/O streaming — events panic under throughput
- Dedicated OS thread per terminal for blocking PTY reads
- UNC-to-drive-letter resolution before PTY spawn (reuse existing v1.1 utility)
- CREATE_NO_WINDOW on PTY process creation

### UI Layout
- Split view: existing dashboard on left, terminal pane on right
- Resizable pane divider
- Terminal replaces external window launch — clicking "Launch" opens terminal pane instead
- Single terminal tab for this phase (multi-tab in Phase 10)

### ConPTY Spike
- First task must validate portable-pty ConPTY on Windows release builds
- Test for visible CMD window flash
- Test xterm.js WebGL addon in Tauri WebView2
- If ConPTY spike fails, investigate psmux fork or direct windows-rs ConPTY

### Claude's Discretion
- Exact terminal component implementation (custom hook vs wrapper)
- xterm.js addon selection (WebGL vs canvas fallback logic)
- Pane divider component choice
- Terminal toolbar design (if any)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/process/launch.rs` — existing session launch with CREATE_NO_WINDOW patterns
- `src-tauri/src/git/branches.rs` — UNC path resolution via get_drive_mappings()
- `src-ui/src/stores/session-store.ts` — session state management (will need terminal state added)
- `src-ui/src/components/BranchTable.tsx` — launch button that needs to switch to embedded terminal

### Established Patterns
- Tauri commands with managed state (Mutex)
- Zustand stores with invoke() calls
- shadcn/ui components with Grove brand design tokens
- CREATE_NO_WINDOW on all background subprocesses

### Integration Points
- BranchTable "Launch" button changes from spawning external terminal to opening embedded terminal pane
- New Rust terminal module manages PTY lifecycle
- New React terminal component with xterm.js
- Tauri Channel for streaming PTY I/O to frontend

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: click Launch, Claude Code opens in embedded terminal inside Grove, full ANSI, resizable, no CMD flash, works on NAS
- ConPTY spike is the gating risk — if it doesn't work, the entire v2.0 approach needs to change

</specifics>

<deferred>
## Deferred Ideas

- Multi-tab management (Phase 10)
- Session state detection/parsing (Phase 11)
- Process tree cleanup with Job Objects (Phase 10)

</deferred>
