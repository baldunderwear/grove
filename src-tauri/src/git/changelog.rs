use serde::Serialize;

use super::error::GitError;
use crate::config::models::ChangelogConfig;

/// A changelog fragment found in the changelog directory.
#[derive(Debug, Clone, Serialize)]
pub struct ChangelogFragment {
    /// Full path to the fragment file.
    pub path: String,
    /// Display name (filename without directory).
    pub name: String,
    /// Whether this is a legacy numbered changelog (e.g. `42.md`).
    pub is_legacy: bool,
}

/// Find changelog fragments for a given worktree in the changelog directory.
///
/// Looks for:
/// 1. The standard fragment matching the configured pattern (e.g. `worktree-{name}.md`)
/// 2. Legacy numbered changelogs (files matching `<digits>.md`) -- marked `is_legacy: true`
pub fn find_changelog_fragments(
    repo_path: &str,
    changelog_config: &ChangelogConfig,
    worktree_name: &str,
) -> Result<Vec<ChangelogFragment>, GitError> {
    let changelog_dir = format!(
        "{}/{}",
        repo_path.replace('\\', "/"),
        changelog_config.directory
    );

    let dir_path = std::path::Path::new(&changelog_dir);
    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    let mut fragments = Vec::new();

    // Check for the standard fragment: replace {name} in pattern with worktree_name
    let standard_filename = changelog_config
        .fragment_pattern
        .replace("{name}", worktree_name);
    let standard_path = format!("{}/{}", changelog_dir, standard_filename);
    if std::path::Path::new(&standard_path).exists() {
        fragments.push(ChangelogFragment {
            path: standard_path,
            name: standard_filename,
            is_legacy: false,
        });
    }

    // Scan for legacy numbered changelogs (e.g. 42.md, 123.md)
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().to_string();
            if is_legacy_numbered_changelog(&filename) {
                let full_path = format!("{}/{}", changelog_dir, filename);
                // Don't duplicate if somehow already in fragments
                if !fragments.iter().any(|f| f.path == full_path) {
                    fragments.push(ChangelogFragment {
                        path: full_path,
                        name: filename,
                        is_legacy: true,
                    });
                }
            }
        }
    }

    Ok(fragments)
}

/// Rename changelog fragments after a merge:
/// - Standard fragment (worktree-{name}.md) is renamed to {new_build}.md
/// - Legacy numbered fragments are left as-is (already named correctly)
///
/// Returns a list of (old_path, new_path) tuples for each rename performed.
pub fn rename_changelog_fragments(
    repo_path: &str,
    changelog_config: &ChangelogConfig,
    worktree_name: &str,
    new_build: u32,
) -> Result<Vec<(String, String)>, GitError> {
    let fragments = find_changelog_fragments(repo_path, changelog_config, worktree_name)?;

    let changelog_dir = format!(
        "{}/{}",
        repo_path.replace('\\', "/"),
        changelog_config.directory
    );

    let mut renames = Vec::new();

    for fragment in &fragments {
        if fragment.is_legacy {
            // Legacy fragments are already numbered -- leave them
            continue;
        }

        // Rename standard fragment to {new_build}.md
        let new_name = format!("{}.md", new_build);
        let new_path = format!("{}/{}", changelog_dir, new_name);

        std::fs::rename(&fragment.path, &new_path)?;
        renames.push((fragment.path.clone(), new_path));
    }

    Ok(renames)
}

/// Check if a filename matches the legacy numbered changelog pattern: `<digits>.md`
fn is_legacy_numbered_changelog(filename: &str) -> bool {
    if let Some(stem) = filename.strip_suffix(".md") {
        !stem.is_empty() && stem.chars().all(|c| c.is_ascii_digit())
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_detection() {
        assert!(is_legacy_numbered_changelog("42.md"));
        assert!(is_legacy_numbered_changelog("100.md"));
        assert!(!is_legacy_numbered_changelog("worktree-feature.md"));
        assert!(!is_legacy_numbered_changelog("readme.md"));
        assert!(!is_legacy_numbered_changelog(".md"));
        assert!(!is_legacy_numbered_changelog("42.txt"));
    }
}
