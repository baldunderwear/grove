# Feature Research: Session Lifecycle (v2.1)

**Domain:** Desktop git worktree manager with AI session lifecycle
**Researched:** 2026-04-01
**Confidence:** HIGH (existing codebase well-understood, domain patterns validated against real tools)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that complete the session lifecycle. Without these, sessions feel like they end abruptly with no path to completion.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Post-session diff summary | After a session ends (or reaches "waiting"), users need to see what changed. GitButler, GitKraken, and diffity all show change summaries before merge. Without this, users must leave the app to review changes. | MEDIUM | Invoke `git diff --stat` and `git log` against merge target from Rust backend. Display in a summary panel (files changed, insertions, deletions, commit list). Reuse existing `MergePreview` data shape. |
| Post-session commit review | Users expect to see the actual commits before deciding to merge. The existing `MergeDialog` already shows commits in preview mode -- this extends it to be reachable from a completed session. | LOW | Wire existing `fetchPreview` to trigger from session card when session state is idle/waiting. Mostly UI routing, not new backend work. |
| Toast notification system | Every modern desktop app (VS Code, GitKraken, Slack) uses in-app toasts for transient status. Grove currently only has OS-level notifications and audio chimes. Missing in-app feedback for merge results, errors, state changes. | MEDIUM | Use Sonner (shadcn/ui's official toast). Add `<Toaster />` to App root. Replace `sendNotification` calls with in-app toasts for foreground events, keep OS notifications for background. |
| Toast actions (single action button) | Carbon Design System and Sonner both support one action per toast. "Session waiting -- View" or "Merge complete -- Done" are expected patterns. Toasts without actions are informational-only, which misses the opportunity to direct attention. | LOW | Sonner supports `action` prop natively. Pass onClick handler to navigate/focus relevant session. |
| Session-to-merge flow | When a session completes work (idle state, commits ahead), the natural next step is merge. Users expect a direct path: session card -> review -> merge -> cleanup. Worktrunk and agent-worktree both automate this. | MEDIUM | Add "Review & Merge" button to SessionCard when branch is ahead and clean. Opens existing MergeDialog pre-populated. Depends on branch store data being available per-session. |
| Merge result feedback | After merge completes, user needs confirmation beyond the dialog. Current MergeDialog shows summary, but closing it loses the info. Toast + history entry covers this. | LOW | Fire toast on merge complete with build number. Already have `MergeHistory` in merge-store. |

### Differentiators (Competitive Advantage)

Features unique to Grove's AI-worktree-manager niche. No existing tool does these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-branch merge queue | Select multiple completed branches, order them, merge sequentially with auto-bump between each. No existing desktop tool does this -- GitHub/GitLab merge queues are CI-based and remote. Grove's is local, instant, and handles build number collisions automatically. | HIGH | New UI: branch selection (checkboxes on session cards or branch table), drag-to-reorder, queue execution engine. Backend: iterate `merge_branch` calls sequentially, incrementing build number each time. Rollback on failure = `git reset --hard` to pre-queue HEAD. |
| Queue rollback on failure | If branch 3 of 5 fails to merge, roll back all 3 and report which branch caused the failure. This is the safety net that makes batch merging trustworthy. | MEDIUM | Store pre-queue HEAD ref before starting. On any `merge_branch` error, reset to stored ref. Report partial results (which succeeded before failure). |
| Composable merge engine | Break merge into discrete steps (preview -> confirm -> execute -> bump -> changelog -> commit -> cleanup) that can be composed differently for single-merge vs queue-merge vs auto-merge. Current `merge_branch` is monolithic. | HIGH | Refactor Rust `merge_branch` into step functions. Frontend orchestrates steps. Single merge = all steps with UI between each. Queue merge = all steps automated per branch. This is an architecture change, not a feature -- but it enables both single and queue merge to share logic. |
| Post-session workflow wizard | After session ends: diff summary -> optional commit amend -> merge -> worktree cleanup, all in one guided flow. Like agent-worktree's "snap mode" but with a GUI. | MEDIUM | Multi-step dialog/panel. Step 1: diff summary (read-only). Step 2: merge preview (existing). Step 3: execute. Step 4: cleanup prompt (delete worktree? keep branch?). Each step optional/skippable. |
| Worktree cleanup after merge | After successful merge, offer to delete the worktree and branch. GitButler auto-disposes virtual branches after merge. Worktrunk removes worktree and branch in background. Grove should prompt (non-destructive principle). | LOW | `git worktree remove` + `git branch -d` from Rust backend. Already have worktree management commands. Add as final step in post-session flow or as toast action after merge. |
| Kill external launch path | SessionManager becomes the sole way to launch sessions. Removes the old `launchSession` from session-store (which spawns detached processes). All sessions go through terminal-store's embedded PTY. | LOW | Remove `launch_session` Tauri command. Remove `useSessionStore.launchSession`. Update any remaining references. This simplifies the codebase and ensures all sessions are tracked. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-merge on session complete | "Just merge it when Claude is done" | Sessions often end in error or with partial work. Auto-merging without review violates Grove's non-destructive principle. Even GitHub merge queues require explicit enqueue. | Post-session workflow wizard that makes merge fast (2 clicks) but never automatic. |
| Real-time diff streaming during session | "Show me what's changing live" | File system churn during active AI sessions creates noise. Diffs are meaningless mid-session when files are being rewritten. Performance cost of continuous diffing on NAS paths. | Diff summary on state transition (working -> waiting or working -> idle). Snapshot, not stream. |
| Parallel merge queue | "Merge all branches at once" | Build number collisions are the entire reason Grove exists. Parallel merges defeat the purpose. Changelog fragment renames also conflict. | Sequential queue with progress indicator. Fast enough for local merges (sub-second each). |
| Undo merge | "Oops, I merged the wrong branch" | Git merge undo is complex (revert commit vs reset). Supporting arbitrary undo creates false confidence. | Queue rollback (pre-queue snapshot) for batch merges. For single merges, the preview/confirm flow prevents mistakes. |
| Remote push after merge | "Push to origin after merging" | Mixing local and remote operations increases failure modes. Push errors mid-queue would leave inconsistent state. Grove's principle is local-only operations. | Separate "Push" button in branch table (future feature, not part of merge flow). |
| Toast notification flood | "Notify me about everything" | Too many toasts = notification blindness. Users stop reading them. | Toast only on state transitions that require action: session waiting, merge complete, queue failure. Informational events (session started, branch refreshed) stay silent. |

## Feature Dependencies

```
[Toast System]
    (no dependencies, foundation layer)

[Post-Session Diff Summary]
    └──requires──> [existing branch-store data]
    └──enhances──> [Session Card]

[Session-to-Merge Flow]
    └──requires──> [Post-Session Diff Summary]
    └──requires──> [existing MergeDialog]
    └──enhances──> [Toast System] (merge result toasts)

[Composable Merge Engine]
    └──requires──> [refactor of existing merge.rs]

[Multi-Branch Merge Queue]
    └──requires──> [Composable Merge Engine]
    └──requires──> [Toast System] (progress/result toasts)
    └──requires──> [Queue Rollback]

[Post-Session Workflow Wizard]
    └──requires──> [Post-Session Diff Summary]
    └──requires──> [Session-to-Merge Flow]
    └──requires──> [Worktree Cleanup]

[Kill External Launch Path]
    (no dependencies, cleanup task)

[Worktree Cleanup]
    └──requires──> [existing worktree management commands]
```

### Dependency Notes

- **Toast System has no dependencies:** Pure frontend addition. Should be built first as it provides feedback for everything else.
- **Composable Merge Engine requires refactoring merge.rs:** The current `merge_branch` function is a single 150-line function. Breaking it into steps is prerequisite for queue merge. This is the highest-risk change.
- **Multi-Branch Merge Queue requires Composable Merge Engine:** Queue iterates step functions. Without decomposition, queue would duplicate merge logic.
- **Post-Session Workflow Wizard requires most other features:** It is the capstone that ties diff summary, merge flow, and cleanup together. Build last.
- **Kill External Launch Path conflicts with nothing:** Pure removal. Can happen any time but best done early to simplify the codebase for subsequent work.

## Milestone Scope (v2.1)

### Must Ship

- [x] Toast notification system -- Foundation for all user feedback. Currently zero in-app notification mechanism.
- [x] Post-session diff summary -- Completes the "what happened?" question after a session.
- [x] Session-to-merge flow -- Direct path from session card to merge. The core lifecycle gap.
- [x] Composable merge engine -- Architectural prerequisite for queue. Refactor, not new feature.
- [x] Multi-branch merge queue -- The headline feature. Unique to Grove.
- [x] Kill external launch path -- Cleanup. Removes dead code path.

### Should Ship (if time permits)

- [ ] Post-session workflow wizard -- Full guided flow. Enhances UX but individual steps work without it.
- [ ] Worktree cleanup after merge -- Convenience. Users can manually delete worktrees today.
- [ ] Queue rollback on failure -- Safety net for queue. Important for trust but queue can ship with "stop on error" as minimum.

### Defer to v2.2+

- [ ] Branch-level merge policies (auto-merge rules per branch pattern)
- [ ] Merge conflict resolution UI (beyond auto-resolve of build files)
- [ ] Remote push integration

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Toast notification system | HIGH | LOW | P1 | 1 |
| Kill external launch path | MEDIUM | LOW | P1 | 1 |
| Post-session diff summary | HIGH | MEDIUM | P1 | 2 |
| Session-to-merge flow | HIGH | MEDIUM | P1 | 2 |
| Composable merge engine | HIGH (enables queue) | HIGH | P1 | 3 |
| Multi-branch merge queue UI | HIGH | HIGH | P1 | 4 |
| Queue rollback on failure | MEDIUM | MEDIUM | P2 | 4 |
| Worktree cleanup after merge | MEDIUM | LOW | P2 | 5 |
| Post-session workflow wizard | MEDIUM | MEDIUM | P2 | 5 |

**Priority key:**
- P1: Must have for v2.1 launch
- P2: Should have, adds polish and safety

## Competitor/Prior Art Analysis

| Feature | GitButler | GitKraken | Worktrunk (CLI) | agent-worktree (CLI) | Grove v2.1 |
|---------|-----------|-----------|-----------------|---------------------|------------|
| Session lifecycle | N/A (no AI sessions) | N/A | Create -> work -> PR -> cleanup | Create -> work -> merge -> cleanup | Create -> work -> review -> merge -> cleanup (GUI) |
| Post-merge cleanup | Auto-dispose virtual branches | Manual branch delete | Auto-remove worktree + branch | Prompt to merge + cleanup | Guided cleanup wizard |
| Merge queue | N/A | N/A | N/A | N/A | Local sequential queue with build bump |
| In-app notifications | Minimal | Toast-style | CLI output | CLI output | Sonner toasts + OS notifications |
| Build number handling | N/A | N/A | N/A | N/A | Auto-bump + conflict resolution |
| Diff review | Full diff viewer | Full diff viewer | CLI diff | CLI diff | Summary panel (stat + commits) |

**Key insight:** No existing tool combines AI session management with merge automation and build number handling. Grove's multi-branch merge queue with auto-bump is genuinely novel -- it solves a problem that only exists when running many parallel AI sessions on repos with build number protocols.

## Sources

- [Worktrunk - CLI for Git worktree management](https://github.com/max-sixty/worktrunk)
- [agent-worktree - Git worktree workflow for AI agents](https://github.com/nekocode/agent-worktree)
- [GitKraken Desktop Worktrees](https://help.gitkraken.com/gitkraken-desktop/worktrees/)
- [GitButler - Virtual branches and Butler Flow](https://github.com/gitbutlerapp/gitbutler)
- [GitHub Merge Queue docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [Sonner - Toast component for React](https://sonner.emilkowal.ski/)
- [shadcn/ui Sonner integration](https://ui.shadcn.com/docs/components/radix/sonner)
- [Carbon Design System - Notification patterns](https://carbondesignsystem.com/patterns/notification-pattern/)
- [Diffity - GitHub-style diff viewer](https://github.com/kamranahmedse/diffity)
- [React toast libraries comparison (2025)](https://blog.logrocket.com/react-toast-libraries-compared-2025/)

---
*Feature research for: Grove v2.1 Session Lifecycle*
*Researched: 2026-04-01*
