# FightAIQ

FightAIQ is BoardlessAI’s sourced UFC, KSW and Oktagon data and analysis project.
Its current mode is `data-only`. It may collect facts, run deterministic models,
show fixture-labeled dry proof and let the owner review records. It may not place a
bet, open a bookmaker account, publish affiliate links or present gambling as income.

## How a number is allowed to exist

1. A fighter fact carries its value, source references, retrieval time and review state.
2. Record, date of birth, reach, height, stance and division need two independent
   agreeing sources before model use.
3. Conflicts open a disagreement. The admin can record a selected cited value and a
   reason; a lone source remains provisional.
4. The TypeScript engine—not an agent—creates every probability. Agents can only add
   a cited adjustment of at most three percentage points before event time.
5. Model configuration is hash-coupled to its version. Meeting text containing a
   quantified fight probability fails validation without a ModelRun reference.

Ratings use Glicko-2 in separate UFC, KSW and Oktagon pools. A crossover fighter gets
a conservative bridge rating with wider uncertainty. The output includes win, method
and round distributions, an uncertainty label, optional market comparison and exact
input references.

## Sources and prices

The source registry is `config/mma-sources.json`. The Odds API and Cito API are the
only credentialed live adapters. Tapology and Sherdog are not scraped; prohibited or
unclear sources cannot silently become wired. The Odds API adapter reads the quota
headers and refuses another request when remaining credits reach zero.

The owner can enter UFC, KSW or Oktagon prices in `/admin`. This stores an auditable
snapshot only; no code logs in to a bookmaker or places a wager. Missing closing odds
mean CLV is unknown, never guessed.

## Outputs

- Edge Report: model and de-vigged market view for each eligible fight.
- Slip of Ten: exactly ten typed legs, up to two true coin flips expanded both ways,
  never more than four owner-only tickets, never more than `$5` per ticket.
- Track record: immutable published picks, results, Brier contribution and CLV when a
  real closing snapshot exists.

Public pages use a defensive subset and plain-language explanations. Predictions stay
hidden in data-only mode. The private admin adds fighter disagreements, events, manual
prices, slates and source terms.

## Moving beyond data-only

The owner must countersign `state/decisions/2026-08-02-fightaiq-founding.md`, review one
complete UFC, KSW and Oktagon event, and record a separate mode-change decision. Only
then may `FIGHTAIQ_ANALYSIS_ENABLED=true` expose live model analysis. The detailed
manual list is in `NEEDED.md`.
