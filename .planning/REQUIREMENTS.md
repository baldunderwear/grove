# REQUIREMENTS.md

## Grove — Worktree Manager for Claude Code

### Functional Requirements

#### FR-01: Project Registry
- FR-01.1: User can add a project by selecting a git repository path
- FR-01.2: User can remove a project from the registry
- FR-01.3: Each project stores its own configuration (merge target, branch prefix, build files, changelog settings)
- FR-01.4: Projects without build numbers or changelogs work with plain merge (no build bump)
- FR-01.5: Configuration persists across app restarts (JSON file in app data directory)
- FR-01.6: App detects if a registered project path no longer exists and shows warning

#### FR-02: Worktree Dashboard
- FR-02.1: Display all worktree branches for the selected project (matching branch prefix)
- FR-02.2: Show per-branch: name, commits ahead/behind merge target, last commit message, last commit date
- FR-02.3: Show per-branch: dirty/clean status (uncommitted changes)
- FR-02.4: Show per-branch: whether a Claude Code session is currently running in that worktree
- FR-02.5: Sort branches by activity (most recent first) with option to sort by name or commits ahead
- FR-02.6: Visual indicators: merge-ready (ahead > 0, clean), stale (no activity > 7 days), active session
- FR-02.7: Auto-refresh status on a configurable interval (default 30s)
- FR-02.8: Manual refresh button

#### FR-03: Session Launch
- FR-03.1: One-click launch of Claude Code in a worktree (`claude --worktree <name>` in new terminal)
- FR-03.2: Launch with configurable flags (e.g., `--dangerously-skip-permissions`)
- FR-03.3: Create new worktree with custom name and launch session
- FR-03.4: Track which worktrees have active Claude Code processes
- FR-03.5: Option to open worktree directory in file explorer or VS Code

#### FR-04: Merge Workflow
- FR-04.1: Preview merge: show commits to merge, changelog fragments, current/next build number
- FR-04.2: Execute merge: merge branch into target, auto-resolve build file conflicts, bump build number
- FR-04.3: Handle changelog fragments: rename `worktree-{name}.md` to `{build}.md`
- FR-04.4: Handle legacy numbered changelogs from branches that used old protocol
- FR-04.5: Detect unexpected conflicts (non-build files) and surface them to user
- FR-04.6: Confirmation dialog before executing merge
- FR-04.7: Post-merge summary: new build number, merged commits count, any warnings
- FR-04.8: Merge is local only — never pushes to remote without explicit user action

#### FR-05: System Tray
- FR-05.1: App runs as system tray icon with context menu
- FR-05.2: Tray menu: quick-launch list of recent worktrees, open dashboard, quit
- FR-05.3: Tray notifications: branch is merge-ready, branch is stale, merge completed
- FR-05.4: Left-click tray icon opens dashboard, right-click opens menu
- FR-05.5: App starts minimized to tray (configurable)
- FR-05.6: Start with Windows option

#### FR-06: Git Status Monitoring
- FR-06.1: Watch registered project directories for git changes (file system events)
- FR-06.2: Detect new worktree branches created outside the app
- FR-06.3: Detect when a worktree branch is deleted
- FR-06.4: Update dashboard in real-time when changes detected
- FR-06.5: Detect remote changes on fetch (configurable auto-fetch interval)

#### FR-07: Settings
- FR-07.1: Global settings: refresh interval, notification preferences, start with Windows, default flags
- FR-07.2: Per-project settings: merge target branch, branch prefix, build file patterns, changelog config
- FR-07.3: Theme: light/dark mode (follow system or manual)
- FR-07.4: Export/import configuration

### Non-Functional Requirements

#### NFR-01: Performance
- NFR-01.1: App launch to usable dashboard < 2 seconds
- NFR-01.2: Git status refresh < 500ms per project
- NFR-01.3: Memory usage < 100MB resident
- NFR-01.4: Installer size < 20MB

#### NFR-02: Reliability
- NFR-02.1: Merge operations are atomic — if anything fails mid-merge, state is rolled back
- NFR-02.2: App handles disconnected network paths gracefully (Z: drive unavailable)
- NFR-02.3: No data loss — configuration survives crashes

#### NFR-03: Usability
- NFR-03.1: Zero configuration needed for basic use (add project, see branches, launch sessions)
- NFR-03.2: Build number and changelog features are opt-in per project
- NFR-03.3: All destructive operations require confirmation
- NFR-03.4: Keyboard shortcuts for common actions

#### NFR-04: Distribution
- NFR-04.1: Windows MSI or NSIS installer via Tauri bundler
- NFR-04.2: GitHub Releases for distribution
- NFR-04.3: Auto-update support (Tauri updater plugin)

### Success Criteria

1. Can register sol-lune project and see all 30+ worktree branches with correct status
2. Can launch a Claude Code session from the dashboard and see it tracked as active
3. Can merge a worktree branch with build number bump and changelog rename — zero manual conflict resolution
4. App stays resident in system tray and refreshes status automatically
5. Can register a second project (e.g., a repo without build numbers) and manage it with plain merges
