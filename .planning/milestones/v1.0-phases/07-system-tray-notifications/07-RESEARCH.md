# Phase 07: System Tray & Notifications - Research

**Researched:** 2026-03-27
**Domain:** Tauri 2 system tray, desktop notifications, Windows autostart
**Confidence:** HIGH

## Summary

This phase extends Grove's existing tray icon (basic Open/Quit menu from Phase 01) with dynamic quick-action menus, Windows toast notifications for branch status changes, auto-start with Windows via the official Tauri autostart plugin, and a configurable auto-fetch interval for detecting remote changes.

The existing codebase provides strong foundations: the tray icon is already built with `TrayIconBuilder`, the file watcher emits `git-changed` events, the branch listing includes ahead/behind counts (merge-ready detection), and the Settings model already has `start_with_windows` and `start_minimized` fields. The main work is wiring these together with two new Tauri plugins (`notification`, `autostart`) and adding backend logic for periodic git fetch and dynamic tray menu rebuilds.

**Primary recommendation:** Use official Tauri plugins (`tauri-plugin-notification` + `tauri-plugin-autostart`), rebuild the tray menu dynamically via `TrayIcon::set_menu()` when project/branch state changes, and add a background fetch timer thread that emits events the watcher thread already handles.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion -- infrastructure phase with established patterns. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-05.1 | App runs as system tray icon with context menu | Already implemented in Phase 01 (lib.rs). Extend with dynamic submenu items. |
| FR-05.2 | Tray menu: quick-launch list of recent worktrees, open dashboard, quit | Use `Submenu` with dynamic `MenuItem` items built from branch/session state. Rebuild via `TrayIcon::set_menu()`. |
| FR-05.3 | Tray notifications: branch is merge-ready, branch is stale, merge completed | Use `tauri-plugin-notification`. Trigger from watcher events + branch status analysis. |
| FR-05.4 | Left-click tray icon opens dashboard, right-click opens menu | Already implemented in Phase 01 (lib.rs lines 64-83). No changes needed. |
| FR-05.5 | App starts minimized to tray (configurable) | Window already starts hidden (`visible: false` in tauri.conf.json). Wire `start_minimized` setting to control initial show/hide. |
| FR-05.6 | Start with Windows option | Use `tauri-plugin-autostart`. Wire to existing `start_with_windows` Settings field. |
| FR-06.5 | Detect remote changes on fetch (configurable auto-fetch interval) | New background timer that runs `git fetch` via git2 on each registered project. Emit events so watcher/dashboard refresh. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Tauri 2 + React 19 + TypeScript + Tailwind CSS stack
- Zustand for client state
- Global config at `%APPDATA%/grove/config.json`; per-project configs embedded
- Snake_case TypeScript types matching Rust serde
- Existing tray-resident pattern: window starts hidden, close hides to tray
- NAS workaround: `scripts/with-modules.mjs` for npm commands
- GSD workflow enforcement for all file changes

## Standard Stack

### Core (New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri-plugin-notification (Rust) | 2.3.3 | Desktop toast notifications | Official Tauri plugin, Windows toast support |
| @tauri-apps/plugin-notification (JS) | 2.3.3 | Frontend notification API | Official JS bindings for notification plugin |
| tauri-plugin-autostart (Rust) | 2.5.1 | Start with Windows (registry) | Official Tauri plugin, handles HKCU\Run registry key |
| @tauri-apps/plugin-autostart (JS) | 2.5.1 | Frontend autostart enable/disable/check | Official JS bindings for autostart plugin |

### Existing (Already in Project)
| Library | Version | Purpose | Relevant To |
|---------|---------|---------|-------------|
| tauri (Rust) | 2.x | App framework with tray-icon feature | Tray menu rebuild, event emission |
| git2 (Rust) | 0.20 | Git operations | Auto-fetch via `Remote::fetch()` |
| notify + notify-debouncer-mini | 8.2 / 0.7 | File watching | Already emits git-changed events |
| zustand (JS) | 5.x | Client state | Notification preferences UI state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tauri-plugin-notification | tauri-plugin-notifications (community) | Community plugin has richer features (scheduling, FCM/APNs) but overkill for desktop-only toast notifications |
| tauri-plugin-autostart | Manual registry writes | Autostart plugin handles cross-platform, cleaner than raw winreg |

**Installation:**
```bash
# Rust (from src-tauri/)
cargo add tauri-plugin-notification
cargo add tauri-plugin-autostart

# JavaScript (from src-ui/)
npm install @tauri-apps/plugin-notification @tauri-apps/plugin-autostart
```

## Architecture Patterns

### Tray Menu Rebuild Pattern

The existing tray is built once in `setup()`. For FR-05.2, the tray menu must be rebuilt dynamically when project/branch state changes. Tauri 2 supports this via `TrayIcon::set_menu()`.

**Pattern:** Store the tray icon ID ("grove-tray"), retrieve it via `app.tray_by_id("grove-tray")`, and call `set_menu()` with a freshly built `Menu` whenever state changes.

```rust
// Retrieve tray and rebuild menu
fn rebuild_tray_menu(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let tray = app.tray_by_id("grove-tray")
        .ok_or("Tray not found")?;

    // Load current config for recent worktrees
    let config = crate::config::persistence::load_or_create_config(app)?;

    // Build dynamic menu items
    let show = MenuItem::with_id(app, "show", "Open Grove", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    // Dynamic worktree items from recent sessions
    let worktree_submenu = SubmenuBuilder::new(app, "Recent Worktrees")
        .text("wt-0", "wt/feature-a")
        .text("wt-1", "wt/feature-b")
        .build()?;

    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &show, &separator1, &worktree_submenu, &settings, &separator2, &quit
    ])?;

    tray.set_menu(Some(menu))?;
    Ok(())
}
```

### Notification Trigger Pattern

Notifications should fire from the Rust backend (not frontend) since the window may be hidden. The watcher already detects git changes. Add a notification layer that:

1. On `git-changed` event with `refs_changed` type, re-evaluate branch status
2. Compare with previous state to detect transitions (not-merge-ready -> merge-ready)
3. Send notification only on state transitions (avoid spam)

```rust
use tauri_plugin_notification::NotificationExt;

fn notify_merge_ready(app: &tauri::AppHandle, branch_name: &str, project_name: &str) {
    let _ = app.notification()
        .builder()
        .title("Branch Ready to Merge")
        .body(&format!("{} in {} is merge-ready", branch_name, project_name))
        .show();
}
```

### Auto-Fetch Timer Pattern

A background thread with a configurable sleep interval that runs `git fetch` on each registered project's default remote.

```rust
fn start_auto_fetch(app: tauri::AppHandle, interval_secs: u64) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(interval_secs));
            // Load config to get current project list
            if let Ok(config) = load_or_create_config(&app) {
                for project in &config.projects {
                    if let Err(e) = fetch_remote(&project.path) {
                        eprintln!("[grove] auto-fetch failed for {}: {}", project.name, e);
                    }
                }
            }
            // Emit event so dashboard refreshes
            let _ = app.emit("git-changed", GitChangeEvent {
                project_path: "all".to_string(),
                change_type: "fetch_complete".to_string(),
            });
        }
    });
}

fn fetch_remote(project_path: &str) -> Result<(), git2::Error> {
    let repo = Repository::open(project_path)?;
    let mut remote = repo.find_remote("origin")?;
    remote.fetch(&[] as &[&str], None, None)?;
    Ok(())
}
```

### Autostart Wiring Pattern

The `Settings` model already has `start_with_windows: bool`. When this setting changes, call the autostart plugin's enable/disable from the frontend.

```typescript
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

async function toggleAutostart(enabled: boolean) {
    if (enabled) {
        await enable();
    } else {
        await disable();
    }
}
```

### Settings Model Extension

The `Settings` struct needs new fields for notification preferences and auto-fetch interval:

```rust
pub struct Settings {
    // ... existing fields ...
    #[serde(default = "default_auto_fetch_interval")]
    pub auto_fetch_interval: u32,  // seconds, 0 = disabled
    #[serde(default = "default_true")]
    pub notify_merge_ready: bool,
    #[serde(default = "default_true")]
    pub notify_stale_branch: bool,
    #[serde(default = "default_true")]
    pub notify_merge_complete: bool,
}
```

### Anti-Patterns to Avoid
- **Rebuilding tray menu on every tick:** Only rebuild when state actually changes (project added/removed, branch list changes). Use a dirty flag or hash comparison.
- **Notifications on every poll:** Track previous branch states and only notify on transitions (e.g., branch was not merge-ready, now is).
- **Blocking the main thread with git fetch:** Always run fetch in a background thread. Network operations can hang for seconds.
- **Storing notification state in frontend:** The window may be hidden. All notification logic must live in the Rust backend.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows autostart | Manual registry writes to HKCU\Run | `tauri-plugin-autostart` | Handles cross-platform, proper exe path resolution, cleanup on uninstall |
| Desktop notifications | Win32 toast notification API | `tauri-plugin-notification` | Handles permission model, cross-platform, integrates with Tauri lifecycle |
| Tray menu building | Custom Win32 tray implementation | Tauri's built-in `TrayIconBuilder` + `Menu` + `Submenu` | Already in use, battle-tested, handles DPI and platform quirks |

## Common Pitfalls

### Pitfall 1: Notification Permission on Windows
**What goes wrong:** On Windows, notification permission is typically granted by default but can be disabled in Windows Settings > Notifications.
**Why it happens:** Unlike macOS, Windows doesn't always prompt. The app may silently fail to show notifications.
**How to avoid:** Always call `isPermissionGranted()` before sending. If not granted, call `requestPermission()`. Show a settings hint in the UI if notifications are disabled.
**Warning signs:** Notifications work in dev but not after install.

### Pitfall 2: Tray Menu Event Handler Lifetime
**What goes wrong:** After `set_menu()`, the old menu's event handler closures may not be properly cleaned up, or the new menu doesn't have handlers registered.
**Why it happens:** `on_menu_event` is set on the TrayIcon, not the Menu. The handler registered during `TrayIconBuilder::build()` persists across menu replacements.
**How to avoid:** Register a single `on_menu_event` handler during tray creation that handles ALL possible menu item IDs (including dynamic worktree IDs). Use a naming convention (e.g., `wt-{index}`) to pattern-match dynamic items.
**Warning signs:** Menu items appear but clicks do nothing.

### Pitfall 3: Git Fetch Credentials / SSH
**What goes wrong:** `git2::Remote::fetch()` fails when the remote requires SSH keys or credentials.
**Why it happens:** git2 doesn't automatically use the system's SSH agent or credential helper like the git CLI does.
**How to avoid:** Configure git2 `RemoteCallbacks` with credential handling, or fall back to shelling out to `git fetch` via `std::process::Command` which inherits the user's git configuration.
**Warning signs:** Auto-fetch works for local repos but fails for GitHub remotes.

### Pitfall 4: Notification Spam
**What goes wrong:** Every 30-second poll triggers a "merge ready" notification for branches that have been merge-ready for days.
**Why it happens:** No state tracking -- notifications fire whenever the condition is true, not when it transitions to true.
**How to avoid:** Maintain a `HashMap<String, BranchState>` in managed state. Only notify when a branch's state CHANGES (e.g., from not-merge-ready to merge-ready). Reset state when the branch is merged or deleted.
**Warning signs:** Users immediately disable notifications because they're flooded.

### Pitfall 5: Auto-Fetch Interval Zero
**What goes wrong:** If `auto_fetch_interval` is set to 0, the background thread spins in a tight loop or crashes.
**Why it happens:** Division by zero or `Duration::from_secs(0)` causing instant re-loop.
**How to avoid:** Treat 0 as "disabled" -- don't start the fetch thread. Enforce a minimum (e.g., 60 seconds) in the settings validation.
**Warning signs:** CPU spikes after changing fetch interval to 0.

### Pitfall 6: Stale Branch Definition
**What goes wrong:** "Stale" notification fires for branches the user intentionally parked.
**Why it happens:** No clear definition of stale vs. intentionally inactive.
**How to avoid:** Use a configurable threshold (default: 7 days since last commit). Only notify once per branch per stale transition. Consider a "snooze" or "archive" concept in future phases.
**Warning signs:** Users get annoyed by stale notifications for parked feature branches.

## Code Examples

### Plugin Registration (lib.rs)

```rust
// Add to the plugin chain in run()
tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,  // no extra args
    ))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    // ... rest of builder
```

### Capability Permissions (capabilities/default.json)

```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "opener:default",
    "notification:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

### Dynamic Tray Menu with Worktree Submenu (Rust)

```rust
use tauri::menu::{Menu, MenuItem, MenuBuilder, PredefinedMenuItem, SubmenuBuilder};

fn build_tray_menu(app: &tauri::AppHandle, worktrees: &[(String, String)]) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Open Grove", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    // Build worktree submenu dynamically
    let mut submenu = SubmenuBuilder::new(app, "Recent Worktrees");
    for (i, (name, _path)) in worktrees.iter().enumerate().take(10) {
        submenu = submenu.text(format!("wt-{}", i), name);
    }
    let worktree_menu = submenu.build()?;

    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &sep1, &worktree_menu, &settings, &sep2, &quit])?;
    Ok(menu)
}
```

### Notification with State Tracking (Rust)

```rust
use std::collections::HashMap;
use std::sync::Mutex;

struct NotificationState {
    /// Tracks which branches have been notified as merge-ready
    merge_ready_notified: HashMap<String, bool>,
    /// Tracks which branches have been notified as stale
    stale_notified: HashMap<String, bool>,
}

fn check_and_notify(
    app: &tauri::AppHandle,
    state: &Mutex<NotificationState>,
    branches: &[BranchInfo],
    project_name: &str,
) {
    let mut ns = state.lock().unwrap();
    for branch in branches {
        let is_merge_ready = branch.ahead > 0 && !branch.is_dirty;
        let key = format!("{}:{}", project_name, branch.name);
        let was_notified = ns.merge_ready_notified.get(&key).copied().unwrap_or(false);

        if is_merge_ready && !was_notified {
            // State transition: notify
            notify_merge_ready(app, &branch.name, project_name);
            ns.merge_ready_notified.insert(key, true);
        } else if !is_merge_ready {
            // Reset so we can notify again if it becomes merge-ready later
            ns.merge_ready_notified.insert(key, false);
        }
    }
}
```

### Autostart Toggle from Frontend (TypeScript)

```typescript
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';

export async function syncAutostart(startWithWindows: boolean): Promise<void> {
    if (startWithWindows) {
        await enable();
    } else {
        await disable();
    }
}

// Call after settings save
export async function checkAutostartSync(): Promise<boolean> {
    return await isEnabled();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Win32 registry for autostart | `tauri-plugin-autostart` official plugin | Tauri 2.0 stable (2024) | Cross-platform, no unsafe code |
| Tauri v1 `SystemTray` | Tauri v2 `TrayIconBuilder` + `TrayIcon` | Tauri 2.0 (2024) | New API, `set_menu()` for dynamic updates |
| Tauri v1 `notification` (built-in) | `tauri-plugin-notification` (separate plugin) | Tauri 2.0 (2024) | Must install as plugin, more capability control |

## Open Questions

1. **Git fetch credentials**
   - What we know: `git2::Remote::fetch()` requires credential callbacks for authenticated remotes. The user's repos may use SSH or HTTPS credentials.
   - What's unclear: Whether git2 can inherit the system's credential helper or SSH agent automatically.
   - Recommendation: Try `git2` first with default credential callbacks. If it fails, fall back to `std::process::Command::new("git").args(["fetch"])` which inherits the user's full git config. This is the safer approach.

2. **Tray menu event handler for dynamic items**
   - What we know: `on_menu_event` is registered once on the TrayIcon and persists across `set_menu()` calls.
   - What's unclear: Whether the event handler receives events for menu items added after initial registration.
   - Recommendation: Register a single handler that pattern-matches on menu item ID prefixes (e.g., IDs starting with "wt-" are worktree launches). Test this early.

3. **Notification rate limiting**
   - What we know: Windows doesn't aggressively rate-limit toast notifications but users find spam annoying.
   - What's unclear: Exact Windows behavior if many notifications fire rapidly.
   - Recommendation: Implement state-transition-only notifications AND a minimum interval between notifications (e.g., 60 seconds). This is a UX decision, not a platform limitation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo (Rust) | All Rust plugins | Assumed (project builds) | - | - |
| npm | JS plugin packages | Assumed (project builds) | - | - |
| git CLI | Auto-fetch fallback | Check at runtime | - | git2 library (already used) |

No external service dependencies. All new functionality uses Tauri plugins that are Rust crates + npm packages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (Rust) |
| Config file | src-tauri/Cargo.toml |
| Quick run command | `cargo test` (from src-tauri/) |
| Full suite command | `cargo test && cd src-ui && npm run typecheck` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-05.2 | Tray menu includes worktree items | manual | Manual tray inspection | N/A |
| FR-05.3 | Notifications fire on state transitions | unit | `cargo test notification` | Wave 0 |
| FR-05.5 | Start minimized honors setting | manual | Manual launch test | N/A |
| FR-05.6 | Autostart enables/disables | manual | Manual registry check | N/A |
| FR-06.5 | Auto-fetch runs on interval | unit | `cargo test auto_fetch` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo check && cargo clippy`
- **Per wave merge:** `cargo test && cd src-ui && npm run typecheck`
- **Phase gate:** Full suite green + manual tray/notification verification

### Wave 0 Gaps
- [ ] Notification state transition logic is unit-testable (pure function, no Tauri dependency)
- [ ] Auto-fetch interval logic is unit-testable (timer setup, project iteration)
- [ ] TypeScript types for new settings fields

## Sources

### Primary (HIGH confidence)
- [Tauri Notification Plugin docs](https://v2.tauri.app/plugin/notification/) - Setup, permissions, JS API
- [Tauri Autostart Plugin docs](https://v2.tauri.app/plugin/autostart/) - Setup, permissions, JS API
- [Tauri TrayIcon Rust API](https://docs.rs/tauri/2.10.2/tauri/tray/struct.TrayIcon.html) - `set_menu()`, `app_handle()`, full method list
- [Tauri Window Menu docs](https://v2.tauri.app/learn/window-menu/) - SubmenuBuilder, dynamic updates
- [Tauri System Tray docs](https://v2.tauri.app/learn/system-tray/) - TrayIconBuilder, event handling

### Secondary (MEDIUM confidence)
- [Tauri tray dynamic update discussion](https://github.com/tauri-apps/tauri/discussions/8508) - Runtime menu updates confirmed working
- [npm @tauri-apps/plugin-notification](https://www.npmjs.com/package/@tauri-apps/plugin-notification) - Version 2.3.3 confirmed
- [npm @tauri-apps/plugin-autostart](https://www.npmjs.com/package/@tauri-apps/plugin-autostart) - Version 2.5.1 confirmed

### Tertiary (LOW confidence)
- Git2 credential handling for fetch -- needs runtime validation (Pitfall 3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Tauri plugins with verified versions
- Architecture: HIGH - Extends existing patterns (tray, watcher, config) with well-documented APIs
- Pitfalls: HIGH - Based on direct codebase analysis and Tauri API docs
- Git fetch credentials: LOW - Needs runtime testing with real SSH/HTTPS remotes

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable Tauri 2 ecosystem)
