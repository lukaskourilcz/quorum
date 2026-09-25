# Second handoff, 25 September 2026: the devShark social queue

Read this before touching the repository. It is written for the implementation agents that
follow. It records what the owner asked for on 25 September 2026, what the research and the
repository sweep found, the design that follows, and the order of work. Each step is one GitHub
issue in `lukaskourilcz/quorum`; the index is in section 8. The companion document in
`lukaskourilcz/react-express-app` (`SECOND-HANDOFF-25-9-2026.md`) covers devShark itself:
Premium at 3.99 a month, coins, merchandise through Spreadshop, the leaderboard and the
challenges. Read its section 0 once; two of its facts change what marketingShark may claim.

The kickoff issues of the same morning (#555 to #567, label `kickoff-25-9-2026`) still stand.
Three of them are prerequisites here: #556 (the devShark carousel fits the canvas), #561
(Design Lab lists operating ventures) and #562 (GoVIRAL edges to devShark). `HANDOFF.md`
(30 August) and `HANDOFF-2026-09-15.md` are history and can be deleted once `docs/NEEDED.md`
carries their open items.

## 0. What the owner asked for

Once the devShark profiles exist on LinkedIn, Instagram and Threads, BoardlessAI produces their
content through the Design Lab, marketingShark and GoVIRAL. Inside the admin, a **Queue**
workspace lists every social post that waits for approval. The owner can edit a post's text in
place or open it in the Design Lab to change the graphic. The moment the owner approves a post
it is published to its platform without another manual step.

## 1. What the research and the sweep found

1. **Nothing has ever shipped for devShark.** Every `ms-daily` room since 8 August ended
   `NO_ACTION`: first the reply was truncated, since 16 September the render clips two slides
   (`render-failed`, #556). `state/marketingshark/ledger.json` has no brand entry. Fixing #556
   comes before anything in this document.
2. **A latent defect will break the gate on the first success.** marketingShark writes queue
   v1 items with `venture: "marketingshark"`; `legacyQueueMappings` in
   `config/social-publisher-registry.json` has no entry for it, so `migrateLegacyQueueItem`
   throws inside `auditSocialDistributionMigration`, and
   `orchestrator/tests/social-migration-audit.test.ts` runs against the real `state/social`
   and pins the legacy queue to four items. The first drafted package would turn `pnpm test`
   red in the post-cycle gate. Step B1 makes marketingShark write queue v2 and registers the
   mapping.
3. **LinkedIn exists nowhere first-party.** Every platform enum is `["instagram","threads"]`;
   the channel registry schema has `.length(2)`; the network allowlist has no
   `api.linkedin.com`; no decision names LinkedIn. Posting as a Company Page through
   LinkedIn's own API needs the Community Management API: vetting reserved for "registered
   legal organizations", business email on the company domain, weeks to months of review, a
   Development tier that expires after twelve months, tokens that die every 60 days unless
   refresh tokens are granted. Not a launch path. Buffer's free plan (three channels, API on
   every plan, 3,000 requests per 30 days) holds the LinkedIn, Instagram and Threads approvals
   and costs nothing; it is already the "held optional small-portfolio adapter" of
   `state/decisions/2026-08-27-social-distribution-operating-decision.md`. Zernio (formerly
   Late) is the paid alternative at about 6 USD a month for three accounts with presigned
   uploads and SOC 2. The all-in cap leaves about 6 USD a month after Apify, so Buffer first.
4. **Instagram and Threads need public image URLs.** The Direct Meta adapter builds them from
   `PUBLIC_SITE_URL` + `/social/...`, but `site/public/social/` does not exist, site deploys
   are manual (`git.deploymentEnabled: false`), Threads posting is text-only and marketingShark
   renders SVG. Both repositories are public, so committed PNGs can be served through jsDelivr
   at a commit-pinned URL (`https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@<sha>/site/public/social/...`)
   at no cost; Vercel Blob is the fallback if that ever fails. Instagram accepts JPEG only,
   8 MB, aspect 4:5 to 1.91:1, width 320 to 1440; Threads JPEG or PNG; LinkedIn takes a
   binary upload and needs no URL.
5. **Meta forbids paying for follows.** The Community Standards on spam prohibit "offering to
   provide anything of monetary value in exchange for engagement" and "requiring users to
   engage … to gain access to specific, exclusive content", and LinkedIn forbids artificial
   engagement. No API can verify that a user follows a page. devShark's handoff turns the
   "first coins for following" idea into links without a reward, a welcome grant and a
   referral grant; the click-through grant exists behind a setting that defaults to zero. For
   this repository the consequence is a rule: **no post, caption or hashtag may promise coins,
   discounts or access for following, liking, sharing or commenting.** Add it to
   `config/marketingshark.json` `neverClaim` and to `orchestrator/prompts/marketingshark/craft.md`.
6. **devShark is no longer free and no longer bilingual.** The fact sheet in
   `config/marketingshark.json` says "free, bilingual (English and Czech)" and forbids naming
   a price. After the devShark handoff ships, devShark is free to start (HTML, CSS and
   JavaScript) with Premium at 3.99 a month, and the app ships English only. The Czech
   carousel (`carousels.cs`) has no product to point at; keep the bilingual rendering path
   for other brands but disable Czech for devShark. The fact sheet changes only when the
   owner confirms the live facts (an owner item in both handoffs).
7. **The capability map has no path for devShark content.** There is no
   `marketingshark → design-lab`, no `marketingshark → social-distribution` and no
   `goviral → marketingshark`; `render-summary-edges.test.ts` asserts that marketingShark is
   refused a deck render; the `devshark` node carries `maximumPayloadClass: "none"`.
   `CAROUSEL_SUMMARY_VENTURES` excludes devShark and marketingShark, and the Design Lab's
   recipe route rejects them.
8. **The admin has no queue surface.** No route reads or writes `state/social/queue`.
   Per-item approval exists for Door Money, Kvórum and social campaigns, each through a
   same-origin owner-only route that appends an event file via the GitHub Contents API
   (`BOARDLESSAI_GITHUB_TOKEN`) or the local filesystem in development. The Design Lab has
   no per-item deep link (selection is client state). The social publisher runs on
   `workflow_dispatch` only; its schedule is commented out and `ci-policy.test.ts` pins that,
   along with both channels staying `draft` with `enabledByHumanAt: null`.

## 2. Target shape

```
marketingShark (07:00 room)  ─┐
Design Lab (render, $0)      ─┼─▶ queue v2 items, status draft  ─▶  /admin/queue
GoVIRAL (Monday brief, edge) ─┘   state/social/queue/<id>.json        │
                                                                      │ approve (event + status → queued)
                                                                      │ edit (superseding item)
                                                                      │ open in Design Lab (deep link)
                                                                      ▼
                            workflow_dispatch social-publisher.yml (from the admin action)
                                                                      │
                            runner: kill switch · channel · profile/connection · cadence · checks
                                                                      │
                     ┌────────────────────────────────┬───────────────┴──────────────┐
              Direct Meta: Instagram             Direct Meta: Threads          Buffer: LinkedIn Page
              (JPEG carousel, jsDelivr URLs)     (text + images)               (multi-image or single image + link)
                                                                      │
                            receipts: state/social/posts, provider-receipts, provider-health
```

Every existing lock stays: `SOCIAL_KILL_SWITCH`, the channel's `mode` and `enabledByHumanAt`,
the per-profile connection activation, per-venture activation, cadence, immutable content hash,
two-phase publish with reconciliation. The Queue workspace adds an owner action that moves an
item from `draft` to `queued` with provenance; it does not add a fourth way to send.

## 3. Steps

### B1. marketingShark writes queue-ready packages

Depends on #556. Change `orchestrator/src/ventures/marketingshark/`:

- `queue.ts` writes **queue v2** (`CapabilityAwareQueueItemSchema`): `sourceVentureId:
  "marketingshark"`, `releaseId` = the package id, `target` bound to one of the three devShark
  profiles (B2), `action: "publish-original"`, `sourcePackage` referencing the package as an
  `approved-publish-package/1` artifact with its hash, checks `pending`, `selectedBy: "MAKO"`,
  the window as today. One item per platform: LinkedIn, Instagram, Threads. English only for
  devShark (finding 6); the Czech branch stays available to other brands.
- Register `marketingshark` in `legacyQueueMappings` so the four-item audit keeps passing,
  and add a migration-audit test that reads a marketingShark v2 item.
- `render.ts` produces PNG per slide beside the SVG (`renderCarouselSlidePng` exists in the
  studio) and writes them under `site/public/social/devshark/<date>/<locale>/<slide>.png`
  (already inside the cycle's `runtime_paths`, and `ci.yml` skips builds for that path). JPEG
  copies for Instagram (`sharp`, quality 90, sRGB, 1080 × 1350). Record every file hash in the
  package's `render` block.
- The package gains `descriptions.linkedin.en` (≤ 3,000 characters, no hashtags beyond three,
  a first line that works as a hook because LinkedIn truncates) and `altText` per slide
  becomes required. CHUM's packet (`packet.ts`) states the per-slot character budgets from
  #556 and the LinkedIn slot. The skill rule "never copy text unchanged across channels"
  applies: three captions, one carousel.
- Capability map `config/venture-capabilities.json` → `mapVersion 1.4.0` with three edges:
  `marketingshark → design-lab | bounded-render-summary | bounded-render-summary/1 | allowed`
  (enforcement `orchestrator/src/studio/render-access.ts`), `marketingshark →
  social-distribution | approved-publish-package | approved-publish-package/1 | allowed`
  (enforcement `orchestrator/src/social/publisher-targets.ts`), and the `goviral →
  marketingshark | intelligence-read | goviral-intelligence-packet/1` edge of #562. Governing
  decision: `state/decisions/2026-09-26-devshark-social-queue.md` (write it, status
  `proposed`; the owner countersigns). Update `venture-capability.test.ts` (map version,
  edge lists), `render-summary-edges.test.ts` (marketingShark now allowed), and the
  `devshark` node's `maximumPayloadClass` to `internal-marketing-artifact`.
- `config/marketingshark.json`: add the never-claim rule of finding 5; leave the free and
  bilingual claims until the owner confirms the live facts (owner item), but make the fact
  sheet a dated block so the change is one edit.

Acceptance: a dry `ms-daily` run writes one package, three v2 queue items, PNG and JPEG
frames with hashes; `pnpm test` stays green including the migration audit; nothing is sent
(`marketingshark-nothing-posts.test.ts` keeps its assertions except the `.env.example` name
ban, which B2 lifts with the decision).

### B2. devShark profiles, connections and the LinkedIn platform

- `orchestrator/src/contracts/social-distribution.ts`: `SocialPlatformSchema` gains
  `"linkedin"`; `ApprovedSocialScopeSchema` gains `w_organization_social`,
  `r_organization_social` and a `provider-managed` marker for aggregator connections;
  `connector.loginMode` gains `linkedin-oauth` and keeps `provider-oauth`. Mirror the enum in
  `social-provider.ts`, `social-inventory.ts` and `social-operations.ts`. `config/channels.json`
  gains a third channel `linkedin` (`connector: "buffer_linkedin"`, `mode: "draft"`,
  `nativeFormats ["text","image","multi-image","document"]`, `maxOrganicPostsPerDay 1`,
  `minHoursBetweenPosts 20`, `enabledByHumanAt: null`) and the registry schema's
  `.length(2)` becomes `.length(3)`.
- `config/social-publisher-registry.json`: three profiles `social-profile-devshark-linkedin`,
  `-instagram`, `-threads` (role `primary`, owner `marketingshark`), three connections, all
  `held` with `enabledByHumanAt: null`, credential **reference names** only:
  `DEVSHARK_INSTAGRAM_USER_ID`, `DEVSHARK_INSTAGRAM_ACCESS_TOKEN`, `DEVSHARK_THREADS_USER_ID`,
  `DEVSHARK_THREADS_ACCESS_TOKEN`, `BUFFER_API_KEY`, `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN`.
  `config/social-providers.json`: one held `direct-meta` binding per Meta connection and one
  held `buffer` binding for LinkedIn. Update the pinned counts in
  `social-publisher-targets.test.ts` (8 → 11 profiles, 6 → 9 connections) and
  `social-providers.test.ts` (6 → 9 bindings).
- `state/social/activation.json`: the `SocialActivationSchema` keys gain `marketingshark`
  (health counter: packages drafted, minimum three before any live send, mirroring the
  ten-article rule of `social-2026-08a`).
- `.env.example`: the six reference names above plus `LINKEDIN_API_VERSION` for a later
  direct adapter. `marketingshark-nothing-posts.test.ts` bans `DEVSHARK` in that file today;
  change the assertion to "names only, never values" in the same commit as the decision
  record, and say why in the commit body.
- `config/network-allowlist.json` `runtimeHosts`: `api.buffer.com`, `cdn.jsdelivr.net`
  (for the self-check that an asset URL resolves before a send), and `api.linkedin.com`
  reserved for the direct adapter.

Acceptance: the registry parses, `resolvePublisherTarget` answers `held` for all three
devShark connections, unknown edges still fail closed, `pnpm test` green.

### B3. Public image URLs for Meta fetches

`orchestrator/src/social/media/assets.ts` (new): given an asset path under
`site/public/social/`, resolve the commit that carries it (`git log -1 --format=%H -- <path>`
in the runner's checkout, which runs after the cycle commit) and return
`https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@<sha>/site/public/social/<rest>`. Before a
send, `HEAD` the URL through the allowlisted host and require 200 with `image/jpeg` or
`image/png`; a miss holds the item with reason `asset-unreachable` and never falls back to a
guessed URL. Keep `PUBLIC_SITE_URL` as an alternative base behind `SOCIAL_ASSET_BASE` =
`jsdelivr | site | blob`; `blob` is the Vercel Blob fallback (`BLOB_READ_WRITE_TOKEN`) for a
later session and is not built now. Retention: prune `site/public/social/` older than 90 days
in the cycle's queue-health step; receipts keep the hashes.

### B4. LinkedIn transport through Buffer

`orchestrator/src/social/buffer.ts` (new): a `PublishAdapter` for the `buffer` provider that
creates a post through Buffer's GraphQL API (`createPost` with `channelId`, text,
`schedulingType: "automatic"` or `dueAt` for a window, assets by public URL) and verifies it by
reading the post back; idempotency through the runner's two-phase claim as today; an
inconclusive answer becomes `needs_reconciliation` exactly like Direct Meta. Format rule for
LinkedIn: the five-slide carousel goes as a **multi-image post** (LinkedIn's organic carousel
is document or multi-image) if Buffer's API accepts several assets in a live test; otherwise
slide one as a single image with the caption and the devShark link. Record the live test's
result in `docs/SOCIAL-PROVIDERS.md` and raise the Buffer verdict from "held optional" to
"active for LinkedIn only". `social-provider/1` record for Buffer with limits (100 requests
per 24 hours on the lower reading, 3,000 per 30 days, 10 scheduled posts per channel on Free),
cost 0, exit (revoke the API key). The direct LinkedIn adapter (Community Management API,
`/rest/posts`, `initializeUpload`, `Linkedin-Version` header) is documented as the later path
in the same doc with the vetting facts from finding 3, and not built.

### B5. Threads images and Instagram JPEG in the Direct Meta adapter

`orchestrator/src/social/meta.ts`: Threads `IMAGE` and `CAROUSEL` containers
(`is_carousel_item`, `children`, the 30-second wait before `threads_publish`, status polling),
and Instagram carousels that reference the JPEG copies from B1 (Instagram rejects PNG). Remove
the "text only" guard in `assertQueueItemPublishable` for Threads once the adapter supports
images, and add the `threads_publishing_limit` and `content_publishing_limit` reads before a
send (quota_usage must be below quota_total). Tests with recorded fixtures for both flows.

### B6. The Queue workspace

**Read boundary.** `site/src/lib/admin-queue.ts` (server-only) `readAdminQueue():
AdminQueueSnapshot`: reads every `state/social/queue/*.json` (v1 through the registry
mapping, v2 directly), the matching receipts, provider health and pause files, and returns
bounded view models grouped by status: `waiting` (draft), `scheduled` (approved, queued),
`sending` (publishing), `sent` (published, with permalink), `failed` (failed,
needs_reconciliation, with the sanitised reason), `held` (cancelled, expired, held by a gate),
plus `unreadable` and `dropped` counts. A view model carries: id, source venture, platform,
locale, content kind, caption (per platform), alt text, hashtags, frame count, publish window,
status, checks, `contentHash`, `supersedes` / `supersededBy`, the Design Lab href, the receipt
permalink. Filters: venture (devShark first, then DNESKAi and the rest), platform, status.
No token values, no raw provider payloads, no filenames cross to the client.

**Frames.** `GET /admin/api/queue/frame/[itemId]/[slide]` serves the PNG from
`site/public/social/...` (or renders on demand from the package's render summary for items
without persisted frames), owner-only like every admin route.

**Panel.** `site/src/components/admin/queue-panel.tsx` (client) with one card per item:
frame strip (first three frames, the rest on expand), platform icon and profile handle,
caption in a bounded editor (LinkedIn 3,000, Instagram 2,200, Threads 500; counter, no
formatting), alt text field, window, checks as a row of six small states, and the actions:
**Approve and publish now**, **Approve for the window**, **Edit** (enters the editor; Save
creates the superseding item), **Hold**, **Reject** (reason), **Open in Design Lab**,
**Re-render** (after a Design Lab change). Empty state: "Nothing is waiting. marketingShark's
next room sits at 07:00." Write-disabled state (no `BOARDLESSAI_GITHUB_TOKEN`): the existing
banner and disabled buttons. Failed and reconciliation items show the next safe action in one
sentence. Follow `docs/ADMIN-DESIGN-SYSTEM.md`; `pnpm admin:design-audit` must pass. Widths
360 to 1728 in both themes, keyboard, reduced motion, per `docs/ADMIN-VISUAL-QA.md`.

**Actions route.** `POST /admin/api/queue/actions` with body `{ action, itemId,
expectedContentHash, reason?, edits?: { caption?, altText? }, mode?: "now" | "window" }`.
Same-origin, owner-only, content-length cap, the `expectedContentHash` guard (409 on a
mismatch, like the campaign actions). Each accepted action appends one
`social-queue-event/1` file under `state/social/queue-events/<timestamp>-<itemId>-<action>.json`
(new contract in `contracts/` with valid and poison fixtures; `contracts.test.ts` requires
both) and updates the item:

- `approve`: the deterministic checks run (`schema`, `duplicate`, `accessibility` = alt text
  present, `budget` = zero cost, `capability`, `authority`); the owner's approval is recorded
  as the evidence for `brand`, `claims`, `quill`, `keeper` and `policy` with
  `approvalProvenance.approvalRef` = the event id; status becomes `queued`; `mode: "now"`
  narrows the window to the next hour.
- `edit`: writes a new item `<id>-r<n>` with the edited fields, a recomputed hash,
  `supersedes: <id>`; the original becomes `cancelled` with reason `superseded`. An edit never
  changes an approved item in place: approval binds a hash.
- `hold`, `reject`: status `cancelled` with the reason; `reject` also writes a taste note the
  marketingShark ledger can read.
- `rerender`: invokes the same render path as B8 and then behaves like `edit`.

Persistence goes through the GitHub Contents API or the local filesystem exactly as
`caught-up-events-store.ts` does; add the queue directory to the writer's allowlist and to the
cycle's `runtime_paths` (`state/social` is already there).

**Navigation.** `admin-sections.ts` gains "Queue" (`/admin/queue`, icon in the sidebar map,
badge with the `waiting` count); add `/admin/queue` to `canonicalDestinations` in
`admin-navigation-qa.spec.ts` and `admin-shell.spec.ts`; the Overview's "Waiting for you"
lists "N posts wait in the Queue". `pnpm docs:refresh` if the registry changes.

**Tests.** Snapshot loader (missing directory, malformed item counted, v1 mapped, v2 read);
actions (hash guard, supersede chain, the event file shape, write-disabled refusal); the
panel's states with the existing testing pattern; one e2e write journey behind the opt-in gate.

### B7. Approval dispatches the publisher

`site/src/lib/queue-dispatch.ts`: after a successful `approve`, call the GitHub REST
`POST /repos/lukaskourilcz/quorum/actions/workflows/social-publisher.yml/dispatches` with
`inputs.validate_only=false`, using `BOARDLESSAI_GITHUB_TOKEN` (the token needs `actions:
write`; today it has `contents: write`, an owner item). The runner already treats `queued`
items inside their window as due. The response to the owner says "Queued. The publisher runs
within a few minutes" and the card shows `sending` on the next snapshot. Leave the workflow's
schedule commented out; a later decision may enable an hourly run for windowed items, and
`ci-policy.test.ts` pins the current posture until then. Latency target: under five minutes
from click to permalink. If the dispatch fails, the item stays `queued` and the card says so;
the next dispatch or the daily backstop picks it up.

### B8. Design Lab: edit a devShark package and re-render

- `studio/src/summary.ts` and the site's `carousel-summaries.ts`: add `devshark` to the
  summary ventures so a marketingShark package can carry a `carousel-summary/1`, and update
  the two architecture tests that pin the literal venture list
  (`kvorum-design-lab-architecture.test.ts:43`, `door-money-design-lab-architecture.test.ts:45`).
- Per-item deep link: `/admin?venture=design-lab&tab=studio&brand=devshark&article=<venture:slug:date>`
  selects that article on load (today the selection is client state).
- A package-backed article kind in `design-lab-workspace.tsx`: the marketingShark templates
  render it (the existing `render.ts` path, not the family system), the editable fields are
  slide headline, body and alt within `LIMITS`, and Save re-runs the clip gate before writing
  `slide-overrides.json`. "Send to Queue" produces the PNG and JPEG frames and a superseding
  queue item (B6 `rerender`).
- Studio: `CarouselFormatSchema` gains `linkedin-square` (1080 × 1080) for LinkedIn
  multi-image posts; `pnpm -C studio build` and `fonts:metrics` untouched.

### B9. More than one post kind, and the GoVIRAL edge

After B1 to B7 work for the daily quiz carousel, widen what marketingShark drafts inside the
same envelope (one paid call per brand per day, 0.10 USD): rotate by weekday. Monday and
Thursday: the quiz carousel. Tuesday: a feature spotlight (one screen of devShark, factual,
from the fact sheet). Wednesday: a challenge teaser (an Easy challenge's prompt and the first
hint; never the solution). Friday: a "this week on devShark" note with the trend hook that
GoVIRAL's packet supplies (#562; the packet carries velocity and evidence refs, never copy).
Saturday and Sunday: no room. Each kind is a `hookPattern` and a `templateMap` entry in
`config/marketingshark.json`, one prompt section in `craft.md`, and a fixture package proven by
the render test. The premium launch announcement is one hand-written package the owner approves
from the Queue on launch day, after devShark's D3 ships and the fact sheet is updated.

## 4. Activation posture

Building all of the above sends nothing. These tests pin the current posture and change
**only in the commit that records the owner's countersigned decision**
(`state/decisions/2026-09-26-devshark-social-queue.md` moving to `countersigned`):
`ci-policy.test.ts` (channels `draft`, schedule commented out), `marketingshark-nothing-posts.test.ts`
(nothing publishes even in an unlocked world; keep that assertion, it is about the code path),
`social-publisher-targets.test.ts` (held connections). Activation then means, in order:

1. The owner creates the three profiles (section 5) and connects them in Buffer (LinkedIn) and
   in a Meta developer app (Instagram with Instagram Login, Threads), as testers of the owner's
   own app, so no App Review is needed.
2. Secrets in GitHub Actions under the reference names of B2; `SOCIAL_KILL_SWITCH=false`;
   `vars.SOCIAL_KILL_SWITCH` likewise.
3. `state/INBOX.md`: `HUMAN_APPROVAL DEVSHARK-SOCIAL-001` ("connect and activate the three
   devShark connections; Buffer for LinkedIn; autopublish of owner-approved Queue items only";
   what it approves, exactly) and `DEVSHARK-SOCIAL-002` for the channel `mode: "autopublish"`
   flip. The owner ticks them in their own commit.
4. `config/channels.json` and the registry flip to `autopublish` with `enabledByHumanAt`;
   `activation.json` shows `marketingshark: enabled` after three drafted packages.

Cost: 0 USD for transport (Buffer Free, Direct Meta, jsDelivr); marketingShark stays at about
0.04 USD a day; nothing new touches `state/treasury/ledger.json`. Zernio at about 6 USD a month
is the only paid alternative and needs a ledger line first.

## 5. Owner items (copy into `docs/NEEDED.md`)

- [ ] **Countersign `state/decisions/2026-09-26-devshark-social-queue.md`** after reading sections 3 and 4. [imp:5] [owner:me] [time:20m] [kind:decision]
- [ ] **Create the devShark profiles**: a LinkedIn Company Page (desktop or iOS; you become super admin), an Instagram professional account (Business or Creator, no Facebook Page needed with Instagram Login), a Threads profile signed in through that Instagram account. Handles are yours to pick; check availability logged in (anonymous requests redirect). Record the URLs here and in devShark's `client/product-catalog.ts`. [imp:5] [owner:me] [time:1h] [kind:setup]
- [ ] **Buffer Free account**: connect the LinkedIn Page as super admin or content admin, create the API key, note the channel id, store `BUFFER_API_KEY` and `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN` as Actions secrets. [imp:4] [owner:me] [time:30m] [kind:setup]
- [ ] **Meta developer app** (Business type) with the Instagram use case (Instagram Login) and the Threads use case; add the devShark accounts as testers and accept the invitations; generate the 60-day tokens; store `DEVSHARK_INSTAGRAM_USER_ID`, `DEVSHARK_INSTAGRAM_ACCESS_TOKEN`, `DEVSHARK_THREADS_USER_ID`, `DEVSHARK_THREADS_ACCESS_TOKEN`. Calendar the refresh: Instagram and Threads tokens refresh through the API when older than 24 hours and expire after 60 days without it. [imp:4] [owner:me] [time:45m] [kind:setup]
- [ ] **Give `BOARDLESSAI_GITHUB_TOKEN` the `actions: write` permission** so an approval can dispatch the publisher. [imp:4] [owner:me] [time:5m] [kind:setup]
- [ ] **Tick `HUMAN_APPROVAL DEVSHARK-SOCIAL-001` and `-002`** in `state/INBOX.md` when the connections are live and the first three drafted packages exist. [imp:5] [owner:me] [time:10m] [kind:decision]
- [ ] **Confirm devShark's live facts for the fact sheet** (free tier contents, Premium price, English only) once devShark's handoff ships, then edit `config/marketingshark.json`. [imp:3] [owner:me] [time:15m] [kind:content]
- [ ] **Run the Buffer live test** with one multi-image LinkedIn post from the API before B4 is marked done; record the result. [imp:3] [owner:me] [time:15m] [kind:setup]

## 6. Order of work

| Step | Depends on | Parallel with |
| --- | --- | --- |
| #556 (kickoff) | nothing | |
| B1 packages and capability edges | #556 | B2, B3, B6 |
| B2 profiles, connections, LinkedIn platform | nothing | B1, B3 |
| B3 image URLs | nothing | B1, B2 |
| B4 Buffer adapter | B2 | B5 |
| B5 Threads images, Instagram JPEG | B1, B3 | B4 |
| B6 Queue workspace | B1 (items to show) | B4, B5 |
| B7 dispatch on approve | B6 | |
| B8 Design Lab editing | B1, B6 | B7 |
| B9 more post kinds and #562 | B1 to B7 in production | |

Git: one branch per step, small commits with the step id in the subject
(`B6: read the social queue behind one server boundary`), merge to `main` when the root gate
is green (`pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm docs:check`), delete the branch. Merging to `main` does not deploy; the admin changes
reach the live site only after `pnpm deploy:check` and `pnpm deploy:production`, which need the
owner's Vercel credentials (#527).

## 7. Cross-repository contract

| devShark needs from BoardlessAI | BoardlessAI needs from devShark |
| --- | --- |
| the three profile URLs for `client/product-catalog.ts` | the live facts for the fact sheet (free tier, price, English only) |
| nothing at runtime; devShark promotes no other product and links to its own profiles only | `lib/webdev-bank.ts` as pinned by #218 |
| | the difficulty labels of D5, so challenge teasers can say "Easy" |

## 8. Issue index

Every issue carries the label `second-handoff-25-9-2026` and quotes its step id in its first line.

| Step | Issue |
| --- | --- |
| B1 | #568 |
| B2 | #569 |
| B3 | #570 |
| B4 | #571 |
| B5 | #572 |
| B6 | #573 |
| B7 | #574 |
| B8 | #575 |
| B9 | #576 |

Related, already open: #556, #561, #562 (prerequisites), #552 (DNESKAi LinkedIn carousel;
B2 and B4 give it the platform and the transport), #532 (WebDev Signal handles; a separate
venture, untouched here), #467 (closed; the deck-review pattern B6 generalises).

## 9. Sources

Read on 25 September 2026. LinkedIn:
https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api,
https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review,
https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api,
https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api,
https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens,
https://learn.microsoft.com/en-us/linkedin/marketing/versioning. Instagram and Threads:
https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login,
https://developers.facebook.com/docs/instagram-platform/content-publishing,
https://developers.facebook.com/docs/graph-api/overview/access-levels,
https://developers.facebook.com/docs/threads/posts,
https://developers.facebook.com/docs/threads/get-started/long-lived-tokens. Aggregators:
https://buffer.com/pricing, https://developers.buffer.com/guides/api-limits.html,
https://developers.buffer.com/guides/hosting-media.html,
https://developers.buffer.com/guides/posts-and-scheduling.html, https://zernio.com/pricing,
https://docs.zernio.com/. Hosting: https://www.jsdelivr.com/ (GitHub CDN),
https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/,
https://vercel.com/docs/vercel-blob/usage-and-pricing. Policy:
https://transparency.meta.com/policies/community-standards/spam/,
https://developers.facebook.com/devpolicy/,
https://www.linkedin.com/legal/professional-community-policies.
