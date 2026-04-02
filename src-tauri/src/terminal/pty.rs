use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::Emitter;

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
    app_handle: tauri::AppHandle,
    env_overrides: std::collections::HashMap<String, String>,
    extra_args: &[String],
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
    // Build claude command with any profile launch flags
    let mut claude_args = vec!["claude".to_string()];
    claude_args.extend(extra_args.iter().cloned());
    let claude_cmd = claude_args.join(" ");
    cmd.args(["/c", &claude_cmd]);
    cmd.cwd(working_dir);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Inject profile environment variables
    for (key, value) in &env_overrides {
        cmd.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Create Job Object and assign the child process BEFORE spawning the reader
    // thread, so the entire process tree is captured from the start.
    // Graceful degradation: if Job Object setup fails, log and continue without it.
    #[cfg(windows)]
    let job_handle = {
        let mut handle: Option<isize> = None;
        if let Some(pid) = child.process_id() {
            match super::job_object::create_job_object() {
                Ok(job) => {
                    match super::job_object::assign_process_to_job(job, pid) {
                        Ok(()) => {
                            handle = Some(job);
                        }
                        Err(e) => {
                            eprintln!("[grove] Failed to assign PID {} to Job Object: {}", pid, e);
                            super::job_object::close_job_object(job);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[grove] Failed to create Job Object: {}", e);
                }
            }
        } else {
            eprintln!("[grove] Could not get child PID for Job Object assignment");
        }
        handle
    };
    #[cfg(not(windows))]
    let job_handle: Option<isize> = None;

    // Wrap child in Arc<Mutex<>> so the reader thread can call wait() for exit code
    let child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>> = Arc::new(Mutex::new(child));
    let child_for_reader = Arc::clone(&child);

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

    // Shared state for idle detection between reader and idle-check threads
    let last_output_epoch_ms = Arc::new(AtomicU64::new(now_epoch_ms()));
    let reader_alive = Arc::new(AtomicBool::new(true));

    // Create state parser for session intelligence
    let mut parser = super::state_parser::StateParser::new(
        terminal_id.clone(),
        app_handle.clone(),
    );

    // Shared refs for idle timer thread
    let idle_last_output = Arc::clone(&last_output_epoch_ms);
    let idle_reader_alive = Arc::clone(&reader_alive);
    let idle_terminal_id = terminal_id.clone();
    let idle_app_handle = app_handle.clone();

    // Idle detection companion thread: checks every 15 seconds
    std::thread::Builder::new()
        .name(format!("pty-idle-{}", &id_for_thread[..8]))
        .spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(15));

                // Exit if reader thread is gone
                if !idle_reader_alive.load(Ordering::Relaxed) {
                    break;
                }

                let last_ms = idle_last_output.load(Ordering::Relaxed);
                let now_ms = now_epoch_ms();
                let elapsed_secs = (now_ms.saturating_sub(last_ms)) / 1000;

                if elapsed_secs >= 60 {
                    let payload = super::state_parser::SessionStatePayload {
                        terminal_id: idle_terminal_id.clone(),
                        state: super::state_parser::SessionState::Idle,
                        timestamp: now_ms,
                    };
                    let _ = idle_app_handle.emit("session-state-changed", payload);
                }
            }
        })
        .map_err(|e| format!("Failed to spawn idle thread: {}", e))?;

    // Dedicated OS thread for blocking PTY read loop (Pattern 2 from research)
    let reader_alive_flag = Arc::clone(&reader_alive);
    let reader_last_output = Arc::clone(&last_output_epoch_ms);

    std::thread::Builder::new()
        .name(format!("pty-reader-{}", &id_for_thread[..8]))
        .spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF -- process exited. Wait for child to get real exit code.
                        let code = child_for_reader
                            .lock()
                            .ok()
                            .and_then(|mut c| c.wait().ok())
                            .map(|status| if status.success() { 0 } else { 1 });
                        let _ = on_event.send(TerminalEvent::Exit { code });
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        // Stream to xterm.js FIRST (no latency impact)
                        if on_event.send(TerminalEvent::Data { data: data.clone() }).is_err() {
                            // Frontend disconnected
                            break;
                        }
                        // Update shared timestamp for idle detection
                        reader_last_output.store(now_epoch_ms(), Ordering::Relaxed);
                        // Feed to state parser (after xterm.js send, no rendering latency)
                        parser.feed(&data);
                    }
                    Err(e) => {
                        let _ = on_event.send(TerminalEvent::Error {
                            message: format!("PTY read error: {}", e),
                        });
                        break;
                    }
                }
            }
            // Signal idle thread to exit
            reader_alive_flag.store(false, Ordering::Relaxed);
        })
        .map_err(|e| format!("Failed to spawn reader thread: {}", e))?;

    let session = TerminalSession {
        writer,
        master: pair.master,
        child,
        working_dir: working_dir.to_string(),
        job_handle,
    };

    Ok((terminal_id, session))
}

/// Get current time as milliseconds since Unix epoch.
fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
