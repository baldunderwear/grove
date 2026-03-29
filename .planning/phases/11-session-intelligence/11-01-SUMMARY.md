---
phase: 11-session-intelligence
plan: 01
subsystem: terminal
tags: [pty, ansi, regex, state-machine, tauri-events, session-state]

# Dependency graph
requires:
  - phase: 09-embedded-terminal
    provides: PTY reader thread, TerminalEvent Channel, TerminalManager
  - phase: 10-terminal-tabs
    provides: Job Object cleanup, multi-tab terminal management
provides:
  - SessionState enum (Working/Waiting/Idle/Error) with serde serialization
  - StateParser with ANSI stripping, pattern matching, and debounced transitions
  - Tauri event emission (session-state-changed) for frontend consumption
  - Idle detection via companion thread with shared atomic timestamp
affects: [11-02, 11-03, frontend-status-dots, dashboard-aggregate]

# Tech tracking
tech-stack:
  added: [regex 1.x]
  patterns: [dual-stream PTY output, LazyLock regex compilation, Arc<AtomicU64> cross-thread state]

key-files:
  created: [src-tauri/src/terminal/state_parser.rs]
  modified: [src-tauri/src/terminal/pty.rs, src-tauri/src/terminal/mod.rs, src-tauri/src/terminal/commands.rs, src-tauri/Cargo.toml]

key-decisions:
  - "LazyLock for regex compilation (Rust 1.80+ stable, no once_cell dependency)"
  - "Idle detection via Arc<AtomicU64> shared between reader and companion timer thread"
  - "Parser feeds AFTER xterm.js Channel send to guarantee zero rendering latency impact"
  - "Error detection requires 5+ lines of output to avoid false positives on compiler output"

patterns-established:
  - "Dual-stream PTY: Channel for xterm.js rendering, StateParser for intelligence"
  - "Companion thread pattern: lightweight timer thread with shared atomics for cross-thread coordination"
  - "ANSI stripping before any text analysis of PTY output"

requirements-completed: [SESS-01]

# Metrics
duration: 15min
completed: 2026-03-29
---

# Phase 11 Plan 01: Session State Parser Summary

**Real-time PTY output state detection engine with ANSI stripping, pattern matching, debounced transitions, and Tauri event emission**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T18:08:09Z
- **Completed:** 2026-03-29T18:23:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- SessionState enum (Working/Waiting/Idle/Error) with lowercase serde serialization for frontend consumption
- ANSI escape sequence stripper using LazyLock regex (CSI, OSC, charset, control chars) -- compiled once, zero per-call overhead
- StateParser with prompt detection (bare >, claude>, question patterns), error detection, and working/idle transitions
- Dual-stream PTY architecture: xterm.js Channel gets data first, parser feeds second (zero latency impact on rendering)
- Idle detection via companion thread with shared AtomicU64 timestamp and AtomicBool shutdown flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Create state_parser.rs with ANSI stripping, state machine, and event emission** - `9a14a13` (feat)
2. **Task 2: Wire state parser into PTY reader thread with dual-stream output** - `bd2c68a` (feat)

## Files Created/Modified
- `src-tauri/src/terminal/state_parser.rs` - SessionState enum, ANSI stripper, StateParser with pattern matching and Tauri event emission
- `src-tauri/src/terminal/pty.rs` - Dual-stream reader thread, StateParser creation, idle detection companion thread
- `src-tauri/src/terminal/mod.rs` - Module declaration and SessionState re-export
- `src-tauri/src/terminal/commands.rs` - AppHandle parameter passthrough to spawn_pty
- `src-tauri/Cargo.toml` - Added regex dependency

## Decisions Made
- Used LazyLock (Rust 1.80+ stable) instead of once_cell for static regex initialization -- no extra dependency
- Idle detection via Arc<AtomicU64> shared between reader and 15-second companion timer thread rather than blocking read timeout (simpler, portable)
- Error detection requires 5+ lines of output before triggering to avoid false positives on compiler output mid-stream
- Parser feeds after Channel send to guarantee zero latency impact on xterm.js rendering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all components are fully wired.

## Next Phase Readiness
- State parser emits `session-state-changed` Tauri events ready for frontend consumption in plan 11-02
- SessionState re-exported from terminal module for use in frontend bindings
- Idle detection runs autonomously via companion thread

---
*Phase: 11-session-intelligence*
*Completed: 2026-03-29*
