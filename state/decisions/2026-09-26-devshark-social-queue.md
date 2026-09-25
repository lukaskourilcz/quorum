# The devShark social queue: marketingShark drafts, the owner approves, nothing else sends

Date: 2026-09-26

Decider: Lukas Kouril, owner

Status: proposed

Signature / explicit approval reference: none yet. The owner countersigns by setting the status to
`countersigned` and naming the approval on this line. Until then the record authorizes only the
draft-only work below, and every lock in "What stays held" holds whatever else changes.

Decision id: `devshark-social-2026-09a`

Sources: `SECOND-HANDOFF-25-9-2026.md` (sections 1 to 5), GitHub #568 to #576 (label
`second-handoff-25-9-2026`), #556, #562, `state/decisions/2026-08-27-social-distribution-operating-decision.md`,
`state/decisions/2026-09-25-focus-dneskai-devshark.md`.

## What the owner asked for

Once devShark has profiles on LinkedIn, Instagram and Threads, BoardlessAI produces their posts
through marketingShark, the Design Lab and GoVIRAL. A Queue workspace in the admin lists every post
that waits for approval. The owner can edit a post's text, or open it in the Design Lab to change
the graphic. Approving a post publishes it without another manual step.

## Decision proposed

1. **marketingShark writes queue-ready packages (#568, B1).** One package a day for devShark, in
   English only: devShark ships English only, so a Czech carousel has nothing to point at. The
   Czech path stays available to a brand that names it. Each package carries the five reviewed
   slides as PNG frames and JPEG copies (quality 90, sRGB, 1080 x 1350) under
   `site/public/social/devshark/<date>/en/`, with every file's hash in the package. It carries
   three captions for one carousel: Instagram, Threads and a LinkedIn caption written for LinkedIn.
   Alt text is required on every slide.
2. **Three queue v2 drafts per package**, one per platform, each bound to devShark's own profile
   (`social-profile-devshark-linkedin`, `-instagram`, `-threads`, registered by #569) and carrying
   the package as an `approved-publish-package/1` reference with its hash. Every check starts
   `pending`, and `selectedBy` is `MAKO`.
3. **Capability map 1.4.0** gains `marketingshark -> design-lab` (`bounded-render-summary/1`,
   enforced in `orchestrator/src/studio/render-access.ts`) and `marketingshark ->
   social-distribution` (`approved-publish-package/1`, enforced in
   `orchestrator/src/social/publisher-targets.ts`, which now requires an exact, current capability
   reference on every marketingShark item). The `devshark` node's payload class becomes
   `internal-marketing-artifact`. GoVIRAL's edge to marketingShark stays the one #562 registered,
   on `goviral-trends/1`, because that is the snapshot the room reads. A
   `goviral-intelligence-packet/1` edge waits for B9, which builds the reader it would govern.
4. **The owner's approval is the evidence** for the checks a model cannot pass for itself (brand,
   claims, quill, keeper, policy). The Queue workspace (#573) records it as an event whose id
   becomes `approvalProvenance.approvalRef`, and binds it to the item's content hash. An edit makes
   a new item that supersedes the old one; it never changes an approved item in place.
5. **Transport at $0.** Direct Meta for Instagram and Threads (#572), with image URLs pinned to a
   commit through jsDelivr (#570). Buffer's free plan for the LinkedIn Page (#571); LinkedIn's own
   Community Management API needs a vetting this company cannot pass today and is documented, not
   built. Zernio, about $6 a month, is the only paid alternative and needs a ledger line first.
6. **Frames are committed daily for devShark.** About 250 KB of PNG and 340 KB of JPEG a day.
   DNESKAi's frames wait for an enabled channel (#563); devShark's are written from the first
   draft, so an item approved in the Queue already has public URLs. #570 prunes
   `site/public/social` after 90 days. To reverse it, gate the write on an enabled channel the
   way #563 gates DNESKAi's.

## Rules every post keeps

- No slide, caption or hashtag may promise coins, discounts, access or any reward for following,
  liking, sharing or commenting. Meta's spam standards forbid value in exchange for engagement and
  LinkedIn forbids artificial engagement. The rule is in the craft rules, in the fact sheet's
  `neverClaim`, in every CHUM packet, and in the `engagement-reward` gate.
- Facts come only from the fact sheet block in effect on the run date. No launch date, price or
  user count until the owner adds a block that states one.
- Three captions, one carousel: no channel's text or first line is another channel's.
- One paid call per brand per day inside the $0.10 envelope; `maxOutputTokens` is not raised.
  Frames, gates and queue items cost nothing.

## What #569 registers

- Three `venture-primary` profiles for the devShark brand under the marketingShark venture,
  `proposed` and not live-eligible, each with one held connection. The repository holds
  reference names only: `BUFFER_API_KEY` and `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN` for the
  LinkedIn Page through Buffer, `DEVSHARK_INSTAGRAM_USER_ID` and `DEVSHARK_INSTAGRAM_ACCESS_TOKEN`
  through Instagram Login, `DEVSHARK_THREADS_USER_ID` and `DEVSHARK_THREADS_ACCESS_TOKEN`. The
  values exist only as GitHub Actions secrets the owner sets.
- Held provider bindings: Direct Meta for Instagram and Threads, Buffer for LinkedIn. A
  connection on any transport other than Direct Meta resolves `held` with
  `provider-adapter-unavailable` until #571 builds the Buffer adapter.
- `linkedin` joins the platform enum, with LinkedIn's organization scopes for a later direct
  adapter and a `provider-managed` marker for aggregator connections. `config/channels.json`
  gains a third channel, `linkedin`, in `draft`: one organic post a day, at least 20 hours apart.
- One held, model-free strategy per devShark profile, because every real profile has exactly one.
- `state/social/activation.json` gains a `marketingshark` record: drafted devShark packages
  against a floor of three before any live send, under this decision's id.
- `marketingshark` in `legacyQueueMappings`, so a v1 item it left behind migrates to the profile
  that owns its channel's connection.
- `.env.example` names the six references and `LINKEDIN_API_VERSION`, all with empty values.
  `marketingshark-nothing-posts.test.ts` banned the word `DEVSHARK` there; it now requires every
  `DEVSHARK` and `BUFFER` line to be a bare name with no value.
- `config/network-allowlist.json` gains `api.buffer.com`, `cdn.jsdelivr.net` (checking that an
  asset URL resolves before a send) and `api.linkedin.com` (reserved; nothing calls it).
- Stop condition for the new network: stop on a factual correction a package cannot absorb, a
  platform warning or an owner veto, then roll back as below.

## What #571 builds

- `orchestrator/src/social/buffer.ts`, the LinkedIn transport over Buffer's GraphQL API: a
  read-only channel check (a connected LinkedIn Page, never a personal profile, with requests left
  for a whole post), `createPost` with `shareNow` inside the item's own window, and a read-back that
  verifies only a post Buffer reports sent with its LinkedIn link. Buffer never chooses copy,
  window, profile or experiment.
- A refusal that proves nothing was created (a 429, a refused key, a typed validation or plan-limit
  error) fails the item for owner review; a timeout or an unexplained error holds it for
  reconciliation, as with Direct Meta. Neither resends.
- Until the live test, a carousel goes to LinkedIn as slide one with the caption and the tracked
  devShark link. The test decides whether Buffer carries all five slides as one multi-image post.
- Buffer's provider record: LinkedIn only, the free plan's limits, $0, and the exit (revoke the API
  key). `orchestrator/src/social/provider-platforms.ts` keeps Direct Meta the only transport for
  Instagram and Threads.
- The refusals by name that waited for this transport are gone: the queue item check, the channel
  check and the target resolver's `provider-adapter-unavailable` hold for Buffer. Buffer's verdict
  and its held binding hold LinkedIn instead.
- The direct LinkedIn adapter is documented in `docs/SOCIAL-PROVIDERS.md` as the later path and not
  built.

## What #573 builds

- `/admin/queue`, the Queue workspace, behind one server-only read boundary
  (`site/src/lib/admin-queue.ts`). It lists every queue item, v1 through the registry mapping and
  v2 directly, grouped waiting, scheduled, sending, sent, failed and held, with unreadable and
  dropped counts. No file name, credential reference, token or provider payload reaches the
  browser. "Queue" is in the navigation with the waiting count as its badge, and the Overview
  says how many posts wait there.
- `POST /admin/api/queue/actions`: approve, edit, hold and reject, each bound to the content hash
  the owner was shown, with 409 on a mismatch. Each action appends one `social-queue-event/1`
  under `state/social/queue-events/` before it changes the item. An approval reruns the six
  deterministic checks, records the owner as the evidence for brand, claims, quill, keeper and
  policy, writes the event id as `approvalRef` and sets `queued`. An edit writes `<id>-r<n>` and
  cancels the original, so an approved item never changes in place. Re-render waits for #575.
- The approval stops at `queued`. Dispatching the publisher is #574, and every lock below still
  decides whether anything sends.

## What #574 builds

- `site/src/lib/queue-dispatch.ts`: once an approval is saved on GitHub, the Queue dispatches
  `social-publisher.yml` with `validate_only` off, using `BOARDLESSAI_GITHUB_TOKEN`. The token
  needs Actions write, an owner item. The dispatch is a wake-up and grants nothing: the run applies
  every lock below. Hold, reject and edit dispatch nothing.
- A wake-up that fails keeps the approval. The item stays `queued`, the action response names the
  failure, and approving the same copy again, or a run started from GitHub Actions, retries it
  inside the window.
- The workflow's checkout names `github.ref`. Two approvals a minute apart queue two runs, and the
  second must start from the branch the first left, or it would send the first post again.
- The hourly schedule stays commented out, and `ci-policy.test.ts` is unchanged. An hourly run for
  windowed items is a later decision (`docs/SOCIAL-DAILY-OPERATIONS.md`).
- The workflow does not hand devShark's six credential references to the job yet. marketingShark
  is not a publishing venture, so those `env:` lines belong to the activation commit, beside the
  channel flip, as the paused ventures' lines left the job with their pause.

## What stays held

Building every step of the programme sends nothing. Until this record is countersigned, and
beyond it until the owner performs each activation step below:

- `SOCIAL_KILL_SWITCH` stays the supreme stop.
- Both Meta channels, and the LinkedIn channel #569 adds, stay `draft` with `enabledByHumanAt: null`.
- Every devShark connection stays `held`; no credential value exists in the repository, only
  reference names.
- marketingShark is not a publishing venture; its items are drafts with every check pending.
- Buffer's provider verdict stays `held` until the owner records the live test (#571), so the
  LinkedIn transport cannot send before then, whatever the binding says.

These tests pin that posture and change only in the commit that records this decision as
countersigned: `orchestrator/tests/ci-policy.test.ts` (channels draft, publisher schedule
commented out), `orchestrator/tests/marketingshark-nothing-posts.test.ts` (nothing publishes even
in an unlocked world; that assertion stays, because it is about the code path), and
`orchestrator/tests/social-publisher-targets.test.ts` (held connections).

## Activation, in order

1. The owner creates the three devShark profiles and connects them: Buffer for the LinkedIn Page,
   a Meta developer app with Instagram Login and Threads, with the devShark accounts as testers.
2. Secrets in GitHub Actions under the reference names #569 registers; `SOCIAL_KILL_SWITCH=false`.
3. `state/INBOX.md`: `HUMAN_APPROVAL DEVSHARK-SOCIAL-001` (connect and activate the three devShark
   connections; Buffer for LinkedIn; autopublish of owner-approved Queue items only) and
   `DEVSHARK-SOCIAL-002` (the channels' `mode: "autopublish"`). The owner ticks them in their own
   commit.
4. The channels and the registry flip to `autopublish` with `enabledByHumanAt`, and
   `state/social/activation.json` shows marketingShark enabled after three drafted packages.

## Rollback

Set the two marketingShark edges to `held`: the publisher then denies every marketingShark item,
and the room still drafts for review. Reverting the B1 commits returns the room to Czech and English
drafts in queue v1, which the publisher never considered.

## Implementation

- [x] B1: packages, frames, LinkedIn caption, queue v2 drafts, capability edges (#568)
- [x] B2: devShark profiles, held connections, the LinkedIn platform and channel (#569); register
  `marketingshark` in the registry's `legacyQueueMappings` with those profiles
- [ ] B3: public image URLs through jsDelivr, 90-day retention (#570)
- [ ] B4: LinkedIn through Buffer (#571). The adapter is built and held; this ticks when the owner
  records the live test in `docs/SOCIAL-PROVIDERS.md`
- [ ] B5: Threads images and Instagram JPEG carousels in the Direct Meta adapter (#572)
- [x] B6: the Queue workspace (#573)
- [x] B7: approval dispatches the publisher (#574)
- [ ] B8: Design Lab editing and re-render for devShark packages (#575)
- [ ] B9: more post kinds and the GoVIRAL packet edge (#576)
