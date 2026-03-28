// Merge types -- mirrors Rust structs from src-tauri/src/git/merge.rs
// All fields use snake_case to match serde serialization (Phase 02 decision)

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface ChangelogFragment {
  path: string;
  name: string;
  is_legacy: boolean;
}

export interface MergePreview {
  source_branch: string;
  target_branch: string;
  commits_to_merge: CommitInfo[];
  changelog_fragments: ChangelogFragment[];
  current_build: number | null;
  next_build: number | null;
  can_fast_forward: boolean;
  has_conflicts: boolean;
}

export interface MergeResult {
  success: boolean;
  new_build: number | null;
  commits_merged: number;
  changelog_renames: [string, string][];
  warnings: string[];
}

export interface MergeHistoryEntry {
  source_branch: string;
  target_branch: string;
  result: MergeResult;
  timestamp: number;
}
