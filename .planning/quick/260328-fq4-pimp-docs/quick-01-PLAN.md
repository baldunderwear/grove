---
phase: quick-260328-fq4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - CONTRIBUTING.md
autonomous: true
requirements: [DOC-ROOT]
must_haves:
  truths:
    - "README has shields.io badges for license, platform, version, and Tauri"
    - "README has GIF/screenshot placeholder sections with clear TODO markers"
    - "README has detailed feature descriptions with concrete examples"
    - "README links to all docs/ pages"
    - "CONTRIBUTING.md covers dev setup, code style, PR process, and architecture overview"
  artifacts:
    - path: "README.md"
      provides: "Enhanced project README"
      contains: "shields.io"
    - path: "CONTRIBUTING.md"
      provides: "Contributor guide"
      contains: "Pull Request"
  key_links:
    - from: "README.md"
      to: "docs/"
      via: "markdown links"
      pattern: "docs/"
    - from: "README.md"
      to: "CONTRIBUTING.md"
      via: "markdown link"
      pattern: "CONTRIBUTING"
---

<objective>
Enhance the root-level repository documentation: a polished README.md with badges, visual placeholders, detailed features, and cross-links; plus a CONTRIBUTING.md guide.

Purpose: Make the Grove repo look professional and welcoming on GitHub.
Output: README.md (rewritten), CONTRIBUTING.md (new)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@README.md
@src-tauri/tauri.conf.json
@src-tauri/src/config/models.rs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite README.md with badges, visuals, and detailed content</name>
  <files>README.md</files>
  <read_first>README.md, src-tauri/tauri.conf.json, src-tauri/src/config/models.rs, .planning/PROJECT.md</read_first>
  <action>
Rewrite README.md from scratch. Keep the existing content's substance but restructure and expand significantly. Use this exact structure:

1. **Title block** with tagline "Manage your trees." and a one-line description.

2. **Badge row** immediately after title (all on one line, separated by spaces):
   - `![License](https://img.shields.io/github/license/baldunderwear/grove)`
   - `![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)`
   - `![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange)`
   - `![GitHub release](https://img.shields.io/github/v/release/baldunderwear/grove)`
   - `![GitHub Downloads](https://img.shields.io/github/downloads/baldunderwear/grove/total)`

3. **Hero screenshot placeholder** section:
   ```
   <p align="center">
     <img src="docs/screenshots/dashboard.png" alt="Grove Dashboard" width="800" />
     <!-- TODO: Replace with actual screenshot or GIF of dashboard in action -->
   </p>
   ```

4. **What is Grove?** section -- 2-3 paragraph overview explaining the problem (managing multiple Claude Code worktree sessions) and how Grove solves it. Mention system tray residency, lightweight footprint (~5MB Tauri app), and project-agnostic config.

5. **Features** section with subsections for each feature. Each subsection gets:
   - A descriptive heading (e.g., "Worktree Dashboard", "One-Click Session Launch")
   - 2-3 sentences explaining the feature
   - A GIF placeholder comment: `<!-- TODO: Add GIF showing [feature] in action -->`

   Features to cover (use existing README feature list but expand each):
   - Worktree Dashboard (branch status, ahead/behind, dirty indicators, sorting)
   - Session Launch (one-click Claude Code, create+launch atomic, configurable flags)
   - Smart Merge (preview, auto-resolve build conflicts, bump build numbers, changelog fragments, rollback)
   - System Tray (background operation, quick-launch menu, left/right click behavior)
   - Notifications (merge-ready, stale branch, configurable per-project)
   - Auto-Fetch (background remote fetch, SSH agent compatible, configurable interval)
   - Keyboard Shortcuts (table from existing README)
   - Auto-Update (GitHub Releases, Tauri updater)

6. **Installation** section -- keep existing content but add "Requirements" callout box using blockquote.

7. **Quick Start** section -- expand the existing 4 steps to include a brief "what you'll see" after each step.

8. **Configuration Overview** section -- brief overview with a JSON example showing a full config.json with 2 projects (one with build files + changelog, one plain). Link to `docs/configuration.md` for full reference. Use the actual Rust model fields from models.rs for accuracy:
   - AppConfig: version, projects[], settings
   - ProjectConfig: id, name, path, merge_target, branch_prefix, build_files[], changelog
   - Settings: refresh_interval (default 30), start_minimized, start_with_windows, theme (default "dark"), auto_fetch_interval (default 300), notify_merge_ready, notify_stale_branch, notify_merge_complete

9. **Documentation** section linking to:
   - `docs/architecture.md` -- Architecture Deep-Dive
   - `docs/user-guide.md` -- User Guide
   - `docs/configuration.md` -- Configuration Reference
   - `docs/troubleshooting.md` -- Troubleshooting

10. **Development** section -- keep existing commands but add a brief "Architecture at a Glance" ASCII diagram showing src-tauri/ and src-ui/ with key subdirectories. Link to `docs/architecture.md` and `CONTRIBUTING.md`.

11. **Keyboard Shortcuts** table (keep from existing).

12. **License** section -- MIT with link.

13. **Acknowledgments** section -- mention Tauri, React, git2, and Claude Code.

IMPORTANT constraints:
- No emojis anywhere
- Use `--` for em-dashes (matching existing style)
- Keep language direct and practical, not marketing fluff
- All shields.io badge URLs must use the exact repo path `baldunderwear/grove`
- Config JSON examples must match the actual Rust model field names (snake_case)
  </action>
  <verify>
    <automated>grep -c "shields.io" README.md | grep -q "[3-9]" && grep -q "TODO.*GIF\|TODO.*screenshot" README.md && grep -q "docs/architecture.md" README.md && grep -q "docs/configuration.md" README.md && grep -q "CONTRIBUTING" README.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep "shields.io" README.md returns 5 badge lines
    - grep "TODO" README.md returns GIF/screenshot placeholder markers
    - grep "docs/" README.md returns links to all 4 docs pages
    - grep "CONTRIBUTING" README.md returns at least 1 link
    - grep "refresh_interval" README.md returns config example with correct field names
    - File is at least 200 lines
  </acceptance_criteria>
  <done>README.md is a polished, badge-laden, well-structured project page with visual placeholders, detailed features, config examples, and cross-links to all documentation</done>
</task>

<task type="auto">
  <name>Task 2: Create CONTRIBUTING.md</name>
  <files>CONTRIBUTING.md</files>
  <read_first>CLAUDE.md, README.md, src-tauri/tauri.conf.json</read_first>
  <action>
Create CONTRIBUTING.md with the following sections:

1. **Contributing to Grove** -- welcoming intro (direct, not gushing).

2. **Development Setup** section:
   - Prerequisites: Node.js (LTS), Rust (stable), Git, Windows 10/11
   - Step-by-step setup commands (clone, cd src-ui && npm install, cargo tauri dev)
   - Note about NAS users: junction workaround via scripts/with-modules.mjs if node_modules on NAS

3. **Project Structure** section -- ASCII tree showing:
   ```
   grove/
   ├── src-tauri/           # Rust backend (Tauri 2)
   │   ├── src/main.rs      # App setup, tray, window management
   │   ├── src/git/         # Git operations (git2 + CLI fallback)
   │   ├── src/process/     # Claude Code process spawning
   │   ├── src/config/      # Project registry, settings
   │   └── src/watcher/     # File system monitoring
   ├── src-ui/              # React frontend
   │   ├── src/stores/      # Zustand state (branches, config, sessions, merge)
   │   └── src/components/  # UI components (dashboard, settings, merge)
   ├── docs/                # Documentation
   └── scripts/             # Build and dev helper scripts
   ```

4. **Code Style** section:
   - Rust: Run `cargo clippy` and `cargo test` before committing
   - TypeScript: Run `npm run typecheck` and `npm run lint` (from src-ui/)
   - Snake_case TypeScript types to match Rust serde serialization
   - Tailwind CSS for all styling (no inline styles, no CSS modules)

5. **Making Changes** section:
   - Fork and create a feature branch
   - Keep commits focused and descriptive
   - Run the full check suite before opening a PR:
     ```bash
     cargo clippy && cargo test
     cd src-ui && npm run typecheck && npm run lint
     ```

6. **Pull Request Process**:
   - PR against `develop` branch (not main)
   - Describe what changed and why
   - Include screenshots for UI changes
   - PRs should pass CI (tauri-action builds)

7. **Architecture Notes** -- brief pointer to `docs/architecture.md` for deep-dive. Mention key patterns:
   - Tauri commands are the bridge between frontend and backend
   - git2 for local operations, git CLI for fetch (SSH agent compat)
   - Zustand stores are the frontend state layer
   - Config persists to JSON on disk (single source of truth)

8. **License** -- contributions are MIT licensed.

IMPORTANT: No emojis. Direct language. Keep under 150 lines.
  </action>
  <verify>
    <automated>grep -q "Pull Request" CONTRIBUTING.md && grep -q "cargo clippy" CONTRIBUTING.md && grep -q "develop" CONTRIBUTING.md && grep -q "architecture.md" CONTRIBUTING.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep "Pull Request" CONTRIBUTING.md finds PR process section
    - grep "cargo clippy" CONTRIBUTING.md finds code style commands
    - grep "develop" CONTRIBUTING.md mentions PR target branch
    - grep "architecture.md" CONTRIBUTING.md links to deep-dive doc
    - File is between 80 and 150 lines
  </acceptance_criteria>
  <done>CONTRIBUTING.md exists with dev setup, code style, PR process, and architecture pointers</done>
</task>

</tasks>

<verification>
- README.md has 5+ shields.io badges
- README.md has GIF/screenshot TODO placeholders
- README.md has feature subsections with descriptions
- README.md has config JSON example with correct field names
- README.md cross-links to docs/ pages and CONTRIBUTING.md
- CONTRIBUTING.md covers setup, style, PR process, architecture
</verification>

<success_criteria>
Both root-level docs exist, are well-structured, cross-linked, and contain no emojis. README is at least 200 lines with badges, visual placeholders, detailed features, and config examples. CONTRIBUTING.md is 80-150 lines with practical contributor guidance.
</success_criteria>

<output>
After completion, create `.planning/quick/260328-fq4-pimp-docs/quick-01-SUMMARY.md`
</output>
