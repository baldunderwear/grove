export interface BranchInfo {
  name: string;
  ahead: number;
  behind: number;
  last_commit_message: string;
  last_commit_timestamp: number;
  is_dirty: boolean;
  worktree_path: string;
}

export type SortMode = 'activity' | 'name' | 'commits';
