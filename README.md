# Grove

**"Manage your trees."**

A lightweight Windows desktop app for managing git worktrees and Claude Code sessions. Built with Tauri 2 + React 19 + TypeScript.

![License](https://img.shields.io/github/license/baldunderwear/grove)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange)
![GitHub release](https://img.shields.io/github/v/release/baldunderwear/grove)
![GitHub Downloads](https://img.shields.io/github/downloads/baldunderwear/grove/total)

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Grove Dashboard" width="800" />
  <!-- TODO: Replace with actual screenshot or GIF of dashboard in action -->
</p>

## What is Grove?

When running multiple Claude Code sessions in parallel via git worktrees, there is no good tooling for tracking which worktrees are active, what their status is, or merging them back cleanly. With 10+ worktrees active, merge conflicts on shared files -- build numbers, changelogs -- are constant. The usual answer is PowerShell scripts and manual juggling, which breaks down at scale.

Grove is a system tray app that replaces all of that. It registers your git repositories, shows a dashboard of every worktree branch with real-time status, lets you launch Claude Code sessions with one click, and merges branches back with automatic build number bumping and changelog management. It handles the merge conflicts you would otherwise resolve by hand every single time.

The app is built on Tauri 2, so the installed size is under 20MB and the runtime footprint is around 5MB of memory. Configuration is per-project and stored as plain JSON -- no cloud dependencies, no accounts, fully offline.

## Features

### Worktree Dashboard

The dashboard shows every worktree branch for your registered projects. Each branch displays commits ahead/behind the merge target, dirty/clean status, active session indicators, and stale branch warnings. Sort by activity, name, or commit count to find what you need.

<!-- TODO: Add GIF showing worktree dashboard in action -->

### One-Click Session Launch

Launch a Claude Code session in any worktree with a single click. Or create a new worktree and launch a session in one atomic step -- no terminal juggling required. Launch flags are configurable per project.

<!-- TODO: Add GIF showing session launch in action -->

### Smart Merge

Preview all commits before merging. Grove auto-resolves build file conflicts by bumping build numbers to the next available value, renames changelog fragments to match the new build number, and performs the merge as an atomic operation. If anything fails, it rolls back cleanly.

<!-- TODO: Add GIF showing smart merge workflow in action -->

### System Tray

Grove lives in your system tray and runs in the background. Left-click the tray icon to open the dashboard. Right-click for a quick-launch menu that lists your worktrees directly -- no need to open the full window for common operations.

<!-- TODO: Add GIF showing system tray interaction in action -->

### Notifications

Get desktop notifications when a branch is merge-ready (ahead of target, no conflicts) or when a branch has gone stale (no commits in a configurable period). Notifications are configurable per-project and can be disabled entirely.

<!-- TODO: Add GIF showing notification examples in action -->

### Auto-Fetch

Grove fetches from remotes in the background at a configurable interval (default: every 5 minutes). It is compatible with SSH agents and credential helpers, so you do not need to store credentials in Grove.

<!-- TODO: Add GIF showing auto-fetch status in action -->

### Keyboard Shortcuts

| Shortcut     | Action              |
| ------------ | ------------------- |
| Ctrl+R / F5  | Refresh branches    |
| Ctrl+N       | New worktree dialog |
| Ctrl+,       | Open settings       |
| Escape       | Close dialog        |

### Auto-Update

Grove checks for updates via GitHub Releases using the Tauri updater plugin. When a new version is available, you get a prompt to install it -- no manual downloads needed.

## Installation

> **Requirements:** Windows 10 or Windows 11. WebView2 runtime (the installer downloads it automatically if missing). No other dependencies.

1. Download the latest installer from [GitHub Releases](https://github.com/baldunderwear/grove/releases)
2. Run the NSIS installer (`.exe`) -- it will download WebView2 if needed
3. Grove starts in the system tray

Installer size is under 20MB. Installed size is under 20MB.

## Quick Start

1. **Click the tray icon** to open the dashboard. You will see an empty project list on first launch.

2. **Click "Add Project"** and select a git repository. Grove auto-detects the default branch and existing worktrees.

3. **Configure your project** -- set the branch prefix (e.g., `wt/`) and merge target (e.g., `main` or `develop`). Optionally configure build files and changelog settings. You will see the settings panel with all detected branches.

4. **Start working** -- your worktree branches appear in the dashboard with live status. Launch Claude Code sessions, create new worktrees, and merge when ready.

## Configuration Overview

Grove stores configuration at `%APPDATA%/com.grove.app/config.json`. Here is a full example with two projects -- one with build files and changelogs, one plain:

```json
{
  "version": 1,
  "projects": [
    {
      "id": "a1b2c3d4",
      "name": "sol-lune",
      "path": "Z:/data/development/meridian",
      "merge_target": "develop",
      "branch_prefix": "wt/",
      "build_files": [
        { "pattern": "src/core/config/settings.py" },
        { "pattern": "src/package.json" }
      ],
      "changelog": {
        "directory": "docs/changelog",
        "fragment_pattern": "worktree-{name}.md"
      }
    },
    {
      "id": "e5f6g7h8",
      "name": "grove",
      "path": "Z:/data/development/grove",
      "merge_target": "main",
      "branch_prefix": "wt/"
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

For the full configuration reference, see [Configuration Reference](docs/configuration.md).

## Documentation

- [Architecture Deep-Dive](docs/architecture.md) -- Backend and frontend structure, data flow, key design decisions
- [User Guide](docs/user-guide.md) -- Detailed walkthrough of all features
- [Configuration Reference](docs/configuration.md) -- Every config field, defaults, and examples
- [Troubleshooting](docs/troubleshooting.md) -- Common issues and solutions

## Development

### Architecture at a Glance

```
grove/
+-- src-tauri/               Rust backend (Tauri 2)
|   +-- src/main.rs          App setup, tray, window management
|   +-- src/git/             Git operations (git2 + CLI fallback)
|   +-- src/process/         Claude Code process spawning
|   +-- src/config/          Project registry, settings persistence
|   +-- src/watcher/         File system monitoring
|
+-- src-ui/                  React frontend (React 19 + Vite)
|   +-- src/stores/          Zustand stores (branches, config, sessions, merge)
|   +-- src/components/      UI components (dashboard, settings, merge)
|
+-- docs/                    Documentation
+-- scripts/                 Build and dev helper scripts
```

**Backend:** Tauri 2 commands in Rust. Git operations use the `git2` crate for local work and git CLI for fetch (SSH agent compatibility).

**Frontend:** React 19 + TypeScript + Tailwind CSS. Zustand for state management. Tauri API for backend communication.

For a detailed architecture walkthrough, see [Architecture Deep-Dive](docs/architecture.md). To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

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

## License

MIT -- see [LICENSE](LICENSE)

## Acknowledgments

Grove is built on [Tauri 2](https://tauri.app/), [React 19](https://react.dev/), and the [git2](https://github.com/rust-lang/git2-rs) crate. Development was assisted by [Claude Code](https://claude.ai/).
