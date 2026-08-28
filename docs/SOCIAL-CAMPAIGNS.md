# Verified-release Social Distribution campaigns

Version: 2026-08-27

Authority: GitHub #410, consuming #406, #409, #415, #424 and the proposed Social Distribution operating decision.

## Boundary and idempotency

`orchestrator/src/social/campaigns.ts` accepts only `verified-release-campaign-input/1`. A valid
input names canonical verification evidence, one immutable `approved-publish-package/1`, the
source Venture Profile, the current capability map, the central amplification policy and bounded
prepared copy/assets. Drafts, failed deliveries, fixtures, public-page scrapes and contest
opportunities produce a recorded `SKIP`; Personal Growth, Kvórum and GoVIRAL cannot source a
campaign. Contest Radar is deliberately excluded until its final optional extension.

The idempotency key hashes the release/package/content, campaign version and effective
capability/policy set. Repeating that exact decision returns the existing campaign. Persistence
uses append-only `state/social/campaigns/` campaign and decision files and refuses a same-path
content conflict.

Door Money accepts only its owner-verified artifact reference below `state/ventures/door-money/`.
The strict input has no manuscript, chunk, embedding, annotation or style-exemplar field.
BOOKSOFHISTORY and Tehdejší svět cannot enter as one another's amplifier; an amplifier is a
transparent independent owned brand with `ventureRef=null`. GoVIRAL may be cited by a factual
evidence reference prepared upstream, but it cannot source the release or write final copy.

## Deterministic target selection

The final ladder is source primary, at most two relevant owned Amplification Profiles, then the
optional BoardlessAI umbrella profile. There is no sister-venture or relationship target in the
core. The optional #411 contract remains separate.

Every support candidate records hard gates before scoring: real identity and role, distinct #415
purpose, original runway, projected original/support ratio, same-source cooldown, active support
capacity, exact provider connection, current #424 capability, audience/topic/language/market/
format/freshness fit, duplicate and collision checks, a materially distinct angle and profile
authority. A failed gate sets `held` or `rejected` and score `null`. Missing evidence remains
`null` and never adds points. Eligible candidates use one versioned, explainable weighted score;
ties resolve by stable target ID.

Primary-only, held and support `SKIP` outcomes are normal. The generated campaign stores every
candidate and reason, while channel items exist only for the primary and support targets that
passed. Provider availability and measurement availability are explicit states, never inferred
as zero.

## Immutable items, approval and handoff

Each item records target/profile/connection/provider references, objective/audience, materially
distinct prepared copy, destination, factual/evidence references, assets and alt text, unique UTM,
renderer, content/asset/target/window/policy hashes and the exact approval binding. Prague-time
windows open at 0 hours for primary, 6 for umbrella, 24 for the first amplifier and 48 for the
second. Campaign creation does not publish or create another scheduler.

Owner actions are append-only `social-campaign-event/1` records. Exact target approval or
rejection, bounded copy correction, window change with reason, hold and cancel are supported.
Approval binds the aggregate of every immutable item on that target. A material edit calculates a
new binding and returns the item to `invalidated` / `needs-owner-review`; a stale event is rejected.
Kill switches and held campaigns win over approval.

`campaignInventoryCandidates` is the optional #418 handoff. It emits only exactly approved items
and carries the original target, reason, evidence, asset, content, policy, approval and window data
without rerunning selection. It explicitly leaves original-content ratio, cooldown, cadence,
provider, routine-scope and kill-switch checks for daily selection and grants no authority.

## Admin and prohibited actions

The canonical `/admin/social-profiles?section=campaigns` section reads campaign, decision and event
records through the existing server-only snapshot. Stable detail URLs use `campaign=`. The view
shows source release, candidate hard gates and score, item copy/window/UTM/binding, approval,
provider availability, recorded `SKIP` and honest unavailable results.

The same-origin owner-only campaign route accepts the six exact actions above, limits payloads to
8 KiB, rejects secret-like text and uses local append-only evidence in development or the
canonical GitHub writer in production. It cannot publish, queue, contact a relationship, automate
likes/follows/comments/replies/reposts/DMs, create an account, finish OAuth, buy a provider or
handle Contest Radar.

