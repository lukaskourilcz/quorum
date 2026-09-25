# Social Distribution provider control plane

Status: implemented and held. Authority: GitHub #405, #409, #417, #570, #571 and #572.

The provider control plane transports an exact item that already passed profile, connection,
capability, campaign, approval, policy, cadence, budget and kill-switch gates. It does not choose a
profile, campaign, copy, asset, window or experiment. BoardlessAI remains authoritative for the
queue, campaign, canonical receipt, attribution and learning record.

Own-account insights use the same exact binding resolver with the separate `own-insights`
capability. The current bindings do not carry that capability or the owner-approved insight scopes,
so collection records `missing-permission` and makes no provider request. See
`docs/SOCIAL-RESULTS.md`.

No account, OAuth flow, credential value, provider plan, purchase, live connection or routine
publishing authority is created by the implementation. All nine bindings in
`config/social-providers.json` remain `held`: eight Direct Meta bindings for the Instagram and
Threads connections, and one Buffer binding for devShark's LinkedIn Page (#569). Two providers
have a publish adapter: Direct Meta (`orchestrator/src/social/meta.ts`) and, since #571, Buffer
for LinkedIn (`orchestrator/src/social/buffer.ts`).

## Contract and state family

| Contract | Purpose | Explicit non-authority |
| --- | --- | --- |
| `social-provider/1` | Dated implementation, capability, limit, risk, cost, exit and verdict record. | Strategy and content-generation authority are always false. |
| `provider-connection-binding/1` | Immutable provider-to-connection handoff, credential reference names, migration state and health. | A binding is not publishing authority. At most one may be active per connection. |
| `provider-delivery-receipt/1` | Bounded attempted, published, ambiguous and reconciled provider evidence linked to the canonical receipt. | Raw provider payloads are excluded and the receipt cannot authorize resend. |
| `provider-health/1` | Deterministic binding health, token/App Review/plan/rate/webhook posture and next safe action. | It does not replace company operations health; #425 consumes it later. |

Provider evidence is written only after an eligible runtime attempt:

- `state/social/provider-receipts/<provider-receipt-id>.json`;
- `state/social/provider-health/<provider-health-id>.json`;
- the canonical `social-post-receipt/1` retains its own truth and references the normalized
  provider receipt.

Credential and native-account values remain server-side environment values. Configuration and
Admin show allowlisted environment reference names only. Sanitized error text is bounded to 500
characters. Raw request/response bodies, authorization headers, cookies and tokens are never
persisted in this domain.

## Provider verdicts

| Provider | Role | Verdict | Release effect |
| --- | --- | --- | --- |
| Direct Meta | Direct official Instagram and Threads transport | Enabled implementation; every connection held | Mandatory core when owner setup and authority exist. No scheduler subscription. |
| Buffer | Managed scheduler; the LinkedIn transport | Held until the owner's live test | The adapter exists (#571) and sends LinkedIn only. It holds the one binding of devShark's LinkedIn connection (`devshark-social-2026-09a`, proposed). Recording the live test below raises the verdict to `enabled` for LinkedIn only; the binding stays held until the owner activates it. No token, account change or plan upgrade blocks core release. |
| Metricool | Managed scheduler and reporting | Held managed-scale only | Its API plan remains outside the current budget; no adapter or purchase exists. |
| n8n | Notification/webhook boundary | Held peripheral only | Can normalize a committed webhook or notify an incident. Cannot publish or own strategy, calendar, approval, failover or outreach. |
| Make | Notification/webhook prototype | Disabled/deferred | No adapter exists without a new owner decision. |
| Ayrshare | Managed multi-profile scheduler | Rejected | No adapter or profile exists; the dated cost/authority verdict is retained. |

The registry structurally rejects `publish-original` on a notification-only provider. Optional
providers cannot silently become a connection's transport because the publisher requires the
connection's exact provider id/version and one active binding.

Every Instagram and Threads connection keeps exactly one retained Direct Meta binding. Meta has no
LinkedIn API, so a LinkedIn connection keeps exactly one binding with the provider its connector
names, and the publisher registry allows only Buffer there. A binding on a provider whose
`supportedPlatforms` do not include its connection's platform is refused.

`orchestrator/src/social/provider-platforms.ts` says which provider may send where: Direct Meta to
Instagram and Threads, Buffer to LinkedIn. The provider registry refuses a record in which Buffer
claims Instagram or Threads, the binding resolver denies a publish binding outside that map, and a
connection on a provider with no adapter resolves `held` with `provider-adapter-unavailable`.
Buffer's API could reach Instagram and Threads; this map keeps the Meta core the only transport
for them.

## Direct Meta delivery and reconciliation

`orchestrator/src/social/meta.ts` sends these formats and nothing else (#572):

| Platform | Formats | Host and scopes |
| --- | --- | --- |
| Threads | text alone (`TEXT`), one image (`IMAGE`), or a carousel of 2 to 10 frames (`is_carousel_item` children, then one `CAROUSEL` container); JPEG or PNG | `graph.threads.net`, `threads_basic` and `threads_content_publish` |
| Instagram | one JPEG, or a carousel of 2 to 10 JPEGs; the caption goes on the single image or the carousel container, never on a child | Facebook Login: `graph.facebook.com` with `instagram_basic` and `instagram_content_publish` (DNESKAi's connection). Instagram Login: `graph.instagram.com` with `instagram_business_basic` and `instagram_business_content_publish` (devShark's). The adapter never mixes the two. |

Every image carries `alt_text`: each frame's own slide text when the approved package pairs frames
with slides, otherwise the item's alt text for a single image. Meta fetches each image from a URL
the publisher proved in the same run. The same check holds a frame the platform would refuse:
Instagram takes JPEG only, aspect 4:5 to 1.91:1, sRGB; both take at most 8 MB and a width of 320
to 1,440. `docs/SOCIAL-ASSET-HOSTING.md` covers the commit-pinned jsDelivr URLs, the pre-send
check, held items and the 90-day retention.

A send goes in this order, all on the connection's own host:

1. Threads text is measured the way Threads counts it (500, an emoji as its UTF-8 bytes).
2. The publishing limit is read: `threads_publishing_limit` or `content_publishing_limit` with
   `fields=quota_usage,config`. Meta documents 250 Threads posts and 100 Instagram API posts in
   a rolling 24 hours, and a carousel counts once. When `quota_usage` leaves no room for one more
   post, or the limit cannot be read, the adapter stops before any write.
3. The containers are created.
4. For an image or carousel, the adapter waits for the container: on Threads it waits the
   30 seconds Meta recommends, then reads `status,error_message` every 30 seconds, five times at
   most; on Instagram it reads `status_code` at once and then once a minute, for no more than
   five minutes. `ERROR`, `EXPIRED`, an unreadable status or a container still `IN_PROGRESS`
   stops the send before the publish request, with Meta's `error_message` in the error.
5. `threads_publish` or `media_publish`, then the live check reads `id,permalink`.

A refusal in steps 1 or 2 is a **publish hold**: the runner writes
`state/social/publish-holds/<queue-file>.json` (`social-publish-hold/1`, reasons
`publishing-quota-exhausted`, `publishing-quota-unreadable` and `platform-text-limit`), puts the
claimed queue file back byte for byte and pauses nothing. The item stays due and the next run reads
the limit again; the record goes once the item gets past these checks. The report counts it as
`publishHeld`. The runner's own publishable check, before the claim, writes the same record with
reason `not-publishable` for the one item that fails it.

The tests replay Meta exchanges from `orchestrator/tests/fixtures/social-meta/`. The Threads and
Instagram flows use the answer shapes Meta documents, because no devShark connection exists to
record from; the unreadable-limit case replays live answers recorded without a token. The first
live send after activation is the first real recording.

**The claim reaches the branch first.** A run has two phases with a push between them. The claim
phase (`pnpm social:publish -- --phase claim`) decides what is due and eligible, proves the frames,
and writes each item it will send as `publishing` with its idempotency key and `claimedAt`. It calls
no provider. The workflow commits those queue files and pushes them; a rebase conflict there means
the owner changed a claimed item on the branch since checkout, and the run stops before any send.
The send phase (`--phase send`) acts only on the claims the claim phase listed in the runner's
temporary claims file, and only while the branch still carries each claim. It checks every lock
again, because a pause or a channel change may have reached the branch in between; a claim that no
longer passes goes back to its earlier bytes unsent. A claim that never finished stays
`publishing`: nothing resends it, and cadence counts it as if it went out.

The runtime looks for an already known idempotency key before publication, sends at most once, and
may retry the read-only live-verification request twice. A timeout or inconclusive result during
publication becomes `ambiguous`: the queue item becomes `needs_reconciliation`, the exact
connection and source venture pause, and no subsequent run considers that item due. This prevents
an uncertain provider acceptance from becoming a duplicate send. An unreadable container status and
a container still `IN_PROGRESS` after the last read are ambiguous too, because Meta has not given a
final answer; the error says that nothing was published, so reconciliation is a check rather than
a search.

A container that ends `ERROR` or `EXPIRED` is Meta's final answer that it will never publish. The
adapter throws `ProviderRejectedError` (`container-failed`), as Buffer does for a refused post: the
item becomes `failed` for owner review, the provider receipt `failed`, the canonical receipt
`failed`, and the report counts it as `rejected`. The connection and venture pause as for an
ambiguous outcome, and nothing resends the item; a corrected post is a new item.

An ambiguous provider receipt always returns `resendAuthorized: false` and
`automaticFailover: false`. Reconciliation must record remote evidence or an owner-reviewed
failure/correction before a distinct item can be approved. A provider outage preserves the
canonical queue and campaign item.

## Buffer delivery for LinkedIn

Buffer's free plan is the LinkedIn transport because it already holds LinkedIn's approval for
Company Page posting, exposes its API on every plan and costs nothing. Posting through LinkedIn's
own API needs a vetting this company cannot pass today (see the last section).

The adapter carries an item the queue, the owner and every gate have already settled. It never
chooses copy, window, profile or experiment. `orchestrator/src/social/buffer-api.ts` holds the
three GraphQL operations and `orchestrator/src/social/buffer.ts` the adapter. A send makes at
most eight requests to `https://api.buffer.com`, each with the `BUFFER_API_KEY` bearer token:

1. **Channel check (read-only).** `channel(input: { id })` must answer a LinkedIn channel of type
   `page` (never a personal profile) that is connected, unlocked and has a running queue. The
   `RateLimit` header must leave at least eight requests in every window. Any failure here refuses
   the item before anything exists.
2. **Create.** `createPost` with `schedulingType: automatic` and `mode: shareNow`. Buffer never
   gets `addToQueue`, which would let it pick the time slot, or `customScheduled`: the queue owns
   the window and the runner calls the adapter only inside it. Images go by public HTTPS URL, each
   with the item's alt text.
3. **Verify.** `post(input: { id })` up to three times, five seconds apart, per verify call; the
   runner verifies at most twice. Only status `sent` with an HTTPS `linkedin.com` `externalLink`
   verifies. The link becomes the receipt's permalink.

The runner's claim, idempotency key and receipts work as they do for Direct Meta. The adapter
remembers the post id per idempotency key within a run. Buffer's `createPost` takes no idempotency
key, so the provider record says `remote-id-only`.

### What an answer means

| Buffer's answer | Meaning | Queue item | Provider receipt |
| --- | --- | --- | --- |
| Sent, with a LinkedIn link | Verified live | `published` | `published` |
| HTTP 429 or `RATE_LIMIT_EXCEEDED` on the check or the create | Refused; nothing created | `failed` | `failed`, health `rateLimitStatus: limited` |
| HTTP 401/403, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` | Refused; nothing created | `failed` | `failed` |
| `InvalidInputError`, `LimitReachedError` (ten scheduled posts a channel on Free), `UnauthorizedError`, `NotFoundError` | Refused; nothing created | `failed` | `failed` (`LimitReachedError` also sets `planLimitStatus: limited`) |
| Timeout, HTTP 5xx, unreadable body, `UNEXPECTED`, `UnexpectedError`, `RestProxyError`, an unknown error type | Ambiguous; a post may exist | `needs_reconciliation` | `ambiguous` |
| Created, then status `error`, `draft`, `needs_approval`, or not `sent` after the reads | Ambiguous until reconciled | `needs_reconciliation` | `ambiguous` |

A refused post (`ProviderRejectedError`) fails for owner review: nothing resends it, and
`providerReceiptResendDecision` answers `owner-review`. Either way the runner pauses the connection
and the venture, and the send phase exits with code 2. The workflow records that code, validates and
commits the run's statuses, receipts and pauses, and only then fails the job, so the owner sees it
and the state that stops a resend is on the branch. Error text is one bounded
line of Buffer's message; the key and the channel id are redacted, and no request or response body
is stored.

### Format rule

`BUFFER_LINKEDIN_FORMAT` in `buffer.ts` is `single-image`: slide one as the image, the caption, and
the item's destination with its own UTM fields appended, unless the caption already carries the
full destination link. A bare `devshark.app` in a signature does not count, because it carries no
UTM fields. After the live test confirms that Buffer hands LinkedIn several images from the API,
the constant becomes `multi-image`: every slide (LinkedIn allows two to twenty) with the caption as
approved. A composed text over 3,000 characters is a publish hold (`platform-text-limit`) before any
request: it fails nothing and pauses nothing, and an edit that supersedes the item fixes it. Every
place that bounds a LinkedIn caption counts the blank line and tracked link first
(`orchestrator/src/social/linkedin-text.ts`, mirrored in `site/src/lib/admin-queue/linkedin.ts`):
the marketingShark room keeps 400 characters free (`LIMITS.linkedinTotalChars` is 2,600), and the
Queue's editor allows 3,000 less that item's own link. Images must be JPEG or PNG.

Image URLs come from the frames the runner proved for the run (#570 hands them to `publish` as its
fifth argument): the adapter uses exactly those URLs and refuses, before any request, a frame the
runner did not prove. There is no fallback: a caller that hands no frames can send text alone, and
an image item from it is refused. Buffer fetches an image when the post goes out, so a URL must
stay reachable; a jsDelivr URL pinned to a commit does.

### Limits, cost and exit

- **Plan:** Buffer Free. Three channels, one API key, ten scheduled posts per channel at a time.
  One channel is used.
- **Requests** (developers.buffer.com, read 2026-09-25): 100 per 15 minutes, 250 per 24 hours and
  3,000 per 30 days on Free. The record budgets to the lower audited reading of 100 per 24 hours;
  one post a day costs at most eight.
- **Cost:** $0. No upgrade is authorized. Zernio (about $6 a month) or a paid Buffer plan needs a
  treasury ledger line and the owner's approval first.
- **Exit:** revoke the API key in Buffer under Settings, API; retire the binding; keep the
  canonical queue and receipts. LinkedIn then stays held until another transport is decided.
- **Health probe:** the channel check above, `probeBufferLinkedInChannel`, one read-only request.

### The live test (owner)

The test decides the format rule, and it posts once to the devShark LinkedIn Page, so only the
owner runs it, after connecting the Page in Buffer:

1. In the Buffer API Explorer (developers.buffer.com/explorer.html), signed in with the devShark
   Buffer account, send `createPost` for `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN` with
   `schedulingType: automatic`, `mode: shareNow`, a short caption and two `assets` entries, each
   `{ image: { url, metadata: { altText } } }` pointing at committed devShark PNG frames.
2. Read the post back with `post(input: { id })` and open its `externalLink`.
3. Record here: the date, whether LinkedIn shows both images as one multi-image post, and the
   channel's `type` as the channel query reports it.
4. Two images shown: set `BUFFER_LINKEDIN_FORMAT` to `multi-image`. One image or an error: keep
   `single-image`. Either way, set Buffer's `verdict` to `enabled` in `config/social-providers.json`
   (it serves LinkedIn only) and tick B4 in `state/decisions/2026-09-26-devshark-social-queue.md`.

Result: not yet run.

### Test fixtures

`orchestrator/tests/fixtures/buffer/` holds the answers the tests replay: a Page channel, a personal
profile, a low quota, a created post, sending, sent and failed read-backs, a 429, `UNAUTHORIZED`,
and the typed errors. Each names the Buffer documentation page it was transcribed from; no live
call recorded them. `social-buffer.test.ts` covers create, verify, ambiguous and rate-limited
answers, and `social-buffer-runner.test.ts` shows the runner holding the item while the binding is
held and sending once when every gate is open.

## The direct LinkedIn adapter (later; not built)

A direct adapter would post as the Company Page through LinkedIn's Community Management API.
Nothing calls it. `api.linkedin.com` is allowlisted and `LINKEDIN_API_VERSION` named in
`.env.example` only to reserve the path. What it would take, read 2026-09-25 on
learn.microsoft.com/linkedin:

- **Access.** The Community Management API serves registered legal organizations with commercial
  use cases only. The request needs a verified business email, the organization's legal name,
  registered address, website and privacy policy, and a LinkedIn Page associated with the same
  organization. Development tier comes first, then a separate Standard tier review; a rejected app
  cannot re-apply and needs a new app. The second handoff (finding 3) adds that review takes weeks
  to months and that the Development tier expires after twelve months.
- **Scopes.** `w_organization_social` to post as the Page; `r_organization_social` to read. The
  signed-in member must hold one of the Page's admin roles. `linkedin-oauth` is the connection's
  login mode.
- **Tokens.** Access tokens last 60 days. Programmatic refresh tokens last 365 days and exist only
  for approved Marketing Developer Platform partners; after that the member re-authorizes.
- **Posting.** `POST https://api.linkedin.com/rest/posts` with the headers
  `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. A `201` carries the post id
  (`urn:li:share:...`) in `x-restli-id`. Versions ship monthly and stay supported at least a year.
- **Images.** `POST /rest/images?action=initializeUpload` with the organization as owner returns an
  `uploadUrl` and an image URN; the binary goes to that URL. JPG, GIF or PNG under 36,152,320
  pixels. A multi-image post carries two to twenty image URNs.

## Explicit provider migration and rollback

A provider change is an append-only owner-governed handoff:

1. Pause the old binding so it accepts no new sends.
2. Reconcile every publishing, accepted or ambiguous item and record the receipt references.
3. Add a new `draft` or `held` binding with `previousBindingRef`; add the old binding's matching
   `supersedingBindingRef`.
4. Verify provider capability, connection platform, version, credentials, scopes, limits, health
   and owner authority.
5. Activate only the new binding. The registry rejects a second active binding for the same
   connection.
6. Retire the old binding after the observation window; never delete its receipts or binding
   history.

Rollback follows the same direction: pause the new binding, reconcile its in-flight work, create
or restore a held successor record pointing to the retained Direct Meta binding, and require fresh
owner activation. A failed provider never triggers automatic fallback, content mutation, resend,
plan change or purchase.

## Owner-only setup and stop controls

`docs/NEEDED.md` owns the external `SOCIAL-DISTRIBUTION-CONNECTION-001` checklist: verify the real
account and scopes, complete OAuth outside the repository, install credential values, confirm
token renewal and App Review, record provider limits and cancellation, then countersign the exact
routine scope. Until that evidence exists, held/draft behavior is the correct production result.

The protected Social Profiles **Providers & automation health** section shows dated provider
verdicts, versions, revalidation dates, binding/health state, allowlisted credential reference
names, normalized receipts and migration evidence. It cannot finish OAuth, install a secret,
activate a paid provider, switch a plan or purchase anything.

Removing an optional provider means retiring its binding, revoking its narrow credential or
webhook outside the repository, and retaining canonical history. Direct/manual held operation
remains available; it is recommended to the owner but is never executed as silent failover.
