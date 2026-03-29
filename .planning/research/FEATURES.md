# Feature Landscape: Grove v2.0 Mission Control

**Domain:** Claude Code command center (embedded terminals, session intelligence, config editors)
**Researched:** 2026-03-27
**Scope:** NEW features only. Existing worktree management, merge workflow, system tray, notifications, auto-fetch, and auto-update are out of scope.

## Competitive Context

Grove enters a crowded 2026 landscape for Claude Code GUIs:
- **Opcode** (formerly Claudia) -- Tauri 2 desktop app with session management, CLAUDE.md editor, usage analytics, MCP management, tmux-based terminal splits. AGPL licensed. Most popular open-source option.
- **Nimbalyst** -- Multi-session management (6+ simultaneous), WYSIWYG markdown editor, session kanban, git worktree isolation, iOS app, voice control. Commercial.
- **Claude Code Desktop** (Anthropic official) -- Remote dispatch, parallel sessions with git isolation, visual diff review, PR monitoring, computer use. First-party.
- **Agent Sessions** -- Session browser, analytics, limits tracker for multiple CLI agents. macOS native.

**Grove's niche:** Worktree-centric workflow management. None of the competitors deeply integrate worktree lifecycle (create, monitor, merge, clean) with session management. Grove already owns this niche from v1.x. The v2.0 features should reinforce this position, not abandon it.

---

## Table Stakes

Features users expect from a "command center" upgrade. Missing any of these makes the v2.0 claim feel hollow.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Embedded terminal** (single session) | Core promise of "command center." External window launches feel like v1. | HIGH | tauri-plugin-pty + xterm.js | Replaces current `wt.exe`/`cmd.exe` spawning in `launch.rs` |
| **Terminal tabs** (multiple sessions) | Users run parallel sessions per PROJECT.md. One tab per worktree. | MEDIUM | Embedded terminal foundation | Tab state: PTY handle, xterm instance, worktree association |
| **Terminal resize handling** | Broken resize = unusable terminal. xterm.js FitAddon required. | LOW | Embedded terminal | Use `@xterm/addon-fit`, debounced ResizeObserver |
| **Session state indicators** | Users need to know which sessions are working vs idle without switching tabs. | MEDIUM | JSONL file watching | Parse `~/.claude/projects/<encoded-cwd>/*.jsonl` for state |
| **CLAUDE.md viewer/editor** | Every Claude Code user has one. Editing in separate editor is friction. | MEDIUM | None (new page) | Section-aware editing with markdown preview |
| **Basic settings.json editor** | Permissions (allow/deny/ask) are the most common config users change. | MEDIUM | None (new page) | Structured form for permission arrays, not raw JSON |

## Differentiators

Features that set Grove apart. Not universally expected, but high-value for the worktree-centric workflow.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Worktree-aware terminal creation** | "Launch session in worktree" with one click, terminal appears as tab in Grove. None of the competitors tie terminal creation to worktree lifecycle. | LOW | Terminal tabs + existing worktree management | Key differentiator: merge a worktree and its terminal tab closes automatically |
| **Session state detection via JSONL parsing** | Richer than process-based detection. Can show: waiting for input, actively generating, tool use in progress, error state. Dashboard shows all sessions at a glance. | HIGH | File watcher on `~/.claude/projects/` | Incremental JSONL tail parsing. States: idle, thinking, tool_use, waiting, error |
| **Multi-session dashboard status** | Heat-map or status grid showing all active sessions across all projects. At-a-glance "which worktrees need attention." | MEDIUM | Session state detection | Builds on existing BranchTable, adds status column |
| **Skills browser and editor** | Browse `~/.claude/skills/` directory, view SKILL.md with frontmatter parsing, edit in-app. No competitor does this well. | MEDIUM | None (new page) | YAML frontmatter + markdown body. File tree for skill directories. |
| **Prompt templates** | Saved launch prompts per project. "Start a new feature" vs "Fix bug in module X" with pre-filled context. | LOW | Existing config model | Templates stored in project config JSON |
| **Context builder** | Visual builder for session launch: pick worktree + template + flags + model. Preview the full command before launching. | MEDIUM | Prompt templates + terminal | Replaces the `extra_flags` string array with structured UI |
| **Terminal search** | Search within terminal output. Essential for long Claude sessions. | LOW | Embedded terminal | Use `@xterm/addon-search` |
| **Session history / replay** | View past session transcripts from JSONL files. Search across sessions. | MEDIUM | JSONL parsing | Read-only viewer. Parse JSONL into conversation thread view. |

## Anti-Features

Features to explicitly NOT build. Each would pull Grove away from its strengths or add complexity that doesn't pay off.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full IDE / code editor** | Scope explosion. Users have VS Code/Cursor. Grove already launches VS Code via `launch_vscode()`. | Keep "Open in VS Code" button. Never embed a code editor. |
| **API cost tracking / token analytics** | Anthropic's own dashboard and Opcode both do this. Not Grove's domain. | Link to Anthropic usage dashboard if anything. |
| **MCP server management** | Complex, tangential to worktree workflow. Opcode already covers this. | Out of scope. Maybe v3.0 if demand exists. |
| **Cloud sync / remote sessions** | Violates PROJECT.md constraint: "Offline -- no cloud dependencies." Claude Code Desktop already does remote dispatch. | Stay local-only. This is a feature, not a limitation. |
| **Voice control / iOS companion** | Nimbalyst's territory. Massive scope for minimal value in a Windows-first desktop app. | Not planned. |
| **AI-powered merge conflict resolution** | Tempting but dangerous. PROJECT.md says "Non-destructive -- always preview first." AI merge resolution is inherently unpredictable. | Keep manual merge workflow with preview. Possibly highlight conflicts better. |
| **Diff viewer / PR review** | Claude Code Desktop does this. Adding a diff viewer is a rabbit hole. | Keep "Open in VS Code" for diffs. |
| **Agent orchestration / multi-agent coordination** | Claude Code itself now has Agent Teams (v2.0.60+). Building a parallel orchestrator would fight upstream. | Support launching multiple independent sessions. Let Claude Code handle orchestration internally. |
| **WYSIWYG markdown editor** | Over-engineered for CLAUDE.md editing. A split-pane source+preview is sufficient and far simpler. | Split pane: left = CodeMirror/Monaco with markdown, right = rendered preview |

## Feature Dependencies

```
Embedded Terminal (single PTY + xterm.js)
  |
  +-- Terminal Tabs (tab state management, multiple PTY instances)
  |     |
  |     +-- Worktree-aware terminal creation (launch into tab from dashboard)
  |     |     |
  |     |     +-- Terminal lifecycle tied to worktree (merge closes tab)
  |     |
  |     +-- Terminal search (@xterm/addon-search)
  |
  +-- Terminal resize handling (@xterm/addon-fit)

JSONL File Watching (fs watcher on ~/.claude/projects/)
  |
  +-- Session State Detection (parse last N entries for state)
  |     |
  |     +-- Dashboard Status Indicators (status column in BranchTable)
  |     |
  |     +-- Multi-session Dashboard (all-projects status grid)
  |
  +-- Session History / Replay (read full JSONL files)

CLAUDE.md Editor (standalone, no dependencies)
  |
  +-- Section-aware editing (parse ## headings as sections)

Skills Browser (standalone, no dependencies)
  |
  +-- Skills Editor (edit SKILL.md + manage references/)

Settings Editor (standalone, no dependencies)
  |
  +-- Permission rule builder (allow/deny/ask with tool patterns)

Prompt Templates (standalone, stored in config)
  |
  +-- Context Builder (combines template + worktree + flags)
        |
        +-- Launch into embedded terminal tab
```

## MVP Recommendation

**Phase 1: Embedded Terminal Foundation**
1. Single embedded terminal with PTY (table stakes -- everything else depends on this)
2. Terminal tabs with worktree association (table stakes + differentiator)
3. Terminal resize + search (table stakes polish)

**Phase 2: Session Intelligence**
4. JSONL file watching + session state detection (differentiator -- this is Grove's edge)
5. Dashboard status indicators (table stakes once state detection exists)

**Phase 3: Configuration Editors**
6. CLAUDE.md editor with section-aware editing (table stakes)
7. Settings/permissions editor (table stakes)
8. Skills browser and editor (differentiator)

**Phase 4: Launch Experience**
9. Prompt templates (differentiator)
10. Context builder (differentiator)

**Rationale:** Terminal first because it replaces the most visible v1 limitation (external windows). Session intelligence second because it differentiates from every competitor. Config editors third because they're independent and lower risk. Launch experience last because it builds on everything else.

**Defer:** Session history/replay. Valuable but not essential for v2.0 launch. Can ship as v2.1.

## Complexity Budget

| Feature Group | Estimated Complexity | Risk Level |
|---------------|---------------------|------------|
| Embedded terminal + tabs | HIGH | HIGH -- PTY on Windows (ConPTY) has known edge cases. This is the riskiest feature. |
| Session state via JSONL | MEDIUM | MEDIUM -- JSONL format could change between Claude Code versions. Need resilient parsing. |
| CLAUDE.md editor | MEDIUM | LOW -- Well-understood problem. Markdown parsing is mature. |
| Skills browser/editor | MEDIUM | LOW -- File system operations on known directory structure. |
| Settings editor | MEDIUM | LOW -- JSON schema is documented. Structured form. |
| Prompt templates | LOW | LOW -- Config extension, simple UI. |
| Context builder | MEDIUM | LOW -- UI complexity, not technical risk. |

## Sources

- [tauri-plugin-pty](https://crates.io/crates/tauri-plugin-pty) -- Tauri 2 PTY plugin wrapping portable-pty
- [xterm.js](https://xtermjs.org/) -- Terminal frontend component, used by VS Code
- [tauri-terminal example](https://github.com/marc2332/tauri-terminal) -- Reference implementation
- [Claude Code JSONL session tracking](https://deepwiki.com/agisota/missioncontrol/11.4-claude-code-session-tracking) -- Session file format and parsing patterns
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills) -- Skills directory structure and SKILL.md format
- [Claude Code permissions](https://code.claude.com/docs/en/permissions) -- settings.json permission structure (deny/allow/ask arrays)
- [Opcode (formerly Claudia)](https://github.com/winfunc/opcode) -- Primary competitor, Tauri 2 based
- [Nimbalyst comparison](https://nimbalyst.com/blog/best-claude-code-gui-tools-2026/) -- Competitive landscape overview
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) -- CLI flags and session options
- [@xterm/addon-fit](https://www.npmjs.com/package/@xterm/addon-fit) -- Terminal resize addon (scoped package, replaces deprecated xterm-addon-fit)
- [@xterm/addon-webgl](https://www.npmjs.com/package/@xterm/addon-webgl) -- GPU-accelerated rendering (scoped package)
