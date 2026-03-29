use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// A mapping from UNC prefix to drive letter, cached per call.
pub(crate) struct DriveMapping {
    pub unc_prefix: String, // lowercase, forward slashes, e.g. "//the-batman/mnt"
    pub drive: String,      // e.g. "Z:"
}

/// Query `net use` once and build a list of UNC -> drive letter mappings.
pub(crate) fn get_drive_mappings() -> Vec<DriveMapping> {
    let output = match std::process::Command::new("net")
        .arg("use")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut mappings = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for (i, part) in parts.iter().enumerate() {
            if part.len() == 2 && part.ends_with(':') {
                if let Some(unc) = parts.get(i + 1) {
                    if unc.starts_with("\\\\") || unc.starts_with("//") {
                        mappings.push(DriveMapping {
                            unc_prefix: unc.replace('\\', "/").to_lowercase(),
                            drive: part.to_string(),
                        });
                    }
                }
            }
        }
    }
    mappings
}

/// Resolve a UNC path to a drive letter using pre-fetched mappings.
pub(crate) fn resolve_unc_path(path: &str, mappings: &[DriveMapping]) -> String {
    let normalized = path.replace('\\', "/");
    if !normalized.starts_with("//") {
        return normalized;
    }
    let path_lower = normalized.to_lowercase();
    for m in mappings {
        if path_lower.starts_with(&m.unc_prefix) {
            let remainder = &normalized[m.unc_prefix.len()..];
            return format!("{}{}", m.drive, remainder);
        }
    }
    normalized
}
