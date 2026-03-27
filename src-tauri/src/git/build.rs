use super::error::GitError;
use crate::config::models::BuildFileConfig;

/// Detect the current (maximum) build number across all build files matching
/// the configured glob patterns.
pub fn detect_current_build(
    repo_path: &str,
    build_patterns: &[BuildFileConfig],
) -> Result<Option<u32>, GitError> {
    let mut max_build: Option<u32> = None;

    for pattern in build_patterns {
        let full_pattern = format!("{}/{}", repo_path.replace('\\', "/"), pattern.pattern);
        let entries = glob::glob(&full_pattern)
            .map_err(|e| GitError::MergeAborted(format!("Bad glob pattern: {}", e)))?;

        for entry in entries {
            let path = entry.map_err(|e| GitError::Io(e.into_error()))?;
            let content = std::fs::read_to_string(&path)?;
            if let Some(num) = extract_build_number(&content) {
                max_build = Some(max_build.map_or(num, |m: u32| m.max(num)));
            }
        }
    }

    Ok(max_build)
}

/// Bump the build number in all matching build files, returning the list of
/// modified file paths (relative to repo_path, forward-slash normalized).
pub fn bump_build_number(
    repo_path: &str,
    build_patterns: &[BuildFileConfig],
    new_build: u32,
) -> Result<Vec<String>, GitError> {
    let repo_path_normalized = repo_path.replace('\\', "/");
    let mut modified_files = Vec::new();

    for pattern in build_patterns {
        let full_pattern = format!("{}/{}", repo_path_normalized, pattern.pattern);
        let entries = glob::glob(&full_pattern)
            .map_err(|e| GitError::MergeAborted(format!("Bad glob pattern: {}", e)))?;

        for entry in entries {
            let path = entry.map_err(|e| GitError::Io(e.into_error()))?;
            let content = std::fs::read_to_string(&path)?;
            let updated = replace_build_number(&content, new_build);
            if updated != content {
                std::fs::write(&path, &updated)?;
                // Return path relative to repo_path, forward-slash normalized
                let abs = path.to_string_lossy().replace('\\', "/");
                let relative = abs
                    .strip_prefix(&repo_path_normalized)
                    .unwrap_or(&abs)
                    .trim_start_matches('/')
                    .to_string();
                modified_files.push(relative);
            }
        }
    }

    Ok(modified_files)
}

/// Extract a build number from file content.
/// Supports:
/// 1. JSON: `"build": 42` or `"build_number": 42`
/// 2. Plain text: entire file is a single number
/// 3. TOML-style: `build = 42` or `build_number = 42`
fn extract_build_number(content: &str) -> Option<u32> {
    // Try plain text first (entire file is a number)
    let trimmed = content.trim();
    if let Ok(n) = trimmed.parse::<u32>() {
        return Some(n);
    }

    // Try JSON-style: "build": 123 or "build_number": 123
    for key in &["\"build\"", "\"build_number\""] {
        if let Some(pos) = content.find(key) {
            let after_key = &content[pos + key.len()..];
            if let Some(num) = parse_number_after_separator(after_key, ':') {
                return Some(num);
            }
        }
    }

    // Try TOML-style: build = 123 or build_number = 123
    for key in &["build_number", "build"] {
        // Look for the key at start of line or after whitespace
        for line in content.lines() {
            let trimmed_line = line.trim();
            if trimmed_line.starts_with(key) {
                let after_key = &trimmed_line[key.len()..];
                if let Some(num) = parse_number_after_separator(after_key, '=') {
                    return Some(num);
                }
            }
        }
    }

    None
}

/// Replace the build number in file content with a new value.
/// Uses the same detection logic as extract_build_number.
fn replace_build_number(content: &str, new_build: u32) -> String {
    let trimmed = content.trim();

    // Plain text: entire file is a number
    if trimmed.parse::<u32>().is_ok() {
        // Preserve trailing newline if present
        if content.ends_with('\n') {
            return format!("{}\n", new_build);
        }
        return new_build.to_string();
    }

    let mut result = content.to_string();

    // JSON-style: "build": 123 or "build_number": 123
    for key in &["\"build_number\"", "\"build\""] {
        if let Some(pos) = result.find(key) {
            let after_key_start = pos + key.len();
            let after_key = &result[after_key_start..];
            if let Some((num_start, num_end)) = find_number_span_after_separator(after_key, ':') {
                let abs_start = after_key_start + num_start;
                let abs_end = after_key_start + num_end;
                result.replace_range(abs_start..abs_end, &new_build.to_string());
                return result;
            }
        }
    }

    // TOML-style: build_number = 123 or build = 123
    for key in &["build_number", "build"] {
        // Find the key at the start of a line
        for (line_idx, line) in content.lines().enumerate() {
            let trimmed_line = line.trim();
            if trimmed_line.starts_with(key) {
                let after_key = &trimmed_line[key.len()..];
                if let Some((num_start, num_end)) = find_number_span_after_separator(after_key, '=')
                {
                    // Calculate the absolute position in the original string
                    let line_start = content
                        .lines()
                        .take(line_idx)
                        .map(|l| l.len() + 1) // +1 for newline
                        .sum::<usize>();
                    let trim_offset = line.len() - line.trim_start().len();
                    let key_end = line_start + trim_offset + key.len();
                    let abs_start = key_end + num_start;
                    let abs_end = key_end + num_end;
                    result.replace_range(abs_start..abs_end, &new_build.to_string());
                    return result;
                }
            }
        }
    }

    result
}

/// Parse digits following a separator character (skipping whitespace).
fn parse_number_after_separator(s: &str, sep: char) -> Option<u32> {
    let s = s.trim_start();
    if !s.starts_with(sep) {
        return None;
    }
    let after_sep = s[sep.len_utf8()..].trim_start();
    let digits: String = after_sep.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse().ok()
}

/// Find the byte span (start, end) of the number following a separator.
fn find_number_span_after_separator(s: &str, sep: char) -> Option<(usize, usize)> {
    let trimmed = s.trim_start();
    let ws_before_sep = s.len() - trimmed.len();
    if !trimmed.starts_with(sep) {
        return None;
    }
    let after_sep = &trimmed[sep.len_utf8()..];
    let after_sep_trimmed = after_sep.trim_start();
    let ws_after_sep = after_sep.len() - after_sep_trimmed.len();

    let num_start = ws_before_sep + sep.len_utf8() + ws_after_sep;
    let num_len = after_sep_trimmed
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .count();
    if num_len == 0 {
        return None;
    }
    Some((num_start, num_start + num_len))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_plain_text() {
        assert_eq!(extract_build_number("42"), Some(42));
        assert_eq!(extract_build_number("42\n"), Some(42));
        assert_eq!(extract_build_number("  100  \n"), Some(100));
    }

    #[test]
    fn extract_json() {
        assert_eq!(
            extract_build_number(r#"{ "build": 7 }"#),
            Some(7)
        );
        assert_eq!(
            extract_build_number(r#"{ "build_number": 99 }"#),
            Some(99)
        );
    }

    #[test]
    fn extract_toml() {
        assert_eq!(extract_build_number("build = 55"), Some(55));
        assert_eq!(extract_build_number("build_number = 123"), Some(123));
    }

    #[test]
    fn replace_plain_text() {
        assert_eq!(replace_build_number("42\n", 43), "43\n");
        assert_eq!(replace_build_number("42", 43), "43");
    }

    #[test]
    fn replace_json() {
        assert_eq!(
            replace_build_number(r#"{ "build": 7 }"#, 8),
            r#"{ "build": 8 }"#
        );
    }

    #[test]
    fn replace_toml() {
        assert_eq!(
            replace_build_number("build = 55", 56),
            "build = 56"
        );
    }
}
