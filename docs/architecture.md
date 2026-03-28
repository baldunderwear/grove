# Grove Architecture

## Overview

Grove is a Tauri 2 desktop application with a Rust backend and React 19 frontend. The two layers communicate exclusively through Tauri's IPC command bridge -- the frontend invokes named Rust functions, and the backend returns serialized results or emits events.

Grove runs as a system tray resident application. The main window starts hidden (`visible: false` in tauri.conf.json) and is shown or hidden on demand. Closing the window hides it rather than quitting the app. The user interacts primarily through the dashboard window or the tray context menu.

## System Diagram

```
+-----------------------------------------------------------+
|                      System Tray                          |
|  (left-click: show/hide window, right-click: context menu)|
+-----------------------------------------------------------+
                            |
+-----------------------------------------------------------+
|                    React Frontend                         |
|                                                           |
|  +------------------+  +------------------+               |
|  | Zustand Stores   |  | Components       |               |
|  |  - branch-store  |  |  - Dashboard     |               |
|  |  - config-store  |  |  - BranchTable   |               |
|  |  - session-store |  |  - MergeDialog   |               |
|  |  - merge-store   |  |  - Settings      |               |
|  +------------------+  +------------------+               |
|                                                           |
+-----------------------------------------------------------+
                     | Tauri IPC |
+-----------------------------------------------------------+
|                    Rust Backend                            |
|                                                           |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  | git/     |  | config/  |  | process/  |  | watcher/  | |
|  | branches |  | models   |  | launcher  |  | notify    | |
|  | status   |  | persist  |  | sessions  |  | debounce  | |
|  | merge    |  | health   |  | detect    |  |           | |
|  | build    |  |          |  |           |  |           | |
|  | changelog|  |          |  |           |  |           | |
|  +----------+  +----------+  +-----------+  +-----------+ |
|                                                           |
|  +---------------+  +---------------+  +----------------+ |
|  | tray          |  | fetch         |  | notifications  | |
|  | (system tray) |  | (auto-fetch)  |  | (merge-ready)  | |
|  +---------------+  +---------------+  +----------------+ |
|                                                           |
+-----------------------------------------------------------+
```

## Backend Modules

### git/

The git module handles all repository operations. It uses the `git2` crate (libgit2 bindings) for local operations and falls back to the `git` CLI for remote operations like fetch, because libgit2 does not reliably support SSH agent forwarding on Windows.

**Key design choice:** A `Repository` object is opened fresh for every command invocation. The shared state between calls is the project path string, not a `Repository` instance. This is because `git2::Repository` is neither `Send` nor `Sync`, making it unsuitable for storage in Tauri's managed state (which requires `Send + Sync`).

Submodules:

- **branches** -- Lists local branches filtered by the project's `branch_prefix`. For each branch, computes ahead/behind counts relative to `merge_target`, checks dirty status, and detects stale branches. Each worktree gets its own `Repository` instance opened at the worktree path.
- **status** -- Checks whether a worktree has uncommitted changes by inspecting the git index and working directory diff.
- **merge** -- Performs atomic merge operations. The merge workflow: (1) in-memory merge via `repo.merge_commits`, (2) classify conflicts as build-file or unexpected, (3) auto-resolve build file conflicts by taking the target version, (4) bump build numbers on disk, (5) rename changelog fragments, (6) create merge commit with two parents, (7) checkout HEAD. If unexpected conflicts exist, the operation aborts without modifying HEAD.
- **build** -- Detects current build numbers by scanning files matching glob patterns, extracts numeric values, and bumps them by writing incremented values back to disk.
- **changelog** -- Finds changelog fragment files matching a naming pattern, and renames them from the branch-name format to the build-number format during merge.

### config/

Configuration is stored as a single JSON file at `%APPDATA%/com.grove.app/config.json`. The top-level structure is `AppConfig`, containing a version number, a list of `ProjectConfig` entries, and a `Settings` object.

Key types from `models.rs`:

- **AppConfig** -- version, projects array, settings object
- **ProjectConfig** -- id (UUID), name, path, merge_target, branch_prefix (default "wt/"), optional build_files array, optional changelog config
- **Settings** -- refresh_interval (30s), start_minimized, start_with_windows, theme ("dark"), auto_fetch_interval (300s), notification toggles
- **HealthStatus** -- enum: Healthy, PathNotFound, NotGitRepo, MissingMergeTarget

Writes are serialized through a `Mutex<()>` managed by Tauri to prevent concurrent config mutations. Health checks validate that a project's path exists, is a git repository, and has the configured merge target branch.

Export and import functions allow backing up and restoring the entire configuration file.

### process/

Handles spawning Claude Code sessions and detecting active ones.

- **launcher** -- Spawns `claude` via `std::process::Command`. On Windows, uses `cmd /k cd /d <path>` to handle drive letter changes (e.g., switching from C: to Z:). Supports configurable launch flags.
- **detect** -- Scans running processes to detect active Claude Code sessions and maps them to worktree paths. Uses a `SessionDetector` struct held in Tauri managed state behind a Mutex.

### watcher/

File system monitoring using the `notify` crate with a debouncer to coalesce rapid changes.

- The watcher is started during app setup for all registered project paths.
- Uses `Box::leak` to give the watcher a `'static` lifetime, since it must outlive the setup function but live as long as the app.
- Setup is non-fatal: if the watcher fails to start, the app continues without real-time file monitoring. A warning is logged to stderr.
- When changes are detected, a `git-changed` Tauri event is emitted to the frontend, which triggers a branch data refresh.

### tray

The system tray module builds a dynamic context menu with entries for each registered project and its worktrees.

- Menu is rebuilt whenever git changes are detected (via the `git-changed` event listener in app setup).
- Window close is intercepted to hide the window instead of destroying it.
- Menu item IDs use a prefix-matching scheme: items starting with `worktree:` trigger session launch, `settings:` opens the settings view, `quit:` exits the app.
- Left-click on the tray icon toggles window visibility.

### fetch

Background auto-fetch runs on a dedicated thread, sleeping for `auto_fetch_interval` seconds between cycles. Each cycle iterates all registered projects and runs `git fetch` via the CLI. Setting the interval to 0 disables auto-fetch.

### notifications

Checks branch states and sends Windows toast notifications for configurable events: merge-ready branches, stale branches, and completed merges. Uses `NotificationState` to track which notifications have already been sent, preventing duplicates. State is held in a Mutex in Tauri managed state.

## Frontend Architecture

### Zustand Stores

- **branch-store** -- Holds branch data for the active project. Manages polling via `setInterval` at the configured refresh rate. Uses a module-level `fetchCounter` to prevent race conditions: each fetch increments the counter, and stale responses (where the counter has moved on) are discarded.
- **config-store** -- Holds the full AppConfig, active project selection, and settings. Provides actions for project CRUD and settings updates.
- **session-store** -- Tracks active Claude Code sessions detected by the backend. Polls periodically to refresh session state.
- **merge-store** -- Manages merge workflow state: idle, previewing, confirming, in-progress, success, or failure. Holds the MergePreview data and MergeResult.

The branch store is deliberately separate from the config store. Branch data changes frequently (every refresh cycle), while config data changes rarely. Separating them prevents unnecessary re-renders of components that only depend on config.

### Component Tree

- **DashboardHeader** -- Project selector dropdown, refresh button, add project button
- **BranchTable** -- Main data table showing all branches with status, ahead/behind counts, session indicators, and action buttons
- **BranchEmptyState** -- Shown when no branches match the prefix filter
- **NewWorktreeDialog** -- Modal for creating a new worktree branch
- **MergeDialog** -- Multi-step modal: preview (shows commits and build info), confirm, progress, result
- **MergeHistory** -- (if applicable) Shows recent merge operations
- **UpdateChecker** -- Checks for app updates on startup with a 5-second delay, non-blocking

### Key Patterns

- **DOM events for cross-component communication** -- Components dispatch custom events (`grove:new-worktree`, `grove:close-dialog`) on the document to trigger actions in unrelated components without prop drilling or store coupling.
- **Snake_case TypeScript types** -- TypeScript interfaces use snake_case field names to match Rust's serde serialization directly. This eliminates the need for runtime field name mapping between frontend and backend.
- **Module-level fetch counter** -- A counter outside the Zustand store tracks the latest fetch request. When a response arrives, it checks whether the counter has incremented since the request was made. If so, the response is stale and discarded.

## Data Flow

### Refresh Cycle

1. A `setInterval` timer fires every `refresh_interval` seconds in the branch store.
2. The store calls the `list_branches` Tauri command.
3. The Rust backend opens a fresh `Repository` for the project path, iterates branches matching the prefix, computes status for each.
4. The result is serialized and returned to the frontend.
5. The Zustand store updates, React re-renders affected components.

### File Watcher Flow

1. The `notify` watcher detects a filesystem change in a project directory.
2. The debouncer coalesces rapid changes into a single event.
3. A `git-changed` Tauri event is emitted.
4. The frontend listens for `git-changed` and triggers an immediate branch refresh.
5. The backend also rebuilds the tray menu and re-checks notification conditions.

### Merge Flow

1. User clicks merge on a branch row, opening the MergeDialog.
2. Frontend calls `merge_preview` -- backend performs an in-memory merge (no mutations) and returns commit list, build info, conflict status.
3. User reviews and confirms.
4. Frontend calls `merge_branch` -- backend executes the full atomic merge: merge commits, resolve build conflicts, bump build numbers, rename changelogs, create merge commit, checkout.
5. Result (success/failure, new build number, warnings) is returned and displayed.

## Key Design Decisions

| Decision | Rationale | Alternative Considered |
|----------|-----------|----------------------|
| git2 + CLI hybrid | git2 for local ops (fast, no subprocess). CLI for fetch (SSH agent compat on Windows). | Pure git2 (broke SSH), pure CLI (slow for status). |
| Fresh Repository per command | `git2::Repository` is not Send/Sync. Cannot store in Tauri managed state. Path string is the shared reference. | Arc-Mutex wrapper (complex, deadlock risk). |
| JSON config on disk | Simple, human-readable, no database dependency. Users can hand-edit if needed. | SQLite (overkill), TOML (less familiar for config data). |
| Snake_case TS types | Match Rust serde output directly. Zero runtime field mapping. One naming convention across the stack. | CamelCase + transform layer (extra code, potential bugs). |
| Tray-resident pattern | Window hidden by default, close = hide. Always accessible from tray. Matches user expectation for a monitoring tool. | Always-visible window (annoying for background tool). |
| Box::leak for watcher | Watcher must live as long as the app. No clean drop point in Tauri's lifecycle. Leak is intentional and bounded. | Arc + background task (more complex, same lifetime). |
| Non-fatal watcher setup | App works without file monitoring (just no real-time updates). Better than crashing on watcher errors. | Require watcher (blocks app start on error). |
| cmd.exe fallback for sessions | Windows drive letters require `cd /d` to switch drives. Direct `Command::new("claude")` fails across drives. | PowerShell (heavier, slower startup). |
