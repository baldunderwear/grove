/// Errors that can occur during git operations.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Repository not found: {0}")]
    RepoNotFound(String),

    #[error("Branch not found: {0}")]
    BranchNotFound(String),

    #[error("Merge conflict in non-build files: {0:?}")]
    UnexpectedConflict(Vec<String>),

    #[error("Merge aborted: {0}")]
    MergeAborted(String),

    #[error("{0}")]
    Other(String),
}

// Tauri requires command error types to be serializable.
// We serialize as a plain string via Display (matching ConfigError pattern).
impl serde::Serialize for GitError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
