# Stack Research

**Domain:** Session lifecycle additions for Tauri 2 + React 19 desktop app
**Researched:** 2026-04-01
**Confidence:** HIGH

## Context

This research covers ONLY new library/crate additions needed for v2.1 features. The existing stack (Tauri 2, React 19, Zustand, git2 0.20, portable-pty, xterm.js, Tailwind CSS 4, radix-ui 1.4.3) is validated and not re-evaluated.

## Recommended Stack Additions

### Frontend Libraries

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| sonner | ^2.0.7 | Toast notification system | The de facto React toast library. ~4 kB, zero-config, stackable, actionable toasts with swipe-to-dismiss. shadcn/ui's official toast choice. Provides imperative `toast()` API callable from Zustand store actions and plain utility functions -- critical for firing toasts from merge-queue callbacks without React context. |
| @dnd-kit/react | ^0.3.2 | Drag-and-drop merge queue ordering | Lightweight (~10 kB), accessibility-first sortable lists. The `useSortable` hook maps directly to merge queue reordering. Only serious React 19-compatible DnD library after react-beautiful-dnd was archived. |

### Rust Crates

**No new crates required.** The existing `git2 0.20` provides everything needed:

| Existing Crate | Feature to Use | Purpose |
|----------------|---------------|---------|
| git2 0.20 | `Diff::tree_to_tree()`, `Diff::stats()`, `DiffDelta` iteration | File-level diff summary (files changed, insertions, deletions) between source and target branches. Just needs new Tauri commands wrapping these APIs. |
| git2 0.20 | `Repository::reset()` with `ResetType::Hard` | Rollback merge queue to saved HEAD OID on failure. |

### No New UI Primitives Needed

The existing `radix-ui ^1.4.3` unified package includes every primitive the v2.1 features require:

| Primitive | Already Used | v2.1 Use |
|-----------|-------------|----------|
| Dialog | MergeDialog | Post-session workflow modal, diff summary panel |
| ScrollArea | MergeDialog, BranchTable | Diff file list, merge queue scrolling |
| Separator | Various | Section dividers in queue panel |
| Tooltip | BranchTable | Queue item status tooltips |
| Checkbox | BranchTable | Branch multi-select for queue |
| Badge | MergeDialog | Queue item status indicators |

## Installation

```bash
# New frontend dependencies (from src-ui/)
npm install sonner@^2.0.7 @dnd-kit/react@^0.3.2
```

No `cargo add` commands needed.

## Feature-to-Stack Mapping

### (1) Composable Merge Engine with Diff Summary UI

**Backend (Rust) -- no new crates:**
- New Tauri command: `diff_summary` using `git2::Diff::tree_to_tree()` to compare source branch tree vs target branch tree. Iterate `DiffDelta`s to return per-file stats: path, change status (Added/Modified/Deleted/Renamed), insertions, deletions.
- Refactor existing `merge_preview` and `merge_branch` into composable pipeline steps: `diff_summary -> preview -> confirm -> execute -> result`. Each step is an independent Tauri command the frontend orchestrates.
- `git2::DiffStats` provides aggregate totals: `files_changed()`, `insertions()`, `deletions()`.

**Frontend (React) -- no new libraries:**
- Diff summary component: collapsible file list showing path, change type icon, and +/- line counts. Built with existing Radix ScrollArea + Tailwind. This is a `git diff --stat` level summary, not a full diff renderer.
- The existing `MergeDialog` evolves into a multi-step workflow panel using the composable engine steps.

**Why no diff viewer library:** A full file-level diff renderer (react-diff-viewer-continued, ~50 kB + Prism) is overkill. The workflow needs summary stats to help users decide whether to merge, not line-by-line review. If full diff viewing is requested later, `react-diff-viewer-continued ^4.0.0` is the maintained fork to evaluate.

### (2) Multi-Branch Merge Queue with Ordering and Rollback

**Backend (Rust) -- no new crates:**
- Queue state lives in frontend Zustand. Backend provides atomic single-branch merge (already exists via `merge_branch`) plus the new `diff_summary` for pre-validation.
- New Tauri command: `rollback_to_commit(project_path, oid)` using `git2::Repository::reset(ResetType::Hard)`. Before each merge in the queue, the frontend records the target branch HEAD OID. On failure, calls rollback.
- Sequential execution is frontend-driven: call `merge_branch` for each queue item, check result, proceed or rollback.

**Frontend (React):**
- `@dnd-kit/react` with `useSortable` for drag-reorderable queue list. Provides drag handles, animated reordering, keyboard accessibility.
- New Zustand store: `merge-queue-store.ts` managing: queue items (ordered array of branch names), per-item status (pending/running/done/failed), execution state, saved rollback OIDs.
- Queue UI: panel with sortable branch cards, status badges, "Run Queue" button, progress indicator.

### (3) Toast Notification System

**Frontend (React):**
- Mount `<Toaster />` once in `App.tsx`. Use imperative `toast()` everywhere else.
- Key call sites:
  - `toast.success("Merged feature-x into develop")` -- after each merge
  - `toast.error("Merge failed: conflicts in src/main.rs")` -- on merge failure
  - `toast("Session waiting for input", { action: { label: "Focus", onClick: () => focusSession(id) } })` -- actionable session alerts
  - `toast("Queue complete: 3/3 merged")` -- queue summary
- Sonner supports Tailwind CSS theming via `toastOptions.classNames` -- matches Grove's design system variables.

**Integration with existing alerts.ts:**
- `alerts.ts` gains a new export that combines chime + taskbar flash + in-app toast.
- The existing `fireWaitingAlert()` (audio + taskbar) continues unchanged. New toast calls layer on top for visual in-app notification.
- OS notifications (tauri-plugin-notification, already installed) remain for when app is minimized to tray. Sonner handles in-app visibility.

### (4) Removing External Launch Path

**No new dependencies.** Pure refactoring:
- Remove Tauri commands that spawn external terminal windows (`launch_session` from session-store if it opens external terminals, PowerShell launch path).
- SessionManager's embedded PTY (portable-pty + xterm.js, already working) becomes the sole launch path.
- Clean up `grove-launcher.ps1` references.
- Simplify `session-store.ts`: no more external PID tracking.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| sonner | Radix Toast (in `radix-ui`) | Radix Toast requires React provider/context for every toast call. Cannot call from Zustand actions or utility functions without awkward workarounds. Sonner's imperative `toast()` is essential for store-driven notifications. |
| sonner | react-hot-toast | Less maintained, no built-in action buttons on toasts. Sonner is the ecosystem standard (shadcn/ui default). |
| @dnd-kit/react | react-beautiful-dnd | Archived by Atlassian (2024). Incompatible with React 19 StrictMode. Dead project. |
| @dnd-kit/react | HTML5 native drag events | No accessibility, no animation, no keyboard support. Poor UX for a desktop app. |
| @dnd-kit/react | @dnd-kit/core + @dnd-kit/sortable (legacy API) | The new @dnd-kit/react package is the recommended path forward. Legacy packages still work but the new API is cleaner and React 19-native. |
| git2 Diff (existing) | Shelling out to `git diff --stat` | Adds process spawning overhead and output parsing fragility. git2 already has the full diff API with typed structs. |
| Summary-only diff UI | react-diff-viewer-continued | Heavy dependency (~50 kB + Prism syntax highlighter) for a merge-preview summary. Stat-level view matches the workflow. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| react-diff-viewer-continued | 50+ kB for full file diff rendering; v2.1 only needs summary stats | Custom `<DiffSummary>` component with Tailwind |
| @radix-ui/react-toast (scoped) | Already in unified `radix-ui`; even so, Sonner's imperative API is better | sonner |
| redux / redux-toolkit | Zustand already handles all state; adding redux for queue state would be inconsistent | New Zustand store |
| bull / any job queue library | Merge queue is UI-driven, sequential, max ~10 items. A job framework adds complexity for zero benefit | Zustand store with async sequential loop |
| socket.io / WebSocket | Tauri events (`tauri::Emitter` + `@tauri-apps/api/event listen()`) already provide backend-to-frontend pub/sub | Existing Tauri event system |
| tokio | Grove uses std threads + Tauri async runtime. Adding tokio for queue async would be architectural churn | Sequential await in frontend, std::thread in Rust where needed |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| sonner ^2.0.7 | React 19, Tailwind CSS 4 | Supports `classNames` prop for theming. No peer dep conflicts with existing stack. |
| @dnd-kit/react ^0.3.2 | React 19 | Depends on @dnd-kit/dom internally (auto-installed). 0.x version -- API may shift, but core sortable pattern is stable. |
| git2 0.20 (existing) | Already in Cargo.toml | Diff API (`tree_to_tree`, `DiffStats`, `DiffDelta`) is stable since git2 0.14+. |
| radix-ui ^1.4.3 (existing) | React 19 | Unified package includes all needed primitives. |

## Estimated Bundle Impact

| Addition | Size (gzip) | Notes |
|----------|-------------|-------|
| sonner | ~4 kB | Minimal for a full toast system |
| @dnd-kit/react + @dnd-kit/dom | ~12 kB | Includes sortable utilities |
| **Total frontend addition** | **~16 kB** | Negligible for desktop app |

No Rust binary size increase (no new crates).

## Sources

- [git2 Diff struct docs](https://docs.rs/git2/latest/git2/struct.Diff.html) -- verified tree_to_tree(), stats(), delta iteration (HIGH confidence)
- [git2 DiffStats docs](https://docs.rs/git2/latest/git2/struct.DiffStats.html) -- verified files_changed(), insertions(), deletions() (HIGH confidence)
- [git2-rs diff example](https://github.com/rust-lang/git2-rs/blob/master/examples/diff.rs) -- reference implementation (HIGH confidence)
- [Sonner GitHub](https://github.com/emilkowalski/sonner) -- v2.0.7, imperative API, React 19 compatible (HIGH confidence)
- [shadcn/ui Sonner docs](https://ui.shadcn.com/docs/components/radix/sonner) -- confirmed as official toast integration (HIGH confidence)
- [@dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.3.2, React 19 compatible (MEDIUM confidence: 0.x version, but core sortable API is stable)
- [Radix UI unified package changelog](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui) -- confirmed Toast and all primitives in unified package (HIGH confidence)
- [Radix Toast primitive docs](https://www.radix-ui.com/primitives/docs/components/toast) -- evaluated, rejected in favor of Sonner (HIGH confidence)

---
*Stack research for: Grove v2.1 Session Lifecycle*
*Researched: 2026-04-01*
