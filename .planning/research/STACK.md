# Technology Stack: v2.0 Mission Control Additions

**Project:** Grove v2.0
**Researched:** 2026-03-27
**Scope:** NEW capabilities only (PTY/terminal, session intelligence, code editors)
**Existing stack (not re-researched):** Tauri 2, React 19, Vite 6, Tailwind v4, Zustand, shadcn/ui, git2, sysinfo, notify, all current Tauri plugins

## Recommended Stack Additions

### 1. PTY Backend (Rust)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `portable-pty` | 0.9.0 | Spawn pseudo-terminals for Claude Code sessions | The de facto Rust PTY crate (4.7M+ downloads, part of wezterm). Cross-platform ConPTY on Windows. Only serious option in the ecosystem. |

**Confidence:** HIGH (official crate docs, widespread usage)

**Why NOT `tauri-plugin-pty`:** The plugin (v0.1.1) wraps portable-pty but is a thin community plugin with only 26 commits and no official releases. It abstracts away control Grove needs for session detection (reading PTY output for state parsing). Using portable-pty directly gives full control over the PTY read/write streams, which is essential for intercepting Claude Code output to detect session state (waiting/working/idle/error). The plugin's convenience isn't worth the loss of control.

**Why NOT `pseudoterminal`:** v0.1.0, async "not implemented yet" per its own README, minimal adoption. Not production-ready.

**Why NOT `winpty-rs`:** Only Windows. Grove is Windows-first but should not preclude future cross-platform support. portable-pty already uses ConPTY on Windows internally.

**CRITICAL Windows Issue:** portable-pty spawns a visible conhost/cmd window on Windows release builds (wezterm/wezterm#6946). This is the same class of problem Grove already solved for git CLI calls using `CREATE_NO_WINDOW`. Mitigation strategies:

1. **Primary:** Use `CommandBuilder` with Windows-specific process creation flags. portable-pty 0.9.0 exposes `CommandBuilder` which may allow setting creation flags.
2. **Fallback:** If portable-pty doesn't expose creation flags, fork or patch the ConPTY spawn path to pass `CREATE_NO_WINDOW`.
3. **Last resort:** Use the `windows-rs` crate to call ConPTY APIs directly, bypassing portable-pty on Windows. This is more work but gives total control.

This is the single highest-risk integration point and should be spiked early in development.

### 2. Terminal Renderer (Frontend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@xterm/xterm` | 6.0.0 | Terminal emulation in browser/webview | Industry standard (VS Code, Hyper, many IDEs). v6 dropped 30% bundle size (379kb to 265kb). Active maintenance. |
| `@xterm/addon-fit` | latest | Auto-resize terminal to container | Required for responsive layout in tabbed UI |
| `@xterm/addon-webgl` | 0.19.0 | GPU-accelerated rendering | Smooth scrolling for fast Claude Code output. Canvas renderer removed in v6, so it's WebGL or DOM. |
| `@xterm/addon-web-links` | latest | Clickable URLs in terminal output | Claude Code outputs file paths and URLs that should be clickable |

**Confidence:** HIGH (official xterm.js project, used by VS Code)

**Why NOT a React wrapper (react-xtermjs, xterm-react, etc.):** All wrappers lag behind xterm.js releases and add a leaky abstraction. xterm.js v6.0 has breaking changes (new event system, no canvas renderer, viewport changes). Wrappers targeting v5.x will break. Writing a thin React hook (useTerminal) that manages the Terminal instance lifecycle is ~50 lines of code and gives full control. No wrapper needed.

**xterm.js v6.0 breaking changes to note:**
- Package moved to `@xterm/xterm` scope (NOT the old `xterm` package)
- Canvas renderer addon removed -- use WebGL or DOM
- EventEmitter API replaced with new Emitter pattern
- Viewport/scrollbar implementation changed
- `overviewRulerWidth` moved into `overviewRuler` options object

### 3. Code/Config Editor (Frontend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@uiw/react-codemirror` | 4.25.x | React wrapper for CodeMirror 6 | Most maintained CM6 React binding (weekly npm downloads in hundreds of thousands). Handles editor lifecycle, extensions, themes via React props. |
| `@codemirror/lang-markdown` | 6.5.0 | CLAUDE.md editing | First-class markdown with syntax highlighting, link detection |
| `@codemirror/lang-json` | 6.0.2 | settings.json / config editing | JSON with validation, bracket matching, formatting |

**Confidence:** HIGH (official CodeMirror packages + well-maintained React wrapper)

**Why CodeMirror 6 over Monaco:** Monaco is VS Code's editor -- powerful but 3-5MB bundle, complex worker setup, overkill for editing config files and markdown. CodeMirror 6 is ~150KB for core + languages, modular, designed for embedding. Grove needs a config editor, not an IDE.

**Why @uiw/react-codemirror over raw CM6:** Raw CodeMirror 6 requires manual DOM management and state synchronization with React. The wrapper handles this cleanly with hooks. Unlike xterm.js wrappers, this one is actively maintained and tracks CM6 releases closely.

**Additional language support if needed later:**
- `@codemirror/lang-yaml` -- for YAML config files
- Custom TOML support via `@codemirror/language` Lezer grammar (no official TOML package yet, but CLAUDE.md and settings.json are the primary targets, both are markdown/JSON)

### 4. Session Intelligence (Rust + Frontend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `serde_json` | 1.x | Parse Claude Code JSONL session files | Already in Cargo.toml. JSONL is one-JSON-object-per-line, serde_json handles this natively. |
| `notify` | 8.2 | Watch session files for changes | Already in Cargo.toml. Reuse existing file watcher infrastructure. |
| `regex` | 1.x | Parse terminal output for state detection | Pattern match Claude Code output for prompts, errors, tool usage indicators |

**Confidence:** MEDIUM (Claude Code JSONL format is documented but not formally versioned -- it could change)

**Session file location:** `~/.claude/projects/<encoded-cwd>/*.jsonl` where `<encoded-cwd>` replaces non-alphanumeric chars with `-`.

**JSONL event structure (observed):**
```json
{"type":"user","message":{"role":"user","content":"..."},"timestamp":"...","uuid":"...","sessionId":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]},"timestamp":"..."}
```

**Session state detection approach (two signals):**
1. **PTY output parsing:** Watch for Claude Code's prompt pattern (the `>` input prompt), tool execution markers, error patterns. This gives real-time state.
2. **JSONL file watching:** Watch the session's JSONL file for new lines. Provides structured data about what Claude is doing (tool calls, responses). This gives rich context.

**Status line integration:** Claude Code supports custom status line scripts that receive JSON via stdin with model, cost, context window stats. This is another potential data source but requires per-session script configuration.

## What NOT to Add

| Temptation | Why Skip It |
|------------|-------------|
| `tauri-plugin-pty` | Thin wrapper over portable-pty that removes control needed for output parsing. Use portable-pty directly. |
| `react-xtermjs` / `xterm-for-react` | Wrappers lag behind xterm.js v6 breaking changes. Write a 50-line hook instead. |
| Monaco editor | 3-5MB bundle for editing config files. CodeMirror 6 at ~150KB is right-sized. |
| `vte` crate (terminal parser) | For building a terminal emulator from scratch. xterm.js handles all terminal escape sequence parsing on the frontend. Rust side just pipes bytes. |
| `tokio` | Grove's Tauri backend uses std threads + Tauri's async runtime. Adding tokio for PTY async would add complexity. Use `std::thread::spawn` + channels for PTY I/O, same pattern as existing process management. |
| Separate terminal state crate | Session state detection is Grove-specific logic (parsing Claude Code patterns). No generic crate helps here. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| PTY | portable-pty | tauri-plugin-pty | Need raw PTY stream access for output parsing |
| PTY | portable-pty | pseudoterminal | v0.1.0, async unimplemented, too immature |
| Terminal UI | @xterm/xterm v6 | @nicktomlin/terminal (React) | Toy project, not a real terminal emulator |
| Terminal wrapper | Custom hook | react-xtermjs | Lags xterm.js v6, unnecessary abstraction |
| Editor | CodeMirror 6 | Monaco | Bundle size (3-5MB vs 150KB), complexity |
| Editor wrapper | @uiw/react-codemirror | Raw CM6 | Wrapper handles React lifecycle correctly, actively maintained |
| Session parsing | serde_json + regex | Custom parser | JSONL is JSON, regex for PTY patterns is simpler than a parser |

## Integration Architecture

### Data Flow: PTY to Frontend

```
[Claude Code process]
     |
     v
[portable-pty] -- Rust, spawns ConPTY on Windows
     |
     +--> [PTY reader thread] -- std::thread::spawn, blocking read
     |         |
     |         +--> [Session state analyzer] -- regex patterns on raw output
     |         |         |
     |         |         +--> [Tauri event: "session-state-changed"]
     |         |
     |         +--> [Tauri event: "pty-output"] -- raw bytes to frontend
     |
     v
[xterm.js Terminal] -- frontend, renders output
     |
     +--> [onData callback] -- user keystrokes
              |
              +--> [Tauri command: "pty-write"] -- send input back to PTY
```

### Data Flow: Session Intelligence

```
[~/.claude/projects/<hash>/*.jsonl]
     |
     v
[notify file watcher] -- reuse existing watcher infra
     |
     +--> [JSONL line parser] -- serde_json per line
     |         |
     |         +--> [Session metadata extractor] -- model, cost, context window
     |         |
     |         +--> [Tauri event: "session-data-updated"]
     |
     v
[Dashboard UI] -- displays session state, cost, activity
```

### Data Flow: Config Editors

```
[CLAUDE.md / settings.json / skills files]
     |
     v
[Tauri command: "read-file"] -- already exists or trivial
     |
     v
[CodeMirror 6 editor] -- frontend, with lang-markdown or lang-json
     |
     +--> [onChange] -- debounced
              |
              +--> [Tauri command: "write-file"] -- save back
```

## Installation

### Rust (add to src-tauri/Cargo.toml)

```toml
# PTY for embedded terminals
portable-pty = "0.9"

# Output pattern matching (may already be transitive dep)
regex = "1"
```

### Frontend (add to src-ui/package.json)

```bash
# Terminal emulator
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links

# Code editor
npm install @uiw/react-codemirror @codemirror/lang-markdown @codemirror/lang-json
```

### Estimated Bundle Impact

| Addition | Size (gzip) | Notes |
|----------|-------------|-------|
| @xterm/xterm v6 | ~85KB | 30% smaller than v5 |
| xterm addons (fit+webgl+links) | ~30KB | WebGL is the largest |
| @uiw/react-codemirror + CM6 core | ~50KB | Modular, only loads what's used |
| CM6 lang-markdown + lang-json | ~15KB | Small language packages |
| **Total frontend addition** | **~180KB** | Acceptable for a desktop app |

| Addition | Binary Size | Notes |
|----------|-------------|-------|
| portable-pty | ~200KB | Includes ConPTY bindings on Windows |
| regex | ~100KB | May already be pulled in transitively |
| **Total Rust addition** | **~300KB** | Negligible for desktop binary |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| portable-pty visible cmd window on Windows release builds | HIGH | Spike early. Test with `cargo tauri build` immediately. Have ConPTY direct fallback ready. |
| Claude Code JSONL format changes without notice | MEDIUM | Parse defensively with `serde_json::Value` first, only extract known fields. Log unknown event types for debugging. |
| xterm.js v6 breaking changes from v5 examples | LOW | Use only v6 docs/examples. Most online tutorials target v5 -- ignore them. |
| CodeMirror 6 theme integration with Grove's design system | LOW | @uiw/react-codemirror supports custom themes. Match to Tailwind classes. |

## Sources

- [portable-pty crate docs](https://docs.rs/portable-pty) - HIGH confidence
- [portable-pty on crates.io](https://crates.io/crates/portable-pty) - v0.9.0, 4.7M downloads
- [wezterm/wezterm#6946](https://github.com/wezterm/wezterm/issues/6946) - Windows cmd window issue
- [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) - Evaluated, not recommended
- [xterm.js releases](https://github.com/xtermjs/xterm.js/releases) - v6.0.0, Dec 2025
- [xterm.js official site](https://xtermjs.org/) - HIGH confidence
- [@uiw/react-codemirror](https://github.com/uiwjs/react-codemirror) - v4.25.x
- [CodeMirror 6](https://codemirror.net/) - lang-json 6.0.2, lang-markdown 6.5.0
- [Claude Code JSONL browser](https://github.com/withLinda/claude-JSONL-browser) - Session format reference
- [Claude Code status line docs](https://code.claude.com/docs/en/statusline) - Session data structure
- [Claude Code session storage](https://claude-world.com/tutorials/s16-session-storage/) - JSONL format details
