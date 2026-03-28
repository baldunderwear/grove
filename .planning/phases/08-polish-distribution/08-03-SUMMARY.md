---
phase: 08-polish-distribution
plan: 03
subsystem: ui, infra
tags: [tauri-updater, auto-update, ci, signing, plugin-updater, plugin-process]

requires:
  - phase: 08-01
    provides: Tauri updater plugin configured in Cargo.toml and tauri.conf.json
provides:
  - UpdateChecker component with in-app update notification and download UI
  - CI workflow with signing env vars for updater artifact generation
affects: [distribution, release]

tech-stack:
  added: ["@tauri-apps/plugin-updater", "@tauri-apps/plugin-process"]
  patterns: [delayed-update-check, top-bar-notification]

key-files:
  created:
    - src-ui/src/components/UpdateChecker.tsx
  modified:
    - src-ui/src/App.tsx
    - src-ui/package.json
    - src-ui/package-lock.json
    - .github/workflows/build.yml

key-decisions:
  - "5-second delayed update check to avoid blocking startup (NFR-01.1)"
  - "Silent failure on update check errors -- non-critical path"

patterns-established:
  - "Top-bar notification pattern: UpdateChecker renders above main layout, hidden when idle"

requirements-completed: [NFR-04.3, NFR-04.2, NFR-04.1]

duration: 5min
completed: 2026-03-28
---

# Phase 08 Plan 03: Update Checker UI + CI Signing Summary

**In-app update notification bar with download/install/relaunch flow, plus CI signing env vars for updater artifact generation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T04:27:15Z
- **Completed:** 2026-03-28T04:32:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- UpdateChecker component checks for updates 5s after launch, shows slim blue top bar when update available
- Download progress tracking with percentage, error handling with retry
- CI workflow passes TAURI_SIGNING_PRIVATE_KEY and password to tauri-action for signed .sig artifacts

## Task Commits

Each task was committed atomically:

1. **Task 1: Install updater/process JS packages and create UpdateChecker component** - `7192c74` (feat)
2. **Task 2: Update CI workflow with signing env vars for updater artifacts** - `47bb1db` (chore)

## Files Created/Modified
- `src-ui/src/components/UpdateChecker.tsx` - Update check UI with idle/available/downloading/error states
- `src-ui/src/App.tsx` - Added UpdateChecker as first child in TooltipProvider
- `src-ui/package.json` - Added plugin-updater and plugin-process dependencies
- `src-ui/package-lock.json` - Updated lockfile with new dependencies
- `.github/workflows/build.yml` - Added TAURI_SIGNING_PRIVATE_KEY env vars to tauri-action step

## Decisions Made
- 5-second delayed update check avoids blocking app startup (NFR-01.1 compliance)
- Silent failure on update check errors -- update checking is non-critical, should never break the app
- releaseDraft kept true in CI -- user manually publishes after review

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

Before auto-update works in production, the user must:
1. Generate signing keys: `npx tauri signer generate -w ~/.tauri/grove.key`
2. Add `TAURI_SIGNING_PRIVATE_KEY` as GitHub repository secret
3. Add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub repository secret
4. Replace `UPDATER_PUBKEY_PLACEHOLDER` in `src-tauri/tauri.conf.json` with the generated public key

## Next Phase Readiness
- Update UI is wired and ready -- will activate once updater endpoint and signing keys are configured
- Plan 04 (final polish/testing) can proceed

---
*Phase: 08-polish-distribution*
*Completed: 2026-03-28*
