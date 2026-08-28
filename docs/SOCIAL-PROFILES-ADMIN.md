# Social Profiles Admin boundary

Version: 2026-08-27

Authority: GitHub #407, consuming #406, #415, #424 and the proposed Social Distribution operating decision.

## One protected snapshot

`/admin/social-profiles` reads one server-only snapshot from
`site/src/lib/social-profiles/snapshot.ts`. It validates the publisher registry, official
connections, the #415 amplifier portfolio and central policy, immutable verified-release
campaigns, campaign decisions/events, append-only profile events, optional Network evidence,
provider control-plane evidence, #418 strategies/inventories/build receipts/incidents, the #424
capability map, activation evidence and profile/connection pause records. A malformed item
increments its own dropped count. Missing evidence stays unavailable.

The client receives bounded profile and connection fields, public handles, approved scope names
and environment reference names. It does not receive token values, native account values, private
Door Money data, provider responses or unpublished content. Personal Growth and Kvórum cannot
enter either profile collection. BOOKSOFHISTORY and Tehdejší svět remain separate proposals with
no cross-use relationship. Door Money carries only its exact `approved-publish-package/1` edge and
no account or connection.

The stable sections are Venture Profiles, Amplification Profiles, Campaigns, optional Network,
Providers & automation health, Content runway, Results, and Activity & setup. Campaigns reads only #410's
validated store. Content runway exposes #418 strategy, planning, receipt and incident evidence but
has no queue or publish action. Results is the #412 append-only aggregate view and contains no
audience identity, private message or spend action. Today, Learning and Plan & progress extend the
same snapshot and navigation only in their owning issues. CONTEST RADAR remains deferred and has
no source or control here.

## Lifecycle writer

The same-origin owner-only route at `/admin/api/social-profiles/actions` accepts seven exact
internal actions: profile pause/reject/retire, connection pause/disconnect, and manual
setup/reauthorisation requests. Every accepted action writes one idempotent
`social-profile-event/1` file under `state/social/profile-events/`. Production needs the canonical
GitHub writer. The social publisher reduces these events into profile and connection holds before
target resolution.

No action can create an account, finish OAuth, install a token, broaden a scope, activate a
profile, publish, engage with another user or purchase a service. Rejecting or retiring an active
profile requires a prior pause. Audit history remains append-only.

The separate same-origin owner-only route at
`/admin/api/social-profiles/campaign-actions` accepts exact target approval/rejection, bounded item
correction, window change with reason, hold and cancel. It appends `social-campaign-event/1`
evidence under `state/social/campaign-events/`. Target approval binds all immutable target items;
a material edit invalidates it. Held campaigns cannot be approved, and no campaign action queues
or publishes.

## Simulation and QA boundary

The shared `social-profile-simulation-matrix/1` seed drives the 50 deterministic #406 simulations
in both the contract generator and Admin visual fixture. The page includes them only when a
non-production caller explicitly requests `fixtures=profile-matrix`. Each record retains
`kind=simulation`, stays non-live and appears under a synthetic QA heading outside real totals.

The browser matrix covers 360, 430, 768, 1024, 1440 and 1728 pixels in light and dark themes. It
checks synthetic labelling, real totals, contained overflow, stable section/detail bookmarks
including Campaigns, bounded actions and WCAG A/AA rules.
