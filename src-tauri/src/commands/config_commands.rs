use std::sync::Mutex;

use crate::config::models::{AppConfig, BuildFileConfig, ChangelogConfig, HealthStatus};
use crate::config::persistence::{self, ConfigError};

/// Return the current configuration (creating a default on first launch).
#[tauri::command]
pub fn get_config(app_handle: tauri::AppHandle) -> Result<AppConfig, ConfigError> {
    persistence::load_or_create_config(&app_handle)
}

/// Register a new project by path. Auto-detects repo name, branches, and merge target.
#[tauri::command]
pub fn add_project(
    app_handle: tauri::AppHandle,
    path: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    // Validate path exists
    if !std::path::Path::new(&path).exists() {
        return Err(ConfigError::PathNotFound(path));
    }

    // Auto-detect repo info
    let repo_info = persistence::detect_repo_info(&path)?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    // Check not already registered (case-insensitive on Windows)
    let normalized = path.to_lowercase().replace('\\', "/");
    if config.projects.iter().any(|p| {
        p.path.to_lowercase().replace('\\', "/") == normalized
    }) {
        return Err(ConfigError::AlreadyRegistered(path));
    }

    // Build new project entry with detected defaults
    let project = crate::config::models::ProjectConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: repo_info.name,
        path,
        merge_target: repo_info.merge_target,
        branch_prefix: "wt/".to_string(),
        build_files: Vec::new(),
        changelog: None,
    };

    config.projects.push(project);
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Remove a project by its ID.
#[tauri::command]
pub fn remove_project(
    app_handle: tauri::AppHandle,
    id: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let idx = config
        .projects
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| ConfigError::ProjectNotFound(id))?;

    config.projects.remove(idx);
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Update specific fields on a project. Only provided (Some) fields are changed.
#[tauri::command]
pub fn update_project(
    app_handle: tauri::AppHandle,
    id: String,
    name: Option<String>,
    merge_target: Option<String>,
    branch_prefix: Option<String>,
    build_files: Option<Vec<BuildFileConfig>>,
    changelog: Option<Option<ChangelogConfig>>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let project = config
        .projects
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| ConfigError::ProjectNotFound(id))?;

    if let Some(v) = name {
        project.name = v;
    }
    if let Some(v) = merge_target {
        project.merge_target = v;
    }
    if let Some(v) = branch_prefix {
        project.branch_prefix = v;
    }
    if let Some(v) = build_files {
        project.build_files = v;
    }
    if let Some(v) = changelog {
        project.changelog = v;
    }

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Update global settings. Only provided (Some) fields are changed.
#[tauri::command]
pub fn update_settings(
    app_handle: tauri::AppHandle,
    refresh_interval: Option<u32>,
    start_minimized: Option<bool>,
    start_with_windows: Option<bool>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    if let Some(v) = refresh_interval {
        config.settings.refresh_interval = v;
    }
    if let Some(v) = start_minimized {
        config.settings.start_minimized = v;
    }
    if let Some(v) = start_with_windows {
        config.settings.start_with_windows = v;
    }

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Check the health status of a project path and its merge target branch.
#[tauri::command]
pub fn check_project_health(
    path: String,
    merge_target: String,
) -> Result<HealthStatus, ConfigError> {
    Ok(persistence::check_health(&path, &merge_target))
}

/// Export the current configuration to a JSON file at the given path.
#[tauri::command]
pub fn export_config(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), ConfigError> {
    let config = persistence::load_or_create_config(&app_handle)?;
    let json = serde_json::to_string_pretty(&config)?;
    std::fs::write(&path, json)?;
    Ok(())
}

/// Import configuration from a JSON file, replacing the current config.
#[tauri::command]
pub fn import_config(
    app_handle: tauri::AppHandle,
    path: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let contents = std::fs::read_to_string(&path)?;
    let config: AppConfig = serde_json::from_str(&contents)?;
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}
