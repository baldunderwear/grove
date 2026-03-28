# Phase 03: Git Operations Backend (Rust) - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Rust backend for all git operations — branch listing, status, merge, build bump. File system watcher on registered project paths. Atomic merge with rollback on failure. Event emission to frontend on git changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/config/` — Config models with ProjectConfig containing merge_target, branch_prefix, build_files, changelog
- `src-tauri/src/commands/config_commands.rs` — Existing Tauri command pattern with Mutex state
- git2 crate already in Cargo.toml (added in Phase 02 for repo validation)

### Established Patterns
- Tauri commands with `State<Mutex<AppConfig>>` for shared state
- serde serialization for frontend communication
- Error handling via custom ConfigError enum

### Integration Points
- New git commands registered alongside config commands in lib.rs
- File watcher events emitted to frontend via Tauri event system
- Git operations use project paths from AppConfig

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
