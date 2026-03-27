# ROADMAP.md

## Grove v1.0 — Worktree Manager for Claude Code

### Phase 01: Project Scaffolding & Core Shell
**Goal:** Tauri 2 + React + TypeScript project with system tray, window management, and build pipeline.
**Requirements:** NFR-01.4, NFR-04.1, FR-05.1, FR-05.4, FR-05.5
**Deliverables:**
- Tauri 2 project with React 19 + Vite + TypeScript + Tailwind
- System tray icon with basic context menu (Open, Quit)
- Main window that shows/hides from tray
- Tauri bundler producing Windows installer
- CI: GitHub Actions building Windows release
**Exit criteria:** App installs on Windows, shows tray icon, opens/closes window. Build pipeline produces MSI.
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md — Scaffold Tauri 2 project + system tray with window management
- [ ] 01-02-PLAN.md — GitHub Actions CI workflow + gitignore

### Phase 02: Project Registry & Configuration
**Goal:** Users can register git repos and configure per-project merge rules.
**Requirements:** FR-01.1–FR-01.6, FR-07.1–FR-07.4
**Deliverables:**
- Add/remove project UI (directory picker)
- Per-project config editor (merge target, branch prefix, build files, changelog)
- Global settings page (refresh interval, notifications, startup, theme)
- Config persistence to JSON in app data directory
- Project health check (path exists, is git repo, has expected branches)
**Exit criteria:** Can register sol-lune with its build file patterns and a second repo without build files. Config survives restart.

### Phase 03: Git Operations Backend (Rust)
**Goal:** Rust backend for all git operations — branch listing, status, merge, build bump.
**Requirements:** FR-02.1–FR-02.3, FR-04.1–FR-04.8, FR-06.1–FR-06.4
**Deliverables:**
- Tauri commands: `list_branches`, `branch_status`, `branch_diff_preview`
- Tauri commands: `merge_branch`, `resolve_build_conflicts`, `bump_build_number`, `rename_changelog`
- Tauri commands: `git_status`, `is_worktree_dirty`
- File system watcher on registered project paths (notify crate)
- Atomic merge with rollback on failure
- Event emission to frontend on git changes
**Exit criteria:** All git operations work from Rust. Merge of a worktree branch bumps build number, renames changelog, creates commit. Rollback works if merge fails.

### Phase 04: Worktree Dashboard UI
**Goal:** Main dashboard showing all worktree branches with status, activity, and actions.
**Requirements:** FR-02.1–FR-02.8
**Deliverables:**
- Project selector (sidebar or dropdown)
- Branch list with: name, commits ahead/behind, last commit, dirty/clean badge
- Sort controls (activity, name, commits)
- Stale branch indicators (> 7 days)
- Auto-refresh with configurable interval
- Manual refresh button
- Responsive layout
**Exit criteria:** Dashboard shows all 30+ sol-lune worktree branches with correct commit counts and status. Auto-refreshes every 30s.

### Phase 05: Session Launch & Process Tracking
**Goal:** Launch Claude Code sessions from the dashboard and track active processes.
**Requirements:** FR-03.1–FR-03.5, FR-02.4, FR-02.6
**Deliverables:**
- Launch button per branch (spawns `claude --worktree <name>` in new terminal window)
- Configurable launch flags
- Create new worktree + launch flow
- Process tracking: detect active Claude Code PIDs per worktree
- Active session badge on branches
- Open in Explorer / VS Code buttons
**Exit criteria:** Can launch Claude Code from dashboard, see it marked as active, badge disappears when session ends.

### Phase 06: Merge Workflow UI
**Goal:** Full merge flow with preview, confirmation, execution, and summary.
**Requirements:** FR-04.1–FR-04.8
**Deliverables:**
- Merge button on merge-ready branches
- Preview dialog: commits to merge, changelog fragments, build number change
- Progress indicator during merge
- Conflict handler: auto-resolve build files, surface unexpected conflicts
- Post-merge summary dialog
- Merge history log
**Exit criteria:** Can merge a sol-lune worktree branch from the UI — build bumps, changelog renames, no manual conflict resolution needed.

### Phase 07: System Tray & Notifications
**Goal:** Full tray integration with quick actions and notifications.
**Requirements:** FR-05.1–FR-05.6, FR-06.5
**Deliverables:**
- Tray context menu: recent worktrees quick-launch, open dashboard, settings, quit
- Tray notifications: merge-ready branches, stale branches, merge completed
- Start with Windows (registry entry)
- Minimize to tray on close
- Auto-fetch from remote (configurable interval)
**Exit criteria:** App starts with Windows, lives in tray, notifies when a branch is merge-ready.

### Phase 08: Polish & Distribution
**Goal:** Production-ready release with installer, auto-update, and documentation.
**Requirements:** NFR-01.1–NFR-01.4, NFR-02.1–NFR-02.3, NFR-03.1–NFR-03.4, NFR-04.1–NFR-04.3
**Deliverables:**
- Performance audit: startup time, memory, refresh speed
- Keyboard shortcuts for all common actions
- Auto-update via Tauri updater plugin + GitHub Releases
- Windows installer (MSI) via CI
- README with screenshots, installation guide, configuration examples
- LICENSE (MIT)
**Exit criteria:** v1.0 release on GitHub with installer. Auto-update works. README is complete.
