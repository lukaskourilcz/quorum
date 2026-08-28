# Social Distribution provider and authority posture

Date: 2026-08-27

Decider: owner countersignature pending

Status: proposed; all external and live effects held

Decision id: `social-distribution-2026-08a`

Sources: GitHub #403, #405, #424 and `docs/SOCIAL-DISTRIBUTION-DESIGN.md`

## Decision

Direct Meta, through the official APIs, is the selected core connector for owned Instagram and Threads
professional accounts. The existing Instagram Facebook Login implementation remains the
compatibility path for its legacy brands; every future connection must explicitly record whether
it uses Facebook Login or Instagram Login and validate that path's exact scopes and account/Page
requirements.

Buffer is held as an optional small-portfolio adapter. Metricool is held for a future managed-scale
review. n8n is held for peripheral inbound webhook/notification work only. Make is deferred to a
bounded prototype. Ayrshare is rejected for the current stage and budget. None is installed,
connected, purchased, subscribed or activated by this decision.

BoardlessAI remains the canonical owner of profile, connection, campaign, queue, content hash,
claim/evidence, approval, cadence, idempotency, reconciliation, receipt, metric and history state.
Provider state may be evidence but cannot replace or broaden those gates.

## Authority

- Both repository channels stay `draft` with `enabledByHumanAt: null`.
- `SOCIAL_KILL_SWITCH`, pause files and every venture/profile/connection gate remain fail-closed.
- External account creation, OAuth, credentials, App Review, routine scopes and live activation are
  owner-only under `SOCIAL-DISTRIBUTION-CONNECTION-001`.
- Only original publishing from a real owned account can be implemented by later issues.
- Automated likes, follows, comments, replies, repost rings, DMs, account creation,
  browser/session automation, ads, boosts, purchases and plan upgrades are prohibited.
- Own-account metrics remain held until their owning issue and an exact read scope. Follower
  identities, private messages and scraped audience records are never ingested.

## Capability and isolation

The #424 map remains unchanged and deny-by-default. Its only current allowed
`approved-publish-package/1` inputs to Social Distribution are Door Money and WebDev Signal; an
allowance grants no publishing or spend authority.

Personal Growth receives no portfolio/campaign input and is not a Social Distribution publisher.
Kvórum has no outbound political/content edge. BOOKSOFHISTORY and Tehdejší svět cannot target one
another. Door Money can send only its immutable approved package reference, never manuscript or
private payload. GoVIRAL supplies intelligence/evidence only, never final copy or campaigns.
FightAIQ receives no monetization route. A company umbrella or owned amplifier needs a later exact
edge and every independent policy/authority gate.

## Runtime preconditions

Before any live activation, #409 must replace hard-coded venture credential prefixes with validated
profile/connection/provider bindings and repair the publisher's ambiguous-delivery path: durable
two-phase claim, remote reconciliation before retry, process-independent idempotency evidence and
receipt-safe recovery. #406, #415 and #410 own the preceding schemas, amplifier policy and campaign
selection. No provider activation may be used to bypass those repairs.

## Budget and rollback

The current state costs $0 in new provider subscriptions. A later provider purchase requires a new
recorded budget decision and must fit inside the authoritative company all-in cap.

Rollback is fail-closed: pause the profile/connection, restore the global kill switch, disable any
provider workflow, revoke its narrow token/API key and retain canonical queue/receipt/history
evidence. No rollback deletes audit history or reclassifies an ambiguous remote outcome as failed.

## Activation

This proposed operating posture is deliberately safe before countersignature because it only
selects a future implementation direction and keeps all live effects closed. Owner countersignature
of `SOCIAL-DISTRIBUTION-CONNECTION-001` must name the exact real profiles, login modes, scopes,
secret references, provider choice and routine scope; it still cannot waive runtime, capability,
privacy, content, budget or kill-switch gates.

All CONTEST RADAR work remains outside this decision and deferred until the owner's final phase.
