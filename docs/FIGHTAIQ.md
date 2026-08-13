# FightAIQ

FightAIQ is BoardlessAI’s sourced UFC and Oktagon data and analysis project. Decision
D8 turns guarded analysis on. It never places bets, signs into a bookmaker, publishes
affiliate links or presents a forecast as advice or income.

## What happens in a data run

1. The $0 roster reader checks reviewed Wikimedia categories and creates missing
   identity cards without calling a historical identity active.
2. The Cito free-tier adapter reads one bounded UFC roster page and the current event
   listing. Its stored monthly and daily counters stop the next run before the free
   allowance can be crossed.
3. A complete Cito pagination cycle records UFC roster status changes. Missing pages
   in a partial cycle never mark anyone inactive.
4. Reviewed event listings create `bout/1` records. One source can announce a bout;
   two independent sources are required before it becomes confirmed or reaches the
   prediction model.
5. The gap detector puts fighters booked next at the front, followed by missing
   history, incomplete profiles and stale cards.
6. One bounded Wikimedia batch enriches cards and imports cited historical rows.
   Repeating the run does not duplicate a card or bout.
7. Completed bouts rebuild career totals and separate UFC/Oktagon Glicko-2 ratings.

The canonical files are `state/mma/fighters/<fighter_id>.json` and
`state/mma/bouts/<org>/`. `state/mma/README.md` explains every stored directory and
the current coverage gap.

## Fighter cards and evidence

A `fighter-card/1` contains identity and aliases, organization-status history, sourced
profile fields, one cited row per known fight, deterministic career totals, Glicko-2
state, completeness, disagreements and an append-only change log.

Name, current division and overall record need two agreeing sources before model use.
A confirmed upcoming bout also needs two sources. A historical row may use one source,
but it stays visibly provisional. Unknown values remain unavailable.

The derived career profile includes W-L-D/NC, finish rate, KO/TKO, submission and
decision splits, average recorded fight time, recent three- and five-fight form,
activity rate and current layoff. No agent types these totals by hand.

## Predictions

The 19:00 analysis window remains agenda-gated, but D8 permits it to run. SIGMA receives
only future confirmed bouts whose two fighter cards pass the evidence gate. The
TypeScript model—not an agent—produces the probability from card snapshots and
Glicko-2 state. Odds are optional.

Every `model-run/1` stores the model version, full input hash and content hash for both
card projections. Each public `fightaiq-stats/1` descriptor carries the
`early-model` label. MMA Files shows “Model output, not betting advice” beside it.
Cancelled and postponed bouts remain in history but disappear from upcoming pages.

Repeated pages from one provider still count as one source. A run with no independently
confirmed eligible bout is an honest successful run with no prediction; neither odds nor the
reader surface invents a fallback probability.

BoardlessAI exposes only the Stats descriptor in its Results page. Fighter cards,
bouts and reader-facing predictions are delivered to MMA Files with
`fightaiq-delivery/2`.

## $0 source policy

`config/mma-sources.json` is the source allowlist.

- Wikimedia is the keyless identity and historical backbone. Requests use a named
  User-Agent, `maxlag`, small batches and cached state.
- The Odds API free plan is optional. Its response headers feed a hard stored stop at
  zero remaining credits. Predictions do not need odds.
- Cito’s free plan is optional. The runtime reserves no more than five calls per run
  and stops before its 500/month or 200/day limits.
- Owner-reviewed local imports fill cited gaps without a network service.
- Official organization pages remain disabled until a written access-terms review
  approves automation.

A new source is a SONAR proposal first. Paid-only and retired adapters, secret names
and envelopes are absent. If a source is unavailable, the product says so.

## Owner tools

`/admin?venture=fightaiq` has searchable fighter and bout cards with organization,
division, status and completeness filters. It shows gaps, disagreements, source
references and full change logs. Owner review can resolve a disagreement with a cited
reason; it cannot bypass the two-source model gate silently.

Useful commands:

- `pnpm fightaiq:roster-sync` — keyless roster check plus one bounded history batch.
- `pnpm fightaiq:backfill -- --input <reviewed-history.json>` — cited local history.
- `pnpm cycle -- --phase mma-intake --dry` — contract and routing proof with no live
  source calls.
- `pnpm cycle -- --phase mma-analysis --dry` — prediction-path proof without a live
  model call.
