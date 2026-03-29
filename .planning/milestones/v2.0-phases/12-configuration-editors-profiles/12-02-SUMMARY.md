---
phase: 12-configuration-editors-profiles
plan: 02
subsystem: ui
tags: [codemirror, markdown-editor, claude-md, split-pane, fold-gutter]

requires:
  - phase: 12-configuration-editors-profiles
    provides: File I/O Tauri commands (read_text_file, write_text_file), CodeMirror 6 packages
provides:
  - ClaudeMdEditor component with split-pane editor/preview
  - MergedPreview component for global + project CLAUDE.md display
  - groveEditorTheme with Grove-branded dark theme and syntax highlighting
  - useFileEditor hook for file load/save with dirty tracking
affects: [12-03-PLAN, 12-04-PLAN, 12-05-PLAN]

tech-stack:
  added: ["@codemirror/language (foldGutter, foldService)", "@lezer/highlight (syntax tags)"]
  patterns: [markdown-fold-service, section-outline-navigation, split-pane-editor-preview]

key-files:
  created:
    - src-ui/src/components/config/ClaudeMdEditor.tsx
    - src-ui/src/components/config/MergedPreview.tsx
  modified:
    - src-ui/src/components/config/EditorTheme.ts
    - src-ui/src/hooks/useFileEditor.ts

key-decisions:
  - "EditorView.theme() (CM6 native) instead of @uiw/codemirror-themes createTheme -- avoids extra dependency"
  - "Markdown fold service based on heading level hierarchy -- folds content between same/higher-level headings"
  - "Section outline as clickable pills in toolbar bar -- complements fold gutter with quick navigation"
  - "homeDir() from @tauri-apps/api/path for global CLAUDE.md resolution"

patterns-established:
  - "Split-pane editor pattern: CodeMirror left, preview right, toolbar above"
  - "Markdown fold service: foldService.of() with heading-level range detection"
  - "Section outline: parseHeadings() + scrollIntoView dispatch for heading navigation"

requirements-completed: [CONF-01, CONF-02, CONF-05, CONF-06, NFR-09]

duration: 4min
completed: 2026-03-29
---

# Phase 12 Plan 02: CLAUDE.md Editor Summary

**CodeMirror markdown editor with Grove dark theme, collapsible heading sections, and merged global+project preview pane**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T19:25:55Z
- **Completed:** 2026-03-29T19:29:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Grove-branded dark theme (EditorTheme.ts) with full syntax highlighting mapping all Grove CSS variables
- ClaudeMdEditor with split-pane layout: CodeMirror markdown editor (left) + MergedPreview (right)
- Fold gutter with custom markdown fold service that collapses content between heading levels
- Section outline toolbar with clickable heading pills for quick navigation via scrollIntoView
- useFileEditor hook with Tauri invoke load/save, dirty tracking, and NFR-09 performance timing

## Task Commits

Each task was committed atomically:

1. **Task 1: EditorTheme and useFileEditor hook** - `8134325` (feat)
2. **Task 2: ClaudeMdEditor with collapsible sections and MergedPreview** - `089d6b7` (feat)

## Files Created/Modified
- `src-ui/src/components/config/EditorTheme.ts` - Grove dark theme with syntax highlighting for CodeMirror 6
- `src-ui/src/hooks/useFileEditor.ts` - File load/save hook with dirty tracking and performance timing
- `src-ui/src/components/config/ClaudeMdEditor.tsx` - Split-pane CLAUDE.md editor with fold gutter and section outline
- `src-ui/src/components/config/MergedPreview.tsx` - Read-only merged preview of global + project CLAUDE.md

## Decisions Made
- Used EditorView.theme() (CodeMirror 6 native) instead of @uiw/codemirror-themes createTheme to avoid extra dependency
- Custom foldService for markdown heading hierarchy (folds between same/higher-level headings)
- Section outline as toolbar pills complements fold gutter -- two navigation approaches
- Path resolution tries .claude/CLAUDE.md first, falls back to root CLAUDE.md
- homeDir() from @tauri-apps/api/path for cross-platform global CLAUDE.md path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- node_modules on NAS (Z: drive) not accessible; packages installed at ~/grove-src-ui/node_modules via ui-setup.sh
- @uiw/codemirror-themes not available (not installed); used EditorView.theme() directly instead

## Known Stubs
None - all components are fully implemented with real Tauri invoke calls.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- groveEditorTheme reusable by skills browser (Plan 03) and settings editor (Plan 04)
- useFileEditor hook reusable by all file-editing components
- ClaudeMdEditor pattern (split-pane + toolbar) establishes UI pattern for other editors

---
*Phase: 12-configuration-editors-profiles*
*Completed: 2026-03-29*
