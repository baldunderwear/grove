# Testing Patterns

**Analysis Date:** 2026-04-01

## Test Framework

**Frontend (TypeScript/React):**
- No test framework installed. `package.json` has no test dependencies (no Vitest, Jest, React Testing Library, or similar). The `scripts` block has no `test` command.
- The `lint` script is `tsc -b --noEmit` — type checking serves as the only automated frontend quality gate.

**Backend (Rust):**
- Framework: Rust's built-in `#[test]` attribute with `cargo test`
- No additional testing crates (no `mockall`, `proptest`, `rstest`, etc.)
- Tests live in `#[cfg(test)]` modules at the bottom of the source files they test

**Run Commands:**
```bash
# Run all Rust tests
cargo test

# Run tests for a specific module
cargo test git::build

# Run a specific test
cargo test extract_plain_text

# TypeScript type check (only automated frontend check)
cd src-ui && npm run typecheck
```

## Test File Organization

**Rust:**
- Tests are co-located in the same file as the code they test, inside `#[cfg(test)] mod tests { ... }` at the bottom
- No separate test files or `tests/` directory detected
- Test modules use `use super::*` to access private functions — private helpers are testable without making them `pub`

**TypeScript:**
- No test files exist. No `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files found anywhere in the project.

**Files with test coverage (Rust):**
- `src-tauri/src/git/build.rs` — tests for build number extraction and replacement
- `src-tauri/src/terminal/state_parser.rs` — tests for ANSI stripping and regex pattern matching
- `src-tauri/src/git/changelog.rs` — has `#[cfg(test)]` block (inferred from pattern)
- `src-tauri/src/watcher/mod.rs` — has `#[cfg(test)]` block (inferred from pattern)

## Test Structure

**Rust suite pattern:**
```rust
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
    }
}
```

**Patterns:**
- No setup/teardown functions (`before_each`/`after_each` equivalents) — tests are self-contained
- No test fixtures or factory functions — input data is defined inline as string literals
- `assert_eq!` is the primary assertion macro
- `assert!` used for boolean assertions (e.g., regex match results)
- Negative cases tested alongside positive cases in the same test function

## Mocking

**Framework:** None. No mocking library is used.

**What is tested directly:**
- Pure functions with no side effects: `extract_build_number`, `replace_build_number`, `strip_ansi`
- Regex pattern matching: `WAITING_BARE_PROMPT`, `ERROR_PATTERN`
- String transformations with known inputs and outputs

**What is NOT tested (requires Tauri/git context):**
- All Tauri commands in `src-tauri/src/commands/` — require `AppHandle`, `State`, filesystem access
- Git operations (`branches.rs`, `merge.rs`, `status.rs`) — require a real git repository
- File system operations (`persistence.rs`, `changelog.rs`) — require real filesystem paths
- Process management (`process/`) — requires spawning actual processes
- Frontend stores and components — no test framework installed

## Fixtures and Factories

**Test data:**
- All test inputs defined inline as string literals or integer constants
- No shared fixture files or factory functions
- Raw string literals (`r#"..."#`) used for JSON content in build number tests:

```rust
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
```

**Location:**
- All test data inline with test functions — no separate fixture directory

## Coverage

**Requirements:** None enforced. No coverage configuration, no minimum thresholds.

**What has coverage:**
- Build number parsing logic (`src-tauri/src/git/build.rs`) — well covered with positive and negative cases across 3 formats (plain text, JSON, TOML)
- ANSI escape stripping (`src-tauri/src/terminal/state_parser.rs`) — covered for CSI, OSC, and plain text cases
- Waiting prompt regex patterns — covered for bare and named prompt forms
- Error pattern regex — covered for known error strings and non-error strings

**What lacks coverage:**
- Entire TypeScript frontend (no test framework installed)
- All Tauri command handlers (`src-tauri/src/commands/`)
- Git operations: branch listing, merge preview, merge execution, worktree enumeration
- Config persistence: load, save, migration logic
- Process detection and session management
- File watcher logic
- Notification state logic
- Changelog fragment discovery and rename logic

**View Coverage:**
```bash
cargo test -- --nocapture   # See test output inline
# No HTML coverage reports configured
```

## Test Types

**Unit Tests:**
- Scope: Pure functions with no external dependencies (filesystem, git, Tauri state)
- Approach: Input/output assertions using `assert_eq!` and `assert!`
- Location: `#[cfg(test)] mod tests` at bottom of each source file

**Integration Tests:**
- Not present. No `tests/` directory. No integration test harness.

**E2E Tests:**
- Not used. No E2E framework (no Playwright, Tauri's built-in test driver, etc.).

## Common Patterns

**Testing pure functions:**
```rust
#[test]
fn replace_json() {
    assert_eq!(
        replace_build_number(r#"{ "build": 7 }"#, 8),
        r#"{ "build": 8 }"#
    );
}
```

**Testing regex directly (static LazyLock):**
```rust
#[test]
fn test_waiting_bare_prompt() {
    assert!(WAITING_BARE_PROMPT.is_match(">"));
    assert!(WAITING_BARE_PROMPT.is_match("  >  "));
    assert!(!WAITING_BARE_PROMPT.is_match("foo > bar"));
}
```

**Testing with multiple related assertions in one test (grouping by input type):**
```rust
#[test]
fn extract_toml() {
    assert_eq!(extract_build_number("build = 55"), Some(55));
    assert_eq!(extract_build_number("build_number = 123"), Some(123));
}
```

## Notes for Adding Tests

**When adding Rust tests:**
- Add `#[cfg(test)] mod tests { use super::*; ... }` at the bottom of the file
- Test pure/helper functions directly via `use super::*` — no need for them to be `pub`
- Tauri command functions cannot be unit tested without significant mocking infrastructure; test their dependencies instead

**When adding TypeScript tests:**
- A test framework must be installed first (Vitest is the natural choice for Vite + React projects)
- Zustand stores are testable in isolation by calling actions and asserting state
- Components would require React Testing Library + jsdom

---

*Testing analysis: 2026-04-01*
