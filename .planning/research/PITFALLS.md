# Domain Pitfalls: Embedded Terminals, Output Parsing, and File Editors in Tauri

**Domain:** Adding PTY terminals, session state detection, and config editors to existing Tauri 2 desktop app (Windows + NAS)
**Researched:** 2026-03-27
**Overall Confidence:** HIGH (most pitfalls verified through multiple sources, existing codebase experience, and documented issues)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken core functionality.

### Pitfall 1: ConPTY Spawning Flash-of-CMD-Window

**What goes wrong:** When portable-pty creates a ConPTY on Windows, a visible cmd.exe window briefly flashes on screen before the PTY takes over. This happens in release builds but not dev builds.
**Why it happens:** portable-pty's ConPTY implementation does not pass `CREATE_NO_WINDOW` by default. The upstream wezterm crate focuses on being a terminal emulator itself, so it wants visible windows.
**Consequences:** Users see flickering command windows every time a terminal tab opens. Looks broken and unprofessional.
**Prevention:** Use a patched fork of portable-pty or wrap the process creation with `CREATE_NO_WINDOW` (0x08000000) flag. Grove already uses `CREATE_NEW_CONSOLE` for external launches in `process/launch.rs` -- the embedded PTY path needs the opposite: suppress ALL visible windows. Test in release builds specifically, not just `cargo tauri dev`.
**Detection:** Only visible in `cargo tauri build` output, not dev mode. Always test release builds on real Windows.
**Phase:** Must be addressed in the first PTY integration phase. Cannot ship without this.
**Confidence:** HIGH -- documented in [wezterm issue #6946](https://github.com/wezterm/wezterm/issues/6946) and [Tauri discussion #11446](https://github.com/tauri-apps/tauri/discussions/11446).

### Pitfall 2: UNC Paths Cannot Be Working Directories for PTY

**What goes wrong:** When a worktree lives on a NAS (Z: mapped to `\\the-batman\mnt`), portable-pty may resolve the drive letter to its UNC path and try to `cd` into it. Windows fundamentally cannot use UNC paths as the current working directory.
**Why it happens:** Windows cmd.exe rejects `cd \\server\share\path`. If portable-pty or the shell resolves Z: to its UNC origin, the shell initialization fails silently or errors out.
**Consequences:** Terminals for NAS-hosted worktrees simply don't work. User sees empty/broken terminal. This affects the PRIMARY use case since Grove's developer runs repos from Z: drive.
**Prevention:**
1. Always resolve paths to drive letters before passing to PTY. Use `QueryDosDevice` or check if path starts with `\\` and map to known drive letters.
2. Set the `cwd` on the `CommandBuilder` to the drive-letter version, never the UNC version.
3. Existing code in v1.1.4 already handles UNC-to-drive-letter resolution -- reuse that same utility for PTY working directories.
4. Add an explicit startup test: if `cwd` starts with `\\`, reject and resolve before proceeding.
**Detection:** Will only manifest when testing with NAS-hosted repos. Test with Z: drive paths specifically.
**Phase:** First PTY phase. Must be solved before any terminal tab can work on NAS repos.
**Confidence:** HIGH -- known from v1.0/v1.1 experience. Windows docs confirm UNC cannot be cwd.

### Pitfall 3: Tauri Event System Cannot Handle PTY Throughput

**What goes wrong:** Using `app_handle.emit()` to stream PTY output to the frontend causes UI freezing, dropped data, and potential panics when output volume is high (e.g., `git log`, large compilation output, Claude Code verbose output).
**Why it happens:** Tauri's event system evaluates JavaScript directly and is not designed for high-throughput streaming. Under the hood it's essentially `webview.eval(js)` per event. At hundreds of events per second, the WebView chokes.
**Consequences:** Terminal becomes unresponsive during high-output operations. UI thread blocks. In extreme cases, events pile up and Tauri panics ([issue #10987](https://github.com/tauri-apps/tauri/issues/10987)).
**Prevention:** Use Tauri Channels instead of events for PTY data streaming. Channels are specifically designed for ordered, high-throughput data delivery and are what Tauri uses internally for child process output and download progress. Pattern:
```rust
// Backend: use tauri::ipc::Channel
#[tauri::command]
fn spawn_terminal(on_data: Channel<Vec<u8>>) { ... }
```
Additionally, batch PTY reads into chunks (e.g., accumulate for 16ms then flush) rather than emitting every individual read.
**Detection:** Test with `find / -name "*.rs"` or `cargo build --verbose` -- anything that produces large rapid output.
**Phase:** Must be the data transport architecture from day one. Retrofitting from events to channels is painful.
**Confidence:** HIGH -- Tauri docs explicitly warn against events for high-throughput. Channels documented at [v2.tauri.app/develop/calling-frontend](https://v2.tauri.app/develop/calling-frontend/).

### Pitfall 4: xterm.js FitAddon Resize Chaos in WebView2

**What goes wrong:** The xterm.js FitAddon calculates wrong dimensions in Tauri's WebView2, especially during window resize, tab switching, or when the container is initially hidden. Terminal renders at wrong size (often width=1 column) or has phantom scrollbars.
**Why it happens:** FitAddon measures the terminal container's DOM dimensions. In WebView2, layout calculations can return stale or zero values during transitions. When a terminal tab is hidden (display:none) and then shown, the container has zero dimensions when fit() runs. Browser zoom levels also break calculations.
**Consequences:** Terminal is unusable after resize or tab switch. Text wraps incorrectly, lines overlap, or terminal collapses to 1 column.
**Prevention:**
1. Debounce resize: use `ResizeObserver` on the terminal container, debounce to ~100ms, then call `fitAddon.fit()`.
2. Never call `fit()` on a hidden container. Use `requestAnimationFrame` or `IntersectionObserver` to detect when the terminal actually becomes visible.
3. After tab switch, wait one frame (`requestAnimationFrame`) before calling `fit()`.
4. After fit(), propagate the new dimensions back to the PTY via `pty.resize(cols, rows)` -- forgetting this causes the PTY's line buffer to mismatch xterm's display.
5. Lock browser zoom to 100% or compensate for devicePixelRatio in fit calculations.
**Detection:** Resize the window rapidly while terminal has content. Switch between terminal tabs. Start a terminal in a non-active tab.
**Phase:** Immediately when building the terminal tab UI. This is not a polish issue -- it's core functionality.
**Confidence:** HIGH -- documented extensively: [xterm.js #4841](https://github.com/xtermjs/xterm.js/issues/4841), [#3584](https://github.com/xtermjs/xterm.js/issues/3584), [#5320](https://github.com/xtermjs/xterm.js/issues/5320).

### Pitfall 5: PTY Cleanup on Tab Close Leaks Zombie Processes

**What goes wrong:** When a terminal tab is closed or the app exits, the PTY child process (and its entire process tree) keeps running. cmd.exe, powershell.exe, claude processes accumulate as zombies.
**Why it happens:** On Windows, closing a PTY handle does not automatically terminate the child process tree. `Child::kill()` only kills the immediate process, not its children. Claude Code spawns sub-processes (node, git, etc.) that form a process tree.
**Consequences:** System resources consumed by orphaned processes. User might have multiple hidden Claude sessions burning API credits. Stale processes hold file locks on worktree files, preventing git operations.
**Prevention:**
1. Use Windows Job Objects: create a job object, assign the PTY child to it, configure `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the job handle closes, the entire process tree dies.
2. On tab close: send CTRL_C_EVENT first, wait 2-3 seconds, then force-kill via job object.
3. On app exit: iterate all open PTYs and clean up. Register a `drop` handler or use Tauri's `on_exit` hook.
4. Track PIDs in the Rust state so the detect module can reconcile "expected" vs "actual" running processes.
**Detection:** Open 3 terminal tabs, close them, check Task Manager for orphaned cmd.exe/powershell/node processes.
**Phase:** Must be part of the initial PTY implementation, not added later. Process leak is invisible until it causes problems.
**Confidence:** HIGH -- standard Windows process management knowledge. Job objects are the canonical solution.

---

## Moderate Pitfalls

Cause significant bugs or poor UX but won't require full rewrites.

### Pitfall 6: ANSI Escape Sequence Contamination from Claude Code

**What goes wrong:** Claude Code output includes ANSI escape sequences that leak into parsed content. When trying to detect session state by parsing terminal output (e.g., looking for prompts, error messages, status indicators), raw ANSI codes corrupt the pattern matching.
**Why it happens:** Claude Code uses colored output, cursor control sequences, and status line updates. PowerLevel10k and other shell themes inject additional sequences. These get mixed into the raw PTY byte stream that Grove needs to parse for state detection.
**Consequences:** Session state detection fails or misidentifies states. Status shows "working" when actually "idle". ANSI codes appear as garbage in any text extraction (e.g., if showing last command output in dashboard).
**Prevention:**
1. Strip ANSI sequences with a regex before state parsing: `/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\(B/g`
2. But do NOT strip before sending to xterm.js -- xterm.js needs the raw sequences for rendering.
3. Fork the data stream: raw bytes go to xterm.js, stripped text goes to the state detection parser.
4. Use Claude Code's `--output-format stream-json` if available, which provides structured output without ANSI contamination.
5. Be aware that Claude Code can inject ANSI into commit messages and PR descriptions ([issue #32632](https://github.com/anthropics/claude-code/issues/32632)) -- any text extraction needs sanitization.
**Detection:** Run Claude Code with PowerLevel10k or Oh My Posh enabled. Check if state detection still works.
**Phase:** Session state detection phase. Design the dual-stream architecture from the start.
**Confidence:** MEDIUM-HIGH -- [Claude Code issue #5428](https://github.com/anthropics/claude-code/issues/5428) documents ANSI contamination. Stripping approach is standard but edge cases exist.

### Pitfall 7: CodeMirror 6 State vs React State Dual-Ownership

**What goes wrong:** Both CodeMirror and React try to own the document state. Updates from one get overwritten by the other, causing cursor jumps, lost edits, or infinite update loops.
**Why it happens:** CodeMirror 6 has its own state management (EditorState/EditorView with transactions). React has its own state (useState/Zustand). If you naively set CodeMirror's value from React state on every render, it replaces the entire document, resetting cursor position and undo history.
**Consequences:** Typing in the editor causes cursor to jump to end. Undo doesn't work. In worst case, edits are silently lost.
**Prevention:**
1. Use `@uiw/react-codemirror` wrapper which handles the bidirectional state correctly.
2. If building custom: React should NOT control CodeMirror's content. React provides initial value only. CodeMirror owns the document. Use CodeMirror's `updateListener` extension to sync changes OUT to React/Zustand for save operations.
3. For file save: read from CodeMirror's state (`view.state.doc.toString()`), don't rely on React state being in sync.
4. Never set `value` prop on re-render unless loading a completely new file.
**Detection:** Type in editor, check if cursor stays in place. Type, undo, check if undo works. Open file, edit, switch to another file, switch back, check if edits persisted.
**Phase:** CLAUDE.md editor phase. Architectural decision at the start of that phase.
**Confidence:** HIGH -- well-documented React+CodeMirror integration challenge. [Trevor Harmon's blog](https://thetrevorharmon.com/blog/advanced-state-management-with-react-and-codemirror/) is the canonical reference.

### Pitfall 8: ConPTY Missing Flags Break Terminal Behavior

**What goes wrong:** Clear screen doesn't work. Backspace shows `^H` instead of deleting. Arrow keys produce garbage. Colors don't render. Terminal feels broken even though PTY "works."
**Why it happens:** portable-pty's default ConPTY creation doesn't set `PSEUDOCONSOLE_RESIZE_QUIRK` or configure the TERM environment variable. Release builds may not inherit the development environment's terminal settings.
**Consequences:** Terminal appears fundamentally broken to users even though data flows correctly.
**Prevention:**
1. Set `TERM=xterm-256color` in the PTY's environment variables explicitly.
2. Use the patched portable-pty that passes ConPTY flags: `PSEUDOCONSOLE_RESIZE_QUIRK` (0x2), `PSEUDOCONSOLE_WIN32_INPUT_MODE` (0x4).
3. On Windows 11 22H2+, also pass `PSEUDOCONSOLE_PASSTHROUGH_MODE` (0x8) for proper cursor rendering.
4. Set `COLORTERM=truecolor` for full color support.
5. Test in release builds -- dev builds may inherit working terminal settings from the developer's shell.
**Detection:** Run `clear`, press backspace, use arrow keys, run `ls --color=auto` in the embedded terminal.
**Phase:** First PTY phase, during ConPTY setup.
**Confidence:** HIGH -- [portable-pty-psmux](https://lib.rs/crates/portable-pty-psmux) documents the exact flags needed.

### Pitfall 9: NAS Latency Makes File Watchers Fire Excessively or Not At All

**What goes wrong:** File system watchers on NAS-mounted drives either miss changes entirely (because SMB doesn't relay all change notifications) or fire hundreds of duplicate events (because SMB batches and replays notifications).
**Why it happens:** SMB is a "chatty protocol" where directory change notifications are unreliable across the network. The `notify` crate uses `ReadDirectoryChangesW` on Windows, which works well locally but degrades on SMB mounts. Rename operations often fire as separate delete+create pairs.
**Consequences:** CLAUDE.md editor shows stale content after external edit. Or the editor reloads frantically on every save due to duplicate notifications. File watcher CPU usage spikes on NAS paths.
**Prevention:**
1. Debounce aggressively for NAS paths (500ms+ vs 100ms for local). Detect NAS paths by checking if the path resolves to a UNC share.
2. For the CLAUDE.md editor: poll on focus/tab-switch rather than relying solely on file watchers. Compare file mtime + content hash before reloading.
3. Use `notify-debouncer-mini` (already in Cargo.toml) with increased timeout for NAS paths.
4. When saving from the editor, temporarily suppress the watcher for that file to avoid the save triggering a reload.
**Detection:** Edit CLAUDE.md externally while Grove's editor is open. Save from Grove's editor and check for double-reload. Test with NAS paths specifically.
**Phase:** Relevant for editor phases. Grove already has `notify` in use -- extend the existing debounce strategy.
**Confidence:** HIGH -- known from v1.0/v1.1 NAS experience. SMB notification unreliability is well-documented.

### Pitfall 10: Blocking PTY Reads Starve the Tokio Runtime

**What goes wrong:** `portable-pty`'s `MasterPty::read()` is a blocking system call. If run on a tokio async task, it blocks one of the runtime's worker threads. With multiple terminals, the entire async runtime can be starved.
**Why it happens:** ConPTY reads use `ReadFile` on a pipe handle, which is a blocking Win32 call. portable-pty doesn't provide async readers. Naively wrapping in `tokio::spawn` puts blocking work on the async executor.
**Consequences:** Other async operations (git commands, file watching, IPC) stall while PTY reads block worker threads. App becomes unresponsive when multiple terminals are open.
**Prevention:**
1. Use `tokio::task::spawn_blocking` for PTY reads, not `tokio::spawn`.
2. Or better: dedicate a `std::thread` per terminal for the read loop, communicating via `tokio::sync::mpsc` channels back to the async world.
3. Size the thread pool appropriately. With N terminal tabs, expect N blocking reader threads.
4. Consider a limit on simultaneous terminal tabs (e.g., 8) to cap resource usage.
**Detection:** Open 4+ terminals, run long-running commands in all of them, check if the UI (git status updates, file watcher) remains responsive.
**Phase:** First PTY phase. Architecture decision that's hard to change later.
**Confidence:** HIGH -- discussed in [wezterm discussion #3739](https://github.com/wezterm/wezterm/discussions/3739). Standard Rust async pitfall.

---

## Minor Pitfalls

Cause small bugs or annoyances. Easy to fix but worth knowing upfront.

### Pitfall 11: xterm.js WebGL Renderer Crashes on Some Integrated GPUs

**What goes wrong:** The WebGL2 renderer addon for xterm.js, which improves rendering performance, crashes or produces garbled output on Intel integrated GPUs (common in laptops).
**Why it happens:** WebGL2 in WebView2 has driver-specific quirks. Some Intel UHD drivers have bugs with the texture atlas xterm.js uses.
**Prevention:** Use the Canvas renderer by default. Only enable WebGL renderer as an opt-in setting. Catch WebGL context creation failures and fall back gracefully.
**Phase:** Terminal UI polish phase, not initial implementation.

### Pitfall 12: Large CLAUDE.md Files Cause Editor Jank

**What goes wrong:** CLAUDE.md files with extensive instructions (500+ lines) cause the CodeMirror editor to lag on initial load and when scrolling, especially with markdown syntax highlighting and live preview.
**Prevention:** Use CodeMirror's viewport-based rendering (it does this by default). Disable live preview for files over a threshold (e.g., 200 lines). Load editor content asynchronously, show a loading skeleton first. Consider lazy-loading the CodeMirror bundle itself since it adds ~300KB.

### Pitfall 13: Shell Profile Scripts Break PTY Initialization

**What goes wrong:** The user's PowerShell profile (`$PROFILE`) or `.bashrc` outputs text, changes the prompt format, or sets environment variables that conflict with Grove's assumptions about terminal state.
**Prevention:** Option to launch with `-NoProfile` (PowerShell) or `--norc` (bash). Or: always detect the initial prompt after profile execution completes before marking the terminal as "ready." Provide a "clean shell" option in settings.

### Pitfall 14: Copy/Paste in xterm.js Requires Explicit Setup

**What goes wrong:** Ctrl+C doesn't copy (it sends SIGINT). Ctrl+V doesn't paste. Right-click context menu doesn't appear. Users expect standard Windows clipboard behavior.
**Prevention:** xterm.js needs explicit clipboard handling. Bind Ctrl+Shift+C for copy, Ctrl+Shift+V for paste (matching Windows Terminal convention). Or use selection-based auto-copy. Configure `rightClickSelectsWord` option. Integrate with Tauri's clipboard APIs for cross-platform correctness.

### Pitfall 15: Terminal Tab State Lost on Window Hide/Show

**What goes wrong:** When Grove minimizes to system tray and restores, terminal tabs lose their scrollback, cursor position, or connection to the PTY.
**Why it happens:** WebView2 may discard DOM state for hidden windows to save memory. xterm.js's internal buffer survives, but the rendered view doesn't reconnect properly.
**Prevention:** Keep the WebView alive when minimized (don't destroy the window, just hide it). On show, call `terminal.refresh(0, terminal.rows - 1)` to force a full redraw. Never dispose xterm.js instances on minimize.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| PTY Integration | ConPTY window flash (#1) | Critical | Patch portable-pty or use fork with CREATE_NO_WINDOW |
| PTY Integration | UNC path as cwd (#2) | Critical | Reuse existing drive-letter resolution from v1.1 |
| PTY Integration | Blocking reads (#10) | Critical | Dedicated threads per terminal, not async tasks |
| PTY Data Transport | Event system throughput (#3) | Critical | Use Tauri Channels from day one, not events |
| Terminal UI | FitAddon resize (#4) | Critical | ResizeObserver + debounce + visibility check |
| Terminal UI | Copy/paste (#14) | Minor | Configure keybindings during terminal component setup |
| Terminal Lifecycle | Zombie processes (#5) | Critical | Windows Job Objects for process tree cleanup |
| Session State Detection | ANSI contamination (#6) | Moderate | Dual-stream: raw to xterm.js, stripped to parser |
| CLAUDE.md Editor | CodeMirror state ownership (#7) | Moderate | Use react-codemirror wrapper, CodeMirror owns doc |
| CLAUDE.md Editor | NAS file watching (#9) | Moderate | Poll on focus, debounce 500ms+, suppress on save |
| Skills/Settings Editor | Large file jank (#12) | Minor | Viewport rendering, async load, lazy bundle |
| Multi-Terminal | Runtime starvation (#10) | Critical | Cap terminal count, dedicated reader threads |
| System Tray Lifecycle | Tab state on hide/show (#15) | Minor | Keep WebView alive, force refresh on restore |

---

## Architecture Decisions Forced by Pitfalls

These pitfalls collectively demand specific architectural choices:

1. **Data transport: Tauri Channels, not events.** Pitfall #3 makes this non-negotiable for PTY data.
2. **One OS thread per terminal for PTY reads.** Pitfall #10 rules out pure async.
3. **Process tree management via Job Objects.** Pitfall #5 requires this Windows-specific mechanism.
4. **Path resolution layer before all PTY operations.** Pitfall #2 requires UNC-to-drive-letter conversion.
5. **Dual data stream from PTY.** Pitfall #6 requires raw bytes for rendering and stripped text for state detection.
6. **CodeMirror owns editor state, React observes.** Pitfall #7 dictates the state architecture.

---

## Sources

### Official Documentation and Repos
- [Tauri v2: Calling the Frontend from Rust (Channels)](https://v2.tauri.app/develop/calling-frontend/)
- [Tauri v2: Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js/)
- [xterm.js Parser Hooks and Terminal Sequences](https://xtermjs.org/docs/guides/hooks/)
- [portable-pty docs](https://docs.rs/portable-pty/latest/x86_64-pc-windows-msvc/portable_pty/)
- [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty)
- [react-codemirror](https://github.com/uiwjs/react-codemirror)

### Issue Trackers (verified pitfalls)
- [wezterm #6946: portable_pty cmd window with Tauri](https://github.com/wezterm/wezterm/issues/6946)
- [Tauri #10987: Emitting events causes panic](https://github.com/tauri-apps/tauri/issues/10987)
- [Tauri #3021: Consecutive events hang frontend](https://github.com/tauri-apps/tauri/issues/3021)
- [Tauri #11446: Terminal window flash in production](https://github.com/tauri-apps/tauri/discussions/11446)
- [Tauri #14182: WebSocket connection closing](https://github.com/tauri-apps/tauri/issues/14182)
- [xterm.js #4841: FitAddon resizes incorrectly](https://github.com/xtermjs/xterm.js/issues/4841)
- [xterm.js #3584: Fit addon erratic resize](https://github.com/xtermjs/xterm.js/issues/3584)
- [xterm.js #5320: Fit addon width=1](https://github.com/xtermjs/xterm.js/issues/5320)
- [xterm.js #907: ANSI color codes not rendering](https://github.com/xtermjs/xterm.js/issues/907)
- [xterm.js #4834: Nerd Font icons cause UTF-8 rendering issues](https://github.com/xtermjs/xterm.js/issues/4834)
- [Claude Code #5428: ANSI escape sequence contamination](https://github.com/anthropics/claude-code/issues/5428)
- [Claude Code #32632: ANSI in commit messages](https://github.com/anthropics/claude-code/issues/32632)
- [wezterm #3739: portable-pty multi-terminal reader](https://github.com/wezterm/wezterm/discussions/3739)

### Community and Blog Posts
- [Advanced CodeMirror + React State Management (Trevor Harmon)](https://thetrevorharmon.com/blog/advanced-state-management-with-react-and-codemirror/)
- [Sourcegraph: Migrating Monaco to CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror)
- [Claude Code Status Line Customization](https://code.claude.com/docs/en/statusline)
- [Oh My Posh + Claude Code Integration](https://ohmyposh.dev/blog/oh-my-posh-claude-code-integration)
- [Windows ConPTY Introduction (Microsoft)](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/)
