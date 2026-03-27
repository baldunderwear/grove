# Phase 01: Project Scaffolding & Core Shell - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Tauri 2 + React 19 + TypeScript project with system tray, window management, and build pipeline. Produces a Windows installer (MSI) via CI. App shows tray icon, opens/closes main window.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `grove-launcher.ps1` — existing PowerShell launcher (being replaced by this app)
- `.planning/` — project planning artifacts with tech research notes

### Established Patterns
- No existing app code — this phase creates the foundation
- Tech research in `.planning/research/` covers Tauri 2, git2, system tray, process management

### Integration Points
- System tray icon with basic context menu (Open, Quit)
- Main window show/hide from tray
- Tauri bundler producing Windows installer
- GitHub Actions CI for Windows release builds

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
