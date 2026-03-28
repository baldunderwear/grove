---
phase: quick-260328-fq4
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/architecture.md
  - docs/user-guide.md
  - docs/configuration.md
  - docs/troubleshooting.md
autonomous: true
requirements: [DOC-DEEP]
must_haves:
  truths:
    - "Architecture doc explains Tauri command bridge, git module design, and state management"
    - "User guide walks through complete workflows from install to merge"
    - "Configuration reference documents every field with types, defaults, and examples"
    - "Troubleshooting covers common issues with concrete solutions"
  artifacts:
    - path: "docs/architecture.md"
      provides: "Architecture deep-dive"
      contains: "Tauri"
    - path: "docs/user-guide.md"
      provides: "End-user guide"
      contains: "worktree"
    - path: "docs/configuration.md"
      provides: "Config reference"
      contains: "refresh_interval"
    - path: "docs/troubleshooting.md"
      provides: "Troubleshooting guide"
      contains: "Solution"
  key_links:
    - from: "docs/configuration.md"
      to: "src-tauri/src/config/models.rs"
      via: "documents same fields"
      pattern: "refresh_interval|merge_target|branch_prefix"
---

<objective>
Create the docs/ folder with four documentation files: architecture deep-dive, user guide, configuration reference, and troubleshooting guide.

Purpose: Provide comprehensive documentation for users and contributors beyond what the README covers.
Output: docs/architecture.md, docs/user-guide.md, docs/configuration.md, docs/troubleshooting.md
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@README.md
@CLAUDE.md
@src-tauri/tauri.conf.json
@src-tauri/src/config/models.rs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create docs/architecture.md and docs/user-guide.md</name>
  <files>docs/architecture.md, docs/user-guide.md</files>
  <read_first>src-tauri/src/config/models.rs, .planning/PROJECT.md, CLAUDE.md, src-tauri/tauri.conf.json</read_first>
  <action>
Create the `docs/` directory if it doesn't exist.

FILE 1: docs/architecture.md -- Architecture Deep-Dive (target: 150-250 lines):

1. **Title**: "Grove Architecture"

2. **Overview** -- High-level description: Tauri 2 app with Rust backend and React frontend communicating via Tauri's IPC command bridge. System tray resident, window hidden by default.

3. **System Diagram** -- ASCII art showing the layers. Use plus/minus/pipe characters (+, -, |) for box drawing, NOT Unicode box-drawing characters. Show: System Tray at top, React Frontend layer (Zustand Stores + Components), Tauri IPC bridge, Rust Backend layer (git/, config/, process/, watcher/, tray module).

4. **Backend Modules** section with subsections:
   - **git/** -- Branch listing via git2 Repository. Status checks per-worktree (separate Repository instance). Merge operations with build number auto-resolution. CLI fallback for fetch (SSH agent compat). Explain the key design choice: Repository opened fresh per-command, path string is the shared state (not the Repository object, which isn't Send/Sync).
   - **config/** -- AppConfig model (describe fields from models.rs). JSON persistence to %APPDATA%. Mutex write lock pattern. Health checks (PathNotFound, NotGitRepo, MissingMergeTarget). Export/import support.
   - **process/** -- Claude Code spawning via std::process::Command. Session tracking. cmd.exe fallback with `cmd /k cd /d` for Windows drive handling.
   - **watcher/** -- notify crate with debouncer for file system events. Box::leak for watcher lifetime. Non-fatal setup (app works without watcher). Events emitted to frontend via Tauri events.
   - **tray** -- System tray with dynamic menu rebuilt on changes. Window close intercepted to hide (not quit). ID prefix matching for worktree menu items.

5. **Frontend Architecture** section:
   - Zustand stores: branch-store (branch data, polling), config-store (projects, settings), session-store (active Claude sessions), merge-store (merge workflow state)
   - Component tree: DashboardHeader, BranchTable, BranchEmptyState, NewWorktreeDialog, MergeDialog, MergeHistory, UpdateChecker
   - Key patterns: module-level fetchCounter for race conditions, separate branch store to prevent re-renders, DOM events for cross-component communication (grove:new-worktree, grove:close-dialog)

6. **Data Flow** section -- explain the refresh cycle: timer triggers fetchBranches -> Tauri command -> git2 reads -> Zustand update -> React re-render. Also: file watcher -> Tauri event -> frontend event listener -> refresh.

7. **Key Design Decisions** -- table with Decision, Rationale, Alternative Considered:
   - git2 + CLI hybrid (git2 for local, CLI for fetch -- SSH agent)
   - Fresh Repository per command (Send/Sync constraints)
   - JSON config on disk (simplicity, human-readable, no DB dependency)
   - Snake_case TS types (match Rust serde, no runtime mapping)
   - Tray-resident pattern (window hidden by default, close = hide)

FILE 2: docs/user-guide.md -- User Guide (target: 150-200 lines):

1. **Title**: "Grove User Guide"

2. **Getting Started**:
   - Installation (download from GitHub Releases, run NSIS installer)
   - First launch (appears in system tray, left-click to open)
   - Adding your first project (Add Project button, select repo folder, auto-detection of name and branches)

3. **Dashboard**:
   - Understanding the branch table (columns: branch name, status, commits ahead/behind, session indicator, actions)
   - Status indicators: green = clean, yellow = dirty, indicators for ahead/behind count, stale marker
   - Sorting options
   - Refresh behavior (auto-refresh every 30s default, Ctrl+R manual, window focus triggers refresh)

4. **Working with Worktrees**:
   - Creating a new worktree (Ctrl+N or button, enter name, optional auto-launch)
   - Launching Claude Code (play button on branch row, or from tray menu)
   - Configurable launch flags in settings

5. **Merging Branches**:
   - When to merge (branch shows commits ahead, no dirty files)
   - Starting a merge (merge button on branch row)
   - Merge dialog walkthrough: preview step (see commits), confirm step, progress, success/failure
   - Build number handling: Grove auto-detects build file conflicts, takes target version, bumps by 1
   - Changelog fragments: renamed from branch name to build number
   - Rollback on failure (atomic merge operations)

6. **System Tray**:
   - Left-click: show/hide dashboard
   - Right-click: menu with worktree quick-launch, settings, quit
   - Notifications: merge-ready, stale branch (configurable in settings)

7. **Settings**:
   - Refresh interval
   - Auto-fetch (interval, or 0 to disable)
   - Notifications (merge-ready, stale, merge-complete)
   - Start minimized / start with Windows
   - Export/import configuration

8. **Keyboard Shortcuts** -- same table as README.

9. **Auto-Updates**:
   - Grove checks for updates on startup (5-second delay)
   - Downloads from GitHub Releases
   - Non-blocking (silent failure if offline)

No emojis. Direct, practical language. Use "you" for the reader.
  </action>
  <verify>
    <automated>test -f docs/architecture.md && test -f docs/user-guide.md && grep -q "Tauri IPC" docs/architecture.md && grep -q "Zustand" docs/architecture.md && grep -q "Adding your first project" docs/user-guide.md && grep -q "Merging Branches" docs/user-guide.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - docs/architecture.md exists, is 150+ lines
    - grep "Tauri IPC" docs/architecture.md finds the system diagram
    - grep "git2" docs/architecture.md finds git module description
    - grep "Zustand" docs/architecture.md finds frontend architecture section
    - grep "Design Decisions" docs/architecture.md finds decision table
    - docs/user-guide.md exists, is 150+ lines
    - grep "worktree" docs/user-guide.md finds worktree workflow sections
    - grep "Merge" docs/user-guide.md finds merge workflow section
    - grep "System Tray" docs/user-guide.md finds tray section
    - No emojis in either file
  </acceptance_criteria>
  <done>Architecture deep-dive covers all backend modules, frontend architecture, data flow, and design decisions. User guide walks through all workflows from install to merge.</done>
</task>

<task type="auto">
  <name>Task 2: Create docs/configuration.md and docs/troubleshooting.md</name>
  <files>docs/configuration.md, docs/troubleshooting.md</files>
  <read_first>src-tauri/src/config/models.rs, .planning/PROJECT.md</read_first>
  <action>
FILE 1: docs/configuration.md -- Configuration Reference (target: 150-200 lines):

1. **Title**: "Grove Configuration Reference"

2. **Overview**: Config stored at `%APPDATA%/grove/config.json`. Single JSON file, human-readable, can be edited manually (restart Grove to pick up changes). Export/import available from Settings page.

3. **Full Example** -- Complete config.json showing all fields:
   ```json
   {
     "version": 1,
     "projects": [
       {
         "id": "uuid-here",
         "name": "my-project",
         "path": "C:/dev/my-project",
         "merge_target": "develop",
         "branch_prefix": "wt/",
         "build_files": [
           { "pattern": "src/version.py" }
         ],
         "changelog": {
           "directory": "docs/changelog",
           "fragment_pattern": "worktree-{name}.md"
         }
       },
       {
         "id": "uuid-here-2",
         "name": "simple-project",
         "path": "C:/dev/simple-project",
         "merge_target": "main",
         "branch_prefix": "feature/"
       }
     ],
     "settings": {
       "refresh_interval": 30,
       "start_minimized": false,
       "start_with_windows": false,
       "theme": "dark",
       "auto_fetch_interval": 300,
       "notify_merge_ready": true,
       "notify_stale_branch": true,
       "notify_merge_complete": true
     }
   }
   ```

4. **Top-Level Fields** table:
   | Field | Type | Default | Description |
   | version | number | 1 | Config schema version |
   | projects | array | [] | Registered projects |
   | settings | object | (see below) | Global settings |

5. **Project Configuration** section -- table for ProjectConfig fields:
   | Field | Type | Required | Default | Description |
   | id | string | yes | (auto-generated UUID) | Unique project identifier |
   | name | string | yes | (auto-detected from repo) | Display name |
   | path | string | yes | -- | Absolute path to git repository root |
   | merge_target | string | yes | (auto-detected) | Branch to merge worktrees into |
   | branch_prefix | string | no | "wt/" | Prefix filter for worktree branches |
   | build_files | array | no | [] | Files containing build numbers |
   | changelog | object | no | null | Changelog fragment config |

6. **Build Files** section -- explain BuildFileConfig:
   - `pattern` (string): Glob pattern matching files that contain build numbers
   - How it works: During merge, if these files have conflicts, Grove takes the target branch version and bumps the build number by 1
   - Example scenarios: Python settings, JS constants, package.json buildNumber

7. **Changelog Configuration** section -- explain ChangelogConfig:
   | Field | Type | Default | Description |
   | directory | string | "docs/changelog" | Path to changelog fragments directory |
   | fragment_pattern | string | "worktree-{name}.md" | Naming pattern for branch fragments |
   - How it works: During merge, fragment files are renamed from branch-name format to build-number format

8. **Global Settings** section -- table for Settings fields:
   | Field | Type | Default | Description |
   | refresh_interval | number | 30 | Seconds between branch status refreshes |
   | start_minimized | boolean | false | Start with window hidden (tray only) |
   | start_with_windows | boolean | false | Launch Grove on Windows startup |
   | theme | string | "dark" | UI theme (currently only "dark") |
   | auto_fetch_interval | number | 300 | Seconds between remote fetches (0=disabled, min 60, max 3600) |
   | notify_merge_ready | boolean | true | Notify when a branch is ready to merge |
   | notify_stale_branch | boolean | true | Notify when a branch becomes stale |
   | notify_merge_complete | boolean | true | Notify when a merge completes |

9. **Health Checks** section -- explain the 4 health states:
   - Healthy, PathNotFound, NotGitRepo, MissingMergeTarget

10. **Tips** section:
   - Projects without build numbers: just omit build_files
   - Projects without changelogs: omit changelog
   - Manual editing: edit config.json directly, restart Grove
   - Backup: export from Settings page before major changes

FILE 2: docs/troubleshooting.md -- Troubleshooting Guide (target: 100-150 lines):

1. **Title**: "Troubleshooting Grove"

2. Use a consistent format for each issue:
   ### Problem: [description]
   **Symptoms:** what you see
   **Cause:** why it happens
   **Solution:** how to fix it

3. Cover these 9 issues:

   a. **Grove doesn't start / window doesn't appear** -- tray-resident app, look in system tray overflow
   b. **Branches not showing up** -- branch_prefix filter mismatch
   c. **Path not found health indicator** -- repo path moved/renamed/disconnected
   d. **Merge fails with conflicts** -- conflicts in non-build files, merge manually
   e. **Claude Code doesn't launch** -- claude not in PATH, or worktree dir missing
   f. **Auto-fetch not working** -- interval=0 or SSH key not loaded
   g. **Notifications not appearing** -- disabled in settings or Windows blocking
   h. **Config file corrupted** -- invalid JSON from manual edit, delete to reset
   i. **High CPU usage** -- low refresh interval with many projects

4. **Getting Help** section -- link to https://github.com/baldunderwear/grove/issues with info to include

5. **Log Locations** section -- config path and note about no dedicated log file

No emojis. Direct language. Every problem has a concrete solution.
  </action>
  <verify>
    <automated>test -f docs/configuration.md && test -f docs/troubleshooting.md && grep -q "refresh_interval" docs/configuration.md && grep -q "merge_target" docs/configuration.md && grep -q "auto_fetch_interval" docs/configuration.md && grep -c "Solution" docs/troubleshooting.md | grep -q "[5-9]\|[1-9][0-9]" && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - docs/configuration.md exists, is 150+ lines
    - grep "refresh_interval" docs/configuration.md finds settings documentation
    - grep "merge_target" docs/configuration.md finds project config fields
    - grep "build_files" docs/configuration.md finds build file documentation
    - grep "changelog" docs/configuration.md finds changelog config section
    - grep "auto_fetch_interval" docs/configuration.md finds fetch interval docs
    - docs/troubleshooting.md exists, is 100+ lines
    - grep -c "Solution" docs/troubleshooting.md returns 5 or more
    - grep "github.com/baldunderwear/grove/issues" docs/troubleshooting.md finds help link
    - No emojis in either file
  </acceptance_criteria>
  <done>Configuration reference documents every field from models.rs with types, defaults, and examples. Troubleshooting covers 9 common issues with symptoms, causes, and solutions.</done>
</task>

</tasks>

<verification>
- All 4 docs/ files exist
- Architecture doc covers backend modules, frontend, data flow, design decisions
- User guide walks through install, dashboard, worktrees, merge, tray, settings
- Configuration reference matches every field in models.rs
- Troubleshooting has 9+ issues with concrete solutions
- No emojis in any file
</verification>

<success_criteria>
Four docs/ files created covering architecture, usage, configuration, and troubleshooting. Configuration fields match the Rust models exactly. All content is direct, practical, and emoji-free.
</success_criteria>

<output>
After completion, create `.planning/quick/260328-fq4-pimp-docs/quick-02-SUMMARY.md`
</output>
