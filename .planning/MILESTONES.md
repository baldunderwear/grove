# Milestones

## v2.1 Session Lifecycle (Shipped: 2026-04-03)

**Phases completed:** 2 phases, 6 plans, 11 tasks

**Key accomplishments:**

- Rust queue orchestrator with sequential merge execution, in-memory build number sequencing, snapshot-based atomic rollback, and file watcher suppression via shared AtomicBool flag
- Zustand store for merge queue lifecycle with Tauri event bridge, TypeScript queue types, and in-place toast progress updates via stable Sonner IDs
- 1. [Rule 1 - Bug] Renamed parameters to avoid name shadowing
- 4-step PostSessionWizard dialog with stepper, diff summary, commit review, merge integration, and controlled cleanup checkboxes
- Replaced MergeDialog IIFE with PostSessionWizard in SessionManager so session-exit "Review & Merge" opens the 4-step wizard

---
