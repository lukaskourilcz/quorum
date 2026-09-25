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

## What stays held

Building every step of the programme sends nothing. Until this record is countersigned, and
beyond it until the owner performs each activation step below:

- `SOCIAL_KILL_SWITCH` stays the supreme stop.
- Both Meta channels, and the LinkedIn channel #569 adds, stay `draft` with `enabledByHumanAt: null`.
- Every devShark connection stays `held`; no credential value exists in the repository, only
  reference names.
- marketingShark is not a publishing venture; its items are drafts with every check pending.
- A LinkedIn item is refused by name at publish time until the LinkedIn transport exists.

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
- [ ] B2: devShark profiles, held connections, the LinkedIn platform and channel (#569); register
  `marketingshark` in the registry's `legacyQueueMappings` with those profiles
- [ ] B3: public image URLs through jsDelivr, 90-day retention (#570)
- [ ] B4: LinkedIn through Buffer (#571)
- [ ] B5: Threads images and Instagram JPEG carousels in the Direct Meta adapter (#572)
- [ ] B6: the Queue workspace (#573)
- [ ] B7: approval dispatches the publisher (#574)
- [ ] B8: Design Lab editing and re-render for devShark packages (#575)
- [ ] B9: more post kinds and the GoVIRAL packet edge (#576)
