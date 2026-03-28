use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use std::collections::HashMap;

use super::models::{AppConfig, HealthStatus, PrefixSuggestion, RepoInfo, ScanResult};

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
            ConfigError::Io(std::io::Error::other(
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

/// Deep scan of a git repo for the project wizard.
/// Detects branch naming patterns, worktree count, changelog directories, etc.
pub fn scan_repo(path: &str) -> Result<ScanResult, ConfigError> {
    if !std::path::Path::new(path).exists() {
        return Err(ConfigError::PathNotFound(path.to_string()));
    }

    let repo = git2::Repository::open(path)
        .map_err(|_| ConfigError::NotGitRepo(path.to_string()))?;

    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Collect branches
    let branches: Vec<String> = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| ConfigError::Io(std::io::Error::other(format!("Branch list: {}", e))))?
        .filter_map(|b| b.ok())
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(String::from))
        .collect();

    // Detect merge target candidates
    let mut suggested_merge_targets = Vec::new();
    for target in &["develop", "main", "master", "dev"] {
        if branches.contains(&target.to_string()) {
            suggested_merge_targets.push(target.to_string());
        }
    }

    let merge_target = suggested_merge_targets.first().cloned().unwrap_or_default();

    // Detect branch prefixes by finding common patterns
    let mut prefix_counts: HashMap<String, Vec<String>> = HashMap::new();
    for branch in &branches {
        // Skip the merge targets themselves
        if suggested_merge_targets.contains(branch) {
            continue;
        }
        // Try common delimiter patterns: "prefix/rest", "prefix-rest"
        if let Some(slash_pos) = branch.find('/') {
            let prefix = format!("{}/", &branch[..slash_pos]);
            prefix_counts.entry(prefix).or_default().push(branch.clone());
        }
        if let Some(dash_pos) = branch.find('-') {
            let prefix = format!("{}-", &branch[..dash_pos]);
            prefix_counts.entry(prefix).or_default().push(branch.clone());
        }
    }

    // Sort prefixes by count (most common first), filter to 2+ matches
    let mut branch_prefixes: Vec<PrefixSuggestion> = prefix_counts
        .into_iter()
        .filter(|(_, branches)| branches.len() >= 2)
        .map(|(prefix, branches)| PrefixSuggestion {
            example: branches.first().cloned().unwrap_or_default(),
            count: branches.len(),
            prefix,
        })
        .collect();
    branch_prefixes.sort_by(|a, b| b.count.cmp(&a.count));
    // Keep top 5
    branch_prefixes.truncate(5);

    // Count worktrees via CLI
    let worktree_count = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(path)
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| l.starts_with("worktree "))
                .count()
        })
        .unwrap_or(1); // at least the main worktree

    // Detect changelog directories
    let changelog_dirs = ["docs/changelog", "changelogs", "changelog", "src/changelogs"];
    let mut has_changelogs = false;
    let mut changelog_dir = None;
    for dir in &changelog_dirs {
        let full = std::path::Path::new(path).join(dir);
        if full.exists() && full.is_dir() {
            has_changelogs = true;
            changelog_dir = Some(dir.to_string());
            break;
        }
    }

    // Get remote URL
    let remote_url = repo
        .find_remote("origin")
        .ok()
        .and_then(|r| r.url().map(String::from));

    Ok(ScanResult {
        name,
        path: path.to_string(),
        merge_target,
        suggested_merge_targets,
        branch_prefixes,
        total_branches: branches.len(),
        worktree_count,
        has_changelogs,
        changelog_dir,
        remote_url,
    })
}
