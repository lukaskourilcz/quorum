# MMA Files public delivery and FightAIQ ownership

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: approved

> Superseded in part on 2026-08-09: the publication is Czech-only. The bounded
> delivery, FightAIQ ownership, and safety decisions below remain in force.

Decision id: `mma-files-public-delivery`

## Decision

MMA Files at `https://mma-files.vercel.app` is the public bilingual publication for
MMA Files editorials and the sole public home for FightAIQ fighter records, event cards,
captured odds and reviewed model-versus-market files. BoardlessAI must remove its
duplicate public fighter and upcoming-event routes.

BoardlessAI may deliver only schema-valid, hash-checked content packages to the
`lukaskourilcz/mma-files` repository. The delivery app may write the bounded data files;
it may not change MMA Files application code. Every target commit must pass the target
repository tests, typecheck and production build before it is pushed.

Titty Tuesdays remains planning-only. Its agents may create detailed future-campaign
notes and short admin summaries, but may not generate social images, publish, contact
people, run paid media, change Shopify, sell, or spend.

## Safety boundary

This decision does not enable `FIGHTAIQ_ANALYSIS_ENABLED`. The separate mode-change
review remains required before live model generation. MMA Files must label captured
prices with their source and time, show uncertainty on model files, avoid certainty or
income claims, and provide no affiliate links, bookmaker automation, account actions,
personal staking instructions or bet placement.

## Approval reference

`owner-request:2026-08-01-mma-files-public-delivery`

The owner approved this wiring and the beneficial repository edits in the active Codex
task on 2026-08-01.
