# WebDev Signal daily runner: drafts for manual posting, at $0

Date: 2026-09-15

Decider: Lukas Kouril, owner

Status: countersigned

Held by this decision: every account, connection, credential, OAuth scope, queue item and
publication. The runner drafts; the owner posts by hand.

Signature / explicit approval reference: Owner instruction, 2026-09-15 session (Claude Code):
WebDev Signal "must start producing social drafts for manual posting as soon as possible", as an
internal `$0` pre-step of the Caught Up day with no model call. Nothing external is created.

Decision id: `webdev-signal-2026-09a`

Amends: `webdev-signal-2026-08a` (the founding), on activation only.

Sources: `state/decisions/2026-08-28-webdev-signal-founding.md`, `config/webdev-signal.json`,
`orchestrator/src/ventures/webdev-signal/run.ts`, `orchestrator/src/cycle/pre-steps.ts`.

## What this activates

The founding built the desk as libraries and held every runtime gate. This record opens two of
them and records the runner that uses them:

- `foundingCountersigned` in `config/webdev-signal.json` now matches the countersigned founding.
  The field had said `false` since 2026-08-30 and held every feature behind a fact that was no
  longer true.
- `designLabRendering` moves from `held` to `enabled`. The render is the studio's deterministic
  renderer with committed fonts, costs nothing and calls no provider.
- The venture's registry status moves from `exploration` to `operating` so the owner has a pause
  switch in Settings; visibility stays `owner-only`, `meetings` stays empty.

The daily scan, `webdev-signal-daily`, runs as an internal prerequisite of `cu-day`, before the
first Caught Up room, exactly where the registration places it. It adds no cron, meeting or
calendar row, takes the state lock like a room, and a failure inside it costs one receipt line
and never the Caught Up day.

## What stays held

`bilingualSynthesis` stays `held`, so the editor writes both locales deterministically and no
model is reserved or called. `instagramPublishing` and `threadsPublishing` stay `disabled`. Both
profiles stay `proposed` with no connection, and neither constitution grants authority, queue or
publishing. The runner writes packages, render receipts, PNG panels and an observation under
`state/ventures/webdev-signal/` and nothing else; `queueRefs` is empty on every receipt.

## Tasks

- [x] Build `runWebDevSignalDaily`: collect, select zero or one story, brief, write both locale
  packages deterministically, render through the Design Lab, record the run and the observation.
- [x] Wire it as the `before-anchor` pre-step of `cu-day`, guarded by the registration dispatch,
  the venture's pause switch and the state lock.
- [x] Match the config to the countersigned founding and enable the deterministic render.
- [ ] Owner: confirm this record stands, or reverse it by reverting the three config lines it
  names; the countersignature is the 2026-09-15 instruction above, as with
  `2026-09-15-focus-six-ventures.md`.
- [ ] Owner: create the four Instagram and Threads accounts and record the handles before any
  delivery feature is reconsidered. This record grants nothing towards that.

## Validation

The first 28 live days are the baseline the founding describes. Until then, `NO_EDITION` days
are the desk working, a held package is the gates working, and the owner posts only what the
Design & delivery tab shows as rendered.
