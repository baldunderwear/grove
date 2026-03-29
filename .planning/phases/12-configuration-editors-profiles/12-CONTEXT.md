# Phase 12: Configuration Editors & Profiles - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

CLAUDE.md visual editor with collapsible sections and merged preview. Skills browser with CRUD. Settings.json structured editor. Multi-account profiles with per-profile env vars, Claude config dirs, SSH keys, and launch flags. CodeMirror 6 for all editing.

</domain>

<decisions>
## Implementation Decisions

### Editor Stack (from research)
- CodeMirror 6 via @uiw/react-codemirror 4.25.x (not Monaco — 300KB vs 5MB)
- @codemirror/lang-markdown for CLAUDE.md editing
- @codemirror/lang-json for settings.json editing
- Grove brand dark theme for editor

### CLAUDE.md Editor
- Split pane: editor on left, live preview on right
- Collapsible sections based on ## headings
- Preview shows merged content: global ~/.claude/CLAUDE.md + project CLAUDE.md
- Read files via Tauri commands (not direct filesystem from frontend)

### Skills Browser
- List all .md files in .claude/skills/ (or .agents/skills/)
- Create new skill from template
- Edit existing skill with CodeMirror
- Delete with confirmation

### Settings Editor
- Structured form for .claude/settings.json
- Sections: permissions, hooks, MCP servers, environment
- JSON preview toggle

### Profiles
- Profile model: name, claude_config_dir, env vars map, ssh_key path, launch_flags array
- Projects assigned to profile (default profile if unset)
- Profile selector in sidebar
- Terminal launch inherits profile environment
- Stored in Grove's config.json alongside projects and settings

### Claude's Discretion
- Exact editor layout and tab navigation between editors
- Section collapse animation
- Profile editor form design
- Skills template content

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/pages/Settings.tsx` — existing settings page (extend with new tabs)
- `src-ui/src/stores/config-store.ts` — config management (add profiles)
- `src-tauri/src/config/models.rs` — config models (add Profile struct)
- `src-tauri/src/config/persistence.rs` — config persistence
- `src-tauri/src/terminal/commands.rs` — terminal_spawn (needs profile env injection)

### Integration Points
- New "Config" tab in main navigation (alongside Dashboard)
- Profile selector in sidebar (filter projects by profile)
- Terminal spawn injects profile env vars before PTY creation
- File read/write via new Tauri commands for CLAUDE.md, settings.json, skills

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: edit CLAUDE.md with preview, browse/create/edit/delete skills, edit settings.json, create profiles with env vars, projects inherit profile on launch

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
