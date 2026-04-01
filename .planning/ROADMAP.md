# Roadmap: Grove

## Milestones

- v1.0 Worktree Manager (Phases 01-08) - SHIPPED 2026-03-28
- v1.1 Brand & Polish (shipped 2026-03-29)
- v2.0 Mission Control (Phases 09-13) - SHIPPED 2026-03-29
- v2.1 Session Lifecycle (Phases 14-18) - IN PROGRESS

## Phases

<details>
<summary>v1.0 Worktree Manager (Phases 01-08) - SHIPPED 2026-03-28</summary>

8 phases, 22 plans, 6,535 LOC. Full archive: milestones/v1.0-ROADMAP.md

</details>

<details>
<summary>v2.0 Mission Control (Phases 09-13) - SHIPPED 2026-03-29</summary>

5 phases, 16 plans. Full archive: milestones/v2.0-ROADMAP.md

</details>

### v2.1 Session Lifecycle (In Progress)

**Milestone Goal:** Complete the session lifecycle -- from launch through merge and cleanup -- with a composable merge engine, multi-branch queue, and in-app toast notifications.

- [x] **Phase 14: Toast System + Launch Path Cleanup** - In-app toast notifications and removal of external launch infrastructure *(2026-04-01)*
- [ ] **Phase 15: Post-Session Flow** - Diff summary and session-to-merge bridge for exited sessions
- [ ] **Phase 16: Composable Merge Engine** - Decompose monolithic merge into a composable step pipeline
- [ ] **Phase 17: Multi-Branch Merge Queue** - Select, order, and sequentially merge multiple branches with rollback safety
- [ ] **Phase 18: Post-Session Wizard + Worktree Cleanup** - Guided multi-step workflow tying diff, merge, and cleanup together

## Phase Details

### Phase 14: Toast System + Launch Path Cleanup
**Goal**: Users receive immediate in-app feedback for all system events, and all sessions launch exclusively through the embedded terminal
**Depends on**: Phase 13 (v2.0 complete)
**Requirements**: TOAST-01, TOAST-02, TOAST-03, TOAST-04, LPATH-01, LPATH-02, LPATH-03
**Plans**: 2/2 complete
**Status**: Complete (2026-04-01)

### Phase 15: Post-Session Flow
**Goal**: Users can review what a session accomplished and initiate merge directly from an exited session card
**Depends on**: Phase 14
**Requirements**: POST-01, POST-02, POST-05, POST-06
**Success Criteria** (what must be TRUE):
  1. When a session exits cleanly, the user sees a diff summary showing files changed, insertions, deletions, and commits made
  2. User can click a single button on an exited session card to open the merge dialog for that branch
  3. Non-zero exit codes display a distinct "session crashed" prompt that differs visually from a clean exit
  4. Post-session workflow never triggers automatically -- the user must explicitly click to review or merge
**Plans**: 2 plans
Plans:
- [ ] 15-01-PLAN.md -- Backend diff summary command, exit code capture, store expansion, exit toasts
- [ ] 15-02-PLAN.md -- UI components (ExitBanner, DiffSummary, PostSessionActions) and SessionCard/SessionManager wiring
**UI hint**: yes

### Phase 16: Composable Merge Engine
**Goal**: The merge pipeline is decomposed into discrete, composable steps that can be assembled for both single-branch and multi-branch scenarios
**Depends on**: Phase 15
**Requirements**: MERGE-01
**Success Criteria** (what must be TRUE):
  1. Single-branch merge still works identically from the user's perspective (no regression)
  2. Merge pipeline internals are composed of distinct steps (preview, execute, bump, changelog, commit) that can be orchestrated independently
  3. Each step validates its prerequisites before running and refuses to execute out of order
**Plans**: TBD

### Phase 17: Multi-Branch Merge Queue
**Goal**: Users can batch-merge multiple branches sequentially with automatic build number handling and safety rollback
**Depends on**: Phase 16
**Requirements**: MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06, MERGE-07, TOAST-05
**Success Criteria** (what must be TRUE):
  1. User can select multiple branches and start a sequential merge queue with one action
  2. User can drag-reorder branches in the queue before execution begins
  3. User sees per-branch progress during queue execution, with the merge queue toast updating in-place rather than spawning new toasts
  4. If any branch fails to merge, all completed merges in the queue roll back to the pre-queue state automatically
  5. Build numbers increment correctly across all branches in the queue without disk-read race conditions
**Plans**: TBD
**UI hint**: yes

### Phase 18: Post-Session Wizard + Worktree Cleanup
**Goal**: Users are guided through a complete post-session workflow from diff review through merge to worktree cleanup
**Depends on**: Phase 16, Phase 15
**Requirements**: POST-03, POST-04
**Success Criteria** (what must be TRUE):
  1. User can step through a multi-step wizard (diff summary -> commit review -> merge -> cleanup) after a session exits
  2. After a successful merge, the user is prompted to delete the worktree and branch, and can accept or decline
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 14 -> 15 -> 16 -> 17 -> 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Toast + Launch Cleanup | v2.1 | 2/2 | Complete | 2026-04-01 |
| 15. Post-Session Flow | v2.1 | 0/2 | Not started | - |
| 16. Composable Merge Engine | v2.1 | 0/? | Not started | - |
| 17. Multi-Branch Merge Queue | v2.1 | 0/? | Not started | - |
| 18. Post-Session Wizard + Cleanup | v2.1 | 0/? | Not started | - |
