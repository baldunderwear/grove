# Git Operations from Rust

**Researched:** 2026-03-27
**Confidence:** MEDIUM (git2 docs verified, worktree-specific coverage has gaps)

## Decision: Hybrid Approach (git2 + CLI fallback)

Use the `git2` crate (libgit2 bindings) for read operations and simple mutations. Shell out to `git` CLI for complex worktree operations where git2's API is incomplete or awkward.

### Why Not Pure git2?

The git2 crate's worktree support is functional but thin:
- `Repository::worktrees()` lists worktree names
- `Repository::find_worktree()` opens a worktree by name
- `Worktree::name()`, `path()`, `validate()`, `lock()`, `unlock()`, `is_locked()`, `prune()`
- `Repository::is_worktree()` checks if current repo is a worktree
- `WorktreeAddOptions` exists for creating worktrees

What git2 does NOT handle well:
- Creating a worktree from an existing remote branch with tracking setup
- `git worktree add` with `-b` flag (create branch + worktree in one step) has no clean equivalent
- No direct equivalent of `git worktree move`
- Status/diff operations in a worktree context can be tricky to get right

### Why Not Pure CLI?

- Process spawning overhead for frequent operations (status checks, branch listing)
- Parsing git CLI output is fragile and locale-dependent
- No structured error types -- just exit codes and stderr text

### The Hybrid Rule

| Operation | Use | Rationale |
|-----------|-----|-----------|
| List worktrees | git2 | Fast, structured data, no parsing |
| Get worktree status | git2 | Frequent operation, need speed |
| Get branch info | git2 | Structured access to refs |
| Check dirty state | git2 | Fast, no subprocess overhead |
| Read git config | git2 | Direct access |
| **Create worktree** | **git CLI** | `git worktree add -b branch path` handles branch creation + tracking setup atomically |
| **Remove worktree** | **git CLI** | `git worktree remove` handles cleanup better than `prune()` |
| **Fetch/pull** | **git CLI** | git2 fetch requires manual credential/SSH setup; CLI uses system git config |
| **Complex merges** | **git CLI** | Not worth reimplementing merge logic |

## git2 Implementation Patterns

### Opening a Repository

```rust
use git2::Repository;
use std::path::Path;

fn open_repo(path: &str) -> Result<Repository, git2::Error> {
    // discover_path walks up to find .git
    Repository::discover(path)
}
```

### Listing Worktrees

```rust
fn list_worktrees(repo: &Repository) -> Result<Vec<WorktreeInfo>, git2::Error> {
    let mut worktrees = vec![];

    // The main worktree
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("HEAD").to_string();
    worktrees.push(WorktreeInfo {
        name: "main".to_string(),
        path: repo.workdir().unwrap().to_string_lossy().to_string(),
        branch: branch_name,
        is_main: true,
        is_locked: false,
    });

    // Linked worktrees
    if let Ok(wt_names) = repo.worktrees() {
        for i in 0..wt_names.len() {
            if let Some(name) = wt_names.get(i) {
                if let Ok(wt) = repo.find_worktree(name) {
                    let path = wt.path().to_string_lossy().to_string();
                    let locked = wt.is_locked()
                        .map(|s| !matches!(s, git2::WorktreeLockStatus::Unlocked))
                        .unwrap_or(false);

                    // Open the worktree as a repo to get its HEAD
                    let wt_repo = Repository::open(&path)?;
                    let wt_head = wt_repo.head()?;
                    let branch = wt_head.shorthand().unwrap_or("HEAD").to_string();

                    worktrees.push(WorktreeInfo {
                        name: name.to_string(),
                        path,
                        branch,
                        is_main: false,
                        is_locked: locked,
                    });
                }
            }
        }
    }

    Ok(worktrees)
}
```

### Checking Dirty State

```rust
fn is_worktree_dirty(repo_path: &str) -> Result<bool, git2::Error> {
    let repo = Repository::open(repo_path)?;
    let statuses = repo.statuses(Some(
        git2::StatusOptions::new()
            .include_untracked(true)
            .recurse_untracked_dirs(false) // performance: don't recurse deep
    ))?;
    Ok(!statuses.is_empty())
}
```

### Getting Status Summary

```rust
#[derive(Serialize)]
struct StatusSummary {
    modified: usize,
    added: usize,
    deleted: usize,
    untracked: usize,
    conflicted: usize,
}

fn get_status_summary(repo_path: &str) -> Result<StatusSummary, git2::Error> {
    let repo = Repository::open(repo_path)?;
    let statuses = repo.statuses(Some(
        git2::StatusOptions::new()
            .include_untracked(true)
            .recurse_untracked_dirs(false)
    ))?;

    let mut summary = StatusSummary {
        modified: 0, added: 0, deleted: 0, untracked: 0, conflicted: 0,
    };

    for entry in statuses.iter() {
        let s = entry.status();
        if s.is_conflicted() { summary.conflicted += 1; }
        else if s.is_wt_new() || s.is_index_new() { summary.added += 1; }
        else if s.is_wt_deleted() || s.is_index_deleted() { summary.deleted += 1; }
        else if s.is_wt_modified() || s.is_index_modified() { summary.modified += 1; }
        if s.is_wt_new() && !s.is_index_new() { summary.untracked += 1; }
    }

    Ok(summary)
}
```

## CLI Operations Pattern

```rust
use std::process::Command;

fn create_worktree(
    repo_path: &str,
    worktree_path: &str,
    branch: &str,
    create_branch: bool,
) -> Result<String, GroveError> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path);
    cmd.args(["worktree", "add"]);

    if create_branch {
        cmd.args(["-b", branch]);
    }

    cmd.arg(worktree_path);

    if !create_branch {
        cmd.arg(branch);
    }

    let output = cmd.output()?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(GroveError::Git(
            String::from_utf8_lossy(&output.stderr).to_string()
        ))
    }
}

fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), GroveError> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path);
    cmd.args(["worktree", "remove"]);
    if force {
        cmd.arg("--force");
    }
    cmd.arg(worktree_path);

    let output = cmd.output()?;
    if output.status.success() {
        Ok(())
    } else {
        Err(GroveError::Git(
            String::from_utf8_lossy(&output.stderr).to_string()
        ))
    }
}
```

## Thread Safety Warning

**git2::Repository is NOT Send or Sync.** You cannot share a Repository across threads. For Tauri async commands running on a thread pool, you must either:

1. Open a new `Repository` instance per command invocation (recommended -- it's cheap)
2. Use `Mutex<Repository>` in app state (works but serializes all git access)

Option 1 is strongly recommended. `Repository::open()` and `Repository::discover()` are fast (sub-millisecond). Do not try to cache a single Repository instance.

## Gitoxide (gix) Alternative

The `gix` crate is a pure-Rust git implementation (no C dependency). It is more modern than git2 but:
- Worktree support is less mature
- API is still evolving (breaking changes between versions)
- Documentation is thinner
- Larger compile-time cost

**Recommendation:** Stick with git2 for now. It wraps the battle-tested libgit2 C library. Revisit gix when its worktree API stabilizes.

## Gotchas

1. **git2 compiles libgit2 from source** -- First build takes 30-60 seconds. Subsequent builds are cached.
2. **Windows paths in git2** -- Use forward slashes or `PathBuf`. libgit2 handles conversion internally.
3. **SSH operations via git2 require libssh2** -- This adds complexity. For fetch/push, just use git CLI.
4. **Worktree names vs paths** -- git2 uses the worktree *name* (directory basename by default), not the full path, for `find_worktree()`.
5. **`Repository::discover()` from inside a worktree** -- Returns the worktree's repo, NOT the main repo. To get the main repo from a worktree, you need `repo.commondir()` and open that.
6. **Stale worktree entries** -- If a worktree directory is manually deleted, `find_worktree()` still returns it. Call `worktree.validate()` to check if it's still valid on disk.
7. **Large repos** -- `repo.statuses()` can be slow on repos with 100k+ files. Consider `recurse_untracked_dirs(false)` and `include_ignored(false)`.

## Sources

- [git2 crate docs](https://docs.rs/git2/latest/git2/)
- [git2 Worktree struct](https://docs.rs/git2/latest/git2/struct.Worktree.html)
- [git2 Repository struct](https://docs.rs/git2/latest/git2/struct.Repository.html)
- [git2-rs source (repo.rs)](https://github.com/rust-lang/git2-rs/blob/master/src/repo.rs)
- [gitoxide/gix crate](https://crates.io/crates/gitoxide)
