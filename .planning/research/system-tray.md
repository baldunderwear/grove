# System Tray Integration (Tauri 2)

**Researched:** 2026-03-27
**Confidence:** HIGH (official docs verified with code examples)

## Overview

Tauri 2 has first-class system tray support via the `tray-icon` feature flag. The API is available from both Rust and JavaScript, but **build the tray from Rust** for a tray-centric app like Grove. JavaScript tray creation is for dynamic/runtime tray needs.

## Setup

### Cargo.toml

```toml
tauri = { version = "2", features = ["tray-icon"] }
```

### Icon

Place a 16x16 or 32x32 PNG/ICO in `src-tauri/icons/`. Windows uses ICO natively but Tauri handles PNG conversion.

## Implementation Pattern for Grove

Grove should be a **tray-resident app** -- the tray is the primary interface, with a window that shows/hides on click.

### Rust Setup (lib.rs)

```rust
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Build the tray menu
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;

            // Dynamic worktree items would be added here
            let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Grove - Git Worktree Manager")
                .menu(&menu)
                .menu_on_left_click(false) // Left click = show window, right click = menu
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        id => {
                            // Handle dynamic worktree menu items
                            println!("clicked worktree: {}", id);
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
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
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Window Close = Hide (Not Exit)

For a tray app, closing the window should hide it, not quit:

```rust
// In setup, after getting the window:
let window = app.get_webview_window("main").unwrap();
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        // Hide instead of close
        let _ = window.hide();
    }
});
```

### Dynamic Menu Updates

When worktrees change, rebuild the tray menu:

```rust
use tauri::tray::TrayIcon;

fn update_tray_menu(app: &tauri::AppHandle, worktrees: &[WorktreeInfo]) -> Result<(), Box<dyn std::error::Error>> {
    let tray = app.tray_by_id("main").unwrap();

    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![];

    for wt in worktrees {
        let label = format!("{} ({})", wt.name, wt.branch);
        let item = MenuItem::with_id(app, &wt.name, &label, true, None::<&str>)?;
        items.push(Box::new(item));
    }

    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;

    // Rebuild menu with worktree items + standard items
    // ... construct and set menu
    Ok(())
}
```

## Supported Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| Click (Left) | Left mouse click | Toggle window visibility |
| Click (Right) | Right mouse click | Show context menu (default) |
| DoubleClick | Double left click | Open specific worktree |
| Enter | Cursor enters tray area | Show tooltip |
| Move | Cursor moves over tray | Update tooltip |
| Leave | Cursor leaves tray area | -- |

## Gotchas

1. **Linux tray is limited** -- Click events don't fire on Linux (GNOME/KDE tray implementations vary). Right-click menu still works. Not relevant for Grove (Windows-only) but worth knowing.
2. **Icon size** -- Windows expects 16x16 for tray, 32x32 for high DPI. Provide both in an ICO file for best results.
3. **Menu rebuild cost** -- Rebuilding the entire menu on every worktree change is fine for the scale Grove operates at (dozens of worktrees max, not thousands).
4. **Tray ID** -- If you need to reference the tray later (for menu updates), use `TrayIconBuilder::new().id("main")` to set an explicit ID.
5. **Multiple tray icons** -- Tauri supports multiple tray icons. Don't accidentally create duplicates in setup.

## Sources

- [Tauri 2 System Tray Guide](https://v2.tauri.app/learn/system-tray/)
- [Tauri Multi-Window and System Tray Guide](https://www.oflight.co.jp/en/columns/tauri-v2-multi-window-system-tray)
- [System Tray Concept to Implementation](https://medium.com/@sjobeiri/understanding-the-system-tray-from-concept-to-tauri-v2-implementation-252f278bb57c)
