# DNESKAi article production paused

Date: 2026-10-20
Authority: the owner's decision of 2026-10-20 in [quorum #602](https://github.com/lukaskourilcz/quorum/issues/602),
part of [own-dashboard #110](https://github.com/lukaskourilcz/own-dashboard/issues/110).

The owner paused the DNESKAi website articles. DNESKAi continues on social only, and OwnDashboard
prepares those posts (own-dashboard #110). The last article reached the magazine on 2026-09-25.
`state/money/cost-report.json` for October shows $6.02 spent across 27 cu-edition rooms and no
article delivered.

This supersedes the "DNESKAi article production only" scope of 2026-09-28 and keeps the 2026-10-13
source export. Caught Up becomes `paused` in `config/ventures.json`, dated 2026-10-20. The pause
chokepoint in `runCycle` ends live `cu-day`, `cu-edition` and `cu-product` before any agenda,
agent, provider or lock, so those rooms make no model call and reserve nothing. The day leaves the
clock with the pause: no Vercel dispatch, no backstop rescue and no 09:00 retry. `pnpm delivery --
reviewed` and `pnpm delivery -- next` release and select nothing while the pause holds. The recipe
drafts of quorum #592 ride the `reviewed` step and stop with it.

## What keeps running

- The stream sync (`data/talked-about.json`, `data/podcasts.json`) and the event sync
  (`data/events.json`) into aifirst, behind `CAUGHT_UP_STREAMS_ENABLED`. They call no model. While
  Caught Up is paused they ride the 06:00 morning run, because `cu-day` no longer fires.
- `/admin/api/marketing-collection` (`DNESKAI_COLLECTION_ENABLED`) keeps answering signed queries
  until OwnDashboard switches to its native feeds. It switched on 2026-10-21; see `docs/NEEDED.md`.
- `/admin/api/marketing-source` stays up. It reports the articles it already exported, and no new
  packet appears because no new article reaches approval.
- Every record stays where it is: `state/editorial/reviews/`, `state/edition/`, image selections
  and delivery receipts. Nothing is deleted.

Budget caps do not change. The pause adds no paid service, credential or schedule.

## How to resume

Set Caught Up back to `operating` and remove `pausedOn` (the Settings switch does both). Put
`cu-day`, `cu-edition` and `cu-product` back in the `workflow_dispatch` options of
`.github/workflows/cycle.yml`, and restore the `cu-day` and `cu-edition` entries in
`site/vercel.json`; `ci-policy.test.ts` and `vercel-cron.test.ts` list what they expect. The stream
and event sync return to the `cu-day` run on their own. Vercel reads its crons only at deploy time,
so the 05:00 slot fires again after `pnpm deploy:production`.

## Implementation

- [x] Pause Caught Up in the registry and take its slots off the clock, the dispatch options and the Vercel crons.
- [x] Keep the stream and event sync on the morning run while Caught Up is paused, and hold both delivery commands.
- [x] Prove the pause with dry and paused live runs, and update `CLAUDE.md` and `docs/NEEDED.md`.
