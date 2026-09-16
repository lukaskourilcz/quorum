# Handoff — issues #534 to #554

Written at the end of the session of 2026-09-16. Branch: `claude/elegant-cori-h9cdgb`.
Ten of the twenty-one issues were implemented, #543 has its contract and nothing
that consumes it, and the rest were not started and are listed below with what is
already known about them.

## What landed

| Commit | Issues | Subject |
| --- | --- | --- |
| `768d90c` | #542 (+#543 contract) | 4:5 as the declared master canvas; slide two gets its own role |
| `87e773c` | #537 | Per-room and per-desk caps, an 80% INBOX notice, a read-only office |
| `ee801cb` | #548, #550, #551 | GoVIRAL signal scoring, weekly brief skeleton, RICE-rated play library |
| `ba79dd7` | #539, #552, #553, #554 | Portfolio RICE, DNESKAi practical items, promotion recipe, event candidates |
| `ef1936b`, `7a875a4` | #546 | Capacity charged per publishing language; alphabet coverage derived for all 13 families |

## Validation

On the committed tree: `pnpm -C studio build` 0, `pnpm typecheck` 0,
`pnpm lint` 0, `pnpm test` 0 — **3,926 tests** (studio 225, orchestrator 2,865,
site 836) — `pnpm agents:validate` 0, `pnpm docs:check` 0.

Re-run after #546: the same six gates at 0, plus `pnpm studio:golden:check` 0 —
**4,017 tests** (studio 316, orchestrator 2,865, site 836). The 30 families still
match the committed golden manifest, so nothing in the language work changed a
rendered byte.

`docs:check` was **failing before this session started** (`docs/ECOSYSTEM.md
operating truth is stale`). `pnpm docs:refresh` was run and the regenerated file
is in `ba79dd7`, so the gate is green again.

One defect was fixed that belonged to no issue: `EventCandidateDraft` is spelled
with `Pick` rather than `Omit`, because `openObject` is `z.looseObject` and the
inferred type therefore carries a string index signature — `keyof` over that is
`string | number`, so `Omit` subtracts nothing and collapses every named field to
`unknown`. Worth knowing before writing another `Omit` over any contract type in
this repository; they are all `openObject`.

## Nothing here spends money

No new host, no new paid dependency, no posting path. The `$50` all-in cap, the
`$25` model share and the `$1.00` daily pace are untouched, Apify stays `false`
in the registry, and every host the new event collector contacts is registered in
`config/network-allowlist.json`.

## Not started — 11 issues

#534, #535, #536, #538, #540, #541, #543, #544, #545, #547, #549.

Two of them have partial groundwork already committed, which is the cheapest
place for the next session to start:

- **#534** (cost per decision, reconciled with provider billing) — the
  `cost-report/1` contract, its fixtures, `orchestrator/src/finance/cost-report.ts`
  and `provider-billing.ts` are committed in `87e773c`, together with the
  `ANTHROPIC_ADMIN_API_KEY` / `PROVIDER_BILLING_ENABLED` pair in `.env.example`.
  Both are unset, so the billed column reads `unavailable` rather than `$0.00`,
  at zero cost and with no request sent.
- **#543** (gate each new layout with a spec, contrast and determinism checklist)
  — the `carousel-layout-review/1` contract and its fixtures are committed in
  `768d90c`. The checklist that consumes them is not written.

A read-only triage agent produced a file-level plan for #534-#549 earlier in the
session; those plans are not in the repository, so the next session should
re-read each issue rather than assume one exists.

## Owner decisions the committed work is waiting on

- **#539 RICE needs two numbers per venture.** `config/portfolio-rice.json` has
  one row per venture with `reach: null` and `impact: null`. Reach has no source
  in this repository and Impact is a judgement, so both are yours or the ranking
  stays empty. All fourteen rows currently read `unavailable`, which is the
  honest answer while `METRICS_INGESTION_ENABLED` is false.
- **#539 needs one signature.** `state/decisions/2026-09-16-portfolio-rice.md`
  (`portfolio-2026-09a`) is unsigned. Enforcement needs both that
  countersignature and `posture: "owner-enforced"` plus `rankingEnforced: true`;
  either alone holds. Even then nothing gates — no room, schedule or budget path
  reads `enforcement`.
- **#537's per-desk cap is armed and unused.** No venture declares
  `budget.monthlyDeskUsd`, so `DESK_MONTHLY_CAP` never fires.
- **#548 is waiting on #528** (the Apify plan confirmation and `APIFY_TOKEN`)
  before it scores real data, and on a decision about whether Seznam search
  statistics and TikTok are worth a credential and a budget line. Neither has a
  free keyless endpoint; TikTok has no source at all since
  `config/goviral-sources.json` closed every social actor beyond Instagram and
  Threads on cost grounds.

## Two findings worth acting on independently

1. **The enforced degradation order and the current operating scope are out of
   step.** Five of the seven rooms in `ROOM_DEGRADATION_ORDER` (`kv-desk`,
   `dm-desk`, `dm-growth`, `ts-desk`, `bh-desk`, `tt-marketing`) belong to
   ventures that `operations-2026-09a` paused on 2026-09-15. This is true whether
   or not RICE is ever populated.
2. **Three ventures can never be ranked from registry data alone.** Design Lab,
   WebDev Signal and Contest Radar declare no room or production envelope, so
   effort is `0` and RICE is undefined for them. That needs a declared envelope
   or an explicit effort entry — a config decision, not a code fix.

## A note on merging

`CLAUDE.md` says to merge to `main` at the end of every session. This session's
branch instruction was explicit that everything goes to
`claude/elegant-cori-h9cdgb`, so the merge was left to the owner. Remember that
merging does **not** deploy: `site/vercel.json` carries
`git.deploymentEnabled: false`, and the live site changes only when somebody runs
`pnpm deploy:check` on a clean commit and then `pnpm deploy:production`.
