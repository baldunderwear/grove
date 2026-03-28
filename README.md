# Grove

**"Manage your trees."**

A lightweight Windows desktop app for managing git worktrees and Claude Code sessions. Built with Tauri 2 + React 19 + TypeScript.

Grove lives in your system tray and gives you a dashboard for all your worktree branches -- launch Claude Code sessions, track active processes, merge branches with automatic build number bumping and changelog management.

## Features

- **Worktree Dashboard** -- See all branches with status: commits ahead/behind, dirty/clean, active sessions, stale indicators. Sort by activity, name, or commit count.
- **Session Launch** -- One-click Claude Code launch per worktree. Create a new worktree and launch a session in one step. Configurable launch flags.
- **Smart Merge** -- Preview commits before merging. Auto-resolve build file conflicts, bump build numbers, rename changelog fragments. Atomic operations with rollback on failure.
- **System Tray** -- Background operation with quick-launch worktrees from the tray menu. Left-click opens dashboard, right-click opens menu.
- **Notifications** -- Get notified when branches are merge-ready or stale. Configurable per-project.
- **Auto-Fetch** -- Configurable background fetch from remotes (SSH agent and credential helper compatible).
- **Keyboard Shortcuts** -- Ctrl+R / F5 refresh, Ctrl+N new worktree, Ctrl+, settings, Escape close dialog.
- **Auto-Update** -- Automatic update checking via GitHub Releases with the Tauri updater plugin.
- **Project-Agnostic** -- Per-project configuration for merge rules, build files, and changelogs. Projects without build numbers work with plain merges.

## Installation

1. Download the latest installer from [GitHub Releases](https://github.com/baldunderwear/grove/releases)
2. Run the NSIS installer (`.exe`) -- it will download WebView2 if needed
3. Grove starts in the system tray

Requires Windows 10/11. Installer size is under 20MB.

## Quick Start

1. Click the tray icon to open the dashboard
2. Click **Add Project** and select a git repository
3. Configure the branch prefix (e.g., `wt/`) and merge target (e.g., `main` or `develop`)
4. See all worktree branches, launch Claude Code sessions, merge when ready

## Configuration

**Per-project settings:**
- Merge target branch
- Branch prefix filter
- Build file patterns (path + regex for build number extraction)
- Changelog directory and fragment naming

**Global settings:**
- Refresh interval (default 30s)
- Notification preferences
- Auto-start with Windows
- Auto-fetch interval (60s--3600s, or 0 to disable)
- Theme (follows system)

**Storage:** Config is stored in `%APPDATA%/grove/config.json`. You can export and import configuration from the Settings page.

## Keyboard Shortcuts

| Shortcut     | Action              |
| ------------ | ------------------- |
| Ctrl+R / F5  | Refresh branches    |
| Ctrl+N       | New worktree dialog |
| Ctrl+,       | Open settings       |
| Escape       | Close dialog        |

## Screenshots

> Screenshots will be added before the v1.0 release.

![Dashboard](docs/screenshots/dashboard.png)
![Merge Dialog](docs/screenshots/merge-dialog.png)

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) (stable)
- Git

### Setup

```bash
# Install frontend dependencies
cd src-ui && npm install

# Dev mode (launches Tauri + Vite)
cargo tauri dev

# Build release
cargo tauri build

# TypeScript check
cd src-ui && npm run typecheck

# Lint
cd src-ui && npm run lint
```

### Rust Backend

```bash
# Check
cargo check

# Test
cargo test

# Clippy
cargo clippy
```

## Architecture

```
src-tauri/          Rust backend
  src/main.rs       App setup, tray, window management
  src/git/          Git operations (git2 crate + CLI fallback)
  src/process/      Claude Code process spawning and tracking
  src/config/       Project registry, settings persistence
  src/watcher/      File system monitoring for git changes

src-ui/             React frontend
  src/stores/       Zustand stores (branches, config, sessions, merge)
  src/components/   UI components (dashboard, settings, merge dialog)
```

- **Backend:** Tauri 2 commands in Rust. Git operations use the `git2` crate for local work and git CLI for fetch (SSH agent compatibility).
- **Frontend:** React 19 + TypeScript + Tailwind CSS. Zustand for state management. Tauri API for backend communication.
- **State:** Zustand stores for branches, config, sessions, and merge. Backend config persists to JSON on disk.
- **Git:** `git2` for branch listing, status, and merge. CLI fallback for fetch and complex operations.

## License

MIT -- see [LICENSE](LICENSE)
