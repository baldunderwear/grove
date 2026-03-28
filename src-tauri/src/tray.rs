use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// Build the system tray icon, register event handlers, and set the initial menu.
///
/// This should be called once during `setup()`. The menu event handler is registered
/// on the TrayIcon itself and persists across `set_menu()` calls — dynamic menu items
/// added later via `rebuild_tray_menu()` will route events through the same handler.
pub fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let _tray = TrayIconBuilder::with_id("grove-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Grove - Manage your trees")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();
            match id {
                "quit" => app.exit(0),
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "settings" => {
                    // Show window and navigate to settings
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("navigate", "settings");
                }
                _ if id.starts_with("wt-") => {
                    // Extract worktree index from "wt-N" ID
                    if let Some(idx_str) = id.strip_prefix("wt-") {
                        if let Ok(idx) = idx_str.parse::<usize>() {
                            // Look up worktree path from config
                            if let Ok(config) =
                                crate::config::persistence::load_or_create_config(app)
                            {
                                if let Some(project) = config.projects.first() {
                                    if let Ok(branches) =
                                        crate::git::branches::list_worktree_branches(
                                            &project.path,
                                            &project.branch_prefix,
                                            &project.merge_target,
                                        )
                                    {
                                        // Filter to branches with active worktree paths,
                                        // sorted by most recent commit
                                        let mut active: Vec<_> = branches
                                            .into_iter()
                                            .filter(|b| !b.worktree_path.is_empty())
                                            .collect();
                                        active.sort_by(|a, b| {
                                            b.last_commit_timestamp.cmp(&a.last_commit_timestamp)
                                        });
                                        if let Some(branch) = active.get(idx) {
                                            let _ = app.emit(
                                                "launch-worktree",
                                                &branch.worktree_path,
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click toggles window visibility (FR-05.4)
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

    // Intercept window close to hide instead of quit (tray-resident pattern)
    if let Some(window) = app.get_webview_window("main") {
        let w = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
            }
        });
    }

    // Set initial menu
    rebuild_tray_menu(app.handle())?;

    Ok(())
}

/// Rebuild the tray context menu with current project/worktree state.
///
/// Menu structure:
/// ```text
/// Open Grove          (id: "show")
/// ─────────────────
/// Recent Worktrees >  (submenu, if project registered)
///   wt/feature-a      (id: "wt-0")
///   wt/feature-b      (id: "wt-1")
///   ...
/// Settings            (id: "settings")
/// ─────────────────
/// Quit Grove          (id: "quit")
/// ```
pub fn rebuild_tray_menu(
    app: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(tray) = app.tray_by_id("grove-tray") else {
        return Err("Tray icon not found".into());
    };

    let show = MenuItem::with_id(app, "show", "Open Grove", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    // Try to load worktree branches for the first project
    let has_worktrees =
        if let Ok(config) = crate::config::persistence::load_or_create_config(app) {
            if let Some(project) = config.projects.first() {
                if let Ok(branches) = crate::git::branches::list_worktree_branches(
                    &project.path,
                    &project.branch_prefix,
                    &project.merge_target,
                ) {
                    let mut active: Vec<_> = branches
                        .into_iter()
                        .filter(|b| !b.worktree_path.is_empty())
                        .collect();
                    active.sort_by(|a, b| b.last_commit_timestamp.cmp(&a.last_commit_timestamp));
                    let active: Vec<_> = active.into_iter().take(10).collect();

                    if !active.is_empty() {
                        let mut submenu =
                            SubmenuBuilder::with_id(app, "recent-worktrees", "Recent Worktrees");
                        for (i, branch) in active.iter().enumerate() {
                            let item_id = format!("wt-{}", i);
                            let item =
                                MenuItem::with_id(app, &item_id, &branch.name, true, None::<&str>)?;
                            submenu = submenu.item(&item);
                        }
                        let submenu = submenu.build()?;

                        let menu = Menu::with_items(
                            app,
                            &[&show, &sep1, &submenu, &settings, &sep2, &quit],
                        )?;
                        tray.set_menu(Some(menu))?;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };

    if !has_worktrees {
        let menu = Menu::with_items(app, &[&show, &sep1, &settings, &sep2, &quit])?;
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

/// Tauri command to trigger tray menu rebuild from the frontend.
/// Call after config changes (project add/remove, settings update) to refresh the menu.
#[tauri::command]
pub fn refresh_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
    rebuild_tray_menu(&app_handle).map_err(|e| e.to_string())
}
