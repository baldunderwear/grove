# Research Summary: Grove

**Domain:** Windows desktop app -- git worktree manager for Claude Code sessions
**Researched:** 2026-03-27
**Overall confidence:** HIGH

## Executive Summary

Grove is a Tauri 2.x desktop app that manages git worktrees for parallel Claude Code sessions. The technology stack is well-suited: Tauri 2 is stable (released late 2024), its system tray API is mature on Windows, and the Rust ecosystem has solid crates for git operations (git2) and file watching (notify). The main architectural decision is the hybrid git approach -- use git2 for fast read operations and shell out to git CLI for worktree creation/removal where git2's API is thin.

The app should be tray-resident: always running in the system tray, with a main window that toggles on left-click. Right-click shows a quick menu of worktrees for fast access. The frontend (React + TypeScript) handles the UI; all git operations and process spawning happen in Rust via Tauri commands.

File system watching via the notify crate with debouncing provides real-time status updates without polling. The debounced events trigger git2 status checks, which emit Tauri events to the frontend. This gives sub-second feedback when files change in any watched worktree.

Process spawning (launching Claude Code, terminals, editors) is straightforward on Windows using `std::process::Command` with `CREATE_NO_WINDOW` flag and Windows Terminal (`wt.exe`) as the terminal host.

## Key Findings

**Stack:** Tauri 2.x + React 19 + TypeScript + git2 crate + notify crate. All stable, all well-documented.

**Architecture:** Tray-resident app. Rust backend handles all git/process/FS operations. Frontend is a React SPA for the management UI. IPC via Tauri commands (async, typed, Result-based error handling).

**Critical pitfall:** git2::Repository is NOT thread-safe. Must open a fresh Repository per command invocation, not share one across async Tauri commands.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Scaffold and Tray** -- Get Tauri 2 + React + TypeScript building on Windows. System tray with show/hide window toggle. This validates the build pipeline and Windows-specific setup before adding complexity.
   - Addresses: Project setup, tray icon, window management
   - Avoids: Build tool issues found late

2. **Git Core** -- Implement git2 read operations (list worktrees, status, branch info) and CLI write operations (create/remove worktree). Wire to frontend via Tauri commands.
   - Addresses: Core functionality
   - Avoids: Thread safety issues with git2 (establish the pattern early)

3. **Process Launching** -- Launch Claude Code, terminals, and editors from worktree context. Windows Terminal integration with proper directory and title arguments.
   - Addresses: The primary user workflow (open worktree -> launch Claude)
   - Avoids: Shell plugin pitfalls (use Rust-side spawning instead)

4. **File Watching and Live Status** -- notify crate watching all active worktrees, debounced events triggering git2 status refreshes, Tauri events pushing updates to frontend.
   - Addresses: Real-time feedback, the "alive" feel
   - Avoids: Polling overhead, event storms from git operations

5. **Polish and UX** -- Dynamic tray menus showing worktrees, keyboard shortcuts, settings persistence, error handling edge cases, installer/packaging.
   - Addresses: Production readiness
   - Avoids: Shipping rough edges

**Phase ordering rationale:**
- Phase 1 must come first (build pipeline validates everything else works)
- Phase 2 before 3 because you need worktrees to exist before launching sessions in them
- Phase 3 before 4 because launching Claude is the core value; watching is enhancement
- Phase 4 before 5 because live status informs what polish is needed

**Research flags for phases:**
- Phase 2: May need deeper research on git2 worktree creation API vs CLI edge cases
- Phase 4: Test notify crate behavior with large monorepos and many concurrent watchers
- Phase 5: Windows installer (NSIS vs WiX) needs investigation when reached

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Tauri 2 Setup | HIGH | Official docs comprehensive, stable release verified |
| System Tray | HIGH | Full API documented with Rust + JS examples |
| Git Operations (git2) | MEDIUM | Read ops well-documented; worktree write ops (add/remove) have API gaps, hence CLI hybrid |
| Process Spawning | HIGH | Standard Rust `std::process::Command`, well-understood |
| File Watching | HIGH | notify crate is the de facto standard, 7.x stable |
| Windows Specifics | MEDIUM | CREATE_NO_WINDOW flag, wt.exe args verified; edge cases (WSL paths, network drives) need testing |

## Gaps to Address

- **git2 worktree creation** -- The `WorktreeAddOptions` API exists but lacks documentation on branch creation + tracking. Need to test whether `git2::Repository::worktree_add()` handles the `-b` flag equivalent. If not, CLI fallback is confirmed.
- **Windows installer** -- NSIS vs WiX for distribution. Research when approaching release.
- **Auto-update** -- Tauri has an updater plugin. Not researched yet (low priority for v1).
- **Claude Code detection** -- How to reliably detect if `claude` CLI is installed and in PATH on Windows. Needs testing.
- **Multiple monitors** -- Window positioning behavior when tray icon is on a secondary monitor. Minor but worth testing.
