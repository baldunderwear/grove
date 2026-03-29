---
phase: 09-terminal-foundation-conpty-spike
verified: 2026-03-27T00:00:00Z
status: human_needed
score: 9/10 must-haves verified
re_verification: false
human_verification:
  - test: "Release build: verify no visible CMD window flashes during terminal launch"
    expected: "Clicking Launch, then seeing the terminal open with no cmd.exe/conhost window flashing on screen"
    why_human: "NFR-07 requires runtime observation in a release build (cargo tauri build). portable-pty uses ConPTY which architecturally avoids this, but the Plan 03 human-verify checkpoint was auto-approved without running the release binary. SUMMARY explicitly defers this to manual testing."
  - test: "Full end-to-end terminal launch: xterm.js renders Claude Code output with ANSI colors"
    expected: "Clicking Launch on a worktree row opens a split-pane terminal on the right, Claude Code starts up, ANSI colors render, keystrokes reach the process"
    why_human: "All wiring is verified statically but runtime behavior of the xterm.js + ConPTY pipeline has not been validated in any live session (Plan 03 checkpoint was auto-approved)."
---

# Phase 09: Terminal Foundation — ConPTY Spike Verification Report

**Phase Goal:** User can launch Claude Code inside Grove in an embedded terminal that works correctly on Windows, including NAS-hosted repos.
**Verified:** 2026-03-27
**Status:** human_needed — all automated checks pass, 2 items require runtime validation
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | portable-pty 0.9.0 compiles and spawns a ConPTY on Windows | ✓ VERIFIED | `portable-pty = "0.9"` in Cargo.toml; `cargo check` passes (1m 08s, 0 errors) |
| 2  | PTY output streams through Tauri Channel to frontend | ✓ VERIFIED | `pty.rs` spawns dedicated OS thread, calls `on_event.send(TerminalEvent::Data {...})` in read loop; `Channel<TerminalEvent>` in command signature |
| 3  | UNC paths are resolved to drive letters before PTY spawn | ✓ VERIFIED | `commands.rs` calls `get_drive_mappings()` then `resolve_unc_path()`, rejects still-UNC paths with explicit error |
| 4  | TerminalManager tracks active terminals by ID | ✓ VERIFIED | `TerminalManager` in `terminal/mod.rs` with `HashMap<String, TerminalSession>`, full insert/remove/write/resize/kill API |
| 5  | xterm.js Terminal instance creates and mounts in a div | ✓ VERIFIED | `useTerminal.ts` — `new Terminal({...})`, `terminal.open(container)`, full lifecycle in `useEffect` |
| 6  | WebGL addon loads with DOM fallback on context loss | ✓ VERIFIED | `try { webglAddon.onContextLoss(() => webglAddon.dispose()); terminal.loadAddon(webglAddon); } catch { /* DOM fallback */ }` |
| 7  | FitAddon resizes terminal to container via ResizeObserver | ✓ VERIFIED | `ResizeObserver` calls `fitAddon.fit()` inside `requestAnimationFrame` on container dimension changes |
| 8  | Terminal store tracks active terminal ID and working directory | ✓ VERIFIED | `terminal-store.ts` — `activeTerminalId`, `activeWorktreePath`, `activeBranchName`, `isConnected`; full `openTerminal`/`closeTerminal`/`setConnected` API |
| 9  | Clicking Launch on a worktree opens an embedded terminal pane instead of external window | ✓ VERIFIED | `Dashboard.tsx` `handleLaunch` calls `openTerminal('pending', path, branch)` via store; `TerminalPanel` renders when `activeTerminalId` is set; old `launchSession` path bypassed |
| 10 | No visible cmd.exe window appears during terminal launch | ? NEEDS HUMAN | portable-pty's ConPTY avoids window flash by design, but release build validation was explicitly deferred in Plan 03 checkpoint (auto-approved). Must be confirmed in a release binary. |

**Score:** 9/10 truths verified (1 requires runtime human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/utils/mod.rs` | Shared utilities module declaration | ✓ VERIFIED | `pub mod paths;` — exists, wired |
| `src-tauri/src/utils/paths.rs` | UNC path resolution (DriveMapping, get_drive_mappings, resolve_unc_path) | ✓ VERIFIED | All 3 exports present as `pub(crate)`, real `net use` parsing logic |
| `src-tauri/src/terminal/mod.rs` | TerminalManager struct and public API | ✓ VERIFIED | `pub struct TerminalManager`, `TerminalSession`, `TerminalEvent` enum with serde tag — all substantive |
| `src-tauri/src/terminal/pty.rs` | PTY spawn, read thread, resize, write, kill | ✓ VERIFIED | `pub fn spawn_pty(...)` — real ConPTY spawn with 4096-byte read loop, dedicated `std::thread::spawn` |
| `src-tauri/src/terminal/commands.rs` | Tauri command handlers (spawn, write, resize, kill) | ✓ VERIFIED | All 4 `#[tauri::command]` handlers — real logic, UNC resolution before spawn, mutex patterns correct |
| `src-ui/src/hooks/useTerminal.ts` | xterm.js lifecycle hook with WebGL+Fit+WebLinks addons | ✓ VERIFIED | 97 lines, WebGL try/catch fallback, ResizeObserver, requestAnimationFrame, CSS import present |
| `src-ui/src/components/terminal/TerminalPanel.tsx` | Terminal panel with Channel wiring | ✓ VERIFIED | `new Channel<TerminalEvent>()`, `invoke('terminal_spawn')`, `invoke('terminal_write')`, `invoke('terminal_resize')`, `invoke('terminal_kill')` — all wired |
| `src-ui/src/components/terminal/TerminalToolbar.tsx` | Toolbar with branch name and close button | ✓ VERIFIED | Renders `branchName` prop, `X` close button, Grove design tokens |
| `src-ui/src/stores/terminal-store.ts` | Zustand store for active terminal state | ✓ VERIFIED | `useTerminalStore` with real `openTerminal`/`closeTerminal`/`setConnected` — no stubs |
| `src-ui/src/pages/Dashboard.tsx` | Split-pane layout with conditional terminal panel | ✓ VERIFIED | `ResizablePanelGroup` when `activeTerminalId` set, `TerminalPanel` rendered with live store values |
| `src-ui/src/components/ui/resizable.tsx` | shadcn Resizable component | ✓ VERIFIED | Wraps react-resizable-panels v4 API (`Group`, `Panel`, `Separator`) — real implementation |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `terminal/commands.rs` | `terminal/pty.rs` | `terminal_spawn` calls `pty::spawn_pty` | ✓ WIRED | Line 31: `let (id, session) = pty::spawn_pty(&resolved, cols, rows, on_event)?;` |
| `terminal/pty.rs` | `tauri::ipc::Channel` | reader thread sends `TerminalEvent::Data` via `channel.send()` | ✓ WIRED | Line 75: `on_event.send(TerminalEvent::Data { data })` in read loop |
| `terminal/commands.rs` | `utils/paths.rs` | UNC resolution before PTY spawn | ✓ WIRED | Lines 19-28: `get_drive_mappings()` + `resolve_unc_path()` + UNC reject guard |
| `lib.rs` | `terminal::commands::*` | All 4 commands registered in invoke_handler | ✓ WIRED | Lines 51-54: `terminal::commands::terminal_spawn/write/resize/kill` all registered |
| `lib.rs` | `terminal::TerminalManager` | Managed state via `Mutex<TerminalManager>` | ✓ WIRED | Line 19: `.manage(std::sync::Mutex::new(terminal::TerminalManager::new()))` |
| `TerminalPanel.tsx` | `useTerminal.ts` | `useTerminal` hook for xterm.js lifecycle | ✓ WIRED | Line 40: `const { write } = useTerminal(containerRef, { onData, onResize });` |
| `TerminalPanel.tsx` | `@tauri-apps/api/core` | `Channel` + `invoke` for PTY I/O | ✓ WIRED | Line 2: `import { invoke, Channel }`, lines 46-67 spawn/write/resize/kill |
| `Dashboard.tsx` | `TerminalPanel.tsx` | Renders `TerminalPanel` when `activeTerminalId` is set | ✓ WIRED | Lines 275-287: conditional `<ResizablePanelGroup>` with `<TerminalPanel>` |
| `Dashboard.tsx` | `terminal-store.ts` | `handleLaunch` calls `openTerminal` | ✓ WIRED | Lines 151-156: `openTerminal('pending', branch.worktree_path, branch.name)` |
| `BranchTable.tsx` | `Dashboard.tsx` | `onLaunch` prop delegates to Dashboard's `handleLaunch` | ✓ WIRED | BranchTable is presentational; `onLaunch={handleLaunch}` passed from Dashboard (architecture deviation from plan, but correctly implemented) |
| `git/branches.rs` | `utils/paths.rs` | Shared UNC resolution (NFR-06 reuse) | ✓ WIRED | Line 5: `use crate::utils::paths::{get_drive_mappings, resolve_unc_path};` |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers infrastructure (PTY backend + terminal components). No dynamic data fetched from a database. Data flows through PTY byte streams, which are runtime-only and cannot be traced statically.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust backend compiles clean | `cargo check` (src-tauri) | `Finished dev profile ... 0 errors, 1 dead_code warning` | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit` (src-ui) | 1 deprecation warning on pre-existing `baseUrl` option, 0 errors | ✓ PASS |
| All 4 terminal commands registered | grep in lib.rs | `terminal_spawn`, `terminal_write`, `terminal_resize`, `terminal_kill` all present in `invoke_handler!` | ✓ PASS |
| portable-pty dependency resolved | grep in Cargo.toml | `portable-pty = "0.9"` at line 30 | ✓ PASS |
| xterm.js packages installed | grep in package.json | `@xterm/xterm ^6.0.0`, `@xterm/addon-fit ^0.11.0`, `@xterm/addon-webgl ^0.19.0`, `@xterm/addon-web-links ^0.12.0` | ✓ PASS |
| react-resizable-panels installed | grep in package.json | `react-resizable-panels ^4.8.0` at line 32 | ✓ PASS |
| Release build CMD flash | Runtime check — release binary | Not tested (checkpoint auto-approved) | ? SKIP — human needed |
| Full terminal launch E2E | Runtime check — `cargo tauri dev` | Not tested (checkpoint auto-approved) | ? SKIP — human needed |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TERM-01 | 09-01, 09-03 | User can launch Claude Code in an embedded terminal tab instead of an external window | ✓ SATISFIED | Dashboard `handleLaunch` opens embedded `TerminalPanel` via store; old `launchSession` path bypassed |
| TERM-04 | 09-03 | User can resize terminal panes (split view: branch list + terminal) | ✓ SATISFIED | `ResizablePanelGroup` with `ResizableHandle withHandle` in Dashboard; react-resizable-panels v4 |
| TERM-05 | 09-02, 09-03 | Terminal supports full ANSI rendering (colors, cursor movement, clearing) | ✓ VERIFIED (static) / ? NEEDS RUNTIME | xterm.js v6 with `TERM=xterm-256color`, `COLORTERM=truecolor` set in PTY env — verified architecturally; not validated at runtime |
| NFR-05 | 09-01 | Terminal I/O uses Tauri Channels (not events) for throughput | ✓ SATISFIED | `Channel<TerminalEvent>` in both Rust command signature and frontend `new Channel<TerminalEvent>()` — no Tauri events used |
| NFR-06 | 09-01 | PTY operations resolve UNC paths to drive letters before spawning | ✓ SATISFIED | `terminal_spawn` calls `get_drive_mappings()` + `resolve_unc_path()` + rejects still-UNC with error; shared with `git/branches.rs` |
| NFR-07 | 09-01, 09-03 | No visible CMD windows from PTY operations (CREATE_NO_WINDOW) | ? NEEDS HUMAN | portable-pty uses ConPTY which avoids window creation; no explicit `CREATE_NO_WINDOW` flag needed. Release build validation explicitly deferred by Plan 03. |
| NFR-08 | 09-02 | Terminal rendering at 60fps with WebGL addon fallback to canvas | ✓ SATISFIED (static) | WebGL loaded with `onContextLoss` disposal; DOM renderer is automatic fallback; `allowProposedApi: true` set |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src-tauri/src/terminal/mod.rs` | 13 | `#[allow(dead_code)]` on `working_dir` field | ℹ️ Info | Field retained for future debugging; no functional impact |
| `src-tauri/src/watcher/mod.rs` | 78 | `dead_code` warning on `stop_watcher` | ℹ️ Info | Pre-existing, not introduced by phase 09; `cargo check` passes |

No blockers or warnings found. No placeholder implementations, empty stubs, or hardcoded empty returns in any phase 09 file.

### Architecture Deviation: BranchTable Key Link

Plan 03 specified: `BranchTable.tsx → terminal-store.ts via openTerminal`. Actual implementation: BranchTable is a pure presentational component; `openTerminal` is called in `Dashboard.handleLaunch` which passes `onLaunch` prop to BranchTable. This is a deliberate improvement — better component isolation. The effective chain is intact and correct. No gap.

### Human Verification Required

#### 1. Release Build: No Visible CMD Window (NFR-07)

**Test:** Run `cargo tauri build` from the grove root. Launch the resulting `src-tauri/target/release/Grove.exe`. Select a project, click Launch on any worktree row.
**Expected:** Terminal pane opens with no cmd.exe or conhost window visible on screen at any point.
**Why human:** This behavior is inherently runtime-only. portable-pty's ConPTY implementation avoids window creation, but this must be observed in a release binary (not dev mode, which runs attached to the parent console). The Plan 03 human-verify checkpoint was auto-approved without executing this test.

#### 2. Full End-to-End Terminal Launch (TERM-01, TERM-05)

**Test:** Run `cargo tauri dev`. Select a project, click Launch on any worktree row.
**Expected:** (a) Terminal pane slides open on the right; (b) Claude Code starts up in the terminal; (c) ANSI colors render in xterm.js; (d) Arrow keys and typing work; (e) Dragging the pane divider resizes both panels; (f) Clicking X closes the terminal and restores single-panel layout.
**Why human:** Full xterm.js + ConPTY pipeline has never been exercised in a live session — both Plan 03 validation tasks were auto-approved based only on `cargo check` + TypeScript compile passing.

### Gaps Summary

No functional gaps found. All 10 artifacts exist, are substantive, and are correctly wired. All requirement implementations are present in code.

The two human verification items are runtime validation tasks, not code gaps. The architecture is sound:
- Rust: portable-pty ConPTY, TerminalManager, 4 Tauri commands, UNC resolution — all compile and connect
- Frontend: xterm.js v6 with WebGL fallback, ResizeObserver, Channel-based PTY wiring, Zustand state — all present and connected
- Integration: Dashboard split-pane, Launch button flow, terminal store mediation — fully wired

The phase is complete from a static code standpoint. Human validation of the live terminal experience is the only remaining step before marking it production-ready.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
