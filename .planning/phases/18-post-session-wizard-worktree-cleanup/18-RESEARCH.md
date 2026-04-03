# Phase 18: Post-Session Wizard + Worktree Cleanup - Research

**Researched:** 2026-04-03
**Domain:** Multi-step wizard UI (React), git worktree/branch deletion (Rust/CLI), Tauri IPC
**Confidence:** HIGH

## Summary

Phase 18 wraps the existing post-session flow (diff summary, merge) into a 4-step wizard dialog and adds worktree/branch cleanup as the final step. The frontend work is primarily UI composition -- building a stepper component and assembling existing data-fetching and merge logic into a new dialog. The backend work is a single new Tauri command for worktree removal and branch deletion via git CLI.

The codebase already contains every data primitive needed: `get_branch_diff_summary` (Phase 15) returns file stats and commit lists, `useMergeStore` manages merge preview/execute state, and `closeTab` handles tab lifecycle. The new code is a `PostSessionWizard` component that orchestrates these existing pieces through 4 sequential steps, plus a Rust `delete_worktree` command that shells out to `git worktree remove` and `git branch -d`.

**Primary recommendation:** Build the wizard as a single self-contained component with local state for step tracking. Reuse `useMergeStore` for step 3 (merge). Use git CLI (not git2) for worktree removal to match the existing NAS-compatible pattern established in `create_worktree`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Stepper inside a modal dialog with step indicator at top -- consistent with MergeDialog/MergeQueueDialog patterns
- 4 steps: Diff Summary -> Commit Review -> Merge -> Cleanup -- matches POST-03 spec exactly
- Back button on all steps, skip forward not allowed -- merge must happen before cleanup, but user can re-review
- Replace existing "Review & Merge" button action -- opens wizard instead of MergeDialog directly
- Git diff --stat level with file tree -- file list with +/- counts, no line-by-line diff viewer (per Phase 15 decision)
- Scrollable commit list with hash, message, timestamp -- compact table format
- Reuse `get_branch_diff_summary` from Phase 15 -- already returns files changed, insertions, deletions, commits vs merge target
- Cleanup deletes worktree directory + local branch via git2. Remote branch untouched (POST-04 scope).
- Final wizard step shows checkbox toggles: "Delete worktree" (default on) + "Delete branch" (default on), user unchecks to keep
- If merge fails mid-wizard: stop at merge step, show error, offer retry or close. Don't proceed to cleanup step.
- Auto-close the session tab after successful cleanup -- tab has no purpose once worktree is deleted

### Claude's Discretion
- Exact step indicator design (dots, numbered pills, progress bar)
- Animation/transition between wizard steps
- Whether to show a "success" summary before auto-closing

### Deferred Ideas (OUT OF SCOPE)
- Full file-level diff viewer -- future milestone
- Remote branch deletion -- not in POST-04 scope
- Auto-merge on clean exit -- explicitly out of scope (anti-feature per Phase 15 decision)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POST-03 | User is guided through a multi-step wizard: diff summary -> commit review -> merge -> cleanup | Wizard component with local step state, reusing DiffSummaryData + useMergeStore + new delete_worktree command |
| POST-04 | User is prompted to delete worktree and branch after successful merge | CleanupStep with checkbox toggles, new Rust `delete_worktree` Tauri command using git CLI |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Tauri 2 + React 19 + TypeScript + Tailwind CSS + Zustand
- **Backend:** Rust with git2 0.20 crate + git CLI for NAS-compatible operations
- **Frontend patterns:** Zustand stores for all invoke() calls, shadcn/radix-ui components, lucide-react icons
- **Build/check commands:** `cargo tauri dev`, `cd src-ui && npm run typecheck`, `cd src-ui && npm run lint`, `cargo clippy`
- **GSD workflow:** Must use `/gsd:execute-phase` entry point before code changes

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | UI framework | Project standard |
| Zustand | (installed) | State management for merge store | Project pattern for all stores |
| @tauri-apps/api | 2.x | IPC invoke() for backend commands | Project standard |
| shadcn/radix-ui | (installed) | dialog, button, checkbox, scroll-area, separator | All pre-existing |
| lucide-react | (installed) | Icons (Check, Loader2, CheckCircle2, AlertTriangle) | Project standard |
| git2 | 0.20 | Rust git operations (branch deletion) | Backend standard |

### Supporting

No new libraries needed. All dependencies are already installed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Git CLI for worktree removal | git2 Worktree::prune() | git2 worktree operations fail on NAS/UNC paths -- project already uses CLI for create_worktree |
| Local component state for wizard | Zustand store | Wizard state is ephemeral (not shared), local useState is simpler and matches dialog-scoped patterns |

## Architecture Patterns

### Recommended Project Structure

```
src-ui/src/components/
  session/
    PostSessionWizard.tsx     # New: modal dialog + step orchestration
    WizardStepper.tsx         # New: horizontal step indicator
    DiffSummaryStep.tsx       # New: step 1 content (reuses DiffSummaryData)
    CommitReviewStep.tsx      # New: step 2 content (reuses CommitInfo[])
    MergeStep.tsx             # New: step 3 content (reuses useMergeStore)
    CleanupStep.tsx           # New: step 4 content (new delete_worktree invoke)
    PostSessionActions.tsx    # Modified: onMerge opens wizard instead of MergeDialog
    SessionCard.tsx           # Unchanged (already passes onMerge)
  session/SessionManager.tsx  # Modified: render PostSessionWizard instead of MergeDialog for session-originated merges

src-tauri/src/
  commands/git_commands.rs    # Modified: add delete_worktree command
  git/worktree.rs             # New: worktree removal + branch deletion functions
  git/mod.rs                  # Modified: add pub mod worktree
  lib.rs                      # Modified: register delete_worktree command
```

### Pattern 1: Wizard with Local Step State

**What:** The wizard tracks its current step via `useState<number>` inside `PostSessionWizard`. Each step is a child component receiving data via props. The wizard fetches diff data once on open and passes it down.

**When to use:** When dialog state is ephemeral and not needed outside the dialog.

**Example:**
```typescript
// PostSessionWizard.tsx
type WizardStep = 0 | 1 | 2 | 3;

export function PostSessionWizard({ open, onOpenChange, tab, project }: Props) {
  const [step, setStep] = useState<WizardStep>(0);
  const [diffData, setDiffData] = useState<DiffSummaryData | null>(null);
  const [mergeComplete, setMergeComplete] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Fetch diff data on open
  useEffect(() => {
    if (open) {
      invoke<DiffSummaryData>('get_branch_diff_summary', { ... })
        .then(setDiffData);
    }
  }, [open]);

  // Step content rendered conditionally
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>...</DialogHeader>
        <WizardStepper currentStep={step} />
        {step === 0 && <DiffSummaryStep data={diffData} />}
        {step === 1 && <CommitReviewStep commits={diffData?.commits} />}
        {step === 2 && <MergeStep ... onSuccess={() => setMergeComplete(true)} />}
        {step === 3 && <CleanupStep ... />}
        <DialogFooter>...</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Pattern 2: Merge Step Reuses useMergeStore

**What:** Step 3 calls `useMergeStore.fetchPreview()` when entering and `useMergeStore.executeMerge()` on button click. This reuses the exact same merge pipeline as MergeDialog.

**When to use:** When the merge logic (preview, execute, error handling) is already encapsulated in a store.

**Example:**
```typescript
// MergeStep.tsx
export function MergeStep({ project, branchName, onSuccess }: Props) {
  const { preview, step, fetchPreview, executeMerge, error } = useMergeStore();

  useEffect(() => {
    fetchPreview(project.path, branchName, project.merge_target, ...);
  }, []);

  const handleMerge = () => {
    executeMerge(project.path, project.name, branchName, project.merge_target, ...)
      .then(() => onSuccess());
  };
  // ... render based on step state
}
```

### Pattern 3: Git CLI for Worktree Deletion (NAS-compatible)

**What:** Use `git worktree remove` via CLI subprocess instead of git2's `Worktree::prune()`. This matches the existing `create_worktree` pattern which already uses CLI for NAS path compatibility.

**When to use:** Any git operation that touches `.git/worktrees/` metadata on NAS paths.

**Example:**
```rust
// git/worktree.rs
pub fn remove_worktree(project_path: &str, worktree_path: &str) -> Result<(), GitError> {
    let output = std::process::Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["worktree", "remove", "--force", worktree_path])
        .current_dir(project_path)
        .output()
        .map_err(|e| GitError::Other(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::Other(format!("Failed to remove worktree: {}", stderr.trim())));
    }
    Ok(())
}

pub fn delete_local_branch(project_path: &str, branch_name: &str) -> Result<(), GitError> {
    let output = std::process::Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["branch", "-D", branch_name])
        .current_dir(project_path)
        .output()
        .map_err(|e| GitError::Other(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::Other(format!("Failed to delete branch: {}", stderr.trim())));
    }
    Ok(())
}
```

### Pattern 4: IIFE Pattern for Dialog Rendering in SessionManager

**What:** The existing MergeDialog in SessionManager uses an IIFE pattern inside JSX to scope local variables. The wizard should replace this exact block.

**Current code to replace:**
```typescript
// SessionManager.tsx line ~589
{mergeTabId && (() => {
  const mergeTab = tabs.get(mergeTabId);
  const mergeBranchInfo = mergeTab
    ? branches.find((b) => b.worktree_path === mergeTab.worktreePath)
    : null;
  return mergeTab && mergeBranchInfo ? (
    <MergeDialog ... />
  ) : null;
})()}
```

### Anti-Patterns to Avoid

- **Creating a new Zustand store for wizard state:** Wizard state is ephemeral dialog-local state. Don't over-architect with a dedicated store.
- **Using git2 for worktree removal on NAS paths:** git2's worktree operations fail on UNC paths. The project already established the CLI pattern in `create_worktree`.
- **Allowing skip-forward in wizard:** CONTEXT.md locks sequential progression. Merge must happen before cleanup.
- **Auto-triggering the wizard:** POST-06 requires explicit user action. The wizard only opens on "Review & Merge" click.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merge preview/execute | Custom merge logic | `useMergeStore` (existing) | Already handles preview, execute, error, superseded fetch race |
| Diff summary fetching | Custom diff parser | `get_branch_diff_summary` Tauri command (existing) | Returns exact data shape needed |
| Dialog primitives | Custom modal | shadcn `Dialog` (existing) | Accessibility, overlay, escape handling built in |
| Scroll containers | Custom overflow div | shadcn `ScrollArea` (existing) | Consistent styling |
| Tab lifecycle | Custom tab removal | `useTerminalStore.closeTab()` (existing) | Already handles active tab switching |

## Common Pitfalls

### Pitfall 1: useMergeStore Is a Singleton

**What goes wrong:** The wizard's merge step uses `useMergeStore`, but if the user has a MergeDialog open from the BranchTable simultaneously, they would share state.
**Why it happens:** Zustand stores are global singletons.
**How to avoid:** When opening the wizard, call `clearOperation()` first. The wizard replaces MergeDialog for session-originated merges, so there should be no simultaneous usage from sessions. BranchTable still uses MergeDialog independently for non-session merges -- this is fine since users won't merge the same branch from two places simultaneously.
**Warning signs:** Preview data from a different branch appearing in the wizard.

### Pitfall 2: Worktree Removal Requires Checkout Away First

**What goes wrong:** `git worktree remove` fails if the worktree directory has modifications.
**Why it happens:** Git protects against losing uncommitted work.
**How to avoid:** Use `--force` flag with `git worktree remove`. The wizard only reaches cleanup after a successful merge, so all committed changes are already in the target branch. The `--force` flag handles any build artifacts or generated files left in the worktree.
**Warning signs:** "has changes, use --force" error from git.

### Pitfall 3: Branch Deletion After Worktree Removal

**What goes wrong:** Trying to delete a branch that still has a worktree associated fails with "cannot delete branch used by worktree."
**Why it happens:** Git prevents deleting branches that are checked out in any worktree.
**How to avoid:** Always remove the worktree FIRST, then delete the branch. The cleanup step must run these sequentially: worktree removal -> branch deletion.
**Warning signs:** "cannot delete branch" error when branch checkbox is checked.

### Pitfall 4: Tab Auto-Close Race Condition

**What goes wrong:** Closing the dialog and tab simultaneously could cause React state inconsistencies.
**Why it happens:** Dialog close animation + tab removal happening in the same render cycle.
**How to avoid:** Close dialog first, then use `setTimeout` or the dialog's `onAnimationEnd` callback to close the tab after the dialog has fully unmounted. A short delay (200-300ms) is sufficient.
**Warning signs:** React "Cannot update an unmounted component" warnings.

### Pitfall 5: Wizard Step Regression After Merge

**What goes wrong:** User clicks "Back" after successful merge, re-enters merge step, and triggers a duplicate merge.
**Why it happens:** Back button not properly disabled after merge success.
**How to avoid:** Hide the Back button after merge succeeds (step 3 post-success and step 4). The CONTEXT.md specifies: "Back button is hidden after successful merge (cannot undo merge)."
**Warning signs:** Merge executed twice, duplicate build number bump.

### Pitfall 6: Dialog Close During Merge

**What goes wrong:** User closes dialog mid-merge, but merge continues in background.
**Why it happens:** `executeMerge` is async and not cancellable.
**How to avoid:** Disable dialog close (escape, overlay click, X button) while `step === 'executing'` in the merge store. Already implemented in MergeDialog -- reuse the same `onPointerDownOutside` and `onEscapeKeyDown` prevention pattern.
**Warning signs:** Merge completes after dialog is gone, no success/error feedback.

## Code Examples

### Tauri Command: delete_worktree

```rust
// src-tauri/src/commands/git_commands.rs
#[tauri::command]
pub fn delete_worktree(
    project_path: String,
    worktree_path: String,
    branch_name: String,
    delete_worktree: bool,
    delete_branch: bool,
) -> Result<(), GitError> {
    if delete_worktree {
        crate::git::worktree::remove_worktree(&project_path, &worktree_path)?;
    }
    if delete_branch {
        crate::git::worktree::delete_local_branch(&project_path, &branch_name)?;
    }
    Ok(())
}
```

### Wizard Step Navigation (footer buttons)

```typescript
// PostSessionWizard.tsx - footer logic
function getFooterButton(step: number, mergeComplete: boolean) {
  switch (step) {
    case 0: return { label: 'Next', onClick: () => setStep(1) };
    case 1: return { label: 'Next', onClick: () => setStep(2) };
    case 2:
      if (mergeComplete) return { label: 'Next', onClick: () => setStep(3) };
      return { label: 'Merge Branch', onClick: handleMerge };
    case 3:
      if (!deleteWorktree && !deleteBranch) return { label: 'Close', onClick: handleClose };
      return { label: 'Clean Up & Close', onClick: handleCleanup };
  }
}
```

### WizardStepper Component

```typescript
// WizardStepper.tsx
const STEPS = ['Summary', 'Commits', 'Merge', 'Cleanup'] as const;

export function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between w-full">
      {STEPS.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && (
            <div className={`flex-1 h-px mx-2 ${
              i <= currentStep ? 'bg-[var(--grove-leaf)]' : 'border-t border-dashed border-[var(--grove-canopy)]'
            }`} />
          )}
          <div className="flex flex-col items-center gap-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              i < currentStep ? 'bg-[var(--grove-leaf)] text-white' :
              i === currentStep ? 'bg-[var(--grove-leaf)] text-white font-semibold' :
              'border-2 border-[var(--grove-canopy)] text-[var(--grove-stone)]'
            }`}>
              {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`font-mono text-xs ${
              i === currentStep ? 'text-[var(--grove-fog)]' : 'text-[var(--grove-stone)]'
            }`}>
              {label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
```

### Cleanup Step with Checkbox Toggles

```typescript
// CleanupStep.tsx
export function CleanupStep({ worktreePath, branchName, onDeleteWorktreeChange, onDeleteBranchChange }: Props) {
  const [deleteWt, setDeleteWt] = useState(true);
  const [deleteBr, setDeleteBr] = useState(true);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[13px] font-semibold text-[var(--grove-fog)]">Worktree Cleanup</h4>
        <p className="text-sm text-[var(--grove-stone)]">The merge is complete. Choose what to clean up:</p>
      </div>
      <div className="space-y-2">
        <label className="flex items-start gap-2">
          <Checkbox checked={deleteWt} onCheckedChange={(v) => { setDeleteWt(!!v); onDeleteWorktreeChange(!!v); }} />
          <div>
            <span className="text-sm text-[var(--grove-fog)]">Delete worktree directory</span>
            <p className="font-mono text-xs text-[var(--grove-stone)]">{worktreePath}</p>
          </div>
        </label>
        <label className="flex items-start gap-2">
          <Checkbox checked={deleteBr} onCheckedChange={(v) => { setDeleteBr(!!v); onDeleteBranchChange(!!v); }} />
          <div>
            <span className="text-sm text-[var(--grove-fog)]">Delete local branch</span>
            <p className="font-mono text-xs text-[var(--grove-stone)]">{branchName}</p>
          </div>
        </label>
      </div>
      <p className="text-xs italic text-[var(--grove-stone)]">Remote branch will not be affected.</p>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PostSessionActions -> MergeDialog | PostSessionActions -> PostSessionWizard | Phase 18 | Wizard wraps merge in full lifecycle flow |
| No worktree cleanup in app | delete_worktree Tauri command | Phase 18 | Complete lifecycle: launch -> merge -> cleanup |
| Separate diff view + merge dialog | Unified 4-step wizard | Phase 18 | Better user experience, guided flow |

## Open Questions

1. **Branch deletion flag: -d vs -D**
   - What we know: `-d` only deletes fully merged branches; `-D` force-deletes
   - What's unclear: After the wizard's merge step succeeds, the branch should be fully merged. But if the merge was a no-op or partial, `-d` could fail.
   - Recommendation: Use `-D` (force delete). The user explicitly opted in via the checkbox, and the merge just succeeded. If they reach the cleanup step, the branch content is already in the target.

2. **Worktree dirty check before cleanup**
   - What we know: `git worktree remove --force` handles dirty worktrees
   - What's unclear: Should we warn the user if there are uncommitted changes?
   - Recommendation: No extra warning needed. The wizard reaches cleanup only after merge success, meaning all committed work is preserved. Use `--force` to handle generated/build files.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- phase uses only existing project tooling: git CLI, Tauri, React).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust: cargo test (built-in), Frontend: no test framework installed |
| Config file | Cargo.toml for Rust tests, none for frontend |
| Quick run command | `cargo test -p grove --lib` |
| Full suite command | `cargo test -p grove && cd src-ui && npm run typecheck && npm run lint` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POST-03 | Wizard step navigation (4 steps, back/forward) | manual | N/A (React UI, no test framework) | N/A |
| POST-03 | Diff data flows into wizard steps 1 and 2 | manual | N/A (React UI) | N/A |
| POST-03 | Merge step reuses useMergeStore correctly | manual | N/A (React UI) | N/A |
| POST-04 | delete_worktree Rust command removes worktree via CLI | unit | `cargo test -p grove delete_worktree` | No -- Wave 0 |
| POST-04 | delete_worktree Rust command deletes local branch via CLI | unit | `cargo test -p grove delete_branch` | No -- Wave 0 |
| POST-04 | Cleanup checkboxes control which operations run | manual | N/A (React UI) | N/A |

### Sampling Rate

- **Per task commit:** `cd src-ui && npm run typecheck && npm run lint`
- **Per wave merge:** `cargo clippy && cargo test && cd src-ui && npm run typecheck && npm run lint`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src-tauri/src/git/worktree.rs` -- unit tests for remove_worktree and delete_local_branch error handling
- [ ] Frontend test framework not installed -- all UI validation is manual for this phase (consistent with all prior phases)

## Sources

### Primary (HIGH confidence)
- Codebase inspection of `src-tauri/src/commands/session_commands.rs` -- create_worktree uses git CLI pattern
- Codebase inspection of `src-ui/src/stores/merge-store.ts` -- merge state machine and store API
- Codebase inspection of `src-ui/src/components/MergeDialog.tsx` -- existing merge dialog patterns
- Codebase inspection of `src-ui/src/components/session/PostSessionActions.tsx` -- entry point for wizard
- Codebase inspection of `src-tauri/src/git/diff.rs` -- DiffSummaryData structure
- Codebase inspection of `src-ui/src/components/session/SessionManager.tsx` -- IIFE dialog rendering pattern

### Secondary (MEDIUM confidence)
- [git2 Worktree docs](https://docs.rs/git2/0.20.0/git2/struct.Worktree.html) -- confirmed prune() exists but no remove()
- [git-worktree documentation](https://git-scm.com/docs/git-worktree) -- `git worktree remove` CLI reference

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in prior phases
- Architecture: HIGH -- patterns directly observed in existing codebase (MergeDialog, MergeQueueDialog, create_worktree)
- Pitfalls: HIGH -- derived from direct code analysis of worktree operations and merge store singleton behavior

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain -- no external dependencies changing)
