# Roadmap: Grove

## Milestones

- v1.0 Worktree Manager (Phases 01-08) - SHIPPED 2026-03-28
- v1.1 Brand & Polish (shipped 2026-03-29)
- v2.0 Mission Control (Phases 09-13) - In Progress

## Phases

<details>
<summary>v1.0 Worktree Manager (Phases 01-08) - SHIPPED 2026-03-28</summary>

8 phases, 22 plans, 6,535 LOC. Full archive: milestones/v1.0-ROADMAP.md

</details>

### v2.0 Mission Control

**Milestone Goal:** Transform Grove from a worktree manager into a full Claude Code command center with embedded terminals, session intelligence, and configuration editors.

- [x] **Phase 09: Terminal Foundation (ConPTY Spike)** - Validate portable-pty on Windows, deliver single embedded terminal with PTY (completed 2026-03-29)
- [x] **Phase 10: Multi-Terminal Tabs** - Multiple terminal tabs tied to worktrees with process tree cleanup (completed 2026-03-29)
- [x] **Phase 11: Session Intelligence** - Real-time session state detection with dashboard status indicators (completed 2026-03-29)
- [x] **Phase 12: Configuration Editors** - CLAUDE.md, settings.json, and skills editors with CodeMirror (completed 2026-03-29)
- [ ] **Phase 13: Launch Experience** - Prompt templates, context builder, and batch launch

## Phase Details

### Phase 09: Terminal Foundation (ConPTY Spike)
**Goal**: User can launch Claude Code inside Grove in an embedded terminal that works correctly on Windows, including NAS-hosted repos
**Depends on**: v1.0/v1.1 (existing app)
**Requirements**: TERM-01, TERM-04, TERM-05, NFR-05, NFR-06, NFR-07, NFR-08
**Success Criteria** (what must be TRUE):
  1. User can click "Launch" on a worktree and Claude Code opens in an embedded terminal tab inside Grove (not an external window)
  2. Terminal renders full ANSI colors, cursor movement, and clearing correctly (run `clear`, use arrow keys, see colored output)
  3. Terminal resizes fluidly when the user drags the pane divider or resizes the Grove window, with no 1-column collapse or phantom scrollbars
  4. No visible cmd.exe window flashes during terminal launch in release builds
  5. Terminal works for worktrees on NAS-mounted drives (Z: drive / UNC paths)
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md -- Rust backend: UNC utils extraction, portable-pty, TerminalManager, Channel streaming
- [x] 09-02-PLAN.md -- Frontend: xterm.js hook, TerminalPanel, TerminalToolbar, terminal store
- [x] 09-03-PLAN.md -- Integration: Dashboard split-pane, Launch button wiring, ConPTY spike validation
**UI hint**: yes

### Phase 10: Multi-Terminal Tabs
**Goal**: User can run multiple Claude Code sessions simultaneously in separate tabs, each tied to a worktree, with clean process lifecycle management
**Depends on**: Phase 09
**Requirements**: TERM-02, TERM-03, TERM-06, TERM-07
**Success Criteria** (what must be TRUE):
  1. User can open multiple terminal tabs simultaneously, each showing its worktree branch name and session duration
  2. Switching between terminal tabs preserves scrollback history and terminal state (no blank screens, no re-renders)
  3. Closing a terminal tab kills the Claude Code process and ALL its child processes (no zombie processes in Task Manager)
  4. Hiding Grove to system tray and restoring it preserves all terminal tabs and their content
**Plans**: 2 plans
Plans:
- [x] 10-01-PLAN.md -- Rust: Windows Job Objects for process tree cleanup on terminal close
- [x] 10-02-PLAN.md -- Frontend: Multi-tab terminal store, tab bar, multi-instance TerminalPanel, Dashboard wiring
**UI hint**: yes

### Phase 11: Session Intelligence
**Goal**: User can see at a glance which Claude Code sessions are working, waiting for input, idle, or errored without switching tabs
**Depends on**: Phase 10
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. Each terminal tab shows a colored status dot (green=working, amber=waiting, gray=idle, red=error) that updates in real-time
  2. Dashboard shows aggregate session status (e.g., "3 working, 2 waiting for input") across all open terminals
  3. User receives a desktop notification when any session transitions to "waiting for input"
  4. User can view session history for any terminal: git diff since session start, duration, and state timeline
**Plans**: 3 plans
Plans:
- [x] 11-01-PLAN.md -- Rust backend: ANSI stripper, state parser, PTY dual-stream wiring
- [x] 11-02-PLAN.md -- Frontend: terminal store state, status dots, aggregate header, notifications
- [x] 11-03-PLAN.md -- Session history: git diff, state timeline, history panel UI
**UI hint**: yes

### Phase 12: Configuration Editors & Profiles
**Goal**: User can view and edit Claude Code configuration files (CLAUDE.md, settings.json, skills) and manage multi-account profiles directly inside Grove
**Depends on**: v1.0/v1.1 (independent of terminal work)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, NFR-09
**Success Criteria** (what must be TRUE):
  1. User can open CLAUDE.md in a split-pane editor with collapsible sections and a live preview showing merged global + project content
  2. User can browse, create, edit, and delete skills in `.claude/skills/` through a visual browser
  3. User can edit `.claude/settings.json` with a structured form for permissions, hooks, and MCP servers
  4. All editors provide syntax highlighting (markdown and JSON) and validate before save (JSON syntax check, markdown preview)
  5. Config files load in under 100ms and editors handle files up to 500KB without jank
  6. User can create named profiles (Personal, Work) with distinct Claude config dirs, env vars, SSH keys, and launch flags
  7. Projects assigned to a profile launch sessions with that profile's environment automatically
**Plans**: 5 plans
Plans:
- [x] 12-01-PLAN.md -- Rust backend: file I/O commands, Profile model + CRUD, CodeMirror install
- [x] 12-02-PLAN.md -- CLAUDE.md editor with collapsible sections and merged preview
- [x] 12-03-PLAN.md -- Skills browser + Settings.json structured editor
- [x] 12-04-PLAN.md -- Profile UI: editor form, sidebar selector, config store
- [x] 12-05-PLAN.md -- Integration: Config page routing, sidebar wiring, profile env injection
**UI hint**: yes

### Phase 13: Launch Experience
**Goal**: User can prepare and launch Claude Code sessions with saved prompts, selected context files, and batch operations across multiple worktrees
**Depends on**: Phase 09, Phase 12
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04
**Success Criteria** (what must be TRUE):
  1. User can save reusable prompt templates with variables ({branch}, {issue}) and select one when launching a session
  2. User can select specific files to include as context before launching Claude Code
  3. User can "launch with prompt" which opens a terminal tab and auto-sends the initial prompt to Claude Code
  4. User can batch-launch Claude Code on multiple worktrees simultaneously with one action
**Plans**: 3 plans
Plans:
- [ ] 13-01-PLAN.md -- Rust + TS: PromptTemplate model, CRUD commands, frontend types and store actions
- [ ] 13-02-PLAN.md -- Launch dialog: template selector, context file picker, launch-with-prompt auto-send
- [ ] 13-03-PLAN.md -- Batch launch: multi-select checkboxes, batch dialog, multi-worktree launch
**UI hint**: yes

## Progress

**Execution Order:** Phases 09-13 execute sequentially (09 and 10 are strict dependencies; 12 can overlap with 10/11 if desired).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 09. Terminal Foundation | v2.0 | 3/3 | Complete    | 2026-03-29 |
| 10. Multi-Terminal Tabs | v2.0 | 2/2 | Complete    | 2026-03-29 |
| 11. Session Intelligence | v2.0 | 3/3 | Complete    | 2026-03-29 |
| 12. Configuration Editors | v2.0 | 5/5 | Complete    | 2026-03-29 |
| 13. Launch Experience | v2.0 | 0/3 | Not started | - |
