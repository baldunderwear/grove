use std::collections::HashMap;
use std::sync::Mutex;

use crate::config::models::{AppConfig, BuildFileConfig, ChangelogConfig, HealthStatus, Profile, PromptTemplate, ScanResult};
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
        profile_id: None,
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

/// Deep scan a git repo for the project wizard.
/// Returns branch patterns, worktree count, changelog detection, etc.
#[tauri::command]
pub fn scan_repo(path: String) -> Result<ScanResult, ConfigError> {
    persistence::scan_repo(&path)
}

/// Create a new profile with the given name.
/// If this is the first profile, it is automatically set as default (PROF-05).
#[tauri::command]
pub fn add_profile(
    app_handle: tauri::AppHandle,
    name: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let is_first = config.profiles.is_empty();

    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        claude_config_dir: None,
        env_vars: HashMap::new(),
        ssh_key: None,
        launch_flags: Vec::new(),
        is_default: is_first,
    };

    config.profiles.push(profile);
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Update fields on an existing profile. Only provided (Some) fields are changed.
/// If is_default is set to true, all other profiles have is_default cleared first.
#[tauri::command]
pub fn update_profile(
    app_handle: tauri::AppHandle,
    id: String,
    name: Option<String>,
    claude_config_dir: Option<Option<String>>,
    env_vars: Option<HashMap<String, String>>,
    ssh_key: Option<Option<String>>,
    launch_flags: Option<Vec<String>>,
    is_default: Option<bool>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    // If setting this profile as default, clear default on all others first
    if is_default == Some(true) {
        for p in &mut config.profiles {
            p.is_default = false;
        }
    }

    let profile = config
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| ConfigError::ProjectNotFound(format!("Profile not found: {}", id)))?;

    if let Some(v) = name {
        profile.name = v;
    }
    if let Some(v) = claude_config_dir {
        profile.claude_config_dir = v;
    }
    if let Some(v) = env_vars {
        profile.env_vars = v;
    }
    if let Some(v) = ssh_key {
        profile.ssh_key = v;
    }
    if let Some(v) = launch_flags {
        profile.launch_flags = v;
    }
    if let Some(v) = is_default {
        profile.is_default = v;
    }

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Remove a profile by its ID.
/// Clears profile_id on any projects referencing it.
/// If the removed profile was default and others remain, the first remaining becomes default.
#[tauri::command]
pub fn remove_profile(
    app_handle: tauri::AppHandle,
    id: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let idx = config
        .profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| ConfigError::ProjectNotFound(format!("Profile not found: {}", id)))?;

    let was_default = config.profiles[idx].is_default;
    config.profiles.remove(idx);

    // Clear profile_id on any projects referencing the removed profile
    for project in &mut config.projects {
        if project.profile_id.as_deref() == Some(&id) {
            project.profile_id = None;
        }
    }

    // If removed profile was default and others remain, set first as default
    if was_default && !config.profiles.is_empty() {
        config.profiles[0].is_default = true;
    }

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Extract {variable} placeholders from a template body string.
/// Scans for `{word}` patterns, deduplicates, and returns the variable names.
fn extract_variables(body: &str) -> Vec<String> {
    let mut vars = Vec::new();
    let mut chars = body.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '{' {
            let mut name = String::new();
            for inner in chars.by_ref() {
                if inner == '}' {
                    break;
                }
                name.push(inner);
            }
            let name = name.trim().to_string();
            if !name.is_empty() && !vars.contains(&name) {
                vars.push(name);
            }
        }
    }
    vars
}

/// Create a new prompt template with the given name and body.
/// Variables are automatically extracted from {placeholder} patterns in the body.
#[tauri::command]
pub fn add_template(
    app_handle: tauri::AppHandle,
    name: String,
    body: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let variables = extract_variables(&body);
    let template = PromptTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        body,
        variables,
    };

    config.templates.push(template);
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Update fields on an existing prompt template. Only provided (Some) fields are changed.
/// If the body is updated, variables are re-extracted automatically.
#[tauri::command]
pub fn update_template(
    app_handle: tauri::AppHandle,
    id: String,
    name: Option<String>,
    body: Option<String>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let template = config
        .templates
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| ConfigError::ProjectNotFound(format!("Template not found: {}", id)))?;

    if let Some(v) = name {
        template.name = v;
    }
    if let Some(v) = body {
        template.variables = extract_variables(&v);
        template.body = v;
    }

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Remove a prompt template by its ID.
#[tauri::command]
pub fn remove_template(
    app_handle: tauri::AppHandle,
    id: String,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;
    config.templates.retain(|t| t.id != id);
    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}

/// Set or clear the profile_id on a project.
#[tauri::command]
pub fn set_project_profile(
    app_handle: tauri::AppHandle,
    project_id: String,
    profile_id: Option<String>,
    _lock: tauri::State<'_, Mutex<()>>,
) -> Result<AppConfig, ConfigError> {
    let _guard = _lock.lock().map_err(|e| {
        ConfigError::Io(std::io::Error::other(format!("Lock poisoned: {}", e)))
    })?;

    let mut config = persistence::load_or_create_config(&app_handle)?;

    let project = config
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| ConfigError::ProjectNotFound(project_id))?;

    project.profile_id = profile_id;

    persistence::save_config(&app_handle, &config)?;
    Ok(config)
}
