---
name: brand-identity
description: Create or apply the BoardlessAI Refero/Awesomic zinc-and-Ember editorial system, tokens.css, typography, SVG logo and BRAND.md voice. Use when founding the brand, building UI, or fixing visual drift.
---

# Brand identity

Source of truth: `state/BRAND.md` (voice, adjectives, rules) +
`site/src/brand/tokens.css`. Goal: faithfully implement the corporate system in
master-prompt section 0.7. Do not invent a different mood, palette or generic
AI aesthetic.

## Creating (founding)

1. Start from the exact zinc sRGB reference tokens in section 0.7, optionally
   convert them to documented OKLCH, contrast-test and make only the smallest
   accessibility adjustment. Map them onto shadcn theme variables
   (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`,
   `--accent`, `--destructive`, `--border`, `--ring`, radii) in `tokens.css`.
   Canonical light: zinc/white/Ember, 1200px editorial grid, 36px no-shadow
   cards, 14px buttons, pills, sticky white nav and occasional Graphite feature
   block. Optional dark is a faithful zinc inverse, not a second palette.
   Magenta is allowed only in one small `ConfettiMark`; no blue/purple brand
   color.
2. Type: DM Sans via `next/font` (latin-ext) for all UI/body; mono only for IDs,
   timestamps, costs and metrics. Use Cosmica only if licensed font files are
   already authorized and provenance is recorded.
3. Logo: four council segments around one decision space with one intentionally
   open segment, pure SVG in `site/src/brand/logo.svg`, `currentColor`, legible
   at 16–24 px. Add a wordmark variant for `BoardlessAI`; distinguish `AI` by
   weight only if needed. No robot, brain, sparkle, gradient or external refs.
4. Fill BRAND.md with the exact positioning/voice/personality and name-clearance
   status from 0.7. Set `status: active`, `locked: true` and
   `nameStatus: provisional_clearance`. Clearance changes only `nameStatus`.
   Stop there — no visual polishing or venture-driven corporate rebrand.

## Applying (always)

Compose UI only from the pre-installed shadcn/ui components + theme variables —
never raw hex/rgb/font names, never ad-hoc UI primitives. No card shadows,
uncontrolled accent use or unlicensed reference assets. Optional dark mode uses
`tokens.css`, not per-component overrides. Check contrast when placing text on
primary/accent surfaces.
