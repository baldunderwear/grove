use tauri::Manager;

mod commands;
mod config;
mod fetch;
mod git;
mod notifications;
mod process;
mod tray;
mod watcher;

pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(()))
        .manage(std::sync::Mutex::new(process::detect::SessionDetector::new()))
        .manage(std::sync::Mutex::new(notifications::NotificationState::new()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
            commands::git_commands::merge_preview,
            commands::git_commands::merge_branch,
            commands::git_commands::resolve_build_conflicts,
            commands::session_commands::launch_session,
            commands::session_commands::get_active_sessions,
            commands::session_commands::open_in_vscode,
            commands::session_commands::open_in_explorer,
            commands::session_commands::create_worktree,
            tray::refresh_tray,
        ])
        .setup(|app| {
            // Build tray icon with dynamic menu and event handlers
            tray::build_tray(app)?;

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

            // Run initial notification check
            {
                let app_handle_notify = app.handle().clone();
                let notif_state =
                    app.state::<std::sync::Mutex<notifications::NotificationState>>();
                notifications::check_and_notify(&app_handle_notify, &notif_state);
            }

            // Re-check notifications and rebuild tray on git-changed events
            {
                use tauri::Listener;
                let app_handle_for_notif = app.handle().clone();
                app.listen("git-changed", move |_event| {
                    let state = app_handle_for_notif
                        .state::<std::sync::Mutex<notifications::NotificationState>>();
                    notifications::check_and_notify(&app_handle_for_notif, &state);
                    let _ = crate::tray::rebuild_tray_menu(&app_handle_for_notif);
                });
            }

            // Start background auto-fetch thread
            {
                let app_handle_fetch = app.handle().clone();
                fetch::start_auto_fetch(app_handle_fetch);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
