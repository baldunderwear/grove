# Phase 16: Composable Merge Engine - Research

**Researched:** 2026-04-02
**Domain:** Rust refactoring -- decomposing monolithic git merge into composable pipeline steps
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked -- auto-generated CONTEXT.md notes this is a pure infrastructure phase.

### Claude's Discretion
All implementation choices are at Claude's discretion. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from project research:
- Current `merge_branch()` is ~150 lines with no transaction boundary
- Build numbers are detected from disk (filesystem), not git tree -- this must be addressed for queue safety
- Pipeline steps: preview -> execute -> bump -> changelog -> commit
- Each step must produce a context object consumed by the next step
- Steps validate prerequisites and refuse to run out of order
- The "composable" part is which steps are included, not their order -- order is fixed by domain

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Merge pipeline is decomposed into composable steps (preview -> execute -> bump -> changelog -> commit) | Full decomposition analysis below; current merge_branch() analyzed line-by-line; MergeContext pattern documented; step validation strategy defined |
</phase_requirements>

## Summary

The current `merge_branch()` function in `src-tauri/src/git/merge.rs` is a 230-line monolith that performs six distinct operations sequentially: (1) resolve branches and count commits, (2) checkout and in-memory merge with conflict handling, (3) write merged tree, (4) detect and bump build numbers on disk, (5) rename changelog fragments on disk, (6) build final tree incorporating disk changes and create merge commit. These operations share intermediate state (OIDs, tree references, modified file lists) through local variables, with no clear boundaries between steps and no ability to recover from partial failure.

The decomposition must introduce a `MergeContext` struct that flows between pipeline steps, carrying accumulated state from each step to the next. Each step function takes `&mut MergeContext` and validates that its prerequisites are met (e.g., bump step refuses to run if merge step has not produced a tree OID). The critical insight is that the existing `merge_preview()` function is already a clean, read-only step that can serve as the pipeline's first stage with minimal modification. The remaining work is splitting `merge_branch()` into four functions: execute (merge + conflict resolution + tree write), bump (build number detection + disk write), changelog (fragment rename), and commit (final tree assembly + merge commit creation + checkout).

The highest-risk aspect is the build number detection. Currently `detect_current_build()` reads from the filesystem via glob patterns. This works for single-branch merge but creates a race condition in the Phase 17 queue scenario: after merge N commits, the working directory has the new build number on disk, but if `detect_current_build()` is called for merge N+1 before checkout, it reads the post-merge state. The composable engine must accept an optional `override_build` parameter so the queue orchestrator can own the sequence. This is not something Phase 16 implements (queue is Phase 17), but the interface must support it.

**Primary recommendation:** Introduce a `MergeContext` struct and decompose `merge_branch()` into `merge_execute()`, `merge_bump()`, `merge_changelog()`, and `merge_commit()` step functions. Keep `merge_preview()` as-is. Add an `override_build: Option<u32>` parameter to support future queue orchestration. The existing `merge_branch()` becomes a thin wrapper that calls all steps in sequence (backward-compatible).

## Project Constraints (from CLAUDE.md)

- Tauri 2 + React 19 + TypeScript + Rust backend
- All `invoke()` calls live in stores, not components
- Rust command functions are thin wrappers delegating to domain modules
- Error types use `thiserror` with `serde::Serialize` via Display
- Rust doc comments (`///`) on all public functions
- `snake_case` for Rust functions and files; `PascalCase` for structs/enums
- TypeScript types in `src-ui/src/types/` must mirror Rust structs
- Write lock via `Mutex<()>` for mutating git operations
- File watcher emits `git-changed` events; no suppression mechanism exists yet
- Testing: only inline `#[cfg(test)]` modules in Rust; no frontend tests

## Standard Stack

This phase is a pure Rust refactoring. No new crates or npm packages are needed.

### Core (existing, unchanged)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 | 0.20 | Git operations (merge, tree write, commit) | Already in use; provides all needed APIs |
| glob | (existing) | Build file pattern matching | Already in use for build detection |
| thiserror | (existing) | Error enum derivation | Already in use for GitError |
| serde | (existing) | Serialization of structs across IPC | Already in use |

### No New Dependencies
This phase adds zero crates and zero npm packages. The decomposition is purely structural.

## Architecture Patterns

### Current merge_branch() Structure (what we are decomposing)

```
merge_branch()                          ~230 lines
  |-- Resolve source/target branches     lines 157-177
  |-- Count commits (revwalk)            lines 179-184
  |-- Checkout HEAD to merge_target      lines 186-188
  |-- In-memory merge + conflicts        lines 190-216
  |-- Write merged tree                  lines 218-218
  |-- Detect + bump build on disk        lines 220-235
  |-- Rename changelog fragments         lines 238-258
  |-- Build final tree with disk changes lines 261-348
  |-- Create merge commit (2 parents)    lines 350-369
  |-- Checkout HEAD                      lines 372-372
  |-- Return MergeResult                 lines 374-380
```

### Recommended Decomposition

```
src-tauri/src/git/
  merge.rs          # Public API: merge_preview(), merge_branch() (wrapper),
                    #   plus step functions and MergeContext
  build.rs          # Unchanged: detect_current_build(), bump_build_number()
  changelog.rs      # Unchanged: find/rename fragments
  pipeline.rs       # NEW: MergeContext, MergePhase enum, step orchestration
  error.rs          # Add MergeStepError variant if needed
  mod.rs            # Add pipeline module
```

Alternative: keep everything in `merge.rs` rather than creating `pipeline.rs`. This avoids a new file but makes `merge.rs` larger. **Recommendation: create `pipeline.rs`** for the context struct, phase enum, and step functions, keeping `merge.rs` as the public API surface with `merge_preview()` and the backward-compatible `merge_branch()` wrapper.

### Pattern 1: MergeContext Struct (Pipeline State Object)

**What:** A struct that carries accumulated state between pipeline steps. Each step reads what it needs and writes what it produces.

**When to use:** Any multi-step operation where intermediate results feed into later steps.

```rust
// Source: project-specific design based on codebase analysis

/// Tracks which phase of the merge pipeline has completed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum MergePhase {
    /// Initial state -- no steps have run.
    Init,
    /// merge_execute() completed -- merged tree is ready.
    Executed,
    /// merge_bump() completed -- build files updated on disk.
    Bumped,
    /// merge_changelog() completed -- changelog fragments renamed.
    Changelogged,
    /// merge_commit() completed -- merge commit created.
    Committed,
}

/// Context object flowing through the merge pipeline.
/// Each step advances `phase` and populates its output fields.
pub struct MergeContext {
    // -- Inputs (set at creation) --
    pub project_path: String,
    pub source_branch: String,
    pub merge_target: String,
    pub build_patterns: Vec<BuildFileConfig>,
    pub changelog_config: Option<ChangelogConfig>,
    /// If set, overrides disk-based build detection.
    /// Used by the queue orchestrator (Phase 17) to own the sequence.
    pub override_build: Option<u32>,

    // -- Pipeline state --
    pub phase: MergePhase,
    pub warnings: Vec<String>,

    // -- Populated by merge_execute() --
    pub commits_merged: usize,
    pub merged_tree_oid: Option<git2::Oid>,
    pub source_oid: Option<git2::Oid>,
    pub target_oid: Option<git2::Oid>,

    // -- Populated by merge_bump() --
    pub new_build: Option<u32>,

    // -- Populated by merge_changelog() --
    pub changelog_renames: Vec<(String, String)>,

    // -- Populated by merge_commit() --
    pub commit_oid: Option<git2::Oid>,
}
```

### Pattern 2: Step Functions with Phase Validation

**What:** Each step function validates that the context is at the correct phase before executing.

```rust
/// Execute the merge: resolve branches, checkout target, merge in-memory,
/// handle conflicts, write merged tree. Advances phase to Executed.
pub fn merge_execute(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Init {
        return Err(GitError::MergeAborted(
            format!("merge_execute requires Init phase, got {:?}", ctx.phase)
        ));
    }
    // ... perform merge ...
    ctx.phase = MergePhase::Executed;
    Ok(())
}

/// Bump build numbers on disk. Advances phase to Bumped.
/// If override_build is set, uses that instead of detecting from disk.
pub fn merge_bump(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Executed {
        return Err(GitError::MergeAborted(
            format!("merge_bump requires Executed phase, got {:?}", ctx.phase)
        ));
    }
    // ... bump build ...
    ctx.phase = MergePhase::Bumped;
    Ok(())
}
```

### Pattern 3: Backward-Compatible Wrapper

**What:** The existing `merge_branch()` becomes a thin wrapper calling all steps.

```rust
/// Execute a full merge pipeline. This is the backward-compatible entry point
/// that calls all steps in sequence.
pub fn merge_branch(
    project_path: &str,
    source_branch: &str,
    merge_target: &str,
    build_patterns: &[BuildFileConfig],
    changelog_config: &Option<ChangelogConfig>,
) -> Result<MergeResult, GitError> {
    let mut ctx = MergeContext::new(
        project_path, source_branch, merge_target,
        build_patterns, changelog_config, None,
    );

    merge_execute(&mut ctx)?;
    merge_bump(&mut ctx)?;
    merge_changelog(&mut ctx)?;
    merge_commit(&mut ctx)?;

    Ok(ctx.into_result())
}
```

### Pattern 4: Skip-Safe Steps (composability)

**What:** Steps that have nothing to do are no-ops that still advance the phase. This ensures the pipeline always completes all phases even when build_patterns is empty or changelog_config is None.

```rust
pub fn merge_bump(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Executed {
        return Err(GitError::MergeAborted(/* ... */));
    }
    if ctx.build_patterns.is_empty() {
        ctx.new_build = None;
        ctx.phase = MergePhase::Bumped;
        return Ok(());
    }
    // ... actual bump logic ...
    ctx.phase = MergePhase::Bumped;
    Ok(())
}
```

### Anti-Patterns to Avoid

- **Returning intermediate state to the frontend between steps:** The pipeline runs atomically in a single Rust command invocation. Do NOT expose step functions as individual Tauri commands. The frontend still calls `merge_branch` (or a future `merge_queue_execute`). Steps are composable on the Rust side only.

- **Holding Repository across steps:** Opening `Repository::open()` once and passing it through the context seems efficient but creates lifetime issues with git2's borrow checker. Instead, open the repo in each step function. The cost is negligible (it is an open of an already-open fd).

- **Storing git2 types in MergeContext:** `git2::Oid` is `Copy` and safe to store. But `git2::Repository`, `git2::Tree`, `git2::Commit` have lifetime parameters tied to the repo. Store OIDs only and re-resolve from the repo in each step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Build number detection | Custom regex parser | Existing `build::detect_current_build()` | Already handles JSON, TOML, plain text formats; has test coverage |
| Conflict classification | New conflict checker | Existing `classify_conflicts()` | Already handles build file pattern matching correctly |
| Changelog fragment rename | New file rename logic | Existing `changelog::rename_changelog_fragments()` | Already handles legacy vs standard fragments |
| Build file auto-resolve | New index manipulation | Existing `resolve_build_conflicts_in_index()` | Complex git2 index manipulation already debugged |

**Key insight:** The decomposition is about restructuring control flow, not rewriting business logic. Every operation the steps need to perform already exists as a working function. The step functions wrap and sequence these existing functions.

## Runtime State Inventory

This is a refactoring phase, but the rename/migration is structural (function signatures), not string-based. No runtime state carries the old function names.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None -- no database stores function names | None |
| Live service config | None -- no external services reference merge internals | None |
| OS-registered state | None -- no OS registrations reference merge function names | None |
| Secrets/env vars | None | None |
| Build artifacts | None -- Cargo recompiles on source changes | None |

## Common Pitfalls

### Pitfall 1: Repository Lifetime in Context

**What goes wrong:** Attempting to store `&Repository` or `git2::Tree<'repo>` in MergeContext creates lifetime issues because the Repository would need to outlive the context, and step functions cannot borrow from each other.
**Why it happens:** git2 types are lifetime-bound to their Repository instance.
**How to avoid:** Store only `git2::Oid` values (which are `Copy` and owned) in MergeContext. Each step function opens the repo independently with `Repository::open()`.
**Warning signs:** Compiler errors about lifetimes in MergeContext struct definition.

### Pitfall 2: Disk State Divergence After merge_execute

**What goes wrong:** After `merge_execute()` calls `checkout_head(force)`, the working directory reflects the merged state. But `merge_bump()` then calls `detect_current_build()` which reads from disk. If the merge brought in a build number change from the source branch, `detect_current_build()` may read the source's build number instead of the target's.
**Why it happens:** `checkout_head(force)` writes the merged tree to disk before the build bump happens. The merged tree includes the source's build files.
**How to avoid:** The `merge_execute()` step does NOT call `checkout_head()` at the end. It only writes the merged tree to the repo object store (via `write_tree_to`). The `merge_commit()` step calls `checkout_head()` as the very last operation. Between execute and commit, the working directory still reflects the pre-merge target checkout.
**Warning signs:** Build number detected is the source branch's build number, not the target's.

### Pitfall 3: Build Number Override Not Threaded Through

**What goes wrong:** Phase 17 needs to pass a pre-computed build number to each merge in the queue. If the composable engine does not accept `override_build`, the queue orchestrator has no way to control the sequence.
**Why it happens:** Forgetting to design the interface for the downstream consumer.
**How to avoid:** Add `override_build: Option<u32>` to MergeContext from day one. When set, `merge_bump()` uses it directly instead of calling `detect_current_build()`. Phase 16 always passes `None` for this field. Phase 17 uses it.
**Warning signs:** Phase 17 planning discovers it needs to fork the merge step functions.

### Pitfall 4: Incomplete Phase Advancement on Error

**What goes wrong:** If a step function returns `Err`, the context's `phase` field was not advanced. A retry or cleanup function checking the phase would see the previous phase, not knowing where the failure occurred.
**Why it happens:** Error returns short-circuit before `ctx.phase = ...`.
**How to avoid:** This is actually the correct behavior -- the phase should NOT advance on error. But document this explicitly: on error, `ctx.phase` remains at the previous step's value, indicating the failed step. The caller can inspect `ctx.phase` to determine what cleanup is needed.
**Warning signs:** None -- this is by design. The pitfall is forgetting to document it.

### Pitfall 5: merge_commit() Must Re-Read Disk State Into Tree

**What goes wrong:** The current `merge_branch()` has a complex 80-line block (lines 261-348) that reads bumped build files and renamed changelog files from disk back into a git index to create the final tree. If `merge_commit()` does not replicate this logic, the merge commit will not include build bump or changelog changes.
**Why it happens:** Build bump and changelog rename happen on disk, outside git's index. They must be explicitly staged into the tree before committing.
**How to avoid:** `merge_commit()` must read `ctx.new_build`, `ctx.changelog_renames`, and the `ctx.merged_tree_oid` to construct the final tree. This logic should be extracted from the current monolith verbatim -- it is already correct and tested in production.
**Warning signs:** Merge commits that don't include build number changes or changelog renames.

### Pitfall 6: Frontend Regression from Signature Change

**What goes wrong:** If `merge_branch()` Rust function signature changes, the Tauri command in `git_commands.rs` breaks, and the frontend `invoke('merge_branch', {...})` call fails silently.
**Why it happens:** Changing the domain function signature without updating the command layer.
**How to avoid:** The backward-compatible wrapper keeps the exact same signature as today. The Tauri command in `git_commands.rs` continues to call `merge_branch()` with the same arguments. Zero frontend changes in Phase 16.
**Warning signs:** TypeScript type errors or runtime invoke failures after the refactor.

## Code Examples

### Current merge_branch() Call Chain (what exists today)

```
Frontend (MergeDialog.tsx)
  -> useMergeStore.executeMerge()
    -> invoke<MergeResult>('merge_branch', { projectPath, projectName, sourceBranch, mergeTarget, buildPatterns, changelogConfig })
      -> git_commands::merge_branch()  [acquires Mutex lock]
        -> git::merge::merge_branch()  [monolithic ~230 lines]
          -> build::detect_current_build()   [reads disk]
          -> build::bump_build_number()      [writes disk]
          -> changelog::rename_changelog_fragments()  [writes disk]
          -> repo.commit()                   [writes git]
          -> repo.checkout_head(force)       [writes disk]
```

### After Decomposition (Phase 16 target)

```
Frontend (MergeDialog.tsx)          -- UNCHANGED
  -> useMergeStore.executeMerge()   -- UNCHANGED
    -> invoke('merge_branch', ...)  -- UNCHANGED
      -> git_commands::merge_branch()  [acquires Mutex lock] -- UNCHANGED
        -> git::merge::merge_branch()  [thin wrapper]
          -> MergeContext::new(...)
          -> pipeline::merge_execute(&mut ctx)   [merge + conflict + tree write]
          -> pipeline::merge_bump(&mut ctx)      [build detect + disk write]
          -> pipeline::merge_changelog(&mut ctx) [fragment rename]
          -> pipeline::merge_commit(&mut ctx)    [final tree + commit + checkout]
          -> ctx.into_result()                   [-> MergeResult]
```

### MergeContext Construction

```rust
impl MergeContext {
    pub fn new(
        project_path: &str,
        source_branch: &str,
        merge_target: &str,
        build_patterns: &[BuildFileConfig],
        changelog_config: &Option<ChangelogConfig>,
        override_build: Option<u32>,
    ) -> Self {
        Self {
            project_path: project_path.to_string(),
            source_branch: source_branch.to_string(),
            merge_target: merge_target.to_string(),
            build_patterns: build_patterns.to_vec(),
            changelog_config: changelog_config.clone(),
            override_build,
            phase: MergePhase::Init,
            warnings: Vec::new(),
            commits_merged: 0,
            merged_tree_oid: None,
            source_oid: None,
            target_oid: None,
            new_build: None,
            changelog_renames: Vec::new(),
            commit_oid: None,
        }
    }

    /// Convert the completed context into a MergeResult for the frontend.
    pub fn into_result(self) -> MergeResult {
        MergeResult {
            success: self.phase == MergePhase::Committed,
            new_build: self.new_build,
            commits_merged: self.commits_merged,
            changelog_renames: self.changelog_renames,
            warnings: self.warnings,
        }
    }
}
```

### Step Function: merge_bump() (with override support)

```rust
/// Detect and bump build numbers on disk. If override_build is set,
/// uses that value instead of detecting from disk.
pub fn merge_bump(ctx: &mut MergeContext) -> Result<(), GitError> {
    if ctx.phase != MergePhase::Executed {
        return Err(GitError::MergeAborted(
            format!("merge_bump requires Executed phase, got {:?}", ctx.phase)
        ));
    }

    if ctx.build_patterns.is_empty() {
        ctx.new_build = None;
        ctx.phase = MergePhase::Bumped;
        return Ok(());
    }

    let next = if let Some(override_val) = ctx.override_build {
        override_val
    } else {
        let current = build::detect_current_build(&ctx.project_path, &ctx.build_patterns)?;
        current.map(|n| n + 1).unwrap_or(1)
    };

    build::bump_build_number(&ctx.project_path, &ctx.build_patterns, next)?;
    ctx.new_build = Some(next);
    ctx.phase = MergePhase::Bumped;
    Ok(())
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic merge_branch() | Composable step pipeline | Phase 16 (this phase) | Enables Phase 17 queue to orchestrate steps with rollback |
| Build number from disk only | Disk detection + override parameter | Phase 16 (this phase) | Enables Phase 17 to own build sequence in-memory |

**Deprecated/outdated after this phase:**
- Direct calls to `merge_branch()` internals: all callers should go through the wrapper or the step functions with a MergeContext

## Open Questions

1. **Should merge_execute() call checkout_head() or not?**
   - What we know: Currently `merge_branch()` calls `checkout_head(force)` at line 187 (before merge) and again at line 372 (after commit). The first checkout switches to the target branch. The second updates the working directory to match the new commit.
   - What's unclear: If we skip the post-merge `checkout_head()` until `merge_commit()`, the working directory stays on the pre-merge target state between steps. This is correct for build detection but means the disk state is temporarily inconsistent during bump/changelog steps.
   - Recommendation: Have `merge_execute()` perform the initial `checkout_head()` to the target branch (necessary for merge). Have `merge_commit()` perform the final `checkout_head()` after the commit. Between these two calls, the disk state is the target branch (not yet merged), which is what we want for `detect_current_build()`.

2. **Should the step functions re-open the Repository each time?**
   - What we know: git2 Repository cannot be stored in MergeContext due to lifetime issues. Opening a repo is cheap (~microseconds for a local path).
   - What's unclear: Whether opening the same repo 4 times in sequence causes any locking issues on Windows with NAS paths.
   - Recommendation: Open in each step. If NAS latency is an issue, consider passing repo path once and caching the open handle in a helper, but this is premature optimization. Test on NAS during Phase 16 verification.

3. **Where does the file watcher suppression go?**
   - What we know: The watcher fires `git-changed` events on disk writes. Build bump and changelog rename both write to disk. The watcher uses a 2-second debounce already.
   - What's unclear: Whether the existing 2s debounce is sufficient for the single-branch case, or if explicit suppression is needed.
   - Recommendation: Phase 16 does NOT add watcher suppression. The existing 2s debounce handles single-branch merge. Phase 17 adds explicit suppression for the queue scenario where multiple merges fire in rapid succession.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in `#[cfg(test)]` + `cargo test` |
| Config file | None (standard Cargo test runner) |
| Quick run command | `cargo test -p grove -- --test-threads=1` |
| Full suite command | `cargo test -p grove` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MERGE-01a | MergeContext advances through phases correctly | unit | `cargo test -p grove pipeline::tests::phase_progression` | No -- Wave 0 |
| MERGE-01b | Step functions reject out-of-order execution | unit | `cargo test -p grove pipeline::tests::out_of_order_rejected` | No -- Wave 0 |
| MERGE-01c | merge_branch() wrapper produces same result as before | integration | `cargo test -p grove merge::tests::backward_compat` | No -- Wave 0 |
| MERGE-01d | merge_bump() respects override_build parameter | unit | `cargo test -p grove pipeline::tests::override_build` | No -- Wave 0 |
| MERGE-01e | Steps with empty config are no-ops that advance phase | unit | `cargo test -p grove pipeline::tests::skip_empty_config` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p grove`
- **Per wave merge:** `cargo test -p grove` + `cargo clippy -p grove`
- **Phase gate:** Full suite green + manual single-branch merge test in dev mode

### Wave 0 Gaps
- [ ] `src-tauri/src/git/pipeline.rs` `#[cfg(test)] mod tests` -- covers MERGE-01a through MERGE-01e
- [ ] Test fixtures: mock repo setup helper (init repo, create branches, add build file) -- needed for integration tests
- [ ] Note: integration tests requiring actual git repos are harder to set up; unit tests for phase validation and override logic are straightforward

## Sources

### Primary (HIGH confidence)
- Codebase: `src-tauri/src/git/merge.rs` -- full line-by-line analysis of merge_branch() (492 lines total, merge_branch at lines 148-381)
- Codebase: `src-tauri/src/git/build.rs` -- detect_current_build() filesystem glob pattern, bump_build_number() disk write (248 lines)
- Codebase: `src-tauri/src/git/changelog.rs` -- find/rename fragment operations (135 lines)
- Codebase: `src-tauri/src/git/error.rs` -- GitError enum variants (36 lines)
- Codebase: `src-tauri/src/commands/git_commands.rs` -- merge_branch command with Mutex lock and notification (172 lines)
- Codebase: `src-ui/src/stores/merge-store.ts` -- MergeStep state machine, invoke calls (112 lines)
- Codebase: `src-ui/src/components/MergeDialog.tsx` -- full merge UI flow (346 lines)
- Codebase: `src-ui/src/types/merge.ts` -- TypeScript type definitions mirroring Rust structs
- Codebase: `src-tauri/src/watcher/mod.rs` -- file watcher with 2s debounce, no suppression mechanism
- Codebase: `src-tauri/src/lib.rs` -- Mutex<()> managed state, command registrations

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` -- milestone-level research confirming build number race condition and transaction boundary gaps
- `.planning/codebase/CONVENTIONS.md` -- naming and module organization patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; pure refactoring of existing code
- Architecture: HIGH -- based on direct line-by-line reading of merge.rs, build.rs, changelog.rs; decomposition maps directly to existing code blocks
- Pitfalls: HIGH -- every pitfall identified from actual code patterns (disk vs git tree divergence, lifetime issues, signature compatibility); none are theoretical

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- no external dependency changes expected)
