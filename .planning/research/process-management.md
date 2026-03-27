# Process Spawning and File System Watching

**Researched:** 2026-03-27
**Confidence:** HIGH (official docs + community reports verified)

## Part 1: Process Spawning

### Launching Claude Code

Claude Code runs as `claude` CLI. Grove needs to launch it in a terminal window pointed at a specific worktree directory.

**Recommended approach:** Shell out to Windows Terminal (`wt.exe`) which then runs Claude Code.

```rust
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn launch_claude_in_terminal(worktree_path: &str) -> Result<(), GroveError> {
    // Launch Windows Terminal with a new tab in the worktree directory
    Command::new("wt.exe")
        .args([
            "new-tab",
            "--title", &format!("Claude: {}", worktree_path),
            "-d", worktree_path,
            "claude",
        ])
        .creation_flags(CREATE_NO_WINDOW) // Don't flash a console window from Grove
        .spawn()?;
    Ok(())
}

fn launch_terminal(worktree_path: &str) -> Result<(), GroveError> {
    Command::new("wt.exe")
        .args(["-d", worktree_path])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()?;
    Ok(())
}
```

### Windows Terminal Arguments

| Command | Effect |
|---------|--------|
| `wt.exe -d "C:\path"` | New window in directory |
| `wt.exe new-tab -d "C:\path"` | New tab in existing window |
| `wt.exe -p "PowerShell" -d "C:\path"` | Specific profile |
| `wt.exe new-tab --title "name" -d "C:\path" cmd` | New tab with title, running cmd |

### Tauri Shell Plugin (for Frontend-Initiated Launches)

If the frontend needs to trigger process launches:

```json
// capabilities/default.json
{
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "wt",
          "cmd": "wt.exe",
          "args": true
        },
        {
          "name": "git",
          "cmd": "git",
          "args": true
        }
      ]
    },
    "shell:allow-spawn",
    "shell:allow-kill"
  ]
}
```

**However:** For Grove, prefer Rust-side process spawning via Tauri commands rather than the shell plugin. It's simpler, avoids the permission scope complexity, and keeps process management in one place.

### Pattern: Rust Command Handler

```rust
#[tauri::command]
async fn open_worktree_terminal(path: String) -> Result<(), GroveError> {
    launch_terminal(&path)
}

#[tauri::command]
async fn open_worktree_claude(path: String) -> Result<(), GroveError> {
    launch_claude_in_terminal(&path)
}

#[tauri::command]
async fn open_in_editor(path: String, editor: String) -> Result<(), GroveError> {
    match editor.as_str() {
        "code" => Command::new("code").arg(&path).spawn()?,
        "cursor" => Command::new("cursor").arg(&path).spawn()?,
        _ => return Err(GroveError::Custom(format!("Unknown editor: {}", editor))),
    };
    Ok(())
}
```

## Part 2: File System Watching

### The Problem

Grove needs to show real-time git status for each worktree: modified files count, branch state, dirty indicators. Polling `git status` on a timer is wasteful. File system watching lets us react to actual changes.

### Recommended: notify crate + debouncing

```toml
[dependencies]
notify = "7"
notify-debouncer-mini = "0.5"
```

### Architecture

```
                    FS Event
                       |
                  notify crate (ReadDirectoryChangesW on Windows)
                       |
                  debouncer (500ms window)
                       |
                  Rust handler
                       |
              git2 status check (only on changed worktree)
                       |
              Tauri event emit to frontend
                       |
              React state update
```

### Implementation

```rust
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

struct WatcherState {
    watchers: HashMap<String, notify_debouncer_mini::Debouncer<RecommendedWatcher>>,
}

#[tauri::command]
async fn watch_worktree(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), GroveError> {
    let app_handle = app.clone();
    let watch_path = path.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |events: Result<Vec<DebouncedEvent>, _>| {
            if let Ok(_events) = events {
                // Don't process individual file events -- just trigger a status refresh
                // The frontend will call get_status_summary for the details
                let _ = app_handle.emit("worktree-changed", &watch_path);
            }
        },
    )?;

    debouncer.watcher().watch(
        PathBuf::from(&path).as_path(),
        RecursiveMode::Recursive,
    )?;

    let mut state = state.lock().unwrap();
    state.watchers.insert(path, debouncer);

    Ok(())
}

#[tauri::command]
async fn unwatch_worktree(
    path: String,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), GroveError> {
    let mut state = state.lock().unwrap();
    state.watchers.remove(&path); // Drop stops watching
    Ok(())
}
```

### Frontend Listener

```typescript
import { listen } from '@tauri-apps/api/event';

// In a React component or effect:
const unlisten = await listen<string>('worktree-changed', (event) => {
  const changedPath = event.payload;
  // Refresh status for this worktree
  queryClient.invalidateQueries({ queryKey: ['worktree-status', changedPath] });
});

// Cleanup
return () => { unlisten(); };
```

### What to Watch, What to Ignore

**Watch:** The worktree root directory (recursive).

**Ignore in the handler** (not in the watcher -- let notify filter):
- `.git/` directory changes (internal git operations fire tons of events)
- `node_modules/`, `target/`, `__pycache__/` -- large dependency dirs
- Build output directories

```rust
fn should_trigger_status_update(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    // Ignore git internals, dependency dirs, build artifacts
    !path_str.contains(".git")
        && !path_str.contains("node_modules")
        && !path_str.contains("target")
        && !path_str.contains("__pycache__")
        && !path_str.contains(".next")
}
```

### Debounce Strategy

- **500ms debounce** for general file changes -- good balance between responsiveness and CPU usage
- **On debounced event:** Run `git2::Repository::statuses()` for the affected worktree
- **Emit result** to frontend via Tauri event

Do NOT run git status on every raw filesystem event. A single `git commit` can fire 50+ FS events. The debouncer collapses these into one status check.

## Gotchas

### Process Spawning
1. **CREATE_NO_WINDOW flag** -- Without this, launching `wt.exe` from a GUI app flashes a console window briefly.
2. **Windows Terminal not installed** -- Fall back to `cmd.exe /c start cmd /k "cd /d {path}"` if `wt.exe` is not available.
3. **PATH resolution** -- `wt.exe` is in the Windows App path, not standard PATH. Use `where wt.exe` to verify availability at startup.
4. **Shell plugin spawn() hanging** -- Known issue in Tauri 2 production builds on Windows. Avoid the JS shell plugin for critical operations; use Rust `std::process::Command` instead.
5. **claude CLI availability** -- Check if `claude` is in PATH at startup. Show a setup prompt if not found.

### File Watching
1. **Windows: ReadDirectoryChangesW** -- The default backend on Windows. Works well but has a 64KB buffer per watch. Watching too many directories can overflow it, dropping events silently.
2. **WSL paths** -- If worktrees are on a WSL filesystem mounted in Windows, notify events may not fire. Use `PollWatcher` as fallback.
3. **Network drives** -- Same issue as WSL. NFS/SMB shares may not emit FS events. Detect and fall back to polling.
4. **Antivirus interference** -- Windows Defender can delay or suppress FS events. Not much you can do besides documenting it.
5. **Memory per watcher** -- Each `RecommendedWatcher` holds a handle and buffer. For 10-20 worktrees this is trivial. For 100+ you might want a single watcher on the parent directory.
6. **Debouncer drops the first event** -- `notify-debouncer-mini` waits for the debounce period before emitting. For immediate first response, do an initial status check when starting the watch.

## Sources

- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/)
- [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/)
- [notify crate](https://docs.rs/notify/latest/notify/)
- [notify-debouncer-mini](https://docs.rs/notify-debouncer-mini/latest/notify_debouncer_mini/)
- [notify-rs GitHub](https://github.com/notify-rs/notify)
- [Windows Terminal CLI args](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
- [Tauri spawn hanging issue](https://github.com/tauri-apps/tauri/issues/11513)
- [Building a File Watcher with Debouncing in Rust](https://oneuptime.com/blog/post/2026-01-25-file-watcher-debouncing-rust/view)
