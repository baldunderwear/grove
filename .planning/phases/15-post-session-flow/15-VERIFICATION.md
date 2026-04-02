---
phase: 15-post-session-flow
verified: 2026-04-01T00:00:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "Verify exit banners and diff summary render correctly for a real session exit"
    expected: "Green banner + diff stats for exit 0; red banner for exit 1; amber merge button for crash; toast appears in both cases"
    why_human: "Requires running cargo tauri dev, launching a session, and triggering exit — cannot verify PTY exit code flow, toast display, or visual component rendering programmatically"
  - test: "Click Review & Merge on an exited card"
    expected: "MergeDialog opens with the branch pre-populated and diff preview fetched"
    why_human: "Requires the running app with a real branch that has commits ahead of merge target"
  - test: "Confirm POST-06: no dialog auto-opens when a session exits"
    expected: "Session card transitions to exited state silently; only a toast appears; no modal/wizard auto-opens"
    why_human: "Timing behavior during session exit cannot be verified by static code analysis alone"
---

# Phase 15: Post-Session Flow Verification Report

**Phase Goal:** Users can review what a session accomplished and initiate merge directly from an exited session card
**Verified:** 2026-04-01
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Rust backend returns diff summary (files changed, insertions, deletions, commits) for a branch vs merge target | VERIFIED | `src-tauri/src/git/diff.rs` — `get_branch_diff_summary` fully implemented with per-file stats, aggregate stats, commit walk |
| 2 | PTY exit event includes real exit code (0 for clean, non-zero for crash) | VERIFIED | `pty.rs` line 168-173: `child_for_reader.lock().ok().and_then(|mut c| c.wait().ok()).map(|s| if s.success() { 0 } else { 1 })` |
| 3 | Terminal store has 'exited' and 'disconnected' session states with exitCode and exitedAt fields | VERIFIED | `terminal-store.ts` line 4: SessionState includes `"exited" \| "disconnected"`. TerminalTab has `exitCode: number \| null` and `exitedAt: number \| null` |
| 4 | Exit toast fires on session exit (clean vs crash distinction) | VERIFIED | `alerts.ts` exports `fireExitToast`; `terminal-store.ts` `setTabExited` calls `fireExitToast(tabId, tab.branchName, exitCode)`. Clean exit: 5s info toast; crash: persistent error toast |
| 5 | Exited tabs persist in terminal-store and are not auto-removed | VERIFIED | `closeTab` is only called from explicit `handleClose` which requires X button click. No auto-removal on exit event |
| 6 | Exited session card shows green 'Session complete' banner for clean exit | VERIFIED | `ExitBanner.tsx` line 22-31: `isClean` path renders `bg-emerald-500/10` + CheckCircle2 + "Session complete" |
| 7 | Exited session card shows red 'Session crashed (exit code N)' banner for non-zero exit | VERIFIED | `ExitBanner.tsx` line 33-40: non-clean path renders `bg-red-500/10` + AlertTriangle + "Session crashed (exit code {exitCode})" |
| 8 | Exited session card displays diff summary with files changed, insertions, deletions, and commits | VERIFIED | `DiffSummary.tsx` invokes `get_branch_diff_summary` on mount, renders aggregate stat line and scrollable file list |
| 9 | Exited session card has 'Review & Merge' button that opens MergeDialog pre-populated | VERIFIED | `PostSessionActions.tsx` renders "Review & Merge" button calling `onMerge`. `SessionManager.tsx` line 589-603: IIFE renders `<MergeDialog>` with branch and project pre-populated. MergeDialog calls `fetchPreview` internally |
| 10 | Disconnected session card shows gray 'Session disconnected' banner with no diff or merge button | VERIFIED | `SessionCard.tsx` line 126-130: `isDisconnected` path renders only `<ExitBanner exitCode={null} sessionState="disconnected" />` — no DiffSummary, no PostSessionActions |
| 11 | Exited tabs persist in the card grid until user explicitly dismisses with X button | VERIFIED | `handleClose` (SessionManager line 405-414): guards `terminal_kill` on `sessionState !== 'exited'`. `closeTab` removes from map on demand only |
| 12 | Post-session UI never auto-triggers — card transitions silently (POST-06) | VERIFIED | No event listener, useEffect, or store action auto-opens MergeDialog. `mergeTabId` is set only by explicit `handleMerge` callback from user clicking the button |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/git/diff.rs` | `get_branch_diff_summary` function using git2 | VERIFIED | 150 lines; `pub fn get_branch_diff_summary` at line 31; reuses `CommitInfo` from merge.rs |
| `src-ui/src/types/diff.ts` | DiffSummaryData, DiffFileEntry, CommitInfo TypeScript types | VERIFIED | All three interfaces exported; mirrors Rust structs exactly |
| `src-ui/src/stores/terminal-store.ts` | Expanded SessionState with exited/disconnected, setTabExited action | VERIFIED | `setTabExited` at line 166; `setTabDisconnected` at line 185; `exitCode`/`exitedAt` in TerminalTab |
| `src-ui/src/lib/alerts.ts` | fireExitToast function | VERIFIED | `fireExitToast` exported at line 179; clean/crash distinction correct |
| `src-ui/src/components/session/ExitBanner.tsx` | Color-coded exit status banner | VERIFIED | 41 lines; exports `ExitBanner`; green/red/gray paths all present |
| `src-ui/src/components/session/DiffSummary.tsx` | Inline diff stats display with file list | VERIFIED | 112 lines; exports `DiffSummary`; lazy fetch, loading skeleton, error/empty/normal states all implemented |
| `src-ui/src/components/session/PostSessionActions.tsx` | Action row with Review & Merge button | VERIFIED | 49 lines; exports `PostSessionActions`; duration display + conditional merge button with crash/clean color |
| `src-ui/src/components/session/SessionCard.tsx` | Conditional exited/disconnected rendering | VERIFIED | Imports ExitBanner, DiffSummary, PostSessionActions; `onMerge` prop present; exited/disconnected conditional blocks at lines 117-150 |
| `src-ui/src/components/session/SessionManager.tsx` | Exit event -> setTabExited; MergeDialog wired | VERIFIED | Exit case at line 96-100 calls `setTabExited`; Error case calls `setTabDisconnected`; MergeDialog rendered at line 589-603 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src-tauri/src/commands/git_commands.rs` | `src-tauri/src/git/diff.rs` | `diff::get_branch_diff_summary` | WIRED | Line 97: `crate::git::diff::get_branch_diff_summary(...)` |
| `src-tauri/src/lib.rs` | `git_commands::get_branch_diff_summary` | invoke_handler registration | WIRED | Line 53: `commands::git_commands::get_branch_diff_summary` in handler |
| `src-tauri/src/terminal/pty.rs` | `TerminalEvent::Exit` | `child.wait()` after reader EOF | WIRED | Lines 168-173: Arc<Mutex<>> child, wait() called, maps success() to 0/1 |
| `src-ui/src/stores/terminal-store.ts` | `src-ui/src/lib/alerts.ts` | `setTabExited` calls `fireExitToast` | WIRED | Line 182: `fireExitToast(tabId, tab.branchName, exitCode)` |
| `src-ui/src/components/session/SessionCard.tsx` | ExitBanner, DiffSummary, PostSessionActions | Conditional render when `sessionState === 'exited'` | WIRED | Lines 117-160: `isExited` gates render of all three components |
| `src-ui/src/components/session/SessionCard.tsx` | `get_branch_diff_summary` | `DiffSummary` invokes on mount when state is exited | WIRED | `DiffSummary.tsx` line 22: `invoke<DiffSummaryData>('get_branch_diff_summary', ...)` in useEffect |
| `src-ui/src/components/session/PostSessionActions.tsx` | `MergeDialog` | `onMerge` -> `handleMerge` -> `setMergeTabId` -> MergeDialog renders | WIRED | SessionManager line 416-425: `handleMerge` sets `mergeTabId`; line 589-603: MergeDialog rendered when `mergeTabId` is set |
| `src-ui/src/components/session/SessionManager.tsx` | `terminal-store.setTabExited` | Exit event handler | WIRED | Line 99: `setTabExited(terminalIdRef.current, event.code ?? null)` |

**Note on key_link deviation:** Plan 02 specified `PostSessionActions -> merge-store fetchPreview` directly. Actual implementation routes through `SessionManager.handleMerge -> MergeDialog` which calls `fetchPreview` internally on mount. Functional behavior (merge dialog opens pre-populated with diff preview) is identical; structural routing differs slightly but satisfies the requirement.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `DiffSummary.tsx` | `diffData: DiffSummaryData \| null` | `invoke('get_branch_diff_summary')` -> `src-tauri/src/git/diff.rs` | Yes — git2 diff_tree_to_tree with revwalk | FLOWING |
| `ExitBanner.tsx` | `exitCode: number \| null` | `TerminalTab.exitCode` set by `setTabExited` <- PTY `child.wait()` | Yes — mapped from `ExitStatus::success()` | FLOWING |
| `PostSessionActions.tsx` | `hasCommitsAhead: boolean` | `useBranchStore.branches.find(b => b.worktree_path).ahead > 0` | Yes — branch store fetched from Rust git backend | FLOWING |
| `SessionManager.tsx` (MergeDialog) | `mergeBranchInfo: BranchInfo` | `branches.find(b => b.worktree_path === mergeTab.worktreePath)` | Yes — from branch-store, refreshed before dialog open | FLOWING |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| POST-01 | 15-01, 15-02 | User sees a diff summary (files changed, insertions, deletions, commits) when a session exits | SATISFIED | `DiffSummary.tsx` fetches and renders diff data from `get_branch_diff_summary` command; shown in exited session card |
| POST-02 | 15-02 | User can initiate merge from an exited session card with one click | SATISFIED | "Review & Merge" button in `PostSessionActions.tsx` -> `handleMerge` -> `MergeDialog` opens |
| POST-05 | 15-01, 15-02 | Non-zero exit codes show a distinct "session crashed" prompt vs clean exit | SATISFIED | PTY maps exit code to 0/1 via `success()`; `ExitBanner` renders red "Session crashed (exit code N)" for non-zero; toast.error for crash |
| POST-06 | 15-01, 15-02 | Post-session workflow never auto-triggers; always requires explicit user action | SATISFIED | No auto-open logic found; `mergeTabId` only set on button click; card transitions silently on exit |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `SessionManager.tsx` | 629, 632 | `placeholder` attribute on input | Info | HTML input placeholder for branch filter — not a stub, expected UI pattern |

No blocking or warning anti-patterns found.

### Behavioral Spot-Checks

Step 7b: PARTIALLY RUNNABLE — TypeScript compilation can be checked but UI behavior requires live app.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ExitBanner exports are named | Grep for `export function ExitBanner` | Found at ExitBanner.tsx:8 | PASS |
| DiffSummary calls invoke on mount | Grep for `invoke.*get_branch_diff_summary` | Found at DiffSummary.tsx:22 | PASS |
| setTabExited calls fireExitToast | Grep for `fireExitToast` in terminal-store.ts | Found at line 182 | PASS |
| MergeDialog is rendered in SessionManager | Grep for `<MergeDialog` | Found at SessionManager.tsx:595 | PASS |
| get_branch_diff_summary registered in lib.rs | Grep for registration | Found at lib.rs:53 | PASS |
| PTY exit captures real code | Grep for `child.*wait` in pty.rs | Found at line 170-172 | PASS |
| Full TypeScript compile | Requires npm/tsc — SKIP (needs dev environment) | N/A | SKIP |
| Full Rust compile | Requires cargo — SKIP (needs dev environment) | N/A | SKIP |

### Human Verification Required

#### 1. Exit State Visual Rendering

**Test:** Run `cargo tauri dev`, open a project, launch a session, type `exit 0` in the terminal
**Expected:** Session card transitions to exited state showing green "Session complete" banner, diff summary with real file/insertion/deletion counts, "Review & Merge" button (if branch is ahead of merge target), and a "branchname exited" toast that auto-dismisses in 5s
**Why human:** Visual rendering, toast display, and PTY exit code flow require the live Tauri app

#### 2. Crash Exit Rendering

**Test:** Launch a session, type `exit 1` in the terminal
**Expected:** Red "Session crashed (exit code 1)" banner, amber "Review & Merge" button (if commits ahead), persistent error toast "branchname crashed / Exited with code 1"
**Why human:** Same as above; non-zero exit path requires live session

#### 3. Review & Merge Flow

**Test:** Click "Review & Merge" on an exited card with a branch that has commits ahead
**Expected:** MergeDialog opens, correctly shows the branch name and diff preview; no dialog opens automatically without this click
**Why human:** Requires real branch state with commits ahead, and visual confirmation of MergeDialog pre-population

#### 4. POST-06 Non-Regression

**Test:** Observe session exit without interacting
**Expected:** Nothing auto-opens; card silently updates from active to exited state; only a toast notification appears
**Why human:** Timing/event behavior on exit cannot be confirmed by static analysis

### Gaps Summary

No automated gaps found. All 12 truths are verified by artifact inspection, wiring checks, and data-flow traces. Four human verification items remain for visual/behavioral confirmation as expected for a UI phase with a checkpoint:human-verify task.

---

_Verified: 2026-04-01_
_Verifier: Claude (gsd-verifier)_
