---
phase: 08-polish-distribution
plan: 01
subsystem: infra
tags: [tauri-updater, release-profile, lto, auto-update]

requires:
  - phase: 07-background-intelligence
    provides: "Complete app with tray, notifications, auto-fetch"
provides:
  - "Updater plugin registered with GitHub Releases endpoint"
  - "Process plugin for restart-after-update"
  - "Optimized release profile (LTO, strip, opt-level s)"
affects: [08-02-version-branding, 08-03-ci-release, 08-04-installer]

tech-stack:
  added: [tauri-plugin-updater, tauri-plugin-process]
  patterns: [updater-pubkey-placeholder, release-profile-size-optimization]

key-files:
  created: []
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/tauri.conf.json
    - src-tauri/capabilities/default.json

key-decisions:
  - "UPDATER_PUBKEY_PLACEHOLDER used for pubkey -- real key generated at release time, never committed"
  - "opt-level s (size) over z (aggressive size) for better performance balance"

patterns-established:
  - "Updater endpoint pattern: GitHub Releases latest.json for Tauri auto-update"

requirements-completed: [NFR-04.3, NFR-01.1, NFR-01.3, NFR-01.4]

duration: 47s
completed: 2026-03-28
---

# Phase 8 Plan 1: Updater Infrastructure Summary

**Tauri updater plugin with GitHub Releases endpoint, process restart capability, and LTO-optimized release profile**

## Performance

- **Duration:** 47s
- **Started:** 2026-03-28T04:23:56Z
- **Completed:** 2026-03-28T04:24:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added tauri-plugin-updater and tauri-plugin-process dependencies
- Registered both plugins in the Tauri builder chain
- Configured updater with GitHub Releases endpoint and pubkey placeholder
- Added release profile with LTO, strip, codegen-units=1, opt-level=s for minimal binary size
- Granted updater:default and process:allow-restart permissions in capabilities

## Task Commits

Each task was committed atomically:

1. **Task 1: Add updater and process plugin dependencies and release profile** - `9918c27` (chore)
2. **Task 2: Register updater plugin in Rust, configure tauri.conf.json, update capabilities** - `9767164` (feat)

## Files Created/Modified
- `src-tauri/Cargo.toml` - Added updater + process deps and [profile.release] section
- `src-tauri/src/lib.rs` - Registered tauri_plugin_updater and tauri_plugin_process
- `src-tauri/tauri.conf.json` - Added createUpdaterArtifacts, updater plugin config with endpoint
- `src-tauri/capabilities/default.json` - Added updater:default and process:allow-restart permissions

## Decisions Made
- Used UPDATER_PUBKEY_PLACEHOLDER for pubkey value -- signing keys must never be committed, user generates with `npx tauri signer generate` before first release
- Selected opt-level "s" (optimize for size) rather than "z" (aggressively optimize for size) for better performance balance

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

Before first release build, user must:
1. Run `npx tauri signer generate` to create signing keypair
2. Replace `UPDATER_PUBKEY_PLACEHOLDER` in `src-tauri/tauri.conf.json` with the generated public key
3. Store the private key securely for CI signing

## Known Stubs

- `src-tauri/tauri.conf.json` line with `"pubkey": "UPDATER_PUBKEY_PLACEHOLDER"` -- intentional placeholder, replaced at release time per security best practice. Plan 03 (CI/release) will handle key injection via environment variable.

## Next Phase Readiness
- Updater infrastructure ready for Plan 02 (version/branding) and Plan 03 (CI/release pipeline)
- No blockers

---
*Phase: 08-polish-distribution*
*Completed: 2026-03-28*
