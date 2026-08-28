# Owned amplifier proposal, setup and validation playbook

Version: 2026-08-27
Authority: GitHub #415, consuming #406 contracts and the exact deny-by-default map in #424.

## What an amplifier is

An owned amplifier is a transparent BoardlessAI brand with an independent reason to follow. It can
be distinguished by topic/editorial purpose, substantive language/market localization,
geography/community, a durable format or a genuinely different audience. It is never a fabricated
person, repost farm, generic everything account, engagement ring or account-count target.

`state/social/amplifiers/portfolio.json` is the single owner-editable portfolio. It intentionally
starts empty: a test fixture, contact, simulation, working label or valid schema does not imply a
real account. Every proposal is `social-amplifier-proposal/1`, remains an `owned-brand` with role
`owned-amplifier`, and carries append-only owner decision/history.

## Canonical decision flow

`evaluateAmplifierPurpose` is the only distinct-purpose gate. It returns `accept | hold | reject`
with component reasons and always reports publishing authority as false. It requires:

1. a bounded audience and independent reason to follow;
2. at least two repeatable original formats plus a realistic cadence/source plan;
3. a complete launch plan for the policy-required original concepts;
4. one exact current `approved-publish-package/1` #424 reference for every supported venture;
5. no name or handle collision with known owned identities;
6. owner-approved platform/market direction and an affirmative owner decision;
7. a 60–90 day validation plan with all seven evidence classes and explicit stop conditions.

Missing, stale, held, denied or extra capability references reject. They cannot be offset by a
strong purpose score. Personal Growth and Kvórum have no eligible outbound edge; BOOKSOFHISTORY and
Tehdejší svět have none; Door Money and WebDev Signal are bounded to their exact approved package
edges. CONTEST RADAR is absent from this core programme and remains deferred.

## One effective policy

`config/social-amplification-policy.json` is the sole policy source. The founding policy requires:

- at least 70% original or independently curated content over 20 posts;
- no more than 30% venture support;
- ten original concepts before launch;
- ten days between support for the same source venture;
- at most two active support campaigns;
- duplicate-caption and duplicate-asset rejection;
- an audience-specific angle and a six-hour stagger.

`resolveEffectiveAmplifierPolicy` composes central, platform, profile and proposal overrides and
keeps the strictest value. The founding Instagram override is 75/25, twelve days, one campaign and
eight hours. A proposal may tighten that further; any attempted loosening makes the effective
policy invalid. Changing central rules requires a new version, effective date, owner decision and
evidence-backed correction/supersession history. UI, campaign and queue code consume the resolver
output and must not copy these numbers.

`resolveAmplifierEligibility` exposes the canonical later-consumer view: lifecycle, purpose verdict,
allowed edges, runway required/completed/held, effective policy, setup/support eligibility,
overlap warnings and policy/purpose evidence. Support additionally fails on an irrelevant source,
ratio or campaign-cap breach, cooldown, duplicate content, missing stagger or missing audience
angle. Paused, retired and non-active proposals cannot support a release.

## Manual setup packet

Only an accepted setup-eligible proposal can produce `amplifier-setup-packet/1`. The packet contains
brand purpose/audience, name and handle candidates, factual bio, logo/avatar reference, canonical
destination, pillars, the first ten original concepts, cadence/runway, current official scopes,
credential **reference names** and a verification checklist.

The packet cannot create an account, complete OAuth, install a token or activate publishing. The
owner performs those actions under the single `SOCIAL-DISTRIBUTION-CONNECTION-001` task in
`docs/NEEDED.md`. A later connection still needs normal profile, capability, credential, scope,
human activation, kill-switch, content, cadence, reconciliation and receipt gates. No engagement,
browser session, DM, ad, boost, purchase or provider-upgrade action exists here.

## 60–90 day validation

The recorded review must examine all of:

- original consistency and runway maintenance;
- whether the audience has an independent reason to follow;
- qualified results only where a valid denominator exists;
- venture-support results versus the ordinary baseline;
- repetition and policy incidents;
- owner-attention minutes;
- provider and model cost.

Stop immediately on identity deception, capability/isolation leakage, credential/privacy exposure,
duplicate remote publishing or action outside owner authority. At the recorded review point, later
#433 may propose `CONTINUE | NARROW | PAUSE | RETIRE | INSUFFICIENT_DATA`; this issue defines the
evidence and stop conditions but does not manufacture ongoing metrics or run that evaluator.
