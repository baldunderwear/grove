export interface AppConfig {
  version: number;
  projects: ProjectConfig[];
  settings: Settings;
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  merge_target: string;
  branch_prefix: string;
  build_files: BuildFileConfig[];
  changelog: ChangelogConfig | null;
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
