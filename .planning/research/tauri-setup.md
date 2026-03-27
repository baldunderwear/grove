# Tauri 2.x + React + TypeScript Setup for Windows

**Researched:** 2026-03-27
**Confidence:** HIGH (official docs verified)

## Recommended Setup

### Prerequisites (Windows)

1. **Microsoft C++ Build Tools** -- "Desktop development with C++" workload from Visual Studio Installer
2. **WebView2** -- already included on Windows 10 (1803+) and Windows 11
3. **Rust** -- `winget install --id Rustlang.Rustup` (ensure `stable-msvc` is default toolchain)
4. **Node.js** -- LTS version via nodejs.org or winget

### Project Scaffolding

Use `create-tauri-app` for the fastest start:

```bash
# PowerShell
npm create tauri-app@latest grove -- --template react-ts
```

Or manual setup for more control:

```bash
mkdir grove && cd grove
npm create vite@latest . -- --template react-ts
npm install -D @tauri-apps/cli@latest
npx tauri init
```

When `tauri init` prompts:
- Web assets location: `./dist`
- Dev server URL: `http://localhost:5173`
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`

### Key Cargo.toml Configuration

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
git2 = "0.20"
notify = "7"
notify-debouncer-mini = "0.5"
thiserror = "2"
```

### Frontend Dependencies

```bash
npm install @tauri-apps/api @tauri-apps/plugin-shell
npm install -D @tauri-apps/cli
```

### Project Structure

```
grove/
  src/                      # React frontend
    main.tsx
    App.tsx
    components/
    hooks/
    api/                    # Tauri invoke wrappers
      git.ts                # Git operation commands
      process.ts            # Process spawning commands
      watcher.ts            # File system watcher commands
  src-tauri/
    src/
      lib.rs                # Plugin registration, command handlers
      main.rs               # Entry point (generated)
      commands/
        git.rs              # Git worktree operations
        process.rs          # Terminal/Claude launching
        watcher.rs          # FS watch management
      state.rs              # App state (worktree registry, watcher handles)
    Cargo.toml
    tauri.conf.json
    capabilities/
      default.json          # Permission scopes
    icons/
```

## IPC Pattern (Frontend to Rust)

This is the core architectural pattern. Every operation goes through Tauri commands.

### Rust Side

```rust
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;

#[derive(Debug, Serialize)]
struct WorktreeInfo {
    name: String,
    path: String,
    branch: String,
    is_locked: bool,
}

#[derive(Debug, thiserror::Error)]
enum GroveError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Custom(String),
}

// Required for Tauri to serialize errors to frontend
impl serde::Serialize for GroveError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::ser::Serializer {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

struct AppState {
    repo_path: Mutex<Option<String>>,
}

#[tauri::command]
async fn list_worktrees(
    state: State<'_, AppState>
) -> Result<Vec<WorktreeInfo>, GroveError> {
    // Implementation here
    Ok(vec![])
}
```

### Frontend Side

```typescript
import { invoke } from '@tauri-apps/api/core';

interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  is_locked: boolean;
}

export async function listWorktrees(): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>('list_worktrees');
}
```

### Critical Rules

1. **Async commands run on a thread pool** -- they will NOT block the UI or main thread
2. **Borrowed args (`&str`) in async commands require returning `Result`** -- use `String` instead to avoid the hassle
3. **All return types must impl `Serialize`** -- all arg types must impl `Deserialize`
4. **State access via `State<'_, T>`** -- register with `.manage(AppState { ... })` in builder
5. **Channels for streaming data** -- use `tauri::ipc::Channel<T>` for real-time updates (git status changes, watcher events)

## Configuration (tauri.conf.json)

```json
{
  "productName": "Grove",
  "version": "0.1.0",
  "identifier": "com.grove.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "title": "Grove",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "decorations": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": false
    }
  }
}
```

## Gotchas

1. **Windows path separators** -- Rust uses `\\` but paths from the frontend come with `/`. Use `std::path::PathBuf` everywhere to normalize.
2. **WebView2 on older Windows** -- If targeting Windows 10 pre-1803, you need to bundle WebView2 bootstrapper.
3. **`--legacy-peer-deps` not needed** -- Tauri 2 deps are clean with npm. Only sol-lune needs this flag.
4. **Development mode vs production** -- Shell plugin `spawn()` has known hangs in production on Windows. Test production builds early.
5. **Capability permissions** -- Every shell command must be explicitly allowed in `capabilities/default.json`. Forgetting this = silent failures.
6. **MSVC toolchain** -- Must use `stable-msvc`, not `stable-gnu`. The GNU toolchain will fail to link on Windows.

## Sources

- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)
- [Create a Project](https://v2.tauri.app/start/create-project/)
- [Windows Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/)
- [IPC Concept](https://v2.tauri.app/concept/inter-process-communication/)
