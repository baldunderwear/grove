# Phase 06: Merge Workflow UI - Research

**Researched:** 2026-03-27
**Domain:** React multi-step dialog, Tauri IPC for merge operations, Zustand state management
**Confidence:** HIGH

## Summary

Phase 06 wires the existing Rust merge backend (Phase 03) to a multi-step dialog UI. The backend is fully operational -- `merge_preview` returns read-only preview data (commits, changelog fragments, build numbers, conflict status) and `merge_branch` performs the atomic merge with rollback. The frontend needs a MergeDialog component with four steps (Preview, Confirm, Progress, Summary), a merge store for state management, a merge button in BranchTable rows, and a session-scoped merge history list.

The codebase has strong established patterns: shadcn Dialog primitives (radix-ui), Zustand stores with module-level counters for race protection, `invoke()` for Tauri commands, and the group/opacity hover-reveal pattern for action buttons. The merge dialog follows the same pattern as NewWorktreeDialog (controlled open state, project config passed as props) but with multi-step internal state.

**Primary recommendation:** Build a single MergeDialog component with step-based internal state (not separate dialogs), a dedicated merge-store.ts for merge operation state + history, and a merge button added to BranchTable's action group. Keep all merge state in a Zustand store so Dashboard can trigger branch refresh post-merge.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Merge button visible on merge-ready branches (ahead > 0, not dirty)
- Multi-step dialog flow: Preview -> Confirm -> Progress -> Summary
- Preview shows: commits to merge, changelog fragments found, current/next build number
- Confirmation step with "Merge Branch" primary action
- Build file conflicts auto-resolved (handled by Rust backend)
- Unexpected conflicts shown in the dialog with file paths
- User can abort merge if unexpected conflicts found
- Summary dialog showing: files changed, build number bump, changelog rename
- Merge history log accessible from dashboard (stored in memory per session)

### Claude's Discretion
- Exact dialog component design (stepper vs modal flow)
- Animation/transition between merge steps
- Merge history list placement and design
- Error state presentation

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-04.1 | Preview merge: show commits to merge, changelog fragments, current/next build number | Backend `merge_preview` returns `MergePreview` with all fields. Frontend renders in Preview step. |
| FR-04.2 | Execute merge: merge branch into target, auto-resolve build file conflicts, bump build number | Backend `merge_branch` handles atomically with Mutex lock. Frontend calls via invoke + shows Progress step. |
| FR-04.3 | Handle changelog fragments: rename `worktree-{name}.md` to `{build}.md` | Backend handles in `merge_branch`. Result includes `changelog_renames: Vec<(String, String)>`. Show in Summary. |
| FR-04.4 | Handle legacy numbered changelogs from branches that used old protocol | Backend `find_changelog_fragments` already detects legacy `<digits>.md` files. Preview shows them with `is_legacy: true`. |
| FR-04.5 | Detect unexpected conflicts and surface them to user | Backend returns `GitError::UnexpectedConflict(Vec<String>)` serialized as error string. Preview also has `has_conflicts` boolean. |
| FR-04.6 | Confirmation dialog before executing merge | Locked decision: multi-step flow with explicit Confirm step before execution. |
| FR-04.7 | Post-merge summary: new build number, merged commits count, any warnings | Backend `MergeResult` contains `new_build`, `commits_merged`, `changelog_renames`, `warnings`. Render in Summary step. |
| FR-04.8 | Merge is local only -- never pushes to remote | Backend operates on local repo only. No push commands exist. UI should state "Local merge only" in confirmation. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Project standard |
| radix-ui | 1.4.x | Dialog primitives (shadcn) | Already used for Dialog, DropdownMenu |
| zustand | 5.x | State management | Project standard, all stores follow this |
| @tauri-apps/api | 2.x | Backend IPC via invoke() | Project standard |
| lucide-react | 1.7.x | Icons | Project standard |
| tailwindcss | 4.x | Styling | Project standard |

### Supporting (no new deps needed)
This phase requires zero new npm packages. All UI primitives needed (Dialog, Button, Badge, ScrollArea, Table) are already built as shadcn components.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal step state | Separate route/page per step | Overkill -- dialog with step enum is simpler, matches NewWorktreeDialog pattern |
| New Zustand store | Extending branch-store | Separate store avoids re-renders per Phase 04 decision |

## Architecture Patterns

### Recommended New Files
```
src-ui/src/
  components/
    MergeDialog.tsx           # Multi-step merge dialog (Preview, Confirm, Progress, Summary)
    MergeHistory.tsx          # Session-scoped merge history list
  stores/
    merge-store.ts            # Merge operation state + history
  types/
    merge.ts                  # TypeScript types matching Rust structs
```

### Pattern 1: Multi-Step Dialog with Internal State
**What:** Single Dialog component with a `step` state variable controlling which content renders. Not a stepper/wizard library -- just conditional rendering based on step enum.
**When to use:** When steps are sequential, each depends on the previous, and the dialog should not close between steps.
**Example:**
```typescript
type MergeStep = 'preview' | 'confirm' | 'executing' | 'summary' | 'error';

function MergeDialog({ open, onOpenChange, branch, project }: MergeDialogProps) {
  const [step, setStep] = useState<MergeStep>('preview');
  // ... step-specific content rendering
}
```

### Pattern 2: Controlled Dialog with Callback (established)
**What:** Parent owns `open` state, dialog fires callbacks on completion. Same pattern as NewWorktreeDialog.
**When to use:** Every dialog in this codebase.
**Example:**
```typescript
// In Dashboard.tsx
const [mergeBranch, setMergeBranch] = useState<BranchInfo | null>(null);

<MergeDialog
  open={!!mergeBranch}
  onOpenChange={(open) => { if (!open) setMergeBranch(null); }}
  branch={mergeBranch}
  project={project}
  onComplete={() => {
    setMergeBranch(null);
    fetchBranches(project.path, project.branch_prefix, project.merge_target);
  }}
/>
```

### Pattern 3: Zustand Store for Async Operation State (established)
**What:** Dedicated store for merge operations, keeping merge state separate from branch state (per Phase 04 decision about preventing unnecessary re-renders).
**When to use:** For the merge execution lifecycle and history.
**Example:**
```typescript
interface MergeStoreState {
  // Current operation
  preview: MergePreview | null;
  result: MergeResult | null;
  loading: boolean;
  error: string | null;

  // Session history
  history: MergeHistoryEntry[];

  // Actions
  fetchPreview: (params: MergePreviewParams) => Promise<void>;
  executeMerge: (params: MergeBranchParams) => Promise<void>;
  clearOperation: () => void;
}
```

### Pattern 4: Merge Button in Action Group (established)
**What:** Add merge button to the existing hover-reveal action group in BranchTable, only visible for merge-ready branches (ahead > 0, not dirty).
**When to use:** BranchTable row actions.
**Example:**
```typescript
// In BranchTable action buttons, alongside Play/FolderOpen/Code2
{mergeReady && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onMerge(branch)}
      >
        <GitMerge className="h-3.5 w-3.5 text-emerald-400" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Merge into {mergeTarget}</TooltipContent>
  </Tooltip>
)}
```

### Anti-Patterns to Avoid
- **Separate dialog per step:** Creates jarring open/close transitions. Use single dialog with step state.
- **Merge state in branch-store:** Causes all branch rows to re-render when merge preview loads. Use separate store.
- **Calling invoke() directly in component:** Use merge store actions for consistency and race protection.
- **Closing dialog during execution:** Prevent dialog close while merge is running via `onOpenChange` guard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dialog primitives | Custom modal | shadcn Dialog (radix-ui) | Already in codebase, handles focus trap, escape, overlay |
| Merge logic | Any frontend git operations | Rust backend via invoke() | All merge/build/changelog logic is in Phase 03 backend |
| Conflict resolution UI | Interactive conflict resolver | Show file paths + abort button | CONTEXT.md: no manual conflict resolution needed |
| Progress indication | Real progress tracking | Simple spinner/text state | Merge is fast (local git ops), no websocket progress needed |

**Key insight:** The Rust backend handles ALL merge complexity atomically. The frontend is purely a form over `merge_preview` (read) and `merge_branch` (write) -- no git knowledge needed in TypeScript.

## Common Pitfalls

### Pitfall 1: Dialog Closing During Merge Execution
**What goes wrong:** User clicks overlay or presses Escape while merge is running, leaving state inconsistent.
**Why it happens:** Radix Dialog allows close by default on overlay click and Escape.
**How to avoid:** Guard `onOpenChange` -- only allow close when step is not `executing`. Set `onPointerDownOutside` and `onEscapeKeyDown` to `e.preventDefault()` during execution.
**Warning signs:** Merge completes but summary never shows; branch list not refreshed.

### Pitfall 2: GitError Serialized as String
**What goes wrong:** Trying to parse structured error data from `merge_branch` invoke rejection.
**Why it happens:** `GitError` serializes to a plain string via `Display` (see error.rs). The `UnexpectedConflict` variant becomes `"Merge conflict in non-build files: [\"path1\", \"path2\"]"` -- a string, not structured data.
**How to avoid:** For conflict detection, use `merge_preview`'s `has_conflicts` boolean BEFORE attempting merge. If merge fails, show the raw error string. Consider checking preview conflicts before proceeding to confirm step.
**Warning signs:** Trying to JSON.parse error strings from invoke() rejections.

### Pitfall 3: Stale Branch Data After Merge
**What goes wrong:** Branch table still shows the old ahead/behind counts after a successful merge.
**Why it happens:** Branch data is cached in branch-store, not automatically refreshed.
**How to avoid:** Call `fetchBranches()` (full refresh, not silent) after merge completes, triggered by onComplete callback from MergeDialog.
**Warning signs:** Merged branch still shows "Ready" badge after merge.

### Pitfall 4: Missing Project Config Fields
**What goes wrong:** Calling `merge_preview` or `merge_branch` without build_files or changelog config when project has none configured.
**Why it happens:** `build_files` defaults to `[]` and `changelog` defaults to `null` in ProjectConfig.
**How to avoid:** Pass `project.build_files` and `project.changelog` directly -- Rust backend handles empty/null gracefully. Plain merge (no build bump, no changelog) works fine.
**Warning signs:** TypeScript type errors about possibly-null changelog config.

### Pitfall 5: invoke() Parameter Naming (camelCase)
**What goes wrong:** Tauri invoke() fails silently or throws because parameter names don't match.
**Why it happens:** Rust commands use snake_case, but Tauri's JS bridge expects camelCase parameter names.
**How to avoid:** Use camelCase in invoke calls: `{ projectPath, sourceBranch, mergeTarget, buildPatterns, changelogConfig }`.
**Warning signs:** "missing required argument" errors from invoke().

### Pitfall 6: Merge Lock (Mutex State)
**What goes wrong:** Two merge operations run simultaneously, corrupting repo state.
**Why it happens:** `merge_branch` requires `Mutex<()>` state but this is enforced at the Rust level.
**How to avoid:** The Rust backend already has the Mutex lock. On the frontend, disable the merge button while a merge is in progress (use store's `loading` state). This is defense in depth.
**Warning signs:** Multiple merge dialogs open simultaneously.

## Code Examples

### TypeScript Types (matching Rust structs)
```typescript
// src-ui/src/types/merge.ts

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface ChangelogFragment {
  path: string;
  name: string;
  is_legacy: boolean;
}

export interface MergePreview {
  source_branch: string;
  target_branch: string;
  commits_to_merge: CommitInfo[];
  changelog_fragments: ChangelogFragment[];
  current_build: number | null;
  next_build: number | null;
  can_fast_forward: boolean;
  has_conflicts: boolean;
}

export interface MergeResult {
  success: boolean;
  new_build: number | null;
  commits_merged: number;
  changelog_renames: [string, string][];
  warnings: string[];
}

export interface MergeHistoryEntry {
  source_branch: string;
  target_branch: string;
  result: MergeResult;
  timestamp: number;
}
```

### Invoke Calls (verified from git_commands.rs)
```typescript
// Preview (read-only)
const preview = await invoke<MergePreview>('merge_preview', {
  projectPath: project.path,
  sourceBranch: branch.name,
  mergeTarget: project.merge_target,
  buildPatterns: project.build_files,
  changelogConfig: project.changelog,
});

// Execute merge (write, Mutex-locked on backend)
const result = await invoke<MergeResult>('merge_branch', {
  projectPath: project.path,
  sourceBranch: branch.name,
  mergeTarget: project.merge_target,
  buildPatterns: project.build_files,
  changelogConfig: project.changelog,
});
```

### Dialog Close Guard Pattern
```typescript
// Prevent close during execution
<DialogContent
  onPointerDownOutside={(e) => {
    if (step === 'executing') e.preventDefault();
  }}
  onEscapeKeyDown={(e) => {
    if (step === 'executing') e.preventDefault();
  }}
  showCloseButton={step !== 'executing'}
>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate dialog per step | Single dialog with step state | Current best practice for shadcn | Smoother UX, no flickering |
| Wizard/stepper library | Simple conditional rendering | N/A | No extra dependency for 4 steps |

## Open Questions

1. **Conflict Preview vs Execute Divergence**
   - What we know: `merge_preview` uses `merge_commits()` in-memory to detect conflicts. `merge_branch` does the same check. Between preview and execute, another process could change the repo.
   - What's unclear: How likely is this race in practice? (Very unlikely for single-user desktop app)
   - Recommendation: Accept the race condition. If merge fails with unexpected conflict after preview showed none, show the error string. Not worth adding re-validation.

2. **Merge History Persistence**
   - What we know: CONTEXT.md says "stored in memory per session"
   - What's unclear: How many entries to keep? When to clear?
   - Recommendation: Keep last 50 entries in Zustand store, cleared on app restart (session-scoped per CONTEXT.md). No persistence to disk.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (frontend), cargo test (Rust backend) |
| Config file | None for frontend tests |
| Quick run command | `cd src-tauri && cargo test` |
| Full suite command | `cd src-ui && npm run typecheck && cd ../src-tauri && cargo test && cargo clippy` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-04.1 | Preview shows commits, changelog, build number | manual | Visual inspection in dev mode | N/A |
| FR-04.2 | Execute merge atomically | unit (Rust) | `cargo test` (merge.rs tests exist) | Partial (backend only) |
| FR-04.3 | Changelog fragment rename | unit (Rust) | `cargo test` (changelog.rs tests) | Partial (backend only) |
| FR-04.4 | Legacy numbered changelog handling | unit (Rust) | `cargo test` (changelog.rs tests) | Yes |
| FR-04.5 | Unexpected conflicts surfaced | manual | Visual inspection -- trigger conflict scenario | N/A |
| FR-04.6 | Confirmation dialog before merge | manual | Visual inspection | N/A |
| FR-04.7 | Post-merge summary | manual | Visual inspection after merge | N/A |
| FR-04.8 | Local only, no push | code review | Verify no push invoke exists in merge-store | N/A |

### Sampling Rate
- **Per task commit:** `cd src-ui && npm run typecheck`
- **Per wave merge:** `cd src-ui && npm run typecheck && cd ../src-tauri && cargo test && cargo clippy`
- **Phase gate:** Full suite + manual merge of a test branch from UI

### Wave 0 Gaps
- No frontend test infrastructure (no vitest/jest). This is acceptable per project convention -- frontend validation is via typecheck + manual testing.
- Backend merge tests already exist in merge.rs, build.rs, changelog.rs.

## Project Constraints (from CLAUDE.md)

- **Stack:** Tauri 2 + React 19 + TypeScript + Tailwind CSS
- **State management:** Zustand
- **UI primitives:** shadcn (radix-ui based, manually created due to NAS npx incompatibility)
- **Backend communication:** `invoke()` from `@tauri-apps/api/core`
- **Naming:** Snake_case TypeScript types to match Rust serde (no runtime mapping)
- **Accent color:** emerald-500 for primary actions
- **GSD enforcement:** Changes must go through GSD workflow commands
- **Commands:** `cargo tauri dev` for development, `npm run typecheck` for type checking

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src-tauri/src/git/merge.rs` -- MergePreview, MergeResult, ConflictInfo structs and merge_preview/merge_branch functions
- Direct code inspection of `src-tauri/src/commands/git_commands.rs` -- Tauri command signatures with exact parameter names
- Direct code inspection of `src-tauri/src/git/error.rs` -- GitError variants and string serialization
- Direct code inspection of `src-ui/src/components/NewWorktreeDialog.tsx` -- established dialog pattern
- Direct code inspection of `src-ui/src/components/BranchTable.tsx` -- merge-ready logic and action button pattern
- Direct code inspection of `src-ui/src/stores/branch-store.ts` -- Zustand store pattern with fetchCounter
- Direct code inspection of `src-ui/src/stores/config-store.ts` -- project config shape with build_files and changelog
- Direct code inspection of `src-ui/src/pages/Dashboard.tsx` -- component composition and refresh patterns
- Direct code inspection of `src-ui/src/components/ui/dialog.tsx` -- shadcn Dialog with showCloseButton support

### Secondary (MEDIUM confidence)
- Radix UI Dialog API (onPointerDownOutside, onEscapeKeyDown) -- from radix-ui docs, verified by dialog.tsx usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, no new deps needed
- Architecture: HIGH - Follows established patterns visible in codebase (NewWorktreeDialog, BranchTable, stores)
- Pitfalls: HIGH - Derived from direct code inspection of error handling, Mutex patterns, and invoke() conventions

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- no external dependencies changing)
