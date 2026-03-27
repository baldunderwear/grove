use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use super::models::{AppConfig, HealthStatus, RepoInfo};

/// Errors that can occur during configuration operations.
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

    #[error("Project not found: {0}")]
    ProjectNotFound(String),
}

// Tauri requires command error types to be serializable.
// We serialize as a plain string via Display.
impl serde::Serialize for ConfigError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Resolve the path to the config JSON file inside the app data directory.
pub fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, ConfigError> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            ConfigError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Could not resolve app data dir: {}", e),
            ))
        })?;
    Ok(dir.join("config.json"))
}

/// Load the configuration from disk, or create a default one if the file
/// does not exist yet (first launch).
pub fn load_or_create_config(app_handle: &tauri::AppHandle) -> Result<AppConfig, ConfigError> {
    let path = config_path(app_handle)?;

    if path.exists() {
        let contents = fs::read_to_string(&path)?;
        let config: AppConfig = serde_json::from_str(&contents)?;
        Ok(config)
    } else {
        let config = AppConfig::default();
        save_config(app_handle, &config)?;
        Ok(config)
    }
}

/// Persist the configuration to disk (pretty-printed JSON).
/// Creates the parent directory if it does not exist.
pub fn save_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> Result<(), ConfigError> {
    let path = config_path(app_handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(path, json)?;
    Ok(())
}

/// Open a git repository at `path` and extract useful metadata:
/// repo name (from directory name), local branches, and a suggested merge target.
pub fn detect_repo_info(path: &str) -> Result<RepoInfo, ConfigError> {
    if !std::path::Path::new(path).exists() {
        return Err(ConfigError::PathNotFound(path.to_string()));
    }

    let repo = git2::Repository::open(path)
        .map_err(|_| ConfigError::NotGitRepo(path.to_string()))?;

    // Derive a human-friendly name from the directory
    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Collect local branch names
    let branches: Vec<String> = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| {
            ConfigError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to list branches: {}", e),
            ))
        })?
        .filter_map(|b| b.ok())
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(String::from))
        .collect();

    // Pick a sensible default merge target: prefer "develop", then "main", then first branch
    let merge_target = if branches.contains(&"develop".to_string()) {
        "develop".to_string()
    } else if branches.contains(&"main".to_string()) {
        "main".to_string()
    } else {
        branches.first().cloned().unwrap_or_default()
    };

    Ok(RepoInfo {
        name,
        merge_target,
        branches,
    })
}

/// Quick health check for a registered project path.
/// Returns a status enum that the frontend renders as a colored dot.
pub fn check_health(path: &str, merge_target: &str) -> HealthStatus {
    if !std::path::Path::new(path).exists() {
        return HealthStatus::PathNotFound;
    }

    let repo = match git2::Repository::open(path) {
        Ok(r) => r,
        Err(_) => return HealthStatus::NotGitRepo,
    };

    // Verify the merge target branch exists locally
    if repo
        .find_branch(merge_target, git2::BranchType::Local)
        .is_err()
    {
        return HealthStatus::MissingMergeTarget;
    }

    HealthStatus::Healthy
}
