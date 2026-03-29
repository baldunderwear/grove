# Phase 13: Launch Experience - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Prompt templates with variables, context file selector, "launch with prompt" auto-send, batch launch across multiple worktrees. Builds on terminal tabs (Phase 10) and config storage (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Prompt Templates
- Stored in Grove config.json under templates[] array
- Variables: {branch}, {project}, {path} auto-substituted at launch
- Template CRUD in config editors or dedicated templates page
- Select template when launching a session

### Context Builder
- File picker to select files from the project directory
- Selected files passed as --file flags to Claude Code launch
- UI shows file list with add/remove before launch

### Launch with Prompt
- After terminal opens, auto-send the prompt text to PTY stdin
- Small delay after Claude Code startup before sending (detect ready state)
- Works with or without template

### Batch Launch
- Select multiple worktrees from dashboard, click "Batch Launch"
- Opens one terminal tab per selected worktree
- Optional: apply same prompt template to all

### Claude's Discretion
- Template editor UI design
- Context file picker implementation (tree view vs flat list)
- Batch selection UX (checkboxes vs multi-select)
- Delay timing before auto-send

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/terminal/commands.rs` — terminal_spawn, terminal_write
- `src-ui/src/stores/terminal-store.ts` — addTab for creating new terminal tabs
- `src-ui/src/stores/config-store.ts` — config persistence with profiles
- `src-ui/src/components/terminal/TerminalPanel.tsx` — terminal rendering
- `src-ui/src/pages/Dashboard.tsx` — branch list with launch button
- `src-tauri/src/commands/file_commands.rs` — list_directory, read_text_file

### Integration Points
- Template storage in config.json
- Launch flow: select template → pick context files → open terminal → auto-send prompt
- Batch launch creates multiple tabs via existing addTab
- Context files passed as CLI flags to claude command

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: save prompt templates, select context files, launch with auto-prompt, batch launch multiple worktrees

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
