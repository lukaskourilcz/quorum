# Social Distribution daily operations

Version: 2026-08-28

Authority: GitHub #433, consuming #409, #410, #415, #417, #418 and #424.

## Deterministic daily decision

`decideSocialProfileDay` evaluates one real profile/connection for one Europe/Prague date. Its
input identity covers the effective profile, connection, strategy, inventory, accepted campaigns,
prepared candidates, routine scopes, policy state, sent history, kill state and availability of
the exact connection reference names. Replaying the same effective input returns the same
idempotency key and operation id.

Candidate choice is deterministic: useful, unexpired originals precede accepted campaigns,
reserves and recurring items. #418 inventory and #410 campaign target/copy/window decisions are
consumed by immutable reference and are never recalculated. A campaign handoff must still match
one exact currently approved target and channel item. Door Money and every cross-target item retain
their exact current #424 capability and approved package boundary.

The result is exactly one of:

- `queued` — one immutable handoff to the canonical #409 queue after every gate passes;
- `review` — prepared content or exact owner/scope evidence needs review;
- `held` — capability, connection, provider, budget, malformed input or reconciliation blocks it;
- `paused` — a global, profile or connection kill is engaged;
- `NO_POST` — cadence, duplicate, expiry, ratio, cooldown, runway, campaign capacity or absence of
  a useful candidate makes silence the correct outcome.

`NO_POST` is healthy evidence. The system never manufactures filler to satisfy a cadence target.

## Routine authority

`config/social-routine-scopes.json` is canonical and currently empty with `defaultMode:
draft-only`. No owner countersignature has been fabricated. A scope matches only one exact real
profile and connection plus platform, locale, content class, format, source kind, evidence
requirements, low-risk class, zero-or-bounded item cost, daily count, spacing and effective dates.
Wildcards and prohibited action classes are structurally absent.

Prepared content can reach review while the registry remains draft-only. It cannot enter the queue
until a later active scope contains both owner approval and countersignature evidence. Revocation
or expiry immediately removes the routine match without deleting prior operations.

## Queue and provider boundary

The queue handoff uses `CapabilityAwareQueueItemSchema` and the same payload hash enforced by #409.
The daily operation stores target, content, asset and window hashes, but never a token, native
account value or raw provider payload. #409 independently resolves the real publisher target;
#417 independently resolves the one eligible Direct Meta binding. An ambiguous delivery is held
for reconciliation and never silently resent or failed over.

`persistSocialDailyDecision` serializes each profile/connection/date writer behind a file lock. It
stores the append-only operation before exposing its matching queue file and repairs a missing
queue handoff on an exact replay. A conflicting operation or queue payload is rejected.

## Admin Today

`/admin/social-profiles?section=today` shows the Prague target date, queued/review/held/paused/
NO_POST totals, selected candidate type/reference, useful window, blocked gates, routine scope,
queue/provider state, actual recorded cost and replay identity. Missing records are unavailable,
not inferred zeros.

Owner-safe next actions are deliberately bounded to exact-item review or veto, dry re-evaluation,
exact-scope revocation and pause/cancel. The view does not generate content, activate an account,
change credentials or providers, engage with anyone, buy ads, operate Contest Radar or bypass any
#409/#417/capability/budget/kill/reconciliation gate.
