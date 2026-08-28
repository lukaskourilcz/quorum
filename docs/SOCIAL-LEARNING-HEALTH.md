# Social Distribution learning and health

Version: 2026-08-28

Authority: GitHub #434, consuming #412, #415, #418, #424 and #433 and integrating with the
canonical Operations health (#425) and recovery (#427) layers.

## Weekly learning checkpoint

Social learning joins the existing Monday-night reporting checkpoint; it does not introduce a
cron, timer, queue or recovery loop. Each real Social Distribution profile is evaluated from the
latest canonical 28-day post observation per native post and canonical daily operation receipts.
The lookback is capped at 90 days. Future, malformed and non-28-day observations do not enter the
sample. Fewer than eight distinct posts is explicitly `INSUFFICIENT_DATA`, never a zero-result
conclusion.

The evaluator records distinct and qualified-outcome samples, operation days, queue/NO_POST/hold
counts, owner-attention load, actual recorded cost, publish reliability, robust medians and
original/support ratios. An extreme qualified-action observation is ignored for strategy changes
only when at least four peers exist; it remains preserved in canonical result evidence.

At most two experiments may be active or under review. A sufficient sample may propose one
adjacent format or preferred-window rank change. It cannot apply the proposal. Applying an exact
owner-approved change creates a patch strategy version while preserving every other strategy
field. Purpose, capability, privacy, evidence, original/support ratio, runway, cooldown, duplicate,
stagger, authority, cost and kill-switch gates are frozen.

Every evaluation, continuation proposal, adjustment lifecycle event and strategy version is stored
under `state/social/learning/`. Replays are byte-equivalent. A later correction appends a new
content-addressed evaluation and updates a small weekly checkpoint manifest whose history retains
the prior references; no prior evaluation or strategy version is overwritten.

## Continuation proposals

Primary and umbrella profiles use a 28-day review window. Amplification Profiles use the configured
75-day window, within the required 60–90 day range. A proposal independently records sample size,
qualified outcomes, publish reliability, original consistency, ratio policy, support-baseline
comparability, independent audience reason, separate-profile justification, incidents, cost and
owner-attention load.

The deterministic verdict is one of `CONTINUE`, `NARROW`, `PAUSE`, `RETIRE` or
`INSUFFICIENT_DATA`. `PAUSE` may request a bounded queue pause for the exact scope. `RETIRE` is
advice for an owner decision only. No verdict deletes, retires or edits an external account,
changes a provider, grants authority, or publishes anything.

## Canonical domain health

`readSocialDistributionHealthObservation` is an adapter for the existing Operations health model,
not a second health source. It normalizes:

- daily profile/connection outcomes, including healthy `NO_POST`;
- inventory runway, no-candidate, held and stale-horizon evidence;
- provider binding health and credential/setup holds;
- queued, published, ambiguous and reconciled delivery state;
- capability, policy, budget, authority and kill-switch holds;
- actual cost, owner-attention references, last-known-good evidence and next expected daily run.

The adapter emits common receipt references to canonical Social state. Malformed records contribute
only a malformed count and cannot replace a valid prior receipt. An ambiguous result puts the exact
queue scope into `reconciling`, exposes the provider receipt to Operations Recovery and says not to
resend. Provider failure does not authorize silent failover.

Social Distribution now has an operating daily SLO in `config/venture-slos.json`. Its health states
remain the canonical Operations states: healthy, quiet, held, degraded, stale, failing, paused,
setup-needed and unavailable. Live connections may still be setup-needed or held independently;
the node being observable does not countersign a connection or routine scope.

## Recovery and owner-attention boundary

Recovery remains owned by #427 and `config/operations-recovery.json`. Social code may expose an
eligible exact receipt, preserve the last valid view, isolate malformed input, or create a stable
condition key that the canonical owner-attention upsert deduplicates. Only the recovery controller
may execute its bounded actions and attempt/cooldown policy.

Neither learning nor health may create or delete an account, enter or rotate credentials, change
OAuth scopes, switch providers, silently resend ambiguous work, add a venture capability, widen a
routine scope, change content approval, raise cadence or budget, publish, engage, buy ads, operate
Contest Radar, or deploy.

## Admin surfaces and owner runbook

`/admin/social-profiles?section=learning` shows sample maturity, robust outcomes, ignored outliers,
immutable correction count, adjustment versions/status and continuation evidence. The only safe
owner actions are to approve or veto one exact adjustment elsewhere, record a stricter correction,
request an exact queue pause or leave the proposal unchanged.

`/admin/social-profiles?section=automation-health` reads
`state/operations/health/social-distribution/current.json` plus the canonical incident snapshot. It
shows domain/queue/freshness state, exact holds, last valid/next expected timestamps, owner-attention
refs and the recovery handoff. It is information-only. For an incident:

1. inspect the exact evidence reference and affected connection/profile;
2. reconcile an ambiguous provider receipt before considering any retry;
3. pause only the affected scope when needed and leave the named unaffected scope unchanged;
4. perform credential, provider, account, capability, budget or deployment work only through its
   separately authorized owner workflow;
5. rerun the existing Operations refresh/checkpoint and verify the new canonical health snapshot.
