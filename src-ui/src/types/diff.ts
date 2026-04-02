export interface DiffSummaryData {
  files_changed: number;
  insertions: number;
  deletions: number;
  files: DiffFileEntry[];
  commits: CommitInfo[];
}

export interface DiffFileEntry {
  path: string;
  insertions: number;
  deletions: number;
}

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}
