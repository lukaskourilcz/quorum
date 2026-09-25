# Focus on DNESKAi and devShark; paused ventures leave the clock, the nav and the studio

Date: 2026-09-25

Decider: Lukas Kouril, owner

Status: countersigned

Signature / explicit approval reference: Owner instruction, 2026-09-25 session (Claude Code):
BoardlessAI must fully work for DNESKAi only, so articles, photos and social content are produced
correctly; marketingShark produces content for devShark only and the Design Lab and GoVIRAL serve
devShark while StudyShark is retired; MMA FILES, BOOKSOFHISTORY, Personal Growth and Tehdejší svět
stop; a stopped venture is offered neither in the Design Lab nor in the navigation and is listed
only in Settings under "Paused ventures"; the stopped ventures' GitHub Actions must not run.

Decision id: `operations-2026-09b`

Supersedes: `operations-2026-09a` (`2026-09-15-focus-six-ventures.md`) on the operating scope and
on its rule that paused slots stay on the clock. Nothing else in that record changes.

Sources: `config/ventures.json`, `state/decisions/2026-09-15-focus-six-ventures.md`,
`state/decisions/2026-08-26-personal-growth-founding.md`, `KICKOFF-25-9-2026.md`,
issues #555–#567.

## Decision

| Venture | Status | Why |
| --- | --- | --- |
| Caught Up (DNESKAi) | operating | the magazine: article, image and social pack every day |
| marketingShark | operating | devShark carousels only; its geoShark brand stays disabled |
| GoVIRAL | operating | shared machinery; scouts and briefs for DNESKAi and devShark only |
| Design Lab | operating | shared machinery; renders DNESKAi's and devShark's decks |
| WebDev Signal | operating, editions held | a $0 pre-step of the DNESKAi day; no cron of its own |
| Personal Growth | paused | stopped by this record |
| MMA Files, FightAIQ | paused | stopped since 09a; resume together |
| BOOKSOFHISTORY, Tehdejší svět | paused | stopped since 09a; named again by the owner |
| Titty Tuesdays, Door Money, Kvórum | paused | unchanged |
| Contest Radar | exploration | not founded, unchanged |

## What a pause means from this record on

- **The engine.** Unchanged: a paused venture's live phase ends at the chokepoint in
  `orchestrator/src/cycle.ts` before any agenda, agent, provider or lock, at $0.
- **The clock.** A paused venture's day, rooms and production jobs leave the schedule. The Vercel
  cron table in `site/vercel.json` and the backstop sweep derive from the registry and skip it, and
  `cycle.yml` no longer offers its phases for dispatch. It no longer costs a runner to be paused.
- **The workflows.** Steps that exist only for a paused venture, such as the MMA Files delivery
  block, leave `cycle.yml`. Resuming such a venture restores them from history in the same change
  that flips the registry.
- **The admin.** A paused venture leaves the workspace navigation, the command palette and the
  Design Lab section list. `/admin/settings` lists it in a "Paused ventures" table with a Resume
  switch. Its state, archive and `/admin?venture=<id>` page stay readable by URL.
- **Nothing is deleted.** Every paused venture keeps its code, state, decisions and archive.

## What this record does not do

It changes no account, credential, budget, spend, source, channel, publishing or indexing
authority. The founding, approval and budget gates of every venture remain in force. Personal
Growth's paid synthesis, providers and Buffer queue stay held by `personal-growth-2026-08a`, now
behind the pause as well.

## Resume condition

The owner flips the switch in `/admin/settings` (or edits the registry) and says so. A resumed
venture's cron entries come back when `site/vercel.json` is regenerated from the registry and the
site is deployed; the cron test fails until that is done. MMA Files and FightAIQ resume together.

## Implementation

- [x] Registry: Personal Growth paused (#557)
- [x] Clock: crons, dispatch options and sweep follow the status (#558)
- [x] Workflows: MMA Files delivery block and paused switches removed (#559)
- [x] Admin: workspace nav and Settings "Paused ventures" table (#560)
- [x] Design Lab: operating ventures only (#561)
- [x] GoVIRAL: DNESKAi and devShark only (#562)
