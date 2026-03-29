# Project Research Summary

**Project:** Grove v2.0 "Mission Control"
**Domain:** Tauri 2 desktop app — embedded PTY terminals, session intelligence, and config editors
**Researched:** 2026-03-27
**Confidence:** MEDIUM-HIGH

## Executive Summary

Grove v2.0 is a Tauri 2 + React desktop app adding three major capabilities to an existing worktree manager: embedded PTY terminals (replacing external window launches), real-time Claude Code session state detection, and in-app config/markdown editors. The research consensus is clear: build in dependency order — PTY terminal foundation first (everything else depends on it), session intelligence second (the primary differentiator), then editors (independent, lower risk). The stack additions are minimal and purposeful: `portable-pty` for PTY on the Rust side, `@xterm/xterm` v6 for terminal rendering, and CodeMirror 6 via `@uiw/react-codemirror` for editors. All other explored options (tauri-plugin-pty, Monaco, WebSocket streaming) are confirmed anti-patterns for this use case.

The critical architectural insight from research: Tauri's Channel API must replace event-based streaming for PTY data. The event system is not designed for high-throughput I/O and is documented to panic under load. Channels are purpose-built for this, used internally by Tauri for child process output. This is not an optimization — it is load-bearing architecture. Additionally, PTY reads must run on dedicated OS threads per terminal (not tokio async tasks), process tree cleanup requires Windows Job Objects, and all paths passed to PTY operations must go through UNC-to-drive-letter resolution before use.

The highest-risk element is the ConPTY integration. portable-pty does not pass `CREATE_NO_WINDOW` by default, causing visible cmd.exe flicker on every terminal tab open in release builds. This must be spiked and resolved in Phase 1 before any other terminal work proceeds — it affects every user on every launch and cannot be deferred as polish. The session state detection approach (JSONL parsing + PTY output heuristics) is sound but the JSONL format is not formally versioned by Anthropic, requiring defensive parsing throughout.

## Key Findings

### Recommended Stack

The existing stack (Tauri 2, React 19, Vite 6, Tailwind v4, Zustand, shadcn/ui, git2, notify) needs four targeted additions. `portable-pty` 0.9.0 is the only serious Rust PTY option — it powers WezTerm and has 4.7M+ downloads. Direct integration (not via tauri-plugin-pty wrapper) is required because Grove needs raw PTY stream access for output parsing. `@xterm/xterm` v6 is the industry standard terminal renderer (used by VS Code). Note: v6 has breaking changes from v5 (scoped package name, no canvas renderer, new event API) — all v5 tutorials should be ignored. CodeMirror 6 via `@uiw/react-codemirror` is right-sized for config editing at ~150KB vs Monaco's 3-5MB. `regex` and `serde_json` for session parsing are likely already transitive dependencies.

Total frontend bundle addition is approximately 180KB gzip. Total Rust binary addition is approximately 300KB. Both are acceptable for a desktop app.

**Core technology additions:**
- `portable-pty` 0.9.0: PTY spawning (ConPTY on Windows) — only production-ready Rust PTY crate, 4.7M downloads, powers WezTerm
- `@xterm/xterm` v6: terminal rendering — industry standard, VS Code uses it, 30% smaller than v5; use scoped `@xterm/xterm` package, not old `xterm`
- `@xterm/addon-fit` + `@xterm/addon-webgl` + `@xterm/addon-web-links`: resize, GPU rendering, clickable file paths in output
- `@uiw/react-codemirror` 4.25.x + `@codemirror/lang-markdown` + `@codemirror/lang-json`: config/markdown editing at ~150KB vs Monaco's 5MB
- `regex` 1.x: terminal output pattern matching for session state heuristics
- `serde_json` 1.x (already present): JSONL session log parsing

**Version flag:** `portable-pty-psmux` fork may be needed if upstream portable-pty 0.9.0 does not expose ConPTY flags `PSEUDOCONSOLE_RESIZE_QUIRK` and `PSEUDOCONSOLE_WIN32_INPUT_MODE`. Evaluate during Phase 1 spike.

### Expected Features

Grove's v2.0 niche is worktree-centric workflow management. None of the competitors (Opcode, Nimbalyst, Claude Code Desktop, Agent Sessions) deeply integrate worktree lifecycle with session management. Every v2.0 feature reinforces this position.

**Must have (table stakes — missing any makes the v2.0 claim feel hollow):**
- Embedded terminal with PTY (single session) — replaces external wt.exe/cmd.exe launches
- Terminal tabs with worktree association — users run parallel sessions per branch
- Terminal resize handling — broken resize makes the terminal unusable
- Session state indicators — idle/working/error visible without switching tabs
- CLAUDE.md viewer/editor — every Claude Code user has one; external editor is friction
- Basic settings.json editor — permissions (allow/deny/ask) are the most-changed config

**Should have (differentiators reinforcing worktree-centric niche):**
- Worktree-aware terminal creation — one-click launch into worktree, tab closes on worktree merge
- Session state detection via JSONL parsing — richer than process-based; shows tool use, waiting states
- Multi-session dashboard status — at-a-glance grid of all active sessions across all projects
- Skills browser and editor — `~/.claude/skills/` browsing; no competitor does this well
- Prompt templates — saved launch prompts per project
- Context builder — structured launch UI (worktree + template + flags + model preview)
- Terminal search via `@xterm/addon-search`

**Defer to v2.1+:**
- Session history / replay — read past JSONL transcripts; valuable but not launch-critical
- MCP server management — complex, Opcode covers this, tangential to worktree workflow
- API cost / token analytics — Anthropic's dashboard covers it; not Grove's domain

**Explicit anti-features (do not build):**
- Full IDE / embedded code editor — scope explosion; Grove already has "Open in VS Code"
- Cloud sync / remote sessions — Grove is offline-first by constraint; Claude Code Desktop covers remote
- Agent orchestration — Claude Code handles this internally (v2.0.60+); don't fight upstream
- WYSIWYG markdown editor — split-pane source+preview is sufficient and far simpler

### Architecture Approach

Three new Rust subsystems integrate through established Tauri patterns already in Grove. The `terminal/` module wraps portable-pty and manages PTY lifecycle via Tauri Channels. The output parsing pipeline "tees" raw PTY bytes — raw to frontend immediately for display, stripped text to state detection asynchronously. `commands/file_commands.rs` handles file read/write for editors with atomic writes. All three subsystems communicate with the frontend through `invoke()` commands and Tauri Channels, matching existing patterns. The key architectural constraint: PTY reads run on one dedicated `std::thread` per terminal (not async tasks), sending data through Channels to frontend xterm.js instances.

**Major new components:**
1. `src-tauri/src/terminal/` (new) — pty.rs (PTY lifecycle), session.rs (per-terminal state), parser.rs (output parsing), commands.rs (Tauri command layer)
2. `src-tauri/src/commands/file_commands.rs` (new) — atomic file read/write, CLAUDE.md section parsing, settings.json schema-aware access
3. `src-tauri/src/watcher/claude_logs.rs` (new) — extends existing watcher to watch `~/.claude/projects/` JSONL files for state correction
4. `src-ui/src/components/terminal/` (new) — TerminalPanel, TerminalTabs, TerminalContainer, SessionBadge
5. `src-ui/src/components/editor/` (new) — CodeEditor (CM6 wrapper), MarkdownEditor (with preview), JsonEditor, SettingsEditor
6. `src-ui/src/pages/SessionView.tsx` (new) — combined terminal + editor side-by-side page
7. `src-ui/src/stores/terminal-store.ts` + `editor-store.ts` (new) — Zustand stores for new subsystems

**Key patterns to follow:**
- Channel-per-terminal: each PTY gets its own Tauri Channel, created before `terminal_spawn` invoke
- Managed state with interior mutability: `Mutex<TerminalManager>` in app state; PTY read loop runs outside the lock
- Graceful degradation: session store merges three sources (embedded terminals > JSONL logs > process polling)
- CodeMirror owns editor state, React observes — never set `value` prop on re-render; read from `view.state.doc.toString()` for saves

### Critical Pitfalls

1. **ConPTY window flash on Windows release builds** — portable-pty does not pass `CREATE_NO_WINDOW`. Spike in Phase 1 before writing any other terminal code. Test ONLY in `cargo tauri build` release builds, not `cargo tauri dev`. Have the psmux fork and direct ConPTY API (windows-rs) ready as fallbacks.

2. **UNC paths crash PTY working directory** — Windows cmd.exe cannot `cd` into UNC paths (`\\server\share\...`). Reuse existing v1.1 UNC-to-drive-letter resolution utility before passing any cwd to portable-pty. Breaks the primary developer's NAS use case entirely if missed.

3. **Tauri event system panics under PTY throughput** — `app_handle.emit()` is backed by `webview.eval(js)` and chokes at PTY data rates. Use `tauri::ipc::Channel` from day one. This is a foundational architecture decision, not a performance optimization. Retrofitting is painful.

4. **Blocking PTY reads starve the async runtime** — `MasterPty::read()` is a blocking Win32 `ReadFile` call. Use `std::thread::spawn` (one thread per terminal), not `tokio::spawn`. With 4+ terminals producing output, the entire async runtime stalls if this is wrong.

5. **Zombie process trees on tab close** — `Child::kill()` only kills the immediate process. Claude Code spawns sub-trees (node, git, etc.) that hold file locks on worktree files and continue burning API credits. Use Windows Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` from the initial PTY implementation.

6. **xterm.js FitAddon wrong dimensions in WebView2** — hidden containers return zero dimensions; terminal collapses to 1 column after tab switch. Use ResizeObserver with 100ms debounce, never call `fit()` on hidden containers, use `requestAnimationFrame` before fit on tab switch, propagate new dimensions back to PTY after fit.

7. **ANSI escape contamination in state parser** — must fork the data stream: raw bytes to xterm.js (do not strip), stripped text to state parser (do strip with regex). Using the raw stream for pattern matching produces garbage results due to Claude Code's colored output and cursor control sequences.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Terminal Foundation (PTY Spike + Single Terminal)

**Rationale:** The ConPTY window flash pitfall must be solved before any other work. It affects every terminal launch, is only visible in release builds, and the exact code mitigation is unconfirmed — making this the highest-risk unknown in the project. Everything else depends on this foundation being solid.
**Delivers:** Single working embedded terminal tab with PTY. Claude Code launches inside Grove instead of an external window. Resize works correctly. Copy/paste works. No visible cmd.exe flicker.
**Addresses features:** Embedded terminal (table stakes), terminal resize handling (table stakes)
**Pitfalls to solve:** ConPTY window flash (#1), UNC path as PTY cwd (#2), Tauri Channel data transport (#3), blocking PTY reads on dedicated threads (#4/10), FitAddon resize in WebView2 (#6/4), ConPTY flags for correct terminal behavior (#8)
**Stack:** portable-pty 0.9.0 (possibly psmux fork), @xterm/xterm v6, @xterm/addon-fit, @xterm/addon-webgl
**Architecture:** terminal/pty.rs, terminal/session.rs, terminal/commands.rs, TerminalPanel.tsx, terminal-store.ts
**Research flag:** NEEDS `/gsd:research-phase` — the CREATE_NO_WINDOW mitigation path for portable-pty is not pinned to a specific code solution. Must spike to determine: (a) does portable-pty 0.9.0 CommandBuilder expose creation flags? (b) does the psmux fork solve it clean? (c) is a direct ConPTY API call via windows-rs needed? Answer changes the implementation approach.

### Phase 2: Multi-Terminal Tabs + Process Integration

**Rationale:** Terminal tabs are table stakes once the foundation works. Process integration connects the new PTY subsystem to Grove's existing session detection and worktree lifecycle, enabling the core differentiator (terminal tabs tied to worktrees).
**Delivers:** Multiple terminal tabs with worktree association. Tab closes when worktree merges. Existing dashboard shows embedded sessions. Process cleanup via Job Objects. Worktree-aware one-click terminal launch.
**Addresses features:** Terminal tabs (table stakes), worktree-aware terminal creation (differentiator), terminal lifecycle tied to worktree (differentiator)
**Pitfalls to solve:** Zombie processes via Job Objects (#5), terminal tab state on hide/show (#15)
**Architecture:** TerminalTabs.tsx, terminal-store.ts (tab management), process/launch.rs (add embedded launch path), process/detect.rs (merge embedded + external detection), session-store.ts (three-source merge)
**Research flag:** Standard patterns. No additional research needed.

### Phase 3: Session State Detection + Dashboard Intelligence

**Rationale:** JSONL-based session state detection is Grove's primary v2.0 differentiator. Built after the terminal foundation because the dual-signal approach (PTY output + JSONL logs) requires both streams. Dashboard enhancements follow naturally once state data exists.
**Delivers:** Dashboard shows per-session state (idle/thinking/tool_use/waiting/error). Multi-session status grid. Real-time state visible without switching tabs.
**Addresses features:** Session state indicators (table stakes), session state detection via JSONL (differentiator), multi-session dashboard status (differentiator)
**Pitfalls to solve:** ANSI contamination in state parser (#6) — dual-stream architecture is mandatory; tee from the PTY read loop
**Stack:** serde_json (existing), notify (existing), regex 1.x
**Architecture:** terminal/parser.rs (output parsing pipeline), watcher/claude_logs.rs (JSONL file watching), terminal-store.ts SessionInfo with source field
**Research flag:** MEDIUM confidence. JSONL format is community-observed, not formally documented. Parse defensively. May need pattern tuning after Claude Code updates. Plan for iteration.

### Phase 4: Configuration Editors

**Rationale:** Editors are independent of the terminal subsystem — no technical dependency. Grouped separately as their own phase because CodeMirror + React state architecture requires care, and the NAS file watcher pitfall is distinct from PTY concerns. Lower risk than terminals, so placed after high-risk phases.
**Delivers:** CLAUDE.md editor with section navigation and split-pane preview. settings.json editor with structured permissions UI. Skills browser and editor for `~/.claude/skills/`.
**Addresses features:** CLAUDE.md editor (table stakes), settings.json editor (table stakes), skills browser (differentiator)
**Pitfalls to solve:** CodeMirror state dual-ownership (#7) — CodeMirror owns document, React observes; NAS file watcher latency (#9) — poll on focus, debounce 500ms+ for NAS paths; large file jank (#12) — async load, lazy bundle
**Stack:** @uiw/react-codemirror 4.25.x, @codemirror/lang-markdown, @codemirror/lang-json
**Architecture:** commands/file_commands.rs (atomic file read/write), CodeEditor.tsx, MarkdownEditor.tsx, JsonEditor.tsx, SettingsEditor.tsx, editor-store.ts
**Research flag:** Standard patterns. @uiw/react-codemirror handles React lifecycle integration correctly. No additional research needed.

### Phase 5: Launch Experience

**Rationale:** Prompt templates and context builder are low-risk config extensions. They depend on the terminal foundation (launching into embedded tabs) and project config (storing templates). Last because they enhance the experience rather than enabling it.
**Delivers:** Saved prompt templates per project. Visual context builder (worktree + template + flags + model). Full command preview before launch. Terminal search.
**Addresses features:** Prompt templates (differentiator), context builder (differentiator), terminal search (table stakes polish)
**Stack:** @xterm/addon-search
**Architecture:** prompt templates in config store, ContextBuilder.tsx, terminal search wired into TerminalPanel
**Research flag:** No research needed. Config extension + UI work with no novel technology.

### Phase Ordering Rationale

- PTY foundation must come first: the ConPTY spike is the project's largest unknown and cannot be deferred. Every other terminal feature depends on it.
- Session intelligence after terminal foundation: the dual-signal approach (PTY output + JSONL) is stronger than JSONL alone, and real-time state detection benefits from the embedded PTY stream.
- Editors after terminals: independent technically, but terminal work carries more risk. Resolve risk early.
- Launch experience last: pure enhancement built on top of everything else.
- Each phase is shippable independently. Phase 1+2 alone delivers a coherent "embedded terminals" release. Phase 3 adds Grove's unique differentiation. Phases 4-5 complete the full "command center" promise.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (ConPTY):** The CREATE_NO_WINDOW mitigation is unconfirmed at the code level. Spike required before planning detailed tasks. Question to answer: does portable-pty 0.9.0 CommandBuilder expose Windows process creation flags, or does this require the psmux fork or direct ConPTY API (windows-rs)?
- **Phase 3 (JSONL format):** Claude Code's session file format is observed/inferred, not guaranteed. Parse with `serde_json::Value` first, typed extraction second. State detection regex patterns will need tuning against real Claude Code output.

Phases with standard patterns (no additional research needed):
- **Phase 2:** Tab management and process integration follow established Tauri patterns already in Grove. Channel-per-terminal and managed state patterns are confirmed.
- **Phase 4:** CodeMirror 6 + @uiw/react-codemirror is well-documented. State ownership pattern (CodeMirror owns document) is established.
- **Phase 5:** Config extensions and UI work. No novel technology.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | portable-pty (4.7M downloads, powers WezTerm), xterm.js v6 (VS Code), CodeMirror 6 (Sourcegraph migration) all have strong production provenance. Version choices verified against official sources. |
| Features | HIGH | Competitive landscape well-documented (2026). Grove's worktree-centric niche is clear. Feature prioritization follows logical dependency order. Anti-features are explicit. |
| Architecture | MEDIUM-HIGH | Tauri Channel API and managed state patterns verified against official docs. PTY architecture follows established reference implementations. ConPTY-specific behavior is MEDIUM due to Windows quirks needing spike validation. |
| Pitfalls | HIGH | Most pitfalls verified through tracked GitHub issues with specific numbers (wezterm #6946, Tauri #10987, xterm.js #4841, #3584, #5320, etc.). Not theoretical — documented production failures in real apps. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **ConPTY CREATE_NO_WINDOW mitigation path** — the exact code solution is not pinned. portable-pty 0.9.0 CommandBuilder API needs to be tested on a real Windows release build before committing to an approach. Spike required at the start of Phase 1. Three fallback options exist (CommandBuilder flags, psmux fork, direct ConPTY via windows-rs) but which is needed is unknown.
- **JSONL format stability** — Claude Code's session file format is community-documented but not formally versioned or guaranteed by Anthropic. Parse defensively (`serde_json::Value` first, typed extraction second). Monitor Claude Code release notes for format changes.
- **ConPTY flags (psmux fork vs upstream)** — portable-pty upstream may require supplementing with `PSEUDOCONSOLE_RESIZE_QUIRK` (0x2) and `PSEUDOCONSOLE_WIN32_INPUT_MODE` (0x4) flags for correct terminal behavior. Whether to use the psmux fork or patch inline needs evaluation against a release build.
- **PTY state detection regex patterns** — the regex patterns for detecting Claude Code session states (idle, working, tool_use, waiting) are heuristic and need tuning against actual Claude Code output. JSONL-based detection is the fallback for correctness when PTY heuristics are wrong.

## Sources

### Primary (HIGH confidence)
- [portable-pty docs](https://docs.rs/portable-pty) — PTY API, ConPTY integration, MasterPty/Child traits
- [portable-pty on crates.io](https://crates.io/crates/portable-pty) — v0.9.0, 4.7M downloads, Feb 2025
- [Tauri v2 Channel API docs](https://v2.tauri.app/develop/calling-frontend/) — streaming architecture, child process output patterns
- [xterm.js official site](https://xtermjs.org/) — terminal component, v6 addon documentation
- [CodeMirror 6](https://codemirror.net/) — editor core, language packages (lang-json 6.0.2, lang-markdown 6.5.0)
- [@uiw/react-codemirror](https://uiwjs.github.io/react-codemirror/) — React wrapper v4.25.x

### Secondary (MEDIUM confidence)
- [wezterm issue #6946](https://github.com/wezterm/wezterm/issues/6946) — ConPTY window flash documented
- [Tauri issue #10987](https://github.com/tauri-apps/tauri/issues/10987) — event system panic under load
- [Tauri discussion #11446](https://github.com/tauri-apps/tauri/discussions/11446) — terminal window flash in production
- [xterm.js #4841, #3584, #5320](https://github.com/xtermjs/xterm.js/issues) — FitAddon resize failures in WebView2
- [portable-pty-psmux](https://lib.rs/crates/portable-pty-psmux) — ConPTY flag additions, PSEUDOCONSOLE_RESIZE_QUIRK
- [marc2332/tauri-terminal](https://github.com/marc2332/tauri-terminal) — reference Tauri terminal implementation
- [Claude Code JSONL format reference](https://github.com/withLinda/claude-JSONL-browser) — session file structure
- [Sourcegraph Monaco to CodeMirror migration](https://sourcegraph.com/blog/migrating-monaco-codemirror) — 43% JS size reduction, bundle analysis
- [Trevor Harmon: CodeMirror + React state management](https://thetrevorharmon.com/blog/advanced-state-management-with-react-and-codemirror/) — state ownership pattern (canonical reference)
- [wezterm discussion #3739](https://github.com/wezterm/wezterm/discussions/3739) — portable-pty multi-terminal reader threads
- [Claude Code #5428](https://github.com/anthropics/claude-code/issues/5428) — ANSI escape sequence contamination

### Tertiary (LOW confidence — needs validation during implementation)
- [Claude Code JSONL session tracking](https://deepwiki.com/agisota/missioncontrol/11.4-claude-code-session-tracking) — session state patterns (community-observed, not official Anthropic docs)
- [Claude Code status line docs](https://code.claude.com/docs/en/statusline) — JSON structure for session stats via custom status scripts
- PTY output regex patterns for state detection — inferred from observed Claude Code output, not formally documented; will require tuning

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
