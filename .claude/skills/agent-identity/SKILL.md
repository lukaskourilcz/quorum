---
name: agent-identity
description: Use when creating or changing agent profiles, the AI team UI, deterministic character portraits, or visual identity QA.
---

# Agent identity

1. Read BRAND, `config/agents.json`, `site/src/show/config.ts` and the existing
   `AgentPortrait` component. Agent identity is a stable public presentation system,
   not daily content.
2. Preserve the exact role, responsibility and disclosure. These are AI software
   roles, never fictional humans. Do not add biography, age, location, education,
   emotion, quotes or personality lore.
3. Build portraits deterministically in SVG/code from shared show tokens. Give council
   and project leads a consistent lead marker; use bounded variations for the rest.
   Do not call an image model or create photoreal people, celebrities, robots or lore.
4. Keep every show/presentation setting below `site/src/show/` or presentation
   components. Never import it into the orchestrator or include it in an agent packet,
   prompt, meeting, rating or taste file.
5. Validate dimensions, contrast, visual consistency, role marker, alt text, keyboard
   flow and small-screen rendering. Every role needs a safe deterministic portrait;
   missing capability is not a spending request.
6. The AI team pages derive from the registry, separate decision-makers and
   specialists, and show mission, responsibility, boundary, model route, estimated
   call cost, current focus and public track record.
7. Run typecheck, component tests, production build and visual inspection before
   publishing a changed portrait system.
