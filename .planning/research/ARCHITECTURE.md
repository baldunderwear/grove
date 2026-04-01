# Architecture Research: Session Lifecycle Integration (v2.1)

**Domain:** Tauri 2 desktop app -- session lifecycle features for existing worktree manager
**Researched:** 2026-04-01
**Confidence:** HIGH (based on direct codebase analysis of existing Grove architecture)

## Context

This research covers how four v2.1 features integrate with the existing Grove architecture:

1. Post-session workflow (diff summary, commit, merge, cleanup)
2. Multi-branch merge queue (select, order, sequential merge, rollback)
3. Toast notification system (stackable, actionable, in-app)
4. Kill external launch path (SessionManager as sole entry point)

All analysis is based on the current codebase as of v2.0.x. No speculative external research needed -- this is an integration architecture exercise.

## Current Architecture Snapshot

```
+---------------------------------------------------------------------+
|                         React Frontend                              |
+---------------+--------------+---------------+----------------------+
| SessionManager| MergeDialog  | SessionCard   | (NEW) ToastProvider  |
| (grid+focus)  | (preview+    | (card UI)     | (stackable toasts)   |
|               |  execute)    |               |                      |
+----------+----+----+---------+------+--------+----------------------+
| terminal |  merge  |  branch      |  config    |  session            |
| -store   |  -store |  -store      |  -store    |  -store             |
+----------+---------+--------------+------------+---------------------+
|                    Tauri IPC (invoke + Channel)                      |
+----------+---------+--------------+--------------+------------------+
| Terminal |  Git Ops|  Config      |  Process     |  Notifications   |
| Manager  |  (merge,|  (persist,   |  (detect,    |  (OS notifs,     |
| (PTY,    |   branch|   models)    |   launch)    |   merge-ready)   |
|  state,  |   build,|              |              |                  |
|  history)|   stat) |              |              |                  |
+----------+---------+--------------+--------------+------------------+
|                         Tauri 2 Runtime                             |
|  Managed State: Mutex<TerminalManager>, Mutex<HistoryManager>,     |
|                 Mutex<SessionDetector>, Mutex<NotificationState>,   |
|                 Mutex<()> (write lock)                              |
+--------------------------------------------------------------------+
```

### Key Existing Patterns

| Pattern | Where Used | Relevance to v2.1 |
|---------|-----------|-------------------|
| Channel-per-terminal | PTY I/O streaming | Post-session uses Exit event from Channel |
| Step-based state machine | `MergeStep` in merge-store | Post-session and merge queue reuse this pattern |
| Tauri events for broadcast | `session-state-changed`, `git-changed` | Toasts subscribe to same events |
| Write Mutex serialization | `Mutex<()>` on merge commands | Queue holds this lock for entire sequence |
| Session state via ANSI parsing | `StateParser` in PTY reader thread | Add `Exited` detection on PTY exit |

---

## Feature 1: Post-Session Workflow

### What It Is

When a Claude Code session exits (PTY process exits), present a guided workflow: diff summary, commit, merge, worktree cleanup -- instead of just showing "[Process exited: 0]".

### Integration Points

**Existing hook: `TerminalEvent::Exit`.** The PTY reader thread already emits `Exit { code }` via Tauri Channel. The frontend handles this in `SessionManager > TerminalInstance > onEvent`. Currently it writes a styled "[Process exited]" line to xterm.js and marks the tab disconnected via `setTabConnected(id, false)`.

**Existing infrastructure covers most needs:**
- `terminal_get_history` -- diff stat from session start HEAD (exists)
- `is_worktree_dirty` -- check for uncommitted changes (exists)
- `merge_preview` + `merge_branch` -- full merge pipeline (exists)
- `list_branches` -- refresh after merge (exists)

**One new Rust command needed:** `delete_worktree` for cleanup step. Currently `create_worktree` exists but there is no delete. Use `git worktree remove` via CLI (same pattern as `create_worktree`).

### Data Flow

```
PTY Exit
  |
  v
TerminalInstance.onEvent(Exit)
  |
  v
setTabConnected(id, false) + setTabState(id, 'exited')   <-- NEW state value
  |
  v
SessionCard detects 'exited' state --> shows "Review" button
  |
  v
User clicks --> PostSessionWorkflow mounts in focus view
  |
  v
Step 1: invoke('terminal_get_history') --> show diff summary
Step 2: invoke('is_worktree_dirty') --> if dirty, show commit prompt
Step 3: invoke('merge_preview') --> show merge preview
Step 4: invoke('merge_branch') --> execute merge
Step 5: invoke('delete_worktree') --> cleanup (optional)
  |
  v
closeTab(id) --> done
```

### Components to Create/Modify

| Component | Action | Details |
|-----------|--------|---------|
| `PostSessionWorkflow.tsx` | **NEW** | Stepped wizard: diff summary, commit, merge, cleanup |
| `terminal-store.ts` | **MODIFY** | Add `'exited'` to SessionState, keep tab alive after exit |
| `SessionCard.tsx` | **MODIFY** | Show "Review" button/overlay when state is `exited` |
| `SessionManager.tsx` | **MODIFY** | Render PostSessionWorkflow in focus view for exited tabs |
| `session_commands.rs` | **MODIFY** | Add `delete_worktree` command |
| `lib.rs` | **MODIFY** | Register `delete_worktree` in invoke handler |

### Key Design Decision: Tab Lifecycle

Currently, when a PTY exits, `sessionState` is set to `null` and the tab is effectively dead. The critical change is adding an `exited` state that keeps the tab alive and meaningful:

```typescript
// Current
export type SessionState = "working" | "waiting" | "idle" | "error" | null;

// After
export type SessionState = "working" | "waiting" | "idle" | "error" | "exited" | null;
```

Revised lifecycle:
```
addTab (pending-*) --> activateTab (terminal-id) --> [working/waiting/idle/error]
                                                        |
                                                        v
                                                     exited --> [PostSessionWorkflow] --> closeTab
```

---

## Feature 2: Multi-Branch Merge Queue

### What It Is

Select multiple branches, define order, execute sequential merges with auto-build-bump between each. Rollback on failure.

### Integration Points

**Existing merge infrastructure is single-branch.** The `merge_branch` Rust function and `merge-store` Zustand store both operate on one (source, target) pair. The merge `Mutex<()>` already serializes writes, which is correct for queue processing.

**Queue orchestration belongs in Rust, not frontend.** If the frontend drives sequential `merge_branch` calls, a crash mid-queue leaves the repo in a partial state with no rollback. The Rust side should:

1. Accept a `Vec<String>` of branch names in merge order
2. Record the starting HEAD as rollback point
3. Execute merges sequentially (each bumps build, renames changelogs)
4. On failure at branch N: `git reset --hard` to starting HEAD
5. Return a structured result: which succeeded, which failed, why

### Data Flow

```
User selects branches in SessionManager or BranchTable
  |
  v
Opens MergeQueueDialog (NEW)
  |
  v
For each branch: invoke('merge_preview') --> show preview per branch
  |
  v
User confirms order, clicks "Execute Queue"
  |
  v
invoke('merge_queue_execute', { branches, projectPath, ... })
  |  (Rust side)
  v
Record HEAD --> loop merges --> on error: reset to HEAD --> return result
  |
  v
MergeQueueDialog shows results: per-branch success/failure
  |
  v
Toast notification for outcome + branch store refresh
```

### New Rust Types

```rust
#[derive(Debug, Clone, Serialize)]
pub struct QueueMergeResult {
    pub completed: Vec<MergeResult>,   // Branches that merged successfully
    pub failed: Option<QueueFailure>,   // First failure (if any)
    pub rolled_back: bool,              // Whether rollback occurred
    pub final_build: Option<u32>,       // Build number after all merges
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueFailure {
    pub branch: String,
    pub error: String,
    pub index: usize,                   // Which branch in the queue (0-based)
}
```

### Components to Create/Modify

| Component | Action | Details |
|-----------|--------|---------|
| `src-tauri/src/git/queue.rs` | **NEW** | Queue executor with rollback |
| `src-tauri/src/git/mod.rs` | **MODIFY** | Add `pub mod queue;` |
| `src-tauri/src/commands/git_commands.rs` | **MODIFY** | Add `merge_queue_preview` and `merge_queue_execute` |
| `lib.rs` | **MODIFY** | Register new commands |
| `MergeQueueDialog.tsx` | **NEW** | Branch selection, ordering, preview, execution UI |
| `merge-queue-store.ts` | **NEW** | Queue state: selected branches, order, execution progress |
| `SessionManager.tsx` or `BranchTable.tsx` | **MODIFY** | Multi-select + "Merge Queue" button |

---

## Feature 3: Toast Notification System

### What It Is

In-app stackable toast notifications for session state changes, merge results, errors. Supplements the existing OS notifications and audio chime.

### Integration Points

**Current notification landscape:**
- OS notifications: `tauri-plugin-notification` -- merge-ready, stale branch, merge complete, session-waiting
- Audio chime: `alerts.ts` -- Web Audio API two-tone chime on session waiting
- Taskbar flash: `requestWindowAttention` in `alerts.ts`

**Toasts are purely frontend.** No Rust changes needed. The toast system subscribes to the same events the OS notifications already use, plus reacts to store action results.

**Toast triggers (from existing events/actions):**
- `session-state-changed` event -- "Session X is waiting for input"
- Merge complete (after `executeMerge` in merge-store) -- "Merged branch-X (build 42)"
- Merge queue results -- "3/4 branches merged successfully"
- Session exit -- "Session X ended"
- Errors -- any caught error in invoke calls

### Data Flow

```
Event source (Tauri event, store action result, error)
  |
  v
toast-store.addToast({ type, title, message, action? })
  |
  v
ToastContainer renders stack (bottom-right, max 5 visible)
  |
  v
Auto-dismiss after timeout (~5s default, configurable per type)
  |
  v
Optional action button (e.g., "Review" --> focus session, "Retry" --> retry merge)
```

### Components to Create/Modify

| Component | Action | Details |
|-----------|--------|---------|
| `toast-store.ts` | **NEW** | Toast state: stack of toasts, add/dismiss/clear |
| `ToastContainer.tsx` | **NEW** | Renders toast stack, animations, auto-dismiss |
| `Toast.tsx` | **NEW** | Individual toast: icon, title, message, action, close |
| `SessionManager.tsx` | **MODIFY** | Fire toasts on session events (alongside existing alerts) |
| `merge-store.ts` | **MODIFY** | Fire toast on merge complete/error |
| `App.tsx` | **MODIFY** | Mount ToastContainer at root level |

### Toast Store Design

```typescript
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;  // ms, 0 = persistent
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}
```

---

## Feature 4: Kill External Launch Path

### What It Is

Remove the `launch_session` command (which spawns an external terminal window) so all sessions go through `terminal_spawn` (embedded PTY).

### Integration Points

**`launch_session`** calls `process::launch::launch_claude_session` which spawns an external `wt.exe` terminal window. After removal:

- `launchSession` in session-store becomes dead code
- `fetchSessions` / `get_active_sessions` / `SessionDetector` become dead code
- `process/detect.rs` can be removed entirely

**Keep:** `open_in_vscode`, `open_in_explorer`, `create_worktree` from session commands.

### Components to Remove/Modify

| Component | Action | Details |
|-----------|--------|---------|
| `session-store.ts` | **REMOVE most** | Keep `openInVscode`/`openInExplorer`, move to utility or inline |
| `session_commands.rs` | **MODIFY** | Remove `launch_session`, `get_active_sessions` |
| `process/launch.rs` | **MODIFY** | Remove `launch_claude_session`, keep `launch_vscode` |
| `process/detect.rs` | **REMOVE** | No longer needed |
| `process/mod.rs` | **MODIFY** | Remove `detect` module |
| `lib.rs` | **MODIFY** | Remove `SessionDetector` managed state, remove dead commands |

---

## Recommended Build Order

The features have real dependencies that constrain order:

### Phase 1: Toast System

**Why first:** Every other feature needs to fire toasts. Building toasts first means merge queue and post-session workflow get notifications for free.

Scope: `toast-store.ts`, `ToastContainer.tsx`, `Toast.tsx`, wire into `App.tsx`, retrofit existing alert sites.

**Zero backend changes.** Pure frontend. Low risk, high leverage.

### Phase 2: Post-Session Workflow

**Why second:** Core lifecycle feature. Changes how sessions end, which affects merge queue UX (queue should fire after post-session, not instead of it).

Scope: Add `exited` state, modify Exit handler, `PostSessionWorkflow.tsx`, `delete_worktree` Rust command.

**Depends on:** Toast system (Phase 1) for step success/error notifications.

### Phase 3: Multi-Branch Merge Queue

**Why third:** Needs merge infrastructure stable, benefits from toast system for progress/results.

Scope: `git/queue.rs`, queue commands, `merge-queue-store.ts`, `MergeQueueDialog.tsx`, branch selection UI.

**Depends on:** Toast system (Phase 1). Independent of post-session but logically follows it.

### Phase 4: Kill External Launch Path

**Why last:** Removing code is low-risk but should happen after all new features are stable. Having the fallback during development is valuable.

Scope: Remove `launch_session`, `process/detect.rs`, `SessionDetector`, dead code cleanup.

**Depends on:** Confidence that embedded path handles all scenarios.

---

## Architectural Patterns

### Pattern 1: Stepped Wizard with Store State Machine

**What:** Post-session workflow and merge queue both have multi-step flows. Use an enum-based step in the Zustand store (like existing `MergeStep`) rather than component-local state.

**When to use:** Any multi-step flow that needs to survive re-renders and be observable from other components.

**Trade-offs:** Store boilerplate vs. reliable multi-component observability.

```typescript
type PostSessionStep = 'summary' | 'commit' | 'merge-preview' | 'merging' | 'cleanup' | 'done' | 'error';
```

### Pattern 2: Tauri Events for Cross-Concern Reactivity

**What:** Use `emit`/`listen` for events that multiple frontend concerns react to independently (toasts, alerts, store updates).

**When to use:** When a Rust-side state change triggers multiple independent frontend reactions. `session-state-changed` already follows this pattern.

**Do NOT use Channels for this.** Channels are 1:1 for high-throughput PTY I/O. Events are broadcast.

### Pattern 3: Server-Side Atomicity for Multi-Step Operations

**What:** Merge queue execution lives in Rust, not JavaScript, to ensure atomicity and rollback.

**When to use:** Any operation sequence where partial completion is worse than failure.

**Trade-offs:** More complex Rust code, but crash-safe behavior.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Frontend-Driven Sequential Merges

**What:** Loop over branches in JavaScript, calling `merge_branch` for each.

**Why wrong:** App crash mid-sequence = partial merge state, no rollback. Build numbers inconsistent.

**Instead:** Single `merge_queue_execute` Rust command with atomic rollback.

### Anti-Pattern 2: Blocking the PTY Reader Thread

**What:** Add post-session logic (git operations) inside the PTY reader thread's Exit handler.

**Why wrong:** Git operations are slow on NAS. Blocks event delivery for other terminals.

**Instead:** Emit `Exit` event, let frontend trigger commands via `invoke()` on main thread.

### Anti-Pattern 3: Toast State in Component-Local useState

**What:** Create toast system using local React state in a provider.

**Why wrong:** Other Zustand stores cannot dispatch toasts without importing React components. Couples stores to component tree.

**Instead:** Standalone Zustand store. Any store calls `useToastStore.getState().addToast()`.

### Anti-Pattern 4: Separate Data Structure for Exited Sessions

**What:** Create separate store for sessions that exited, moving data out of terminal-store.

**Why wrong:** Tab already has all data (branch, path, project ID, creation time). Duplicates data, two lifecycles to manage.

**Instead:** Keep exited sessions as tabs with `sessionState: 'exited'`. Close tab when workflow completes.

---

## Integration Summary

### New Files (7)

| File | Layer | Purpose |
|------|-------|---------|
| `src-tauri/src/git/queue.rs` | Rust | Merge queue execution with rollback |
| `src-ui/src/stores/toast-store.ts` | Frontend | Toast notification state |
| `src-ui/src/stores/merge-queue-store.ts` | Frontend | Queue selection, ordering, progress |
| `src-ui/src/components/ui/ToastContainer.tsx` | Frontend | Toast rendering and animations |
| `src-ui/src/components/ui/Toast.tsx` | Frontend | Individual toast component |
| `src-ui/src/components/session/PostSessionWorkflow.tsx` | Frontend | Post-exit stepped wizard |
| `src-ui/src/components/MergeQueueDialog.tsx` | Frontend | Queue management UI |

### Modified Files (9)

| File | Layer | Change |
|------|-------|--------|
| `src-tauri/src/git/mod.rs` | Rust | Add `pub mod queue;` |
| `src-tauri/src/commands/git_commands.rs` | Rust | Add queue commands, delete_worktree |
| `src-tauri/src/commands/session_commands.rs` | Rust | Add delete_worktree |
| `src-tauri/src/lib.rs` | Rust | Register new commands |
| `src-ui/src/stores/terminal-store.ts` | Frontend | Add 'exited' state, tab lifecycle |
| `src-ui/src/stores/merge-store.ts` | Frontend | Fire toasts on merge events |
| `src-ui/src/components/session/SessionManager.tsx` | Frontend | PostSessionWorkflow, toast wiring |
| `src-ui/src/components/session/SessionCard.tsx` | Frontend | 'exited' state visual treatment |
| `src-ui/src/App.tsx` | Frontend | Mount ToastContainer |

### Removed Files (Phase 4)

| File | Layer | Reason |
|------|-------|--------|
| `src-tauri/src/process/detect.rs` | Rust | External session detection dead code |
| Parts of `src-ui/src/stores/session-store.ts` | Frontend | External launch + polling dead code |

---

## Sources

- Direct codebase analysis: `src-tauri/src/terminal/` (mod.rs, state_parser.rs, commands.rs, history.rs, pty.rs)
- Direct codebase analysis: `src-tauri/src/git/merge.rs` (merge_preview, merge_branch, conflict resolution)
- Direct codebase analysis: `src-tauri/src/commands/` (git_commands.rs, session_commands.rs)
- Direct codebase analysis: `src-tauri/src/lib.rs` (managed state, invoke handler, event listeners)
- Direct codebase analysis: `src-ui/src/stores/` (terminal-store.ts, merge-store.ts, session-store.ts, branch-store.ts)
- Direct codebase analysis: `src-ui/src/components/session/` (SessionManager.tsx, SessionCard.tsx)
- Direct codebase analysis: `src-ui/src/lib/alerts.ts` (chime, taskbar flash)
- Direct codebase analysis: `src-tauri/src/notifications.rs` (OS notification infrastructure)

---
*Architecture research for: Grove v2.1 Session Lifecycle*
*Researched: 2026-04-01*
