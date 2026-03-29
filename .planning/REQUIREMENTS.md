# REQUIREMENTS.md

## Grove v2.0 — Mission Control

### Terminal Embedding
- [x] **TERM-01**: User can launch Claude Code in an embedded terminal tab instead of an external window
- [ ] **TERM-02**: Multiple terminal tabs open simultaneously, one per worktree
- [ ] **TERM-03**: Terminal tabs show branch name and session duration in the tab header
- [ ] **TERM-04**: User can resize terminal panes (split view: branch list + terminal)
- [x] **TERM-05**: Terminal supports full ANSI rendering (colors, cursor movement, clearing)
- [ ] **TERM-06**: Closing a terminal tab kills the session and child processes cleanly (Job Objects)
- [ ] **TERM-07**: Terminal preserves scrollback history per session

### Session Intelligence
- [ ] **SESS-01**: Detect session state in real-time: waiting for input, working, idle, error
- [ ] **SESS-02**: Dashboard shows aggregate status ("3 working, 2 waiting for input")
- [ ] **SESS-03**: Status indicator per terminal tab (colored dot: green=working, amber=waiting, gray=idle, red=error)
- [ ] **SESS-04**: Notification when a session transitions to "waiting for input"
- [ ] **SESS-05**: Session history: git diff since session start, duration, state timeline

### Configuration Editors
- [ ] **CONF-01**: Visual editor for CLAUDE.md with section-aware editing (collapsible sections)
- [ ] **CONF-02**: Preview mode showing what Claude will see (merged global + project CLAUDE.md)
- [ ] **CONF-03**: Skills browser listing all skills in `.claude/skills/` with create/edit/delete
- [ ] **CONF-04**: Settings editor for `.claude/settings.json` (permissions, hooks, MCP servers)
- [ ] **CONF-05**: Syntax highlighting for markdown and JSON editing (CodeMirror)
- [ ] **CONF-06**: Save with validation (JSON syntax check, markdown preview)

### Launch Experience
- [ ] **LAUNCH-01**: Prompt templates: save reusable prompts with variables ({branch}, {issue})
- [ ] **LAUNCH-02**: Context builder: select files to include as context when launching
- [ ] **LAUNCH-03**: "Launch with prompt" — open terminal tab and auto-send initial prompt
- [ ] **LAUNCH-04**: Batch launch: start Claude Code on multiple worktrees simultaneously

### Profiles & Multi-Account
- [ ] **PROF-01**: User can create named profiles (e.g., "Personal", "Work") with distinct Claude config directory, env vars, and SSH key
- [ ] **PROF-02**: Each project is assigned to a profile; launching sessions inherits that profile's environment
- [ ] **PROF-03**: Profile selector in sidebar or top bar to filter projects by identity
- [ ] **PROF-04**: Profile editor for managing environment variables, launch flags, and Claude config paths
- [ ] **PROF-05**: Default profile applied when no profile is explicitly set on a project

### Non-Functional
- [x] **NFR-05**: Terminal I/O uses Tauri Channels (not events) for throughput
- [x] **NFR-06**: PTY operations resolve UNC paths to drive letters before spawning
- [x] **NFR-07**: No visible CMD windows from PTY operations (CREATE_NO_WINDOW)
- [x] **NFR-08**: Terminal rendering at 60fps with WebGL addon fallback to canvas
- [ ] **NFR-09**: Config editors load files < 100ms, handle files up to 500KB

### Future (Deferred)
- GitHub Issues integration (create worktree from issue)
- Agent orchestration (Claude Code has native Agent Teams)
- API cost tracking (use Anthropic dashboard)
- WYSIWYG markdown editing (scope trap)
- macOS/Linux support

### Out of Scope
- Cloud sync of configuration (offline-only app)
- AI features beyond launching Claude Code (no built-in LLM calls)
- Plugin/extension system

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TERM-01 | Phase 09 | Complete |
| TERM-02 | Phase 10 | Pending |
| TERM-03 | Phase 10 | Pending |
| TERM-04 | Phase 09 | Pending |
| TERM-05 | Phase 09 | Complete |
| TERM-06 | Phase 10 | Pending |
| TERM-07 | Phase 10 | Pending |
| SESS-01 | Phase 11 | Pending |
| SESS-02 | Phase 11 | Pending |
| SESS-03 | Phase 11 | Pending |
| SESS-04 | Phase 11 | Pending |
| SESS-05 | Phase 11 | Pending |
| CONF-01 | Phase 12 | Pending |
| CONF-02 | Phase 12 | Pending |
| CONF-03 | Phase 12 | Pending |
| CONF-04 | Phase 12 | Pending |
| CONF-05 | Phase 12 | Pending |
| CONF-06 | Phase 12 | Pending |
| LAUNCH-01 | Phase 13 | Pending |
| LAUNCH-02 | Phase 13 | Pending |
| LAUNCH-03 | Phase 13 | Pending |
| LAUNCH-04 | Phase 13 | Pending |
| NFR-05 | Phase 09 | Complete |
| NFR-06 | Phase 09 | Complete |
| NFR-07 | Phase 09 | Complete |
| NFR-08 | Phase 09 | Complete |
| NFR-09 | Phase 12 | Pending |
| PROF-01 | Phase 12 | Pending |
| PROF-02 | Phase 12 | Pending |
| PROF-03 | Phase 12 | Pending |
| PROF-04 | Phase 12 | Pending |
| PROF-05 | Phase 12 | Pending |
