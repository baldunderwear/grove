# PROJECT.md

## Project Identity

**Grove** — A desktop worktree manager for Claude Code.

Lightweight Windows app (Tauri + React) that manages git worktrees and Claude Code sessions across multiple projects. System tray resident, always available. Replaces ad-hoc PowerShell launchers with a proper native tool.

**Tagline:** "Manage your trees."

## Problem Statement

When running multiple Claude Code sessions in parallel (via `claude --worktree`), there's no tooling for:
- Seeing which worktrees are active, their status, commits ahead/behind
- Launching new sessions without juggling terminals
- Merging worktree branches back to develop cleanly (build number collisions, changelog conflicts)
- Tracking which branches have unmerged work or are stale

The current solution (PowerShell launcher + manual merge) breaks down at scale. With 10+ worktrees active, merge conflicts on shared files (build numbers, changelogs) are constant.

## Solution

A system tray app that:
1. **Registers projects** — point it at any git repo, configure its merge rules
2. **Shows worktree status** — dashboard with all branches, commits, dirty state
3. **Launches sessions** — one click to spawn Claude Code in a worktree
4. **Merges cleanly** — preview, auto-resolve known conflicts, bump build numbers, rename changelog fragments
5. **Monitors changes** — real-time git status updates, notifications for merge-ready branches

## Target Users

- Claude Code users running multiple parallel sessions via worktrees
- Self-hosted/hobbyist developers managing complex repos with build number protocols
- Anyone who needs a visual worktree manager on Windows

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Tauri 2.x | Native Windows app, ~5MB, system tray support |
| Frontend | React 19 + TypeScript + Vite | Modern, fast, developer's existing skillset |
| Styling | Tailwind CSS | Utility-first, consistent with other projects |
| Backend | Rust (Tauri commands) | Git operations, process spawning, file watching |
| Git | git2 crate (libgit2) + CLI fallback | Programmatic access for status, CLI for complex ops |
| State | Zustand | Lightweight client state |
| Storage | JSON config files | Simple, human-readable, git-friendly |

## Constraints

- **Windows-first** — primary target is Windows 11. macOS/Linux can follow later.
- **Lightweight** — must feel instant. No Electron bloat. Sub-100MB installed.
- **Project-agnostic** — configuration defines merge rules per project, not hardcoded for any repo.
- **Non-destructive** — merge operations always preview first, never force-push, always confirm.
- **Offline** — no cloud dependencies. All operations are local git.

## Repository

- **URL:** https://github.com/baldunderwear/grove
- **License:** MIT (public/open-source)
- **Branch strategy:** main (releases), develop (active work)

## Configuration Model

Each registered project has a config like:
```json
{
  "name": "sol-lune",
  "path": "Z:/data/development/meridian",
  "merge_target": "develop",
  "branch_prefix": "worktree-",
  "build_files": [
    { "path": "src/core/config/settings.py", "pattern": "build_number: int = Field(default={N}," },
    { "path": "src/config/constants.js", "pattern": "const BUILD_NUMBER = {N}" },
    { "path": "src/package.json", "pattern": "\"buildNumber\": {N}" }
  ],
  "changelog": {
    "dir": "src/changelogs",
    "fragment_pattern": "worktree-{branch}.md",
    "build_pattern": "{N}.md"
  }
}
```

Projects without build numbers or changelogs simply omit those fields — Grove handles plain merges too.

## Current State

Phase 02 complete — Project registry with config persistence, sidebar UI, per-project config editor, global settings, and export/import. Built on Phase 01 scaffold.

Last updated: 2026-03-27
