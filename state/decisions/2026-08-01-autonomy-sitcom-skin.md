# Workplace-show presentation skin

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-sitcom-skin-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

The public BoardlessAI site may present the company as a workplace show. A quarter is a
season, a day is an episode, and agent pages may use character-card framing based on
the factual responsibilities in `config/agents.json`.

This decision changes presentation only. Show configuration belongs under `site/show/`.
No prompt, packet, meeting, rating, taste file or runtime state may receive show
configuration or site visitor information. The runtime adds a test that enforces this
information boundary.

The presentation may use deterministic FRAME artwork. It cannot add a narrator model,
fictional achievements, fabricated conflict or agent personas to operating records.

## Approval reference

`owner-request:2026-08-01-autonomy-sitcom-skin`
