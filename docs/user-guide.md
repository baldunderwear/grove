# Grove User Guide

## Getting Started

### Installation

Download the latest Grove installer from the [GitHub Releases](https://github.com/baldunderwear/grove/releases) page. Run the NSIS installer (`.exe`) or MSI package. Grove installs to `Program Files` by default with a total size under 100MB.

### First Launch

After installation, launch Grove from the Start menu or desktop shortcut. The app appears in your system tray (bottom-right of the taskbar). If you do not see the icon, click the upward arrow to expand the tray overflow area.

Left-click the tray icon to open the dashboard window. The window starts hidden by default -- this is intentional. Grove is a tray-resident app designed to stay out of your way until you need it.

### Adding your first project

1. Open the dashboard (left-click the tray icon).
2. Click the **Add Project** button in the header.
3. Select your git repository folder in the file picker dialog.
4. Grove auto-detects the repository name, default branch, and available branches.
5. Configure the **merge target** (the branch worktrees merge into, typically `develop` or `main`).
6. Set the **branch prefix** to filter which branches Grove tracks (default: `wt/`).
7. Optionally configure build files and changelog settings if your project uses them.
8. Click **Add** to register the project.

Your project now appears in the dashboard header dropdown. Grove immediately scans for branches matching the prefix and displays them in the branch table.

## Dashboard

### Branch Table

The main dashboard view is a table showing all branches matching your project's prefix filter. Each row displays:

| Column | Description |
|--------|-------------|
| Branch name | The branch name with the prefix stripped for readability |
| Status | Clean (green) or dirty (yellow) working directory |
| Ahead/Behind | Commit counts relative to the merge target branch |
| Session | Indicator showing if a Claude Code session is active in this worktree |
| Actions | Buttons for launching sessions, merging, and other operations |

### Status Indicators

- **Green** -- Working directory is clean (no uncommitted changes).
- **Yellow** -- Working directory is dirty (uncommitted changes present).
- **Ahead count** -- Number of commits on this branch not yet in the merge target.
- **Behind count** -- Number of commits on the merge target not yet in this branch.
- **Stale marker** -- Branch has not had commits for an extended period.

### Refresh Behavior

Grove refreshes branch data automatically:

- **Auto-refresh** -- Every 30 seconds by default (configurable in settings).
- **Manual refresh** -- Press `Ctrl+R` or click the refresh button in the header.
- **Focus refresh** -- Switching to the Grove window triggers an immediate refresh.
- **File watcher** -- Changes detected in your project directory trigger a refresh in real time.

## Working with Worktrees

### Creating a New Worktree

1. Press `Ctrl+N` or click the **New Worktree** button in the dashboard header.
2. Enter a name for the worktree branch. Grove prepends the configured branch prefix automatically (e.g., entering `my-feature` creates `wt/my-feature`).
3. Optionally check **Launch Claude Code** to start a session immediately after creation.
4. Click **Create**. Grove creates the git worktree and branch, and the new entry appears in the branch table.

### Launching Claude Code

There are three ways to start a Claude Code session in a worktree:

- **Dashboard** -- Click the play button on any branch row in the table.
- **System tray** -- Right-click the tray icon, find the project submenu, and click the branch name.
- **New worktree dialog** -- Check the auto-launch option when creating a worktree.

Grove spawns Claude Code in the worktree's directory. On Windows, this uses `cmd /k cd /d <path>` internally to handle drive letter changes correctly.

The session indicator in the branch table updates to show which worktrees have active Claude Code processes.

### Opening in Other Tools

Each branch row also provides buttons to open the worktree directory in VS Code or Windows Explorer.

## Merging Branches

### When to Merge

A branch is ready to merge when:

- It has commits ahead of the merge target (something to merge).
- The working directory is clean (no uncommitted changes).
- It is not behind the merge target (fetch and rebase first if needed).

### Starting a Merge

Click the **merge button** on the branch row. This opens the merge dialog.

### Merge Dialog Walkthrough

The merge dialog guides you through four steps:

**Step 1: Preview** -- Grove performs an in-memory merge (no changes to your repo yet) and shows:
- List of commits that will be merged
- Current and next build numbers (if build files are configured)
- Changelog fragments that will be renamed
- Whether the merge can fast-forward
- Whether conflicts were detected

**Step 2: Confirm** -- Review the preview and click **Merge** to proceed, or **Cancel** to abort.

**Step 3: Progress** -- Grove executes the merge. This is atomic -- if anything fails, the repository is left unchanged.

**Step 4: Result** -- Shows success or failure. On success, displays the new build number and any warnings. On failure, shows the error (typically unexpected conflicts).

### Build Number Handling

If your project has build files configured, Grove handles build number conflicts automatically during merge:

1. Detects conflicts in build files (matching the configured glob patterns).
2. Takes the merge target's version of the file (discards the branch's version).
3. Bumps the build number by 1.
4. Writes the incremented value back to the file.
5. Includes the bumped file in the merge commit.

This resolves the most common merge conflict in parallel worktree workflows: multiple branches each incrementing the build number from the same base.

### Changelog Fragments

If changelog configuration is set up, Grove renames fragment files during merge. Fragments named after the branch (e.g., `worktree-my-feature.md`) are renamed to the new build number (e.g., `42.md`). This happens automatically as part of the merge commit.

### Rollback on Failure

Merge operations are atomic. If unexpected conflicts are found (in files that are not build files), Grove aborts the merge without modifying HEAD. Your repository remains in the exact state it was before the merge attempt.

## System Tray

### Tray Interactions

- **Left-click** -- Show or hide the dashboard window.
- **Right-click** -- Open the context menu.

### Context Menu

The tray context menu contains:

- **Project submenus** -- One entry per registered project, each expanding to show worktree branches. Clicking a branch launches Claude Code in that worktree.
- **Settings** -- Opens the settings page in the dashboard.
- **Quit** -- Exits Grove completely (not just hide).

### Notifications

Grove sends Windows toast notifications for configurable events:

- **Merge-ready** -- A branch has commits ahead and a clean working directory.
- **Stale branch** -- A branch has not had new commits for an extended period.
- **Merge complete** -- A merge operation finished successfully.

All notification types can be individually enabled or disabled in settings. Grove tracks which notifications have been sent to prevent duplicates.

## Settings

Access settings from the dashboard or the tray context menu.

| Setting | Default | Description |
|---------|---------|-------------|
| Refresh interval | 30 seconds | How often branch data is refreshed |
| Auto-fetch interval | 300 seconds | How often `git fetch` runs (0 to disable) |
| Start minimized | Off | Start with the window hidden (tray only) |
| Start with Windows | Off | Launch Grove automatically on login |
| Notify merge-ready | On | Toast notification when a branch is ready to merge |
| Notify stale branch | On | Toast notification for stale branches |
| Notify merge complete | On | Toast notification after successful merge |

### Export and Import

From the settings page, you can export your entire configuration to a JSON file and import it back. This is useful for backup or migrating to a new machine.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Refresh branch data |
| `Ctrl+N` | Open new worktree dialog |
| `Escape` | Close open dialog |

## Auto-Updates

Grove checks for updates on startup after a 5-second delay. If a new version is available on the [GitHub Releases](https://github.com/baldunderwear/grove/releases) page, Grove downloads and applies the update.

The update check is non-blocking and fails silently if you are offline or the GitHub endpoint is unreachable. No data is sent to any server -- the check is a simple HTTP request to the releases endpoint.
