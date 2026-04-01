# Coding Conventions

**Analysis Date:** 2026-04-01

## Naming Patterns

**Files (TypeScript/React):**
- React components: PascalCase, `.tsx` — `BranchTable.tsx`, `MergeDialog.tsx`, `SessionManager.tsx`
- Hooks: camelCase with `use` prefix, `.ts` — `useTerminal.ts`, `useKeyboardShortcuts.ts`, `useFileEditor.ts`
- Zustand stores: camelCase with `-store` suffix, `.ts` — `config-store.ts`, `branch-store.ts`, `terminal-store.ts`
- Utility modules: camelCase, `.ts` — `utils.ts`, `alerts.ts`
- Type definitions: camelCase, `.ts` — `config.ts`, `branch.ts`, `merge.ts`, `session.ts`
- Layout components: PascalCase in `layout/` — `Sidebar.tsx`
- Page components: PascalCase in `pages/` — `Dashboard.tsx`, `Settings.tsx`, `AllProjects.tsx`
- UI primitives: PascalCase in `components/ui/` — shadcn/ui conventions

**Files (Rust):**
- Module files: `snake_case.rs` or `mod.rs` — `branches.rs`, `merge.rs`, `error.rs`, `state_parser.rs`
- Module directories: `snake_case/` — `git/`, `config/`, `terminal/`, `process/`, `watcher/`
- Command files: `snake_case_commands.rs` — `git_commands.rs`, `config_commands.rs`, `session_commands.rs`

**Functions:**
- TypeScript: camelCase — `fetchBranches`, `silentRefresh`, `relativeTime`, `isStale`
- Rust: `snake_case` — `list_worktree_branches`, `detect_current_build`, `bump_build_number`
- Tauri commands (Rust): `snake_case` decorated with `#[tauri::command]` — `get_config`, `list_branches`, `merge_branch`
- React event handlers: `handle` prefix — `handleContinue`, `handleBack`, `handleMerge`, `handleDone`

**Variables:**
- TypeScript: camelCase — `fetchCounter`, `pollCounter`, `activeTabId`, `focusedSessionId`
- Rust: `snake_case` — `project_path`, `source_branch`, `merge_target`, `fetch_counter`
- Boolean state fields: `is_` prefix for Rust struct fields — `is_dirty`, `is_legacy`, `is_default`
- Boolean React props: no prefix, plain adjective — `loading`, `refreshing`, `open`, `showSelection`

**Types/Interfaces:**
- TypeScript interfaces: PascalCase — `BranchInfo`, `AppConfig`, `TerminalTab`, `LaunchOptions`
- TypeScript type aliases: PascalCase — `SortMode`, `SessionState`, `MergeStep`, `HealthStatus`
- Zustand store state interfaces: PascalCase with `State` suffix — `BranchState`, `ConfigState`, `MergeState`
- Rust structs: PascalCase — `BranchInfo`, `AppConfig`, `ProjectConfig`, `MergePreview`
- Rust enums: PascalCase — `GitError`, `ConfigError`, `SessionState`
- Rust error enums: PascalCase with `Error` suffix — `GitError`, `ConfigError`

**React/Zustand:**
- Store hooks export name: `use` + PascalCase module name + `Store` — `useConfigStore`, `useBranchStore`, `useTerminalStore`
- Zustand state selectors in components: single-letter `s` parameter — `useConfigStore((s) => s.activeView)`

## Code Style

**Formatting:**
- TypeScript: no Prettier config detected; TSConfig strict mode enforces consistency
- Indentation: 2-space indent (TypeScript), 4-space indent (Rust)
- Trailing commas: used in TypeScript multi-line structures
- Single quotes: used for TypeScript string literals
- Rust: `rustfmt` defaults (implied by Cargo.toml + edition 2021)

**TypeScript Compiler Options (strict):**
- `strict: true` — enables all strict type checks
- `noUnusedLocals: true` — no unused variables
- `noUnusedParameters: true` — no unused function parameters
- `noFallthroughCasesInSwitch: true` — exhaustive switch cases required
- `forceConsistentCasingInFileNames: true`

**Linting:**
- TypeScript: lint command is `tsc -b --noEmit` (no ESLint config present, but `eslint-disable-next-line` comments appear in source, indicating ESLint is used at runtime even if config isn't checked in)
- Known suppression: `react-hooks/exhaustive-deps` is suppressed in several components when intentional dep-skipping is needed (always accompanied by an explanatory comment)

## Import Organization

**TypeScript order (observed pattern):**
1. React core imports — `import { useEffect, useState } from 'react'`
2. Tauri API imports — `import { invoke } from '@tauri-apps/api/core'`; `import { listen } from '@tauri-apps/api/event'`
3. Tauri plugin imports — `import { sendNotification } from '@tauri-apps/plugin-notification'`
4. Third-party library imports — `import { create } from 'zustand'`
5. `@/components/ui/` imports (shadcn primitives)
6. Internal `@/components/` imports
7. Internal `@/hooks/` imports
8. Internal `@/stores/` imports
9. Internal `@/lib/` imports
10. Type-only imports using `import type` — `import type { BranchInfo } from '@/types/branch'`

**Path Aliases:**
- `@/*` maps to `src-ui/src/*` (configured in `tsconfig.json` and `vite.config.ts`)
- Always use `@/` for internal imports, never relative paths from deep directories

**Rust imports:**
- External crate items first (`use git2::...`, `use serde::...`)
- `crate::` internal imports last (`use crate::git::error::GitError`)
- `super::` for sibling module imports

## Error Handling

**TypeScript (frontend):**
- Zustand store actions catch all errors via `try/catch`
- Errors are stored as `error: string | null` in store state: `set({ error: String(e) })`
- Fatal errors that the calling UI must handle: re-thrown with `throw e` after storing in state
- Silent operations (e.g. background refresh) swallow errors without setting state
- Fire-and-forget Tauri invocations use `.catch(() => {})`: `invoke('refresh_tray').catch(() => {})`
- Empty catch blocks (no variable): `catch { ... }` — used when error is intentionally ignored

**Rust (backend):**
- All domain errors use `thiserror`-derived enum types: `GitError`, `ConfigError`
- Errors implement `serde::Serialize` by serializing to their `Display` string — required for Tauri IPC
- `#[from]` attribute used for automatic conversion from stdlib/library errors
- Tauri commands return `Result<T, ErrorType>` — never panic on user-facing code
- Background threads log errors with `eprintln!` but don't crash the app:
  ```rust
  if let Err(e) = crate::watcher::start_watcher(app_handle, paths) {
      eprintln!("[grove] Warning: file watcher failed to start: {}", e);
  }
  ```
- Mutex poisoning handled explicitly on write-lock commands

## Logging

**Frontend:** `console.error` for caught errors in event handlers — used sparingly
**Backend:** `eprintln!` for non-fatal warnings during startup/background operations — prefixed with `[grove]`
No structured logging framework in use.

## Comments

**When to Comment:**
- Public-facing Rust functions always have doc comments (`///`) describing purpose, behavior, and read/write semantics
- Internal helper functions have doc comments when non-obvious
- Code comments (`//`) explain the "why" for non-obvious logic — not the "what"
- React `useEffect` with suppressed deps rule has a comment explaining why
- Module-level constants get a brief inline comment

**JSDoc/TSDoc:**
- Not used in TypeScript (no JSDoc annotations found); doc comments appear in Rust only
- Rust doc comments use `///` on public items consistently

**Examples:**
```rust
/// Preview what a merge of source_branch into merge_target would do.
/// This is read-only -- no mutations to the repo or working directory.
pub fn merge_preview(...) -> Result<MergePreview, GitError>

/// Batch-fetch commit info for all branches in ONE git command.
/// Returns a map of branch_name -> (subject, timestamp).
fn batch_commit_info(...) -> HashMap<...>
```

## Function Design

**TypeScript:**
- Helper functions extracted from components when they contain pure logic (no hooks): `sortBranches`, `SkeletonRows`
- Event handlers named `handle*` defined inline within components using `const`
- Async store actions use the standard pattern: set loading → invoke → set result or set error
- Derived getters in Zustand defined as functions returning computed values: `hasAnyTabs: () => get().tabs.size > 0`

**Rust:**
- Tauri command functions are thin wrappers — they parse parameters and delegate to domain modules
- Internal functions are `fn` (private by default), public API is `pub fn`
- Long functions broken into named helpers: `enumerate_worktrees_cli`, `batch_commit_info`, `extract_build_number`
- Static regex patterns use `LazyLock` for one-time compilation: `static ANSI_STRIP_RE: LazyLock<Regex> = LazyLock::new(...)`

## Module Design

**TypeScript exports:**
- Named exports used exclusively — no default exports except `App` in `src-ui/src/App.tsx`
- No barrel (`index.ts`) files — imports go directly to the source file
- Store modules export the store hook plus any needed types (`export type MergeStep`)

**Rust modules:**
- Each domain area is a `mod` directory with a `mod.rs` re-exporting public items
- Commands are grouped by domain in `src-tauri/src/commands/`
- All Tauri commands registered centrally in `src-tauri/src/lib.rs`

## Tauri IPC Pattern

- Frontend always calls `invoke<ReturnType>('command_name', { camelCaseArgs })` — Tauri auto-converts to snake_case on Rust side
- Tauri command parameter names in Rust use `snake_case`; Tauri serializes them automatically
- Event listening uses `listen<PayloadType>('event-name', handler)` with cleanup returned from `useEffect`
- Event names use `kebab-case` — `'git-changed'`, `'session-state-changed'`, `'launch-worktree'`, `'navigate'`
- Custom DOM events for internal UI coordination use `grove:` prefix — `'grove:new-worktree'`, `'grove:close-dialog'`

---

*Convention analysis: 2026-04-01*
