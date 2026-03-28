# Phase 08: Polish & Distribution - Research

**Researched:** 2026-03-28
**Domain:** Tauri 2 auto-update, Windows installer, performance, keyboard shortcuts, release pipeline
**Confidence:** HIGH

## Summary

Phase 08 covers four distinct areas: (1) Tauri updater plugin integration for auto-updates via GitHub Releases, (2) CI pipeline enhancement for signed release builds, (3) in-app keyboard shortcuts, and (4) documentation (README + LICENSE). The app already has a working CI pipeline with `tauri-action@v0` producing NSIS and MSI installers, so the main new work is adding the updater plugin, signing infrastructure, release workflow changes, and polish items.

The updater plugin is well-documented and follows the same pattern as other Tauri 2 plugins already in the project. The `tauri-action@v0` already supports generating `latest.json` updater artifacts when `createUpdaterArtifacts` is enabled in `tauri.conf.json`. The signing key pair must be generated locally and stored as GitHub Actions secrets.

**Primary recommendation:** Add `tauri-plugin-updater` (Rust + JS), configure signing keys, enable `createUpdaterArtifacts` in tauri.conf.json, update CI to pass signing env vars, add in-app keyboard shortcuts via React `useEffect` keydown listeners, bump version to 1.0.0, and write README + LICENSE.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked -- all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion -- polish/infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFR-01.1 | App launch to usable dashboard < 2 seconds | Rust release profile optimizations, lazy loading patterns |
| NFR-01.2 | Git status refresh < 500ms per project | Already implemented in Phases 03-04; verify with profiling |
| NFR-01.3 | Memory usage < 100MB resident | Rust release build + WebView2 baseline; monitor with sysinfo |
| NFR-01.4 | Installer size < 20MB | NSIS compression (LZMA default), Rust strip/LTO settings |
| NFR-02.1 | Merge operations are atomic (rollback on failure) | Already implemented in Phase 06; verify via testing |
| NFR-02.2 | App handles disconnected network paths gracefully | Error handling patterns for Z: drive; already partially addressed |
| NFR-02.3 | No data loss -- configuration survives crashes | Already implemented with disk-file-as-truth pattern |
| NFR-03.1 | Zero configuration needed for basic use | Already implemented in Phases 01-02 |
| NFR-03.2 | Build number and changelog features are opt-in per project | Already implemented in Phase 06 |
| NFR-03.3 | All destructive operations require confirmation | Already implemented in Phase 06 (merge confirm dialog) |
| NFR-03.4 | Keyboard shortcuts for common actions | React keydown event handler in App.tsx |
| NFR-04.1 | Windows MSI or NSIS installer via Tauri bundler | Already working in CI (Phase 01) |
| NFR-04.2 | GitHub Releases for distribution | tauri-action already creates draft releases; switch to published for v1.0 |
| NFR-04.3 | Auto-update support (Tauri updater plugin) | tauri-plugin-updater v2 + signing keys + createUpdaterArtifacts |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri-plugin-updater | 2 (Rust crate) | Auto-update checking, download, install | Official Tauri 2 updater plugin |
| @tauri-apps/plugin-updater | 2.10.0 (npm) | JS bindings for update check/install UI | Official JS bindings |
| @tauri-apps/plugin-process | 2.3.1 (npm) | `relaunch()` after update install | Required for post-update restart |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tauri-plugin-process | 2 (Rust crate) | Process control (relaunch) | After update installation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React keydown for shortcuts | tauri-plugin-global-shortcut | Global shortcuts work when app unfocused -- overkill for in-app actions; adds plugin complexity |
| NSIS installer | MSI only | NSIS already configured and is the updater-compatible format; MSI can remain as secondary |

**Installation:**
```bash
# Rust (in src-tauri/)
cargo add tauri-plugin-updater
cargo add tauri-plugin-process

# JS (in src-ui/)
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

## Architecture Patterns

### Pattern 1: Updater Plugin Setup (Tauri 2 standard)

**What:** Register plugin in Rust, configure endpoints + pubkey in tauri.conf.json, add capability permissions.

**When to use:** Always for auto-update support.

**Rust registration in lib.rs:**
```rust
// Add in the .setup() closure, alongside other plugins
app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
```

**tauri.conf.json additions:**
```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<CONTENTS OF PUBLIC KEY>",
      "endpoints": [
        "https://github.com/baldunderwear/grove/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**Capabilities (default.json) -- add these permissions:**
```json
"updater:default"
```
This grants: `allow-check`, `allow-download`, `allow-install`, `allow-download-and-install`.

### Pattern 2: Frontend Update Check

**What:** Check for updates on app launch, show dialog, download and install.

```typescript
// Source: https://v2.tauri.app/plugin/updater/
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

async function checkForUpdates() {
  const update = await check();
  if (update) {
    console.log(`Update available: ${update.version}`);
    // Show UI dialog to user, then:
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          console.log(`Downloading ${event.data.contentLength} bytes`);
          break;
        case 'Progress':
          console.log(`Downloaded ${event.data.chunkLength} bytes`);
          break;
        case 'Finished':
          console.log('Download finished');
          break;
      }
    });
    await relaunch();
  }
}
```

### Pattern 3: Signing Key Setup

**What:** Generate ed25519 key pair for update artifact signing.

```bash
# Generate key pair (run once, store securely)
npx tauri signer generate -w ~/.tauri/grove.key
```

This produces:
- Private key file at specified path
- Public key printed to console (put in tauri.conf.json `plugins.updater.pubkey`)
- Password prompt (store as GitHub secret)

**GitHub Actions secrets needed:**
- `TAURI_SIGNING_PRIVATE_KEY` -- content of private key (or path)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` -- key password

### Pattern 4: Keyboard Shortcuts (React keydown)

**What:** In-app keyboard shortcuts via standard DOM events. No Tauri plugin needed.

```typescript
// In App.tsx useEffect
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Ctrl+R or F5: refresh branches
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      // trigger refresh
    }
    // Ctrl+N: new worktree
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      // open new worktree dialog
    }
    // Ctrl+,: open settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      // navigate to settings
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

### Pattern 5: Rust Release Profile Optimization

**What:** Configure Cargo release profile for small binary size.

```toml
# In src-tauri/Cargo.toml
[profile.release]
strip = true
lto = true
codegen-units = 1
opt-level = "s"  # optimize for size
```

### Recommended Shortcut Map
| Shortcut | Action | Context |
|----------|--------|---------|
| Ctrl+R / F5 | Refresh branches | Dashboard |
| Ctrl+N | New worktree | Dashboard |
| Ctrl+, | Open settings | Global |
| Escape | Close dialog | Any open dialog |
| Ctrl+1-9 | Switch project (by sidebar index) | Global |

### Anti-Patterns to Avoid
- **Global shortcut plugin for in-app shortcuts:** Registers OS-level shortcuts that conflict with other apps. Use DOM keydown for in-app actions.
- **Checking for updates on every focus event:** Throttle to once per hour or on explicit user action.
- **Storing signing keys in the repository:** Keys must be in GitHub Secrets only, never committed.
- **Using `releaseDraft: true` for production releases:** Draft releases are not visible to the updater endpoint. Must publish releases for auto-update to work.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auto-update mechanism | Custom HTTP download + replace binary | tauri-plugin-updater | Handles signing verification, NSIS silent install, atomic replacement |
| Update artifact generation | Manual latest.json creation | tauri-action with createUpdaterArtifacts | Generates correct platform keys, signatures, URLs automatically |
| Code signing | Manual signtool invocation | tauri-action env vars | Handles sign + timestamp in correct build order |
| App relaunch after update | Custom process spawn | @tauri-apps/plugin-process relaunch() | Handles graceful shutdown + restart correctly |

**Key insight:** The Tauri updater ecosystem (plugin + tauri-action + createUpdaterArtifacts) is designed to work as a unit. Using all three together means the `latest.json` format, signature verification, and installer behavior are all compatible by default.

## Common Pitfalls

### Pitfall 1: Draft Releases Block Auto-Update
**What goes wrong:** Auto-updater cannot find updates because releases are drafts.
**Why it happens:** Current CI has `releaseDraft: true`. The updater endpoint `releases/latest/download/latest.json` only resolves for published (non-draft) releases.
**How to avoid:** For the v1.0 release, either publish the draft manually or change CI to `releaseDraft: false` for tag pushes.
**Warning signs:** `check()` returns null even though a release exists on GitHub.

### Pitfall 2: Missing Signing Environment Variables
**What goes wrong:** Build succeeds but no `.sig` files or `latest.json` are generated.
**Why it happens:** `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` not set in CI environment.
**How to avoid:** Add both as GitHub repository secrets and pass them in the workflow env block for tauri-action.
**Warning signs:** Build output missing `.sig` files in artifacts.

### Pitfall 3: Version String Not Bumped
**What goes wrong:** Updater sees same version and reports no update available.
**Why it happens:** `version` in `tauri.conf.json` and `Cargo.toml` still at `0.1.0`.
**How to avoid:** Bump all three version locations (tauri.conf.json, src-tauri/Cargo.toml, src-ui/package.json) to `1.0.0` before the release build.
**Warning signs:** `update.version` matches current version.

### Pitfall 4: Endpoint URL Format
**What goes wrong:** Updater cannot fetch latest.json.
**Why it happens:** Wrong URL format for GitHub releases.
**How to avoid:** Use exactly: `https://github.com/baldunderwear/grove/releases/latest/download/latest.json`
**Warning signs:** Network error or 404 when checking for updates.

### Pitfall 5: WebView2 Bootstrapper Adds to Perceived Installer Size
**What goes wrong:** Installer appears larger than expected due to WebView2 download.
**Why it happens:** Current config uses `downloadBootstrapper` which downloads WebView2 at install time (small installer but requires internet).
**How to avoid:** This is actually the correct approach for keeping installer size under 20MB. The NSIS `.exe` itself will be small; WebView2 downloads separately.
**Warning signs:** None -- this is the desired behavior.

### Pitfall 6: NAS Junction Workaround in CI
**What goes wrong:** CI build fails because `with-modules.mjs` script tries to create junction.
**Why it happens:** The NAS workaround script is designed for local dev on network drives.
**How to avoid:** CI already runs `npm install` directly in `./src-ui` without the junction script. The `beforeBuildCommand` in tauri.conf.json uses the junction script, but on CI the `working-directory: ./src-ui` + `npm install` happens first, and node_modules is already local. Verify the CI build works as-is.
**Warning signs:** CI build failure in the `npm run build` step.

## Code Examples

### Complete tauri.conf.json Changes
```json
{
  "version": "1.0.0",
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC_KEY_CONTENT>",
      "endpoints": [
        "https://github.com/baldunderwear/grove/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### Updated CI Workflow (key additions)
```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    tagName: v__VERSION__
    releaseName: 'Grove v__VERSION__'
    releaseBody: 'See assets to download and install.'
    releaseDraft: true
    prerelease: false
    projectPath: ./src-tauri
```

### Rust Plugin Registration
```rust
// In lib.rs setup closure, add:
app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
app.handle().plugin(tauri_plugin_process::init())?;
```

### Capabilities Addition
```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "opener:default",
    "notification:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled",
    "updater:default",
    "process:allow-restart"
  ]
}
```

### MIT LICENSE File
```
MIT License

Copyright (c) 2026 baldunderwear

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 updater (built-in) | tauri-plugin-updater (separate plugin) | Tauri 2.0 stable (2024) | Must add as explicit dependency |
| `createUpdaterArtifacts: "v1Compatible"` | `createUpdaterArtifacts: true` | Tauri 2.0 | New apps use `true`; only migrations use v1Compatible |
| latest.json with `{os}-{arch}` keys | latest.json with `{os}-{arch}-{installer}` keys | tauri-plugin-updater 2.10.0 | Supports multiple installer formats per platform |

## Open Questions

1. **Signing key password policy**
   - What we know: A password is required during key generation
   - What's unclear: Whether to use an empty password for simplicity
   - Recommendation: Use an empty password (`""`) for CI simplicity. The key itself is secret-managed.

2. **releaseDraft vs published for CI**
   - What we know: Draft releases are invisible to the updater endpoint
   - What's unclear: Whether the user wants manual review before publishing
   - Recommendation: Keep `releaseDraft: true` in CI. User manually publishes after review. First v1.0 release will be manually published anyway.

3. **README screenshots**
   - What we know: CONTEXT.md mentions "README with screenshots"
   - What's unclear: Whether actual screenshots exist or need to be captured
   - Recommendation: Write README with placeholder image paths. Screenshots can be captured after the app is running in its final form. Use `docs/screenshots/` directory.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build | Yes | v24.14.0 | -- |
| npm | Package install | Yes | 11.9.0 | -- |
| git | Version control | Yes | 2.53.0 | -- |
| Rust/cargo | Backend build | Yes (not in bash PATH) | Present in system | Use full path or cargo tauri commands |
| GitHub Actions | CI/CD | Yes | N/A | -- |
| tauri signer CLI | Key generation | Via @tauri-apps/cli | Included in devDeps | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

- Tauri 2 + React 19 + TypeScript + Tailwind CSS stack
- Zustand for client state
- shadcn/ui component library (manual creation due to NAS npx incompatibility)
- NAS workaround: `scripts/with-modules.mjs` creates local junction for node_modules
- All work through GSD workflow entry points
- Windows-only target (Windows 11)

## Sources

### Primary (HIGH confidence)
- [Tauri 2 Updater Plugin docs](https://v2.tauri.app/plugin/updater/) -- full setup guide, configuration, JS API
- [Tauri 2 GitHub CI docs](https://v2.tauri.app/distribute/pipelines/github/) -- workflow YAML, tauri-action config
- [Tauri 2 Windows Installer docs](https://v2.tauri.app/distribute/windows-installer/) -- NSIS/MSI bundle config
- npm registry -- verified @tauri-apps/plugin-updater@2.10.0, @tauri-apps/plugin-process@2.3.1

### Secondary (MEDIUM confidence)
- [thatgurjot.com Tauri auto-updater guide](https://thatgurjot.com/til/tauri-auto-updater/) -- practical walkthrough verified against official docs
- [tauri-apps/tauri-action GitHub](https://github.com/tauri-apps/tauri-action) -- action input/output reference

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- official Tauri plugins with verified npm versions
- Architecture: HIGH -- follows exact same plugin pattern as 4 existing plugins in the project
- Pitfalls: HIGH -- well-documented issues in official docs and community guides
- Keyboard shortcuts: HIGH -- standard DOM event pattern, no external dependencies

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable Tauri 2 ecosystem, slow-moving)
