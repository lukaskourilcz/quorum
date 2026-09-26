# Social strategy

## Audiences

- People evaluating agent governance and practical AI operations.
- DNESKAi readers reviewing Czech AI news and its decision trail.
- Adults evaluating Titty Tuesdays concept work; no audience under 18.
- Developers who want one real question a day, through devShark's carousels.
- Future magazine audiences only after an evidenced proposal and owner decision.

## Content pillars

- Today’s standup and the reason for a decision.
- What agents shipped and for whom.
- The delivery or release proof behind a published claim.
- Mistakes, vetoes, incidents and recovery.
- Verified operating cost and revenue milestones.
- Useful domain work from a validated venture.
- Owner-rated concept and taste progress without implying a launch.
- How agent-operated governance works.

## Channel roles

Threads is text-native. Instagram is visual-native. Copy is adapted, never
duplicated unchanged. Every social visual uses a live Design Lab template id,
semantic version and bounded content payload. Freeform image briefs and alternate
social renderers are invalid.

## Voice and cadence

Measured, declarative and evidence-backed. Cadence is a cap, not a quota. Use
`NO_POST` when no verified fact adds audience value.

## Activation and proof

Each project that can post has its own health gate. Caught Up needs seven consecutive
passed delivery proofs; MMA Files needs ten passed article proofs without an unresolved
failure; Titty Tuesdays needs four complete approved campaigns, credentials and its
safety checker. The global kill switch can stop all posting immediately. MMA Files and Titty
Tuesdays are paused (`operations-2026-09b`); their gates matter again only if they resume.

marketingShark drafts one devShark post each weekday and puts three drafts in the Admin
Queue, one each for LinkedIn, Instagram and Threads (`docs/SOCIAL-QUEUE.md`). Its publishing
path is registered and held by `state/decisions/2026-09-26-devshark-social-queue.md`, which
is still `proposed`. Nothing sends until the owner countersigns it, ticks
`DEVSHARK-SOCIAL-001` to `-003` in `state/INBOX.md`, creates and connects the devShark
profiles and approves the post. Until then every item stays a draft.

Each post uses an idempotency key, records `carousel-studio-1` as its renderer and has
a live-post proof. A/B variants rotate without measurement. Phase 3 remains closed;
SPLIT and MMA Files social editor REACH stay disabled until their gates are opened.

## Prohibited and escalation

No invented metrics, people, testimonials, conflict, screenshots or results. Do not
fetch or store views, clicks, reactions, comments, follows or messages. Accounts,
OAuth and new scopes remain human-owned; posting inside the pre-signed channel scopes
unlocks automatically only after the project health gate. Paid media still requires a
new owner decision.

## Stored artifact guides

The [asset](social/assets/README.md), [pack](social/packs/README.md),
[queue](social/queue/README.md) and [post](social/posts/README.md) guides define the four social
state boundaries. They describe records and receipts, not permission to connect a channel.
