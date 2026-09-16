# Score the venture portfolio with RICE, and let the score decide nothing

Date: 2026-09-16

Decider: Lukas Kouril, owner

Status: pending owner countersignature

Decision id: `portfolio-2026-09a`

Signature / explicit approval reference: ____________________

Supersedes: nothing. `ROOM_DEGRADATION_ORDER` in `orchestrator/src/portfolio/schedule.ts` remains
the enforced answer to which room is dropped when a day exceeds the `$1.00` pace.

Sources: GitHub #539,
https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/,
`state/decisions/2026-09-15-focus-six-ventures.md`, `state/decisions/2026-08-12-kvorum-founding.md`,
`state/decisions/2026-08-12-kvorum-budget-capacity.md`

## Decision

Fourteen ventures share one `$50` all-in cap. This records a written method for comparing them —
Reach x Impact x Confidence / Effort — and records what that method currently produces, which is
nothing.

`config/portfolio-rice.json` holds the owner's half of the inputs. `orchestrator/src/portfolio/rice.ts`
derives the other half and writes `state/kpis/rice/<quarter>.json` at quarter end, beside the
existing quarter-end packet, and on demand through `pnpm portfolio:rice`.

| Factor | Where it comes from | State today |
| --- | --- | --- |
| Reach | owner, per venture, in `config/portfolio-rice.json` | absent |
| Impact | owner, on the 0.25 / 0.5 / 1 / 2 / 3 ladder | absent |
| Confidence | the share of that venture's quarterly KPIs in `state/kpis/latest.json` carrying a real measurement | derived |
| Effort | the venture's declared room and production envelopes from `config/ventures.json`, billed per thirty-day month | derived |

Every one of the fourteen rows reads `unavailable` today and names exactly which inputs it is
missing. That is the honest answer, not a defect: `METRICS_INGESTION_ENABLED` is `false` and
`state/BUSINESS.md` records a deliberate Phase 3 measurement hold, so no visitor, reader or
engagement number exists for any venture, and Impact is a judgement no code here may make.

## What this does not do

- **It does not open or close a room.** `ROOM_DEGRADATION_ORDER` is still the only list the daily
  envelope plan reads. The ranking records whether the scores agree with that order and stops
  there; a disagreement is evidence for a decision, never the decision.
- **It does not unhold a held venture.** Kvórum still needs both `kvorum-2026-08a` and
  `budget-2026-08g`, and its desk still drops out of the schedule and records a `$0` skip without
  them. A score is not a substitute for either signature, and no score can become one.
- **It does not change the operating scope.** `operations-2026-09a` is the current answer to which
  ventures run. The ranking covers every registered venture, including the paused ones, because a
  comparison that omitted them would beg the question.
- **It does not spend.** The whole path reads four files: the registry, the input file, the KPI
  snapshot and this record. No model call, no network call, no clock in the scoring.

## What turning it on would take

Two independent yeses, both of them the owner's, and neither of them enough alone:

1. `config/portfolio-rice.json` set to `posture: "owner-enforced"` and `rankingEnforced: true`.
2. This record countersigned.

Even then, nothing in this repository reads the result to gate a room. Making the ranking
authoritative is a further change to `orchestrator/src/portfolio/schedule.ts` and a further
decision, because it would override a hand-written order whose reasons are written into the
constant's own comments.

## Owner tasks

- [ ] Enter a Reach figure per venture in `config/portfolio-rice.json`, or record that Reach stays
      unavailable while the measurement hold stands.
- [ ] Enter an Impact step per venture on the 0.25 / 0.5 / 1 / 2 / 3 ladder.
- [ ] Decide whether the first complete ranking should be read at the quarter review at all, and
      countersign this record only if the ranking should ever gate a room.

## A note for that review

The enforced degradation order drops `dm-growth`, `kv-desk`, `dm-desk`, `ts-desk`, `bh-desk`,
`gv-brief` and `tt-marketing`, in that order. Five of those seven rooms belong to ventures that
`operations-2026-09a` paused on 2026-09-15. The enforced order and the current operating scope are
already out of step with each other, independently of any score. That is worth looking at whether
or not Reach and Impact ever get entered.

## Reversal

Delete nothing. Set `rankingEnforced` back to `false`, or leave this record unsigned, and the
ranking returns to being a recorded artifact that no runtime path reads.
