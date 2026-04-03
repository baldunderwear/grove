# REQUIREMENTS.md

## Grove v2.0 — Mission Control

### Terminal Embedding
- [x] **TERM-01**: User can launch Claude Code in an embedded terminal tab instead of an external window
- [x] **TERM-02**: Multiple terminal tabs open simultaneously, one per worktree
- [x] **TERM-03**: Terminal tabs show branch name and session duration in the tab header
- [x] **TERM-04**: User can resize terminal panes (split view: branch list + terminal)
- [x] **TERM-05**: Terminal supports full ANSI rendering (colors, cursor movement, clearing)
- [x] **TERM-06**: Closing a terminal tab kills the session and child processes cleanly (Job Objects)
- [x] **TERM-07**: Terminal preserves scrollback history per session

### Session Intelligence
- [x] **SESS-01**: Detect session state in real-time: waiting for input, working, idle, error
- [x] **SESS-02**: Dashboard shows aggregate status ("3 working, 2 waiting for input")
- [x] **SESS-03**: Status indicator per terminal tab (colored dot: green=working, amber=waiting, gray=idle, red=error)
- [x] **SESS-04**: Notification when a session transitions to "waiting for input"
- [x] **SESS-05**: Session history: git diff since session start, duration, state timeline

### Configuration Editors
- [ ] **CONF-01**: Visual editor for CLAUDE.md with section-aware editing (collapsible sections)
- [ ] **CONF-02**: Preview mode showing what Claude will see (merged global + project CLAUDE.md)
- [x] **CONF-03**: Skills browser listing all skills in `.claude/skills/` with create/edit/delete
- [x] **CONF-04**: Settings editor for `.claude/settings.json` (permissions, hooks, MCP servers)
- [x] **CONF-05**: Syntax highlighting for markdown and JSON editing (CodeMirror)
- [x] **CONF-06**: Save with validation (JSON syntax check, markdown preview)

### Launch Experience
- [x] **LAUNCH-01**: Prompt templates: save reusable prompts with variables ({branch}, {issue})
- [x] **LAUNCH-02**: Context builder: select files to include as context when launching
- [x] **LAUNCH-03**: "Launch with prompt" — open terminal tab and auto-send initial prompt
- [x] **LAUNCH-04**: Batch launch: start Claude Code on multiple worktrees simultaneously

### Profiles & Multi-Account
- [x] **PROF-01**: User can create named profiles (e.g., "Personal", "Work") with distinct Claude config directory, env vars, and SSH key
- [x] **PROF-02**: Each project is assigned to a profile; launching sessions inherits that profile's environment
- [x] **PROF-03**: Profile selector in sidebar or top bar to filter projects by identity
- [x] **PROF-04**: Profile editor for managing environment variables, launch flags, and Claude config paths
- [x] **PROF-05**: Default profile applied when no profile is explicitly set on a project

### Non-Functional
- [x] **NFR-05**: Terminal I/O uses Tauri Channels (not events) for throughput
- [x] **NFR-06**: PTY operations resolve UNC paths to drive letters before spawning
- [x] **NFR-07**: No visible CMD windows from PTY operations (CREATE_NO_WINDOW)
- [x] **NFR-08**: Terminal rendering at 60fps with WebGL addon fallback to canvas
- [x] **NFR-09**: Config editors load files < 100ms, handle files up to 500KB

## Grove v2.1 — Session Lifecycle

### Toast Notifications
- [x] **TOAST-01**: User sees toast notification when session transitions to waiting, idle, or error
- [x] **TOAST-02**: User can click "View Session" on toast to navigate to that session tab
- [x] **TOAST-03**: Error toasts persist until dismissed; info toasts auto-dismiss after 5s
- [x] **TOAST-04**: Max 3 toasts visible simultaneously with priority ordering
- [ ] **TOAST-05**: Merge queue progress updates existing toast in-place rather than spawning new ones

### Post-Session Flow

- [ ] **POST-01**: User sees a diff summary (files changed, insertions, deletions, commits) when a session exits
- [ ] **POST-02**: User can initiate merge from an exited session card with one click
- [ ] **POST-03**: User is guided through a multi-step wizard: diff summary → commit review → merge → cleanup
- [ ] **POST-04**: User is prompted to delete worktree and branch after successful merge
- [ ] **POST-05**: Non-zero exit codes show a distinct "session crashed" prompt vs clean exit
- [ ] **POST-06**: Post-session workflow never auto-triggers; always requires explicit user action

### Merge Engine

- [x] **MERGE-01**: Merge pipeline is decomposed into composable steps (preview → execute → bump → changelog → commit)
- [x] **MERGE-02**: User can select multiple branches and merge them sequentially with auto-build-bump between each
- [ ] **MERGE-03**: User can drag-reorder branches in the merge queue before execution
- [x] **MERGE-04**: If any branch fails to merge, all completed merges in the queue roll back to pre-queue state
- [x] **MERGE-05**: Build numbers are sequenced in-memory by the queue orchestrator (no disk-read between merges)
- [x] **MERGE-06**: File watcher is suppressed during queue execution to prevent cascade refreshes
- [ ] **MERGE-07**: User sees per-branch progress during queue execution

### Launch Path Cleanup

- [x] **LPATH-01**: SessionManager is the sole path for launching Claude Code sessions
- [x] **LPATH-02**: External launch commands (wt.exe/cmd.exe path) and PID-based session tracking are fully removed
- [x] **LPATH-03**: All references to removed infrastructure are cleaned up (imports, command registrations, polling)

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
| TERM-02 | Phase 10 | Complete |
| TERM-03 | Phase 10 | Complete |
| TERM-04 | Phase 09 | Complete |
| TERM-05 | Phase 09 | Complete |
| TERM-06 | Phase 10 | Complete |
| TERM-07 | Phase 10 | Complete |
| SESS-01 | Phase 11 | Complete |
| SESS-02 | Phase 11 | Complete |
| SESS-03 | Phase 11 | Complete |
| SESS-04 | Phase 11 | Complete |
| SESS-05 | Phase 11 | Complete |
| CONF-01 | Phase 12 | Pending |
| CONF-02 | Phase 12 | Pending |
| CONF-03 | Phase 12 | Complete |
| CONF-04 | Phase 12 | Complete |
| CONF-05 | Phase 12 | Complete |
| CONF-06 | Phase 12 | Complete |
| LAUNCH-01 | Phase 13 | Complete |
| LAUNCH-02 | Phase 13 | Complete |
| LAUNCH-03 | Phase 13 | Complete |
| LAUNCH-04 | Phase 13 | Complete |
| NFR-05 | Phase 09 | Complete |
| NFR-06 | Phase 09 | Complete |
| NFR-07 | Phase 09 | Complete |
| NFR-08 | Phase 09 | Complete |
| NFR-09 | Phase 12 | Complete |
| PROF-01 | Phase 12 | Complete |
| PROF-02 | Phase 12 | Complete |
| PROF-03 | Phase 12 | Complete |
| PROF-04 | Phase 12 | Complete |
| PROF-05 | Phase 12 | Complete |
| TOAST-01 | Phase 14 | Complete |
| TOAST-02 | Phase 14 | Complete |
| TOAST-03 | Phase 14 | Complete |
| TOAST-04 | Phase 14 | Complete |
| TOAST-05 | Phase 17 | Pending |
| POST-01 | Phase 15 | Pending |
| POST-02 | Phase 15 | Pending |
| POST-03 | Phase 18 | Pending |
| POST-04 | Phase 18 | Pending |
| POST-05 | Phase 15 | Pending |
| POST-06 | Phase 15 | Pending |
| MERGE-01 | Phase 16 | Complete |
| MERGE-02 | Phase 17 | Complete |
| MERGE-03 | Phase 17 | Pending |
| MERGE-04 | Phase 17 | Complete |
| MERGE-05 | Phase 17 | Complete |
| MERGE-06 | Phase 17 | Complete |
| MERGE-07 | Phase 17 | Pending |
| LPATH-01 | Phase 14 | Complete |
| LPATH-02 | Phase 14 | Complete |
| LPATH-03 | Phase 14 | Complete |
