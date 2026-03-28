# Contributing to Grove

Contributions are welcome. Grove is a focused tool -- a worktree manager for Claude Code sessions on Windows -- so changes should align with that scope.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) (stable toolchain)
- Git
- Windows 10 or Windows 11

### Getting Started

```bash
# Clone the repository
git clone https://github.com/baldunderwear/grove.git
cd grove

# Install frontend dependencies
cd src-ui && npm install
cd ..

# Launch in dev mode (Tauri + Vite hot-reload)
cargo tauri dev
```

The dev server starts at `http://localhost:5173` and the Tauri window opens automatically.

### NAS Users

If your working directory is on a network drive, `node_modules` symlinks may not work. Use the junction workaround:

```bash
node scripts/with-modules.mjs
```

This creates a local junction for `node_modules` so npm operates on a local path.

## Project Structure

```
grove/
+-- src-tauri/               # Rust backend (Tauri 2)
|   +-- src/main.rs          # App setup, tray, window management
|   +-- src/git/             # Git operations (git2 + CLI fallback)
|   +-- src/process/         # Claude Code process spawning
|   +-- src/config/          # Project registry, settings
|   +-- src/watcher/         # File system monitoring
+-- src-ui/                  # React frontend
|   +-- src/stores/          # Zustand state (branches, config, sessions, merge)
|   +-- src/components/      # UI components (dashboard, settings, merge)
+-- docs/                    # Documentation
+-- scripts/                 # Build and dev helper scripts
```

## Code Style

### Rust

- Run `cargo clippy` before committing -- no warnings allowed
- Run `cargo test` to verify nothing is broken
- Follow standard Rust naming conventions

### TypeScript

- Run `npm run typecheck` from `src-ui/` before committing
- Run `npm run lint` from `src-ui/` -- fix all warnings
- TypeScript types use `snake_case` field names to match Rust serde serialization
- Use Tailwind CSS for all styling -- no inline styles, no CSS modules

## Making Changes

1. Fork the repository and create a feature branch from `develop`
2. Keep commits focused and descriptive
3. Run the full check suite before opening a PR:

```bash
# Rust checks
cargo clippy && cargo test

# Frontend checks
cd src-ui && npm run typecheck && npm run lint
```

4. Push your branch and open a pull request

## Pull Request Process

- Target the `develop` branch (not `main` -- main is for releases only)
- Describe what changed and why in the PR description
- Include screenshots for any UI changes
- PRs should pass CI checks (tauri-action builds for Windows)
- Keep PRs focused -- one feature or fix per PR

## Architecture Notes

For a full deep-dive, see [docs/architecture.md](docs/architecture.md). Key patterns to know:

- **Tauri commands** are the bridge between the React frontend and the Rust backend. All IPC goes through `invoke()` calls.
- **git2** handles local git operations (branch listing, status, merge). Git CLI is used for fetch and complex operations because it supports SSH agents natively.
- **Zustand stores** are the frontend state layer. There are separate stores for branches, config, sessions, and merge state.
- **Config persistence** is JSON on disk (`%APPDATA%/com.grove.app/config.json`). The backend config module is the single source of truth -- the frontend reads and writes through Tauri commands.

## License

By contributing to Grove, you agree that your contributions will be licensed under the MIT License.
