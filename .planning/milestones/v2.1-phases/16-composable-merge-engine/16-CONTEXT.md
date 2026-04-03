# Phase 16: Composable Merge Engine - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Decompose the monolithic `merge_branch()` function in `src-tauri/src/git/merge.rs` into discrete, composable step functions that can be orchestrated independently for both single-branch merge and multi-branch queue scenarios. The existing single-branch merge must work identically after refactoring (no regression). Each step validates its prerequisites before running.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from project research:
- Current `merge_branch()` is ~150 lines with no transaction boundary
- Build numbers are detected from disk (filesystem), not git tree — this must be addressed for queue safety
- Pipeline steps: preview → execute → bump → changelog → commit
- Each step must produce a context object consumed by the next step
- Steps validate prerequisites and refuse to run out of order
- The "composable" part is which steps are included, not their order — order is fixed by domain

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
