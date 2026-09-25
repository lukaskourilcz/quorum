# devShark social queue: profiles, held connections and the approval path

Date: 2026-09-26

Decider: Lukas Kouril, owner

Status: proposed

Signature / explicit approval reference: none yet. The owner countersigns by setting the status
to `countersigned` in their own commit, after reading sections 3 and 4 of
`SECOND-HANDOFF-25-9-2026.md`. Until then nothing below is approved beyond what the repository
already holds: draft records that cannot send.

Decision id: `devshark-social-2026-09a`

Supersedes: nothing. `social-distribution-2026-08a`
(`2026-08-27-social-distribution-operating-decision.md`) stays in force; this record adds one
venture's connections and one transport under it. `operations-2026-09b` already scopes
marketingShark to devShark.

Sources: `SECOND-HANDOFF-25-9-2026.md`, issues #568 to #576,
`state/decisions/2026-08-27-social-distribution-operating-decision.md`,
`state/decisions/2026-09-25-focus-dneskai-devshark.md`.

## Decision

BoardlessAI produces devShark's social posts through marketingShark, the Design Lab and GoVIRAL.
The owner approves each post in an admin Queue before it is sent.

1. **Profiles.** Three `venture-primary` profiles for the devShark brand, owned by the
   marketingShark venture: `social-profile-devshark-linkedin`, `social-profile-devshark-instagram`
   and `social-profile-devshark-threads`. English only. The owner creates the accounts and picks
   the handles.
2. **Connections.** One per profile, `held`, with `enabledByHumanAt: null`. The repository holds
   reference names only: `BUFFER_API_KEY`, `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN`,
   `DEVSHARK_INSTAGRAM_USER_ID`, `DEVSHARK_INSTAGRAM_ACCESS_TOKEN`, `DEVSHARK_THREADS_USER_ID` and
   `DEVSHARK_THREADS_ACCESS_TOKEN`. The values exist only as GitHub Actions secrets the owner
   sets.
3. **Transports.** Instagram (through Instagram Login) and Threads go through Direct Meta, the
   core connector of `social-distribution-2026-08a`. LinkedIn goes through Buffer's free plan:
   Buffer moves from "held optional adapter" to the held LinkedIn transport, for this one
   connection. LinkedIn's own Community Management API needs vetting of a registered
   organization and weeks to months of review, so the direct adapter is documented and not
   built. `api.linkedin.com` is reserved in the network allowlist for it.
4. **Channel.** `config/channels.json` gains a third channel, `linkedin`, in `draft` with
   `enabledByHumanAt: null`: one organic post a day, at least 20 hours apart.
5. **Readiness.** `state/social/activation.json` carries a `marketingshark` record that counts
   drafted devShark packages. At least three must exist before any live send, as the ten-article
   rule of `social-2026-08a` requires for the magazines.
6. **Capability edges.** `marketingshark → design-lab` (`bounded-render-summary/1`) and
   `marketingshark → social-distribution` (`approved-publish-package/1`) are governed by this
   record (#568 adds them).
7. **Content rule.** No post, caption or hashtag promises coins, discounts or access for
   following, liking, sharing or commenting. Meta's spam standards and LinkedIn's professional
   community policies forbid it, and no API can verify a follow.
8. **Approval path.** The Queue workspace moves an item from `draft` to `queued` with the owner's
   approval as its provenance, then dispatches the publisher (#573, #574). It adds no other way to
   send.

## What this record changes in the repository now

- `.env.example` names the six references above and `LINKEDIN_API_VERSION`, each with an empty
  value. `orchestrator/tests/marketingshark-nothing-posts.test.ts` banned the word `DEVSHARK` in
  that file. It now requires every `DEVSHARK` and `BUFFER` line there to be a bare name with no
  value.
- `config/network-allowlist.json` gains `api.buffer.com` (the LinkedIn transport),
  `cdn.jsdelivr.net` (checking that a public asset URL resolves before a send) and
  `api.linkedin.com` (reserved for the direct adapter).

## What it does not do

It creates no account, stores no credential, enables no channel, activates no connection or
provider binding, uncomments no schedule and spends nothing. `SOCIAL_KILL_SWITCH`, each channel's
`mode` and `enabledByHumanAt`, the profile and connection activation, the per-venture activation,
cadence, the immutable content hash and two-phase publishing with reconciliation all stay as they
are. In code, marketingShark stays a non-publishing venture (`isPublishingVenture`), and a
LinkedIn connection stays held until the Buffer adapter exists (#571).

## Activation

Countersigning this record sends nothing by itself. Activation then goes in this order:

1. The owner creates the three profiles, connects the LinkedIn Page in Buffer, and connects
   Instagram and Threads in a Meta developer app as testers of the owner's own app, so no App
   Review is needed.
2. The owner stores the six secrets in GitHub Actions and sets `SOCIAL_KILL_SWITCH=false`, both
   the secret and `vars.SOCIAL_KILL_SWITCH`.
3. `state/INBOX.md` records `HUMAN_APPROVAL DEVSHARK-SOCIAL-001` (connect and activate the three
   devShark connections; Buffer for LinkedIn; autopublish of owner-approved Queue items only) and
   `HUMAN_APPROVAL DEVSHARK-SOCIAL-002` (the channels' `mode: "autopublish"` flip). The owner
   ticks them in their own commit.
4. `config/channels.json` and the registry flip to `autopublish` with `enabledByHumanAt`, and
   `activation.json` shows `marketingshark: enabled` after three drafted packages.

Three tests pin today's posture and change only in the commit that records the countersignature:
`ci-policy.test.ts` (every channel `draft`, the publisher schedule commented out),
`marketingshark-nothing-posts.test.ts` (nothing publishes even in an unlocked world) and
`social-publisher-targets.test.ts` (every connection held).

## Budget

Transport costs $0: Buffer Free, Direct Meta and jsDelivr. marketingShark stays at about $0.04 a
day. Nothing new touches `state/treasury/ledger.json`. Zernio, at about $6 a month for three
accounts, is the only paid alternative and needs a ledger line before it is used.

## Stop condition and rollback

Stop on a factual correction the package cannot absorb, a platform warning, or an owner veto.
Rollback follows `social-distribution-2026-08a`: pause the connection, restore the kill switch,
revoke the Buffer API key or the Meta tokens, and keep every queue item, receipt and history
record. No rollback deletes audit history or turns an ambiguous remote outcome into a failure.

## Implementation

- [ ] B1: marketingShark writes queue-ready packages; capability edges (#568)
- [x] B2: devShark profiles, held connections, the LinkedIn channel and platform (#569)
- [ ] B3: public image URLs for Meta fetches (#570)
- [ ] B4: LinkedIn transport through Buffer (#571)
- [ ] B5: Threads images and Instagram JPEG in the Direct Meta adapter (#572)
- [ ] B6: the Queue workspace (#573)
- [ ] B7: approval dispatches the publisher (#574)
- [ ] B8: Design Lab editing and re-render of a devShark package (#575)
- [ ] B9: more post kinds and the GoVIRAL edge (#576)
