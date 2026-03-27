mod commands;
mod config;
mod git;
mod watcher;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(()))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::config_commands::get_config,
            commands::config_commands::add_project,
            commands::config_commands::remove_project,
            commands::config_commands::update_project,
            commands::config_commands::update_settings,
            commands::config_commands::check_project_health,
            commands::config_commands::export_config,
            commands::config_commands::import_config,
            commands::git_commands::list_branches,
            commands::git_commands::branch_status,
            commands::git_commands::is_worktree_dirty,
        ])
        .setup(|app| {
            // Build tray context menu
            let quit = MenuItem::with_id(app, "quit", "Quit Grove", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Grove", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

            // Build tray icon
            let _tray = TrayIconBuilder::with_id("grove-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Grove - Manage your trees")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
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

            // Start file watcher for registered project paths
            let app_handle = app.handle().clone();
            if let Ok(config) = crate::config::persistence::load_or_create_config(&app_handle) {
                let paths: Vec<String> = config.projects.iter().map(|p| p.path.clone()).collect();
                if !paths.is_empty() {
                    // Start watcher in background -- log errors but don't block app startup
                    if let Err(e) = crate::watcher::start_watcher(app_handle, paths) {
                        eprintln!("[grove] Warning: file watcher failed to start: {}", e);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
