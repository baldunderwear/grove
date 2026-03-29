# Phase 11: Session Intelligence - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Real-time session state detection (waiting/working/idle/error) by parsing PTY output. Dashboard aggregate status. Colored status dots per terminal tab. Desktop notifications on "waiting for input" transitions. Session history with git diff and state timeline.

</domain>

<decisions>
## Implementation Decisions

### State Detection Strategy (from research)
- Primary signal: PTY output parsing — detect Claude Code prompt patterns in real-time
- Tee the output stream: raw bytes → xterm.js (no latency), stripped text → state parser (async)
- States: working (tool calls streaming), waiting (prompt visible), idle (no output > 60s), error (error patterns)
- ANSI stripping before pattern matching (Claude Code output has heavy ANSI formatting)

### Dashboard Integration
- Aggregate status bar: "3 working, 2 waiting for input" summary
- Per-tab colored dots: green=working, amber=waiting, gray=idle, red=error
- Notification on waiting→ transition (reuse existing tauri-plugin-notification)

### Session History
- Track state transitions with timestamps per terminal
- Git diff since session start (run `git diff --stat` against starting HEAD)
- Duration tracking already exists in terminal tabs (Phase 10)

### Claude's Discretion
- Exact regex patterns for state detection (needs experimentation)
- State transition debounce timing
- History UI design (panel, drawer, or dialog)
- Whether to use Claude Code's --output-format stream-json as alternative signal

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/terminal/pty.rs` — PTY reader thread (tee point for state parser)
- `src-tauri/src/terminal/mod.rs` — TerminalManager with per-session state
- `src-ui/src/stores/terminal-store.ts` — Multi-tab store (add state field per tab)
- `src-ui/src/components/terminal/TerminalTabBar.tsx` — Tab bar (add status dot)
- `src-tauri/src/notifications.rs` — Existing notification infrastructure

### Integration Points
- PTY reader thread tees output to state parser
- State changes emitted as Tauri events (low frequency — ok for events, unlike PTY data)
- Terminal store receives state updates per tab
- TabBar renders colored dot based on state
- Dashboard header shows aggregate count

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: colored dots per tab updating in real-time, dashboard aggregate, notification on "waiting for input"

</specifics>

<deferred>
## Deferred Ideas

- JSONL log file watching (secondary signal, format not stable)
- Token usage tracking

</deferred>
