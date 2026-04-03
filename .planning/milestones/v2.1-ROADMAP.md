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

- [x] **Phase 14: Toast System + Launch Path Cleanup** *(2026-04-01)*
- [x] **Phase 15: Post-Session Flow** *(2026-04-02)*
- [x] **Phase 16: Composable Merge Engine** *(2026-04-02)*
- [x] **Phase 17: Multi-Branch Merge Queue** (completed 2026-04-03)
- [x] **Phase 18: Post-Session Wizard + Worktree Cleanup** *(2026-04-03)*

## Phase Details

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
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md — Rust backend for worktree and branch cleanup (delete_worktree command)
- [x] 18-02-PLAN.md — PostSessionWizard dialog and all step components (frontend)
- [x] 18-03-PLAN.md — Wire wizard into SessionManager and verify full flow

**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Toast + Launch Cleanup | v2.1 | 2/2 | Complete | 2026-04-01 |
| 15. Post-Session Flow | v2.1 | 2/2 | Complete | 2026-04-02 |
| 16. Composable Merge Engine | v2.1 | 2/2 | Complete | 2026-04-02 |
| 17. Multi-Branch Merge Queue | v2.1 | 3/3 | Complete    | 2026-04-03 |
| 18. Post-Session Wizard + Cleanup | v2.1 | 3/3 | Complete    | 2026-04-03 |
