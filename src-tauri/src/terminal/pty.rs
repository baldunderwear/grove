use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use tauri::ipc::Channel;

use super::{TerminalEvent, TerminalSession};

/// Spawn a new PTY with `cmd.exe /c claude` in the given working directory.
///
/// Returns the terminal ID and session. The caller is responsible for inserting
/// the session into the TerminalManager. A dedicated OS thread is spawned to
/// read PTY output and stream it via the Tauri Channel.
///
/// IMPORTANT: `working_dir` must already be resolved to a drive letter path
/// (no UNC paths). The caller handles UNC resolution.
pub fn spawn_pty(
    working_dir: &str,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(String, TerminalSession), String> {
    let pty_system = NativePtySystem::default();

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new("cmd.exe");
    cmd.args(["/c", "claude"]);
    cmd.cwd(working_dir);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Drop slave immediately -- we only need the master side
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let terminal_id = uuid::Uuid::new_v4().to_string();
    let id_for_thread = terminal_id.clone();

    // Dedicated OS thread for blocking PTY read loop (Pattern 2 from research)
    std::thread::Builder::new()
        .name(format!("pty-reader-{}", &id_for_thread[..8]))
        .spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF -- process exited
                        let _ = on_event.send(TerminalEvent::Exit { code: None });
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        if on_event.send(TerminalEvent::Data { data }).is_err() {
                            // Frontend disconnected
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = on_event.send(TerminalEvent::Error {
                            message: format!("PTY read error: {}", e),
                        });
                        break;
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to spawn reader thread: {}", e))?;

    let session = TerminalSession {
        writer,
        master: pair.master,
        child,
        working_dir: working_dir.to_string(),
    };

    Ok((terminal_id, session))
}
