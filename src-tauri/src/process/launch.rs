use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NEW_CONSOLE: u32 = 0x00000010;

/// Launch a Claude Code session in a new terminal window.
///
/// Tries Windows Terminal (wt.exe) first, falls back to cmd.exe if not found.
/// Returns the spawned process PID (note: for wt.exe this is wt's PID, not claude's).
pub fn launch_claude_session(
    worktree_path: &str,
    worktree_name: &str,
    extra_flags: &[String],
) -> Result<u32, String> {
    let mut cmd = Command::new("wt.exe");
    cmd.arg("-d").arg(worktree_path);
    cmd.arg("--title").arg(format!("Claude: {}", worktree_name));
    cmd.arg("claude");
    for flag in extra_flags {
        cmd.arg(flag);
    }

    match cmd.spawn() {
        Ok(child) => Ok(child.id()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // wt.exe not available, fall back to cmd.exe
            launch_claude_via_cmd(worktree_path, worktree_name, extra_flags)
        }
        Err(e) => Err(format!("Failed to launch Windows Terminal: {}", e)),
    }
}

/// Fallback: launch claude via cmd.exe with CREATE_NEW_CONSOLE.
fn launch_claude_via_cmd(
    worktree_path: &str,
    worktree_name: &str,
    extra_flags: &[String],
) -> Result<u32, String> {
    let flags_str = if extra_flags.is_empty() {
        String::new()
    } else {
        format!(" {}", extra_flags.join(" "))
    };

    let inner_cmd = format!("cd /d \"{}\" && claude{}", worktree_path, flags_str);

    let child = Command::new("cmd.exe")
        .arg("/c")
        .arg("start")
        .arg(format!("Claude: {}", worktree_name))
        .arg("cmd")
        .arg("/k")
        .arg(&inner_cmd)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| format!("Failed to launch cmd: {}", e))?;

    Ok(child.id())
}

/// Launch VS Code (or Cursor) pointed at a worktree path.
/// Fire-and-forget -- we don't track the VS Code process.
pub fn launch_vscode(worktree_path: &str) -> Result<(), String> {
    Command::new("code")
        .arg(worktree_path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    Ok(())
}
