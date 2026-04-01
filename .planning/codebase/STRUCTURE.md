# Codebase Structure

**Analysis Date:** 2026-04-01

## Directory Layout

```
grove/                          # Repo root
├── src-tauri/                  # Rust backend (Tauri app host)
│   ├── src/
│   │   ├── main.rs             # Binary entry point (calls lib::run())
│   │   ├── lib.rs              # App setup: commands, state, tray, watchers, listeners
│   │   ├── tray.rs             # System tray icon, menu, event handlers
│   │   ├── fetch.rs            # Background auto-fetch thread
│   │   ├── notifications.rs    # Branch notification logic
│   │   ├── commands/           # Tauri #[tauri::command] handlers
│   │   │   ├── mod.rs
│   │   │   ├── config_commands.rs
│   │   │   ├── git_commands.rs
│   │   │   ├── session_commands.rs
│   │   │   └── file_commands.rs
│   │   ├── config/             # App config model + JSON persistence
│   │   │   ├── mod.rs
│   │   │   ├── models.rs       # AppConfig, ProjectConfig, Profile, PromptTemplate
│   │   │   └── persistence.rs  # load/save/detect helpers
│   │   ├── git/                # Git operations
│   │   │   ├── mod.rs
│   │   │   ├── branches.rs     # Worktree branch listing
│   │   │   ├── merge.rs        # Merge preview + execution (git2)
│   │   │   ├── build.rs        # Build number bumping
│   │   │   ├── changelog.rs    # Changelog fragment management
│   │   │   ├── status.rs       # Worktree dirty detection
│   │   │   └── error.rs        # GitError enum
│   │   ├── terminal/           # PTY management + session state detection
│   │   │   ├── mod.rs          # TerminalManager, TerminalSession, TerminalEvent
│   │   │   ├── commands.rs     # Tauri terminal commands
│   │   │   ├── pty.rs          # PTY spawn (portable_pty + cmd.exe /c claude)
│   │   │   ├── state_parser.rs # Regex-based Claude state detection
│   │   │   ├── history.rs      # Session state transition history
│   │   │   └── job_object.rs   # Windows Job Object for process tree cleanup
│   │   ├── process/            # External Claude session detection
│   │   │   ├── mod.rs
│   │   │   ├── detect.rs       # SessionDetector (OS process scan)
│   │   │   └── launch.rs       # Launch helpers
│   │   ├── watcher/            # Filesystem watcher for git changes
│   │   │   └── mod.rs          # notify + PollWatcher fallback
│   │   └── utils/
│   │       ├── mod.rs
│   │       └── paths.rs        # UNC path resolution, drive mapping
│   ├── capabilities/           # Tauri permission declarations
│   ├── icons/                  # App icons (png, ico)
│   ├── Cargo.toml
│   └── tauri.conf.json         # Tauri app config (window, bundle, updater)
│
├── src-ui/                     # React frontend
│   ├── src/
│   │   ├── main.tsx            # React DOM entry point
│   │   ├── App.tsx             # Root component: view routing + tray event listeners
│   │   ├── index.css           # Global styles + CSS custom properties (Grove theme vars)
│   │   ├── vite-env.d.ts
│   │   ├── pages/              # Top-level views (one per activeView value)
│   │   │   ├── Dashboard.tsx   # Main worktree management view
│   │   │   ├── AllProjects.tsx # Multi-project selector
│   │   │   ├── ProjectConfig.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── ConfigEditors.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── components/         # UI components organized by domain
│   │   │   ├── session/
│   │   │   │   ├── SessionManager.tsx  # Tab orchestrator + TerminalInstance mount
│   │   │   │   └── SessionCard.tsx     # Per-session status card
│   │   │   ├── terminal/
│   │   │   │   ├── TerminalPanel.tsx   # xterm.js viewport + tab switcher
│   │   │   │   ├── TerminalTabBar.tsx  # Tab bar with close buttons
│   │   │   │   └── SessionHistoryPanel.tsx
│   │   │   ├── launch/
│   │   │   │   ├── LaunchDialog.tsx    # Single-session launch with prompt/context
│   │   │   │   ├── BatchLaunchDialog.tsx
│   │   │   │   ├── ContextFilePicker.tsx
│   │   │   │   └── TemplateManager.tsx
│   │   │   ├── config/
│   │   │   │   ├── ProfileEditor.tsx
│   │   │   │   ├── ProfileSelector.tsx
│   │   │   │   ├── SettingsJsonEditor.tsx
│   │   │   │   ├── SkillsBrowser.tsx
│   │   │   │   ├── ClaudeMdEditor.tsx
│   │   │   │   ├── MergedPreview.tsx
│   │   │   │   └── EditorTheme.ts
│   │   │   ├── ui/             # shadcn/ui primitives (button, dialog, etc.)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── resizable.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   └── [10 more primitive components]
│   │   │   ├── AddProjectWizard.tsx
│   │   │   ├── BranchTable.tsx     # Worktree branch list with status columns
│   │   │   ├── DashboardHeader.tsx
│   │   │   ├── MergeDialog.tsx
│   │   │   ├── MergeHistory.tsx
│   │   │   ├── NewWorktreeDialog.tsx
│   │   │   ├── BranchEmptyState.tsx
│   │   │   └── UpdateChecker.tsx
│   │   ├── stores/             # Zustand state stores
│   │   │   ├── config-store.ts     # App config + navigation state
│   │   │   ├── branch-store.ts     # Branch list + sort/refresh state
│   │   │   ├── terminal-store.ts   # Terminal tab map + session states
│   │   │   ├── merge-store.ts      # Merge preview/execution state
│   │   │   └── session-store.ts    # Active external sessions
│   │   ├── hooks/
│   │   │   ├── useTerminal.ts      # xterm.js lifecycle + WebGL addon
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   └── useFileEditor.ts
│   │   ├── layout/
│   │   │   └── Sidebar.tsx         # Project list + navigation
│   │   ├── lib/
│   │   │   ├── utils.ts            # cn() class merging helper
│   │   │   └── alerts.ts           # Waiting alert logic
│   │   └── types/
│   │       ├── config.ts           # TypeScript mirrors of Rust config models
│   │       ├── branch.ts           # BranchInfo
│   │       ├── merge.ts
│   │       └── session.ts
│   ├── components.json         # shadcn/ui configuration
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
│
├── docs/                       # Developer documentation
├── grove-brand/                # Brand assets
├── scripts/                    # Build/utility scripts
├── .github/                    # CI/CD workflows
├── .planning/                  # GSD planning files (not shipped)
├── CLAUDE.md                   # AI assistant instructions
├── Grove.bat                   # Windows launch shortcut
├── grove-launcher.ps1          # PowerShell launcher
├── Cargo.lock                  # Rust dependency lockfile (root-level)
└── README.md
```

## Directory Purposes

**`src-tauri/src/commands/`:**
- Purpose: Thin Tauri command handlers — parse IPC arguments, call domain modules, return serializable results
- Contains: One file per domain (`config_commands.rs`, `git_commands.rs`, `session_commands.rs`, `file_commands.rs`)
- Key files: `config_commands.rs` (13 commands), `git_commands.rs` (6 commands)

**`src-tauri/src/git/`:**
- Purpose: All git business logic
- Contains: CLI-based worktree listing (NAS-safe), `git2`-based merge operations, build number bumping, changelog fragment management
- Key files: `branches.rs` (branch + worktree data), `merge.rs` (merge preview + execution)

**`src-tauri/src/terminal/`:**
- Purpose: Full PTY lifecycle for embedded Claude Code sessions
- Contains: Spawn via `portable_pty`, Windows Job Object cleanup, ANSI-stripping state parser, session history
- Key files: `pty.rs` (spawn), `state_parser.rs` (working/waiting/idle/error detection)

**`src-ui/src/pages/`:**
- Purpose: One component per application view; selected by `activeView` in `config-store.ts`
- Contains: Full-screen page components; orchestrate domain components and stores
- Key files: `Dashboard.tsx` (primary view — branch table + terminal panel), `SessionManager.tsx` (actually in `components/session/` but rendered by dashboard view)

**`src-ui/src/components/session/`:**
- Purpose: Session tab lifecycle management — mounts xterm.js instances, wires PTY events
- Key files: `SessionManager.tsx` (the tab host; each `TerminalInstance` stays mounted but hidden when not active)

**`src-ui/src/components/ui/`:**
- Purpose: shadcn/ui primitives — unstyled components built on Radix UI
- Generated: No (manually maintained)
- Committed: Yes

**`src-ui/src/stores/`:**
- Purpose: All application state; all `invoke()` calls live in stores, not in components
- Each store is a Zustand slice with actions and state

**`src-ui/src/types/`:**
- Purpose: TypeScript type definitions that mirror Rust structs serialized across IPC
- These must stay in sync with `src-tauri/src/config/models.rs` and `src-tauri/src/git/branches.rs`

## Key File Locations

**Entry Points:**
- `src-tauri/src/main.rs`: Rust binary entry (1 line — calls `lib::run()`)
- `src-tauri/src/lib.rs`: Full app bootstrap — all managed state, plugin registration, event listeners, background threads
- `src-ui/src/main.tsx`: React DOM mount
- `src-ui/src/App.tsx`: React root with view router

**Configuration:**
- `src-tauri/tauri.conf.json`: Window size, bundle targets, updater endpoint, product name
- `src-ui/vite.config.ts`: `@` alias → `src/`, Vite dev server on port 5173
- `src-ui/tsconfig.json`: TypeScript compiler settings
- `src-ui/components.json`: shadcn/ui path aliases for component generation
- Runtime config stored at: `%APPDATA%/com.grove.app/config.json`

**Core Logic:**
- `src-tauri/src/git/merge.rs`: Full merge pipeline (preview + execute + build bump + changelog)
- `src-tauri/src/terminal/pty.rs`: PTY spawn; injects profile env vars, sets TERM/COLORTERM
- `src-tauri/src/terminal/state_parser.rs`: Regex-based Claude state detection from PTY output
- `src-tauri/src/config/persistence.rs`: Config load/save + repo auto-detection
- `src-tauri/src/watcher/mod.rs`: Git filesystem watcher with PollWatcher NAS fallback

**Testing:**
- `src-tauri/src/watcher/mod.rs`: Inline `#[cfg(test)]` module (only test coverage found)
- No test files found in `src-ui/`

## Naming Conventions

**Rust files:**
- `snake_case.rs` for all modules
- Command files named `{domain}_commands.rs`
- Each subdomain gets a `mod.rs` + named files

**TypeScript files:**
- `PascalCase.tsx` for React components
- `kebab-case.ts` for stores (`config-store.ts`), hooks (`useTerminal.ts` uses camelCase), types
- Hook files: `use{Name}.ts` pattern

**Directories:**
- Rust: `snake_case/`
- Frontend: `kebab-case/` for utility dirs (`stores/`, `hooks/`, `types/`, `lib/`); `lowercase/` for component groups (`session/`, `terminal/`, `launch/`, `config/`, `ui/`)

## Where to Add New Code

**New Tauri command:**
- Implement in `src-tauri/src/commands/{domain}_commands.rs`
- Register in `src-tauri/src/lib.rs` `invoke_handler![]`
- Add TypeScript `invoke()` call to the relevant store in `src-ui/src/stores/`
- Add TypeScript type to `src-ui/src/types/` if new structs cross the boundary

**New git operation:**
- Business logic: `src-tauri/src/git/{operation}.rs`
- Expose as command: `src-tauri/src/commands/git_commands.rs`
- Declare in `src-tauri/src/git/mod.rs`

**New frontend view:**
- Add view constant to `activeView` union type in `src-ui/src/stores/config-store.ts`
- Create page component in `src-ui/src/pages/{ViewName}.tsx`
- Add navigation action to `config-store.ts`
- Add render case to `App.tsx` view switch

**New domain component:**
- Place in `src-ui/src/components/{domain}/` if it belongs to an existing domain
- Place in `src-ui/src/components/` root for cross-domain components
- Use shadcn/ui primitives from `src-ui/src/components/ui/` for base elements

**New Zustand store:**
- Create `src-ui/src/stores/{domain}-store.ts`
- Follow pattern: typed interface + `create<State>()` + all `invoke()` calls inside action functions

**Utilities:**
- Rust shared helpers: `src-tauri/src/utils/paths.rs` or new file in `src-tauri/src/utils/`
- Frontend helpers: `src-ui/src/lib/utils.ts` (class merging) or new file in `src-ui/src/lib/`

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow planning files (phases, codebase analysis)
- Generated: No (human + AI authored)
- Committed: Yes (project memory)

**`src-tauri/target/`:**
- Purpose: Rust build artifacts
- Generated: Yes
- Committed: No (in .gitignore)

**`src-ui/dist/`:**
- Purpose: Vite production build output (consumed by Tauri bundle)
- Generated: Yes
- Committed: No

**`src-tauri/gen/`:**
- Purpose: Tauri-generated Android/iOS project files (unused for Windows-only app)
- Generated: Yes
- Committed: Yes (Tauri scaffolding)

---

*Structure analysis: 2026-04-01*
