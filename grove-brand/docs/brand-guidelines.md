# Grove Brand Guidelines
**Version 1.0 · March 2026**

---

## Overview

Grove is a lightweight Windows desktop app for managing git worktrees and Claude Code sessions. The brand is developer-first, minimal, and rooted in the metaphor of a managed grove of trees — structured, intentional, alive.

**Tagline:** *"Manage your trees."* (always lowercase, always with the period)

---

## Logo

### Primary Mark

The Grove mark is a stylized conifer built from three layered equilateral-ish triangles (canopy layers) and a trunk rectangle. The three-layer structure communicates depth, hierarchy, and branching — directly mirroring the worktree concept.

**Files:**
| File | Use |
|------|-----|
| `grove-logo-primary.svg` | Dark backgrounds (default) |
| `grove-logo-reversed.svg` | Light backgrounds |
| `grove-logo-mono-white.svg` | Single-color white (print, emboss) |
| `grove-logo-mono-black.svg` | Single-color black (print, emboss) |
| `grove-logo-amber.svg` | Alternate accent variant |
| `grove-icon.svg` | Icon only, no wordmark |
| `grove-app-icon-512.svg` | Full-bleed app icon with rounded rect bg |

### Clearspace

Maintain a minimum clearspace of **1× the icon height** on all four sides of the mark. Never crowd the logo against other elements.

### Misuse — Never Do This

- ❌ Rotate or skew the mark
- ❌ Stretch or distort proportions
- ❌ Place on low-contrast or busy backgrounds without a container
- ❌ Use grey-on-grey combinations
- ❌ Substitute the "G" letterform for the icon
- ❌ Recolor to non-brand colors
- ❌ Add drop shadows or outer glows

---

## System Tray Icon

The tray icon is a simplified 2-layer tree (no third canopy layer) optimized for 16×16 pixel rendering.

**Four required states:**

| State | Color | Badge | File |
|-------|-------|-------|------|
| Idle | Green (#4fa362 / #6dc280) | None | `grove-tray-idle.svg` |
| Active | Amber (#c47a3a / #e89840) | Green dot | `grove-tray-active.svg` |
| Paused | Gray (#6b7280 / #9ca3af) | None | `grove-tray-paused.svg` |
| Error | Red (#dc2626 / #f87171) | Red dot | `grove-tray-error.svg` |

**ICO requirements:** Include all sizes: 16×16, 24×24, 32×32, 48×48, 256×256. Export as multi-size `.ico`. At 16px, suppress the third canopy layer for pixel clarity.

---

## Color System

### Forest Green Ramp (Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--grove-void` | `#080f0a` | App background, deepest surface |
| `--grove-deep` | `#0c1810` | Panel backgrounds |
| `--grove-forest` | `#112416` | Card backgrounds |
| `--grove-canopy` | `#1a3520` | Elevated cards, hover surfaces |
| `--grove-moss` | `#2d5a38` | Active borders, button fills |
| `--grove-fern` | `#3d7a4e` | Secondary borders, muted fills |
| `--grove-leaf` | `#4fa362` | **PRIMARY interactive / CTA color** |
| `--grove-sprout` | `#6dc280` | Hover / active state of leaf |
| `--grove-bright` | `#8edc9f` | Highlight text, active labels |
| `--grove-mist` | `#b8f0c5` | Success bg text, lightest tint |

### Bark Amber Ramp (Accent / Alert)

| Token | Hex | Usage |
|-------|-----|-------|
| `--grove-bark` | `#c47a3a` | Amber base |
| `--grove-amber` | `#e89840` | **Warning fills, stale badges** |
| `--grove-dusk` | `#f2b460` | Warning text, ahead-badge labels |

> **Rule:** Amber always means "action required." Do not use it decoratively.

### Stone Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `--grove-stone` | `#a0a89e` | Secondary / muted text |
| `--grove-pebble` | `#d0d8ce` | Tertiary text |
| `--grove-fog` | `#eaede8` | Primary body text on dark bg |
| `--grove-white` | `#f5f7f4` | Off-white, max-contrast text |

### Semantic Colors

| State | Background | Text |
|-------|-----------|------|
| Success | `rgba(22, 101, 52, 0.3)` | `#86efac` |
| Warning | `rgba(146, 64, 14, 0.3)` | `#fde68a` |
| Error | `rgba(153, 27, 27, 0.3)` | `#fca5a5` |
| Info | `rgba(30, 58, 95, 0.3)` | `#93c5fd` |

---

## Typography

### Type Stack

| Role | Family | Weights | Usage |
|------|--------|---------|-------|
| Display / UI | **Syne** | 400, 500, 600, 700, 800 | All UI text, headings, buttons, wordmark |
| Code / Meta | **IBM Plex Mono** | 300, 400, 500, 600 | Branch names, versions, keyboard shortcuts, numerical metadata, labels |
| Editorial | **Instrument Serif** | 400, 400 italic | Taglines, accent phrases, hero copy |

**Google Fonts import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap');
```

### Type Scale

| Token | Size | Typical Use |
|-------|------|-------------|
| `--grove-text-xs` | 11px | Labels, tags, eyebrows |
| `--grove-text-sm` | 13px | Body small, button sm |
| `--grove-text-base` | 15px | Body copy |
| `--grove-text-lg` | 18px | Sub-headings |
| `--grove-text-xl` | 22px | Section titles |
| `--grove-text-2xl` | 28px | Card headings |
| `--grove-text-3xl` | 36px | Page headings |
| `--grove-text-4xl` | 48px | Hero sub |
| `--grove-text-hero` | clamp(48px, 6vw, 88px) | Hero H1 |

### Rules

- Display type (Syne) always uses `letter-spacing: -0.02em` to `-0.04em` at heading sizes
- Mono text uses `letter-spacing: 0.05em` to `0.2em` for uppercase labels
- Never use Arial, Inter, Roboto, or system-ui as fallbacks in branded contexts
- Instrument Serif italic is for emphasis only — never use it for body copy

---

## Iconography

All feature icons are **24×24px, stroke-only, 1.5px weight, round caps and joins**.

**Rules:**
- Never fill icons (stroke only)
- Never mix filled and stroke icons on the same surface
- Use `currentColor` for theme adaptability
- Green (#6dc280) for standard icons
- Amber (#e89840) for warning/stale icons
- Red (#f87171) for error icons
- Green (#6dc280) for success icons

**Icon inventory:**

| Icon | File | Usage |
|------|------|-------|
| Worktree | `grove-icon-worktree.svg` | Worktree list, dashboard |
| Branch | `grove-icon-branch.svg` | Branch indicators |
| Merge | `grove-icon-merge.svg` | Merge dialog, merge action |
| Launch | `grove-icon-launch.svg` | Launch session button |
| Tray | `grove-icon-tray.svg` | Tray settings, tray docs |
| Notify | `grove-icon-notify.svg` | Notification settings |
| Auto-Fetch | `grove-icon-auto-fetch.svg` | Fetch settings, fetch status |
| Settings | `grove-icon-settings.svg` | Settings page |
| Build | `grove-icon-build.svg` | Build number display |
| Changelog | `grove-icon-changelog.svg` | Changelog fragment list |
| Shortcuts | `grove-icon-shortcuts.svg` | Keyboard shortcut reference |
| Add Tree | `grove-icon-add-tree.svg` | New worktree CTA |
| Stale | `amber/grove-icon-stale.svg` | Stale branch warning |
| Timer | `amber/grove-icon-timer.svg` | Scheduled tasks, intervals |
| Error | `amber/grove-icon-error.svg` | Error states |
| Success | `amber/grove-icon-success.svg` | Success confirmation |

---

## Marketing Assets

| File | Dimensions | Format | Use |
|------|-----------|--------|-----|
| `grove-og-card-1200x630.svg` | 1200×630 | SVG | GitHub, Twitter/X, Discord OG |
| `grove-readme-banner.svg` | 900×120 | SVG | GitHub README header |
| `grove-feature-cards.svg` | 800×900 | SVG | README features section |
| `grove-producthunt-graphic.svg` | 1200×630 | SVG | Product Hunt launch gallery |
| `grove-twitter-card.svg` | 1200×675 | SVG | Twitter/X announcement |

**For PNG export:** Open in browser, screenshot at 2× or use Inkscape/rsvg-convert:
```bash
rsvg-convert -w 1200 grove-og-card-1200x630.svg -o grove-og-card.png
```

---

## UI Components

### Buttons

| Variant | Background | Text | Border | Use |
|---------|-----------|------|--------|-----|
| Primary | `#4fa362` | `#080f0a` | None | Main CTA: Launch, Merge |
| Secondary | `rgba(77,163,98,0.1)` | `#6dc280` | `rgba(77,163,98,0.3)` | Secondary actions |
| Ghost | Transparent | `#a0a89e` | `rgba(255,255,255,0.08)` | Cancel, tertiary |
| Danger | `rgba(239,68,68,0.1)` | `#f87171` | `rgba(239,68,68,0.2)` | Destructive actions |

### Status Indicators (Dot)

| State | Color | Behavior |
|-------|-------|----------|
| Running | `#6dc280` | Pulse animation |
| Pending | `#e89840` | Static |
| Idle | `rgba(160,168,158,0.4)` | Static |
| Error | `#f87171` | Static |

---

## Animation & Motion

| Context | Duration | Easing | Usage |
|---------|----------|--------|-------|
| UI micro-interactions | 150ms | `ease` | Hover, focus, toggle |
| State transitions | 200ms | `ease` | Color, opacity changes |
| Modal / dialog entrance | 200ms | `ease` | Slide up from bottom |
| Page load stagger | 600ms | `ease` | Fade-up with `animation-delay` |
| Pulse (active indicator) | 1500ms | `ease` | Repeating opacity pulse |

**Rules:**
- No bounce or elastic easings in system UI
- No transitions longer than 600ms in interactive UI
- Page/section entrance animations are one-shot (not looping)
- Prefer CSS `transition` for simple state changes; reserve `@keyframes` for entrance and attention animations

---

## Background Rules

The darkest permissible background is **Void (#080f0a)**. Never use pure `#000000`.

| Surface Level | Color | Token |
|--------------|-------|-------|
| App root | `#080f0a` | `--grove-void` |
| Panels / drawers | `#0c1810` | `--grove-deep` |
| Cards | `#112416` | `--grove-forest` |
| Elevated cards / hover | `#1a3520` | `--grove-canopy` |

---

## Naming & Voice

**Name:** Always `Grove` — capital G, no other casing.

**Tagline:** `"Manage your trees."` — always lowercase, always with the period.

**Voice:**
- Direct and confident, never boastful
- Developer-native vocabulary (worktree, branch, session, merge, tray)
- Short sentences. No filler words.
- Dry wit is fine; enthusiasm is not

**Example copy:**
> ✅ "Launch a session. Merge when ready."
> ❌ "Grove makes it super easy to launch amazing Claude Code sessions!"

---

## File Index

```
grove-brand/
├── logo/
│   ├── grove-logo-primary.svg        Primary wordmark, dark bg
│   ├── grove-logo-reversed.svg       Wordmark, light bg
│   ├── grove-logo-mono-white.svg     Mono white
│   ├── grove-logo-mono-black.svg     Mono black
│   ├── grove-logo-amber.svg          Amber variant
│   ├── grove-icon.svg                Icon only (no wordmark)
│   └── grove-app-icon-512.svg        App icon, rounded rect bg
│
├── tray-icons/
│   ├── grove-tray-idle.svg           16px tray — idle
│   ├── grove-tray-active.svg         16px tray — active session
│   ├── grove-tray-paused.svg         16px tray — paused
│   └── grove-tray-error.svg          16px tray — error
│
├── icons/
│   ├── grove-icon-worktree.svg
│   ├── grove-icon-branch.svg
│   ├── grove-icon-merge.svg
│   ├── grove-icon-launch.svg
│   ├── grove-icon-tray.svg
│   ├── grove-icon-notify.svg
│   ├── grove-icon-auto-fetch.svg
│   ├── grove-icon-settings.svg
│   ├── grove-icon-build.svg
│   ├── grove-icon-changelog.svg
│   ├── grove-icon-shortcuts.svg
│   ├── grove-icon-add-tree.svg
│   └── amber/
│       ├── grove-icon-stale.svg
│       ├── grove-icon-timer.svg
│       ├── grove-icon-error.svg
│       └── grove-icon-success.svg
│
├── assets/
│   ├── grove-og-card-1200x630.svg    OG / Twitter card
│   ├── grove-readme-banner.svg       GitHub README banner
│   ├── grove-feature-cards.svg       Feature grid graphic
│   ├── grove-producthunt-graphic.svg Product Hunt launch card
│   └── grove-twitter-card.svg        Twitter/X announcement
│
├── colors/
│   ├── grove-tokens.css              CSS custom properties
│   ├── grove-tokens.json             Style Dictionary / Figma tokens
│   └── tailwind.grove.js             Tailwind theme extension
│
└── docs/
    └── brand-guidelines.md           This document
```

---

*Grove Brand Kit v1.0 · March 2026 · MIT License*
