# Contest Radar outbound posture: one held edge, and nothing switched on

Date: 2026-08-30

Decider: Lukas Kouril, owner

Status: countersigned

Held by this decision: every publication, every campaign, every referral link and every contest
action. This record grants a `held` capability edge and no authority to use it.

Signature / explicit approval reference: Owner instruction, 2026-08-30 session (Claude Code):
"there are still 4 open issues, complete them", the fourth being GitHub #430, whose first
prerequisite in `docs/CONTEST-RADAR-OPTIONAL.md` is this amendment. Live behaviour, account
creation, credentials and spend stay held by this record's own boundaries.

Decision id: `contest-radar-2026-08b`

Amends: `contest-radar-2026-08a` (the founding), on one clause only.

Sources: GitHub #430, #408, #403, #424, and `config/venture-capabilities.json`.

## What this amends, and why it is a narrowing rather than a widening

The founding says Contest Radar "has no **mandatory-core** content edge to any other venture in
either direction". The isolation rule written to enforce it says something stricter — no outbound
content edge at all, to anything, ever. That was the implementation being more careful than the
decision, which is usually harmless and is not harmless here: it makes #430 unimplementable without
looking like a weakened guard, and it hides the actual boundary behind a stronger claim nobody
decided.

So this decision states the boundary the founding meant, in the exact terms the capability map uses:

- Contest Radar has **one** registrable outbound edge: `contest-radar → social-distribution`,
  capability `approved-publish-package`, payload `contest-promotion-candidate/1`.
- That edge is registered `held`. It is not `allowed`, and this decision does not make it so.
- Every other outbound target and every other outbound capability stays permanently isolated,
  including `intelligence-read`, `bounded-render-summary` and `owner-manual-reference-read` to
  Social Distribution itself.

A `held` edge is a relationship that has been named and refused, which is a different and better
thing than one that was never considered. `resolveVentureCapability` returns `held`, callers refuse,
and the refusal is legible instead of arriving as "no exact directional capability edge is
registered", which reads identically to a typo.

## What is still forbidden, under this decision and any later one

The founding's line does not move. **Contest Radar never acts on a contest**: no entry, form
submission, comment, follow, like, tag, share, upload, purchase, team join, rule acceptance, prize
claim, account creation, payment or email.

Nothing in #430 is authorised by this record either. Specifically still forbidden:

- a simulated or fake profile as a participant, and several owner-controlled profiles counted as
  several people;
- any automated entry, follow, like, comment, tag, repost, upload, purchase or prize claim;
- an invented referral link or code, and any self, household, employee or reciprocal referral;
- a click, view or share recorded as an entry or a bonus;
- Personal Growth, Kvórum or Door Money as source or target;
- broadening any capability edge or routine scope through this route.

## The gate this decision requires

Promotion eligibility is decided on the contest's own rules and refuses by default. **Silence is
held.** A contest that does not explicitly permit public promotion or referral sharing is a private
repeat opportunity and stays one; ambiguity resolves the same way. This mirrors the rule the venture
already applies to prizes and deadlines: an unstated fact is unavailable, never assumed.

Separately and independently, `generateSocialCampaign` continues to refuse every Contest Radar
release with `contest-source-excluded`. That gate is not relaxed by this decision, and a promotion
candidate reaching `social-campaign-eligible` still produces no campaign.

## To move the edge from held to allowed

A further countersigned decision, naming the profile, the contest, the rule evidence and the
disclosure text. This decision is explicitly not that one.

## Stop conditions

- Any evidence that a promotion candidate produced a published post, a referral click recorded as a
  bonus, or an entry stops the extension until the path that allowed it is removed.
- A contest whose rules change after a candidate was derived expires or holds that candidate; a
  stale rule verdict is never carried forward.
