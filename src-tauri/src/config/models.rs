use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Top-level application configuration.
/// Stored at %APPDATA%/com.grove.app/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub templates: Vec<PromptTemplate>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            projects: Vec::new(),
            settings: Settings::default(),
            profiles: Vec::new(),
            templates: Vec::new(),
        }
    }
}

/// A reusable prompt template for Claude Code session launches.
/// The body can contain {variable} placeholders that are extracted into the variables list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub body: String,
    #[serde(default)]
    pub variables: Vec<String>,
}

/// A named profile for Claude Code sessions.
/// Profiles control config directory, environment variables, SSH keys, and launch flags.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_config_dir: Option<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_key: Option<String>,
    #[serde(default)]
    pub launch_flags: Vec<String>,
    #[serde(default)]
    pub is_default: bool,
}

/// Configuration for a single registered project (git repository).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub merge_target: String,
    #[serde(default = "default_branch_prefix")]
    pub branch_prefix: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub build_files: Vec<BuildFileConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changelog: Option<ChangelogConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
}

/// Glob pattern for build number files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildFileConfig {
    pub pattern: String,
}

/// Changelog fragment configuration for a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogConfig {
    #[serde(default = "default_changelog_directory")]
    pub directory: String,
    #[serde(default = "default_fragment_pattern")]
    pub fragment_pattern: String,
}

/// Global application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: u32,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default)]
    pub start_with_windows: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_auto_fetch_interval")]
    pub auto_fetch_interval: u32, // seconds, 0 = disabled
    #[serde(default = "default_true")]
    pub notify_merge_ready: bool,
    #[serde(default = "default_true")]
    pub notify_stale_branch: bool,
    #[serde(default = "default_true")]
    pub notify_merge_complete: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_interval: default_refresh_interval(),
            start_minimized: false,
            start_with_windows: false,
            theme: default_theme(),
            auto_fetch_interval: default_auto_fetch_interval(),
            notify_merge_ready: true,
            notify_stale_branch: true,
            notify_merge_complete: true,
        }
    }
}

/// Health status of a registered project path.
#[derive(Debug, Clone, Serialize)]
pub enum HealthStatus {
    Healthy,
    PathNotFound,
    NotGitRepo,
    MissingMergeTarget,
}

/// Auto-detected information about a git repository.
#[derive(Debug, Clone, Serialize)]
pub struct RepoInfo {
    pub name: String,
    pub merge_target: String,
    pub branches: Vec<String>,
}

/// Rich scan result for the project wizard.
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub name: String,
    pub path: String,
    pub merge_target: String,
    pub suggested_merge_targets: Vec<String>,
    pub branch_prefixes: Vec<PrefixSuggestion>,
    pub total_branches: usize,
    pub worktree_count: usize,
    pub has_changelogs: bool,
    pub changelog_dir: Option<String>,
    pub remote_url: Option<String>,
}

/// A detected branch prefix with count.
#[derive(Debug, Clone, Serialize)]
pub struct PrefixSuggestion {
    pub prefix: String,
    pub count: usize,
    pub example: String,
}

fn default_branch_prefix() -> String {
    "wt/".to_string()
}

fn default_refresh_interval() -> u32 {
    30
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_auto_fetch_interval() -> u32 {
    300 // 5 minutes
}

fn default_true() -> bool {
    true
}

fn default_changelog_directory() -> String {
    "docs/changelog".to_string()
}

fn default_fragment_pattern() -> String {
    "worktree-{name}.md".to_string()
}
