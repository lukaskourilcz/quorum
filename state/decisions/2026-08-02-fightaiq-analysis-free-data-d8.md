# D8 — FightAIQ analysis and free-data policy

Date: 2026-08-02

Decider: Lukáš Kouřil, owner

Status: approved and countersigned

Decision id: `fightaiq-analysis-free-data-d8`

## Decision

FightAIQ moves from data collection into guarded live analysis. This decision
supersedes the analysis hold in the founding and UFC/Oktagon scope records without
rewriting those historical records. `FIGHTAIQ_ANALYSIS_ENABLED=true` is now the
approved operating setting.

The model may issue a prediction only for a future confirmed bout, after two
independent sources agree that the bout is current and both linked fighter cards pass
their critical-field evidence checks. Predictions are deterministic, keep immutable
card-snapshot hashes and carry the `early-model` label. FightAIQ still cannot place a
bet, open a bookmaker account, publish affiliate links or describe a model output as
advice or income.

FightAIQ uses only $0 data: public Wikimedia data, a keyed service with a genuinely
usable free tier and an enforced quota stop, or an owner-reviewed local import. A paid
source cannot remain as a dormant adapter or secret. A new source still requires a
recorded terms review before it is wired.

The Odds API and Cito free plans remain bounded by stored quota guards. Missing or
exhausted keys produce an honest unavailable state; predictions run from fight history
and do not depend on odds. Official organization pages remain disabled until a written
terms review clears automated access.

## Approval reference

`owner-request:2026-08-01-fightaiq-fighter-cards-free-data-v2`

The owner supplied the FightAIQ fighter-card, discovery, backfill and free-data
addendum as an implementation instruction in the active Codex task and stated that
analysis mode is on under decision D8.
