# DNESKAi source bridge

Scope: [quorum #598](https://github.com/lukaskourilcz/quorum/issues/598), parent
[own-dashboard #93](https://github.com/lukaskourilcz/own-dashboard/issues/93).
Authority: [2026-10-13 owner request](../state/decisions/2026-10-13-dneskai-own-dashboard-source.md).

BoardlessAI continues to produce and deliver articles. The bridge reads existing editorial
reviews and owner decisions through `approvedEditorialPackage`. It exports the selected Czech
headline, full article body, selected image and recorded citations. It calls no model and creates
no social content. OwnDashboard approves each social revision separately.

## Contract and current-state lookup

The producer uses `marketing-source/1`, documented by OwnDashboard at
`contracts/marketing-source-v1.md`. The DNESKAi-specific JSON Schema here is
`contracts/marketing-source.schema.json`; valid and poison fixtures live in `contracts/fixtures`.
`sourceId` is the article slug. `sourceRevision` is the exact approved edition package hash;
`contentHash` hashes only the content using lexical canonical JSON and SHA-256.

POST `/admin/api/marketing-source` with either:

```json
{"action":"sources","sourceIds":["2026-10-12-silicon-valley-super-intelligence-rebrand"]}
```

or `{"action":"sources"}` to discover the latest 20 statuses. A lookup accepts at most 20 IDs;
discovery reports `excluded`. An inventory exceeding 100 records refuses the HTTP read rather
than returning an incomplete approval inventory. GitHub reads use the existing admin repository
boundary, with bounded parallel requests and no stale fallback after a remote error. Production
requires `BOARDLESSAI_GITHUB_TOKEN`. Unknown, unreadable, conflicting or unapproved sources return
a held/unavailable status and a null packet, or an ineligible tombstone of previously exported
safe content. Discovery also reports actual no-edition dates from edition outboxes and receipts.

Use `Authorization: Bearer <DNESKAI_MARKETING_SOURCE_SECRET>`, `X-Marketing-Timestamp` (Unix
seconds), and `X-Marketing-Signature` (lowercase HMAC-SHA256 of `<timestamp>.<exact raw body>`).
The secret must contain at least 32 characters. The route refuses signatures outside five minutes.
Only this exact admin API path delegates authentication to the integration gate. Other admin
routes retain owner session authentication. The route permits no approval or publication action.

`observedAt` refreshes when the bridge rechecks the current decision. It does not change the
source revision or content hash. Evidence `checkedAt` records the article's generated evidence
snapshot time, because historical article packages retain no per-citation fetch timestamps.
Evidence excerpts contain authored `supports` text where recorded, otherwise an explicit empty
string. The bridge performs no fresh website fact check. News expires 72 hours after that recorded
snapshot; querying or backfilling cannot renew it. OwnDashboard must check eligibility, expiry and
recent source observation before publication.

The image URL names the approved hero on `CAUGHT_UP_SITE_URL`. `image.licence` encodes the full
recorded origin, licence name, author, source URL and attribution HTML as JSON text. Metadata or
article content exceeding the shared contract's limits holds the export; it is not truncated.
The bridge does not prove that magazine delivery has completed or that the image URL is reachable.
OwnDashboard must hold Instagram preparation without a usable final asset.

## Outbox and reconciliation

`pnpm marketing:source -- reconcile` reads real records without writes or network delivery.
`backfill` uses the same current approval gate; historical automatic deliveries grant no approval.
Add `--stage` to persist packets, current source pointers and explicit observations under
`state/marketing-source/`. Add `--send` to send source callbacks, using:

- `DNESKAI_MARKETING_SOURCE_ENABLED=true`
- `DNESKAI_MARKETING_SOURCE_SECRET` (server-only, brand-bound)
- `OWN_DASHBOARD_MARKETING_SOURCE_URL=https://<own-dashboard>/api/marketing/automation`
- `CAUGHT_UP_SITE_URL` (canonical DNESKAi HTTPS origin)

The outbound body is `{"action":"source","packet":...}` with the same signature headers.
The packet key binds source ID, revision and content hash. A successful duplicate produces no
second outbox delivery. Network failures, 429 and 5xx retry after one and five minutes, with three
attempts total. Other failures and exhausted retries remain `reconciliation`. Receipts retain
status codes, not response bodies or credentials. An accepted callback lost before receipt commit
can retry safely because the receiving contract deduplicates this source identity.

The dispatch-only `marketing-source.yml` workflow defaults to inspection. An explicit send first
pushes the staged outbox, sends signed packets, then pushes receipts even after delivery failure.
It shares the cycle concurrency group, honors `state/PAUSED` and exposes no social credentials.
No new scheduled generator or social publisher runs. n8n Cloud can call the HTTP reader for
discovery/rechecks and forward returned packets to OwnDashboard; it needs no local command runner.

Source edits use new package revisions; rejection, stale approval, removed reviews and owner
retractions invalidate prior exports with a new ineligible revision containing the last safe
content. Use `pnpm marketing:source -- retract --source-id <slug> --reason <owner reason>` only
under an owner retraction instruction, then reconcile/send. Existing queued versions remain held
if approval changes between staging and sending. Retracted sources cannot restore themselves.
A no-edition day emits no article packet and creates no fallback story. An evergreen source needs
its own current owner approval and freshness policy before a social draft can use it.

## Calendar and publisher cutover audit

On 2026-10-13 the real dry run found **14 held reviews, zero approved packets, zero dropped review
records**. Five older edition records fail the no-edition receipt/package reader and count as
dropped in the combined dry-run result; they grant no source eligibility. There are no saved
editorial decisions or release receipts in the checkout. The owner
must select and approve an actual article before an eligible real pilot can pass. The generator's
real unapproved review package can be inspected as a held QA reference; it is not publishing proof.

`pnpm marketing:source -- export-calendars --output-dir <empty directory>` exports the complete
original `caught-up.json` and `marketingshark.json` documents plus a manifest with schema version,
repository commit and exact SHA-256 byte hashes. It preserves every field and date, refuses
overwriting output files and changes no calendar state. The parent issue imports and reviews them.

Old social state currently has these holds:

- `social-publisher.yml`: commented hourly schedule and `jobs.publish.if: false`.
- `social-references.yml`: no schedule and `jobs.monitor.if: false`.
- `config/channels.json`: Threads, Instagram and LinkedIn remain `draft`, with no human enable time.
- DNESKAi and devShark publisher-registry connections remain `held`.
- `.env.example`: `SOCIAL_KILL_SWITCH=true`.

Verify the deployed/GitHub variable values and provider account authority during cutover; checked-in
defaults cannot prove live configuration. Retain those old publisher holds, reconcile any already
published or ambiguous remote posts, and ensure only OwnDashboard owns future social publishing.
Do not replay old pending queue items or treat migrated plan/account/template approval as post approval.

After verifying both full imports, brand ownership and the old publisher holds, configure
`OWN_DASHBOARD_MARKETING_CALENDAR_URL=https://<own-dashboard>/marketing` and
`OWN_DASHBOARD_MARKETING_CUTOVER_VERIFIED=true` in the BoardlessAI site. `/admin/calendar` then
redirects to the matching `?brand=dneskai` or `?brand=devshark` route. These settings remain unset/off
in this change. The bridge provisions no secret, changes no paid plan, posts nothing and deploys nothing.
