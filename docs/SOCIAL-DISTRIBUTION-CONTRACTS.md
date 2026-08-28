# Social Distribution contract ownership

Version: 2026-08-27

Authority: GitHub #406, using the provider/authority decision in #405 and capability truth in #424.

## Canonical artifacts

| Contract | Owner | What it records | What it never grants |
| --- | --- | --- | --- |
| `social-profile/1` | Social Distribution profile domain | A real owned brand, non-live owner-personal record or immutable simulation; role, purpose, audience and lifecycle. | Account existence, OAuth, connection, publishing, spend or cross-venture authority. |
| `social-connection/1` | Social Distribution connection domain | One profile/platform connector binding, credential and native-account-id reference names, exact scopes, health, cadence and human activation evidence. | Publishing authority by itself; engagement, account creation or credential/native-id values. |
| `distribution-contact/1` | Optional #411 Network domain | Minimum owner-entered public refs and consent/do-not-contact state for a genuine relationship. | Profile identity, connection, credential or publish-as authority. |
| `distribution-contact-event/1` | Optional #411 Network domain | Append-only qualification, contact, consent, pause, decline, do-not-contact, retire and correction evidence. | Outreach, inferred consent or profile/queue authority. |
| `social-campaign/1` | #410 campaign domain | One verified release's exact primary/umbrella/amplifier targets, immutable channel items, unique UTM, holds and correction-safe history. | A generic sister target, a new capability edge or provider authority. |
| `social-share-kit/1` | Optional #411 Network domain | Bounded factual material for copy/download/manual send to one opted-in contact. | Owned-account queue entry or a claim that delivery/sharing occurred without evidence. |
| `social-share-kit-outcome-event/1` | Optional #411 Network domain | Owner-recorded delivery/share evidence or aggregate `unknown` attribution. | Contact identity, inferred consent or automatic outreach. |
| `social-profile-event/1` | Profile/connection lifecycle ledger | Append-only proposal, setup, connection, activation, pause, reauthorisation, disconnect, retire, reject and correction evidence. | Engagement actions; the enum deliberately contains none. |
| `amplification-policy/1` | #415 amplifier policy domain | One central original/support ratio, runway, cooldown, campaign, duplicate, audience-angle and stagger policy plus stricter profile/platform overrides and history. | A live amplifier, loosened capability or copied UI/runtime literals. |

Schemas and inferred TypeScript types live in
`orchestrator/src/contracts/social-distribution.ts`. `parseSocialDistributionRecords` parses or
drops each record independently and exposes bounded drop reasons. Unknown fields fail because the
contracts are strict; credential values, sessions, private audience data and prohibited action
fields cannot hide in an open object.

## Authority flow

```text
profile + connection + exact #424 source capability + #415 amplifier evidence
  + verified release + immutable campaign item
  ≠ publish authority

all of the above + activation + content/claim/accessibility/duplicate/budget/cadence
  + kill-switch + two-phase claim/reconciliation/receipt gates
  = eligible input for the guarded publisher
```

`resolveSocialProfileConnection` therefore returns eligibility/hold/deny with
`authorityGranted: false` and `publishingAuthorized: false` in every case. #409 owns the later
runtime composition of all independent gates.

Queue v2 and `social-publisher-registry/1` are documented in
`docs/SOCIAL-PUBLISHER-MIGRATION.md`. The runtime resolves credentials only through validated
connection reference names; no venture-prefix branch remains in the Meta adapter or activation
gate.

## Structural boundaries

- No `fake-person`, `sister`, like, follow, comment, reply, repost, DM, account-creation, browser,
  ad, boost or purchase value exists in a contract enum.
- `venture-primary`, `company-umbrella` and `owned-amplifier` require `owned-brand`.
- `owner-personal` is non-live by default.
- `owned-amplifier` setup/live eligibility requires a #415 accept record and central policy ref;
  every supported venture requires an exact capability ref.
- A campaign always contains its source venture's primary target. Umbrella and amplifier targets
  require exact capability evidence; amplifier also requires #415 evidence.
- Personal Growth, Kvórum and GoVIRAL cannot source campaigns. BOOKSOFHISTORY and Tehdejší svět
  cannot target one another.
- A delivered share kit requires evidence; it never enters the owned-account queue.
- Policy overrides can only become stricter than central policy. The #415 resolver composes
  central, platform, profile and proposal values in that order, always retaining the strictest
  effective value.

## Simulations

`createSocialProfileSimulationFixtures` is an explicit dev/test import under
`orchestrator/src/social/fixtures/`. It deterministically returns exactly 50 labelled simulations
with abstract identicons and varied platform, setup, missing-metric, token-health, long-label and
error preview states. They contain no real name, handle, email, credential, native id or public
account. Every record has `kind/role/lifecycle: simulation`, `liveEligible: false`, fixture
provenance and identical create/update timestamps. Production connection resolution denies them
even when presented beside a schema-valid held connection.

The generator is not exported by the contracts barrel and production social runtime imports none
of its files. Later Admin visual QA may import it explicitly in dev/test mode only; it is never a
fallback for missing live state or a source of production totals.
