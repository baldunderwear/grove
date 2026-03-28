# Phase 04: Worktree Dashboard UI - Research

**Researched:** 2026-03-28
**Domain:** React dashboard UI — Tauri invoke, Zustand state, shadcn table, auto-refresh polling
**Confidence:** HIGH

## Summary

This phase builds the main dashboard view that displays all worktree branches for a selected project. The backend Tauri commands (`list_branches`, `is_worktree_dirty`) already exist from Phase 03 and return `BranchInfo` structs with name, ahead/behind, last commit message/timestamp, dirty status, and worktree path. The frontend work is: (1) a new Zustand store for branch data with fetch/refresh logic, (2) a branch table component using shadcn Table, (3) sort controls via shadcn DropdownMenu, (4) loading skeletons, (5) auto-refresh timer + file watcher event integration, and (6) routing the `activeView` to show the dashboard when a project is selected.

The existing codebase provides a solid foundation: config store with `selectProject`, sidebar with project list, shadcn component library (9 components installed), Tailwind v4, and established patterns (invoke for backend calls, Zustand for state). Three new shadcn components need installing (Table, DropdownMenu, Skeleton). The Tauri event API (`listen` from `@tauri-apps/api/event`) is available for subscribing to `"git-changed"` events from the file watcher.

**Primary recommendation:** Create a dedicated `useBranchStore` Zustand store for branch data/loading/error state, wire it to the existing config store's `selectedProjectId`, and build the dashboard as a self-contained page component that mounts when `activeView === 'project'` (replacing the current `ProjectConfig` view or adding a new `'dashboard'` view).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Branch list as a table/card grid in the main content area (right of sidebar from Phase 02)
- Project selector integrated into sidebar -- clicking a project shows its branches in main content
- Responsive layout using Tailwind grid/flex
- Each branch row shows: name, commits ahead/behind target, last commit date, dirty/clean badge
- Stale branches (> 7 days since last commit) get a muted/warning indicator
- Sort controls: by activity (most recent first, default), by name (alphabetical), by commits ahead
- Auto-refresh using the configurable interval from global settings (default 30s)
- Manual refresh button in the dashboard header
- Loading state during refresh (subtle spinner, not full-page overlay)
- Leverage file watcher events from Phase 03 for instant updates on local changes

### Claude's Discretion
- Exact table vs card layout for branch list
- Animation/transition details
- Exact placement of sort controls
- Empty state when project has no worktree branches

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-02.1 | Display all worktree branches for selected project matching branch prefix | `list_branches` Tauri command already returns filtered `Vec<BranchInfo>` by prefix |
| FR-02.2 | Show per-branch: name, commits ahead/behind, last commit message, last commit date | `BranchInfo` struct has all fields: `name`, `ahead`, `behind`, `last_commit_message`, `last_commit_timestamp` |
| FR-02.3 | Show per-branch: dirty/clean status | `BranchInfo.is_dirty` boolean already computed by backend |
| FR-02.4 | Show per-branch: whether Claude Code session is active | Placeholder badge only in this phase -- actual detection is Phase 05 |
| FR-02.5 | Sort by activity (default), name, or commits ahead | Client-side sort on `last_commit_timestamp`, `name`, `ahead` fields |
| FR-02.6 | Visual indicators: merge-ready, stale, active session | Derived from BranchInfo: merge-ready = ahead > 0 && !is_dirty; stale = timestamp > 7 days ago |
| FR-02.7 | Auto-refresh on configurable interval (default 30s) | `settings.refresh_interval` available in config store; `setInterval` + cleanup pattern |
| FR-02.8 | Manual refresh button | Refresh button triggers same fetch flow with spinning icon feedback |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.0.0 | UI framework | Already in project |
| Zustand | ^5.0.0 | State management | Already in project, established pattern |
| @tauri-apps/api | ^2.0.0 | Backend communication (invoke + listen) | Already in project |
| lucide-react | ^1.7.0 | Icons (RefreshCw, ArrowUpDown, Clock, GitBranch, Terminal) | Already in project |
| Tailwind CSS | ^4.0.0 | Styling | Already in project via @tailwindcss/vite |

### Supporting (shadcn components to install)
| Component | Purpose | Install Command |
|-----------|---------|-----------------|
| Table | Branch list table with header + rows | `npx shadcn@latest add table` |
| DropdownMenu | Sort selector dropdown | `npx shadcn@latest add dropdown-menu` |
| Skeleton | Loading placeholder rows | `npx shadcn@latest add skeleton` |

### Already Available (shadcn)
| Component | Usage |
|-----------|-------|
| Button | Refresh button, sort trigger |
| Badge | Status badges (dirty, merge-ready, stale, active) |
| Tooltip | Truncated branch names, button labels |
| ScrollArea | Branch list scrolling for 30+ rows |
| Separator | Dashboard header bottom border |

**Installation (from src-ui directory, using local mirror per Phase 02 decision):**
```bash
npx shadcn@latest add table dropdown-menu skeleton
```

Note: Per Phase 02 decision, shadcn CLI must be run from a local mirror directory (NAS incompatible with npx via with-modules). The planner should account for this.

## Architecture Patterns

### New Files to Create
```
src-ui/src/
  stores/
    branch-store.ts          # Zustand store for branch data + refresh logic
  pages/
    Dashboard.tsx             # Main dashboard page component
  components/
    BranchTable.tsx           # Table component with rows
    BranchRow.tsx             # Individual branch row (optional extraction)
    DashboardHeader.tsx       # Header with title, count, sort, refresh
    BranchEmptyState.tsx      # Empty state when no branches match
```

### Pattern 1: Dedicated Branch Store (Zustand)
**What:** Separate Zustand store for branch data, independent from config store.
**When to use:** Branch data changes frequently (30s refresh) while config rarely changes. Separate stores prevent unnecessary re-renders.
**Example:**
```typescript
// Source: existing config-store.ts pattern + Zustand docs
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface BranchInfo {
  name: string;
  ahead: number;
  behind: number;
  last_commit_message: string;
  last_commit_timestamp: number;  // Unix epoch seconds (i64 from Rust)
  is_dirty: boolean;
  worktree_path: string;
}

type SortMode = 'activity' | 'name' | 'commits';

interface BranchState {
  branches: BranchInfo[];
  loading: boolean;
  refreshing: boolean;  // true during manual/visible refresh
  error: string | null;
  sortMode: SortMode;
  lastRefreshed: number | null;

  fetchBranches: (path: string, prefix: string, target: string) => Promise<void>;
  silentRefresh: (path: string, prefix: string, target: string) => Promise<void>;
  setSortMode: (mode: SortMode) => void;
}
```

### Pattern 2: Tauri Event Listener in useEffect
**What:** Subscribe to `"git-changed"` events from the file watcher to trigger immediate refresh.
**When to use:** In the Dashboard component's mount effect.
**Example:**
```typescript
// Source: @tauri-apps/api/event.d.ts (verified from installed package)
import { listen } from '@tauri-apps/api/event';

interface GitChangeEvent {
  project_path: string;
  change_type: string;
}

useEffect(() => {
  const unlisten = listen<GitChangeEvent>('git-changed', (event) => {
    if (event.payload.project_path === currentProjectPath) {
      silentRefresh(path, prefix, target);
    }
  });
  return () => { unlisten.then(fn => fn()); };
}, [currentProjectPath]);
```

### Pattern 3: Window Focus Refresh
**What:** Trigger refresh when window regains focus if stale (> 10s since last refresh).
**When to use:** UI spec requires this behavior.
**Example:**
```typescript
// Source: @tauri-apps/api/event.d.ts TauriEvent enum
import { listen, TauriEvent } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen(TauriEvent.WINDOW_FOCUS, () => {
    const store = useBranchStore.getState();
    if (store.lastRefreshed && Date.now() - store.lastRefreshed > 10_000) {
      store.silentRefresh(path, prefix, target);
    }
  });
  return () => { unlisten.then(fn => fn()); };
}, [path, prefix, target]);
```

### Pattern 4: Auto-Refresh Timer
**What:** `setInterval` that reads `refresh_interval` from config store.
**When to use:** Dashboard is mounted and a project is selected.
**Example:**
```typescript
useEffect(() => {
  const interval = settings.refresh_interval * 1000; // settings stores seconds
  const timer = setInterval(() => {
    useBranchStore.getState().silentRefresh(path, prefix, target);
  }, interval);
  return () => clearInterval(timer);
}, [path, prefix, target, settings.refresh_interval]);
```

### Pattern 5: View Routing Change
**What:** The current `activeView` enum is `'project' | 'settings' | 'empty'`. Need to add `'dashboard'` or repurpose `'project'` to show the dashboard instead of ProjectConfig.
**When to use:** When selecting a project in sidebar.
**Recommendation:** Add a new `activeView` value `'dashboard'` and make `selectProject` set `activeView: 'dashboard'` instead of `'project'`. Keep `'project'` for the config page (accessible via a settings icon on the dashboard or a separate route). Alternatively, make the dashboard the default view when project is selected and provide a config button/tab. The UI spec shows the dashboard as the main view, not ProjectConfig.

### Anti-Patterns to Avoid
- **Fetching inside render:** Never call `invoke()` directly in render. Always in effects or event handlers.
- **Missing cleanup:** Every `listen()` and `setInterval` must return cleanup in useEffect. Tauri `listen` returns a Promise of an unlisten function -- must handle the async cleanup.
- **Re-creating intervals on every render:** The auto-refresh interval deps must be stable (project path, prefix, target, interval value).
- **Sorting in the store:** Sort should be computed in the component (or via a selector), not mutating the stored array, so raw data is preserved for re-sorting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table layout | Custom div grid table | shadcn Table component | Consistent styling, accessible markup, sticky headers |
| Dropdown menus | Custom state-managed popover | shadcn DropdownMenu (Radix) | Focus management, keyboard nav, portal rendering |
| Loading skeletons | DIY animated divs | shadcn Skeleton component | Consistent shimmer animation, proper sizing |
| Relative timestamps | Custom date math | Simple utility function (5 lines) | Small enough to hand-roll; no library needed for "3h ago" |
| Scroll virtualization | Custom windowing | NOT NEEDED yet | 30 rows is not enough to need virtualization |

**Key insight:** The shadcn Table component provides semantic `<table>` markup with proper styling hooks. The UI spec uses a table layout (not cards), so use the real Table components (TableHeader, TableBody, TableRow, TableHead, TableCell).

## Common Pitfalls

### Pitfall 1: Stale Closure in setInterval
**What goes wrong:** Auto-refresh timer captures old project path/prefix values.
**Why it happens:** JavaScript closures capture variables at creation time. If project changes but interval is not reset, it fetches for the old project.
**How to avoid:** Include project path, prefix, and target in the useEffect dependency array so the interval is recreated on project change.
**Warning signs:** Dashboard shows branches from previously selected project after switching.

### Pitfall 2: Race Condition on Project Switch
**What goes wrong:** User switches projects rapidly; slow fetch for project A completes after fetch for project B starts, overwriting B's data with A's.
**Why it happens:** Async fetches don't know about newer fetches.
**How to avoid:** Use an AbortController pattern or a request ID counter. Only apply results if the project ID still matches when the fetch resolves.
**Warning signs:** Branches briefly flash from the wrong project.

### Pitfall 3: Async Unlisten Cleanup
**What goes wrong:** Tauri `listen()` returns `Promise<UnlistenFn>`. If the component unmounts before the promise resolves, the listener is never cleaned up.
**Why it happens:** `useEffect` cleanup runs synchronously, but `listen` is async.
**How to avoid:** Store unlisten promise and call it in cleanup:
```typescript
useEffect(() => {
  let cancelled = false;
  const unlistenPromise = listen('git-changed', (e) => {
    if (!cancelled) { /* handle */ }
  });
  return () => {
    cancelled = true;
    unlistenPromise.then(fn => fn());
  };
}, []);
```
**Warning signs:** Console warnings about state updates on unmounted components.

### Pitfall 4: Unix Timestamp Handling
**What goes wrong:** `last_commit_timestamp` is Unix seconds (i64 from Rust), but JavaScript Date expects milliseconds.
**Why it happens:** Rust `git2` returns epoch seconds; JS Date constructor takes milliseconds.
**How to avoid:** Multiply by 1000: `new Date(timestamp * 1000)`.
**Warning signs:** Dates showing as January 1970 or "53 years ago".

### Pitfall 5: BranchInfo Type Mismatch
**What goes wrong:** TypeScript interface doesn't match Rust struct field names.
**Why it happens:** Rust uses snake_case, and the project decision (Phase 02) is to keep snake_case in TS types too.
**How to avoid:** Match `BranchInfo` TS interface exactly to Rust struct: `last_commit_message`, `last_commit_timestamp`, `is_dirty`, `worktree_path`.
**Warning signs:** Fields are `undefined` despite backend returning data.

### Pitfall 6: Missing View Routing
**What goes wrong:** No way to get back to ProjectConfig after dashboard replaces it.
**Why it happens:** Currently `selectProject` sets `activeView: 'project'` which shows ProjectConfig. If we replace that with dashboard, config becomes inaccessible.
**How to avoid:** Either: (a) add a settings/config icon on the dashboard header that navigates to ProjectConfig, or (b) have a tab system (dashboard | config). The UI spec shows only the dashboard, so config access can be a gear icon or similar.
**Warning signs:** Users can't edit project settings after dashboard is implemented.

## Code Examples

### Relative Timestamp Utility
```typescript
// No library needed -- this is simple enough to hand-roll
export function relativeTime(unixSeconds: number): string {
  const now = Date.now();
  const then = unixSeconds * 1000;
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

export function isStale(unixSeconds: number): boolean {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - (unixSeconds * 1000) > sevenDaysMs;
}
```

### Invoking list_branches from Frontend
```typescript
// Source: existing git_commands.rs Tauri command signatures
const branches = await invoke<BranchInfo[]>('list_branches', {
  projectPath: project.path,    // camelCase in invoke args
  branchPrefix: project.branch_prefix,
  mergeTarget: project.merge_target,
});
```

**Important:** Tauri 2 auto-converts camelCase JS args to snake_case Rust params. So `projectPath` in JS maps to `project_path` in Rust. This is the existing project pattern (see config store's `invoke('update_project', { id, ...updates })`).

### Sort Implementation
```typescript
function sortBranches(branches: BranchInfo[], mode: SortMode): BranchInfo[] {
  const sorted = [...branches];
  switch (mode) {
    case 'activity':
      return sorted.sort((a, b) => b.last_commit_timestamp - a.last_commit_timestamp);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'commits':
      return sorted.sort((a, b) => b.ahead - a.ahead);
  }
}
```

### Spinning Refresh Icon (CSS)
```typescript
// Tailwind CSS class for spinning icon
<RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
```

Note: Tailwind v4 includes `animate-spin` by default (CSS animation: `spin 1s linear infinite`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React polling with raw fetch | Tauri invoke + event listeners | Tauri 2 | Use invoke for commands, listen for events |
| useContext for global state | Zustand stores | Project decision | Lightweight, no provider needed |
| CSS-in-JS for animations | Tailwind animate utilities | Tailwind v4 | Use `animate-spin`, `animate-pulse` classes |
| radix-ui individual packages | `radix-ui` unified package (^1.4.3) | 2025 | Single import, used by shadcn |

## Open Questions

1. **View routing for ProjectConfig vs Dashboard**
   - What we know: Currently `selectProject` shows `ProjectConfig`. Dashboard needs to be the default view.
   - What's unclear: Whether to add a new `activeView` value or replace `'project'` meaning.
   - Recommendation: Add `'dashboard'` to `activeView` union type. Make `selectProject` set `'dashboard'`. Add a config icon on dashboard header that switches to `'project'` (ProjectConfig). This preserves backward compatibility.

2. **Active session detection (FR-02.4)**
   - What we know: UI spec says "placeholder -- actual detection in Phase 05."
   - What's unclear: Whether to show the badge column at all or just not populate it.
   - Recommendation: Include the badge column but never render "Active" badges in this phase. The column/badge infrastructure is ready for Phase 05 to wire up.

3. **shadcn CLI on NAS**
   - What we know: Phase 02 established that shadcn CLI must run from local mirror (NAS junction incompatibility with npx).
   - What's unclear: Exact mirror path used in Phase 02.
   - Recommendation: Planner should include explicit instructions for shadcn component installation matching Phase 02 approach.

## Project Constraints (from CLAUDE.md)

- **Dev command:** `cargo tauri dev` for full app, `cd src-ui && npm run dev` for frontend only
- **Typecheck:** `cd src-ui && npm run typecheck` -- must pass after all changes
- **Lint:** `cd src-ui && npm run lint` -- must pass
- **Snake_case types:** TypeScript types use snake_case to match Rust serde (Phase 02 decision)
- **NAS workaround:** `scripts/with-modules.mjs` creates local junction for node_modules
- **shadcn local mirror:** shadcn CLI run from local mirror, not via with-modules
- **Theme:** Dark mode only, zinc/neutral preset, emerald-500 accent
- **GSD enforcement:** Must use GSD commands before editing files

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/git/branches.rs` -- BranchInfo struct definition, list_worktree_branches implementation
- `src-tauri/src/commands/git_commands.rs` -- Tauri command signatures (list_branches, is_worktree_dirty)
- `src-tauri/src/watcher/mod.rs` -- GitChangeEvent payload, "git-changed" event channel
- `@tauri-apps/api/event.d.ts` -- listen/once/emit API, TauriEvent enum (WINDOW_FOCUS)
- `src-ui/src/stores/config-store.ts` -- Existing Zustand store pattern, selectProject, activeView
- `src-ui/src/types/config.ts` -- TypeScript types (ProjectConfig, Settings)
- `src-ui/src/App.tsx` -- Current view routing logic
- `src-ui/src/pages/ProjectConfig.tsx` -- Existing page component pattern, useAutoSave
- `04-UI-SPEC.md` -- Complete visual specification (table layout, colors, badges, interactions)
- `04-CONTEXT.md` -- Locked decisions and discretion areas

### Secondary (MEDIUM confidence)
- Tailwind v4 animate-spin/animate-pulse -- verified via project's tailwindcss ^4.0.0 dependency

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, versions verified from package.json
- Architecture: HIGH -- all backend commands exist and are verified, patterns follow existing codebase
- Pitfalls: HIGH -- derived from actual code analysis (timestamp types, async cleanup, closure issues)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no moving targets)
