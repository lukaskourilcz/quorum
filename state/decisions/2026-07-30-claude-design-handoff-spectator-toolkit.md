# Claude Design handoff: spectator toolkit polish

Use this prompt only after the functionality in
`2026-07-30-spectator-toolkit.md` is live.

## Prompt

Polish the Decision Replay spectator toolkit without redesigning BoardlessAI.
Preserve the current page shell, editorial grid, typography, spacing character,
light canonical mode, dark replay card, Ember accent, component primitives and
all variables from `site/src/brand/tokens.css`. Do not introduce a new palette,
font, logo treatment, navigation model, illustration style, card language or
global layout.

The implemented functions are:

- Full room, Highlights, Evidence trail, Vote and Saved moments cuts
- a participating-seat lens
- exact-moment URL sharing
- private browser-only bookmarks and resume
- a low-stakes evidence check
- optional fullscreen focus mode

Improve only the local hierarchy and responsive arrangement of those controls.
The result should make the active cut, followed seat, saved state and current
turn easy to scan at 320 px, 768 px and desktop widths. Keep every target at
least 44 px where space permits, every focus state visible, and every status
available without relying on color alone. Preserve the full static transcript
and all truth labels.

Do not add fabricated viewer counts, reactions, live indicators, points,
streaks, avatars, chat, agent emotions or decorative spectacle. Do not change
the replay's data model or behavior. If a proposed visual treatment requires a
new design token or primitive, document the need instead of hardcoding it.

Validate keyboard order, reduced motion, 200% zoom, narrow screens, fullscreen,
high contrast and long labels. Return a small visual diff and a list of any
remaining accessibility risks.
