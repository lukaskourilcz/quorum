# Social Distribution operating design

Verified: 2026-08-27

Status: core provider decision proposed; every external connection, routine scope and live send
remains held pending owner countersignature and the independent runtime gates.

Authority: GitHub #403, #405 and the deny-by-default capability map from #424. This document is
the evidence and operating boundary for Social Distribution. It creates no account, connection,
credential, provider subscription, routine scope, queue authority, publishing authority or spend.

## Decision in one page

- Keep the official Meta APIs as the canonical core connector for Instagram and Threads.
- Keep both repository channels in `draft` with `enabledByHumanAt: null`; the global kill switch,
  per-profile activation, connection, release, evidence, cadence, budget and receipt gates remain
  independent requirements.
- Retain the current Instagram Facebook Login adapter for its existing three legacy brands, but
  make the login mode explicit when #409 replaces the venture-prefix implementation. A future
  connection must deliberately choose Facebook Login or Instagram Login; their scope names and
  Page requirements are different.
- Hold Buffer as an optional small-portfolio adapter. It is not the source of truth, not an
  analytics authority and not a reason to activate a channel.
- Hold Metricool for a later managed-scale review. Its API tier currently exceeds the company's
  $50 all-in monthly cap before any other company cost.
- Hold n8n for peripheral inbound webhook/notification work only. It must not own social
  credentials, queue state, idempotency, provider reconciliation or scheduling authority.
- Defer Make to a bounded prototype only and reject Ayrshare for the current company stage and
  budget.
- Authorize no automated likes, follows, comments, replies, repost rings, direct messages,
  account creation, browser/session automation, ads, boosts or purchases.

## Official platform audit

Only professional accounts owned and authorized by BoardlessAI are in scope. A provider's product
page is never evidence that a particular BoardlessAI profile, token, permission or App Review state
exists.

| Platform/path | Official surface and minimum relevant scopes | Supported core capability | Limits and operational facts | Verdict |
| --- | --- | --- | --- | --- |
| Instagram with Facebook Login | Meta's official Instagram API collection; a Professional Business/Creator account linked to a Facebook Page. The current publishing lane uses `pages_show_list`, `instagram_basic`, `instagram_content_publish` and `pages_read_engagement`. Comment permission is unnecessary because engagement automation is prohibited. | Own-account image, video, Reel and carousel publishing; own-account insights only after a separate metrics approval. | Images are JPEG; media must be fetchable by Meta while the container is processed; the account publishing limit is 100 API-published posts in a rolling 24 hours and a carousel counts once. Query `content_publishing_limit` rather than guessing headroom. | **keep** for existing compatibility; #409 must record the login mode, Page relationship, current API version and exact scopes. |
| Instagram with Instagram Login | Meta's official direct Instagram Login surface; no linked Facebook Page is required. Minimum publishing scopes are `instagram_business_basic` and `instagram_business_content_publish`; own insights later require `instagram_business_manage_insights`. | Same bounded own-account publishing role without a Page dependency. | Old direct-login `business_*` scope names were deprecated on 2025-01-27. Ads and tagging are not available through this setup. | **keep as an explicit alternative**, never silently mixed with the Facebook Login credential contract. |
| Threads | Meta's official Threads API at `graph.threads.net`; publishing needs `threads_basic` and `threads_content_publish`; own insights later require `threads_manage_insights`. | Text, image, video and carousel publishing; own post/account insights after separate approval. The present runtime implements text only and must not claim the other formats until #409 adds and tests them. | Query `threads_publishing_limit`; Meta's current example reports 250 posts per 86,400 seconds. Reply quota and reply permissions exist but remain outside authority. Current post insight metrics include views, likes, replies, reposts, quotes and shares. | **keep** as the official connector. Search, mentions, replies and moderation scopes are not approved. |

The runtime must use an explicit supported Graph API version and re-run the official changelog and
connection probe before activation. The audit used the current v26.0 changelog on 2026-08-27; a
version string in an environment variable is configuration, not proof that the app/token supports
it.

Official source references:

- Meta Instagram API collection and login paths:
  <https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api>
- Meta Instagram with Facebook Login:
  <https://www.postman.com/meta/instagram/folder/23987686-3a75357f-e106-47ef-a8d9-af1aadf85365>
- Meta Instagram with Instagram Login:
  <https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login>
- Meta Threads API collection:
  <https://www.postman.com/meta/threads/collection/dht3nzz/threads-api>
- Meta Threads publishing quota:
  <https://www.postman.com/meta/threads/request/34203612-f4590341-9bee-44f5-901b-606078a03c96>
- Meta Threads post insights:
  <https://www.postman.com/meta/threads/request/434u2bd/get-post-insights>
- Meta Graph API v26.0 changelog:
  <https://developers.facebook.com/docs/graph-api/changelog/version26.0/>
- Instagram and Threads community rules used for the durable anti-spam boundary:
  <https://www.facebook.com/help/instagram/477434105621119> and
  <https://www.facebook.com/help/572730176521116/>

The policy conclusion is intentionally narrower than the APIs: no artificial engagement,
repetitive spam, misleading identity or fake account is allowed even if a provider exposes a
method that could perform it.

## Provider comparison

Prices and feature claims are snapshots verified on 2026-08-27, not standing purchase authority.
Every optional provider begins disabled and must have a cancellation/rollback plan before use.

| Provider | Current official evidence | Strengths | Limits, idempotency and failure posture | Cost/exit | Decision |
| --- | --- | --- | --- | --- | --- |
| Direct Meta | Official Instagram and Threads APIs above | Smallest authority surface; official account ownership; exact platform verification; no scheduling subscription. | BoardlessAI must own immutable hashes, two-phase claim, remote lookup/reconciliation, receipts, quotas and token health. The APIs do not make the current in-memory idempotency implementation durable. | No new scheduler subscription. Revoke app/token, pause connection and keep queue/receipts. | **selected core**, still held/draft. |
| Buffer | <https://buffer.com/api>, <https://developers.buffer.com/guides/introduction.html>, <https://developers.buffer.com/examples/create-scheduled-post.html>, <https://buffer.com/pricing> | Current GraphQL API can fetch channels/posts and create scheduled posts; available on current Free and paid plans; useful for a small owner-visible portfolio. | Buffer's API is not a complete production analytics source. Official pages currently disagree on Free's rolling 24-hour limit (100 on the API landing/help copy; 250 on the developer rate-limit/pricing table), while both show 3,000/30 days and 100/15 minutes. Use the lower 100/day until the owner verifies account headers. BoardlessAI hashes/receipts/reconciliation remain authoritative. | Free can evaluate the API without purchase. Disconnect/revoke the API key and return the binding to held. | **held optional small-portfolio adapter**. |
| Metricool | <https://metricool.com/pricing/> and <https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u> | Broad scheduling, reporting and managed-brand workflow; Instagram and Threads support. | API access is limited to Advanced/Custom. Free is one brand, 20 posts/month and 30 days of analytics; Starter has no API. Provider records cannot replace canonical campaign or receipt history. | Advanced is currently from €43/month for 15 brands (the displayed USD lane is from $53/month). Cancel/downgrade returns to Free and can remove API access. | **held managed-scale only**; incompatible with the current $50 cap. |
| n8n | <https://n8n.io/pricing/> and <https://docs.n8n.io/hosting/> | Webhooks, custom HTTP, retries and execution inspection; self-hosted Community option. | A generic workflow engine can duplicate credentials, schedules and mutable truth. It may only receive a bounded event after BoardlessAI commits canonical state, or send an owner notification. | Cloud Starter is currently €20/month annually for 2,500 executions; Pro €50/month for 10,000. Disable the workflow/webhook and revoke its narrow secret. | **held peripheral only**. |
| Make | <https://www.make.com/en/pricing> and <https://developers.make.com/api-documentation/api-reference/hooks> | Fast no-code prototype, webhooks and many integrations. | Module actions normally consume credits; Free has a 15-minute minimum interval and seven-day logs. Incoming webhooks can queue when credits are exhausted, which is not a substitute for BoardlessAI delivery reconciliation. | Free has 1,000 credits/month; Core is currently $12/month for 10,000 credits and API access. Disable scenario/webhook and revoke connections. | **deferred prototype**, not core. |
| Ayrshare | <https://www.ayrshare.com/pricing/> | Multi-network product API with posting, analytics, moderation and webhooks at larger tiers. | It is optimized for a commercial multi-tenant product and exposes engagement surfaces outside this program's authority. No provider feature may broaden BoardlessAI actions. | Premium $149/month for one profile; Launch $299/month for ten; Business $599/month for 30. Delete/disconnect profiles to stop profile billing. | **rejected/icebox** for current stage and budget. |

## Repository audit and required migrations

The current implementation is a guarded legacy publisher, not yet the Social Distribution Hub:

1. `config/channels.json` has global Instagram/Threads channel templates, not per-profile
   connections. Both are correctly `draft` with null human activation.
2. `orchestrator/src/social/activation.ts` and `meta.ts` hard-code Caught Up, MMA Files and Titty
   Tuesdays plus venture-specific credential prefixes. The config credential references are not
   the credential resolver used by the adapter.
3. `queue.ts` knows a short venture enum instead of a profile, connection, provider binding and
   exact capability target.
4. The Meta adapter's idempotency lookup is process-memory only. It cannot reconcile an ambiguous
   remote success after a restart.
5. `runner.ts` does not claim the queue item before the network call and retries any error directly.
   It bypasses the existing `publishQueueItem` two-phase/ambiguous reconciliation seam, so an
   uncertain first response can duplicate a remote post.
6. Receipts are written only after verification and an ambiguous failure becomes `failed`, not
   `needs_reconciliation`.
7. The global kill switch and pause files fail closed; the publisher schedule is intentionally
   commented out. These safeguards stay authoritative during migration.
8. Admin exposes legacy social artifacts but no canonical profile/connection/campaign/provider
   snapshot. Metrics are manual or unavailable; no unified own-account insight ingestion exists.

#409 owns these runtime repairs. A provider adapter must never be activated merely to hide them.

## Profile and amplifier posture

`Proposed` means a schema/UI record may be built later. `Held` means there is no external account,
connection or routine scope in this decision.

| Profile class | Current relationship | Capability posture | Connection/live posture |
| --- | --- | --- | --- |
| DNESKAi / Caught Up primary | Existing legacy queue/activation candidate | Own approved releases only; the stricter ten-article decision and all release gates still apply. | Draft, held, no human activation. |
| MMA Files primary | Existing legacy queue/activation candidate | Own approved releases only. | Draft, held, no human activation. |
| Titty Tuesdays primary | Existing legacy queue/activation candidate | Own approved campaign assets only after its venture safety gate. | Draft, held, no human activation. |
| BOOKSOFHISTORY primary | Proposed future official brand profile | No cross-target to Tehdejší svět; no current Social Distribution package edge. | Manual/draft only; no connection. |
| Tehdejší svět primary | Proposed future official brand profile | No cross-target to BOOKSOFHISTORY; no current Social Distribution package edge. | Manual/draft only; no connection. |
| Door Money primary | Future official brand profile | Only `door-money -> social-distribution` `approved-publish-package/1`; raw manuscript/private payload is forbidden. | Held; no connection. |
| WebDev Signal CZ/EN primary editions | Planned official edition profiles | Only `webdev-signal -> social-distribution` `approved-publish-package/1`. | Held; no connection. |
| FightAIQ primary | Possible future official profile | Own editorial releases only; no betting, affiliate, premium-pick or monetization route. | Held; no connection. |
| GoVIRAL | Intelligence service, not a copy/publishing source | Intelligence/evidence only; never captions, campaign packages or final copy. | No Social Distribution publishing relationship. |
| Personal Growth / owner-personal | Separate owner-only project | Permanent no-portfolio/no-campaign input. Owner-personal records stay manual and non-live. | Not eligible for this publisher. |
| Kvórum | Permanently isolated political venture | No outbound claims, evidence, recommendations, content or campaign package. | Not eligible for this publisher. |
| BoardlessAI umbrella | Optional future owned-brand profile | No current exact inbound package edge, so every target is denied. | Held; no account or connection. |
| Owned amplifier | Transparent topic/language/geography/format/community brand defined by #415 | Exact capability edges plus purpose, original-runway, ratio, cooldown and campaign gates required. | No profile is seeded or made live by this audit. |
| Simulation | Deterministic visual fixture only | No production total, connection, queue, provider or activation resolution. | Structurally non-live. |
| Ambassador/creator/community contact | Genuine optional relationship under #411 | Receives a manual share kit only; never a profile or publish-as identity. | No credential or connection. |

The only currently allowed `approved-publish-package/1` inputs to Social Distribution in #424 are
Door Money and WebDev Signal. Existing legacy publisher code must migrate through an explicit
profile/release authority without interpreting schema compatibility or file proximity as a new
capability edge.

## Autonomy and authority matrix

| Action | Core state after #405 | Required evidence before change |
| --- | --- | --- |
| Compose a bounded draft from a venture-owned approved release | Allowed only where the venture already owns that draft authority; still no send. | Release/evidence/content/accessibility checks and immutable content hash. |
| Create internal profile/connection proposals | Planned in #406/#407; non-live. | Valid role, provenance and append-only history. |
| Create or connect an external account, complete OAuth or add a secret | Owner-only, held. | Exact profile/account, official login mode, scopes, server secret names, verification and countersignature. |
| Queue a live item | Held until #409/#410. | Real profile + connection + provider binding + exact capability + release + activation + kill + policy + budget + window hash. |
| Publish original content | Held. | Every queue gate, remote preflight/reconciliation and durable receipt; global kill switch explicitly off. |
| Read own-account metrics | Held until #412 and an exact connection scope. | Own profile/media ids only, typed unavailable states, no follower identities or private messages. |
| Reply, comment, like, follow, repost, DM or automate engagement | Prohibited. | Not part of this program; a new owner decision and platform/policy review would be required. |
| Buy/upgrade Buffer, Metricool, n8n, Make, Ayrshare or ads | Prohibited by this decision. | New recorded budget and purchase authority; no UI/runtime may self-upgrade. |

## Review measures and stop conditions

The first 28 live days, if separately activated, establish a baseline rather than a follower or
revenue target:

- percentage of attempted items with complete release/evidence/accessibility/capability checks;
- queue-to-verified-receipt success, ambiguous/reconciliation count and duplicate incidents;
- cadence/rate-limit holds and provider/token availability;
- valid reach, saves, shares and profile actions only where an official denominator exists;
- owner-attention minutes, provider cost and cost per verified item;
- correction, policy, privacy or isolation incidents;
- original versus support mix for any later amplifier.

At 60–90 days decide `CONTINUE | NARROW | PAUSE | RETIRE | INSUFFICIENT_DATA` per real profile.
Any credential leak, cross-isolation payload, duplicate remote publish, artificial engagement,
unreconciled ambiguity, budget breach or provider action outside recorded scopes immediately
pauses the affected connection and preserves evidence for owner review.

## Owner handoff

The single current setup/countersignature task is `SOCIAL-DISTRIBUTION-CONNECTION-001` in
`docs/NEEDED.md`. Later implementation must extend that one task rather than create parallel
credential/provider checklists. Until it is explicitly completed, direct Meta and every optional
provider remain held and the current zero-cost draft-only state is the correct production state.

All CONTEST RADAR work is outside this core program and remains deferred to the owner's final
phase. No source, action, contract, profile or provider integration for it is introduced here.
