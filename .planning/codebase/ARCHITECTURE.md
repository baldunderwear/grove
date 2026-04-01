# Architecture

**Analysis Date:** 2026-04-01

## Pattern Overview

**Overall:** Tauri Desktop App — Rust backend process host + React WebView frontend communicating via Tauri IPC (invoke/event)

**Key Characteristics:**
- Rust backend owns all system interaction: git ops, file I/O, process management, config persistence, file watching, and system tray
- React frontend owns all UI state: routing/views, session tabs, branch display, merge workflow
- All cross-boundary calls use `invoke()` (frontend → backend commands) or `emit()`/`listen()` (Tauri events, bidirectional)
- No REST API or local HTTP server — all IPC is via Tauri's native channel
- State management is frontend-only (Zustand stores); the backend is stateless except for Mutex-guarded managers

## Layers

**Tauri Commands Layer:**
- Purpose: Thin command handlers that translate IPC calls into business logic calls
- Location: `src-tauri/src/commands/`
- Contains: `config_commands.rs`, `git_commands.rs`, `session_commands.rs`, `file_commands.rs`
- Depends on: `config`, `git`, `terminal`, `process` modules
- Used by: Frontend stores via `invoke()`

**Git Operations Layer:**
- Purpose: All git interactions — branch listing, merge operations, build bumping, changelog
- Location: `src-tauri/src/git/`
- Contains: `branches.rs`, `merge.rs`, `build.rs`, `changelog.rs`, `status.rs`, `error.rs`
- Depends on: `git2` crate for merge ops; `std::process::Command` (git CLI) for worktree listing (NAS compatibility)
- Used by: `commands/git_commands.rs`

**Config Layer:**
- Purpose: Application configuration model and JSON persistence
- Location: `src-tauri/src/config/`
- Contains: `models.rs` (AppConfig, ProjectConfig, Profile, PromptTemplate), `persistence.rs` (load/save/detect)
- Depends on: `serde_json`, `tauri::AppHandle` for `%APPDATA%` path resolution
- Used by: Nearly all other backend modules

**Terminal Layer:**
- Purpose: PTY spawn/management, session state detection, session history tracking
- Location: `src-tauri/src/terminal/`
- Contains: `pty.rs` (spawn), `mod.rs` (TerminalManager, TerminalSession), `commands.rs` (Tauri commands), `state_parser.rs` (AI state detection), `history.rs` (transition tracking), `job_object.rs` (Windows process tree cleanup)
- Depends on: `portable_pty`, Windows Job Objects for process tree cleanup
- Used by: Frontend `SessionManager` component via `terminal_spawn`, `terminal_write`, `terminal_resize`, `terminal_kill`

**Process Detection Layer:**
- Purpose: Detect running Claude Code sessions outside Grove
- Location: `src-tauri/src/process/`
- Contains: `detect.rs` (SessionDetector), `launch.rs`, `mod.rs`
- Depends on: OS process enumeration
- Used by: `commands/session_commands.rs`

**Watcher Layer:**
- Purpose: Monitor project `.git` directories for branch/ref/status changes; emit `git-changed` events
- Location: `src-tauri/src/watcher/`
- Contains: `mod.rs` (single file)
- Depends on: `notify` + `notify_debouncer_mini`; falls back to `PollWatcher` on NAS paths
- Used by: App setup in `lib.rs`

**Frontend Stores:**
- Purpose: Client-side state management; all Tauri invocations live here
- Location: `src-ui/src/stores/`
- Contains: `config-store.ts` (app config + navigation state), `branch-store.ts`, `terminal-store.ts` (tab management + session state), `merge-store.ts`, `session-store.ts`
- Depends on: `@tauri-apps/api/core` (`invoke`)
- Used by: Page and component files

**Frontend Pages:**
- Purpose: Top-level view routing; each view maps to one `activeView` state value
- Location: `src-ui/src/pages/`
- Contains: `Dashboard.tsx`, `AllProjects.tsx`, `ProjectConfig.tsx`, `Settings.tsx`, `ConfigEditors.tsx`, `EmptyState.tsx`
- Depends on: Stores, components
- Used by: `App.tsx` routing switch

**Frontend Components:**
- Purpose: Reusable UI building blocks organized by domain
- Location: `src-ui/src/components/`
- Contains: Domain subdirectories (`session/`, `terminal/`, `launch/`, `config/`, `ui/`) plus root-level components
- Depends on: Stores, hooks, types
- Used by: Pages and other components

## Data Flow

**User launches a Claude Code session:**

1. User clicks "Launch" on a branch row in `BranchTable` → `LaunchDialog` opens
2. `LaunchDialog` calls `useTerminalStore.addTab()` creating a pending tab
3. `SessionManager` detects new tab, mounts a hidden `TerminalInstance` for it
4. `TerminalInstance` calls `invoke('terminal_spawn', { working_dir, cols, rows, project_id, on_event })`
5. Rust `terminal_spawn` command: resolves UNC path, looks up profile env vars/flags, calls `pty::spawn_pty()`
6. `spawn_pty` creates a PTY, spawns `cmd.exe /c claude` in the worktree directory
7. A background OS thread reads PTY output, streams `TerminalEvent::Data` back via Tauri `Channel`
8. `TerminalInstance` receives events, writes to xterm.js; `appendOutput` maintains a 12-line preview buffer
9. PTY output passes through `state_parser.rs` which emits `session-state-changed` Tauri events
10. `lib.rs` setup listener records state transitions to `HistoryManager`; frontend `setTabState` updates tab UI

**Git state refresh (automatic):**

1. `watcher` module monitors `.git/refs/`, `.git/worktrees/`, `.git/HEAD` for changes
2. On change: emits `git-changed` Tauri event with `{ project_path, change_type }`
3. `lib.rs` setup listener debounces (10s min), calls `notifications::check_and_notify()` and `tray::rebuild_tray_menu()`
4. Frontend `Dashboard` listens for `git-changed` via `listen()`, calls `silentRefresh()` on `branch-store`
5. `branch-store` calls `invoke('list_branches')` → `git::branches::list_worktree_branches()`

**Config mutation:**

1. Frontend store action calls `invoke('update_project' | 'add_project' | etc.)`
2. Rust command reads config from disk, applies mutation, saves back to `%APPDATA%/com.grove.app/config.json`
3. Command returns full `AppConfig` to frontend; store replaces its `config` state atomically

**State Management:**
- Navigation state (`activeView`, `selectedProjectId`) lives in `config-store.ts`
- All Zustand stores hold in-memory state; no localStorage or IndexedDB
- Backend config is the only persistence layer; frontend reloads it on startup

## Key Abstractions

**TerminalSession (Rust):**
- Purpose: Encapsulates one PTY — writer, master handle, child process, Windows Job Object
- Location: `src-tauri/src/terminal/mod.rs`
- Pattern: Drop impl closes Job Object for guaranteed process tree cleanup

**TerminalTab (TypeScript):**
- Purpose: Frontend view of an active or pending session — connects tab ID → PTY terminal ID
- Location: `src-ui/src/stores/terminal-store.ts`
- Pattern: Pending tab uses `pending-{uuid}` ID; `activateTab()` replaces it with the real PTY terminal ID on connect

**AppConfig (Rust + TypeScript):**
- Purpose: Top-level config DTO shared across backend persistence and frontend state
- Backend: `src-tauri/src/config/models.rs`
- Frontend types: `src-ui/src/types/config.ts`
- Pattern: Backend commands return full `AppConfig` after every mutation; frontend replaces store state wholesale

**SessionState (Rust + TypeScript):**
- Purpose: Claude's detected activity state — `working | waiting | idle | error`
- Detected in: `src-tauri/src/terminal/state_parser.rs` via regex on stripped PTY output
- Propagated via: `session-state-changed` Tauri event → `terminal-store.ts` `setTabState()`

## Entry Points

**Rust binary:**
- Location: `src-tauri/src/main.rs` (calls `lib::run()`)
- Triggers: OS launches the exe
- Responsibilities: Delegates entirely to `lib.rs`

**Tauri app setup:**
- Location: `src-tauri/src/lib.rs` → `run()` function
- Triggers: Binary startup
- Responsibilities: Registers all Tauri commands, managed state (TerminalManager, HistoryManager, NotificationState), builds system tray, starts file watcher, starts auto-fetch thread, registers global event listeners

**Frontend entry:**
- Location: `src-ui/src/main.tsx`
- Triggers: WebView loads
- Responsibilities: Mounts React tree into `#root`

**React app root:**
- Location: `src-ui/src/App.tsx`
- Triggers: `main.tsx` render
- Responsibilities: Loads config on mount, listens for tray events (`launch-worktree`, `navigate`), renders `<Sidebar>` + view switch based on `activeView`

## Error Handling

**Strategy:** Rust commands return `Result<T, E>` where E is a typed error enum (e.g., `ConfigError`, `GitError`). Frontend `invoke()` calls are wrapped in try/catch; errors are stored in Zustand store `error` fields.

**Patterns:**
- Rust: Domain-specific error enums implementing `serde::Serialize` so they cross the IPC boundary as JSON strings
- Git ops: `GitError` enum in `src-tauri/src/git/error.rs`
- Config ops: `ConfigError` enum in `src-tauri/src/config/persistence.rs`
- Frontend: Stores catch errors and set `error: String | null` state; components display inline
- No global error boundary in the React tree

## Cross-Cutting Concerns

**Logging:** `eprintln!("[grove] ...")` in Rust — appears in Tauri dev console. No structured logging library.

**Validation:** Rust command layer validates inputs (path existence, duplicate project check with case-insensitive Windows path comparison). Frontend has minimal validation.

**Authentication:** Not applicable — local desktop app, no server auth.

**Windows-specific handling:** UNC path resolution (`src-tauri/src/utils/paths.rs`), Windows Job Objects for process cleanup (`terminal/job_object.rs`), `CREATE_NO_WINDOW` flag on all `std::process::Command` spawns to suppress console flicker.

---

*Architecture analysis: 2026-04-01*
