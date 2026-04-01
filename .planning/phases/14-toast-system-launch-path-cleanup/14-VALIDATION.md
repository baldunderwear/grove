# Phase 14: Toast System + Launch Path Cleanup - Validation

**Created:** 2026-04-01
**Source:** 14-RESEARCH.md Validation Architecture section

## Test Framework

| Property | Value |
|----------|-------|
| Framework | TypeScript: none (no frontend tests); Rust: built-in `#[cfg(test)]` |
| Config file | none |
| Quick run command | `cd src-ui && npm run typecheck` (TypeScript) / `cargo check` (Rust) |
| Full suite command | `cd Z:/data/development/grove/src-ui && npm run typecheck && cd Z:/data/development/grove/src-tauri && cargo clippy` |

## Phase Requirements - Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOAST-01 | Toast fires on state change | manual | Visual verification in dev mode | N/A |
| TOAST-02 | Toast action navigates to session | manual | Click "View Session" in toast | N/A |
| TOAST-03 | Error toast persists, info auto-dismisses | manual | Trigger error state, wait 5s | N/A |
| TOAST-04 | Max 3 toasts visible | manual | Trigger 4+ rapid state changes | N/A |
| LPATH-01 | SessionManager is sole launch path | typecheck | `npm run typecheck` (no launch_session imports) | N/A |
| LPATH-02 | External launch fully removed | compile | `cargo check` (no process/detect.rs) | N/A |
| LPATH-03 | All references cleaned up | compile + typecheck | `npm run typecheck && cargo clippy` | N/A |

## Sampling Rate

- **Per task commit:** `cd Z:/data/development/grove/src-ui && npm run typecheck && cd Z:/data/development/grove/src-tauri && cargo check`
- **Per wave merge:** `cd Z:/data/development/grove/src-ui && npm run typecheck && cd Z:/data/development/grove/src-tauri && cargo clippy`
- **Phase gate:** Full suite green before `/gsd:verify-work`

## Wave 0 Gaps

None — validation for this phase relies on TypeScript type checking and Rust compilation, both of which are already configured. Toast behavior is manual-verification only (no frontend test framework).
