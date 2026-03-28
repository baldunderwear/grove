# Phase 02: Project Registry & Configuration - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can register git repos, configure per-project merge rules (merge target, branch prefix, build files, changelog), manage global settings, and persist all config to disk. Config survives restart.

</domain>

<decisions>
## Implementation Decisions

### Configuration Storage & Structure
- Store config in `%APPDATA%/grove/config.json` — standard Windows app data location via Tauri's `app_data_dir()`
- Single config file with `projects[]` array + `settings` object — simple, human-readable, easy to debug
- Include `version: 1` field for future schema migration
- Hardcoded defaults in Rust, config only stores overrides — less noise in config file

### Project Registration UX
- "Add Project" button → native directory picker → auto-detect git repo → show config form
- Auto-detect: repo name, branches, remote URL. Manual entry: merge target, branch prefix, build files, changelog config
- Health validation on add + periodic: check path exists, is git repo, has merge target branch. Show red/green indicators
- Sidebar list with project name + health dot — click to expand config

### Settings & Persistence Patterns
- Global settings scope: theme (dark only for v1), refresh interval, start on login, start minimized
- Inline form fields in settings page — direct editing, auto-save on blur
- Rust Tauri commands (`get_config`, `save_config`, `add_project`, `remove_project`) called from React via `invoke()`
- Zustand store with `useConfigStore` — load on app start, sync to disk via Tauri commands

### Claude's Discretion
- Exact form field layout and ordering
- Error message wording and validation UX
- Internal Rust data structures (serde models)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/lib.rs` — Tauri app setup with tray, window management (extend with new commands)
- `src-ui/src/App.tsx` — Basic shell with Tailwind dark theme
- Zustand listed in stack (PROJECT.md) — not yet installed

### Established Patterns
- Tauri 2 command pattern: Rust functions called via `invoke()` from React
- Tailwind v4 via `@tailwindcss/vite` plugin
- Dark theme (gray-900 bg, white text)
- NAS workaround: node_modules on local C: drive via scripts/with-modules.mjs

### Integration Points
- New Tauri commands registered in `lib.rs` setup
- New React routes/pages for project list, config editor, settings
- Config file created on first launch if doesn't exist

</code_context>

<specifics>
## Specific Ideas

- Config model matches PROJECT.md example: name, path, merge_target, branch_prefix, build_files[], changelog{}
- Exit criteria: register sol-lune with build file patterns AND a second repo without build files. Config survives restart.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
