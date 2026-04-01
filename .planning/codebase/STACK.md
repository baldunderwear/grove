# Technology Stack

**Analysis Date:** 2026-04-01

## Languages

**Primary:**
- TypeScript ~5.7 - All frontend UI code (`src-ui/src/`)
- Rust 1.94 (edition 2021) - All backend logic (`src-tauri/src/`)

**Secondary:**
- JavaScript (ESM) - Build tooling scripts (`scripts/with-modules.mjs`, `with-modules.mjs`)
- PowerShell - Windows launcher (`grove-launcher.ps1`, `Grove.bat`)
- CSS - Tailwind-generated styles (`src-ui/src/index.css`)

## Runtime

**Environment:**
- Node.js 24.14.0 (frontend dev/build only — not shipped)
- Rust 1.94.1 / Cargo 1.94.1 (backend compilation)
- Windows only (production) — app targets Win32 APIs explicitly

**Package Manager:**
- npm 11.9.0
- Lockfile: `src-ui/package-lock.json` (present)
- node_modules is stored outside the repo at `%USERPROFILE%/grove-src-ui/node_modules` due to NAS restrictions on Z: drive — managed via `scripts/with-modules.mjs` mirror wrapper

## Frameworks

**Core:**
- Tauri 2.x — Desktop shell; IPC bridge between React UI and Rust backend; provides window management, tray, system dialogs, auto-update
- React 19.0 — UI component framework (`src-ui/src/`)

**UI Component Library:**
- Radix UI 1.4 — Accessible headless primitives (`radix-ui`)
- shadcn/ui — Component definitions (configured via `src-ui/components.json`)
- Lucide React 1.7 — Icon set

**State Management:**
- Zustand 5.0 — All client-side state (`src-ui/src/stores/`)

**Terminal:**
- xterm.js 6.0 (`@xterm/xterm`) — In-app terminal emulator
- xterm addons: `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`
- portable-pty 0.9 (Rust) — PTY spawning for Windows; wraps `cmd.exe /c claude`

**Code Editor:**
- CodeMirror 6 via `@uiw/react-codemirror` 4.25 — In-app file editor
- `@codemirror/lang-markdown`, `@codemirror/lang-json` — Language support

**Build/Dev:**
- Vite 6.0 — Frontend bundler (`src-ui/vite.config.ts`)
- `@tailwindcss/vite` 4.0 — Tailwind CSS Vite plugin (CSS-only, no PostCSS config)
- `@vitejs/plugin-react` 4.0 — React fast refresh

## Key Dependencies

**Critical:**
- `tauri` 2.x (features: `tray-icon`) — Desktop runtime; all backend commands flow through Tauri IPC
- `git2` 0.20 (libgit2 bindings, default-features = false) — Git repo inspection, branch listing, merge operations
- `serde` 1 + `serde_json` 1 — All config serialization/deserialization
- `portable-pty` 0.9 — PTY sessions; powers embedded Claude Code terminal
- `notify` 8.2 + `notify-debouncer-mini` 0.7 — Filesystem watcher for git change events

**Infrastructure:**
- `sysinfo` 0.38 — Process detection for active Claude sessions
- `uuid` 1 (v4, serde) — IDs for projects, profiles, templates, terminal sessions
- `thiserror` 2 — Structured error types throughout Rust backend
- `windows-sys` 0.59 (Win32_System_JobObjects, Win32_Foundation, Win32_Security, Win32_System_Threading) — Windows Job Objects for process lifecycle management
- `regex` 1 — Branch pattern parsing, Claude session state detection
- `glob` 0.3 — File pattern matching for changelog detection
- `react-resizable-panels` 4.8 — Resizable UI panel layouts
- `class-variance-authority` 0.7 + `clsx` 2.1 + `tailwind-merge` 3.5 — Class composition utilities (shadcn/ui pattern)

## Configuration

**Environment:**
- No `.env` files required for development or production
- No environment variables needed by the app itself; user-configured env vars for Claude profiles are stored in `%APPDATA%/grove/config.json`
- `TAURI_DEV_HOST` — Optional; used by Vite config for remote dev (`src-ui/vite.config.ts`)

**Build:**
- `src-tauri/tauri.conf.json` — Tauri app config (window, bundle targets, updater endpoint)
- `src-ui/tsconfig.json` — TypeScript strict mode, ES2020 target, `@/*` path alias to `src/`
- `src-ui/vite.config.ts` — Vite config with React + Tailwind plugins, `@` alias
- `src-tauri/Cargo.toml` — Rust release profile: strip=true, lto=true, codegen-units=1, opt-level="s"

## Platform Requirements

**Development:**
- Windows required (Rust backend uses Win32 APIs directly)
- Node.js 24+ for frontend tooling
- Rust toolchain 1.94+
- node_modules must live on a local C: drive (not NAS/network drive) — see `scripts/with-modules.mjs`

**Production:**
- Windows desktop app distributed as NSIS installer or MSI (`src-tauri/tauri.conf.json` bundle targets)
- WebView2 bootstrapped via `downloadBootstrapper` (no bundled WebView2 — downloads on first install)
- Auto-update via GitHub Releases (`https://github.com/baldunderwear/grove/releases/latest/download/latest.json`)

---

*Stack analysis: 2026-04-01*
