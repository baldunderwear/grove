# Phase 15: Post-Session Flow - Research

**Researched:** 2026-04-01
**Domain:** PTY exit handling, git diff summary, session-to-merge bridge (Tauri 2 + React 19 + Rust/git2)
**Confidence:** HIGH

## Summary

Phase 15 delivers the post-session review experience: when a PTY session exits, the session card transitions to an "exited" state showing a diff summary and a "Review & Merge" button that opens the existing MergeDialog. This phase requires changes across three layers: (1) Rust backend -- a new `get_branch_diff_summary` command using git2's diff APIs, plus exit code capture from the PTY reader thread; (2) Zustand store -- expanding `SessionState` and `TerminalTab` types; (3) React UI -- three new components (`ExitBanner`, `DiffSummary`, `PostSessionActions`) and modifications to `SessionCard` and `SessionManager`.

The existing codebase provides 80%+ of the infrastructure. The PTY reader thread already sends `TerminalEvent::Exit { code }` to the frontend. The `MergeDialog` and `merge-store` are fully functional and accept branch info programmatically. The `merge_preview` command already returns commit lists. The primary new work is: (a) a Rust diff summary command that returns file-level stats, (b) frontend state transitions to keep exited tabs alive, and (c) three presentational components following the UI spec.

**Primary recommendation:** Build backend first (diff summary command + exit code plumbing), then store changes, then UI components. The Rust diff command is the only genuinely new code; everything else is wiring existing infrastructure together.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `'exited'` to SessionState type; tab survives PTY exit for post-session review
- Diff summary displays inline in the session card, replacing live terminal preview
- Diff at git diff --stat level: file list with +/- counts, commit list. No line-by-line diff viewer.
- New Rust command `get_branch_diff_summary` returns files changed, insertions, deletions, commits vs merge target
- "Review & Merge" button on exited session card, visible when branch has commits ahead of merge target
- Button opens existing MergeDialog pre-populated with branch info -- reuses v1.0 merge UI
- Crashed sessions also get merge button but with warning styling (partial work may exist)
- Color-coded exit banner: green "Session complete" vs red "Session crashed (exit code N)"
- Post-session UI never auto-triggers -- user must click "Review" on exited card (POST-06)
- Distinguish PTY disconnect (network blip) from real exit: show "Disconnected" state, not "Exited"
- `delete_worktree` deferred to Phase 18 (wizard) -- this phase only bridges session-to-merge

### Claude's Discretion
- Exact diff summary layout within the card (spacing, typography)
- How to detect exit code from PTY process (platform-specific)
- Whether to add `'disconnected'` as separate SessionState or handle via isConnected flag

### Deferred Ideas (OUT OF SCOPE)
- POST-03 (multi-step wizard) -- deferred to Phase 18
- POST-04 (worktree cleanup prompt) -- deferred to Phase 18
- Full file-level diff viewer -- future milestone
- Auto-merge on clean exit -- explicitly out of scope (anti-feature)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POST-01 | User sees a diff summary (files changed, insertions, deletions, commits) when a session exits | New `get_branch_diff_summary` Rust command using git2 `Diff::tree_to_tree()` + `DiffStats`; `DiffSummary` React component |
| POST-02 | User can initiate merge from an exited session card with one click | `PostSessionActions` component with "Review & Merge" button calling `merge-store.fetchPreview()` then opening `MergeDialog` |
| POST-05 | Non-zero exit codes show a distinct "session crashed" prompt vs clean exit | `ExitBanner` component color-coded by exit code; exit code captured from `TerminalEvent::Exit { code }` already sent by PTY reader |
| POST-06 | Post-session workflow never auto-triggers; always requires explicit user action | Tab transitions to `'exited'` state silently; UI renders diff summary inline but user must click to merge; toast fires with "View Session" action |
</phase_requirements>

## Standard Stack

### Core (Already Present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 | 0.20 | `Diff::tree_to_tree()`, `DiffStats` for file-level diff summary | Already in Cargo.toml; provides `files_changed()`, `insertions()`, `deletions()` |
| Zustand | 5.0 | Terminal store state management for exited session lifecycle | Existing store pattern; Map cloning for reactivity |
| sonner | ^2.0.7 | Toast on session exit ("Session exited" / "Session crashed") | Installed in Phase 14; imperative API from store |
| lucide-react | 1.7 | Icons: CheckCircle2, AlertTriangle, WifiOff, GitMerge, Clock | Already installed |
| shadcn/ui | (radix-ui 1.4) | button, badge, card, scroll-area, separator (all pre-existing) | No new shadcn installs needed |

### No New Dependencies

Phase 15 requires zero new npm packages and zero new Rust crates. Everything builds on existing infrastructure.

## Architecture Patterns

### Recommended Project Structure (New/Modified Files)

```
src-tauri/src/
  git/
    diff.rs              # NEW: get_branch_diff_summary logic
    mod.rs               # MODIFY: add pub mod diff
  commands/
    git_commands.rs       # MODIFY: add get_branch_diff_summary command

src-ui/src/
  stores/
    terminal-store.ts     # MODIFY: SessionState union, exitCode field, exited toast
  components/
    session/
      SessionCard.tsx     # MODIFY: exited state rendering with new sub-components
      SessionManager.tsx  # MODIFY: exit code capture, keep exited tabs, merge bridge
      ExitBanner.tsx      # NEW: color-coded exit status banner
      DiffSummary.tsx     # NEW: inline diff stats display
      PostSessionActions.tsx  # NEW: action row with Review & Merge button
  lib/
    alerts.ts            # MODIFY: add exit toast configs (clean + crash)
  types/
    diff.ts              # NEW: DiffSummaryData type mirroring Rust struct
```

### Pattern 1: Exit Code Capture from PTY

**What:** The PTY reader thread already sends `TerminalEvent::Exit { code: Option<u32> }` on EOF. However, `code` is currently always `None` because the reader thread does not wait for the child process exit status.

**When to use:** When the reader thread detects EOF (read returns 0 bytes).

**Current behavior (pty.rs line 164):**
```rust
Ok(0) => {
    // EOF -- process exited
    let _ = on_event.send(TerminalEvent::Exit { code: None });
    break;
}
```

**Required change:** After the reader loop exits, wait on the child process to get the real exit code. The challenge is that the reader thread does not own the `child` -- it is in `TerminalSession`. Two approaches:

1. **Share child via Arc<Mutex<>>** -- wrap `child` in `Arc<Mutex<Box<dyn Child>>>`, clone into reader thread, call `child.wait()` after EOF to get exit status. This is the clean approach.
2. **Post-exit poll from frontend** -- after receiving `Exit { code: None }`, frontend calls a new `terminal_exit_code` command that waits on the child. More complex, adds latency.

**Recommendation:** Approach 1 (Arc<Mutex<>> in reader thread). The reader thread already outlives the PTY output, so waiting on the child after EOF is safe and nearly instant.

**Implementation detail:** `portable_pty::ExitStatus` provides `success()` but platform-specific exit code extraction requires checking the inner value. On Windows, `ExitStatus` wraps a `u32` accessible via `portable_pty::ExitStatus`. Use:
```rust
let status = child_clone.lock().unwrap().wait().ok();
let code = status.and_then(|s| {
    if s.success() { Some(0) } else { Some(1) } // portable_pty doesn't expose raw code directly
});
```

**Important caveat:** `portable_pty::ExitStatus` does not expose the raw Windows exit code. It only provides `success()` (true/false). To get the actual exit code number, you may need to use `std::process::ExitStatus` if the child provides it, or accept that we can only distinguish clean (0) from crashed (non-zero). Research into the portable-pty source confirms `ExitStatus` has a private `code` field on Windows -- you may need to use a workaround or accept boolean-level granularity. The UI spec handles this fine: "Session complete" vs "Session crashed (exit code N)" can show "exit code 1" as a generic crash indicator if the raw code is unavailable.

### Pattern 2: Exited Tab Lifecycle

**What:** When PTY exits, the tab transitions to `'exited'` state instead of being removed. The tab persists in the card grid until the user explicitly dismisses it.

**Store changes needed:**
```typescript
// terminal-store.ts
export type SessionState = "working" | "waiting" | "idle" | "error" | "exited" | "disconnected" | null;

export interface TerminalTab {
  // ... existing fields ...
  exitCode: number | null;  // NEW: null until session exits
  exitedAt: number | null;  // NEW: timestamp of exit for duration display
}
```

**Key behavior:**
- `setTabConnected(tabId, false)` currently sets `sessionState: null`. For exited sessions, a NEW action `setTabExited(tabId, exitCode)` should set `sessionState: 'exited'`, `isConnected: false`, `exitCode`, and `exitedAt`.
- `closeTab` works unchanged -- removes tab from Map.
- `getSessionCounts` should be updated to include `exited` count (or exclude it from the active counts; the UI spec shows exited cards in the grid but they're not "active").

### Pattern 3: Diff Summary Backend (git2)

**What:** New Rust command that computes diff stats between a branch and its merge target.

**git2 API surface:**
```rust
use git2::{Repository, Diff, DiffOptions, DiffStats, Sort};

pub struct DiffSummaryData {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub files: Vec<DiffFileEntry>,
    pub commits: Vec<CommitInfo>,  // Reuse from merge.rs
}

pub struct DiffFileEntry {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
}

// Implementation:
let repo = Repository::open(project_path)?;
let source = repo.find_branch(source_branch, BranchType::Local)?;
let target = repo.find_branch(merge_target, BranchType::Local)?;
let source_tree = source.get().peel_to_tree()?;
let target_tree = target.get().peel_to_tree()?;

let diff = repo.diff_tree_to_tree(Some(&target_tree), Some(&source_tree), None)?;
let stats = diff.stats()?;
// stats.files_changed(), stats.insertions(), stats.deletions()

// Per-file stats via diff.foreach():
let mut files = Vec::new();
diff.foreach(
    &mut |delta, _| {
        // delta.new_file().path() gives the file path
        true
    },
    None, None,
    &mut |delta, _hunk, line| {
        // Count per-file insertions/deletions from line origins
        true
    },
)?;
```

**Note:** Per-file insertion/deletion counts require iterating line-by-line via `diff.foreach()` with the line callback. The `DiffStats` only gives aggregate totals. For per-file stats, use `diff.print(DiffFormat::Patch, ...)` or iterate deltas with `diff.deltas()` and compute stats per delta using `diff.stats()` -- but git2 does not provide per-file stats directly.

**Better approach for per-file stats:** Use `Diff::deltas()` iterator to get file paths, then for each delta, create a sub-diff or accumulate from the line callback:
```rust
// Accumulate per-file stats in the line callback
diff.foreach(
    &mut |_delta, _progress| true,  // file_cb
    None,                             // binary_cb
    &mut |_delta, _hunk| true,       // hunk_cb
    &mut |delta, _hunk, line| {      // line_cb
        let path = delta.new_file().path().unwrap_or(delta.old_file().path().unwrap_or_default());
        match line.origin() {
            '+' => { /* increment insertions for this path */ }
            '-' => { /* increment deletions for this path */ }
            _ => {}
        }
        true
    },
)?;
```

**Commit list:** Reuse the same pattern from `merge_preview()` in `merge.rs` -- walk commits from source tip to merge base using `Revwalk` with `Sort::TOPOLOGICAL`.

### Pattern 4: Session-to-Merge Bridge

**What:** "Review & Merge" button on exited card opens MergeDialog pre-populated with branch info.

**How it works:**
1. ExitBanner + DiffSummary render inline in the exited SessionCard
2. PostSessionActions renders "Review & Merge" button
3. On click: look up the project config and branch info from stores
4. Call `merge-store.fetchPreview()` with project path, branch name, merge target, build patterns, changelog config
5. Open MergeDialog (existing component) -- it picks up preview from merge-store

**Key integration point:** The `MergeDialog` currently accepts a `branch: BranchInfo | null` prop and a `project: ProjectConfig` prop. The exited session card has `tab.branchName` and `tab.projectId` -- these map to the project config via `config-store`. The `BranchInfo` can be looked up from `branch-store` by matching `worktree_path`.

**Where to mount MergeDialog:** The MergeDialog should be rendered in `SessionManager` (or the exited card's parent) with state controlling `open`. When the user clicks "Review & Merge" on an exited card, set the merge dialog state to open with the relevant branch/project.

### Pattern 5: Exit Toast Notifications

**What:** Fire a toast when a session exits (clean or crash) following Phase 14's toast system.

**Integration:** Add exit state configs to `alerts.ts`:
```typescript
// Add to toastConfig in alerts.ts
exited: {
  title: (branch) => `${branch} exited`,
  description: 'Session completed successfully',
  isError: false,
},
crashed: {
  title: (branch) => `${branch} crashed`,
  description: 'Exited with code {N}',
  isError: true,
},
```

**Where to fire:** In `terminal-store.ts`'s new `setTabExited` action, call `fireSessionAlert` with a synthetic state string. Or add a dedicated `fireExitToast` function that handles the exit-specific copy.

### Anti-Patterns to Avoid

- **Auto-triggering post-session workflow:** Never open a dialog, modal, or wizard when a session exits. The card transitions silently; user must click.
- **Removing exited tabs from the grid:** Tabs must persist until explicitly dismissed (X button) or merged.
- **Fetching diff on every render:** Fetch diff summary once when the tab enters `'exited'` state and store it on the tab object. Do not re-fetch on every render cycle.
- **Using merge_preview for diff summary:** While `merge_preview` returns commit data, it also does conflict detection and build number calculation -- heavier than needed. Use a dedicated lightweight diff summary command.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff statistics | Custom git CLI parsing | git2 `Diff::tree_to_tree()` + `DiffStats` | Already in Cargo.toml; handles edge cases (renames, binary files) |
| Toast notifications | Custom notification DOM | Sonner (already installed) | Phase 14 established the pattern; imperative API from stores |
| Merge flow | New merge dialog | Existing `MergeDialog` + `merge-store` | Fully functional from v1.0; accepts branch info programmatically |
| Scroll overflow in file list | Custom scroll container | shadcn `scroll-area` (already installed) | Handles overflow, custom scrollbar, keyboard navigation |

## Common Pitfalls

### Pitfall 1: PTY Exit Code Always None
**What goes wrong:** The reader thread sends `TerminalEvent::Exit { code: None }` because it doesn't own the child process to call `wait()`.
**Why it happens:** The child is in `TerminalSession`, owned by `TerminalManager`, locked behind `Mutex<TerminalManager>`. The reader thread only has the PTY reader handle.
**How to avoid:** Share the child process handle via `Arc<Mutex<>>` between the session and the reader thread. After EOF, the reader thread locks the child and calls `wait()`.
**Warning signs:** All sessions show as "Session complete" even when they crashed.

### Pitfall 2: Exited State Triggers "setTabConnected" Null State
**What goes wrong:** The existing `TerminalInstance` component calls `setTabConnected(id, false)` on `TerminalEvent::Exit`, which sets `sessionState: null`. This would clear the exited state.
**Why it happens:** The Exit handler in `SessionManager.tsx` (line 94-97) calls `setTabConnected` which resets state to null.
**How to avoid:** Handle the Exit event differently: instead of `setTabConnected(false)`, call a new `setTabExited(tabId, exitCode)` action that preserves the exited state. The Exit handler in `TerminalInstance.onEvent` must be updated.
**Warning signs:** Cards flash to "exited" then immediately show "connecting..." because state goes null.

### Pitfall 3: Diff Summary Fetch Timing
**What goes wrong:** Diff summary is fetched before the session's final commits are pushed, showing stale data.
**Why it happens:** PTY exit event fires as soon as the process exits, but the user may have just told Claude to commit. Git operations in the PTY may not have completed their git object writes when the exit event arrives.
**How to avoid:** Fetch diff summary lazily -- when the user first views the exited card or clicks "Review" -- not immediately on exit. Alternatively, add a small delay (500ms) before fetching. The UI spec says the card shows the diff summary inline immediately, so a lazy load with a loading skeleton is appropriate.
**Warning signs:** Diff shows "0 files changed" despite the session clearly having made changes.

### Pitfall 4: MergeDialog Branch Lookup Failure
**What goes wrong:** The "Review & Merge" button cannot find `BranchInfo` for the exited session's branch.
**Why it happens:** `branch-store` may not have refreshed since the session ended. The branch list might be stale.
**How to avoid:** Before opening MergeDialog, trigger a `silentRefresh()` of the branch store to ensure current data. The MergeDialog's `useEffect` already fetches preview on open, but the `branch` prop must be valid.
**Warning signs:** "Review & Merge" button opens an empty or errored MergeDialog.

### Pitfall 5: Disconnected vs Exited Confusion
**What goes wrong:** Network blips on NAS paths cause the PTY reader to return an error (not EOF), which is misinterpreted as a crash.
**Why it happens:** The reader thread sends `TerminalEvent::Error { message }` on read errors, which could be transient network issues.
**How to avoid:** On `TerminalEvent::Error`, transition to `'disconnected'` state (not exited). Only `TerminalEvent::Exit` should trigger the exited state. The disconnected state shows a gray banner with no diff summary and no merge button.
**Warning signs:** Sessions on NAS worktrees constantly show "Session crashed" on brief network interruptions.

## Code Examples

### git2 Diff Summary (Rust)
```rust
// Source: git2 docs - Diff::tree_to_tree
use git2::{BranchType, Repository, DiffFormat, DiffOptions};
use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffSummaryData {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub files: Vec<DiffFileEntry>,
    pub commits: Vec<CommitInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffFileEntry {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
}

pub fn get_branch_diff_summary(
    project_path: &str,
    source_branch: &str,
    merge_target: &str,
) -> Result<DiffSummaryData, GitError> {
    let repo = Repository::open(project_path)?;

    let source_ref = repo.find_branch(source_branch, BranchType::Local)?;
    let target_ref = repo.find_branch(merge_target, BranchType::Local)?;

    let source_tree = source_ref.get().peel_to_tree()?;
    let target_tree = target_ref.get().peel_to_tree()?;

    let diff = repo.diff_tree_to_tree(
        Some(&target_tree),
        Some(&source_tree),
        None,
    )?;

    let stats = diff.stats()?;

    // Per-file stats
    let mut file_stats: HashMap<String, (usize, usize)> = HashMap::new();
    diff.foreach(
        &mut |_delta, _progress| true,
        None,
        &mut |_delta, _hunk| true,
        &mut |delta, _hunk, line| {
            let path = delta.new_file().path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let entry = file_stats.entry(path).or_insert((0, 0));
            match line.origin() {
                '+' => entry.0 += 1,
                '-' => entry.1 += 1,
                _ => {}
            }
            true
        },
    )?;

    let files: Vec<DiffFileEntry> = file_stats.into_iter()
        .map(|(path, (ins, del))| DiffFileEntry { path, insertions: ins, deletions: del })
        .collect();

    // Commits (reuse revwalk pattern from merge_preview)
    // ... revwalk from source tip to merge base ...

    Ok(DiffSummaryData {
        files_changed: stats.files_changed(),
        insertions: stats.insertions(),
        deletions: stats.deletions(),
        files,
        commits: vec![], // populated by revwalk
    })
}
```

### Exited Tab State Transition (TypeScript)
```typescript
// New action in terminal-store.ts
setTabExited: (tabId: string, exitCode: number | null) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    const next = new Map(current);
    next.set(tabId, {
        ...tab,
        sessionState: 'exited',
        isConnected: false,
        exitCode,
        exitedAt: Date.now(),
    });
    set({ tabs: next });

    // Fire exit toast
    const isClean = exitCode === null || exitCode === 0;
    fireExitToast(tabId, tab.branchName, isClean, exitCode);
},
```

### Exit Handler in TerminalInstance (Modified)
```typescript
// In SessionManager.tsx TerminalInstance onEvent handler
case 'Exit':
    write(`\r\n\x1b[90m[Process exited: ${event.code ?? '?'}]\x1b[0m\r\n`);
    if (terminalIdRef.current) {
        // Use new setTabExited instead of setTabConnected
        setTabExited(terminalIdRef.current, event.code ?? null);
    }
    break;
case 'Error':
    write(`\r\n\x1b[31m[${event.message}]\x1b[0m\r\n`);
    if (terminalIdRef.current) {
        // Network error = disconnected, not exited
        setTabDisconnected(terminalIdRef.current);
    }
    break;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setTabConnected(false)` on exit | New `setTabExited(id, code)` preserving state | This phase | Exited tabs survive in grid |
| No exit code from PTY | `child.wait()` in reader thread via Arc<Mutex<>> | This phase | Clean vs crash distinction |
| MergeDialog only from BranchTable | MergeDialog from exited session card | This phase | Session-to-merge bridge |

## Open Questions

1. **portable-pty ExitStatus raw code access**
   - What we know: `portable_pty::ExitStatus::success()` returns bool. The struct has platform-specific internals.
   - What's unclear: Whether the raw exit code (e.g., 137 for SIGKILL) is accessible without patching portable-pty.
   - Recommendation: Implement with `success()` boolean first (0 vs non-zero). If raw codes are needed, check `portable_pty::ExitStatus` source or use `std::process::Command` fallback. The UI spec only needs "exit code N" which can show "1" generically.

2. **Diff summary fetch timing vs git object availability**
   - What we know: Git operations complete before process exit in normal flow.
   - What's unclear: Edge case where PTY exits mid-commit (Ctrl+C during git operations).
   - Recommendation: Fetch diff lazily (on card mount or button click) with loading state. If fetch fails, show "Could not load diff summary" per UI spec copy.

## Project Constraints (from CLAUDE.md)

- **Tauri 2 + React 19 + TypeScript** -- all frontend code in `src-ui/src/`, Rust backend in `src-tauri/src/`
- **Zustand 5 for state** -- all `invoke()` calls in stores, not components
- **shadcn/ui + Radix UI** -- use existing primitives (button, badge, scroll-area)
- **snake_case** Tauri commands, **camelCase** TypeScript, **PascalCase** components
- **New Tauri command pattern:** logic in `src-tauri/src/git/diff.rs`, command in `commands/git_commands.rs`, register in `lib.rs`
- **New component pattern:** domain components in `src-ui/src/components/session/`
- **Import path aliases:** use `@/` for all internal imports
- **Error handling:** Rust uses `thiserror` enums with `serde::Serialize`; TypeScript stores use `try/catch` with `error: string | null`
- **No ESLint config checked in** but `react-hooks/exhaustive-deps` suppression comments required when skipping deps
- **Map cloning pattern:** `new Map(get().tabs)` on every mutation for Zustand reactivity
- **Event naming:** kebab-case for Tauri events (`session-state-changed`), `grove:` prefix for custom DOM events

## Sources

### Primary (HIGH confidence)
- Codebase: `src-tauri/src/terminal/pty.rs` -- PTY spawn, reader thread, Exit event with `code: None`
- Codebase: `src-tauri/src/terminal/mod.rs` -- TerminalEvent enum, TerminalSession struct, TerminalManager
- Codebase: `src-ui/src/stores/terminal-store.ts` -- SessionState type, TerminalTab, Map reactivity pattern
- Codebase: `src-ui/src/components/session/SessionCard.tsx` -- current card layout, stateConfig pattern
- Codebase: `src-ui/src/components/session/SessionManager.tsx` -- TerminalInstance exit handler (line 94), focus/grid lifecycle
- Codebase: `src-ui/src/stores/merge-store.ts` -- MergeStep state machine, fetchPreview/executeMerge
- Codebase: `src-ui/src/components/MergeDialog.tsx` -- props interface (branch, project, open, onOpenChange)
- Codebase: `src-ui/src/lib/alerts.ts` -- toast system, fireSessionAlert, toast priority queue
- Codebase: `src-tauri/src/commands/git_commands.rs` -- command registration pattern, merge_preview command
- Codebase: `src-tauri/src/git/merge.rs` -- MergePreview, CommitInfo structs (reusable for diff)
- git2 docs: `Diff::tree_to_tree()`, `DiffStats`, `diff.foreach()` line callback
- Phase 15 UI Spec: `15-UI-SPEC.md` -- complete visual and interaction contract

### Secondary (MEDIUM confidence)
- portable-pty docs: ExitStatus API surface -- `success()` confirmed, raw code access uncertain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing infrastructure verified in source
- Architecture: HIGH -- based on direct reading of all modified files; integration points verified
- Pitfalls: HIGH -- derived from actual code patterns (Exit handler null state, PTY code: None, NAS error vs exit)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable domain, no fast-moving dependencies)
