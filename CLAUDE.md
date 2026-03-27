# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Identity

**Grove** ("Manage your trees.") — A lightweight Windows desktop app for managing git worktrees and Claude Code sessions. Built with Tauri 2 + React 19 + TypeScript.

## Repository

- **URL:** https://github.com/baldunderwear/grove
- **License:** MIT
- **Branch strategy:** main (releases), develop (active work)

## Common Commands

### Development
```bash
# Install frontend deps
cd src-ui && npm install

# Dev mode (launches Tauri + Vite)
cargo tauri dev

# Build release
cargo tauri build

# Frontend only (no Tauri shell)
cd src-ui && npm run dev

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

### Tauri 2 App Structure
- `src-tauri/` — Rust backend (Tauri commands, git operations, file watching, process management)
- `src-ui/` — React frontend (dashboard, settings, merge UI)
- `src-tauri/src/main.rs` — Tauri app setup, tray, window management
- `src-tauri/src/git/` — Git operations (branch listing, status, merge, build bump)
- `src-tauri/src/process/` — Claude Code process spawning and tracking
- `src-tauri/src/config/` — Project registry, settings persistence
- `src-tauri/src/watcher/` — File system monitoring for git changes

### Frontend
- React 19 + Vite + TypeScript + Tailwind CSS
- Zustand for client state
- Tauri API (`@tauri-apps/api`) for backend communication

### Configuration
- Global config: `%APPDATA%/grove/config.json`
- Per-project configs embedded in global config

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work
