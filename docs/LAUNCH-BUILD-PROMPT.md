# LAUNCH build prompt — turn the portfolio from held to public

This is a one-shot build prompt in the pattern of the retired `KVORUM-CODEX-BUILD-PROMPT.md`:
an Opus session reads it, creates the GitHub issue program it describes, then works the issues
one by one. Delete this file once the program is complete and its durable content lives in the
issues, the decisions and the owner document.

It was written on 2026-08-28 from a full-repository review. Facts below carry file paths so you
can verify them instead of re-deriving them; where a number is load-bearing, it was measured
from state on that date.

## Owner direction (recorded from the 2026-08-28 session)

- **Launch set, in priority order:** DNESKAi (`caught-up`), MMA Files (`mma-files`),
  marketingShark (`marketingshark`), BOOKSOFHISTORY (`booksofhistory`), Tehdejší svět
  (`tehdejsi-svet`), Kvórum (`kvorum`), plus the owner-only Personal Growth desk
  (`personal-growth`). FightAIQ stays as MMA Files' data supplier, not a launch surface.
- **Out of the launch:** Titty Tuesdays (owner's explicit call — no eshop work now), Door Money
  (approvals can wait), WebDev Signal and Contest Radar (their open issue programs are parked,
  not cancelled).
- **No new idea generation.** The owner finds the generated marketing ideas weak. Promote what
  already works — the articles and the working products — and quiet the idea mills until after
  launch.
- **Design Lab posture:** five top template families per brand in rotation, not twenty-three;
  decks of five to seven slides; carousels must actually carry the article's photograph when
  one exists; Design Lab and GoVIRAL paired with the launch ventures end to end.
- **Admin posture:** the owner wants to see the few things that run the launch, not ninety-five
  panels. Everything else is hidden or demoted, never deleted.
- **Social:** Instagram + Threads accounts get created by the owner for the launch ventures;
  everything in the repo stays drafts-only behind the existing triple-lock until the recorded
  activation gates pass. Nothing here creates an account or posts.

## Standing rules — read before creating anything

1. Read `CLAUDE.md`, `docs/ENGINEERING.md`, and the newest `state/decisions/*.md` first.
   Invoke the `task-observer` skill at session start.
2. Never weaken budget, patch, security, evidence, stage, finance, content-quality or release
   guards or their tests. Where a fix touches budget arithmetic it may make the accounting
   *accurate*; it may not raise a cap. A cap change is a decision record the owner countersigns.
3. Registry and schedule changes (pausing a room, changing a cadence) are owner decisions:
   draft the decision record, leave `Status: pending countersignature`, and implement the
   change fail-closed behind that countersignature, exactly like `kv-desk` does today
   (`orchestrator/src/portfolio/schedule.ts:112`).
4. One issue at a time, one issue-scoped commit series each, tick the issue's acceptance boxes
   in the commit that completes them. The program order below wins over opportunistic work.
5. Mirror the house issue format (see #445 for the canonical shape): parent/dependencies, goal,
   boundaries ("must not create a second X"), acceptance criteria checkboxes, commit
   checkpoints, Codex handoff. Keep each issue self-contained.
6. All of this is $0 code work. Any step that would add a model call gets a ledger line and an
   envelope first.
7. `pnpm -C studio build` after touching studio source, before anything that resolves the
   package. Run the repo's own gates before every push: `pnpm agents:validate && pnpm lint &&
   pnpm typecheck && pnpm test && pnpm build`.

## Step 1 — create the issue program

Create one parent issue `PROGRAM — Launch the portfolio publicly` and the fourteen children
below, titled `Launch NN — <title>`. Link every child to the parent. Then post one comment each
on #435 (WebDev Signal) and #408 (Contest Radar): parked by owner direction until the Launch
program completes; do not close them.

### Launch 01 — Repair the engine: release gate, stale records, finance drift

The daily engine is the product; it was down when this was written.

- The 2026-08-28 outage (every room skipped since 15:00 UTC, `skip(...)` commits on `main`) was
  the `webdev-signal` brand failing the studio's 4.5:1 contrast floor against the legacy mesh
  cover. The verified fix is commit `9de0869` on branch `claude/venture-launch-review-7l5nkd`
  — merge that branch into `main` first if it has not landed yet.
- End the env-leak test class: a vitest setup file that blanks provider keys
  (`FAL_KEY`, `ARTICLE_ILLUSTRATION_ENABLED`, both model keys) for every run, so no test can
  behave differently under the cycle gate than under CI. This is the documented 9–11 August
  outage class (`docs/NEEDED.md`, "Stop a test from being able to read the cycle's live
  environment at all").
- Fix root `pnpm test` flaking under its own three-workspace concurrency
  (`orchestrator/tests/studio-lifecycle.test.ts`, `src/social/pack.test.ts` — documented in
  `docs/NEEDED.md`): serialize the workspaces or budget the two timeouts to the measured cost.
- `state/owner-attention.json` is stamped `2026-08-13T04:00:00Z` — 15 days stale — although
  `collectOwnerAttention` is wired into every non-dry phase (`orchestrator/src/cycle.ts:1221`).
  Find why the write or its commit never lands and make the snapshot refresh every cycle. Its
  stale "No image rendering key is configured" item misinforms the admin today.
- Finance drift: `state/treasury/ledger.json` still says `monthlyOperatingCapUsd: 30` against
  the countersigned $50 in `budget-2026-08f`; the generated block in `state/FINANCE.md` is
  22 days stale ($3.12 recorded vs $13.50 in `state/budget/ledger.json`). Make both regenerate
  from the ledger on the cycle that already rewrites queue-health.
- The recurring "slots with no record either way" defect (three operations reviews in a row
  carry the same unchecked PULSE task): implement the $0 post-step variant already described in
  `docs/NEEDED.md` ("Decide the two efficiency-review calls", item 2) behind its owner
  decision — every punctual run appends the "any unopened slot still in window?" check.

### Launch 02 — Drain the delivery queues and stop the duplicate-subject loop

`state/delivery/queue-health/2026-08-28.json`: both magazines `stalled: true`, `needsOwner`.
Six MMA packages parked `hash_conflict` (three consecutive days regenerating
`ufc-fight-night-hernandez-vs-rodrigues`, two for `gamrot-vs-salkilld`, one for
`nurmagomedov-vs-song`), DNESKAi parked once `hash_conflict`, once `post_deploy_verification`
(the reverted 2026-08-17 release).

- Teach slate derivation to consult the delivered-article index *before* the model call so an
  already-delivered subject is killed at $0 — today AUDIT catches it late and paid
  (2026-08-28 `mag-editorial` VETO: "event UFC je v indexu opakovaný").
- A parked package whose slug/slot is already delivered is retired with a receipt, not
  re-attempted; a `post_deploy_verification` park re-runs delivery-only (no model call).
- Acceptance: queue-health reports zero parked packages and both magazines un-stalled, with
  retirement receipts explaining each of the eight.

### Launch 03 — Image ladder: fix the verdict protocol failure

Three of the six recent DNESKAi search-rung gate calls returned a reply with no `verdicts`
array (`unparsable: expected array, received undefined` — receipts of 08-14, 08-18, 08-28 in
`state/ventures/caught-up/image-selections/`), each burning ~$0.0096 and falling to the FRAME
plate. That is roughly one edition in seven shipping the plate for a protocol bug, not a
picture-quality reason.

- In `orchestrator/src/llm/vision.ts`: force the verdict tool (`tool_choice`), tighten the tool
  schema, and add one bounded retry on an unparsable reply — the retry reserves and settles
  through the same `image_gate` budget path as the first call, and a second failure descends
  the ladder exactly as today.
- Tests: a malformed-reply fixture proving the retry, the budget accounting, and the descent.

### Launch 04 — Image ladder: make the budget arithmetic honest

`orchestrator/src/images/budget.ts` reserves the gate model's full `maxOutputTokens` (1,200 ×
$5/MTok = $0.006, 30% of the $0.02 article cap) on every call while a real verdict uses a
fraction; after one search plus curated attempts the paid illustration rung is arithmetically
unreachable exactly when it is needed. On 2026-08-21 the one fal render ever made was billed
$0.004 and *then* refused by `cap:article-cap`, because `reserveGeneratedImage()` checks only
the day count and day cap, never `articleUsd`, and the render is billed before its gate
reservation is checked.

- Reserve a measured output estimate per candidate and reconcile the reservation to actuals
  after settlement — reservation accuracy, not a cap change; `IMAGE_GATE_ARTICLE_CAP_USD`,
  `IMAGE_PROGRAM_DAY_CAP_USD` and `IMAGE_GENERATION_DAY_LIMIT` keep their values.
- Check the whole article-cap fit (render + gate reservation) *before* billing the fal render.
- Tests: the 2026-08-21 sequence replayed against the new arithmetic reaches the generated
  gate instead of paying for an image it then refuses to look at.

### Launch 05 — Image ladder: stop feeding the gate candidates that never win

Measured over all 30 receipts: mean candidate fit 3.07 against a threshold of 7; every one of
the 15 winning search selections came from Pexels; Pixabay is 66 seen / 64 vetoed and fills
~36% of the 12-slot shortlist; Openverse is 6/6 vetoed. The person branch pays for three
one-candidate curated gate calls (~$0.0022 each) instead of one batched call.

- In `orchestrator/src/images/licensed.ts`: fill the shortlist Pexels-first and cap the
  never-winning providers' share instead of round-robin interleaving; keep every provider
  registered and re-measurable.
- Batch the curated rotation into a single gate call of up to `CURATED_GATE_ATTEMPTS`
  candidates.
- Do **not** add an illustration rung to the person branch: a generated image of a real named
  fighter stays out by design.
- Acceptance: replaying the recorded briefs against the new shortlist composition shows a
  higher fraction of shortlist slots from providers that have ever won, and the person branch
  costs one gate call instead of three.

### Launch 06 — Design Lab: the launch pool, five to seven slides, photo-first

- Per-brand launch presets: a recorded set of five families per launch brand (the magazines'
  sets drawn photo-forward-first — only 7 of 23 families are `photo-forward`,
  `studio/src/families.ts` `FAMILY_SERVES`), stored the way deck presets already are, and the
  recipe dealer (`studio/src/recipe.ts` `chooseFamily`) deals only from a brand's live preset
  pool when one exists.
- `chooseFamily` consults `FAMILY_SERVES`: an article with a hero is never dealt a `type-only`
  family (today the picker ignores it and a photo article can render with its photo unused).
- Queued decks are bounded five to seven slides; the schema's `MIN_SLIDES`/`MAX_SLIDES` in
  `studio/src/slides.ts` stay as they are, the queue path constrains within them.
- Surface the DNESKAi lockup question (kicker DNESKAi vs wordmark CAUGHT UP,
  `CAROUSEL_BRANDS["caught-up"].logoText`) as the one-line owner decision it is.

### Launch 07 — Carousel production: render, persist, queue, review — for every launch venture

The only venture with the full render → persisted artifact → draft queue item → reviewable
card path is marketingShark (`orchestrator/src/ventures/marketingshark/`); the Design Lab
article path renders on demand and writes nothing (`site/src/app/admin/api/carousel-studio/`),
so there is nothing to queue or review. Extend the marketingShark pattern into one shared deck
production module:

- Persist article-deck renders (PNG per slide + a render receipt with hashes, template/brand
  versions, checks) for `caught-up` and `mma-files` deliveries, then `booksofhistory`,
  `tehdejsi-svet` and `kvorum` as their packages exist. Kvórum and BOOKSOFHISTORY stay
  typographic (`rendering.imageGeneration: false` / founding decision); Tehdejší svět's photos
  come only from its committed media under `state/ventures/tehdejsi-svet/media/` behind
  `TS-MEDIA-002`.
- Write draft queue items into `state/social/queue/` (the capability-aware v2 shape in
  `orchestrator/src/social/queue.ts`) for each rendered deck — `status: draft`, every approval
  pending, exactly like marketingShark's.
- Register the missing capability edges in `config/venture-capabilities.json`:
  `caught-up|mma-files|booksofhistory|tehdejsi-svet|kvorum → design-lab :
  bounded-render-summary : bounded-render-summary/1`. Five ventures already write summaries
  into `state/ventures/carousel-studio/summaries/` with no registered edge; automated
  rendering must fail closed until the edges exist, so add them first.
- Wire the write-only status fields: `kvorum-recommendation-store.ts` sets
  `designLab.status: "queued"` and nothing ever consumes it; BOOKSOFHISTORY's
  `designLabStatus` is the same shape.
- Admin: one review card per queued deck — preview, approve/hold, and for approved items a
  manual posting pack (ZIP of frames + caption + alt text + hashtags) the owner can download
  and post by hand. No autopublish; the triple-lock is untouched.

### Launch 08 — GoVIRAL: from never-ran to weekly brief

GoVIRAL has never produced a brief: no `state/ventures/goviral/plans/`, no
`state/goviral/trends/`, because `APIFY_TOKEN` was never added (`APIFY-ACCOUNT-001`, unticked
since 2026-08-12). The owner unblocks the token; the code work:

- Register the missing intelligence edges `goviral → caught-up` and `goviral → mma-files`
  (`goviral-intelligence-packet/1`) and route the magazines' existing plan-file reads through
  `resolveVentureCapability` like the other five consumers.
- Surface the newest brief on the admin launch board (Launch 10) instead of a buried tab.
- Verify the first live Monday run end to end: actor receipts, quota counters
  (`state/goviral/source-quota/apify.json` — referenced in code, missing on disk), trend
  snapshot, brief, and the $0 no-op on the other six days.

### Launch 09 — Kvórum: the political desk, gated live

All the code exists (`orchestrator/src/ventures/kvorum/` — monitor, cluster, gates, TRIBUN);
what is missing is paperwork plus one decision file:

- Draft `state/decisions/2026-08-28-kvorum-budget-capacity.md` for the owner's signature. The
  natural reallocation: pausing `tt-marketing` (Titty Tuesdays is out of the launch) frees
  exactly its $0.08 daily envelope, which is the amount `kvorumBudgetCapacityDecision`
  requires (`orchestrator/src/portfolio/schedule.ts:117`, `Freed worst-day capacity USD:`).
  Pair it with the Launch 11 decision record so one countersignature story covers both.
- After the owner countersigns the founding + capacity + `KV-SOURCES-002` + `KV-APIFY-001` +
  `KV-EDITORIAL-004`: prove one dry `kv-desk`, then the live path — Štít demokracie mapper
  rejecting comments and private individuals, the seven Czech feeds producing receipts, one or
  two drafted recommendations landing in the admin for owner approval, and the approved ones
  flowing into Launch 07's typographic deck queue.
- Any new page, group or feed beyond the approved registry is a new owner review — the
  deny-by-default posture is the product here, not friction.

### Launch 10 — Admin: the launch board, and a smaller admin

Measured 2026-08-28: ~68 navigable destinations, 46 venture tabs of which 9 are
magazine-operational, and `site/src/app/admin/page.tsx` awaits all 28 loaders on every render.
`venture.visibility` from `config/ventures.json` is parsed into `AdminVenture` and then never
read by any component — that is the hook.

- **Launch board first.** The company overview opens with one board over the launch set: per
  venture — last delivery and its URL, next scheduled slot, image rung used yesterday, queued
  decks awaiting review, social readiness (profile state + activation counter), and the single
  blocking owner item if any. Extend the owning snapshots; do not add a competing loader.
- **Focus the rail.** Launch ventures pinned; Titty Tuesdays, Door Money, WebDev Signal and
  GoVIRAL's empty tabs fold into a collapsed "Held" group (FightAIQ stays visible as MMA
  Files' supplier). The single place to do it is the group construction in
  `site/src/components/admin/admin-shell.tsx:71–121`.
- **Demote the strategy surfaces.** `?view=future` (the idea firehose + the information-only
  monetization catalog) leaves the navigation; the personal-growth teaser moves below the
  launch board; "What happened since yesterday" covers the launch set instead of the
  hard-coded four newest ventures (`site/src/lib/admin-recent-activity.ts`).
- **Load what the tab needs.** `page.tsx` awaits only the loaders the requested
  venture/tab/view actually renders.
- Keep every workspace reachable by URL; hidden is not deleted. Playwright admin QA covers the
  board and the folded rail.

### Launch 11 — Quiet the idea mills

Owner direction: no idea generation until after launch. The honest mechanism already exists —
a skip with a receipt costs $0 and says why.

- Draft one operations decision record (owner countersigns): `cu-product` (daily
  `IDEA_VERDICT`, $0.08 envelope) and `tt-marketing` (daily, $0.08 — also the Kvórum
  reallocation source in Launch 09) are held for the launch period; each scheduled slot writes
  a skip record naming the decision, exactly like `kv-desk`'s countersign-aware hold.
- GoVIRAL keeps its Monday room — the launch needs its trend signals — but its "marketing
  ideas" output section is not surfaced in the admin; the brief is.
- Ideas ledgers stay append-only and intact; the ideas tabs and `?view=future` disappear from
  navigation (Launch 10), not from disk.

### Launch 12 — Social readiness: packs, counters, and the one broken venture room

- **marketingShark contract repair** (the `docs/NEEDED.md` agent task): both paid `ms-daily`
  calls closed `model-output-invalid` ($0.035138 and $0.035142 in the ledger). Reproduce the
  returned shape without logging provider prose, align CHUM's schema and prompt, prove one
  synthetic valid package and one malformed response, keep fail-closed drafts-only. This is
  the venture the owner calls "already working" — it must actually draft its daily carousels.
- **Activation counters live**: `state/social/activation.json` was last refreshed 2026-08-05
  (DNESKAi 2/7, MMA Files 3/10); recompute per cycle so the launch board shows the real
  distance to each publishing gate.
- **Manual posting packs everywhere**: BOOKSOFHISTORY, Tehdejší svět and Kvórum are
  drafts-only by decision — their approved queue items (Launch 07) get the same downloadable
  pack the magazines get, so the owner can post by hand from day one.
- **Personal Growth first run**: `pg-desk` (daily@23:00, countersigned 2026-08-26) has never
  fired — verify one run end to end, and make the trend-radar tab's empty state say plainly
  that it waits on GoVIRAL's first brief.
- No credential, account, OAuth or posting work anywhere in this issue. The publisher, kill
  switch and per-venture counters stay exactly as decided in
  `state/decisions/2026-08-27-social-distribution-operating-decision.md`.

### Launch 13 — Regression, docs, and closing the program

- Full release gate green at root: `pnpm agents:validate && pnpm lint && pnpm typecheck &&
  pnpm test && pnpm build`, plus `pnpm admin:qa` for the new board.
- `pnpm docs:check` clean; `docs/ECOSYSTEM.md` regenerated (it still says "eleven" seed
  templates against twelve on disk); `docs/NEEDED.md` swept — done items ticked, the launch
  shortlist updated, new owner items added with the shared marker format.
- Implementation Plans carries the Launch program summary; the two parked programs (#435,
  #408) still carry their parked comments.
- Delete `docs/LAUNCH-BUILD-PROMPT.md` in the program's final commit.

## Step 2 — work the issues

Order: 01 → 02 → 03/04/05 (independent of each other) → 06 → 07 → 10 → 11 → 12 → 08 and 09
when their owner unblocks land → 13. If an owner dependency is missing when you reach an
issue, do every part of it that fails closed without the dependency, record what remains, and
move on rather than waiting.

## Owner dependencies the program cannot code around

| Needs the owner | Blocks |
| --- | --- |
| Merge `claude/venture-launch-review-7l5nkd` (or land Launch 01 fast) | every scheduled room |
| `APIFY_TOKEN` + `APIFY-ACCOUNT-001` | Launch 08, Kvórum's Štít source |
| Kvórum founding + capacity + `KV-*` countersignatures | Launch 09 live |
| BOOKSOFHISTORY + Tehdejší svět foundings, `BH-*`/`TS-*` approvals | their desks live |
| `PORTFOLIO_LIVE_ENABLED=true` | all four newer venture rooms + `pg-desk` |
| `ADMIN_USER`/`ADMIN_PASSWORD`/`BOARDLESSAI_GITHUB_TOKEN` in production | every admin write |
| Launch 11 + Kvórum capacity decision countersignatures | the room holds they describe |
| Social account creation + `SOCIAL-DISTRIBUTION-CONNECTION-001` | API posting (later, not launch) |
