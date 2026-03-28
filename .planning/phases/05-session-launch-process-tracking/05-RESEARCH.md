# Phase 05: Session Launch & Process Tracking - Research

**Researched:** 2026-03-27
**Domain:** Process spawning, process detection, Windows terminal integration
**Confidence:** HIGH

## Summary

This phase adds the ability to launch Claude Code sessions from the dashboard and track which worktrees have active sessions. The core technical challenges are: (1) spawning `claude` in a visible terminal window from a Tauri GUI app on Windows, (2) detecting active Claude Code processes and matching them to worktree paths, and (3) wiring session state into the existing branch table UI.

The recommended approach uses `std::process::Command` with Windows `CREATE_NEW_CONSOLE` creation flag for launching (no Tauri shell plugin needed), the `sysinfo` crate for process detection by command-line argument inspection, and Tauri managed state (`State<Mutex<>>`) for tracking active sessions -- consistent with existing patterns. The `tauri-plugin-opener` plugin handles "Open in Explorer" functionality, while VS Code launch uses a simple `std::process::Command`.

**Primary recommendation:** Use `std::process::Command` + `CommandExt::creation_flags(CREATE_NEW_CONSOLE)` for session launch, `sysinfo` crate for process polling, and a new Zustand session store on the frontend.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Launch button per branch row in the dashboard table
- Spawns `claude --worktree <name>` in a new Windows terminal window via Rust Command
- Configurable launch flags stored per-project in config
- "New Worktree" flow: create worktree via git, then launch session
- Rust backend polls for Claude Code processes, matches by working directory to worktree path
- PID tracking stored in Tauri managed state (not persisted to disk)
- Polling interval matches the dashboard refresh interval
- Active session badge (emerald pulse dot) on branch rows
- "Open in Explorer" button per branch (opens worktree path in Windows Explorer)
- "Open in VS Code" button per branch (runs `code <worktree_path>`)
- Action buttons visible on hover or as icon buttons in branch row

### Claude's Discretion
- Exact process detection method (command line parsing vs PID file)
- Terminal emulator choice for launching (Windows Terminal, cmd, powershell)
- Exact placement of action buttons in branch row
- New worktree dialog design

### Deferred Ideas (OUT OF SCOPE)
None.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-03.1 | One-click launch of Claude Code in a worktree | `std::process::Command` with `CREATE_NEW_CONSOLE` flag; `wt.exe -d <path> claude` for Windows Terminal |
| FR-03.2 | Launch with configurable flags | Per-project `launch_flags` field in `ProjectConfig`; passed as args to Command |
| FR-03.3 | Create new worktree with custom name and launch session | `git2` worktree creation (already available), then session launch |
| FR-03.4 | Track which worktrees have active Claude Code processes | `sysinfo` crate polling with `cmd()` inspection to match worktree paths |
| FR-03.5 | Option to open worktree directory in file explorer or VS Code | `tauri-plugin-opener` for Explorer reveal; `std::process::Command::new("code")` for VS Code |
| FR-02.4 | Show per-branch whether a Claude Code session is running | Emerald pulse dot badge in BranchTable, driven by session store state |
| FR-02.6 | Visual indicators: active session | Animate with Tailwind `animate-pulse` on emerald dot |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sysinfo | 0.38.x | Process enumeration and command-line inspection | De facto Rust crate for cross-platform process info; provides `cmd()`, `cwd()`, `exe()` on Process |
| tauri-plugin-opener | 2.x | Open files/URLs and reveal in Explorer | Official Tauri 2 plugin replacing shell.open; provides `revealItemInDir()` |
| std::process::Command | stdlib | Spawn external processes (claude, code) | No dependency needed; Windows `CommandExt` provides `creation_flags()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| std::os::windows::process::CommandExt | stdlib | Set Windows creation flags (CREATE_NEW_CONSOLE) | When spawning claude in a visible terminal |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sysinfo | Raw Win32 API (CreateToolhelp32Snapshot) | More control but much more code; sysinfo abstracts this well |
| sysinfo | tauri-plugin-shell | Shell plugin is for managed child processes with stdio; overkill for fire-and-forget terminal launch |
| tauri-plugin-opener | std::process::Command("explorer") | Plugin handles edge cases, is the official Tauri way |

**Installation (Rust):**
```bash
# In src-tauri/Cargo.toml
cargo add sysinfo
cargo add tauri-plugin-opener
```

**Installation (JS):**
```bash
# In src-ui/
npm install @tauri-apps/plugin-opener
```

**Note on sysinfo MSRV:** sysinfo 0.38.x requires rustc >= 1.88. Current environment has rustc 1.94.1 -- no issue.

## Architecture Patterns

### Recommended Module Structure
```
src-tauri/src/
├── process/
│   ├── mod.rs          # Module exports
│   ├── launch.rs       # Session launching (spawn claude, code, explorer)
│   └── detect.rs       # Process detection (poll for active sessions)
├── commands/
│   ├── session_commands.rs  # Tauri command handlers for session ops
│   └── mod.rs          # Add session_commands module
└── lib.rs              # Register new commands + opener plugin

src-ui/src/
├── stores/
│   └── session-store.ts    # Active session tracking (PIDs, polling)
├── components/
│   ├── BranchTable.tsx     # Add action buttons + session badge
│   └── NewWorktreeDialog.tsx  # Dialog for creating new worktree
└── types/
    └── session.ts          # Session-related types
```

### Pattern 1: Session Launch via Windows Terminal
**What:** Spawn `claude` in a new Windows Terminal tab with the worktree as working directory
**When to use:** Always on Windows (wt.exe is available on Windows 10/11)
**Example:**
```rust
use std::process::Command;
use std::os::windows::process::CommandExt;

const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub fn launch_claude_session(
    worktree_path: &str,
    worktree_name: &str,
    extra_flags: &[String],
) -> Result<u32, String> {
    // Prefer wt.exe (Windows Terminal) if available, fall back to cmd.exe
    let mut cmd = Command::new("wt.exe");
    cmd.arg("-d").arg(worktree_path);
    cmd.arg("--title").arg(format!("Claude: {}", worktree_name));
    // The command to run inside the terminal:
    cmd.arg("claude");
    for flag in extra_flags {
        cmd.arg(flag);
    }

    let child = cmd.spawn().map_err(|e| {
        // Fallback to cmd.exe if wt.exe not found
        if e.kind() == std::io::ErrorKind::NotFound {
            return launch_claude_via_cmd(worktree_path, worktree_name, extra_flags)
                .map_err(|e2| format!("Failed to launch: {}", e2))
                .unwrap_err();
        }
        format!("Failed to launch Windows Terminal: {}", e)
    })?;

    Ok(child.id())
}

fn launch_claude_via_cmd(
    worktree_path: &str,
    worktree_name: &str,
    extra_flags: &[String],
) -> Result<u32, String> {
    let mut cmd = Command::new("cmd.exe");
    cmd.arg("/c").arg("start");
    cmd.arg(format!("Claude: {}", worktree_name));
    cmd.arg("claude");
    for flag in extra_flags {
        cmd.arg(flag);
    }
    cmd.current_dir(worktree_path);
    cmd.creation_flags(CREATE_NEW_CONSOLE);

    let child = cmd.spawn().map_err(|e| format!("Failed to launch cmd: {}", e))?;
    Ok(child.id())
}
```

### Pattern 2: Process Detection via sysinfo
**What:** Poll running processes, match Claude Code by executable name + working directory
**When to use:** On every dashboard refresh cycle to update session badges
**Example:**
```rust
use sysinfo::System;
use std::collections::HashMap;

pub struct SessionDetector {
    system: System,
}

impl SessionDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
        }
    }

    /// Returns a map of worktree_path -> PID for active Claude sessions
    pub fn detect_active_sessions(&mut self, worktree_paths: &[String]) -> HashMap<String, u32> {
        self.system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let mut active = HashMap::new();

        for process in self.system.processes().values() {
            let name = process.name().to_string_lossy();
            // Claude Code runs as "claude" or "claude.exe"
            if !name.contains("claude") {
                continue;
            }

            let cmd_args: Vec<String> = process.cmd().iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect();

            // Check if any worktree path appears in the command args or cwd
            for wt_path in worktree_paths {
                let normalized = wt_path.replace('\\', "/").to_lowercase();

                // Check cwd
                if let Some(cwd) = process.cwd() {
                    let cwd_str = cwd.to_string_lossy().replace('\\', "/").to_lowercase();
                    if cwd_str.starts_with(&normalized) {
                        active.insert(wt_path.clone(), process.pid().as_u32());
                        break;
                    }
                }

                // Check command line args for worktree path
                let cmd_joined = cmd_args.join(" ").replace('\\', "/").to_lowercase();
                if cmd_joined.contains(&normalized) {
                    active.insert(wt_path.clone(), process.pid().as_u32());
                    break;
                }
            }
        }

        active
    }
}
```

### Pattern 3: Tauri Managed State for Sessions
**What:** Store session state in Tauri managed state, same pattern as existing Mutex<()>
**When to use:** For all session-related state
**Example:**
```rust
use std::sync::Mutex;
use std::collections::HashMap;

pub struct SessionState {
    /// Map of worktree_path -> PID
    pub active_sessions: HashMap<String, u32>,
}

// In lib.rs setup:
// .manage(Mutex::new(SessionState { active_sessions: HashMap::new() }))
```

### Pattern 4: Session Store on Frontend
**What:** Zustand store that polls backend for active sessions, merged with branch data
**When to use:** Alongside existing branch-store
**Example:**
```typescript
// session-store.ts
interface SessionState {
  activeSessions: Record<string, number>; // worktree_path -> PID
  fetchSessions: (worktreePaths: string[]) => Promise<void>;
}
```

### Anti-Patterns to Avoid
- **DO NOT use tauri-plugin-shell for launch:** It's designed for managed child processes with stdio piping. We want fire-and-forget terminal windows. Use `std::process::Command` directly from Rust commands.
- **DO NOT persist session state to disk:** Sessions are ephemeral. PID tracking belongs in memory only (Tauri managed state).
- **DO NOT track sessions by PID alone:** PIDs can be reused. Always verify the process is still claude by checking name/cmd when re-checking.
- **DO NOT block the UI thread with process detection:** sysinfo refresh can take 50-100ms. Run detection in Tauri async commands or background threads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process enumeration | Win32 API calls | `sysinfo` crate | Cross-platform, handles permissions, well-tested |
| File explorer reveal | `Command::new("explorer")` | `tauri-plugin-opener` revealItemInDir | Handles edge cases, official Tauri way |
| Terminal detection | Manual PATH search for wt.exe | `Command::new("wt.exe")` with NotFound fallback | Windows resolves PATH automatically, just handle the error |
| Git worktree creation | Raw git CLI | `git2` crate (already in deps) | Already used throughout the project |

**Key insight:** The tricky part isn't launching -- it's detection. Matching a running process to a worktree requires normalizing paths (backslashes, case) and handling the fact that Claude Code may run as a child of the terminal, not as a direct child of Grove.

## Common Pitfalls

### Pitfall 1: Tauri GUI App Has No Console
**What goes wrong:** Tauri apps on Windows use the "windows" subsystem (no console). If you spawn a child process without `CREATE_NEW_CONSOLE`, it inherits... nothing. The process may fail silently or appear headless.
**Why it happens:** Windows GUI apps don't have an attached console by default.
**How to avoid:** Always use `creation_flags(CREATE_NEW_CONSOLE)` or launch via `wt.exe` / `cmd.exe /c start` which create their own console.
**Warning signs:** Child process starts but immediately exits, or no window appears.

### Pitfall 2: Path Normalization for Process Matching
**What goes wrong:** sysinfo returns paths with backslashes on Windows. Worktree paths from git2 use forward slashes. Direct comparison fails.
**Why it happens:** Windows APIs return `\`, git uses `/`, and the codebase already normalizes to `/`.
**How to avoid:** Normalize all paths to lowercase forward slashes before comparison, same as existing `find_project_for_path` pattern in watcher module.
**Warning signs:** Sessions appear "not active" despite claude running in the worktree.

### Pitfall 3: Process Tree Detection
**What goes wrong:** When you spawn `wt.exe -d /path claude`, Windows Terminal creates claude as a child of `WindowsTerminal.exe`, not as a child of Grove. You cannot track the PID returned by `spawn()` because that's wt.exe's PID, not claude's.
**Why it happens:** Windows Terminal is a host process that spawns shells/commands as children.
**How to avoid:** Don't rely on the spawned PID. Instead, poll all processes with sysinfo and match by executable name + working directory. The spawn PID is useful only as a "we tried to launch" indicator.
**Warning signs:** Session shows as active briefly then disappears when wt.exe exits after spawning the inner process.

### Pitfall 4: sysinfo System Instance Reuse
**What goes wrong:** Creating `System::new_all()` on every poll is expensive (hundreds of ms). CPU usage reporting requires delta between measurements.
**Why it happens:** sysinfo needs previous state to compute deltas.
**How to avoid:** Keep a single `SessionDetector` (with `System` inside) in Tauri managed state. Call `refresh_processes()` on each poll, not `System::new_all()`.
**Warning signs:** Dashboard refresh becomes sluggish, 200ms+ delay on poll.

### Pitfall 5: Claude Code Process Name Variation
**What goes wrong:** Claude Code may run as `claude.exe`, `claude`, or as a Node.js process where the exe is `node.exe` with `claude` in the args.
**Why it happens:** Depending on installation method, Claude Code could be a native binary or a Node.js wrapper.
**How to avoid:** Check both `process.name()` and `process.cmd()` arguments. Look for "claude" in either the executable name or the first few command-line arguments.
**Warning signs:** Session detection works for some users but not others depending on their Claude Code installation.

### Pitfall 6: New Worktree Name Conflicts
**What goes wrong:** User tries to create a worktree with a name that already exists.
**Why it happens:** git2 will error on duplicate worktree names.
**How to avoid:** Validate worktree name against existing branches before creation. Show clear error in the dialog.
**Warning signs:** Cryptic git2 error messages shown to user.

## Code Examples

### Tauri Command for Session Launch
```rust
#[tauri::command]
pub fn launch_session(
    worktree_path: String,
    worktree_name: String,
    launch_flags: Vec<String>,
) -> Result<u32, String> {
    crate::process::launch::launch_claude_session(
        &worktree_path,
        &worktree_name,
        &launch_flags,
    )
}
```

### Tauri Command for Active Session Detection
```rust
#[tauri::command]
pub fn get_active_sessions(
    worktree_paths: Vec<String>,
    detector: tauri::State<'_, Mutex<SessionDetector>>,
) -> Result<HashMap<String, u32>, String> {
    let mut detector = detector.lock().map_err(|e| e.to_string())?;
    Ok(detector.detect_active_sessions(&worktree_paths))
}
```

### Open in Explorer (via tauri-plugin-opener)
```typescript
import { revealItemInDir } from '@tauri-apps/plugin-opener';

async function openInExplorer(worktreePath: string) {
  await revealItemInDir(worktreePath);
}
```

### Open in VS Code
```rust
#[tauri::command]
pub fn open_in_vscode(worktree_path: String) -> Result<(), String> {
    Command::new("code")
        .arg(&worktree_path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    Ok(())
}
```

### Active Session Badge in BranchTable
```tsx
{/* Active session badge -- emerald pulse dot */}
{isSessionActive && (
  <Badge className="bg-emerald-500/15 text-emerald-500 border-0 text-xs px-2 py-0.5 rounded-full">
    <span className="relative flex h-2 w-2 mr-1">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
    Active
  </Badge>
)}
```

### New Worktree Creation via git2
```rust
#[tauri::command]
pub fn create_worktree(
    project_path: String,
    branch_name: String,
    branch_prefix: String,
) -> Result<String, GitError> {
    let repo = git2::Repository::open(&project_path)
        .map_err(|_| GitError::RepoNotFound(project_path.clone()))?;

    let full_branch = format!("{}{}", branch_prefix, branch_name);

    // Create worktree directory alongside the main repo
    let parent = std::path::Path::new(&project_path).parent()
        .ok_or_else(|| GitError::Other("Cannot determine parent directory".into()))?;
    let wt_path = parent.join(&full_branch);

    // Get HEAD commit to base the new branch on
    let head = repo.head()?.peel_to_commit()?;

    repo.worktree(
        &full_branch,
        &wt_path,
        Some(git2::WorktreeAddOptions::new().reference(None)),
    ).map_err(|e| GitError::Other(format!("Failed to create worktree: {}", e)))?;

    Ok(wt_path.to_string_lossy().to_string())
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tauri-plugin-shell open() | tauri-plugin-opener | Tauri 2.x | Separate plugin for opening files/URLs vs spawning processes |
| sysinfo ProcessExt trait | Direct methods on Process | sysinfo 0.30+ | No more trait imports needed, methods directly on struct |
| sysinfo refresh_all() | refresh_processes(ProcessesToUpdate) | sysinfo 0.32+ | More granular refresh control, better performance |

## Open Questions

1. **Claude Code process detection reliability**
   - What we know: Claude Code installs as `claude.exe` via npm global or standalone installer. It appears in process list as "claude" or "claude.exe".
   - What's unclear: Whether all installation methods result in the same process name. Node.js wrapper vs native binary may differ.
   - Recommendation: Match on both process name containing "claude" AND command-line args / cwd. Log detection misses for debugging.

2. **Windows Terminal title persistence**
   - What we know: `wt.exe --title "Claude: branch-name"` sets the tab title.
   - What's unclear: Whether the title persists after claude starts or gets overwritten by the shell prompt.
   - Recommendation: Set it as a nice-to-have. Don't rely on terminal title for detection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| wt.exe (Windows Terminal) | Session launch | Yes | Available in WindowsApps | cmd.exe /c start |
| claude.exe | Session launch | Yes | At ~/.local/bin/claude.exe | Error message to user |
| code (VS Code) | Open in VS Code | Yes (Cursor) | Via Cursor's codeBin | Error message to user |
| explorer.exe | Open in Explorer | Yes | System | N/A |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None -- all dependencies available.

**Note:** `code` resolves to Cursor's VS Code fork. This is fine -- it opens the editor. If the user has vanilla VS Code, it would resolve there instead. The command is the same.

## Project Constraints (from CLAUDE.md)

- **Architecture:** Tauri 2 + React 19 + TypeScript + Tailwind CSS
- **State management:** Zustand for client state
- **Backend communication:** `@tauri-apps/api` invoke() pattern
- **UI components:** shadcn components (manually created due to NAS npx incompatibility)
- **Shared state pattern:** `State<Mutex<>>` for Tauri managed state
- **Path normalization:** Backslash to forward slash, case-insensitive on Windows
- **Snake_case TypeScript types:** To match Rust serde, no runtime mapping
- **NAS constraint:** node_modules via junction (scripts/with-modules.mjs)
- **GSD workflow:** Must use GSD entry points before editing files

## Sources

### Primary (HIGH confidence)
- [Rust std::process::Command docs](https://doc.rust-lang.org/std/process/struct.Command.html) - spawn API, Child process
- [Windows CommandExt trait](https://doc.rust-lang.org/std/os/windows/process/trait.CommandExt.html) - creation_flags method
- [sysinfo crate docs](https://docs.rs/sysinfo/latest/sysinfo/) - Process struct, cmd(), cwd(), refresh_processes()
- [sysinfo on crates.io](https://crates.io/crates/sysinfo) - version 0.38.4, MSRV 1.88
- [Tauri 2 Opener plugin](https://v2.tauri.app/plugin/opener/) - revealItemInDir, openUrl
- [Windows Terminal CLI args](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments) - wt.exe -d, --title

### Secondary (MEDIUM confidence)
- [Tauri 2 Shell plugin](https://v2.tauri.app/plugin/shell/) - confirmed shell plugin is NOT the right tool for terminal launch
- [sysinfo Process struct](https://docs.rs/sysinfo/latest/sysinfo/struct.Process.html) - method signatures verified

### Tertiary (LOW confidence)
- Claude Code process name detection specifics - based on local observation, may vary by installation method

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries verified via official docs and crates.io
- Architecture: HIGH - follows established project patterns (Mutex state, Zustand stores, snake_case types)
- Pitfalls: HIGH - Windows process spawning from GUI apps is well-documented territory
- Process detection: MEDIUM - Claude Code process name/args may vary by installation method

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain, 30 days)
