---
name: agent-identity
description: Use when creating or changing agent profiles, the AI team UI, deterministic character portraits, or visual identity QA.
---

# Agent identity

1. Read BRAND, `config/agents.json`, `site/src/data/agents.ts`,
   `site/src/components/agent-portrait.tsx` and D12
   (`state/decisions/2026-08-02-workplace-show-design-rollback.md`). Agent identity is a
   stable public presentation system, not daily content.
2. Preserve the exact role, responsibility and disclosure. These are AI software
   roles, never fictional humans. Do not add biography, age, location, education,
   emotion, quotes or personality lore.
3. Portraits are the approved photographs in `site/public/agents/<slug>.webp`; a role
   without one renders the neutral name placeholder. Never generate a portrait with an
   image model or invent a person.
4. Keep presentation data in `site/src/data/agents.ts` and the components that render
   it. Never import it into the orchestrator or include it in an agent packet,
   prompt, meeting, rating or taste file.
5. Validate dimensions, contrast, visual consistency, role marker, alt text, keyboard
   flow and small-screen rendering. Every role needs a safe deterministic portrait;
   missing capability is not a spending request.
6. The AI team pages derive from the registry, separate decision-makers and
   specialists, and show mission, responsibility, boundary, model route, estimated
   call cost, current focus and public track record.
7. Run typecheck, component tests, production build and visual inspection before
   publishing a changed portrait system. `orchestrator/tests/architecture.test.ts` runs
   `validateAgentAvatars`.
