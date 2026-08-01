# FightAIQ fighter-card and MMA Files handoff

Updated: 2026-08-02

This note is the implementation map for the D8 analysis and free-data addendum. It is
written for the next maintainer and for the MMA Files consumer.

## Canonical flow

```text
reviewed $0 sources
  ├─ Wikimedia categories + page revisions
  ├─ Cito free-tier UFC roster/events (bounded cursor)
  ├─ The Odds API free-tier current prices (optional)
  └─ owner-reviewed cited import
          ↓
state/mma/fighters/<fighter_id>.json      fighter-card/1
state/mma/bouts/<org>/<bout_id>.json      bout/1
          ↓
deterministic history totals + Glicko-2
          ↓
confirmed bout + two eligible cards
          ↓
immutable model-run/1 + fightaiq-stats/1
          ↓
fightaiq-delivery/2
          ↓
lukaskourilcz/mma-files/data/boardless/fightaiq.json
```

BoardlessAI has no public fighter or event page. Its Results screen reads only the
Stats descriptors. MMA Files owns the reader-facing cards, profiles and upcoming
fights.

## Contracts

`fighter-card/1` contains identity, aliases, organization-status history, structured
sources, sourced fields, critical-field names, disagreements, per-bout history,
derived profiles, Glicko-2 state, quality gaps and append-only changes.

`bout/1` contains one canonical matchup and its append-only status history. Announced
history may start from one source. `confirmed` and `weigh-in` require two independent
source references. Cancellation, postponement and card changes append; they never
delete the old state.

`model-run/1` contains the exact model/config hashes and two card-projection hashes per
bout. `fightaiq-stats/1` is the small public descriptor and always carries
`calibrationLabel: "early-model"`. It says whether a market input was used; the model
does not require one.

The generated JSON Schemas and valid/poison fixtures live in `contracts/`. Run
`pnpm contracts:export` after changing a contract.

## Roster and history jobs

`pnpm fightaiq:roster-sync` is the visible keyless rehearsal. It:

1. reads reviewed Wikimedia categories with a named User-Agent and `maxlag`;
2. creates identity cards idempotently;
3. takes up to 12 not-recently-reviewed cards from the gap queue in priority order;
4. fetches their page revisions in one bounded request;
5. imports sourced infobox fields and parseable fight-history rows;
6. creates missing opponent identity cards;
7. rebuilds history totals and Glicko-2; and
8. writes `state/mma/backfill/queue.json` and `state/mma/roster/status.json`.

The live `mma-intake` phase does the same bounded Wikimedia work and advances one Cito
fighter page. A Cito cycle marks roster transitions only after pagination completes;
a partial cycle can never mark a fighter former. Upcoming-bout fighters receive the
highest gap priority.

The Wikipedia parser is deliberately conservative. A row without an opponent, event
or parseable date is skipped. Single-source history stays provisional. New unstructured
sources still require a SONAR proposal and terms review.

For gaps, `pnpm fightaiq:backfill -- --input <file>` accepts owner-reviewed rows with
at least one citation, writes stable historical bout IDs and safely repeats. Use a
second source when available; one-source history remains visibly provisional.

## Free-source and quota rules

- Wikimedia: keyless, cached and bounded. Content is attributed; Wikidata is CC0 and
  Wikipedia content is CC BY-SA.
- Cito: `CITO_API_KEY`, maximum reservation of five calls per run, hard stored stops at
  500/month and 200/day.
- The Odds API: `THE_ODDS_API_KEY`, one region and market, stored stop at the response
  header's zero remaining credits.
- Local import: no service key and no uncited row.
- Official organization pages: disabled until their automation terms are reviewed.

Paid-only and retired adapters, their environment names and request envelopes are not
part of the runtime. If either optional keyed source is unavailable, the run records a
skip and continues with honest unavailable states.

## MMA Files behavior

The consumer validates `fightaiq-delivery/2` before replacing its newest stored
snapshot. A stale or hash-tampered package fails. Fighter and event routes have no
fictional fallback. Cards missing a division or sources do not render as complete
profiles. The package contains only sanitized fighter cards, events, canonical bouts
and Stats descriptors. Raw odds, model runs, edge reports, pick files, private notes
and disagreement values remain inside BoardlessAI.

`src/lib/boardless.ts` groups canonical bouts into event cards and automatically drops
cancelled/postponed records from upcoming views. Active Stats entries attach to the
matching bout. `EventCard` and the Data Desk show the early-model warning, and fighter
names link to profiles. Profile pages expose history, deterministic totals, Glicko-2,
provenance and unavailable states.

## First live verification

1. In quorum repository variables, set `FIGHTAIQ_LIVE_ENABLED=true`,
   `FIGHTAIQ_ANALYSIS_ENABLED=true` and `MMA_FILES_LIVE_ENABLED=true`.
2. Confirm `CITO_API_KEY` and `THE_ODDS_API_KEY` exist in quorum Actions secrets. They
   do not belong in Vercel or MMA Files.
3. Run `mma-intake` with dry mode off. Confirm `dry=false`, `skip=false`, a new source
   snapshot and a delivery-v2 package/receipt.
4. Run `mma-analysis`. Zero outputs are valid until a two-source confirmed bout has two
   eligible cards. Never rerun only to force a forecast.
5. Confirm the MMA Files content commit passes its consumer tests, typecheck and build,
   then verify both language routes.
6. In a fixture rehearsal, append a cancellation and confirm the bout leaves upcoming
   pages while remaining in the canonical history.

## Current coverage truth

The committed keyless baseline is a historical identity/backfill set, not a finished
active roster. `state/mma/roster/status.json` is authoritative. At this handoff the
Wikimedia category produced UFC identities but no usable Oktagon category, so Oktagon
current roster and discovery still need a terms-cleared $0 source or cited reviewed
imports. The UI and model gates stay empty rather than hiding that gap.
