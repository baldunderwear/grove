# External Integrations

**Analysis Date:** 2026-04-01

## APIs & External Services

**Claude Code (AI CLI):**
- Claude Code — The primary external tool Grove manages; Grove spawns `claude` as a subprocess inside PTY sessions
  - Launch path: `src-tauri/src/terminal/pty.rs` — `cmd.exe /c claude [flags]`
  - External launch (non-embedded): `src-tauri/src/process/launch.rs` — spawns via `wt.exe` or `cmd.exe`
  - No SDK; grove interacts via CLI process only
  - Auth: user's own Claude/Anthropic credentials managed externally; Grove supports per-profile `claude_config_dir` and env var overrides stored in `config.json`

**GitHub Releases (Auto-Update):**
- GitHub — Hosts app release artifacts and the update manifest
  - Endpoint: `https://github.com/baldunderwear/grove/releases/latest/download/latest.json`
  - SDK: `tauri-plugin-updater` 2.x (`src-tauri/src/lib.rs`)
  - Auth: None (public endpoint); update signature verified via minisign pubkey in `src-tauri/tauri.conf.json`
  - Direction: Outbound only (Grove polls, no webhook)

## Data Storage

**Databases:**
- None — No database used

**Configuration Storage (Local JSON):**
- File: `%APPDATA%/grove/config.json`
- Written/read by: `src-tauri/src/config/persistence.rs`
- Format: Pretty-printed JSON via `serde_json`
- Contains: registered projects, global settings, profiles, templates

**File Storage:**
- Local filesystem only
- Config directory resolved via Tauri's `app_data_dir()` API → `%APPDATA%/grove/`
- File read/write commands exposed to UI: `read_text_file`, `write_text_file`, `list_directory`, `delete_file` (`src-tauri/src/commands/`)

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None — Grove is a local desktop app with no user accounts or cloud auth
- Claude profile configs (API keys, env vars, SSH keys, launch flags) are stored locally in `%APPDATA%/grove/config.json` and passed as environment variables when spawning terminal sessions (`src-tauri/src/terminal/pty.rs`)

## Monitoring & Observability

**Error Tracking:**
- None — No external error tracking service

**Logs:**
- `eprintln!` to stderr throughout Rust backend (e.g., `src-tauri/src/fetch.rs`, `src-tauri/src/lib.rs`)
- No structured logging library; no log file persistence
- Frontend errors surfaced in Zustand store `error` fields and rendered in UI

## CI/CD & Deployment

**Hosting:**
- GitHub Releases — Binary distribution (NSIS installer + MSI)
- No server-side hosting; purely desktop app

**CI Pipeline:**
- Not detected (no `.github/workflows/` directory observed)

## External Process Integrations

**git CLI:**
- `git fetch --all --prune` — Auto-fetch background thread (`src-tauri/src/fetch.rs`)
- `git worktree list --porcelain` — Worktree counting during repo scan (`src-tauri/src/config/persistence.rs`)
- Shells out via `std::process::Command` with `CREATE_NO_WINDOW` flag to suppress console windows
- Rationale documented in code: git CLI uses user's SSH agent and credential helpers; git2 bindings are fragile for auth on Windows

**git2 (libgit2 Rust bindings):**
- Used for: repository detection, branch listing, branch status, merge preview/execution, build file conflict resolution
- Modules: `src-tauri/src/git/`
- Version: 0.20 (default-features = false — no SSH, no HTTPS via libgit2)

**Windows Terminal (`wt.exe`):**
- External launch of Claude Code sessions in new terminal tabs (`src-tauri/src/process/launch.rs`)
- Falls back to `cmd.exe` if `wt.exe` not found

**VS Code / Cursor (`code`):**
- `code <path>` launched via `std::process::Command` to open worktree in editor (`src-tauri/src/process/launch.rs`)
- Fire-and-forget; no tracking

**Windows Explorer:**
- `explorer.exe <path>` invoked via `tauri-plugin-opener` to open worktree folders

## Webhooks & Callbacks

**Incoming:**
- None — No HTTP server; no incoming webhooks

**Outgoing:**
- None — Only outbound connection is the auto-update check to GitHub Releases

## Filesystem Watching

**notify / notify-debouncer-mini:**
- Watches registered project git directories for changes (`src-tauri/src/watcher/`)
- Emits internal `git-changed` Tauri event on change
- Triggers: notification checks, tray menu rebuild, UI refresh
- Started at app launch for all registered project paths (`src-tauri/src/lib.rs`)

## Tauri Plugin Surface

All Tauri plugins used (declared in `src-tauri/src/lib.rs` and `src-tauri/capabilities/default.json`):

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-dialog` | Native OS file/folder picker dialogs |
| `tauri-plugin-opener` | Open URLs and paths in default OS handler |
| `tauri-plugin-notification` | OS desktop notifications for merge/stale branch alerts |
| `tauri-plugin-autostart` | Register app in Windows startup |
| `tauri-plugin-updater` | Auto-update from GitHub Releases |
| `tauri-plugin-process` | App restart after update |

## Environment Configuration

**Required env vars:**
- None required by Grove itself

**Optional:**
- `TAURI_DEV_HOST` — Set by Tauri CLI during dev mode; used by Vite for HMR host binding (`src-ui/vite.config.ts`)

**Secrets location:**
- No secrets in codebase
- Minisign public key for update verification stored in `src-tauri/tauri.conf.json` (public key — safe to commit)
- User's Claude API credentials managed externally; optionally referenced in Grove profiles via env var names stored in `%APPDATA%/grove/config.json`

---

*Integration audit: 2026-04-01*
