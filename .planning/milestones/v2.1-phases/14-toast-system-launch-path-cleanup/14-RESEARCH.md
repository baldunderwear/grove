# Phase 14: Toast System + Launch Path Cleanup - Research

**Researched:** 2026-04-01
**Domain:** Sonner toast notifications, Zustand store integration, dead code removal (external launch path)
**Confidence:** HIGH

## Summary

Phase 14 has two discrete workstreams: (1) install Sonner and wire toast notifications into the existing session state change flow, and (2) remove the entire external launch path (wt.exe/cmd.exe, PID-based session detection, session-store). Both are well-understood, low-risk changes with no novel engineering.

The toast system adds a single npm dependency (sonner 2.0.7, ~4 kB gzip) and wires into existing infrastructure: the `session-state-changed` Tauri event already fires on every state transition, `alerts.ts` already handles chime and taskbar flash, and Sonner's imperative `toast()` API is callable directly from Zustand store actions without React context. The launch path removal is a codebase audit and deletion -- every consumer of `session-store.ts`, the `launch_session` and `get_active_sessions` Rust commands, and the `process/` module need to be systematically replaced or removed.

**Primary recommendation:** Install Sonner, mount `<Toaster />` in App.tsx, fire toasts from `alerts.ts` alongside existing chime/flash logic, then systematically remove session-store and the entire `process/` Rust module. Move `openInVscode` and `openInExplorer` to a shared utility before deleting session-store.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Position: bottom-right (standard desktop placement, doesn't obscure session cards)
- Auto-dismiss: 5 seconds for informational toasts
- Visual style: Match Grove dark theme with session state accent colors (green/amber/gray/red for working/waiting/idle/error)
- Max visible: 3 toasts simultaneously, error toasts take priority
- Events that fire toasts: session state changes (waiting/idle/error), merge results, errors. NOT session start or branch refreshes.
- OS notifications: fire only when app is unfocused; toasts fire always. No double notification when app is in foreground.
- Toast action button: focuses/switches to the relevant session tab
- Fire toasts from Zustand store actions via Sonner's imperative `toast()` API (no React context needed)
- Move `openInVscode` and `openInExplorer` from session-store to a shared utility (Dashboard and SessionManager both use these)
- Remove Rust `launch_session` and `get_active_sessions` commands entirely
- Remove `process/detect.rs` (PID-based session detection) -- fully replaced by terminal-store
- Rewire AllProjects page launch button to open embedded terminal via terminal-store

### Claude's Discretion
- Sonner `<Toaster />` configuration details (theme prop, richColors, etc.)
- Toast store internal structure (priority queue vs simple array)
- Exact file organization for moved utility functions

### Deferred Ideas (OUT OF SCOPE)
- TOAST-05 (merge queue progress toast with update-in-place) -- deferred to Phase 17 with the queue
- Toast notification preferences/settings UI -- future milestone
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOAST-01 | User sees in-app toast when a session changes state (waiting/idle/error) | Sonner imperative `toast()` API fires from `session-state-changed` event handler; verified callable from outside React |
| TOAST-02 | User can click a toast action button to navigate to the relevant session | Sonner `action` option with `onClick` handler calls `useTerminalStore.getState().focusSession(tabId)` |
| TOAST-03 | Error toasts persist until dismissed; informational toasts auto-dismiss | Sonner per-toast `duration` option: `Infinity` for errors, `5000` for info; `closeButton` on Toaster |
| TOAST-04 | Toast stack shows max 3-4 visible simultaneously with priority ordering | Sonner `visibleToasts={3}` prop; priority logic implemented in toast firing code (dismiss oldest info before firing new) |
| LPATH-01 | SessionManager is the sole path for launching Claude Code sessions | Remove `launch_session` Rust command, rewire tray `launch-worktree` event and AllProjects to use terminal-store |
| LPATH-02 | External launch commands and PID-based session tracking fully removed | Delete `process/detect.rs`, `process/launch.rs` (keep `launch_vscode`), `session-store.ts`; remove `sysinfo` crate |
| LPATH-03 | All references to removed infrastructure cleaned up | Remove command registrations in `lib.rs`, managed state for `SessionDetector`, imports in all consuming files |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sonner | 2.0.7 | Toast notifications | shadcn/ui official toast recommendation; imperative API callable from Zustand stores without React context; ~4 kB gzip |

### Existing (no changes)
| Library | Version | Purpose |
|---------|---------|---------|
| zustand | 5.0 | State management -- toast firing from store actions |
| react | 19.0 | UI rendering |
| @tauri-apps/api | 2.x | Window focus detection for OS notification coordination |

### Removal
| Library | Reason |
|---------|--------|
| sysinfo (Rust, 0.38) | Only used by `process/detect.rs` (SessionDetector); no other consumers in codebase |

**Installation:**
```bash
cd src-ui && npm install sonner@^2.0.7
```

**Rust removal (Cargo.toml):**
Remove `sysinfo = "0.38"` from `[dependencies]` after deleting `process/detect.rs`.

## Architecture Patterns

### Toast Integration Architecture

```
session-state-changed (Tauri event)
        |
        v
  Dashboard.tsx / SessionManager.tsx  (existing listener)
        |
        v
  setTabState() in terminal-store     (existing)
        |
        v
  fireSessionToast() in alerts.ts     (NEW — calls Sonner toast())
        |
        +--> toast() with action button (always)
        +--> fireWaitingAlert() chime + taskbar (when state === 'waiting')
        +--> sendNotification() OS native (only when window unfocused)
```

### Recommended File Changes

```
src-ui/src/
  lib/
    alerts.ts           # ADD: fireSessionToast(), fireErrorToast(), fireMergeToast()
    shell.ts            # NEW: openInVscode(), openInExplorer() moved from session-store
  stores/
    session-store.ts    # DELETE entirely
    terminal-store.ts   # No structural changes (toast firing happens in alerts.ts)
  App.tsx               # ADD: <Toaster /> mount, REMOVE: launch-worktree listener
  pages/
    Dashboard.tsx       # CHANGE: import openInVscode/openInExplorer from lib/shell
                        # CHANGE: remove session-store imports and session polling
                        # CHANGE: add toast firing in state change listener
    AllProjects.tsx     # CHANGE: replace launchSession with terminal-store addTab
  components/
    session/
      SessionManager.tsx  # CHANGE: import from lib/shell instead of session-store
                          # CHANGE: add toast firing in state change listener
    NewWorktreeDialog.tsx # CHANGE: replace invoke('launch_session') with terminal-store addTab

src-tauri/src/
  process/
    mod.rs              # DELETE (after moving launch_vscode)
    detect.rs           # DELETE entirely
    launch.rs           # MOVE launch_vscode to commands/session_commands.rs or utils
  commands/
    session_commands.rs # REMOVE launch_session, get_active_sessions
                        # KEEP open_in_vscode (rewired to inline or utils), open_in_explorer, create_worktree
  lib.rs               # REMOVE: SessionDetector managed state
                        # REMOVE: launch_session and get_active_sessions from invoke_handler
```

### Pattern: Sonner Toaster Mount (App.tsx)

```tsx
import { Toaster } from 'sonner';

function App() {
  return (
    <TooltipProvider>
      <Toaster
        position="bottom-right"
        visibleToasts={3}
        toastOptions={{
          className: 'grove-toast',
          duration: 5000,
        }}
        theme="dark"
        offset={24}
        gap={16}
      />
      {/* rest of app */}
    </TooltipProvider>
  );
}
```

### Pattern: Imperative Toast from Store/Utility

```tsx
// src-ui/src/lib/alerts.ts
import { toast } from 'sonner';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useTerminalStore } from '@/stores/terminal-store';

export function fireSessionToast(
  terminalId: string,
  branchName: string,
  state: string
) {
  const isError = state === 'error';

  toast(formatTitle(branchName, state), {
    description: formatDescription(state),
    duration: isError ? Infinity : 5000,
    action: {
      label: 'View Session',
      onClick: () => {
        useTerminalStore.getState().focusSession(terminalId);
      },
    },
  });
}
```

### Pattern: OS Notification Coordination

```tsx
export async function fireSessionAlert(
  terminalId: string,
  branchName: string,
  state: string
) {
  // Toast fires always (in-app)
  fireSessionToast(terminalId, branchName, state);

  // OS notification only when unfocused
  if (state === 'waiting') {
    playAttentionChime();
    try {
      const win = getCurrentWindow();
      const focused = await win.isFocused();
      if (!focused) {
        await win.requestUserAttention(2);
        sendNotification({
          title: 'Waiting for input',
          body: `${branchName} needs your attention`,
        });
      }
    } catch { /* not in Tauri context */ }
  }
}
```

### Pattern: Toast Custom Styling (CSS)

```css
/* index.css — Sonner theme overrides */
[data-sonner-toaster] [data-sonner-toast] {
  --normal-bg: var(--grove-deep);
  --normal-border: var(--grove-canopy);
  --normal-text: var(--grove-fog);
  border-left: 3px solid transparent;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
```

### Pattern: AllProjects Launch Rewire

```tsx
// Before (session-store):
const launchSession = useSessionStore((s) => s.launchSession);
// onClick: launchSession(worktreePath, branchName, [])

// After (terminal-store):
const addTab = useTerminalStore((s) => s.addTab);
const navigate = useConfigStore((s) => s.selectProject);
// onClick: navigate to project dashboard, addTab(worktreePath, branchName, projectId)
```

### Anti-Patterns to Avoid
- **React context for toast:** Do NOT wrap the app in a toast context provider. Sonner's imperative `toast()` is a module-level function -- no context needed.
- **Toast inside React render:** Never call `toast()` during render. Always call from event handlers, store actions, or effect callbacks.
- **Keeping session-store partially:** Do NOT leave session-store with just `openInVscode`/`openInExplorer`. Move those to a utility and delete the store entirely to avoid confusion.
- **Firing toasts for session start:** Per the CONTEXT.md decision, do NOT fire toasts for session start or branch refreshes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom portal + animation system | Sonner 2.0.7 | Handles stacking, animation, auto-dismiss timers, hover-pause, accessible announcements |
| Toast dismiss animation | Manual CSS transitions | Sonner built-in | 200ms slide-in, 300ms fade-out, all handled internally |
| Toast stack management | Custom array + priority queue | Sonner `visibleToasts` + manual dismiss of oldest info | Sonner manages the visual stack; priority logic is just calling `toast.dismiss()` on lowest-priority toast when at capacity |

**Key insight:** Sonner handles the entire visual lifecycle (mount, animate, stack, dismiss). The only custom logic needed is (a) when to fire toasts, (b) priority-based dismiss of old info toasts, and (c) the action button callback.

## Common Pitfalls

### Pitfall 1: Double Notification in Foreground
**What goes wrong:** User sees both an OS notification popup AND an in-app toast for the same event when the app is focused.
**Why it happens:** `sendNotification()` fires regardless of window focus state.
**How to avoid:** Check `getCurrentWindow().isFocused()` before calling `sendNotification()`. Toast fires unconditionally; OS notification only when unfocused.
**Warning signs:** Getting OS notification popups while actively using Grove.

### Pitfall 2: Orphaned Imports After session-store Deletion
**What goes wrong:** TypeScript build fails with missing module errors after deleting session-store.
**Why it happens:** Multiple files import from session-store: Dashboard.tsx, AllProjects.tsx, SessionManager.tsx.
**How to avoid:** Audit all imports before deletion. Known consumers:
- `Dashboard.tsx`: `activeSessions`, `fetchSessions`, `openInVscode`, `openInExplorer`, `clear`
- `AllProjects.tsx`: `activeSessions`, `fetchSessions`, `launchSession`
- `SessionManager.tsx` (FocusTopBar): `openInVscode`, `openInExplorer`
**Warning signs:** `npm run typecheck` fails after deletion.

### Pitfall 3: Tray Launch Event Still Invokes Removed Command
**What goes wrong:** Clicking a branch in the system tray throws an error because `launch_session` Rust command no longer exists.
**Why it happens:** `tray.rs` emits `launch-worktree` event, and `App.tsx` listens for it and calls `invoke('launch_session')`.
**How to avoid:** Rewire the `launch-worktree` handler in App.tsx to use `useTerminalStore.getState().addTab()` instead of `invoke('launch_session')`. Also need to navigate to the dashboard view.
**Warning signs:** Error toast when clicking tray menu items.

### Pitfall 4: NewWorktreeDialog Still Calls launch_session
**What goes wrong:** Creating a worktree with "launch after" checked fails because `launch_session` is removed.
**Why it happens:** `NewWorktreeDialog.tsx` directly calls `invoke<number>('launch_session', ...)`.
**How to avoid:** Replace with `useTerminalStore.getState().addTab()` call. The dialog needs access to projectId and must navigate to dashboard after launch.
**Warning signs:** Error when creating worktree with auto-launch.

### Pitfall 5: sysinfo Crate Left in Cargo.toml
**What goes wrong:** Unnecessary ~300KB+ binary bloat from sysinfo crate that nothing uses.
**Why it happens:** `sysinfo` is only used by `process/detect.rs`. After removing that module, the dependency becomes dead weight.
**How to avoid:** Remove `sysinfo = "0.38"` from Cargo.toml after deleting the process/detect module. Run `cargo check` to verify no other consumers.
**Warning signs:** `cargo tree -p sysinfo` still shows the crate after cleanup.

### Pitfall 6: launch_vscode Function Lost During process/ Deletion
**What goes wrong:** "Open in VS Code" stops working because `launch_vscode` lived in `process/launch.rs` which was deleted.
**Why it happens:** `process/launch.rs` contains both `launch_claude_session` (to delete) and `launch_vscode` (to keep).
**How to avoid:** Move `launch_vscode` to `commands/session_commands.rs` (inline it into `open_in_vscode`) or to `utils/` before deleting `process/launch.rs`.
**Warning signs:** VS Code button throws error.

### Pitfall 7: Toast Fires on Every State Transition Including "working"
**What goes wrong:** Users get spammed with "Session working" toasts every time Claude starts processing.
**Why it happens:** The `session-state-changed` event fires for all transitions including to "working".
**How to avoid:** Per CONTEXT.md: fire toasts for waiting, idle, and error only. Skip "working" state and null (initial connection). The decision says "NOT session start or branch refreshes."
**Warning signs:** Constant green toasts flooding the UI.

## Code Examples

### Sonner Toast with Action Button (verified from official docs)

```tsx
// Source: https://sonner.emilkowal.ski/toast
import { toast } from 'sonner';

toast('Branch needs input', {
  description: 'Session is waiting for your response',
  duration: 5000,
  action: {
    label: 'View Session',
    onClick: () => {
      useTerminalStore.getState().focusSession(terminalId);
    },
  },
});
```

### Sonner Error Toast (persists until dismissed)

```tsx
toast.error('Session error', {
  description: 'feature/login encountered an error',
  duration: Infinity,
  action: {
    label: 'View Session',
    onClick: () => {
      useTerminalStore.getState().focusSession(terminalId);
    },
  },
});
```

### Sonner Toaster Mount with Full Config

```tsx
// Source: https://sonner.emilkowal.ski/toaster
<Toaster
  position="bottom-right"
  visibleToasts={3}
  theme="dark"
  toastOptions={{
    duration: 5000,
    className: 'grove-toast',
  }}
  offset={24}
  gap={16}
/>
```

### Priority Toast Dismissal Pattern

```tsx
// When at max capacity (3 visible), dismiss oldest non-error toast before firing new one
function fireWithPriority(toastFn: () => string | number) {
  // Sonner handles overflow by stacking; for priority ordering,
  // dismiss oldest info toast manually if needed
  // Note: Sonner does not expose a "get active toasts" API,
  // so track toast IDs in a local array for priority management
  const id = toastFn();
  activeToastIds.push({ id, isError: false });
}
```

### Shell Utility (extracted from session-store)

```tsx
// src-ui/src/lib/shell.ts
import { invoke } from '@tauri-apps/api/core';

export async function openInVscode(worktreePath: string): Promise<void> {
  await invoke<void>('open_in_vscode', { worktreePath });
}

export async function openInExplorer(worktreePath: string): Promise<void> {
  await invoke<void>('open_in_explorer', { worktreePath });
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | TypeScript: none (no frontend tests); Rust: built-in `#[cfg(test)]` |
| Config file | none |
| Quick run command | `cd src-ui && npm run typecheck` (TypeScript) / `cargo check` (Rust) |
| Full suite command | `cd src-ui && npm run typecheck && cd ../src-tauri && cargo clippy` |

### Phase Requirements - Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOAST-01 | Toast fires on state change | manual | Visual verification in dev mode | N/A |
| TOAST-02 | Toast action navigates to session | manual | Click "View Session" in toast | N/A |
| TOAST-03 | Error toast persists, info auto-dismisses | manual | Trigger error state, wait 5s | N/A |
| TOAST-04 | Max 3 toasts visible | manual | Trigger 4+ rapid state changes | N/A |
| LPATH-01 | SessionManager is sole launch path | typecheck | `npm run typecheck` (no launch_session imports) | N/A |
| LPATH-02 | External launch fully removed | compile | `cargo check` (no process/detect.rs) | N/A |
| LPATH-03 | All references cleaned up | compile + typecheck | `npm run typecheck && cargo clippy` | N/A |

### Sampling Rate
- **Per task commit:** `cd src-ui && npm run typecheck && cd ../src-tauri && cargo check`
- **Per wave merge:** `cd src-ui && npm run typecheck && cd ../src-tauri && cargo clippy`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- validation for this phase relies on TypeScript type checking and Rust compilation, both of which are already configured. Toast behavior is manual-verification only (no frontend test framework).

## Deletion Audit

Complete inventory of code to remove, organized by dependency chain:

### Rust Side

| File/Item | Action | Blocked By |
|-----------|--------|------------|
| `src-tauri/src/process/detect.rs` | DELETE entirely | Nothing |
| `src-tauri/src/process/launch.rs` | EXTRACT `launch_vscode` to `session_commands.rs`, then DELETE file | `launch_vscode` must be preserved |
| `src-tauri/src/process/mod.rs` | DELETE entirely | Both submodules removed |
| `mod process;` in `lib.rs` | REMOVE line | Module deleted |
| `Mutex<SessionDetector>::new()` in `lib.rs` line 17 | REMOVE `.manage()` call | detect.rs deleted |
| `launch_session` in invoke_handler (lib.rs line 53) | REMOVE from handler list | Command deleted |
| `get_active_sessions` in invoke_handler (lib.rs line 54) | REMOVE from handler list | Command deleted |
| `launch_session` fn in `session_commands.rs` | DELETE function | Nothing |
| `get_active_sessions` fn in `session_commands.rs` | DELETE function | Nothing |
| `use crate::process::detect::SessionDetector` in session_commands.rs | REMOVE import | Functions deleted |
| `sysinfo = "0.38"` in Cargo.toml | REMOVE dependency | detect.rs deleted |

### Frontend Side

| File/Item | Action | Blocked By |
|-----------|--------|------------|
| `src-ui/src/stores/session-store.ts` | DELETE entirely | All consumers migrated |
| `useSessionStore` import in Dashboard.tsx | REPLACE with shell.ts imports | shell.ts created |
| `activeSessions`, `fetchSessions`, `clearSessions` in Dashboard.tsx | REMOVE (session polling no longer needed) | session-store deleted |
| Effect 4 (window focus session refresh) in Dashboard.tsx | SIMPLIFY (remove fetchSessions call) | session-store deleted |
| Effect 5 (session polling interval) in Dashboard.tsx | DELETE entirely | session-store deleted |
| `useSessionStore` import in AllProjects.tsx | REPLACE launch with terminal-store | terminal-store addTab |
| `activeSessions`, `fetchSessions`, `launchSession` in AllProjects.tsx | REMOVE/REPLACE | session-store deleted |
| `useSessionStore` import in SessionManager.tsx | REPLACE with shell.ts imports | shell.ts created |
| `invoke('launch_session')` in App.tsx (tray handler) | REPLACE with terminal-store addTab | terminal-store |
| `invoke('launch_session')` in NewWorktreeDialog.tsx | REPLACE with terminal-store addTab | terminal-store |

## Open Questions

1. **Toast priority tracking without Sonner API access**
   - What we know: Sonner does not expose a "list active toasts" API. `toast()` returns a toast ID. `toast.dismiss(id)` removes a specific toast.
   - What's unclear: Exact mechanism for tracking active toast IDs to implement priority dismissal.
   - Recommendation: Maintain a simple module-level array of `{ id, priority, timestamp }` in alerts.ts. On each new toast, check array length; if >= 3, find and dismiss the oldest non-error entry. This is Claude's discretion per CONTEXT.md.

2. **AllProjects page navigation after launch**
   - What we know: AllProjects currently calls `launchSession` which opens an external terminal. After migration, it should open an embedded terminal tab.
   - What's unclear: Should clicking "launch" on AllProjects navigate to the project dashboard, or just add the tab silently?
   - Recommendation: Navigate to the project dashboard and auto-focus the new session (matches the existing SessionManager flow). Use `useConfigStore.getState().selectProject(projectId)` followed by `addTab()`.

3. **Tray launch-worktree event needs project context**
   - What we know: The tray emits `launch-worktree` with just the worktree path. `addTab()` needs `worktreePath`, `branchName`, and optionally `projectId`.
   - What's unclear: How to get branchName and projectId from just the worktree path in the frontend.
   - Recommendation: The frontend can derive branchName from the path (last segment) and look up projectId from config-store. Alternatively, enhance the tray event payload. The simpler path is deriving from existing state.

## Sources

### Primary (HIGH confidence)
- [Sonner official docs](https://sonner.emilkowal.ski/) - Toaster props, toast() API, action buttons, duration, styling
- [Sonner npm](https://www.npmjs.com/package/sonner) - Version 2.0.7 confirmed current
- Codebase: `src-ui/src/stores/session-store.ts` - Full consumer audit
- Codebase: `src-ui/src/lib/alerts.ts` - Existing alert pattern
- Codebase: `src-tauri/src/process/` - Full module to remove
- Codebase: `src-tauri/src/commands/session_commands.rs` - Commands to remove
- Codebase: `src-tauri/src/lib.rs` - Managed state and command registration

### Secondary (MEDIUM confidence)
- [shadcn/ui Sonner integration](https://ui.shadcn.com/docs/components/radix/sonner) - Official mounting pattern
- Codebase grep: All imports of session-store across 3 consumer files confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Sonner 2.0.7 verified on npm, API confirmed via official docs
- Architecture: HIGH - All integration points read directly from source files, consumer audit complete
- Pitfalls: HIGH - Every pitfall derived from actual code paths verified via grep/read

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (Sonner is stable; codebase changes are the main invalidation risk)
