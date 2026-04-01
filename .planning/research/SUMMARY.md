# Project Research Summary

**Project:** Grove v2.1 — Session Lifecycle
**Domain:** Tauri 2 desktop git worktree manager with AI session lifecycle automation
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

Grove v2.1 closes the session lifecycle gap: sessions currently end abruptly with no path to review, merge, or cleanup. The research confirms that no existing tool (GitButler, GitKraken, Worktrunk, agent-worktree) combines AI session management with local merge automation and build number handling — Grove's multi-branch merge queue is genuinely novel. The implementation path is additive (2 new npm packages, 0 new Rust crates) and builds on a codebase that already has 80% of the needed infrastructure in place.

The recommended approach is a strict 4-phase sequence driven by feature dependencies: (1) toast system as foundational layer plus cleanup of the external launch path, (2) post-session diff summary and session-to-merge flow, (3) the composable merge engine refactor and multi-branch queue, (4) post-session workflow wizard and worktree cleanup. The existing `MergeDialog`, `merge_branch` Rust function, and PTY infrastructure are all reusable — the core work is wiring them together via new state (`exited` session state) and a new queue orchestrator in Rust.

The highest-risk area is the merge queue's interaction with build number files. The current `merge_branch()` bumps build numbers on disk before committing to git, creating a window where disk and git tree diverge. In a sequential queue, this causes build number duplication across merges. The queue orchestrator must own build number sequencing entirely, incrementing in-memory rather than re-detecting from disk between steps. This architectural constraint must be addressed in the composable merge engine phase before queue implementation begins.

## Key Findings

### Recommended Stack

The existing stack (Tauri 2, React 19, Zustand, git2 0.20, portable-pty, xterm.js, Tailwind CSS 4, radix-ui 1.4.3) is validated and requires only two frontend additions. No new Rust crates are needed — git2 0.20 already provides `Diff::tree_to_tree()`, `DiffStats`, and `Repository::reset()` for everything the queue needs.

The two additions are purposeful and minimal: Sonner for imperative toast notifications (the only toast library callable from Zustand store actions without React context), and @dnd-kit/react for drag-reorderable merge queue ordering (the only React 19-compatible sortable DnD library after react-beautiful-dnd was archived in 2024). Total frontend bundle addition: ~16 kB gzip. No Rust binary size increase.

**Core technology additions:**
- `sonner ^2.0.7`: Toast notification system — imperative `toast()` API callable outside React component tree; ~4 kB; shadcn/ui's official toast recommendation
- `@dnd-kit/react ^0.3.2`: Drag-and-drop merge queue ordering — React 19-native, accessibility-first; ~12 kB; note 0.x version (API stable but watch for breaking changes)
- `git2 0.20` (existing): `Diff::tree_to_tree()` for diff summaries, `Repository::reset(ResetType::Hard)` for queue rollback — no new crates needed

### Expected Features

Grove v2.1's niche is completing the session lifecycle with a GUI. No existing tool combines AI session management with local merge automation and build number sequencing. The multi-branch merge queue is the headline feature.

**Must have (table stakes):**
- Toast notification system — Grove has zero in-app notification mechanism; users have no feedback for merge results or session state changes
- Post-session diff summary — sessions end with no "what happened?" answer; users must leave the app to review changes
- Session-to-merge flow — direct path from session card to merge; the core lifecycle gap making sessions feel incomplete
- Composable merge engine — architectural prerequisite for the queue; current `merge_branch()` is monolithic and cannot be safely shared across single-merge and queue scenarios
- Multi-branch merge queue — the headline differentiator; no existing desktop tool combines this with local build number handling
- Kill external launch path — removes dead code path, simplifies codebase, ensures all sessions go through the embedded PTY

**Should have (differentiators):**
- Post-session workflow wizard — full guided flow tying diff summary, merge, and cleanup together; the capstone UX
- Worktree cleanup after merge — guided prompt to delete worktree and branch; matches GitButler's auto-dispose behavior
- Queue rollback on failure — safety net for batch merging; the queue is not fully trustworthy without it

**Defer to v2.2+:**
- Branch-level merge policies (auto-merge rules per branch pattern)
- Merge conflict resolution UI beyond auto-resolve of build files
- Remote push integration

**Anti-features to explicitly avoid:**
- Auto-merge on session complete — violates Grove's non-destructive principle; sessions end with partial or error state regularly
- Real-time diff streaming during sessions — noisy and expensive on NAS paths; diffs are meaningless mid-session
- Parallel merge queue execution — defeats the purpose of build number serialization

### Architecture Approach

The v2.1 features integrate cleanly with the existing architecture. The PTY exit signal chain (`TerminalEvent::Exit` -> frontend handler -> tab state) is the hook for post-session workflow. The existing `Mutex<()>` write serialization already handles queue atomicity at the OS level. Toast notifications are purely frontend — no Rust changes needed. The critical architectural decision is moving merge queue execution to Rust (`merge_queue_execute` command) rather than driving it from the frontend, which ensures atomicity and crash-safe rollback.

**Major new components:**
1. `src-tauri/src/git/queue.rs` (NEW) — queue executor: accepts ordered `Vec<String>` of branch names, records snapshot OID, executes sequential merges with in-memory build number tracking, resets to snapshot OID on failure
2. `PostSessionWorkflow.tsx` (NEW) — stepped wizard mounted in SessionManager focus view when tab enters `exited` state; orchestrates diff summary -> merge preview -> execute -> cleanup
3. `MergeQueueDialog.tsx` (NEW) — branch selection with @dnd-kit/react sortable ordering, per-branch preview, queue execution with live progress
4. Toast system (`toast-store.ts` + Sonner `<Toaster />`) — global Zustand store callable from any store action; `<Toaster />` mounted once in `App.tsx`
5. `terminal-store.ts` modification — adds `'exited'` to `SessionState` type; keeps tab alive after PTY exit for post-session workflow; closes tab only when workflow completes

**Key patterns to follow:**
- Stepped wizard with Zustand state machine (not component-local state) — consistent with existing `MergeStep` pattern in merge-store
- Tauri events for broadcast, Channels only for 1:1 PTY I/O — do not mix these
- Server-side atomicity for multi-step operations — merge queue orchestration in Rust, not a JS loop
- `new Map()` on every mutation for Zustand reactivity — terminal-store does this correctly; maintain the pattern in all new stores

### Critical Pitfalls

1. **Build number race condition in multi-branch queue** — `detect_current_build()` reads from the filesystem; sequential merges without a full `checkout_head()` between them diverge disk state from git tree, producing duplicate build numbers across merges. Avoid by calling `detect_current_build()` once before the queue starts and incrementing in-memory between steps; the queue orchestrator owns the sequence entirely.

2. **Mid-queue repository corruption on failure** — `merge_branch()` has no transaction boundary; disk writes (build bump files) accumulate before the merge commit, leaving the repo in a partially-merged state on failure. Avoid by recording `develop`'s HEAD OID before queue execution; on any failure, `git reset --hard` to snapshot OID and report which branches succeeded before failure.

3. **Composable merge steps called out of order** — decomposing `merge_branch()` into individual functions makes implicit step ordering invisible. Model as a pipeline where each step produces a context object consumed by the next; steps validate prerequisites and refuse to run without them. The "composable" part is which steps are included, not their order — order is fixed by the domain.

4. **Post-session workflow triggering on false exit signals** — PTY exits on crash, Ctrl+C, and NAS network blips are indistinguishable from clean exits. Never auto-trigger post-session workflow; always require explicit user action from the `exited` state SessionCard. Non-zero exit codes get a different prompt ("Session crashed — review changes?").

5. **Toast stack overflow during batch merge** — a 5-branch queue fires 15+ toasts in rapid succession, burying actionable error toasts and overflowing the viewport. Design the toast store with priority levels and update-in-place progress toasts from day one; max 3-4 visible simultaneously; error toasts persist until dismissed.

6. **Orphaned session tracking on external path removal** — `session-store.ts` (PID-based) and `terminal-store.ts` (terminal-ID-based) are parallel systems. Removing the external launch path without removing its entire tracking subsystem leaves zombie infrastructure (`get_active_sessions` polling, dead `launch_session` command registration, stale imports). Full codebase audit required before deletion.

## Implications for Roadmap

### Phase 1: Toast System + Kill External Launch Path

**Rationale:** Toast is a zero-dependency foundation that every subsequent feature needs for feedback. Building it first means all later phases get notifications without retrofitting. External launch removal is pure cleanup with no dependencies — done early it reduces cognitive load and codebase complexity for all subsequent phases. Both are low-risk, high-leverage.

**Delivers:** In-app stackable toast notifications (Sonner), codebase cleaned of external launch dead code and orphaned session tracking.

**Addresses:** Toast notification system (table stakes), kill external launch path (table stakes).

**Avoids:** Toast stack overflow (Pitfall #5) — priority levels and batch-aware progress toasts must be designed in from the start, not retrofitted after single-event toasts are shipped. Orphaned session tracking (Pitfall #6) — full audit of `session-store.ts` consumers, `launch_session` Tauri command registrations, and PID-based polling before any deletion.

**Stack additions:** `sonner ^2.0.7`

**Research flag:** Standard patterns. Sonner is well-documented with shadcn/ui examples. External path removal is a codebase audit, not novel engineering.

### Phase 2: Post-Session Diff Summary + Session-to-Merge Flow

**Rationale:** These two features share the same trigger point (new `exited` session state) and the same data (branch-store diff data, existing MergeDialog). Grouping them avoids shipping the `exited` state in two separate phases. Depends on Phase 1 for merge result toasts.

**Delivers:** `exited` session state in terminal-store, `PostSessionWorkflow.tsx` (diff summary + merge preview steps), "Review" button on SessionCard for exited sessions, `delete_worktree` Rust command.

**Addresses:** Post-session diff summary (table stakes), session-to-merge flow (table stakes).

**Avoids:** Premature post-session trigger (Pitfall #4) — workflow is always user-initiated from the `exited` state button, never automatic; non-zero exit codes surface a distinct prompt.

**Architecture changes:** `terminal-store.ts` adds `'exited'` to `SessionState`, one new `delete_worktree` Rust command, `PostSessionWorkflow.tsx`, modifications to `SessionCard.tsx` and `SessionManager.tsx`.

**Research flag:** Standard patterns. The PTY exit hook and existing merge infrastructure are fully understood from codebase analysis.

### Phase 3: Composable Merge Engine + Multi-Branch Queue

**Rationale:** The headline feature and highest-risk phase. The composable merge engine refactor must happen first because the queue is unsafe on top of the current monolithic `merge_branch()`. Pitfalls #1-#3 all require architectural changes that must be in place before queue execution is built. Queue UI follows immediately once the engine is safe.

**Delivers:** Refactored merge pipeline as a state machine with explicit step transitions, `src-tauri/src/git/queue.rs` with atomic rollback, `merge-queue-store.ts`, `MergeQueueDialog.tsx` with drag-reorderable branch ordering and per-branch previews.

**Addresses:** Composable merge engine (P1 architectural prerequisite), multi-branch merge queue (headline differentiator), queue rollback on failure (differentiator).

**Avoids:**
- Mid-queue repo corruption (Pitfall #2) — snapshot OID recorded before queue start; `git reset --hard` on any failure
- Build number race condition (Pitfall #1) — queue orchestrator owns build number sequence in-memory
- Step ordering violations (Pitfall #3) — pipeline state machine with context objects enforces fixed ordering while allowing step inclusion to vary

**Stack additions:** `@dnd-kit/react ^0.3.2`

**Research flag:** This phase warrants deeper research planning. The build number sequencing strategy in the queue orchestrator involves subtle git2 API behavior (disk-vs-tree divergence). Recommend a focused implementation spike on the `merge_queue_execute` Rust command's build number ownership approach before writing queue UI.

### Phase 4: Post-Session Workflow Wizard + Worktree Cleanup

**Rationale:** Capstone features that tie all prior phases together. Both depend on stabilized merge engine (Phase 3) and post-session infrastructure (Phase 2). Low risk — builds on confirmed infrastructure using the established Zustand state machine pattern.

**Delivers:** Full guided post-session wizard (diff summary -> commit -> merge preview -> execute -> cleanup prompt), `git worktree remove` + `git branch -d` as the cleanup step, one cohesive "session done" UX flow.

**Addresses:** Post-session workflow wizard (differentiator), worktree cleanup after merge (differentiator).

**Research flag:** Standard patterns. Zustand stepped wizard mirrors the existing `MergeStep` state machine. Worktree deletion is a straightforward `git worktree remove` wrapper following the same pattern as `create_worktree`.

### Phase Ordering Rationale

- **Toast first** — Phases 2-4 all fire toasts; building the foundation first means other phases get notifications for free without retrofitting call sites
- **External launch removal in Phase 1** (not last) — reduces codebase complexity for all subsequent phases; having dead code around during active development creates confusion
- **Post-session flow before queue** — the `exited` session state established in Phase 2 is the natural UX entry point for queuing multiple completed sessions; these concepts compose cleanly when built in order
- **Composable engine before queue UI** — the queue is unsafe without transactional merge steps; building queue UI before the engine would require a rewrite when the pitfalls manifest
- **Wizard last** — it orchestrates diff summary, merge flow, and worktree cleanup; cannot be built coherently until all three are stable

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Composable Merge Engine + Queue):** The build number sequencing in the queue orchestrator involves subtle git2 API behavior that could produce duplicate build numbers if mishandled. Recommend a focused spike on `merge_queue_execute` before planning detailed Phase 3 tasks. Key questions: (a) pass current build as explicit parameter vs read from HEAD commit tree? (b) when exactly to call `checkout_head()` between sequential merges? (c) how to pause the file watcher during queue execution to prevent cascade refreshes?

Phases with standard patterns (skip research-phase):
- **Phase 1 (Toast + Launch Removal):** Sonner is well-documented. External path removal is codebase audit work.
- **Phase 2 (Post-Session Flow):** PTY exit handling, `exited` state, and `delete_worktree` are fully understood from codebase analysis.
- **Phase 4 (Workflow Wizard):** Established Zustand stepped state machine pattern; worktree deletion mirrors existing worktree creation pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Sonner and @dnd-kit/react verified against official docs and shadcn/ui integration. git2 diff/rollback APIs verified against docs.rs with confirmed API surfaces. No speculative choices. |
| Features | HIGH | Based on direct codebase analysis plus explicit comparison against GitButler, GitKraken, Worktrunk, and agent-worktree. Feature dependencies explicitly mapped and validated. |
| Architecture | HIGH | Based on direct codebase analysis of all relevant source files (merge.rs, build.rs, terminal-store.ts, session-store.ts, SessionManager.tsx, alerts.ts, lib.rs). No speculation. Integration points are verified. |
| Pitfalls | HIGH | Derived from reading actual production code patterns — the build number disk/tree divergence and missing transaction boundary in merge.rs are documented in the source, not theoretical. |

**Overall confidence:** HIGH

### Gaps to Address

- **@dnd-kit/react 0.x API stability:** The `@dnd-kit/react` package is at 0.3.2 (pre-1.0). Core `useSortable` API appears stable, but pin the exact version and verify no breaking changes between 0.3.x releases before Phase 3 planning.
- **Queue build number sequencing — implementation detail:** Research confirms the architectural constraint (queue orchestrator owns the sequence in-memory) but does not prescribe the exact mechanism. Two viable options: (a) pass current build as explicit parameter to `merge_queue_execute`, or (b) read from HEAD commit tree via `repo.find_commit().tree()` rather than from disk. Decide before Phase 3 implementation begins.
- **File watcher suppression during merge:** PITFALLS.md identifies that the file watcher fires on every disk write during merge, potentially cascading branch refreshes mid-execution. The exact suppression mechanism (a boolean flag in managed state, debounce, pause/resume) needs to be decided during Phase 3 planning.

## Sources

### Primary (HIGH confidence)
- Codebase: `src-tauri/src/git/merge.rs` — merge implementation, force-checkout pattern, build bump timing, absence of transaction boundary
- Codebase: `src-tauri/src/git/build.rs` — `detect_current_build()` filesystem-based detection via glob
- Codebase: `src-ui/src/stores/terminal-store.ts` — session state type, Map reactivity pattern
- Codebase: `src-ui/src/stores/merge-store.ts` — MergeStep state machine (pattern to replicate for queue)
- Codebase: `src-ui/src/stores/session-store.ts` — PID-based tracking infrastructure (to be removed)
- Codebase: `src-ui/src/components/session/SessionManager.tsx` — PTY exit handling, tab lifecycle
- Codebase: `src-tauri/src/lib.rs` — managed state, invoke handler registrations, Tauri event listeners
- Codebase: `src-ui/src/lib/alerts.ts` — existing notification pattern (chime + taskbar flash + OS notification)
- [git2 Diff struct](https://docs.rs/git2/latest/git2/struct.Diff.html) — `tree_to_tree()`, `DiffStats`, delta iteration
- [git2 DiffStats struct](https://docs.rs/git2/latest/git2/struct.DiffStats.html) — `files_changed()`, `insertions()`, `deletions()`
- [Sonner GitHub](https://github.com/emilkowalski/sonner) — v2.0.7, imperative API, React 19 compatibility confirmed
- [shadcn/ui Sonner integration](https://ui.shadcn.com/docs/components/radix/sonner) — official mounting and usage pattern

### Secondary (MEDIUM confidence)
- [@dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) — v0.3.2, React 19 compatibility; MEDIUM due to 0.x pre-release version
- [Worktrunk](https://github.com/max-sixty/worktrunk) — CLI worktree workflow comparison; session lifecycle reference
- [agent-worktree](https://github.com/nekocode/agent-worktree) — AI session lifecycle comparison; snap-mode inspiration
- [GitButler](https://github.com/gitbutlerapp/gitbutler) — virtual branch auto-dispose pattern; worktree cleanup reference
- [Carbon Design System notification patterns](https://carbondesignsystem.com/patterns/notification-pattern/) — toast priority design
- [React toast libraries comparison 2025](https://blog.logrocket.com/react-toast-libraries-compared-2025/) — Sonner vs alternatives

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
