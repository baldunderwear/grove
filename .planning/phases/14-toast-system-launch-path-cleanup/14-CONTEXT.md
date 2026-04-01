# Phase 14: Toast System + Launch Path Cleanup - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver an in-app toast notification system using Sonner and remove the entire external launch path (wt.exe/cmd.exe, PID-based session tracking, session-store launch infrastructure). After this phase, all session feedback is visible in-app and all sessions launch exclusively through the embedded terminal.

</domain>

<decisions>
## Implementation Decisions

### Toast Visual Design
- Position: bottom-right (standard desktop placement, doesn't obscure session cards)
- Auto-dismiss: 5 seconds for informational toasts
- Visual style: Match Grove dark theme with session state accent colors (green/amber/gray/red for working/waiting/idle/error)
- Max visible: 3 toasts simultaneously, error toasts take priority

### Toast Behavior & Integration
- Events that fire toasts: session state changes (waiting/idle/error), merge results, errors. NOT session start or branch refreshes.
- OS notifications: fire only when app is unfocused; toasts fire always. No double notification when app is in foreground.
- Toast action button: focuses/switches to the relevant session tab
- Fire toasts from Zustand store actions via Sonner's imperative `toast()` API (no React context needed)

### Launch Path Removal Strategy
- Move `openInVscode` and `openInExplorer` from session-store to a shared utility (Dashboard and SessionManager both use these)
- Remove Rust `launch_session` and `get_active_sessions` commands entirely
- Remove `process/detect.rs` (PID-based session detection) — fully replaced by terminal-store
- Rewire AllProjects page launch button to open embedded terminal via terminal-store

### Claude's Discretion
- Sonner `<Toaster />` configuration details (theme prop, richColors, etc.)
- Toast store internal structure (priority queue vs simple array)
- Exact file organization for moved utility functions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-ui/src/lib/alerts.ts` — existing `fireWaitingAlert()` with chime + taskbar flash, to be augmented with toast
- `src-ui/src/stores/terminal-store.ts` — session state tracking (working/waiting/idle/error), Map-based reactivity
- Sonner `^2.0.7` — to be installed, imperative `toast()` API
- Radix UI primitives already in use (consistent with shadcn/ui patterns)

### Established Patterns
- Zustand stores with `create<State>()((set) => ...)` pattern
- Store-level `getState()` for cross-store calls (used in session-store)
- `invoke<T>('command_name', { params })` for Tauri IPC
- Map cloning pattern for Zustand reactivity with Map-based state

### Integration Points
- `src-ui/src/App.tsx` — mount `<Toaster />` component
- `src-ui/src/stores/session-store.ts` — to be removed (consumers: Dashboard, AllProjects, SessionManager)
- `src-ui/src/pages/Dashboard.tsx` — uses `openInVscode`, `openInExplorer`, `fetchSessions`, `clearSessions` from session-store
- `src-ui/src/pages/AllProjects.tsx` — uses `activeSessions`, `fetchSessions`, `launchSession` from session-store
- `src-ui/src/components/session/SessionManager.tsx` — uses `openInVscode`, `openInExplorer` from session-store
- `src-tauri/src/process/` — Rust-side session detection to be removed
- `src-tauri/src/lib.rs` — command registrations to be cleaned up

</code_context>

<specifics>
## Specific Ideas

- Research recommended Sonner specifically for its imperative API callable from Zustand stores without React context
- Toast priority: error > warning > info. When at max capacity, new toasts replace oldest info toast, never replace error toast.
- alerts.ts should call `toast()` alongside existing chime/taskbar logic, not replace it

</specifics>

<deferred>
## Deferred Ideas

- TOAST-05 (merge queue progress toast with update-in-place) — deferred to Phase 17 with the queue
- Toast notification preferences/settings UI — future milestone

</deferred>
