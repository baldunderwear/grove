export interface AppConfig {
  version: number;
  projects: ProjectConfig[];
  settings: Settings;
  profiles: Profile[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  merge_target: string;
  branch_prefix: string;
  build_files: BuildFileConfig[];
  changelog: ChangelogConfig | null;
  profile_id: string | null;
}

export interface Profile {
  id: string;
  name: string;
  claude_config_dir: string | null;
  env_vars: Record<string, string>;
  ssh_key: string | null;
  launch_flags: string[];
  is_default: boolean;
}

export interface BuildFileConfig {
  pattern: string;
}

export interface ChangelogConfig {
  directory: string;
  fragment_pattern: string;
}

export interface Settings {
  refresh_interval: number;
  start_minimized: boolean;
  start_with_windows: boolean;
  theme: string;
  auto_fetch_interval: number;
  notify_merge_ready: boolean;
  notify_stale_branch: boolean;
  notify_merge_complete: boolean;
}

export type HealthStatus =
  | "Healthy"
  | "PathNotFound"
  | "NotGitRepo"
  | "MissingMergeTarget";

export interface ScanResult {
  name: string;
  path: string;
  merge_target: string;
  suggested_merge_targets: string[];
  branch_prefixes: PrefixSuggestion[];
  total_branches: number;
  worktree_count: number;
  has_changelogs: boolean;
  changelog_dir: string | null;
  remote_url: string | null;
}

export interface PrefixSuggestion {
  prefix: string;
  count: number;
  example: string;
}
