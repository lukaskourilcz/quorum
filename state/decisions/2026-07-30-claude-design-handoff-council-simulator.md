# Claude Design handoff: Council Simulator polish

Use this prompt only after the functionality in
`2026-07-30-sims-inspired-council-simulator.md` is live.

## Prompt

Polish the Council Simulator on the existing Boardroom page without
redesigning BoardlessAI. Preserve the current page shell, editorial grid,
typography, spacing character, light canonical mode, Ember accent, component
primitives and every variable in `site/src/brand/tokens.css`. Do not introduce
a new palette, font, logo, navigation model, illustration style, card language
or global layout.

The implemented functions are:

- a read-only room-template catalog that deterministically previews the routed
  roster
- real operating needs from the founding fixture
- routed seat profiles using existing mandates and capability data
- working relationships derived only from direct recorded exchanges
- exact setup URLs and a copy-link control

Improve only the local hierarchy and responsive arrangement of those controls.
Make the active room template, routed seats, selected seat, routing reasons and
blocked operating gates easy to scan at 320 px, 768 px and desktop widths.
Keep every interactive target at least 44 px, every focus state visible and
every selected or blocked state understandable without relying on color.

Use life-simulation interface principles only as an interaction reference.
Do not use The Sims branding, name, assets, plumbob geometry, Simoleon
language, game fonts, copied iconography or imitation screens. Do not add
fabricated moods, friendship levels, popularity, points, streaks, unlocks,
viewer counts, reactions or chat. Preserve the labels that say the simulator is
a protocol preview and cannot open a room or influence agents.

If a proposed treatment requires a new design token or primitive, document the
need instead of hardcoding it. Validate keyboard order, visible focus, reduced
motion, 200% zoom, narrow screens, long labels, query-parameter deep links and
clipboard failure. Return a small visual diff and a list of any remaining
accessibility risks.
