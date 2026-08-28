# Social Distribution content runway

Version: 2026-08-28

Authority: GitHub #418, consuming #406, #410, #415 and #424.

## Editorial constitutions

`config/social-profile-strategies.json` is the canonical registry of one
`social-profile-strategy/1` constitution for each recorded real Social Distribution profile. A
constitution fixes the profile purpose, audience, languages, markets, content pillars, recurring
formats, cadence range, central policy references, deterministic generation limits and review
date. It grants no account, queue or publishing authority.

The registry currently covers the six official Venture Profiles. An accepted owned Amplification
Profile must receive its own versioned constitution before it can enter inventory planning. The
strategy resolver rejects an unrecorded profile, a stale or mismatched policy/capability reference,
a denied source capability, or an amplifier without the #415 evidence and launch runway.

Design Lab is the sole declared asset renderer. The inventory builder records asset readiness and
references; it does not render assets or invent a second design system.

## Rolling inventory

The capacity-planned builder in `orchestrator/src/social/inventory.ts` produces a seven-day rolling
inventory with seven original candidates, two reserves and one recurring slot when its bounded
inputs support them. This is a planning target, not a posting quota. A candidate is a dated brief
with evidence, source, asset readiness, useful window, classification and authority class. Its
`finalCopy`, `queueAuthorized` and `publishingAuthorized` values are always false.

The builder is deterministic-first and has a zero model-call and zero-dollar default. The input
hash covers the strategy, time window, campaign references and exact capability evidence.
Unchanged inputs reuse the existing inventory and receipt rather than regenerating candidates.
Expired or superseded candidates remain linked in history.

Accepted #410 campaigns may contribute campaign candidates only through their immutable approved
items. Inventory does not rerun target selection, approval, ratio, cooldown, provider, routine or
kill-switch policy. Door Money may consume only an exact current `approved-publish-package`
capability edge. GoVIRAL may contribute bounded intelligence references but never final copy or a
CTA. Personal Growth, Kvórum and Contest Radar are outside this domain.

## Honest shortage and recovery

The builder records `LOW_RUNWAY`, `NO_CANDIDATE` or `BUILD_HELD` instead of forcing a post. A refill
request goes through the existing operations capacity planner with bounded cost, provider-call and
model-call estimates. The writer persists only current inventory, append-only build receipts and
incidents. It never writes the queue and never calls a provider.

Candidate expiry, an owner correction, a stricter strategy version or an approved campaign change
can produce a later governed refill. No shortage authorizes generic filler, a cross-venture copy,
an unapproved campaign item or an automatic publish.

## Admin visibility

`/admin/social-profiles?section=content-runway` shows canonical strategy versions and review dates,
coverage and inventory counts, original/support projection, candidate due/expiry and asset/evidence
state, latest build receipt, actual recorded cost and incidents. Missing inventory is displayed as
unavailable rather than zero. The surface has no queue, publish, account activation or routine-scope
action.
