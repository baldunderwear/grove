# Phase 02: Project Registry & Configuration - Research

**Researched:** 2026-03-27
**Domain:** Tauri 2 config persistence, shadcn/ui components, Zustand state, git repo validation
**Confidence:** HIGH

## Summary

This phase builds the core configuration layer: Rust backend for JSON config persistence at `%APPDATA%/grove/config.json`, Tauri commands for CRUD operations, a React frontend with shadcn/ui components for project registration and settings, and Zustand for client state management.

The stack is well-established. Tauri 2 provides `app_handle.path().app_data_dir()` for the config path, serde for JSON serialization (already in Cargo.toml), and the dialog plugin for native directory picking. The frontend uses shadcn/ui (which now supports Tailwind v4 natively) for form components, and Zustand 5 for state. The git2 crate handles repo validation via `Repository::open()`.

**Primary recommendation:** Build config Rust module first (data models + file I/O + Tauri commands), then wire up shadcn/ui frontend. Keep config I/O entirely in Rust -- the frontend never reads/writes files directly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store config in `%APPDATA%/grove/config.json` via Tauri's `app_data_dir()`
- Single config file with `projects[]` array + `settings` object
- Include `version: 1` field for future schema migration
- Hardcoded defaults in Rust, config only stores overrides
- "Add Project" button -> native directory picker -> auto-detect git repo -> show config form
- Auto-detect: repo name, branches, remote URL. Manual entry: merge target, branch prefix, build files, changelog config
- Health validation on add + periodic: check path exists, is git repo, has merge target branch
- Sidebar list with project name + health dot
- Global settings scope: theme (dark only for v1), refresh interval, start on login, start minimized
- Inline form fields, auto-save on blur
- Rust Tauri commands (`get_config`, `save_config`, `add_project`, `remove_project`) called via `invoke()`
- Zustand store with `useConfigStore`

### Claude's Discretion
- Exact form field layout and ordering
- Error message wording and validation UX
- Internal Rust data structures (serde models)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-01.1 | User can add a project by selecting a git repository path | Tauri dialog plugin `open({ directory: true })` for native picker; git2 `Repository::open()` for validation |
| FR-01.2 | User can remove a project from the registry | Tauri command `remove_project` + confirmation Dialog component from shadcn |
| FR-01.3 | Each project stores its own config (merge target, branch prefix, build files, changelog) | Serde struct with `#[serde(default)]` for optional fields, stored in projects[] array |
| FR-01.4 | Projects without build numbers/changelogs work with plain merge | `build_files` and `changelog` fields are `Option<Vec<>>` / `Option<>` -- omitted when None via `#[serde(skip_serializing_if)]` |
| FR-01.5 | Config persists across app restarts (JSON file in app data dir) | `app_handle.path().app_data_dir()` + `std::fs::read_to_string` / `std::fs::write` |
| FR-01.6 | App detects if registered project path no longer exists | `std::path::Path::exists()` + `Repository::open()` in health check command |
| FR-07.1 | Global settings: refresh interval, notifications, start with Windows, default flags | Settings struct with defaults, stored in `settings` object in config JSON |
| FR-07.2 | Per-project settings: merge target, branch prefix, build file patterns, changelog | ProjectConfig struct fields -- each project carries its own settings |
| FR-07.3 | Theme: light/dark mode | Dark-only for v1 (locked decision). Field present in settings for future use |
| FR-07.4 | Export/import configuration | Config is a single JSON file -- export = copy file, import = read + validate + replace |
</phase_requirements>

## Standard Stack

### Core (Rust Backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| serde + serde_json | 1.x | JSON serialization of config | Already in Cargo.toml, standard Rust serialization |
| tauri | 2.x | App framework, commands, path resolution | Project foundation |
| tauri-plugin-dialog | 2.6.0 | Native OS directory picker | Official Tauri plugin for file/folder dialogs |
| git2 | latest | Validate directories are git repos, detect branches | Listed in PROJECT.md tech stack for git operations |
| thiserror | 2.x | Error types for commands | Already in Cargo.toml |

### Core (Frontend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui | 4.1.1 (CLI) | UI components (Button, Input, Card, Dialog, etc.) | Locked in UI-SPEC |
| zustand | 5.0.12 | Client state management (`useConfigStore`) | Locked decision, already in package.json |
| @tauri-apps/plugin-dialog | 2.6.0 | JS bindings for directory picker | Pairs with Rust dialog plugin |
| @tauri-apps/api | 2.x | `invoke()` for calling Rust commands | Already in package.json |
| lucide-react | 1.7.0 | Icons (Settings gear, FolderOpen, X for remove) | Specified in UI-SPEC |
| tw-animate-css | latest | Animation utility (replaces tailwindcss-animate) | Required by shadcn/ui with Tailwind v4 |

### Not Needed
| Instead of | Why Not |
|------------|---------|
| @tauri-apps/plugin-fs | Config I/O done entirely in Rust via std::fs -- no need for JS file access |
| react-hook-form | Simple auto-save-on-blur pattern, Zustand handles state directly |
| zod | Validation done in Rust (serde), TypeScript types sufficient for frontend |

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/
  lib.rs              # Tauri setup (add new commands + plugins)
  main.rs             # Entry point (unchanged)
  config/
    mod.rs            # Config module exports
    models.rs         # AppConfig, ProjectConfig, Settings structs
    persistence.rs    # Load/save JSON file, ensure directory exists
  commands/
    mod.rs            # Command module exports
    config_commands.rs # get_config, save_config, add_project, remove_project, check_health

src-ui/src/
  App.tsx             # Layout shell (sidebar + main content area)
  components/
    ui/               # shadcn components (auto-generated)
  stores/
    config-store.ts   # Zustand useConfigStore
  pages/
    ProjectConfig.tsx # Project config editor panel
    Settings.tsx      # Global settings page
    EmptyState.tsx    # No projects registered state
  layout/
    Sidebar.tsx       # Project list + Add Project + Settings gear
  types/
    config.ts         # TypeScript types mirroring Rust structs
```

### Pattern 1: Rust-First Config with Zustand Sync
**What:** All config I/O happens in Rust. Frontend loads on startup, mutates locally, syncs back via Tauri commands on blur.
**When to use:** Always for this phase -- single source of truth is the JSON file.
**Example:**
```rust
// src-tauri/src/config/models.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
    #[serde(default)]
    pub settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,                    // UUID for stable identity
    pub name: String,
    pub path: String,
    pub merge_target: String,
    #[serde(default = "default_branch_prefix")]
    pub branch_prefix: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub build_files: Vec<BuildFileConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changelog: Option<ChangelogConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: u32,      // seconds
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default)]
    pub start_with_windows: bool,
}

fn default_branch_prefix() -> String { "wt/".to_string() }
fn default_refresh_interval() -> u32 { 30 }
```

```typescript
// src-ui/src/stores/config-store.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, ProjectConfig } from '../types/config';

interface ConfigState {
  config: AppConfig | null;
  selectedProjectId: string | null;
  activeView: 'project' | 'settings' | 'empty';
  loadConfig: () => Promise<void>;
  addProject: (path: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<ProjectConfig>) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  selectProject: (id: string) => void;
  showSettings: () => void;
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  config: null,
  selectedProjectId: null,
  activeView: 'empty',

  loadConfig: async () => {
    const config = await invoke<AppConfig>('get_config');
    set({
      config,
      activeView: config.projects.length === 0 ? 'empty' : 'project',
    });
  },

  addProject: async (path: string) => {
    const config = await invoke<AppConfig>('add_project', { path });
    const newProject = config.projects[config.projects.length - 1];
    set({ config, selectedProjectId: newProject.id, activeView: 'project' });
  },

  updateProject: async (id: string, updates: Partial<ProjectConfig>) => {
    const config = await invoke<AppConfig>('update_project', { id, updates });
    set({ config });
  },

  // ... other actions follow same pattern: invoke -> update local state
}));
```

### Pattern 2: Tauri Command Error Handling
**What:** Commands return `Result<T, String>` for simple errors, with structured error types for complex cases.
**When to use:** All Tauri commands in this phase.
**Example:**
```rust
// Source: Tauri 2 command documentation
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Config file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Not a git repository: {0}")]
    NotGitRepo(String),
    #[error("Path does not exist: {0}")]
    PathNotFound(String),
    #[error("Project already registered: {0}")]
    AlreadyRegistered(String),
}

// Tauri requires Serialize for error types
impl serde::Serialize for ConfigError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
async fn add_project(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<AppConfig, ConfigError> {
    // Validate path exists
    if !std::path::Path::new(&path).exists() {
        return Err(ConfigError::PathNotFound(path));
    }
    // Validate is git repo
    git2::Repository::open(&path)
        .map_err(|_| ConfigError::NotGitRepo(path.clone()))?;
    // Load, modify, save, return
    let mut config = load_config(&app_handle)?;
    // ... add project ...
    save_config(&app_handle, &config)?;
    Ok(config)
}
```

### Pattern 3: Directory Picker from Frontend
**What:** Use Tauri dialog plugin to open native OS folder picker.
**Example:**
```typescript
// Source: https://v2.tauri.app/plugin/dialog/
import { open } from '@tauri-apps/plugin-dialog';

async function handleAddProject() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Git Repository',
  });
  if (selected) {
    // selected is a string (path) when directory: true, multiple: false
    await useConfigStore.getState().addProject(selected);
  }
}
```

### Anti-Patterns to Avoid
- **Frontend file I/O:** Never use `@tauri-apps/plugin-fs` for config. Keep all persistence in Rust for atomicity and error handling.
- **Storing defaults in config file:** Only store user overrides. Defaults live in Rust `Default` impls. This keeps the config file clean and makes default changes easy.
- **Mutable global state in Rust without sync:** If using `tauri::State<>` for in-memory config cache, wrap in `Mutex<>` since commands can run concurrently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory picker | Custom file browser | `@tauri-apps/plugin-dialog` with `directory: true` | OS-native, accessible, handles edge cases |
| Git repo detection | Shell out to `git rev-parse` | `git2::Repository::open()` | No dependency on git CLI being in PATH |
| JSON config serialization | Manual string building | serde_json with derive macros | Handles escaping, nested structures, Option fields |
| UUID generation | Custom ID scheme | `uuid` crate (v4) | Collision-free project identifiers |
| Form components | Custom inputs/buttons | shadcn/ui components | Accessible, themed, consistent |
| App data directory | Hardcoded path | `app_handle.path().app_data_dir()` | Cross-platform, respects OS conventions |

**Key insight:** Config persistence is deceptively complex -- atomic writes, directory creation, default merging, schema versioning. Using serde + std::fs with careful error handling covers it without a database.

## Common Pitfalls

### Pitfall 1: App Data Directory Does Not Exist on First Launch
**What goes wrong:** `std::fs::write()` fails because `%APPDATA%/grove/` directory hasn't been created yet.
**Why it happens:** Tauri's `app_data_dir()` returns a path but doesn't create it.
**How to avoid:** Call `std::fs::create_dir_all()` before any file write. Do this in the `load_or_create_config` function.
**Warning signs:** Error on first launch only, works after manual directory creation.

### Pitfall 2: Config File Corruption on Concurrent Writes
**What goes wrong:** Two rapid auto-save-on-blur events interleave, producing invalid JSON.
**Why it happens:** Tauri commands run on a thread pool. Two `save_config` calls can race.
**How to avoid:** Use `tauri::State<Mutex<AppConfig>>` for in-memory state, serialize writes through the mutex. Only one write at a time.
**Warning signs:** Corrupted config file after rapid editing.

### Pitfall 3: NAS/Network Path Delays
**What goes wrong:** Health check or `Repository::open()` hangs when project path is on a disconnected network drive (Z: drive).
**Why it happens:** Windows file I/O blocks on network timeouts.
**How to avoid:** Run health checks in async commands (not blocking the main thread). Use `tokio::task::spawn_blocking` for file I/O on network paths. Consider a quick `Path::exists()` check before `Repository::open()`.
**Warning signs:** UI freezes when NAS is disconnected.

### Pitfall 4: shadcn/ui Init Overwrites Tailwind Config
**What goes wrong:** Running `shadcn init` modifies `index.css` or adds a `tailwind.config.ts` that conflicts with existing Tailwind v4 setup.
**Why it happens:** shadcn init makes assumptions about project structure.
**How to avoid:** Review what `shadcn init` will change. The project already has `@import "tailwindcss"` in index.css. shadcn will add CSS variables under `@theme inline` -- this is additive and safe. Ensure the init uses the `new-york` style (default for v4) and zinc/neutral preset as specified in UI-SPEC.
**Warning signs:** Broken styles after init, duplicate Tailwind imports.

### Pitfall 5: Path Alias Not Configured for shadcn Imports
**What goes wrong:** shadcn components import from `@/components/ui/button` but the `@` alias isn't configured.
**Why it happens:** Current vite.config.ts has no `resolve.alias` and tsconfig.json has no `paths`.
**How to avoid:** Add path alias to both `vite.config.ts` (resolve.alias) and `tsconfig.json` (compilerOptions.paths) BEFORE running `shadcn init`.
**Warning signs:** Module not found errors on `@/` imports.

### Pitfall 6: Tauri Command Name Casing Mismatch
**What goes wrong:** Frontend `invoke('getConfig')` doesn't match Rust `fn get_config()`.
**Why it happens:** Tauri auto-converts Rust snake_case to JS camelCase by default.
**How to avoid:** Use camelCase in `invoke()` calls. `get_config` in Rust = `getConfig` in JS. Or use `#[tauri::command(rename_all = "snake_case")]` to keep snake_case on both sides.
**Warning signs:** "Command not found" errors at runtime.

## Code Examples

### Config File Load/Create Pattern
```rust
// src-tauri/src/config/persistence.rs
use std::fs;
use std::path::PathBuf;
use super::models::AppConfig;

pub fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, ConfigError> {
    let dir = app_handle.path().app_data_dir()
        .map_err(|e| ConfigError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Could not resolve app data dir: {}", e),
        )))?;
    Ok(dir.join("config.json"))
}

pub fn load_or_create_config(app_handle: &tauri::AppHandle) -> Result<AppConfig, ConfigError> {
    let path = config_path(app_handle)?;

    if path.exists() {
        let contents = fs::read_to_string(&path)?;
        let config: AppConfig = serde_json::from_str(&contents)?;
        Ok(config)
    } else {
        let config = AppConfig::default();
        save_config_to_file(&path, &config)?;
        Ok(config)
    }
}

pub fn save_config_to_file(path: &PathBuf, config: &AppConfig) -> Result<(), ConfigError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(path, json)?;
    Ok(())
}
```

### Health Check Command
```rust
#[tauri::command]
async fn check_project_health(path: String) -> Result<HealthStatus, String> {
    if !std::path::Path::new(&path).exists() {
        return Ok(HealthStatus::PathNotFound);
    }
    match git2::Repository::open(&path) {
        Ok(repo) => {
            // Optionally check for merge target branch
            Ok(HealthStatus::Healthy)
        }
        Err(_) => Ok(HealthStatus::NotGitRepo),
    }
}

#[derive(serde::Serialize)]
pub enum HealthStatus {
    Healthy,
    PathNotFound,
    NotGitRepo,
    MissingMergeTarget,
}
```

### Auto-Detect Git Repo Info
```rust
pub fn detect_repo_info(path: &str) -> Result<RepoInfo, ConfigError> {
    let repo = git2::Repository::open(path)
        .map_err(|_| ConfigError::NotGitRepo(path.to_string()))?;

    // Get repo name from directory name
    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // List branches to suggest merge target
    let branches: Vec<String> = repo.branches(Some(git2::BranchType::Local))?
        .filter_map(|b| b.ok())
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(String::from))
        .collect();

    // Detect default merge target
    let merge_target = if branches.contains(&"develop".to_string()) {
        "develop".to_string()
    } else if branches.contains(&"main".to_string()) {
        "main".to_string()
    } else {
        branches.first().cloned().unwrap_or_default()
    };

    Ok(RepoInfo { name, merge_target, branches })
}
```

### Zustand Auto-Save on Blur Pattern
```typescript
// In a form field component
function ConfigInput({ projectId, field, value }: Props) {
  const [localValue, setLocalValue] = useState(value);
  const updateProject = useConfigStore((s) => s.updateProject);

  const handleBlur = async () => {
    if (localValue !== value) {
      await updateProject(projectId, { [field]: localValue });
    }
  };

  return (
    <Input
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwindcss-animate | tw-animate-css | shadcn v4 (2025) | Must install tw-animate-css with shadcn |
| shadcn `default` style | shadcn `new-york` style | 2025 | Default style deprecated |
| forwardRef in shadcn components | data-slot attributes | 2025 | Components use data-slot for styling |
| `hsl(var(--color))` | `var(--color)` with OKLCH | Tailwind v4 | CSS variables include color function |
| Zustand `create<T>()(...)` v4 pattern | Same pattern in v5 | 2024 | No breaking changes in store creation |
| Tauri 1 `path_resolver()` | Tauri 2 `app_handle.path()` | Tauri 2.0 | Different method name on Manager trait |

## Open Questions

1. **git2 crate version and Cargo compatibility**
   - What we know: git2 is listed in PROJECT.md tech stack, not yet in Cargo.toml
   - What's unclear: Whether git2 compiles cleanly on Windows with current MSVC toolchain without libgit2 system dep
   - Recommendation: Add `git2` to Cargo.toml and verify it builds. Use `features = []` (default features include bundled libgit2 which compiles from source).

2. **Tauri `app_handle.path().app_data_dir()` exact return type**
   - What we know: Returns a `Result<PathBuf>` in Tauri 2, path resolves to `%APPDATA%/com.grove.app/`
   - What's unclear: Whether the identifier uses the `identifier` field from tauri.conf.json exactly
   - Recommendation: Log the resolved path on first run to verify. The identifier `com.grove.app` is in tauri.conf.json.

3. **shadcn init with NAS workaround (node_modules junction)**
   - What we know: Project uses `scripts/with-modules.mjs` to junction node_modules to local C: drive
   - What's unclear: Whether `npx shadcn@latest init` respects the junction or needs the wrapper
   - Recommendation: Run shadcn init via the with-modules wrapper, or install deps first then run init.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust/Cargo | Backend compilation | Assumed (Phase 01 complete) | -- | -- |
| Node/npm | Frontend build | Assumed (Phase 01 complete) | -- | -- |
| git2 (Rust crate) | Repo validation | Needs to be added to Cargo.toml | -- | Shell out to `git` CLI |
| shadcn CLI | Component installation | Via npx (no global install needed) | 4.1.1 | Manual component copy |

**Missing dependencies with no fallback:**
- None identified -- all critical dependencies are installable.

**Missing dependencies with fallback:**
- git2 crate: If it fails to compile on Windows, can fall back to `std::process::Command` calling `git rev-parse --git-dir` to check if directory is a repo.

## Project Constraints (from CLAUDE.md)

- **NAS workaround:** `scripts/with-modules.mjs` creates local junction for node_modules. All npm commands must go through this.
- **Dev command:** `cargo tauri dev` for full dev mode, `cd src-ui && npm run dev` for frontend only.
- **Lint/typecheck:** `cd src-ui && npm run typecheck` and `npm run lint` (same command).
- **Rust checks:** `cargo check`, `cargo test`, `cargo clippy`.
- **GSD enforcement:** Before using Edit/Write, start work through a GSD command.
- **Tailwind v4:** Uses `@tailwindcss/vite` plugin, no PostCSS config.
- **Window behavior:** Starts hidden, close hides to tray (already implemented in lib.rs).

## Sources

### Primary (HIGH confidence)
- [Tauri 2 Dialog Plugin](https://v2.tauri.app/plugin/dialog/) - Directory picker API, installation, permissions
- [Tauri 2 File System Plugin](https://v2.tauri.app/plugin/file-system/) - AppData path resolution, permissions
- [Tauri 2 Calling Rust](https://v2.tauri.app/develop/calling-rust/) - Command definition, registration, invoke pattern
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite) - Setup with Tailwind v4
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) - CSS variable changes, OKLCH, tw-animate-css

### Secondary (MEDIUM confidence)
- [git2 Repository docs](https://docs.rs/git2/latest/git2/struct.Repository.html) - open(), discover(), branch listing
- [Zustand GitHub](https://github.com/pmndrs/zustand) - v5 patterns, async actions

### Tertiary (LOW confidence)
- Tauri 2 `app_handle.path()` method chain -- inferred from multiple sources but exact return type not verified from docs.rs directly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries verified with current versions, serde/Tauri already in project
- Architecture: HIGH - patterns from official Tauri 2 docs, well-established Zustand patterns
- Pitfalls: HIGH - NAS path issue from project experience (CLAUDE.md), config race condition is classic concurrency issue
- shadcn setup: MEDIUM - Tailwind v4 support confirmed but interaction with NAS junction untested

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable ecosystem, 30 days)
