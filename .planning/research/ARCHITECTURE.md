# Architecture Patterns: Embedded Terminals, Output Parsing, and Config Editors

**Domain:** Tauri 2 desktop app — integrating PTY terminals, streaming I/O, and code editors into existing Grove architecture
**Researched:** 2026-03-27
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

Grove v2.0 "Mission Control" adds three major subsystems to the existing Tauri 2 + React app: embedded PTY terminals (replacing external window launches), real-time output parsing for session state detection, and CodeMirror-based config/markdown editors. All three integrate through established Tauri patterns already used in Grove — managed state, invoke commands, and Tauri's Channel API for high-throughput streaming.

The critical architectural insight: **do NOT use WebSockets**. Tauri's Channel API provides ordered, high-performance streaming natively through the IPC bridge, eliminating the need for a separate WebSocket server. This is simpler, more secure, and faster than running a localhost WS server inside a desktop app.

## Existing Architecture (What We Have)

### Rust Backend Modules
```
src-tauri/src/
  lib.rs          -- App setup, plugin registration, managed state, invoke_handler
  commands/       -- Tauri command handlers (config, git, session)
  config/         -- Project registry, settings persistence (JSON)
  git/            -- Branch listing, status, merge, build bump (git2 + CLI)
  process/        -- Session launch (wt.exe/cmd.exe), detection (sysinfo polling)
  watcher/        -- File system monitoring (notify crate)
  tray.rs         -- System tray menu building
  notifications.rs -- Desktop notifications
  fetch.rs        -- Background auto-fetch
```

### Frontend Structure
```
src-ui/src/
  App.tsx          -- View router (empty/all-projects/dashboard/project/settings)
  stores/          -- Zustand: config-store, branch-store, session-store, merge-store
  pages/           -- Dashboard, Settings, ProjectConfig, AllProjects, EmptyState
  components/      -- BranchTable, MergeDialog, AddProjectWizard, etc.
  layout/          -- Sidebar
  hooks/           -- useKeyboardShortcuts
```

### Communication Patterns Already Established
1. **invoke()** — Frontend calls Rust commands, gets single response (used everywhere)
2. **Tauri events** — Backend emits "git-changed", frontend listens (used for watcher notifications)
3. **Managed state** — `Mutex<T>` in app state for shared resources (SessionDetector, NotificationState)
4. **Polling** — Session detection uses periodic invoke() calls from frontend

### Key Architectural Constraints
- Windows-first (ConPTY, not Unix PTY)
- NAS paths (UNC paths like `\\nas\share\...` must work)
- Lightweight (sub-100MB installed, fast startup)
- Non-destructive (preview before action)

## New Architecture: Three Subsystems

### Subsystem 1: Embedded PTY Terminals

#### Recommended Approach: Custom portable-pty + Tauri Channels

Use `portable-pty` directly (not `tauri-plugin-pty`) because:
- `tauri-plugin-pty` has only 18 GitHub stars, 3 contributors, no formal releases — too immature for production
- `portable-pty` is battle-tested (from WezTerm, the most popular Rust terminal emulator)
- Direct integration gives full control over PTY lifecycle, output tapping, and error handling
- We need to intercept output for session state parsing — a plugin abstraction gets in the way

**Confidence:** MEDIUM — portable-pty is well-proven, but ConPTY on Windows has quirks. The `portable-pty-psmux` fork addresses missing ConPTY flags (PSEUDOCONSOLE_RESIZE_QUIRK, PSEUDOCONSOLE_WIN32_INPUT_MODE) that may be needed. Start with upstream `portable-pty` 0.9.0 and evaluate if the fork is needed.

#### New Rust Module: `src-tauri/src/terminal/`

```
terminal/
  mod.rs           -- Public API, TerminalManager
  pty.rs           -- portable-pty wrapper, PTY spawn/resize/kill
  session.rs       -- Per-terminal session state (id, pty handle, output buffer)
  parser.rs        -- Output parsing pipeline (ANSI stripping, state detection)
  commands.rs      -- Tauri command handlers for terminal operations
```

#### Data Flow: Terminal I/O

```
[User types in xterm.js]
    |
    v
Frontend: term.onData(data => invoke('terminal_write', { id, data }))
    |
    v  (Tauri invoke — single message, low latency)
Rust: terminal_write command
    |
    v
pty.master.write_all(data)  -- Write to PTY stdin
    |
    v
[Shell/Claude process reads stdin, produces output]
    |
    v
pty.master.read() -- Background thread reads PTY stdout (blocking read in loop)
    |
    v
Output parsing pipeline:
  1. Raw bytes -> UTF-8 chunks
  2. Fork: raw chunk -> Channel to frontend (display)
  3. Fork: raw chunk -> parser (state detection, see Subsystem 2)
    |
    v
channel.send(TerminalOutput::Data(chunk))  -- Tauri Channel (ordered, fast)
    |
    v
Frontend: onEvent handler writes to xterm.js terminal
```

#### Why Tauri Channels, Not WebSockets

Tauri's Channel API is purpose-built for this exact use case. From official docs: "Channels are designed to be fast and deliver ordered data. They are used internally for streaming operations such as download progress, **child process output** and WebSocket messages."

| Aspect | Tauri Channels | WebSocket Server |
|--------|---------------|-----------------|
| Setup complexity | Zero — built into Tauri | Need tokio + tungstenite, port management |
| Security | IPC bridge, no open ports | Localhost port, potential for abuse |
| Performance | Direct memory transfer | Serialization + TCP overhead |
| Ordering | Guaranteed | Guaranteed (TCP) |
| Multiple terminals | One channel per terminal | Multiplexing or multiple connections |
| Error handling | Rust Result types | Connection drops, reconnects |

#### Rust Types

```rust
use tauri::ipc::Channel;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};

/// Unique identifier for each terminal instance
type TerminalId = String; // UUID

/// Events streamed from PTY to frontend
#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
enum TerminalEvent {
    Data { data: String },           // Terminal output chunk
    StateChange { state: SessionState }, // Parsed state transition
    Exit { code: Option<u32> },      // Process exited
    Error { message: String },       // PTY error
}

/// Managed state: all active terminal sessions
struct TerminalManager {
    sessions: HashMap<TerminalId, TerminalSession>,
}

struct TerminalSession {
    pty_pair: PtyPair,       // Master + child handles
    child: Box<dyn Child>,   // Spawned process
    parser: OutputParser,    // State detection pipeline
}
```

#### Tauri Commands (New)

```rust
// Spawn a new embedded terminal, returns terminal ID
#[tauri::command]
fn terminal_spawn(
    working_dir: String,
    shell: Option<String>,  // Default: powershell.exe
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    manager: State<Mutex<TerminalManager>>,
) -> Result<TerminalId, String>;

// Write user input to terminal
#[tauri::command]
fn terminal_write(
    id: TerminalId,
    data: String,
    manager: State<Mutex<TerminalManager>>,
) -> Result<(), String>;

// Resize terminal
#[tauri::command]
fn terminal_resize(
    id: TerminalId,
    cols: u16,
    rows: u16,
    manager: State<Mutex<TerminalManager>>,
) -> Result<(), String>;

// Kill terminal
#[tauri::command]
fn terminal_kill(
    id: TerminalId,
    manager: State<Mutex<TerminalManager>>,
) -> Result<(), String>;

// List active terminals
#[tauri::command]
fn terminal_list(
    manager: State<Mutex<TerminalManager>>,
) -> Result<Vec<TerminalInfo>, String>;
```

#### Integration with Existing Modules

- **process/launch.rs** — `launch_claude_session()` currently spawns external windows. Add a new path: `launch_claude_embedded()` that calls `terminal_spawn` internally and returns a terminal ID instead of a PID.
- **process/detect.rs** — `SessionDetector` currently polls sysinfo for claude processes. Embedded terminals are known directly (we spawned them), so the detector can check both: managed terminals + external processes.
- **session_commands.rs** — `launch_session` command gains an `embedded: bool` parameter. If true, spawns via TerminalManager; if false, uses existing external window launch.
- **lib.rs** — Add `Mutex<TerminalManager>` to managed state, register new terminal commands.

### Subsystem 2: Output Parsing Pipeline

#### Architecture: Tee-based Stream Processing

The PTY read loop produces raw bytes. These are "tee'd" — sent both to the frontend for display AND through a parsing pipeline for state detection.

```
PTY stdout bytes
    |
    +---> [Raw to frontend via Channel] (no processing, fast)
    |
    +---> [Parser pipeline] (async, can lag behind display)
              |
              1. ANSI escape sequence stripping (for text analysis only)
              2. Line buffering (accumulate until newline)
              3. Pattern matching (regex against known Claude output patterns)
              4. State machine transitions
              5. State change -> Channel<TerminalEvent::StateChange>
```

#### Session State Detection

```rust
#[derive(Clone, serde::Serialize, PartialEq)]
enum SessionState {
    Starting,      // Terminal spawned, Claude not yet loaded
    Idle,          // Claude prompt visible, waiting for user input
    Working,       // Claude is generating/executing (tool calls active)
    WaitingInput,  // Claude asked a question, waiting for user response
    Error,         // Error state detected in output
    Exited,        // Process terminated
}
```

**Detection heuristics (pattern matching on stripped output):**

| Pattern | Detected State |
|---------|---------------|
| Claude Code startup banner | Starting -> Idle |
| `>` prompt at line start after response | Working -> Idle |
| `? ` or permission prompt patterns | Working -> WaitingInput |
| Tool use indicators (file edits, bash calls) | Idle -> Working |
| Error stack traces, "Error:" prefixed lines | -> Error |
| Process exit | -> Exited |

**Confidence:** LOW-MEDIUM — Claude Code's output format is not a stable API. Heuristics will need tuning and may break across Claude Code updates. This is explicitly called out as needing iterative refinement. JSONL log parsing (from `~/.claude/projects/`) is more reliable for post-hoc analysis but not real-time.

#### Hybrid Approach: PTY Output + JSONL Logs

For robustness, combine two signal sources:
1. **Real-time PTY output parsing** — immediate but fragile (heuristic-based)
2. **JSONL log file watching** — delayed (file write lag) but structured and reliable

The existing `watcher/` module can be extended to watch `~/.claude/projects/<hash>/` for JSONL changes. New JSONL entries provide ground truth to calibrate and correct PTY-based state detection.

```
watcher/ (existing)
  +-- claude_logs.rs (new) -- Watch ~/.claude/projects/ for session logs
                              Parse JSONL entries for tool_use, assistant messages
                              Emit state corrections to TerminalManager
```

### Subsystem 3: Config/Markdown Editors

#### Recommended: CodeMirror 6 via @uiw/react-codemirror

Use CodeMirror 6 (not Monaco) because:
- **Bundle size:** ~300KB modular vs 5-10MB for Monaco. Grove's installed size constraint (<100MB) makes this critical.
- **Modularity:** Only import language modes actually needed (JSON, Markdown, YAML)
- **Mobile-friendly:** Not relevant now but good for future
- **React integration:** `@uiw/react-codemirror` is the most popular and maintained React wrapper

**Confidence:** HIGH — CodeMirror 6 is well-established, the React wrapper is actively maintained, and the language modes we need (JSON, Markdown) are official packages.

#### Editor Use Cases in Grove

| Editor Target | File Type | Language Mode | Special Features |
|--------------|-----------|---------------|-----------------|
| CLAUDE.md | Markdown | `@codemirror/lang-markdown` | Section-aware editing, preview pane |
| .claude/settings.json | JSON | `@codemirror/lang-json` | Schema validation, key completion |
| .claude/skills/*.md | Markdown | `@codemirror/lang-markdown` | Template snippets |
| Project config | JSON (internal) | `@codemirror/lang-json` | Grove config schema |

#### New Frontend Components

```
src-ui/src/
  components/
    editor/
      CodeEditor.tsx        -- Wrapper around @uiw/react-codemirror
      MarkdownEditor.tsx    -- CodeEditor + preview pane + section nav
      JsonEditor.tsx        -- CodeEditor + schema validation
      SettingsEditor.tsx    -- Structured form backed by JSON editor
    terminal/
      TerminalPanel.tsx     -- xterm.js terminal instance
      TerminalTabs.tsx      -- Tab bar for multiple terminals
      TerminalContainer.tsx -- Layout: tabs + active terminal + status bar
      SessionBadge.tsx      -- State indicator (idle/working/error)
  pages/
    SessionView.tsx         -- New page: terminal + editor side-by-side
  stores/
    terminal-store.ts       -- Terminal state: active terminals, focus, layout
    editor-store.ts         -- Open files, dirty state, save status
```

#### Data Flow: File Editing

```
[User opens CLAUDE.md for project X]
    |
    v
invoke('read_file', { path: projectPath + '/CLAUDE.md' })
    |
    v
Rust: fs::read_to_string(path) -> String
    |
    v
Frontend: CodeMirror loads content, user edits
    |
    v
[User saves (Ctrl+S or auto-save)]
    |
    v
invoke('write_file', { path, content })
    |
    v
Rust: fs::write(path, content) with atomic write (write to .tmp, rename)
    |
    v
watcher/ detects file change -> emit 'file-changed' event (debounced)
```

#### New Tauri Commands for File Operations

```rust
// In commands/file_commands.rs (new)

#[tauri::command]
fn read_file(path: String) -> Result<String, String>;

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String>;

#[tauri::command]
fn list_directory(path: String, pattern: Option<String>) -> Result<Vec<FileEntry>, String>;

// For CLAUDE.md section-aware editing
#[tauri::command]
fn read_claude_md(project_path: String) -> Result<ClaudeMdContent, String>;

// For .claude/settings.json with schema awareness
#[tauri::command]
fn read_claude_settings(project_path: String) -> Result<serde_json::Value, String>;

#[tauri::command]
fn write_claude_settings(project_path: String, settings: serde_json::Value) -> Result<(), String>;
```

## Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|-------------|
| `terminal/` (Rust) | PTY lifecycle, I/O streaming | Frontend via Channel, process/ | **NEW** |
| `terminal/parser.rs` | Output analysis, state detection | terminal/session.rs | **NEW** |
| `commands/terminal_commands.rs` | Tauri command layer for terminals | terminal/, lib.rs | **NEW** |
| `commands/file_commands.rs` | File read/write for editors | config/, lib.rs | **NEW** |
| `process/launch.rs` | Add embedded launch path | terminal/ | **MODIFIED** |
| `process/detect.rs` | Merge embedded + external detection | terminal/ | **MODIFIED** |
| `commands/session_commands.rs` | Add embedded flag to launch | terminal/, process/ | **MODIFIED** |
| `lib.rs` | Register new state + commands | All new modules | **MODIFIED** |
| `watcher/` | Add Claude log watching | terminal/parser.rs | **MODIFIED** |
| `TerminalPanel.tsx` | xterm.js rendering | terminal-store | **NEW** |
| `TerminalTabs.tsx` | Multi-terminal tab management | terminal-store | **NEW** |
| `CodeEditor.tsx` | CodeMirror wrapper | editor-store | **NEW** |
| `MarkdownEditor.tsx` | CLAUDE.md editing | editor-store, file commands | **NEW** |
| `SessionView.tsx` | Combined terminal + editor page | terminal-store, editor-store | **NEW** |
| `terminal-store.ts` | Terminal state management | Tauri invoke + Channel | **NEW** |
| `editor-store.ts` | Editor state management | Tauri invoke | **NEW** |

## Patterns to Follow

### Pattern 1: Channel-per-Terminal

Each spawned terminal gets its own Tauri Channel. The frontend creates the Channel before invoking `terminal_spawn`, passing it as a parameter. This matches how Tauri internally handles streaming.

```typescript
// Frontend
const onEvent = new Channel<TerminalEvent>();
onEvent.onmessage = (event) => {
  switch (event.type) {
    case 'Data':
      terminal.write(event.data);
      break;
    case 'StateChange':
      updateSessionState(id, event.state);
      break;
    case 'Exit':
      handleTerminalExit(id, event.code);
      break;
  }
};

const id = await invoke('terminal_spawn', {
  workingDir: worktreePath,
  cols: terminal.cols,
  rows: terminal.rows,
  onEvent,
});
```

### Pattern 2: Managed State with Interior Mutability

Follow existing pattern from `SessionDetector` — wrap `TerminalManager` in `Mutex<T>` and register as managed state. This works because terminal operations are fast (write bytes, check state) and don't hold the lock during I/O.

The PTY read loop runs on a separate `std::thread` (not holding the mutex), and sends data through the Channel directly.

```rust
// In lib.rs setup
.manage(std::sync::Mutex::new(terminal::TerminalManager::new()))
```

### Pattern 3: Graceful Degradation for Session Detection

The session store should merge data from three sources:
1. Embedded terminals (known directly, highest confidence)
2. JSONL log parsing (structured data, medium confidence)
3. Process polling via sysinfo (existing, lowest confidence — catches external launches)

```typescript
// Enhanced session-store.ts
interface SessionInfo {
  source: 'embedded' | 'log' | 'process';
  state: SessionState;
  terminalId?: string;  // Only for embedded
  pid?: number;         // For process-detected
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: WebSocket Server Inside Desktop App
**What:** Running a localhost WebSocket server for terminal I/O
**Why bad:** Unnecessary complexity, security surface (open port), port conflicts, connection management. Tauri Channels do the same thing with zero setup.
**Instead:** Use Tauri Channel API for all streaming data.

### Anti-Pattern 2: Holding Mutex During PTY I/O
**What:** Locking TerminalManager mutex while reading from PTY
**Why bad:** PTY reads are blocking — would freeze all terminal operations. Writes from other terminals would queue behind the read.
**Instead:** PTY read loop runs on a dedicated thread per terminal. Only locks the manager briefly to look up session metadata or update state. Channel sends happen outside the lock.

### Anti-Pattern 3: Synchronous Output Parsing
**What:** Parsing output in the PTY read loop before forwarding to frontend
**Why bad:** Adds latency to terminal display. Pattern matching on every chunk slows rendering.
**Instead:** Tee the output — send raw data to frontend immediately, parse asynchronously on a separate path. Users see output instantly; state detection can be slightly delayed.

### Anti-Pattern 4: Monaco for Config Editing
**What:** Using Monaco editor for JSON/Markdown editing
**Why bad:** 5-10MB bundle for editing config files. Grove's lightweight constraint violated. Monaco is designed for full IDE experiences, not config editing.
**Instead:** CodeMirror 6 with selective language imports (~300KB).

### Anti-Pattern 5: Relying Solely on PTY Output for State
**What:** Using only terminal output heuristics for session state
**Why bad:** Claude Code's output format is not stable. Updates will break patterns. ANSI sequences complicate parsing.
**Instead:** Hybrid approach — PTY output for real-time hints, JSONL logs for ground truth correction.

## Dependency Graph and Build Order

Build order follows dependency arrows. Each layer depends only on layers above it.

```
Layer 1 (Foundation - no new deps on each other):
  [A] terminal/pty.rs        -- portable-pty wrapper, spawn/resize/kill
  [B] commands/file_commands  -- read_file, write_file (simple fs ops)
  [C] CodeEditor.tsx          -- @uiw/react-codemirror wrapper component

Layer 2 (Needs Layer 1):
  [D] terminal/session.rs     -- Uses [A] for PTY management
  [E] terminal/commands.rs    -- Uses [D] for Tauri command layer
  [F] TerminalPanel.tsx       -- xterm.js component + invoke terminal_write
  [G] JsonEditor.tsx          -- Uses [C] with JSON language mode
  [H] MarkdownEditor.tsx      -- Uses [C] with Markdown mode + preview

Layer 3 (Needs Layer 2):
  [I] terminal/parser.rs      -- Output parsing, wired into [D]'s read loop
  [J] TerminalTabs.tsx         -- Uses [F], manages multiple instances
  [K] terminal-store.ts       -- Uses [E] commands, connects [F] to backend
  [L] editor-store.ts         -- Uses [B] commands, manages [G]/[H] state

Layer 4 (Integration - needs Layer 3):
  [M] process/launch.rs mod   -- Add embedded path using [D]
  [N] process/detect.rs mod   -- Merge embedded + external detection
  [O] SessionView.tsx          -- Combines [J] + [H] in a page layout
  [P] session-store.ts mod    -- Merge terminal-store data with existing

Layer 5 (Polish):
  [Q] watcher/ claude_logs    -- JSONL log watching for state correction
  [R] Dashboard integration   -- Session badges, status indicators
```

### Suggested Phase Structure

**Phase 1: Terminal Foundation** (Layers 1A + 2D + 2E + 2F + 3K)
- portable-pty integration, basic spawn/write/read
- xterm.js component rendering terminal output
- Channel-based streaming working end-to-end
- Single terminal, no tabs yet
- *This is the riskiest phase — ConPTY + portable-pty on Windows needs validation*

**Phase 2: Multi-Terminal + State Detection** (Layers 3I + 3J + 4M + 4N)
- Tab management for multiple terminals
- Output parsing pipeline
- Embedded launch path in existing session system
- Merged session detection (embedded + external)

**Phase 3: Editors** (Layers 1B + 1C + 2G + 2H + 3L)
- CodeMirror integration
- CLAUDE.md editor with preview
- Settings.json editor
- File read/write commands

**Phase 4: Integration** (Layers 4O + 4P + 5Q + 5R)
- SessionView page (terminal + editor side-by-side)
- Dashboard status badges from parsed state
- JSONL log watching for state correction
- Full session lifecycle management

## New Dependencies Required

### Rust (Cargo.toml additions)

| Crate | Version | Purpose |
|-------|---------|---------|
| `portable-pty` | `0.9.0` | PTY management (ConPTY on Windows) |
| `strip-ansi-escapes` | `0.2` | ANSI escape removal for output parsing |
| `regex` | `1` | Pattern matching in output parser |

### Frontend (package.json additions)

| Package | Purpose |
|---------|---------|
| `@xterm/xterm` | Terminal emulator UI (v5.x, scoped package) |
| `@xterm/addon-fit` | Auto-resize terminal to container |
| `@xterm/addon-webgl` | GPU-accelerated rendering (optional, for performance) |
| `@xterm/addon-web-links` | Clickable URLs in terminal output |
| `@uiw/react-codemirror` | CodeMirror 6 React wrapper |
| `@codemirror/lang-json` | JSON language support |
| `@codemirror/lang-markdown` | Markdown language support |

### Tauri Capabilities (default.json additions)

No new Tauri plugin permissions needed — PTY operations go through custom commands, file operations through custom commands. The existing `core:default` permission covers invoke().

## Scalability Considerations

| Concern | 1-3 Terminals | 5-10 Terminals | 20+ Terminals |
|---------|--------------|----------------|---------------|
| Memory | Minimal (~5MB per PTY) | Moderate (~50MB) | Need terminal recycling |
| Threads | 1 read thread per terminal | Thread pool consideration | Must cap max terminals |
| Channel throughput | No concern | No concern | Test for Channel contention |
| xterm.js DOM | Lightweight | May need virtualization | Only render active tab |
| Output parsing | Inline OK | Dedicated parse thread | Batch parsing, sampling |

**Recommendation:** Cap at 10 simultaneous embedded terminals. This matches the worktree use case (rarely >10 active branches). Offer "detach" to external terminal for overflow.

## Sources

- [portable-pty crate](https://crates.io/crates/portable-pty) — v0.9.0, Feb 2025
- [portable-pty docs](https://docs.rs/portable-pty) — MasterPty, Child, PtySize traits
- [portable-pty-psmux](https://lib.rs/crates/portable-pty-psmux) — Fork with ConPTY flags
- [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) — Reference implementation (not recommended for production)
- [marc2332/tauri-terminal](https://github.com/marc2332/tauri-terminal) — Reference Tauri terminal
- [Tauri 2 Channels API](https://v2.tauri.app/develop/calling-frontend/) — Official streaming docs
- [xterm.js](https://xtermjs.org/) — Terminal emulator library
- [xterm.js addons](https://xtermjs.org/docs/guides/using-addons/) — fit, webgl, web-links
- [react-xtermjs (Qovery)](https://github.com/Qovery/react-xtermjs) — React wrapper reference
- [@uiw/react-codemirror](https://uiwjs.github.io/react-codemirror/) — CodeMirror 6 React component
- [CodeMirror vs Monaco comparison](https://agenthicks.com/research/codemirror-vs-monaco-editor-comparison) — Bundle size analysis
- [Sourcegraph Monaco to CodeMirror migration](https://sourcegraph.com/blog/migrating-monaco-codemirror) — 43% JS size reduction
- [Claude Code JSONL log format](https://github.com/daaain/claude-code-log) — Log parsing reference
- [Claude Code status line](https://code.claude.com/docs/en/statusline) — Output format reference
- [Terminon](https://github.com/Shabari-K-S/terminon) — Full Tauri v2 terminal emulator reference
- [Tauri high-rate IPC discussion](https://github.com/tauri-apps/tauri/discussions/7146) — Performance characteristics
