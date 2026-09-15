# Focus on six ventures, pause the rest

Date: 2026-09-15

Decider: Lukas Kouril, owner

Status: countersigned

Signature / explicit approval reference: Owner instruction, 2026-09-15 session (Claude Code):
make DNESKAi, GoVIRAL, the Design Lab, marketingShark, WebDev Signal and Personal Growth work as
soon as possible, pause every other venture in the admin, and start Personal Growth for the book
and audiobook promotion on Instagram.

Decision id: `operations-2026-09a`

Supersedes: the launch-only scope in `2026-09-07-production-review-findings.md` on which ventures
operate; nothing else in that record.

## Decision

The venture registry (`config/ventures.json`) records this scope. Nothing is deleted: every paused
venture keeps its history, its admin workspace and its archive, and one switch resumes it.

| Venture | Status | Why |
| --- | --- | --- |
| Caught Up (DNESKAi) | operating | the AI magazine |
| GoVIRAL | operating | supplies the weekly trend brief and the marketing plays |
| Design Lab | operating | renders every venture's decks |
| marketingShark | operating | markets devShark |
| WebDev Signal | founded, held | Instagram and Threads only; see `2026-08-28-webdev-signal-founding.md` |
| Personal Growth | operating (resumed) | the owner's own Instagram and Threads planning desk |
| MMA Files | paused | outside the focus |
| FightAIQ | paused | its only consumer, MMA Files, is paused; nothing runs for it |
| Titty Tuesdays, BOOKSOFHISTORY, Door Money, Tehdejší svět, Kvórum | paused | outside the focus, unchanged |
| Contest Radar | exploration | not founded, unchanged |

## What the pause does and does not do

- A paused venture's live phase ends at the engine's chokepoint before any agenda, agent, provider
  or lock, at $0. Its slots stay on the clock and are recorded as `PAUSED`; the operations packet
  lists them as unaccounted, which is the pause working and not a defect.
- FightAIQ cannot be paused from Settings, because the admin refuses the switch for MMA Files' data
  supplier. It is paused here by hand for the same reason the rule exists: with MMA Files paused
  there is nothing to supply. Resuming MMA Files means resuming FightAIQ in the same edit.
- Personal Growth resumes the deterministic desk only. Its paid synthesis, insight providers,
  Buffer queue and publishing stay held by `2026-08-26-personal-growth-founding.md` and
  `config/personal-growth.json`; the owner writes and posts every word.
- No account, credential, budget, spend, source, publishing or indexing authority changes with this
  record. The founding, approval and budget gates of every venture named above remain in force.

## Resume condition

The owner flips the switch in `/admin/settings` (or edits the registry) and says so. MMA Files and
FightAIQ resume together.
