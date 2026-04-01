# Domain Pitfalls: Merge Automation, Merge Queues, Toast Notifications, Legacy Path Removal

**Domain:** Adding composable merge engine, multi-branch merge queue, toast notifications, and removing external launch path in existing Tauri 2 desktop git tool
**Researched:** 2026-04-01
**Overall Confidence:** HIGH (based on codebase analysis of existing merge/session implementations + domain expertise)

---

## Critical Pitfalls

Mistakes that cause repository corruption, data loss, or require rewrites.

### Pitfall 1: Merge Queue Corrupts Repository State on Mid-Queue Failure

**What goes wrong:**
When merging branches sequentially (A, B, C into develop), if B fails mid-merge, the repository is left in a partially merged state. Branch A's merge committed successfully with a bumped build number, but B's merge left a dirty index/working directory. The user has a repo where develop contains A's merge but the working tree is in conflict, and C cannot proceed. The current `merge_branch()` function does `repo.set_head()` and `repo.checkout_head(force)` at the start of each merge -- if called for B after A succeeded, it force-checkouts the already-bumped develop, but a conflict during B's in-memory merge leaves the forced checkout without a corresponding commit.

**Why it happens:**
The existing `merge_branch()` in `src-tauri/src/git/merge.rs` was designed for single-branch merge. It mutates HEAD, writes to disk (build bump via `bump_build_number()`, changelog rename), then creates the commit. There is no transaction boundary or savepoint. Extending to a queue without adding rollback points means any failure leaves accumulated side effects from prior successful merges plus partial effects of the failed one.

**How to avoid:**
- Record a "snapshot OID" (develop HEAD before the queue starts) before beginning any queue execution
- Each merge step must verify the expected HEAD OID before proceeding (guard against drift)
- On failure: offer two recovery paths: (a) rollback entire queue by resetting develop to snapshot OID, or (b) keep successful merges and abort remaining
- Never call `bump_build_number()` on disk until the in-memory merge tree is fully validated -- the current code bumps on disk between tree write and final commit (line ~224 of merge.rs), which is the danger zone
- Consider making each queue merge self-contained: verify preconditions independently, checkpoint after each success

**Warning signs:**
- Build number files on disk don't match the committed tree after queue completes
- `git status` shows modified/untracked files after a "successful" queue run
- Queue error messages don't include which step failed or what was already committed

**Phase to address:**
Phase 1 (Composable Merge Engine) -- the engine must be transactional before the queue can use it.

---

### Pitfall 2: Build Number Race Condition in Multi-Branch Queue

**What goes wrong:**
The current `detect_current_build()` reads build numbers from disk at merge time. In a queue of 3 branches, each merge bumps N -> N+1. But `detect_current_build()` reads from the filesystem, and the previous merge's on-disk bump may not be correctly reflected if the intermediate commit hasn't been fully checked out. Result: merge A bumps 42->43, merge B calls `detect_current_build()` and reads the disk file showing 43, bumps to 44 -- but merge C's detect call reads from the git tree (not disk) and sees 42, producing build 43 again. Two merges now share the same build number.

**Why it happens:**
`detect_current_build()` in `build.rs` uses `glob::glob` on the filesystem, not the git tree. `bump_build_number()` writes to filesystem. But `merge_branch()` then reads those disk files back into a git index via `final_index.add_frombuffer()`. The git tree and filesystem are two different states. Without a full `checkout_head()` between sequential merges, they can diverge.

**How to avoid:**
- Pass the "current build" into the queue orchestrator; increment it in-memory between queue steps rather than re-detecting from disk each time
- After each successful merge commit, do a full `checkout_head()` before the next merge to synchronize disk and git tree
- Add a post-queue assertion: final build number on disk == initial build + number of merges in queue
- Consider reading build numbers from the git tree (via `repo.find_commit().tree()`) rather than from disk

**Warning signs:**
- Build numbers in committed files don't increase monotonically across sequential merges
- `detect_current_build()` returns different values depending on whether you read from the working tree or the HEAD commit's tree

**Phase to address:**
Phase 2 (Multi-Branch Merge Queue) -- the queue orchestrator must own build number sequencing.

---

### Pitfall 3: Removing External Launch Path Leaves Orphaned Session Tracking

**What goes wrong:**
The external launch path (`launch_claude_session` in `process/launch.rs`) returns PIDs tracked in `session-store.ts` via `activeSessions: Record<string, number>`. The embedded terminal path uses `terminal-store.ts` with terminal IDs. When you remove the external launch function, the session store still exists with its polling (`get_active_sessions`), its PID-based tracking, and its `launchSession()` action. Any component still importing from `session-store.ts` will either silently do nothing or error. The Rust-side `get_active_sessions` command wastes cycles scanning for processes. The `launch_session` command remains registered in `main.rs`.

**Why it happens:**
Two parallel tracking systems were built across milestones: `session-store.ts` (PID-based, for external terminals) and `terminal-store.ts` (terminal-ID-based, for embedded PTY). They were never unified because both paths coexisted. Removing one launch path without removing its entire tracking subsystem leaves zombie infrastructure.

**How to avoid:**
- Audit every consumer of `useSessionStore` and `session-store.ts` before removing the launch function
- Remove or repurpose `session-store.ts` entirely -- do not leave it as dead code
- Remove Rust-side commands: `launch_session`, `get_active_sessions` from the command handler registration in `main.rs`
- Remove `process/launch.rs` and the `launch_claude_session` / `launch_claude_via_cmd` functions
- Grep for all Tauri invoke calls referencing removed commands
- Consider whether `openInVscode` and `openInExplorer` (currently in session-store) should move to a utility store

**Warning signs:**
- Imports from `session-store.ts` still exist in the codebase after migration
- The `launch_session` Tauri command is still registered in `main.rs`
- `get_active_sessions` polling still runs on an interval somewhere
- `useSessionStore` appears in any component

**Phase to address:**
Phase 4 (Kill External Launch Path) -- but the audit must happen at the START of the phase, not after removal.

---

### Pitfall 4: Composable Merge Steps Called Out of Order

**What goes wrong:**
A composable merge engine (diff summary -> commit -> merge -> build bump -> changelog rename -> cleanup) allows steps to be skipped for projects that don't use build numbers or changelogs. But the current `merge_branch()` has implicit ordering dependencies: build bump must happen after the merge tree is written, changelog rename needs the new build number, cleanup (branch deletion) must happen after the merge commit succeeds. If steps are decomposed into independently callable functions, a bug or API misuse reorders "cleanup" before "commit" and deletes the worktree branch before the merge is committed.

**Why it happens:**
"Composable" is interpreted as "independently callable" when the steps actually have hard sequential dependencies. The current monolithic `merge_branch()` function encodes the order implicitly through its control flow. Decomposition must explicitly encode what was implicit.

**How to avoid:**
- Model the pipeline as a state machine, not a list of functions. Each step knows its prerequisites and validates them
- Steps should be composable in terms of *inclusion* (skip build bump if no build files configured) but not *ordering* -- the order is fixed by the domain
- Each step returns a context object that the next step requires. If step N's output is missing, step N+1 refuses to run
- The "composable" part is: which steps are included in the pipeline, not how they are ordered
- Use a builder pattern: `MergePipeline::new().with_build_bump().with_changelog().execute()`

**Warning signs:**
- Step functions accept raw parameters instead of a pipeline context object
- No validation at the start of each step that prerequisites have been met
- Steps can be called directly from outside the pipeline controller

**Phase to address:**
Phase 1 (Composable Merge Engine) -- design the step protocol before implementing individual steps.

---

### Pitfall 5: Merge Engine Operates on Wrong Working Directory

**What goes wrong:**
The current merge code opens the repository via `Repository::open(project_path)` and then calls `repo.checkout_head(force)` which modifies the main repo's working directory. If a user has the main repo open in VS Code or has an active Claude Code session on the main repo, force-checkout silently overwrites their files. Furthermore, `bump_build_number()` reads/writes files relative to `project_path`, but if the repo path is the main worktree, build bump files get modified while the user's editor has them open.

**Why it happens:**
libgit2's `Repository::open()` on the main repo path gives you the main repo's working directory. The merge code does `repo.set_head()` + `repo.checkout_head(force)` which changes the HEAD ref and then force-checkouts the working directory to match. This was designed for a workflow where the user isn't actively using the main repo directory. But with embedded terminals, a user may have a session running in the main repo while merging branches from worktrees.

**How to avoid:**
- Before force-checkout, check if any terminal tab has the same working directory open. If so, warn the user
- Consider doing merges entirely in-memory (the current code already uses `merge_commits()` for in-memory merge). Extend this to build the final tree without touching the working directory, then write only the commit. Defer `checkout_head()` to an explicit user action
- Add a pre-merge check: "Is this working directory clean? Is any process using it?"
- The file watcher (`src-tauri/src/watcher/`) will detect the force-checkout changes and trigger UI refresh -- make sure this doesn't cause a cascade of events during merge

**Warning signs:**
- VS Code shows "file changed on disk" warnings during merge
- Terminal tabs connected to the main repo show unexpected file changes
- File watcher fires rapidly during merge operations

**Phase to address:**
Phase 1 (Composable Merge Engine) -- the engine must decide upfront whether merges touch the working directory.

---

### Pitfall 6: Post-Session Workflow Triggers on False "Session Ended" Signal

**What goes wrong:**
The session state detection (`session-state-changed` event) transitions sessions to states like "idle" or disconnected. If the post-session workflow (diff summary -> commit -> merge) triggers automatically on session end, it will fire on false signals: PTY process crash, terminal disconnect on NAS network blip, user pressing Ctrl+C to cancel a Claude operation (which may exit the process), or Claude Code finishing one task but the user wanting to continue in the same session.

**Why it happens:**
PTY exit codes are unreliable on Windows -- especially via `wt.exe` where the PID is the wrapper, not Claude. The `isConnected: false` state in terminal-store doesn't distinguish "user finished" from "process crashed." The current `setTabConnected(terminalId, false)` on `Exit` event (line 97 of SessionManager.tsx) treats all exits the same.

**How to avoid:**
- Post-session workflow must NEVER auto-trigger. Always require explicit user action
- Offer it as a prominent call-to-action in the SessionCard when session enters terminal state (exit code 0, idle for >30s)
- If process exits with non-zero code, show a different prompt ("Session crashed -- review changes?")
- The composable engine should have preview/dry-run as its first step so the user sees what will happen before execution
- Consider a "session complete" button in the focus-mode bottom bar

**Warning signs:**
- Merge workflow starts while Claude Code is still running or just restarted
- Post-session workflow triggers on PTY reconnection failures
- Users report branches being merged with half-finished work

**Phase to address:**
Phase 1 (Composable Merge Engine) -- the trigger mechanism is as important as the engine itself.

---

### Pitfall 7: Toast Notification Stack Overflow During Batch Merge

**What goes wrong:**
A multi-branch merge queue processing 5 branches emits status toasts: "Merging A...", "A merged", "Build bumped to 44", "Merging B...", "B merged", "Build bumped to 45"... That is 15+ toasts in rapid succession. They stack, overflow the viewport, obscure the merge progress UI, and auto-dismiss timers create a waterfall of appearing/disappearing elements. Actionable toasts ("Merge failed -- Retry?") get pushed off-screen by informational ones.

**Why it happens:**
Toast systems are designed for occasional notifications. Batch operations produce bursts. Without rate limiting or toast deduplication, every event produces a toast.

**How to avoid:**
- Implement toast priority levels: `critical` (persists until dismissed, has action buttons), `info` (auto-dismiss 3-5s), `progress` (replaces previous progress toast for same operation ID)
- For batch operations, use a single "progress" toast that updates in-place: "Merging 2/5: branch-b" rather than individual toasts per step
- Set a max visible toast count (3-4). Excess toasts queue and appear as previous ones dismiss
- Critical toasts always take priority over info toasts and cannot be pushed off-screen
- Auto-dismiss duration varies by type: 3s for success, never for errors requiring action

**Warning signs:**
- More than 4 toasts visible simultaneously during testing
- Actionable toasts scroll off-screen or auto-dismiss before user can interact
- Toast stack height exceeds viewport

**Phase to address:**
Phase 3 (Toast Notifications) -- design must account for Phase 2's batch operations.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single merge-store for both single merge and queue | Reuse existing store | Queue state (current index, rollback points, partial results) doesn't fit the single-merge step model; store becomes conditional spaghetti | Never -- create a dedicated queue store |
| Toasts as simple `string[]` in state | Quick to implement | No priority, no deduplication, no update-in-place, no action callbacks; must rewrite when batch operations arrive | Never -- design for batch from day one |
| Keeping `session-store.ts` alongside `terminal-store.ts` | Avoids migration risk | Two competing sources of truth for "what sessions are running"; bugs where one store says active and other says inactive | Never -- remove during kill-external-path phase |
| Force-checkout in merge to sync working directory | Ensures disk matches commit | Destroys uncommitted work in target directory; dangerous when other processes use the same directory | Only when engine has verified no other process is using the working directory |
| Inline toast component per-page instead of global provider | Fewer abstractions | Toasts only show on the page that created them; navigating away loses notifications | Never -- toasts must be app-global from the start |
| Hardcoding merge step order instead of state machine | Faster initial implementation | Adding/removing steps requires modifying control flow throughout; no clean way to skip steps conditionally | Acceptable for MVP if step inclusion is the only variation (not ordering) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| libgit2 `merge_commits()` vs working directory | Assuming in-memory merge updates the working directory (it does not) | Use `merge_commits()` for validation and tree building, then explicitly handle working directory via `checkout_tree()` or manual writes |
| libgit2 worktree handles | Opening main repo path and assuming it covers all worktree branches | Verify the opened repo's workdir matches expectations; use `repo.workdir()` to confirm |
| `bump_build_number()` disk writes | Bumping on disk then reading back into git index creates a window where disk and index diverge | Build the new content in memory, write to both disk and index atomically, or defer disk writes until after commit |
| Tauri event system for toasts | Emitting toast events from Rust with `window.emit()` | Use `app.emit()` (app-wide) not `window.emit()` (window-specific); use Zustand store as the toast state container, events just trigger store updates |
| Zustand `Map<>` reactivity | Using `Map` in state and expecting React to re-render on `.set()` | Must create `new Map(...)` on every mutation (terminal-store does this correctly -- maintain the pattern in any new stores) |
| File watcher during merge operations | Merge modifies files on disk, watcher fires, triggers branch refresh during merge | Pause watcher or add a "merge in progress" flag that suppresses watcher-triggered refreshes |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Merge preview for queue of N branches | N sequential `merge_preview()` calls, each opening the repo and walking commits | Batch preview: open repo once, run all previews in a single Rust command returning `Vec<MergePreview>` | Queue of 5+ branches |
| Toast animation rerenders | Toast stack causes layout thrashing on add/remove | Use CSS animations for enter/exit, `position: fixed` to avoid layout recalculation, `key` props for stable DOM | 5+ toasts animating simultaneously |
| File watcher cascade during merge | Each file write during merge triggers watcher, triggers branch refresh, triggers re-render | Add merge-in-progress guard that defers watcher events until merge completes | Any merge with build bump + changelog rename |
| Re-creating Map on every terminal store mutation | Lag with many open sessions; each mutation copies entire Map | Profile before optimizing; consider `Record<string, TerminalTab>` if Map copy becomes measurable | 15+ concurrent sessions |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Toast for every merge step in a queue | Information overload; cannot distinguish important from routine | Single progress toast for the queue; individual toasts only for errors or final completion |
| Auto-dismissing error toasts | User misses the error, doesn't know why merge queue stopped | Error toasts persist until explicitly dismissed; include "Retry" or "View Details" action button |
| Merge queue with no progress indicator beyond toasts | User doesn't know if queue is running, stuck, or finished | Show "Merging 2 of 5: branch-name" with progress bar in the merge UI, not just toasts |
| Post-session "merge now" with no preview | User accidentally merges unfinished work | Always show diff summary first; merge button only appears after preview |
| Removing external launch with no migration UX | Users who relied on external terminals wonder where the option went | One-time informational toast on first launch after upgrade; ensure embedded terminal handles all previous flags |
| Branch picker for merge queue doesn't show conflict status | User selects branches that have conflicts, queue fails immediately | Show conflict/clean indicator in multi-select list before queue starts |
| Merge queue rollback with no explanation | After rollback, user doesn't know what happened or why | Show a detailed summary: "Merged: A, B. Failed: C (reason). Rolled back: A, B. Develop restored to build 42." |

## "Looks Done But Isn't" Checklist

- [ ] **Merge Queue:** Often missing rollback-on-failure -- verify that a mid-queue failure leaves the repo in a known-good state
- [ ] **Merge Queue:** Often missing queue-level progress -- verify user can see which branch is being merged, how many remain, and estimated completion
- [ ] **Toast System:** Often missing keyboard accessibility -- verify toasts can be dismissed with Escape, action buttons are focusable
- [ ] **Toast System:** Often missing stale closure bug -- verify that "Retry" buttons on error toasts still work after minutes (closures may reference stale Zustand state)
- [ ] **Composable Engine:** Often missing error context -- verify that when step 3 of 5 fails, the error includes which step failed, what succeeded, and what was skipped
- [ ] **External Path Removal:** Often missing command cleanup -- verify removed Tauri commands are also removed from the handler registration in `main.rs`
- [ ] **External Path Removal:** Often missing import cleanup -- verify no component still imports from `session-store.ts`
- [ ] **Build Bump in Queue:** Often missing post-queue verification -- verify final build number equals (initial + merge count) after full queue run
- [ ] **Merge Preview for Queue:** Often missing aggregate view -- verify user can see total commits, total conflicts, and build number range for entire queue

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mid-queue repository corruption | MEDIUM | Reset develop to pre-queue snapshot OID (must be recorded before queue starts); re-run queue from scratch |
| Build number desync across merges | LOW | Run `detect_current_build()`, compare against `git log` for last build commit, manually set correct number; add a "repair build number" utility command |
| Toast stack overflow blocking UI | LOW | Clear all toasts programmatically; add rate limiting; redeploy |
| Orphaned session store references | LOW | Remove dead imports; delete `session-store.ts`; grep for `useSessionStore` and replace all references |
| Wrong working directory modified during merge | HIGH | `git checkout -- .` to restore working directory; verify no data loss in active worktrees; may need `git stash` recovery for unsaved work |
| Post-session workflow on incomplete work | MEDIUM | `git revert` the merge commit on develop; re-checkout the source branch; user must verify their work is intact in the worktree |
| Composable step called out of order | LOW-HIGH | Depends on which step: cleanup before commit = branch deleted with unmerged work (HIGH); build bump before merge = wrong number (LOW, just re-bump) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Mid-queue repo corruption (#1) | Phase 1 (Merge Engine) | Simulate failure at each pipeline step; verify repo state is recoverable via snapshot OID |
| Build number race condition (#2) | Phase 2 (Merge Queue) | Run 5-branch queue; verify build numbers are sequential with no gaps or duplicates |
| Orphaned session tracking (#3) | Phase 4 (Kill External Path) | Grep for `session-store`, `launch_session`, `get_active_sessions`; zero results expected |
| Composable step ordering (#4) | Phase 1 (Merge Engine) | Attempt to call steps out of order; verify they refuse with clear error messages |
| Wrong working directory (#5) | Phase 1 (Merge Engine) | Run merge while another terminal has main repo open; verify no file disruption |
| Premature post-session trigger (#6) | Phase 1 (Merge Engine) | Kill a PTY mid-session; verify merge workflow does NOT auto-start; verify explicit action required |
| Toast stack overflow (#7) | Phase 3 (Toast System) | Trigger 20 rapid-fire toasts; verify max 4 visible, priority ordering maintained, errors persist |

---

## Architecture Decisions Forced by Pitfalls

These pitfalls collectively demand specific architectural choices for v2.1:

1. **Merge engine as state machine, not function list.** Pitfalls #1 and #4 require each step to validate preconditions and produce a context for the next step. A pipeline pattern with explicit state transitions is the only safe approach.

2. **Queue orchestrator owns build number sequence.** Pitfall #2 means `detect_current_build()` should be called once before the queue starts, then incremented in-memory per merge. Do not re-detect from disk between merges.

3. **Snapshot OID recorded before queue execution.** Pitfall #1 requires a rollback target. The queue orchestrator must record `develop`'s HEAD OID before step 1 and expose it for recovery.

4. **Toast system designed for batch operations from day one.** Pitfall #7 means the toast store needs priority levels, max-visible limits, and update-in-place for progress toasts. Cannot be bolted on after single-event toasts are shipped.

5. **Post-session workflow is always user-initiated, never automatic.** Pitfall #6 makes auto-trigger unsafe. The engine provides the workflow; the UI provides the trigger button after session completion is confirmed.

6. **Full audit before external path removal.** Pitfall #3 requires a systematic grep-based audit of all `session-store.ts` consumers, all `launch_session` invoke calls, and all Rust command registrations before any code is deleted.

---

## Sources

- Codebase analysis: `src-tauri/src/git/merge.rs` -- current merge with force-checkout at line 187, disk build bump at line 224, no transaction boundary
- Codebase analysis: `src-tauri/src/git/build.rs` -- filesystem-based build number detection via glob, disk writes before git index update
- Codebase analysis: `src-ui/src/stores/terminal-store.ts` -- terminal-ID tracking, Map-based state with manual `new Map()` for reactivity
- Codebase analysis: `src-ui/src/stores/session-store.ts` -- PID-based tracking, `get_active_sessions` polling, parallel to terminal-store
- Codebase analysis: `src-ui/src/stores/merge-store.ts` -- single-merge step model (idle -> preview -> confirm -> executing -> summary)
- Codebase analysis: `src-ui/src/components/session/SessionManager.tsx` -- session state event handling, exit detection, embedded terminal lifecycle
- Codebase analysis: `src-tauri/src/process/launch.rs` -- external launch via wt.exe/cmd.exe, to be removed
- Codebase analysis: `src-ui/src/lib/alerts.ts` -- current notification pattern (chime + taskbar flash + OS notification)
- libgit2 documentation: `merge_commits()` produces in-memory index, does not touch working directory
- General domain: git merge automation failure modes, notification system design patterns, Zustand reactivity patterns
