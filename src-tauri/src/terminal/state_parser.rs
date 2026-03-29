use std::sync::LazyLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use regex::Regex;
use tauri::Emitter;

/// Session states detected from PTY output analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    /// Tool calls streaming, output flowing
    Working,
    /// Claude prompt visible, waiting for user input
    Waiting,
    /// No output for > 60 seconds
    Idle,
    /// Error patterns detected
    Error,
}

/// Payload emitted via Tauri events on state transitions.
#[derive(Clone, serde::Serialize)]
pub struct SessionStatePayload {
    pub terminal_id: String,
    pub state: SessionState,
    pub timestamp: u64,
}

/// Compiled ANSI escape sequence stripper (built once, reused forever).
static ANSI_STRIP_RE: LazyLock<Regex> = LazyLock::new(|| {
    // Order matters: try longer/more-specific patterns first.
    // CSI sequences: ESC [ <params> <final byte>
    // OSC sequences: ESC ] ... BEL  or  ESC ] ... ST(ESC \)
    // Charset selection: ESC ( B, ESC ) 0, etc.
    // Single-char escapes: ESC followed by =, >, N, H, etc.
    Regex::new(concat!(
        r"\x1b\[[0-9;]*[a-zA-Z]",         // CSI sequences
        r"|\x1b\][^\x07]*\x07",            // OSC terminated by BEL
        r"|\x1b\][^\x1b]*\x1b\\",          // OSC terminated by ST
        r"|\x1b[()][A-B0-2]",              // Charset selection
        r"|\x1b[=>NOHMDEFcZ78]",           // Single-char escapes
        r"|\x1b",                           // Stray ESC (catch-all)
        r"|[\x00-\x08\x0e-\x1a\x7f]",     // Other control chars (except \t \n \r)
    ))
    .expect("ANSI strip regex must compile")
});

/// Strip all ANSI escape sequences and control characters from raw PTY output.
fn strip_ansi(raw: &str) -> String {
    ANSI_STRIP_RE.replace_all(raw, "").into_owned()
}

/// Waiting-prompt patterns (compiled once).
static WAITING_BARE_PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*>\s*$").expect("bare prompt regex must compile")
});

static WAITING_NAMED_PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)claude\s*>").expect("named prompt regex must compile")
});

/// Error patterns.
static ERROR_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(Error:|ERROR\b|panic\b|Permission denied|EACCES)\b")
        .expect("error pattern regex must compile")
});

/// Real-time session state parser that processes stripped PTY output.
///
/// Lives inside the PTY reader thread. Receives raw PTY data, strips ANSI,
/// detects state transitions, and emits Tauri events.
pub struct StateParser {
    terminal_id: String,
    current_state: SessionState,
    last_output_time: Instant,
    last_state_change: Instant,
    line_buffer: String,
    app_handle: tauri::AppHandle,
    /// Count of non-empty lines seen since last state change (for debounce).
    lines_since_change: u32,
}

impl StateParser {
    /// Create a new parser. Initial state is Working (Claude is starting up).
    pub fn new(terminal_id: String, app_handle: tauri::AppHandle) -> Self {
        let now = Instant::now();
        Self {
            terminal_id,
            current_state: SessionState::Working,
            last_output_time: now,
            last_state_change: now,
            line_buffer: String::new(),
            app_handle,
            lines_since_change: 0,
        }
    }

    /// Feed raw PTY data (may contain partial lines, ANSI codes, etc.).
    ///
    /// Called from the PTY reader thread after sending data to xterm.js Channel.
    pub fn feed(&mut self, raw_data: &str) {
        self.last_output_time = Instant::now();

        // If we were Idle, any output means we're Working again
        if self.current_state == SessionState::Idle {
            self.transition_to(SessionState::Working);
        }

        let stripped = strip_ansi(raw_data);
        self.line_buffer.push_str(&stripped);

        // Process complete lines
        while let Some(newline_pos) = self.line_buffer.find('\n') {
            let line: String = self.line_buffer.drain(..=newline_pos).collect();
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            self.lines_since_change += 1;
            self.process_line(trimmed);
        }

        // Also check the buffer itself for prompt patterns (prompts may not end with newline)
        let buf_trimmed = self.line_buffer.trim().to_string();
        if !buf_trimmed.is_empty() {
            self.check_prompt_in_buffer(&buf_trimmed);
        }
    }

    /// Check if session has gone idle (no output for 60+ seconds).
    ///
    /// Called by the idle-detection timer thread via shared state.
    pub fn check_idle_elapsed(&mut self, elapsed_since_last_output_secs: u64) {
        if elapsed_since_last_output_secs >= 60 && self.current_state != SessionState::Idle {
            self.transition_to(SessionState::Idle);
        }
    }

    /// Process a single complete line for state detection.
    fn process_line(&mut self, line: &str) {
        // Check for error patterns first (but only if we've seen some output --
        // don't trigger on compiler output mid-stream during Working)
        if self.current_state != SessionState::Working || self.lines_since_change > 5 {
            if ERROR_PATTERN.is_match(line) {
                self.transition_to(SessionState::Error);
                return;
            }
        }

        // Check for waiting patterns
        if self.is_waiting_pattern(line) {
            // Debounce: require 2+ seconds since last state change to avoid
            // flicker during rapid tool output that happens to contain ">"
            if self.last_state_change.elapsed().as_secs() >= 2 {
                self.transition_to(SessionState::Waiting);
            }
            return;
        }

        // Any non-empty line that isn't waiting/error = Working
        if self.current_state != SessionState::Working {
            self.transition_to(SessionState::Working);
        }
    }

    /// Check if the current buffer content looks like a prompt (may not have newline yet).
    fn check_prompt_in_buffer(&mut self, buf: &str) {
        if self.is_waiting_pattern(buf) && self.last_state_change.elapsed().as_secs() >= 2 {
            self.transition_to(SessionState::Waiting);
        }
    }

    /// Return true if the line matches a "waiting for input" prompt pattern.
    fn is_waiting_pattern(&self, line: &str) -> bool {
        // Bare prompt: just ">" with optional whitespace
        if WAITING_BARE_PROMPT.is_match(line) {
            return true;
        }
        // Named prompt: "claude>" or similar
        if WAITING_NAMED_PROMPT.is_match(line) {
            return true;
        }
        // Claude Code question prompts
        if line.contains("What would you like to do?")
            || line.contains("How can I help")
            || line.contains("? (y/n)")
        {
            return true;
        }
        // Trailing "> " at end of line (common prompt pattern)
        if line.ends_with("> ") || line.ends_with(">") {
            // Only count as prompt if line is short (actual prompts, not output containing ">")
            if line.len() < 80 {
                return true;
            }
        }
        false
    }

    /// Transition to a new state, emitting a Tauri event if the state actually changed.
    fn transition_to(&mut self, new_state: SessionState) {
        if new_state == self.current_state {
            return;
        }

        self.current_state = new_state;
        self.last_state_change = Instant::now();
        self.lines_since_change = 0;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let payload = SessionStatePayload {
            terminal_id: self.terminal_id.clone(),
            state: new_state,
            timestamp,
        };

        // Emit event -- if this fails (no listeners), that's fine
        let _ = self.app_handle.emit("session-state-changed", payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_basic() {
        let raw = "\x1b[32mHello\x1b[0m World";
        assert_eq!(strip_ansi(raw), "Hello World");
    }

    #[test]
    fn test_strip_ansi_osc() {
        let raw = "\x1b]0;Window Title\x07Some text";
        assert_eq!(strip_ansi(raw), "Some text");
    }

    #[test]
    fn test_strip_ansi_complex() {
        let raw = "\x1b[1;34m\x1b(B\x1b[mfoo\x1b[0m";
        let stripped = strip_ansi(raw);
        assert_eq!(stripped, "foo");
    }

    #[test]
    fn test_strip_ansi_preserves_plain_text() {
        let raw = "Just plain text with no escapes\n";
        assert_eq!(strip_ansi(raw), raw);
    }

    #[test]
    fn test_waiting_bare_prompt() {
        assert!(WAITING_BARE_PROMPT.is_match(">"));
        assert!(WAITING_BARE_PROMPT.is_match("  >  "));
        assert!(!WAITING_BARE_PROMPT.is_match("foo > bar"));
    }

    #[test]
    fn test_error_pattern() {
        assert!(ERROR_PATTERN.is_match("Error: something went wrong"));
        assert!(ERROR_PATTERN.is_match("Permission denied"));
        assert!(!ERROR_PATTERN.is_match("no errors here"));
    }
}
