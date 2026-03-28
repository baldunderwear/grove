// Snake_case to match Rust serde convention (Phase 02 decision)
export interface SessionState {
  // Map of worktree_path -> PID for active Claude Code sessions
  active_sessions: Record<string, number>;
}
