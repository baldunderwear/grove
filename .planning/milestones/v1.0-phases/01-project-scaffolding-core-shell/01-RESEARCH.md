# Phase 01: Project Scaffolding & Core Shell - Research

**Researched:** 2026-03-27
**Domain:** Tauri 2 project setup, system tray, window management, Windows build pipeline
**Confidence:** HIGH

## Summary

This phase creates the foundational Tauri 2 + React 19 + TypeScript application from scratch. The project root currently contains only CLAUDE.md, a README, and legacy launcher scripts -- no application code exists yet. The existing research in `.planning/research/` provides HIGH confidence patterns for Tauri 2 setup, system tray implementation, and IPC architecture. All recommended packages have been verified against the npm registry with current versions.

The critical path is: scaffold Tauri project -> configure system tray with show/hide window -> configure bundler for Windows installer -> set up GitHub Actions CI. Tailwind CSS v4 uses a simplified Vite plugin approach (no tailwind.config.js needed). Rust toolchain is NOT currently installed on this machine, so Phase 01 must include Rust installation steps or document it as a prerequisite.

**Primary recommendation:** Use `create-tauri-app` for scaffolding, then layer in Tailwind v4, Zustand, and the tray-resident app pattern from the existing research. Keep this phase minimal -- tray icon, window toggle, installer output. No git operations, no process spawning.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion for this infrastructure phase.

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFR-01.4 | Installer size < 20MB | Tauri default WebView2 bootstrapper mode keeps installer small (~3-5MB for minimal app). Verified via Tauri docs. |
| NFR-04.1 | Windows MSI or NSIS installer via Tauri bundler | Tauri 2 produces both NSIS and MSI by default. NSIS is recommended (better UX, per-user install). |
| FR-05.1 | App runs as system tray icon with context menu | Tauri 2 `tray-icon` feature with `TrayIconBuilder`. Full pattern documented in existing research. |
| FR-05.4 | Left-click tray icon opens dashboard, right-click opens menu | `menu_on_left_click(false)` + `on_tray_icon_event` handler. Pattern verified in research. |
| FR-05.5 | App starts minimized to tray (configurable) | Window `visible: false` in tauri.conf.json + tray event to show on click. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Tauri 2 + React 19 + Vite + TypeScript + Tailwind CSS + Zustand
- **Directory structure:** `src-tauri/` for Rust backend, `src-ui/` for React frontend
- **Commands:** `cargo tauri dev` for dev mode, `cargo tauri build` for release
- **Frontend location:** `src-ui/` (not default `src/` -- scaffolding must adjust)
- **Branch strategy:** main (releases), develop (active work)
- **GSD workflow:** Must use GSD commands before modifying files

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tauri-apps/cli | 2.10.1 | Tauri CLI for dev/build | Official Tauri CLI |
| @tauri-apps/api | 2.10.1 | Frontend-to-Rust IPC | Official Tauri frontend API |
| react | 19.2.4 | UI framework | Project requirement |
| react-dom | 19.2.4 | React DOM renderer | Required by React |
| typescript | 6.0.2 | Type safety | Project requirement |
| vite | 8.0.3 | Build tool / dev server | Tauri 2 default bundler |
| tailwindcss | 4.2.2 | Utility CSS framework | Project requirement |
| @tailwindcss/vite | 4.2.2 | Tailwind Vite plugin (v4) | Required for Tailwind v4 with Vite |
| zustand | 5.0.12 | Client state management | Project requirement (CLAUDE.md) |

### Rust Crates (src-tauri/Cargo.toml)
| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| tauri | 2 | App framework | Core framework with `tray-icon` feature |
| serde | 1 (with derive) | Serialization | Required for Tauri IPC types |
| serde_json | 1 | JSON handling | Config and IPC serialization |
| thiserror | 2 | Error types | Clean error handling for Tauri commands |

### Not Needed This Phase
| Library | Why Deferred |
|---------|-------------|
| git2 | Phase 02 (git operations) |
| notify | Phase 04 (file watching) |
| tokio | Phase 02+ (async operations beyond Tauri's built-in runtime) |
| tauri-plugin-shell | Phase 03 (process launching) |

### Installation

**Frontend (from src-ui/):**
```bash
npm install react react-dom @tauri-apps/api zustand
npm install -D typescript @tauri-apps/cli vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

**Or use scaffolding tool:**
```bash
npm create tauri-app@latest -- --template react-ts
```
Then add Tailwind v4 and Zustand manually.

## Architecture Patterns

### Project Structure (per CLAUDE.md)
```
grove/
  src-ui/                    # React frontend (CLAUDE.md says src-ui, not src)
    src/
      main.tsx               # React entry point
      App.tsx                # Root component
      components/            # UI components
      hooks/                 # Custom React hooks
      api/                   # Tauri invoke wrappers
    index.html               # Vite HTML entry
    vite.config.ts           # Vite + Tailwind config
    package.json
    tsconfig.json
  src-tauri/                 # Rust backend
    src/
      lib.rs                 # Tauri setup, tray, window management
      main.rs                # Entry point (generated, calls lib::run)
    Cargo.toml
    tauri.conf.json          # Tauri configuration
    capabilities/
      default.json           # Permission scopes
    icons/                   # App + tray icons
  CLAUDE.md
  README.md
```

### Pattern 1: Tray-Resident App
**What:** App lives primarily in the system tray. Main window shows/hides on tray click. Closing the window hides it instead of quitting.
**When to use:** Always -- this is Grove's core UX pattern.
**Implementation:**
1. Set `"visible": false` in window config to start hidden
2. Build tray in `setup()` with `TrayIconBuilder`
3. Left-click toggles window visibility
4. Right-click shows context menu (Open, Quit)
5. Window close event intercepted with `api.prevent_close()` to hide instead
**Source:** `.planning/research/system-tray.md` (verified against Tauri 2 docs)

### Pattern 2: Tailwind CSS v4 with Vite
**What:** Tailwind v4 uses a Vite plugin instead of PostCSS config. No `tailwind.config.js` needed.
**Setup:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```
```css
/* src/index.css */
@import "tailwindcss";
```
**Source:** [Tailwind CSS v4 installation docs](https://tailwindcss.com/docs)

### Pattern 3: Tauri Configuration for src-ui
**What:** The `create-tauri-app` scaffolding puts frontend in root. CLAUDE.md requires `src-ui/`. Configuration must point Tauri at the correct frontend directory.
**Key config:**
```json
{
  "build": {
    "frontendDist": "../src-ui/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "cd ../src-ui && npm run dev",
    "beforeBuildCommand": "cd ../src-ui && npm run build"
  }
}
```

### Anti-Patterns to Avoid
- **Don't put frontend in project root:** CLAUDE.md explicitly says `src-ui/` for the frontend.
- **Don't use Tailwind v3 patterns:** No `tailwind.config.js`, no PostCSS config. Use the v4 Vite plugin.
- **Don't create tray from JavaScript:** Build tray from Rust `setup()` for a tray-resident app.
- **Don't use `tauri::Builder::default().run()`:** Use the two-file pattern (`main.rs` calls `lib::run()`) so Tauri can properly generate context.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System tray | Custom Win32 tray code | Tauri `tray-icon` feature | Cross-platform, maintained, event handling built in |
| Window show/hide | Manual webview management | Tauri window API (`show()`, `hide()`, `set_focus()`) | Handles focus, minimize, taskbar properly |
| Installer | Manual NSIS/WiX scripts | `cargo tauri build` (Tauri bundler) | Auto-generates MSI + NSIS with signing support |
| CSS utilities | Custom CSS classes | Tailwind CSS v4 | Industry standard, no maintenance burden |
| Build pipeline | Custom build scripts | GitHub Actions + tauri-action | Official action, handles Rust caching, artifact upload |

## Common Pitfalls

### Pitfall 1: Frontend Directory Mismatch
**What goes wrong:** Tauri can't find frontend assets because paths in `tauri.conf.json` don't match the actual `src-ui/` structure.
**Why it happens:** Default scaffolding assumes frontend is in project root or `src/`.
**How to avoid:** Verify `frontendDist`, `devUrl`, `beforeDevCommand`, and `beforeBuildCommand` all reference `src-ui/` correctly. Test `cargo tauri dev` immediately after setup.
**Warning signs:** "Could not find `dist` directory" errors on build.

### Pitfall 2: MSVC Toolchain Not Set
**What goes wrong:** Rust compilation fails with linker errors on Windows.
**Why it happens:** Default Rust install may use `stable-gnu` instead of `stable-msvc`.
**How to avoid:** Install with `rustup default stable-msvc`. Verify with `rustup show`.
**Warning signs:** "linking with `link.exe` failed" or "cannot find -lgcc" errors.

### Pitfall 3: Window Close Quits the App
**What goes wrong:** User closes the window expecting it to minimize to tray, but the entire app exits.
**Why it happens:** Default Tauri behavior exits when all windows close.
**How to avoid:** Intercept `CloseRequested` event with `api.prevent_close()` and `window.hide()`. Also set `app.on_window_event()` appropriately.
**Warning signs:** App disappears from tray when window is closed.

### Pitfall 4: Multiple Tray Icons on Restart
**What goes wrong:** Each `cargo tauri dev` restart creates a new tray icon without removing the old one.
**Why it happens:** Windows caches tray icons until mouseover.
**How to avoid:** This is a dev-mode cosmetic issue, not a bug. Set explicit tray ID with `.id("grove-tray")` to prevent duplicates in production.
**Warning signs:** Ghost tray icons accumulating during development.

### Pitfall 5: Tailwind v4 Config File Confusion
**What goes wrong:** Tailwind classes don't work, or build errors about missing config.
**Why it happens:** Copying v3 setup guides that use `tailwind.config.js` and PostCSS.
**How to avoid:** Use `@tailwindcss/vite` plugin only. Single `@import "tailwindcss"` in CSS. No config file needed.
**Warning signs:** "Cannot find module 'tailwindcss'" in PostCSS context.

### Pitfall 6: Installer Size Bloat
**What goes wrong:** Installer exceeds 20MB (NFR-01.4).
**Why it happens:** Embedding WebView2 offline installer adds ~127MB. Debug symbols included.
**How to avoid:** Use default `downloadBootstrapper` mode (or `embedBootstrapper` for +1.8MB). Ensure release profile strips symbols.
**Warning signs:** Installer > 10MB for a minimal app.

## Code Examples

### Tray-Resident App Setup (lib.rs)
```rust
// Source: .planning/research/system-tray.md (verified against v2.tauri.app/learn/system-tray/)
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Grove", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

            let _tray = TrayIconBuilder::new()
                .id("grove-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Grove - Manage your trees")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Intercept window close to hide instead of quit
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### tauri.conf.json (adapted for src-ui/)
```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "Grove",
  "version": "0.1.0",
  "identifier": "com.grove.app",
  "build": {
    "frontendDist": "../src-ui/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "cd ../src-ui && npm run dev",
    "beforeBuildCommand": "cd ../src-ui && npm run build"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "main",
        "title": "Grove",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "visible": false
      }
    ],
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": false,
      "id": "grove-tray"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

### GitHub Actions Workflow
```yaml
# Source: https://v2.tauri.app/distribute/pipelines/github/
name: Build & Release

on:
  workflow_dispatch:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        working-directory: ./src-ui
        run: npm install

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: 'Grove v__VERSION__'
          releaseBody: 'See assets to download and install.'
          releaseDraft: true
          prerelease: false
          projectPath: ./src-tauri
```

### Minimal React App (src-ui/src/App.tsx)
```typescript
function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Grove</h1>
        <p className="text-gray-400">Manage your trees.</p>
      </div>
    </div>
  );
}

export default App;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 + PostCSS config + tailwind.config.js | Tailwind v4 + Vite plugin + `@import "tailwindcss"` | Jan 2025 (v4.0) | No config files needed, Vite plugin replaces PostCSS |
| Tauri 1.x system tray API | Tauri 2.x `tray-icon` feature + `TrayIconBuilder` | Oct 2024 (Tauri 2.0) | New API surface, menu builder pattern |
| `tauri::Builder.run()` single-file | `main.rs` + `lib.rs` two-file pattern | Tauri 2.0 | Required for proper context generation |
| TypeScript 5.x | TypeScript 6.0 | 2025 | New version available; verify Vite/React plugin compatibility |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build | Yes | v24.14.0 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| Rust toolchain | Tauri backend | **NO** | -- | Must install: `winget install Rustlang.Rustup` then `rustup default stable-msvc` |
| Visual Studio C++ Build Tools | Rust compilation on Windows | Unknown | -- | Must verify; install via Visual Studio Installer if missing |
| WebView2 | Tauri runtime | Yes (Windows 11) | Built-in | -- |
| GitHub CLI | CI workflow setup | Yes | 2.88.1 | -- |
| winget | Rust installation | Yes | Available | -- |

**Missing dependencies with no fallback:**
- **Rust toolchain:** Not installed. MUST install before any Tauri development. `winget install Rustlang.Rustup && rustup default stable-msvc`
- **Visual Studio C++ Build Tools:** Cannot verify from this shell. Required for Rust MSVC linking on Windows. Install "Desktop development with C++" workload.

**Missing dependencies with fallback:**
- None.

## Open Questions

1. **Visual Studio Build Tools status**
   - What we know: Required for Rust MSVC compilation on Windows
   - What's unclear: Whether already installed on this machine (cannot check from bash shell)
   - Recommendation: First task should attempt `cargo check` after Rust install. If linker errors, install VS Build Tools.

2. **create-tauri-app with src-ui/ directory**
   - What we know: Scaffolding puts frontend in default location. CLAUDE.md requires `src-ui/`.
   - What's unclear: Whether `create-tauri-app` supports custom frontend directory or if we must move files after scaffolding.
   - Recommendation: Scaffold with defaults, then restructure to `src-ui/` and update `tauri.conf.json` paths. Alternatively, scaffold manually (Vite in `src-ui/` + `cargo tauri init` in `src-tauri/`).

3. **TypeScript 6.0 compatibility**
   - What we know: npm registry shows TypeScript 6.0.2 as latest. Tauri and Vite were built against TS 5.x.
   - What's unclear: Whether TS 6.0 introduces breaking changes with Vite 8 or React 19 types.
   - Recommendation: Use whatever version `create-tauri-app` installs. If it pins TS 5.x, keep it. Do not force-upgrade to 6.0 without testing.

## Sources

### Primary (HIGH confidence)
- `.planning/research/tauri-setup.md` -- Tauri 2 setup, IPC patterns, gotchas (verified against official docs)
- `.planning/research/system-tray.md` -- System tray implementation patterns (verified against official docs)
- `.planning/research/SUMMARY.md` -- Architecture decisions and phase rationale
- [Tauri 2 System Tray Guide](https://v2.tauri.app/learn/system-tray/) -- Official tray documentation
- [Tauri 2 GitHub Actions Pipeline](https://v2.tauri.app/distribute/pipelines/github/) -- Official CI docs
- [Tauri 2 Windows Installer](https://v2.tauri.app/distribute/windows-installer/) -- Installer configuration
- [Tailwind CSS v4 Installation](https://tailwindcss.com/docs) -- Official v4 Vite plugin setup
- npm registry -- All package versions verified 2026-03-27

### Secondary (MEDIUM confidence)
- [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action) -- GitHub Action for builds
- [Tauri 2 Configuration Reference](https://v2.tauri.app/reference/config/) -- Full config schema

### Tertiary (LOW confidence)
- TypeScript 6.0 compatibility with Tauri ecosystem -- no official confirmation found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry, Tauri 2 is stable
- Architecture: HIGH -- patterns from existing research verified against official Tauri 2 docs
- Pitfalls: HIGH -- documented from official sources and existing research
- CI/Build pipeline: HIGH -- official tauri-action and docs verified
- Environment: MEDIUM -- Rust not installed, VS Build Tools status unknown

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable ecosystem, 30 days)
