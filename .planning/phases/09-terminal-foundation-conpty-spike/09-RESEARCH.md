# Phase 09: Terminal Foundation (ConPTY Spike) - Research

**Researched:** 2026-03-27
**Domain:** Windows ConPTY via portable-pty, xterm.js v6 terminal rendering, Tauri Channel streaming IPC
**Confidence:** MEDIUM-HIGH

## Summary

This phase integrates an embedded terminal into Grove, replacing external window launches with an in-app xterm.js terminal powered by portable-pty's ConPTY backend. The data path is: portable-pty spawns a ConPTY pseudo-terminal, a dedicated OS thread reads PTY output in a blocking loop, sends chunks via Tauri Channel to the frontend, where xterm.js v6 renders them. User keystrokes flow back via Tauri invoke commands.

The critical risk is the ConPTY spike itself: verifying that portable-pty 0.9.0 spawns ConPTY without a visible conhost/CMD window flash in release builds. Microsoft's own ConPTY documentation states "the hosting window is not created" when using pseudoconsoles -- the process gets a headless conhost. However, one open (unresolved) GitHub issue reports a visible window when using portable-pty 0.8.1 with Tauri. The spike must determine whether this is a real portable-pty issue, a Tauri subsystem interaction issue, or a configuration problem on the reporter's machine. Grove already sets `windows_subsystem = "windows"` in release builds, which means no parent console exists -- ConPTY should create a headless conhost in this scenario.

**Primary recommendation:** Build the ConPTY spike first as a minimal Tauri command that spawns a PTY with `cmd.exe /c echo hello`, verifies no visible window, and streams output through a Channel to a basic xterm.js div. Only proceed with full terminal integration after this spike passes in a release build.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- portable-pty 0.9.0 for PTY (direct, not tauri-plugin-pty -- need raw stream access for future state detection)
- @xterm/xterm 6.0 for terminal rendering in React
- Tauri Channels (NOT events) for PTY I/O streaming -- events panic under throughput
- Dedicated OS thread per terminal for blocking PTY reads
- UNC-to-drive-letter resolution before PTY spawn (reuse existing v1.1 utility)
- CREATE_NO_WINDOW on PTY process creation
- Split view: existing dashboard on left, terminal pane on right
- Resizable pane divider
- Terminal replaces external window launch -- clicking "Launch" opens terminal pane instead
- Single terminal tab for this phase (multi-tab in Phase 10)
- First task must validate portable-pty ConPTY on Windows release builds

### Claude's Discretion
- Exact terminal component implementation (custom hook vs wrapper)
- xterm.js addon selection (WebGL vs canvas fallback logic)
- Pane divider component choice
- Terminal toolbar design (if any)

### Deferred Ideas (OUT OF SCOPE)
- Multi-tab management (Phase 10)
- Session state detection/parsing (Phase 11)
- Process tree cleanup with Job Objects (Phase 10)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERM-01 | User can launch Claude Code in an embedded terminal tab instead of an external window | portable-pty spawn + xterm.js rendering + Channel streaming; launch button in BranchTable switches to embedded mode |
| TERM-04 | User can resize terminal panes (split view: branch list + terminal) | shadcn/ui Resizable component (react-resizable-panels); FitAddon resize propagation to PTY |
| TERM-05 | Terminal supports full ANSI rendering (colors, cursor movement, clearing) | xterm.js v6 natively handles ANSI; must set TERM=xterm-256color and COLORTERM=truecolor in PTY env |
| NFR-05 | Terminal I/O uses Tauri Channels (not events) for throughput | Tauri Channel API from `tauri::ipc::Channel`; JS `Channel` from `@tauri-apps/api/core` |
| NFR-06 | PTY operations resolve UNC paths to drive letters before spawning | Existing `get_drive_mappings()` + `resolve_unc_path()` in `git/branches.rs` |
| NFR-07 | No visible CMD windows from PTY operations (CREATE_NO_WINDOW) | ConPTY spike validates this; portable-pty uses `EXTENDED_STARTUPINFO_PRESENT` which may be sufficient |
| NFR-08 | Terminal rendering at 60fps with WebGL addon fallback to canvas | WebGL addon with onContextLoss fallback to DOM renderer (canvas renderer removed in v6) |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `portable-pty` | 0.9.0 | Spawn ConPTY pseudo-terminals on Windows | Part of wezterm project, 4.7M+ downloads, only production-grade Rust PTY crate |
| `@xterm/xterm` | 6.0.0 | Terminal emulation in WebView2 | Industry standard (VS Code, Hyper); v6 dropped 30% bundle size |
| `@xterm/addon-fit` | 0.11.0 | Auto-resize terminal to container dimensions | Required for responsive split-pane layout |
| `@xterm/addon-webgl` | 0.19.0 | GPU-accelerated terminal rendering | Smooth scrolling for fast Claude Code output; DOM fallback available |
| `@xterm/addon-web-links` | 0.12.0 | Clickable URLs in terminal output | Claude Code outputs file paths and URLs |
| `react-resizable-panels` | 4.8.0 | Resizable split-pane layout | Powers shadcn/ui Resizable component; already in shadcn ecosystem |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `strip-ansi-escapes` | 0.2.x | Strip ANSI from PTY output for future parsing | Phase 11 (session detection), not needed yet but architecture should accommodate |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| portable-pty | tauri-plugin-pty v0.1.1 | Plugin wraps portable-pty but abstracts away raw stream access needed for future output parsing |
| portable-pty | direct windows-rs ConPTY API | Full control but much more code; use as fallback if spike fails |
| Custom useTerminal hook | react-xtermjs wrapper | Wrappers lag behind xterm.js v6 breaking changes; custom hook is ~50 lines |
| react-resizable-panels | Custom CSS resize | shadcn already uses react-resizable-panels; well-tested edge cases |

**Installation:**

Rust (add to src-tauri/Cargo.toml):
```toml
portable-pty = "0.9"
```

Frontend (add to src-ui/):
```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links
npx shadcn@latest add resizable
```

Note: `react-resizable-panels` is installed automatically by the shadcn resizable component.

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/src/
  terminal/
    mod.rs              -- Public API, TerminalManager struct
    pty.rs              -- portable-pty wrapper: spawn, resize, write, kill
    commands.rs         -- Tauri command handlers: terminal_spawn, terminal_write, terminal_resize, terminal_kill
  commands/
    session_commands.rs -- Modified: launch_session gains embedded path

src-ui/src/
  components/
    terminal/
      TerminalPanel.tsx    -- xterm.js terminal with useTerminal hook
      TerminalToolbar.tsx  -- Minimal toolbar (branch name, close button)
  hooks/
    useTerminal.ts         -- xterm.js lifecycle: create, mount, fit, dispose
  stores/
    terminal-store.ts      -- Active terminal state, channel management
  pages/
    Dashboard.tsx          -- Modified: wraps content in ResizablePanelGroup
```

### Pattern 1: Tauri Channel for PTY Streaming

**What:** Each terminal gets its own Tauri Channel created on the JS side, passed to Rust via invoke, used for ordered data delivery.
**When to use:** Always for PTY output. Never use Tauri events for this -- they panic under throughput.

Rust side:
```rust
// Source: https://v2.tauri.app/develop/calling-frontend/
// Source: https://docs.rs/tauri/latest/tauri/ipc/struct.Channel.html
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
enum TerminalEvent {
    Data { data: String },
    Exit { code: Option<u32> },
    Error { message: String },
}

#[tauri::command]
fn terminal_spawn(
    working_dir: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    manager: tauri::State<'_, std::sync::Mutex<TerminalManager>>,
) -> Result<String, String> {
    // 1. Resolve UNC paths
    // 2. Create PTY pair via portable-pty
    // 3. Spawn shell + claude in PTY
    // 4. Start reader thread that sends data via on_event.send()
    // 5. Return terminal ID
}
```

JavaScript side:
```typescript
// Source: https://v2.tauri.app/develop/calling-frontend/
import { invoke, Channel } from '@tauri-apps/api/core';

const onEvent = new Channel<TerminalEvent>();
onEvent.onmessage = (event) => {
  switch (event.type) {
    case 'Data':
      terminal.write(event.data);
      break;
    case 'Exit':
      handleExit(event.code);
      break;
    case 'Error':
      handleError(event.message);
      break;
  }
};

const terminalId = await invoke('terminal_spawn', {
  workingDir: worktreePath,
  cols: terminal.cols,
  rows: terminal.rows,
  onEvent,
});
```

**Confidence:** HIGH -- Tauri docs explicitly state Channels are "designed to be fast and deliver ordered data" and "used internally for streaming operations such as child process output."

### Pattern 2: Dedicated OS Thread per Terminal

**What:** Each terminal's PTY read loop runs on a `std::thread::spawn` thread, not an async task.
**When to use:** Always. portable-pty's `MasterPty::try_clone_reader()` returns a blocking `Read` impl. Running on async runtime starves other operations.

```rust
// PTY reader thread pattern
let reader = master.try_clone_reader().unwrap();
let channel = on_event.clone();

std::thread::spawn(move || {
    let mut reader = std::io::BufReader::new(reader);
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = channel.send(TerminalEvent::Exit { code: None });
                break;
            }
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                if channel.send(TerminalEvent::Data { data }).is_err() {
                    break; // Channel closed (frontend disconnected)
                }
            }
            Err(e) => {
                let _ = channel.send(TerminalEvent::Error { message: e.to_string() });
                break;
            }
        }
    }
});
```

**Confidence:** HIGH -- standard pattern, matches existing Grove architecture (std threads, not tokio).

### Pattern 3: useTerminal React Hook

**What:** Custom hook managing xterm.js Terminal instance lifecycle in React.
**When to use:** For the TerminalPanel component. No wrapper library needed.

```typescript
// Source: xterm.js v6 API + React integration pattern
import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export function useTerminal(containerRef: React.RefObject<HTMLDivElement>, options: UseTerminalOptions) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      theme: {
        background: '#0a0a0a',  // Match Grove void
        foreground: '#e0e0e0',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Try WebGL, fall back to DOM renderer
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        // DOM renderer is the automatic fallback when no renderer addon is active
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, DOM renderer used automatically
    }

    terminal.open(containerRef.current);

    // Delay first fit to ensure container has dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
      options.onResize(terminal.cols, terminal.rows);
    });

    terminal.onData(options.onData);

    termRef.current = terminal;
    fitRef.current = fitAddon;

    // ResizeObserver for container dimension changes
    const observer = new ResizeObserver(() => {
      // Debounce fit to avoid rapid-fire during drag resize
      requestAnimationFrame(() => {
        if (fitRef.current && containerRef.current) {
          fitRef.current.fit();
          if (termRef.current) {
            options.onResize(termRef.current.cols, termRef.current.rows);
          }
        }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      terminal.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);  // Only run once on mount

  const write = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  return { terminal: termRef, write };
}
```

**Confidence:** HIGH -- standard React pattern, xterm.js v6 API verified.

### Pattern 4: Resizable Split Pane with shadcn

**What:** Dashboard wraps content in ResizablePanelGroup for left (branch table) / right (terminal) split.
**When to use:** When terminal is active for current project.

```typescript
// shadcn/ui Resizable component (wraps react-resizable-panels v4.8.0)
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

// In Dashboard.tsx - conditional split when terminal is open
{activeTerminal ? (
  <ResizablePanelGroup direction="horizontal" className="flex-1">
    <ResizablePanel defaultSize={50} minSize={30}>
      {/* Existing branch table content */}
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize={50} minSize={30}>
      <TerminalPanel terminalId={activeTerminal} />
    </ResizablePanel>
  </ResizablePanelGroup>
) : (
  /* Existing full-width branch table */
)}
```

**Confidence:** HIGH -- shadcn/ui Resizable is a standard component backed by react-resizable-panels (verified v4.8.0 current).

### Anti-Patterns to Avoid

- **Using Tauri events for PTY data:** Events use `webview.eval(js)` per message. At hundreds of events/second, WebView2 chokes. Use Channels exclusively.
- **Holding Mutex during PTY I/O:** PTY reads are blocking -- would freeze all terminal operations. Reader thread must operate outside the lock, only briefly locking TerminalManager to look up session metadata.
- **Calling FitAddon.fit() on hidden containers:** Returns zero dimensions, terminal collapses to 1 column. Use `requestAnimationFrame` + `ResizeObserver` to ensure container is visible.
- **Passing UNC paths as PTY working directory:** Windows fundamentally cannot use `\\server\share\...` as cwd. Always resolve to drive letter first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulation | Custom ANSI parser + canvas renderer | @xterm/xterm v6 | Thousands of edge cases in terminal escape sequences |
| Resizable split pane | Custom drag-resize with mouse events | shadcn Resizable (react-resizable-panels) | Keyboard accessibility, min/max constraints, persistence |
| PTY on Windows | Direct CreatePseudoConsole calls | portable-pty | Cross-platform abstraction, handle management, pipe setup |
| WebGL rendering fallback | Custom canvas renderer | @xterm/addon-webgl with onContextLoss | Handles GPU driver quirks, context loss recovery |
| UNC path resolution | New UNC resolver | Existing `get_drive_mappings()` + `resolve_unc_path()` | Already tested, handles all edge cases with `net use` |

**Key insight:** The terminal stack (portable-pty + xterm.js + Channels) is well-established in the ecosystem. The risk is not in the individual pieces but in their integration on Windows with WebView2 -- which is exactly what the ConPTY spike validates.

## Common Pitfalls

### Pitfall 1: ConPTY Visible Window Flash (THE GATING RISK)
**What goes wrong:** A visible cmd.exe/conhost window briefly appears when spawning a PTY in a release build.
**Why it happens:** ConPTY creates a conhost.exe process to host the pseudo-console. In theory, this conhost is headless when the parent process has no console (which is the case for Grove's `windows_subsystem = "windows"` release builds). However, one open GitHub issue (wezterm #6946) reports this happening with portable-pty 0.8.1 + Tauri, though the issue remains unresolved and undiagnosed.
**How to avoid:** The spike must test in a release build (`cargo tauri build`). If a visible window appears, the mitigation path is: (1) check if portable-pty 0.9.0 (newer than the reporter's 0.8.1) has fixed it, (2) try adding `CREATE_NO_WINDOW` flag to the spawn -- portable-pty's CreateProcessW uses `EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT` and these flags may be OR-compatible with `CREATE_NO_WINDOW`, (3) fork portable-pty's `psuedocon.rs` to add the flag, (4) use direct windows-rs ConPTY APIs as last resort.
**Warning signs:** Visible window in release build. NOT visible in dev builds (dev mode has a console attached already).
**Confidence:** MEDIUM -- the theoretical answer is "ConPTY should be headless" but one report contradicts this. Must verify empirically.

### Pitfall 2: UNC Paths as PTY Working Directory
**What goes wrong:** Terminals for NAS-hosted worktrees fail silently -- shell can't `cd` to `\\server\share\...`.
**Why it happens:** Windows cmd.exe and PowerShell reject UNC paths as working directories.
**How to avoid:** Reuse existing `get_drive_mappings()` + `resolve_unc_path()` from `git/branches.rs`. Apply before calling `CommandBuilder::cwd()`. Reject paths that still start with `\\` after resolution.
**Warning signs:** Empty/broken terminal when opening NAS-hosted branches. Terminal works for local paths.
**Confidence:** HIGH -- known from v1.0/v1.1 experience, utility already exists.

### Pitfall 3: FitAddon Wrong Dimensions in WebView2
**What goes wrong:** Terminal renders at wrong size (width=1 column) or has phantom scrollbars after resize/tab-switch.
**Why it happens:** FitAddon measures container DOM dimensions which can return stale/zero values during WebView2 transitions.
**How to avoid:** (1) Use `ResizeObserver` on terminal container, (2) call `fit()` inside `requestAnimationFrame`, (3) never fit a hidden container, (4) after fit, propagate `{cols, rows}` back to PTY via `terminal_resize` command.
**Warning signs:** Text wraps incorrectly after window resize. Rapid resize causes terminal collapse.
**Confidence:** HIGH -- documented in xterm.js issues #4841, #3584, #5320.

### Pitfall 4: PTY Read Blocking Starves Other Operations
**What goes wrong:** If PTY reads run on async tasks, they block tokio worker threads and freeze the app.
**Why it happens:** portable-pty's `MasterPty::read()` is a blocking system call (`ReadFile` on Windows pipe).
**How to avoid:** Use `std::thread::spawn` for each terminal's read loop. This matches Grove's existing pattern (std threads, not tokio). Communicate back via Channel.send() which is thread-safe.
**Warning signs:** UI freezes when terminal has high output (e.g., `cargo build --verbose`).
**Confidence:** HIGH -- standard Rust async pitfall, well-documented.

### Pitfall 5: ConPTY Missing Environment Variables
**What goes wrong:** Terminal doesn't render colors, clear screen shows `^[`, backspace shows `^H`.
**Why it happens:** PTY environment doesn't include TERM/COLORTERM variables needed for proper terminal emulation.
**How to avoid:** Explicitly set on CommandBuilder: `TERM=xterm-256color`, `COLORTERM=truecolor`. Also inherit `PATH`, `HOME`/`USERPROFILE`, `SystemRoot` from parent environment.
**Warning signs:** Colors missing, control characters visible as text, `clear` command doesn't work.
**Confidence:** HIGH -- standard terminal configuration requirement.

## Code Examples

### portable-pty Spawn on Windows

```rust
// Source: https://docs.rs/portable-pty/0.9.0/portable_pty/
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

fn spawn_terminal(working_dir: &str, cols: u16, rows: u16) -> Result<(PtyPair, Box<dyn Child>), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new("cmd.exe");
    cmd.args(["/c", "claude"]);
    cmd.cwd(working_dir);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    Ok((pair, child))
}
```

### Tauri Channel Setup (Complete)

```rust
// Source: https://v2.tauri.app/develop/calling-frontend/
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum TerminalEvent {
    Data { data: String },
    Exit { code: Option<u32> },
    Error { message: String },
}

#[tauri::command]
fn terminal_spawn(
    working_dir: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    manager: tauri::State<'_, std::sync::Mutex<crate::terminal::TerminalManager>>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();

    // Resolve UNC path
    let mappings = crate::git::branches::get_drive_mappings();
    let resolved_dir = crate::git::branches::resolve_unc_path(&working_dir, &mappings);

    // Spawn PTY + reader thread
    // (implementation delegates to terminal module)

    Ok(id)
}
```

Note: `get_drive_mappings` and `resolve_unc_path` are currently private in `git/branches.rs`. They need to be made `pub(crate)` or extracted to a shared utility module.

### xterm.js CSS Import (v6)

```typescript
// CRITICAL: xterm.js v6 requires explicit CSS import
// The CSS file path is: @xterm/xterm/css/xterm.css
// Import in the terminal component or in a global CSS file
import '@xterm/xterm/css/xterm.css';
```

### WebGL Fallback Pattern

```typescript
// Source: https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl
import { WebglAddon } from '@xterm/addon-webgl';

function loadWebGLWithFallback(terminal: Terminal) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      // WebGL context lost (GPU driver issue, system suspend, etc.)
      // Disposing falls back to DOM renderer automatically
      webgl.dispose();
    });
    terminal.loadAddon(webgl);
  } catch (e) {
    // WebGL2 not available in this WebView2 instance
    // DOM renderer is used automatically -- no action needed
    console.warn('WebGL addon failed to load, using DOM renderer:', e);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` npm package | `@xterm/xterm` scoped package | xterm.js v5.4+ / v6.0 | Old package deprecated, must use scoped imports |
| Canvas renderer addon | WebGL or DOM renderer | xterm.js v6.0 (Dec 2025) | Canvas renderer removed entirely in v6 |
| Tauri events for streaming | Tauri Channels | Tauri 2.0 | Events panic under high throughput |
| EventEmitter API | New Emitter pattern | xterm.js v6.0 | Breaking change in event handling |

**Deprecated/outdated:**
- `xterm` npm package (use `@xterm/xterm`)
- `@xterm/addon-canvas` (removed in v6, use WebGL or DOM)
- `tauri::Emitter` for high-throughput data (use `tauri::ipc::Channel`)

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` / Frontend: manual validation (spike phase) |
| Config file | src-tauri/Cargo.toml (test target) |
| Quick run command | `cargo test -p grove --lib terminal` |
| Full suite command | `cargo test -p grove` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | Embedded terminal launches Claude Code | integration/manual | Manual: click Launch, verify terminal opens | N/A (spike) |
| TERM-04 | Resizable split pane | manual | Manual: drag divider, verify both panes resize | N/A |
| TERM-05 | Full ANSI rendering | manual | Manual: run `ls --color`, `clear`, arrow keys in terminal | N/A |
| NFR-05 | Channel streaming (not events) | unit | `cargo test -p grove --lib terminal::tests::channel_streaming` | Wave 0 |
| NFR-06 | UNC path resolution before spawn | unit | `cargo test -p grove --lib terminal::tests::unc_resolution` | Wave 0 |
| NFR-07 | No visible CMD windows | manual/release | Manual: `cargo tauri build`, run, launch terminal, observe | N/A |
| NFR-08 | 60fps with WebGL fallback | manual | Manual: verify WebGL loads, fast scrolling works | N/A |

### Sampling Rate
- **Per task commit:** `cargo test -p grove --lib terminal`
- **Per wave merge:** `cargo test -p grove` + manual terminal test
- **Phase gate:** Full suite green + manual ConPTY spike passes in release build

### Wave 0 Gaps
- [ ] `src-tauri/src/terminal/mod.rs` -- module structure, TerminalManager
- [ ] `src-tauri/src/terminal/tests.rs` -- unit tests for UNC resolution, channel basic operations
- [ ] ConPTY spike manual test procedure documented

## Open Questions

1. **ConPTY visible window in release builds**
   - What we know: Microsoft docs say ConPTY creates headless conhost. Grove uses `windows_subsystem = "windows"` (no parent console). One unresolved report (wezterm #6946, v0.8.1) says otherwise.
   - What's unclear: Whether the issue is portable-pty version-specific (0.8.1 vs 0.9.0), reporter configuration-specific, or a real ConPTY behavior.
   - Recommendation: Spike it. If window appears, try `CREATE_NO_WINDOW` flag OR-ed with existing creation flags. Note: Microsoft docs only show `EXTENDED_STARTUPINFO_PRESENT` for ConPTY -- adding `CREATE_NO_WINDOW` may conflict (CREATE_NO_WINDOW docs say "redirection is ignored" for processes with this flag). Test empirically.

2. **portable-pty ConPTY flags (PSEUDOCONSOLE_RESIZE_QUIRK, etc.)**
   - What we know: portable-pty 0.9.0 does NOT pass PSEUDOCONSOLE_RESIZE_QUIRK or PSEUDOCONSOLE_WIN32_INPUT_MODE. The `portable-pty-psmux` fork adds these.
   - What's unclear: Whether missing flags cause issues with xterm.js (clear screen, backspace, arrow keys).
   - Recommendation: Start with vanilla portable-pty 0.9.0. If terminal behavior is broken (^H for backspace, arrow keys show escape sequences), evaluate the psmux fork.

3. **UNC path utility extraction**
   - What we know: `get_drive_mappings()` and `resolve_unc_path()` are private functions in `git/branches.rs`.
   - What's unclear: Best way to share -- make pub(crate), or extract to a `utils/` module?
   - Recommendation: Extract to `src-tauri/src/utils/paths.rs` as pub(crate) functions. Both git and terminal modules need them.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| portable-pty crate | PTY backend | Needs install | 0.9.0 (from crates.io) | -- |
| @xterm/xterm | Terminal rendering | Needs install | 6.0.0 (from npm) | -- |
| react-resizable-panels | Split pane | Needs install | 4.8.0 (via shadcn) | -- |
| WebView2 | Tauri runtime | Installed | (bundled with Tauri) | -- |
| ConPTY API | Windows PTY | Available | Windows 10 1809+ | -- |
| cmd.exe / PowerShell | Shell for PTY | Available | System | -- |
| git CLI | UNC resolution (net use) | Available | System | -- |

**Missing dependencies with no fallback:** None -- all dependencies are installable.

**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

- **GSD workflow:** Must enter work through GSD command before file changes
- **Development commands:** `cargo tauri dev` for dev, `cargo tauri build` for release testing
- **Architecture:** Tauri 2 + React 19 + TypeScript + Tailwind CSS + Zustand + shadcn/ui
- **Branch strategy:** main (releases), develop (active work)
- **Rust checks:** `cargo check`, `cargo test`, `cargo clippy`
- **Frontend checks:** `npm run typecheck`, `npm run lint`

## Sources

### Primary (HIGH confidence)
- [portable-pty CommandBuilder API](https://docs.rs/portable-pty/0.9.0/portable_pty/cmdbuilder/struct.CommandBuilder.html) -- full method listing
- [portable-pty crate docs](https://docs.rs/portable-pty/0.9.0/portable_pty/) -- PtySystem, PtyPair, MasterPty, SlavePty, PtySize
- [Tauri 2 Channel API](https://v2.tauri.app/develop/calling-frontend/) -- Channel creation, streaming, ordered delivery
- [Channel in tauri::ipc](https://docs.rs/tauri/latest/tauri/ipc/struct.Channel.html) -- Rust Channel struct
- [Microsoft: Creating a Pseudoconsole session](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session) -- official ConPTY docs, shows EXTENDED_STARTUPINFO_PRESENT only
- [xterm.js v6 releases](https://github.com/xtermjs/xterm.js/releases) -- v6.0.0 breaking changes
- [xterm.js WebGL addon](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl) -- onContextLoss API
- [shadcn/ui Resizable](https://ui.shadcn.com/docs/components/radix/resizable) -- component docs, uses react-resizable-panels

### Secondary (MEDIUM confidence)
- [wezterm/wezterm psuedocon.rs](https://github.com/wezterm/wezterm/blob/main/pty/src/win/psuedocon.rs) -- source confirms `EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT` (no CREATE_NO_WINDOW)
- [wezterm #6946](https://github.com/wezterm/wezterm/issues/6946) -- visible CMD window report (open, unresolved, v0.8.1)
- [portable-pty-psmux](https://lib.rs/crates/portable-pty-psmux) -- fork with ConPTY flags
- [xterm.js FitAddon issues](https://github.com/xtermjs/xterm.js/issues/4841) -- WebView2 resize problems

### Tertiary (LOW confidence)
- [Tauri #11446 discussion](https://github.com/tauri-apps/tauri/discussions/11446) -- terminal window flash reports
- [Tauri #10987](https://github.com/tauri-apps/tauri/issues/10987) -- event system panic under throughput

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified current, versions confirmed via npm/crates.io
- Architecture: HIGH -- Tauri Channel API well-documented, patterns match existing Grove code
- ConPTY spike risk: MEDIUM -- theory says it should work, one unresolved report says otherwise
- Pitfalls: HIGH -- well-documented across multiple sources

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable libraries, 30-day validity)
