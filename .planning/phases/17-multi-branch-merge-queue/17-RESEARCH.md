# Phase 17: Multi-Branch Merge Queue - Research

**Researched:** 2026-04-02
**Domain:** Queue orchestration (Rust/git2), drag-and-drop UI (@dnd-kit/react), Tauri event streaming, file watcher suppression
**Confidence:** HIGH

## Summary

Phase 17 composes on Phase 16's pipeline to build a multi-branch merge queue. The Rust side needs a new `queue.rs` module that accepts an ordered branch list, records a HEAD OID snapshot, runs each branch through the pipeline with in-memory build number sequencing, and rolls back via `git reset --hard` on any failure. Progress events stream from Rust to the frontend via Tauri's `app.emit()` broadcast pattern (already used for `git-changed` and `session-state-changed`). The frontend adds `@dnd-kit/react` ^0.3.2 for drag-reorder in the queue dialog, a new `merge-queue-store.ts` Zustand store, and in-place toast updates using Sonner's stable toast ID pattern.

The highest-risk areas are: (1) build number sequencing -- `detect_current_build()` reads from disk and will see stale values between sequential merges unless the queue orchestrator owns the sequence via `override_build`, (2) file watcher suppression -- merges write to disk and trigger `git-changed` events that cascade branch refreshes, and (3) the `@dnd-kit/react` 0.x API which has limited official documentation and some reported issues.

**Primary recommendation:** Build queue.rs first with unit-testable structure (snapshot/restore, build number tracking), then wire Tauri command + events, then build frontend dialog with @dnd-kit/react sortable and merge-queue-store.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dedicated MergeQueueDialog (modal) with branch list, drag reorder, execute button
- Branch selection via checkboxes on branch table rows + "Merge Selected" button
- @dnd-kit/react for drag-to-reorder (React 19 compatible, ~12kB)
- Progress shown in both: in-place toast updates AND dialog progress bar
- Queue orchestration in Rust: `merge_queue_execute` Tauri command -- frontend sends ordered branch list, Rust handles everything
- Rollback: record HEAD OID before queue start, `git reset --hard` to snapshot on any failure
- Build numbers: detect once before queue, increment in-memory per branch using `override_build` from Phase 16 pipeline
- File watcher suppression via boolean flag in Tauri managed state -- watcher checks flag, skips refresh while true
- Single persistent progress toast, updated in-place via toast ID: "Merging 2/5: branch-name"
- Success: summary toast "Queue complete: 5/5 merged"
- Failure: persistent error toast "Queue failed on branch-name (3/5). Rolled back."

### Claude's Discretion
- MergeQueueDialog layout details (spacing, sections) -- UI-SPEC provides full design contract
- Exact Tauri event names for progress streaming
- merge-queue-store.ts vs extending merge-store.ts -- recommendation: NEW separate store
- @dnd-kit/react exact API usage for sortable list

### Deferred Ideas (OUT OF SCOPE)
- Branch-level merge policies (auto-merge rules per branch pattern) -- v2.2+
- Merge conflict resolution UI beyond auto-resolve -- v2.2+
- Parallel merge queue execution -- explicitly anti-feature (defeats build number serialization)
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-02 | User can select multiple branches and merge them sequentially with auto-build-bump between each | queue.rs with pipeline composition, override_build for in-memory sequencing |
| MERGE-03 | User can drag-reorder branches in the merge queue before execution | @dnd-kit/react useSortable + DragDropProvider with isSortable pattern |
| MERGE-04 | If any branch fails to merge, all completed merges in the queue roll back to pre-queue state | Snapshot HEAD OID before queue start, git2 Repository::reset(Hard) on failure |
| MERGE-05 | Build numbers are sequenced in-memory by the queue orchestrator (no disk-read between merges) | detect_current_build() once, pass override_build = current + N to each MergeContext |
| MERGE-06 | File watcher is suppressed during queue execution to prevent cascade refreshes | AtomicBool in Tauri managed state; watcher process_events checks flag |
| MERGE-07 | User sees per-branch progress during queue execution | Tauri app.emit("merge-queue-progress") with serializable payload from queue.rs |
| TOAST-05 | Merge queue progress updates existing toast in-place rather than spawning new ones | Sonner toast.loading() with stable id: 'merge-queue', update via same ID |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 | 0.20 (existing) | Repository::reset(Hard) for rollback, pipeline steps | Already in Cargo.toml; provides all needed git operations |
| @dnd-kit/react | 0.3.2 | Drag-reorder queue items | Only React 19-compatible DnD library; selected in CONTEXT.md |
| sonner | ^2.0.7 (existing) | In-place toast updates with stable ID | Already installed; toast.loading() + ID for TOAST-05 |
| zustand | ^5.0.0 (existing) | merge-queue-store.ts state management | Project standard for all stores |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/helpers | (peer of @dnd-kit/react) | `move` utility for array reordering | Used in DragDropProvider onDragEnd handler |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/react | @dnd-kit/sortable (v10+) | Older stable API but NOT React 19 native; @dnd-kit/react is the React 19 rewrite |
| Separate merge-queue-store | Extending merge-store.ts | Merge-store handles single-branch preview/execute; queue has different lifecycle (ordered list, per-branch status tracking, rollback state). Separate store avoids coupling. |

**Installation:**
```bash
cd src-ui && npm install @dnd-kit/react@0.3.2
```

Note: `@dnd-kit/helpers` is a peer dependency that should install automatically. Verify after install.

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/git/
  queue.rs           # NEW: QueueState, merge_queue_execute(), snapshot/restore
  pipeline.rs        # EXISTING: MergeContext, step functions (Phase 16)
  merge.rs           # EXISTING: merge_branch() thin wrapper, merge_preview()

src-ui/src/
  stores/
    merge-queue-store.ts    # NEW: queue state, branch order, execution progress
  components/
    MergeQueueDialog.tsx    # NEW: modal dialog with sortable list + progress
    SortableQueueList.tsx   # NEW: @dnd-kit/react sortable wrapper (optional - can be inline)
    QueueItem.tsx           # NEW: single branch row in queue
    QueueProgress.tsx       # NEW: progress bar + status text
  lib/
    alerts.ts               # MODIFIED: add fireMergeQueueToast(), updateMergeQueueToast()
```

### Pattern 1: Queue Orchestrator in Rust (queue.rs)

**What:** Single Tauri command that receives the full ordered branch list and executes everything server-side. The frontend only sends the initial request and listens for progress events.

**When to use:** Always -- this is a locked decision. Queue execution must be atomic with crash-safe rollback.

**Key design:**
```rust
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Serialize;
use tauri::Emitter;

/// Managed state for watcher suppression during queue execution.
pub struct QueueActiveFlag(pub AtomicBool);

/// Progress event payload sent to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct QueueProgress {
    pub index: usize,        // 0-based index of current branch
    pub total: usize,        // total branches in queue
    pub branch: String,      // branch name being processed
    pub status: String,      // "active" | "complete" | "failed" | "rolled_back"
}

/// Result of the entire queue execution.
#[derive(Debug, Clone, Serialize)]
pub struct QueueResult {
    pub success: bool,
    pub completed: usize,
    pub total: usize,
    pub failed_branch: Option<String>,
    pub error: Option<String>,
    pub build_range: Option<(u32, u32)>,  // (first_build, last_build)
}

/// Execute a sequential merge queue.
/// 1. Record HEAD OID snapshot
/// 2. Detect build number once from disk
/// 3. For each branch: create MergeContext with override_build, run pipeline
/// 4. On failure: git reset --hard to snapshot, emit rolled_back for completed branches
/// 5. Emit progress events throughout
pub fn execute_queue(
    app: &tauri::AppHandle,
    project_path: &str,
    branches: Vec<String>,
    merge_target: &str,
    build_patterns: &[BuildFileConfig],
    changelog_config: &Option<ChangelogConfig>,
    queue_flag: &QueueActiveFlag,
) -> Result<QueueResult, GitError> {
    // Set suppression flag
    queue_flag.0.store(true, Ordering::SeqCst);

    // Record snapshot
    let repo = Repository::open(project_path)?;
    let snapshot_oid = repo.head()?.target()
        .ok_or_else(|| GitError::MergeAborted("HEAD has no target".into()))?;
    drop(repo); // Release repo handle -- pipeline steps open their own

    // Detect build number once
    let base_build = build::detect_current_build(project_path, build_patterns)?;
    let mut current_build = base_build.unwrap_or(0);

    let total = branches.len();
    let mut completed = 0;

    for (i, branch) in branches.iter().enumerate() {
        // Emit "active" progress
        let _ = app.emit("merge-queue-progress", QueueProgress {
            index: i, total, branch: branch.clone(), status: "active".into(),
        });

        current_build += 1;
        let override_build = if build_patterns.is_empty() { None } else { Some(current_build) };

        let mut ctx = MergeContext::new(
            project_path, branch, merge_target,
            build_patterns, changelog_config, override_build,
        );

        // Run full pipeline
        let result = merge_execute(&mut ctx)
            .and_then(|_| merge_bump(&mut ctx))
            .and_then(|_| merge_changelog(&mut ctx))
            .and_then(|_| merge_commit(&mut ctx));

        match result {
            Ok(()) => {
                completed += 1;
                let _ = app.emit("merge-queue-progress", QueueProgress {
                    index: i, total, branch: branch.clone(), status: "complete".into(),
                });
            }
            Err(e) => {
                // Emit failure for current branch
                let _ = app.emit("merge-queue-progress", QueueProgress {
                    index: i, total, branch: branch.clone(), status: "failed".into(),
                });

                // Rollback: reset to snapshot
                if let Ok(repo) = Repository::open(project_path) {
                    if let Ok(commit) = repo.find_commit(snapshot_oid) {
                        let _ = repo.reset(
                            commit.as_object(),
                            git2::ResetType::Hard,
                            None,
                        );
                    }
                }

                // Emit rolled_back for all previously completed branches
                for j in 0..completed {
                    let _ = app.emit("merge-queue-progress", QueueProgress {
                        index: j, total, branch: branches[j].clone(), status: "rolled_back".into(),
                    });
                }

                // Clear suppression flag + force refresh
                queue_flag.0.store(false, Ordering::SeqCst);
                let _ = app.emit("git-changed", serde_json::json!({
                    "project_path": project_path,
                    "change_type": "refs_changed"
                }));

                return Ok(QueueResult {
                    success: false, completed, total,
                    failed_branch: Some(branch.clone()),
                    error: Some(e.to_string()),
                    build_range: None,
                });
            }
        }
    }

    // Success: clear flag + force refresh
    queue_flag.0.store(false, Ordering::SeqCst);
    let _ = app.emit("git-changed", serde_json::json!({
        "project_path": project_path,
        "change_type": "refs_changed"
    }));

    let first_build = base_build.unwrap_or(0) + 1;
    Ok(QueueResult {
        success: true, completed, total,
        failed_branch: None, error: None,
        build_range: if build_patterns.is_empty() { None } else { Some((first_build, current_build)) },
    })
}
```

### Pattern 2: File Watcher Suppression via AtomicBool

**What:** Add an `AtomicBool` flag to Tauri managed state. The watcher's `process_events` loop checks this flag and skips emitting `git-changed` while true.

**When to use:** During queue execution only. Flag is set before first merge, cleared after last merge (or rollback).

**Implementation approach:**
```rust
// In lib.rs -- add to managed state:
.manage(git::queue::QueueActiveFlag(AtomicBool::new(false)))

// In watcher/mod.rs -- modify process_events to accept the flag:
// Before emitting git-changed, check:
// if queue_flag.0.load(Ordering::SeqCst) { continue; }
```

**Critical detail:** After the queue completes (success or failure + rollback), the queue orchestrator must:
1. Set flag to `false`
2. Emit one forced `git-changed` event so the frontend refreshes branch data

The watcher function currently runs on a detached thread that receives events via `mpsc::Receiver`. To give it access to the `QueueActiveFlag`, the flag must be passed to the thread when `start_watcher` is called (it can be cloned as `Arc<AtomicBool>` or the managed state can be accessed via the `AppHandle`).

**Recommended approach:** Use `Arc<AtomicBool>` stored in the managed state wrapper, and pass a clone to the watcher thread at startup. The `process_events` function signature changes to:
```rust
fn process_events(
    rx: mpsc::Receiver<...>,
    app: &tauri::AppHandle,
    project_paths: &[String],
    queue_active: Arc<AtomicBool>,  // NEW parameter
)
```

### Pattern 3: @dnd-kit/react Sortable List

**What:** DragDropProvider wraps a list of items using the `useSortable` hook. The `onDragEnd` handler uses `initialIndex` and `index` from `source.sortable` to reorder.

**When to use:** MergeQueueDialog's branch list, pre-execution only.

**Verified pattern (from @dnd-kit/react 0.3.2):**
```tsx
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { isSortable } from '@dnd-kit/react/sortable';

// SortableItem wrapper
function SortableQueueItem({ id, index, children }: {
  id: string;
  index: number;
  children: (args: {
    containerRef: (el: Element | null) => void;
    handleRef: (el: Element | null) => void;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  return <>{children({ containerRef: ref, handleRef, isDragging })}</>;
}

// In MergeQueueDialog:
function MergeQueueDialog() {
  const { branches, reorder } = useMergeQueueStore();

  return (
    <DragDropProvider
      onDragEnd={({ canceled, operation }) => {
        if (canceled) return;
        const { source } = operation;
        if (!isSortable(source)) return;
        const { initialIndex, index } = source.sortable;
        if (initialIndex === index) return;
        reorder(initialIndex, index);
      }}
    >
      {branches.map((branch, i) => (
        <SortableQueueItem key={branch.name} id={branch.name} index={i}>
          {({ containerRef, handleRef, isDragging }) => (
            <div ref={containerRef} className={isDragging ? 'opacity-50' : ''}>
              <GripVertical ref={handleRef} className="cursor-grab" />
              <span>{branch.name}</span>
            </div>
          )}
        </SortableQueueItem>
      ))}
    </DragDropProvider>
  );
}
```

**Key insight from community reports:** Do NOT use `target` from `onDragEnd` -- it has known issues in 0.3.x. Use `source.sortable.initialIndex` and `source.sortable.index` to determine the move. This is the "trust initialIndex and index" pattern.

### Pattern 4: In-Place Toast Updates (TOAST-05)

**What:** Sonner's `toast()` returns an ID. Passing the same `id` option to subsequent `toast.loading()` / `toast.success()` / `toast.error()` calls updates the existing toast in-place.

**Implementation in alerts.ts:**
```typescript
const MERGE_QUEUE_TOAST_ID = 'merge-queue';

export function fireMergeQueueToast(current: number, total: number, branch: string) {
  toast.loading(`Merging ${current}/${total}: ${branch}`, {
    id: MERGE_QUEUE_TOAST_ID,
  });
}

export function completeMergeQueueToast(total: number) {
  toast.success(`Queue complete: ${total}/${total} merged`, {
    id: MERGE_QUEUE_TOAST_ID,
    duration: 5000,
  });
}

export function failMergeQueueToast(branch: string, current: number, total: number) {
  toast.error(`Queue failed on ${branch} (${current}/${total}). Rolled back.`, {
    id: MERGE_QUEUE_TOAST_ID,
    duration: Infinity,
  });
}
```

### Pattern 5: Merge Queue Store (merge-queue-store.ts)

**What:** Separate Zustand store managing queue lifecycle: branch selection, ordering, execution status, results.

**Recommended state shape:**
```typescript
type QueueItemStatus = 'pending' | 'active' | 'complete' | 'failed' | 'rolled_back';

interface QueueBranch {
  name: string;
  worktreePath: string;
  ahead: number;
  status: QueueItemStatus;
}

type QueueStep = 'idle' | 'ready' | 'executing' | 'success' | 'failure';

interface MergeQueueState {
  branches: QueueBranch[];
  step: QueueStep;
  currentIndex: number;
  error: string | null;

  // Actions
  setBranches: (branches: QueueBranch[]) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  removeBranch: (name: string) => void;
  startQueue: (projectPath: string, mergeTarget: string, buildPatterns: BuildFileConfig[], changelogConfig: ChangelogConfig | null) => Promise<void>;
  updateProgress: (progress: QueueProgress) => void;
  reset: () => void;
}
```

### Anti-Patterns to Avoid
- **Driving queue from frontend JS loop:** Never call `merge_branch` N times from the frontend. A crash or window close mid-loop leaves the repo in a partial state with no rollback. The queue must run entirely in Rust.
- **Reading build number from disk between merges:** `detect_current_build()` reads from the filesystem. After `merge_commit()` writes the new tree to HEAD, the on-disk files reflect the bumped number. But if `checkout_head()` doesn't fully sync (or timing varies), you can get stale reads. Use `override_build` exclusively.
- **Using `target` in @dnd-kit/react onDragEnd:** Known issue in 0.3.x where `target` is identical to `source`. Use `source.sortable.initialIndex` and `source.sortable.index` instead.
- **Emitting per-branch toasts:** Creates toast stack overflow. Use single persistent toast with stable ID updated in-place.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop reorder | Custom mouse event handlers | @dnd-kit/react useSortable | Keyboard accessibility, touch support, screen reader announcements are non-trivial |
| Array move utility | Custom splice logic | @dnd-kit/helpers `move` or a simple `arrayMove` helper | Edge cases with same-index moves, out-of-bounds |
| Toast in-place updates | Custom notification system | Sonner toast.loading() with stable ID | Already installed, proven API, auto-dismiss handling |
| Git rollback | Manual file restoration | git2 Repository::reset(ResetType::Hard) | Single atomic operation that handles all tracked files correctly |

## Common Pitfalls

### Pitfall 1: Build Number Duplication in Sequential Merges
**What goes wrong:** Each merge calls `detect_current_build()` which reads from disk. After merge N commits to HEAD, the disk might still show build N (not N+1) because `checkout_head()` writes asynchronously or the glob matches a file not yet flushed.
**Why it happens:** `detect_current_build()` uses filesystem glob, not git tree inspection. Disk state can lag behind git tree state.
**How to avoid:** Call `detect_current_build()` exactly ONCE before the queue starts. Track the build number in a local variable. Pass `override_build = base + offset` to each MergeContext. Never read from disk between merges.
**Warning signs:** Two branches in the queue get the same build number in their merge commits.

### Pitfall 2: Rollback Fails If Repository Handle Is Held
**What goes wrong:** If a `Repository` handle from a failed pipeline step is still in scope when rollback tries to open the repo, the reset can fail or deadlock on Windows (file locking).
**Why it happens:** git2::Repository holds file handles to the `.git` directory. Windows exclusive file locks prevent concurrent access.
**How to avoid:** Pipeline steps already open/drop Repository per step (Phase 16 design decision). The queue orchestrator should NOT hold a Repository handle during pipeline execution. Open repo only for the initial snapshot OID read and for the rollback reset, dropping it in between.
**Warning signs:** "Failed to open repository" or "Access denied" errors during rollback on Windows.

### Pitfall 3: Watcher Fires During Queue Execution
**What goes wrong:** Each `merge_commit()` call writes to `.git/refs/heads/{merge_target}`, triggering the file watcher, which emits `git-changed`, which triggers `silentRefresh()` in Dashboard, which calls `list_branches` while the queue is mid-execution.
**Why it happens:** The watcher sees ref changes immediately. The debounce (2s for native, 5s for poll) may not be long enough for a multi-branch queue.
**How to avoid:** Boolean suppression flag checked in `process_events` before emitting. Flag set before first merge, cleared after queue completion + one forced refresh event.
**Warning signs:** Branch table flickers or shows intermediate states during queue execution.

### Pitfall 4: @dnd-kit/react handleRef vs ref Confusion
**What goes wrong:** Applying `ref` to the drag handle instead of the container, or `handleRef` to the container. Results in the entire item being undraggable or the handle not working.
**Why it happens:** `useSortable` returns both `ref` (for the sortable container) and `handleRef` (for the drag handle element). The naming is not intuitive.
**How to avoid:** `ref` goes on the outermost container div. `handleRef` goes on the grip icon element. Use the render-props pattern shown in Architecture Pattern 3.
**Warning signs:** Drag doesn't initiate, or entire item becomes a drag handle (no grip-specific behavior).

### Pitfall 5: Tauri Command Blocks UI Thread
**What goes wrong:** `merge_queue_execute` runs synchronously on the Tauri command thread. If the queue has many branches, the IPC call doesn't return until all merges complete. The frontend can't receive progress events because the `invoke()` promise hasn't resolved.
**Why it happens:** Tauri commands run on a thread pool but the `invoke()` call on the frontend awaits the response. Progress events are emitted via `app.emit()` which goes through Tauri's event system independently of the command response.
**How to avoid:** This is actually fine -- Tauri events are emitted on the event loop thread, not the command thread. The frontend `listen()` callback fires independently of the pending `invoke()` promise. However, the Tauri command MUST accept `app_handle: tauri::AppHandle` to emit events. Verify that events arrive in the frontend listener while the invoke is pending (they will, but test it).
**Warning signs:** Progress events only arrive after the invoke resolves (would indicate a threading issue).

### Pitfall 6: Checkbox Selection Includes Non-Mergeable Branches
**What goes wrong:** User selects branches with `ahead == 0` or `is_dirty == true`, which cannot be merged. Queue starts and immediately fails.
**Why it happens:** BranchTable checkboxes don't filter by merge eligibility.
**How to avoid:** Only enable checkboxes (or only count selections) for branches where `ahead > 0 && !is_dirty`. The "Merge Selected" button should only appear when 2+ eligible branches are checked.
**Warning signs:** Queue fails on first branch with "nothing to merge" or dirty worktree error.

## Code Examples

### Tauri Command Registration for Queue

```rust
// In git_commands.rs:
#[tauri::command]
pub async fn merge_queue_execute(
    app_handle: tauri::AppHandle,
    project_path: String,
    project_name: String,
    branches: Vec<String>,
    merge_target: String,
    build_patterns: Vec<BuildFileConfig>,
    changelog_config: Option<ChangelogConfig>,
    write_lock: tauri::State<'_, Mutex<()>>,
    queue_flag: tauri::State<'_, crate::git::queue::QueueActiveFlag>,
) -> Result<crate::git::queue::QueueResult, GitError> {
    let _guard = write_lock.lock().map_err(|e| {
        GitError::MergeAborted(format!("Failed to acquire write lock: {}", e))
    })?;
    crate::git::queue::execute_queue(
        &app_handle, &project_path, branches, &merge_target,
        &build_patterns, &changelog_config, &queue_flag,
    )
}

// In lib.rs -- add to invoke_handler:
commands::git_commands::merge_queue_execute,

// In lib.rs -- add managed state:
.manage(git::queue::QueueActiveFlag(std::sync::atomic::AtomicBool::new(false)))
```

### Frontend Event Listener for Progress

```typescript
// In MergeQueueDialog or merge-queue-store.ts:
import { listen } from '@tauri-apps/api/event';

interface QueueProgress {
  index: number;
  total: number;
  branch: string;
  status: 'active' | 'complete' | 'failed' | 'rolled_back';
}

// Set up listener before starting queue:
const unlisten = await listen<QueueProgress>('merge-queue-progress', (event) => {
  const { index, total, branch, status } = event.payload;
  useMergeQueueStore.getState().updateProgress(event.payload);

  // Update in-place toast
  if (status === 'active') {
    fireMergeQueueToast(index + 1, total, branch);
  }
});

// Start queue via invoke -- events stream in while this awaits
const result = await invoke<QueueResult>('merge_queue_execute', {
  projectPath, projectName, branches: branchNames,
  mergeTarget, buildPatterns, changelogConfig,
});

// Process final result
if (result.success) {
  completeMergeQueueToast(result.total);
} else {
  failMergeQueueToast(result.failed_branch!, result.completed + 1, result.total);
}

unlisten(); // Clean up listener
```

### Watcher Suppression Integration

```rust
// In watcher/mod.rs -- modify process_events signature:
fn process_events(
    rx: mpsc::Receiver<Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>>,
    app: &tauri::AppHandle,
    project_paths: &[String],
    queue_active: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
    loop {
        match rx.recv() {
            Ok(Ok(events)) => {
                // Skip all events while queue is executing
                if queue_active.load(std::sync::atomic::Ordering::SeqCst) {
                    continue;
                }
                // ... existing event processing ...
            }
            // ... rest unchanged ...
        }
    }
}
```

### BranchTable "Merge Selected" Button

```tsx
// In BranchTable header, after existing header content:
{showSelection && selectedBranches.size >= 2 && (
  <Button
    size="sm"
    className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)]"
    onClick={() => onMergeSelected(selectedBranches)}
  >
    <GitMerge className="h-3.5 w-3.5 mr-1" />
    Merge Selected ({selectedBranches.size})
  </Button>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @dnd-kit/core + @dnd-kit/sortable | @dnd-kit/react (React 19 rewrite) | 2024 | New API: DragDropProvider, useSortable from /sortable, handleRef pattern |
| react-beautiful-dnd | @dnd-kit/react | 2024 (archived) | rbd archived; @dnd-kit is the ecosystem successor |
| Frontend-driven merge loops | Rust-side queue orchestration | Phase 17 | Atomicity, crash safety, build number ownership |

## Open Questions

1. **@dnd-kit/react keyboard accessibility**
   - What we know: useSortable provides keyboard support (Space to pick up, Arrow keys to move)
   - What's unclear: Whether keyboard reorder works with the `handleRef` pattern or requires the entire item to be focusable
   - Recommendation: Test during implementation; fall back to making the container focusable if handleRef doesn't receive keyboard events

2. **Tauri async command vs sync command**
   - What we know: The queue command holds a Mutex lock for the entire duration. Using `async` in the Tauri command signature moves it to the async runtime. Using sync keeps it on the blocking thread pool.
   - What's unclear: Whether holding a Mutex guard across await points causes issues
   - Recommendation: Use sync (non-async) command signature. The Mutex is acquired once and held for the queue duration. This matches the existing `merge_branch` pattern. Tauri events still emit independently.

3. **`@dnd-kit/helpers` move utility availability**
   - What we know: The `move` utility is referenced in community examples
   - What's unclear: Whether it ships with @dnd-kit/react or requires a separate install
   - Recommendation: Check after installing @dnd-kit/react. If not available, implement a simple `arrayMove(arr, from, to)` helper -- it's 3 lines of code.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git2 (Rust) | Queue rollback, pipeline | Existing | 0.20 | -- |
| @dnd-kit/react | Drag reorder | Not yet installed | 0.3.2 (npm) | -- |
| sonner | Toast updates | Existing | ^2.0.7 | -- |
| Tauri events API | Progress streaming | Existing | 2.x | -- |

**Missing dependencies with no fallback:**
- `@dnd-kit/react` must be installed: `cd src-ui && npm install @dnd-kit/react@0.3.2`

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/git/pipeline.rs` -- MergeContext with override_build, phase validation, step functions
- `src-tauri/src/git/merge.rs` -- merge_branch() thin wrapper, merge_preview(), conflict resolution
- `src-tauri/src/git/build.rs` -- detect_current_build() filesystem-based detection, bump_build_number()
- `src-tauri/src/watcher/mod.rs` -- process_events loop, git-changed event emission pattern
- `src-tauri/src/commands/git_commands.rs` -- merge_branch command with Mutex lock pattern
- `src-tauri/src/lib.rs` -- managed state registration, invoke_handler registration
- `src-ui/src/stores/merge-store.ts` -- MergeStep state machine, invoke pattern
- `src-ui/src/lib/alerts.ts` -- toast system with priority queue, Sonner API usage
- `src-ui/src/components/BranchTable.tsx` -- checkbox selection pattern, showSelection prop
- `.planning/phases/17-multi-branch-merge-queue/17-UI-SPEC.md` -- full design contract
- `.planning/phases/17-multi-branch-merge-queue/17-CONTEXT.md` -- locked decisions
- `.planning/phases/16-composable-merge-engine/16-01-SUMMARY.md` -- pipeline architecture decisions

### Secondary (MEDIUM confidence)
- [@dnd-kit/react sortable pattern](https://medium.com/@ysuwansiri/drag-drop-sorting-with-dnd-kit-react-using-initialindex-and-index-9a80356e6649) -- "trust initialIndex and index" approach, March 2026
- [GitHub issue #1695: Example of Sortable with @dnd-kit/react](https://github.com/clauderic/dnd-kit/issues/1695) -- community workarounds for limited docs
- [GitHub issue #1664: source and target identical in onDragEnd](https://github.com/clauderic/dnd-kit/issues/1664) -- confirms target unreliability in 0.3.x

### Tertiary (LOW confidence)
- @dnd-kit/react 0.x official docs -- limited documentation exists for the React 19 rewrite; most docs cover the older @dnd-kit/core + @dnd-kit/sortable stack

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use or pinned in CONTEXT.md
- Architecture: HIGH -- queue orchestrator pattern fully derived from reading pipeline.rs, merge.rs, and watcher code
- Pitfalls: HIGH -- build number duplication, watcher cascade, and rollback handle issues all derived from reading actual source code
- @dnd-kit/react API: MEDIUM -- 0.x package with limited official docs; community-verified pattern available but API may have undocumented edge cases

**Research date:** 2026-04-02
**Valid until:** 2026-04-16 (14 days -- @dnd-kit/react 0.x may ship breaking changes)
