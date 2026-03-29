pub mod commands;
pub mod job_object;
pub mod pty;
pub mod state_parser;

pub use state_parser::SessionState;

use portable_pty::{Child, MasterPty};
use std::collections::HashMap;
use std::io::Write;

/// Represents a single active terminal session.
pub struct TerminalSession {
    pub(crate) writer: Box<dyn Write + Send>,
    pub(crate) master: Box<dyn MasterPty + Send>,
    pub(crate) child: Box<dyn Child + Send>,
    #[allow(dead_code)]
    pub(crate) working_dir: String,
    /// Windows Job Object handle for process tree cleanup.
    /// When closed, all processes assigned to the job are terminated.
    pub(crate) job_handle: Option<isize>,
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        // Safety net: if kill() wasn't called (e.g., app crash recovery),
        // close the Job Object handle to trigger process tree cleanup.
        if let Some(handle) = self.job_handle.take() {
            #[cfg(windows)]
            job_object::close_job_object(handle);
            #[cfg(not(windows))]
            let _ = handle; // suppress unused warning on non-Windows
        }
    }
}

/// Manages all active terminal sessions by ID.
pub struct TerminalManager {
    terminals: HashMap<String, TerminalSession>,
}

/// Events streamed from the PTY reader thread to the frontend via Tauri Channel.
#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum TerminalEvent {
    Data { data: String },
    Exit { code: Option<u32> },
    Error { message: String },
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: HashMap::new(),
        }
    }

    pub fn insert(&mut self, id: String, session: TerminalSession) {
        self.terminals.insert(id, session);
    }

    pub fn remove(&mut self, id: &str) -> Option<TerminalSession> {
        self.terminals.remove(id)
    }

    /// Write data to a terminal's PTY input.
    pub fn write(&mut self, id: &str, data: &[u8]) -> Result<(), String> {
        let session = self
            .terminals
            .get_mut(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;
        session
            .writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    }

    /// Resize a terminal's PTY.
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self
            .terminals
            .get(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;
        let size = portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        session
            .master
            .resize(size)
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    }

    /// Kill a terminal's entire process tree and remove it from the manager.
    ///
    /// If a Job Object is attached, closing its handle triggers
    /// KILL_ON_JOB_CLOSE which terminates all processes in the tree.
    /// Falls back to child.kill() as belt-and-suspenders.
    pub fn kill(&mut self, id: &str) -> Result<(), String> {
        let mut session = self
            .remove(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;

        // Close Job Object first -- this kills the entire process tree
        if let Some(handle) = session.job_handle.take() {
            #[cfg(windows)]
            job_object::close_job_object(handle);
            #[cfg(not(windows))]
            let _ = handle;
        }

        // Belt-and-suspenders: also kill the direct child process.
        // This should return quickly since the Job Object already killed it.
        let _ = session.child.kill();

        // Wait for child to fully exit (should be near-instant after job close)
        let _ = session.child.wait();

        Ok(())
    }
}
