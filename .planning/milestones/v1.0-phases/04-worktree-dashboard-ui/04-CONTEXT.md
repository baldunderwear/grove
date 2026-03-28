# Phase 04: Worktree Dashboard UI - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Main dashboard showing all worktree branches for a selected project with status, activity, and actions. Includes project selector, branch list with sort controls, stale branch indicators, and auto-refresh.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout
- Branch list as a table/card grid in the main content area (right of sidebar from Phase 02)
- Project selector integrated into sidebar — clicking a project shows its branches in main content
- Responsive layout using Tailwind grid/flex

### Branch Display
- Each branch row shows: name, commits ahead/behind target, last commit date, dirty/clean badge
- Stale branches (> 7 days since last commit) get a muted/warning indicator
- Sort controls: by activity (most recent first, default), by name (alphabetical), by commits ahead

### Refresh Behavior
- Auto-refresh using the configurable interval from global settings (default 30s)
- Manual refresh button in the dashboard header
- Loading state during refresh (subtle spinner, not full-page overlay)
- Leverage file watcher events from Phase 03 for instant updates on local changes

### Claude's Discretion
- Exact table vs card layout for branch list
- Animation/transition details
- Exact placement of sort controls
- Empty state when project has no worktree branches

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/stores/config-store.ts` — Zustand config store with project selection
- `src-ui/src/components/ui/*` — 9 shadcn components (badge, card, button, etc.)
- `src-tauri/src/commands/git_commands.rs` — list_branches, branch_status, is_worktree_dirty Tauri commands
- `src-ui/src/types/config.ts` — TypeScript types for config
- `src-ui/src/layout/Sidebar.tsx` — Project sidebar with health dots

### Established Patterns
- Tauri invoke() for backend calls
- Zustand for state management
- shadcn/ui components with emerald-500 accent, dark theme
- Auto-save on blur pattern from config store

### Integration Points
- Dashboard replaces EmptyState when a project is selected
- Branch data from list_branches Tauri command
- File watcher events via Tauri event listener for real-time updates
- Settings refresh_interval for auto-refresh timing

</code_context>

<specifics>
## Specific Ideas

- Exit criteria: show all 30+ sol-lune worktree branches with correct commit counts and status
- Auto-refresh every 30s (configurable via settings)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
