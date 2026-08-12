# Human approval queue

<!-- The orchestrator appends stable, deduplicated items. The human resolves
items in place. Lack of response never authorizes an action. -->

## Pending

- [ ] HUMAN_APPROVAL APIFY-ACCOUNT-001 — Create an Apify account on the **Free
  plan** and add `APIFY_TOKEN` to the repository's Actions secrets, so GoVIRAL's
  Monday trend room has data to read.
  What this approves, exactly:
  - **The plan:** Free, and only Free. No card is required and none should be
    added. Its $5 of monthly platform credit is the budget guard: when the
    credit is spent the actors simply stop, so an overspend is not possible
    rather than merely unlikely.
  - **What it costs:** $0 cash, now and on renewal. The weekly recipe uses about
    $1.03 of the free credit and a month about $4.60 of the $5.
  - **What it fetches:** logged-out public Instagram and Threads posts, through
    six pinned actors listed in `config/goviral-sources.json`. None of them
    takes a login or a cookie, so your own Instagram and Threads accounts are
    never involved and carry no ban risk from this.
  - **What is done with it:** engagement numbers are aggregated into a weekly
    trend snapshot. Raw items are deleted after thirty days. No post, handle or
    image is ever republished on any BoardlessAI surface.
  - **Where the token is stored:** as the Actions secret `APIFY_TOKEN` on
    `lukaskourilcz/quorum`, read only by `cycle.yml`.
  Until the token exists the whole pipeline is a $0 no-op: the room opens on
  Mondays, finds no scout data, records that in one plain sentence and spends
  nothing. Everything else in the system is unaffected.
  **Never upgrade the plan without a new approval.** Starter is $29/month, which
  alone would consume the entire $30 all-in operating cap from `budget-2026-08e`.

- [ ] HUMAN_APPROVAL TT-VISUALS-SPEND-001 — Allow the first routine image spend:
  two Titty Tuesdays garment renders a day, one per provider, inside the existing
  $25 model share.
  What this approves, exactly:
  - **What it costs:** about $0.057 a day — $0.053 for the OpenAI render at
    medium quality and $0.004 for the fal one. That is roughly $1.70 a month.
  - **The ceiling:** $2.00 a month, read back from `state/budget/ledger.json`
    before every single call, so a retry cannot spend past it. When the month is
    spent the step stops and records why.
  - **What it does not approve:** any cash purchase. This is API usage on keys
    the company already holds, so it belongs in the budget ledger and not the
    treasury.

- [ ] HUMAN_APPROVAL TT-VISUALS-ROLE-002 — Add `TT_VISUAL_IMAGE` and
  `TT_VISUAL_IMAGE_FAL` to `config/models.json`, and rewrite `_comment_IMAGE` to
  name four sanctioned image call sites instead of two.
  What this approves, exactly:
  - **The two routes:** OpenAI `gpt-image-2` at medium quality, 1024×1024, and
    fal `fal-ai/flux/schnell` at the same size. Medium, not high, because the
    wordmark has to render as legible type and high costs four times as much
    before anyone has seen medium fail at it.
  - **What stays forbidden:** an unsanctioned image call site inside an article
    pipeline. That rule is unchanged.

- [ ] HUMAN_APPROVAL TT-VISUALS-STORAGE-003 — Keep proposal images under
  `state/ventures/titty-tuesdays/design-proposals/media/`, served through the
  authenticated admin route, rather than under `site/public/`.
  What this approves, exactly:
  - **Why it diverges from the design doc:** anything under `site/public/` is
    world-readable once deployed, so a rejected garment concept would become a
    publicly addressable file at a guessable path. Pre-launch designs should not
    be enumerable by anyone who guesses a date.
  - **What it costs:** one authenticated media route, which already exists in
    the same shape for MMA Files.

- [ ] HUMAN_APPROVAL TT-VISUALS-DOCTRINE-004 — Approve the doctrine checklist
  wording and the two kinds of no.
  What this approves, exactly:
  - **The checklist:** every render arrives unreviewed beside three lines — no
    human imagery, wordmark correct, on-brand. The automatic checks cannot judge
    any of the three, and the panel says so instead of implying otherwise.
  - **Bad versus Doctrine:** `bad` is a taste rating and the image stays on file,
    because a rejected design is what the taste loop learns from. `Doctrine`
    means the image should not exist: its bytes are deleted and the record keeps
    the hash, the prompt and the reason.

- [ ] HUMAN_APPROVAL TT-VISUALS-BATCH-005 — Approve the batch shape: one concept
  a day, two images, one per provider, re-encoded to WebP.
  What this approves, exactly:
  - **The cadence:** daily rather than the Tuesdays-only weekly batch of six in
    the design doc, and two providers rather than one, so each day compares two
    renderers on the same concept.
  - **The cap:** two images a day, enforced by the code and by the presence of
    the day's record on disk, so a re-run cannot render a second pair.

- [ ] HUMAN_APPROVAL TT-VISUALS-CONTRACT-006 — Approve the `design-proposal/1`
  contract itself.
  What this approves, exactly:
  - **What every image carries:** the provider, the model, the exact prompt that
    was sent, its content hash, its size, its cost and its timestamp. An image
    with no recorded prompt cannot be reproduced or defended.
  - **Where it lives:** `state/ventures/titty-tuesdays/design-proposals/<date>.json`.

- [ ] HUMAN_APPROVAL DISPATCH-TOKEN-001 — Store a GitHub dispatch token and a
  cron secret on the `quorum-site` Vercel project, so the council's meetings
  start on their own hour instead of whenever GitHub's queue gets to them.
  What this approves, exactly:
  - **Which repository the token reaches:** `lukaskourilcz/quorum`, and no
    other. It is a fine-grained personal access token scoped to that one
    repository.
  - **Which permission:** Actions, read and write. That is the entire scope and
    it is what lets the token start `cycle.yml`.
  - **Where it is stored:** as Production environment variables on the Vercel
    project `quorum-site` (the one that deploys this repository and serves
    boardless-ai.vercel.app) — `QUORUM_DISPATCH_TOKEN` holds the token, and
    `CRON_SECRET` holds a random string of at least 16 characters that Vercel
    sends as the Authorization bearer on its own cron requests.
  - **That it can trigger paid model runs:** yes. A dispatch started with this
    token runs the council live and calls the paid model APIs, exactly as a
    GitHub cron firing does, and spends against the same $30/month all-in
    operating cap from `budget-2026-08e`. It raises no limit and skips no
    budget, gate or gating switch.
  What it does not get: no access to repository contents, secrets, or any other
  repository, and no say in what a run does. `site/src/app/api/cron/[phase]`
  sends two workflow inputs and nothing else — the phase, and
  `trigger=vercel-cron` — so it cannot ask for delivery-only mode, a different
  branch, or a phase this repository does not schedule.
  Why it is worth a token at all: GitHub delivered 4 August's scheduled runs
  2h23m to 2h55m late and 2 August's 13 to 54 minutes late; `workflow_dispatch`
  starts within seconds.
  If `CRON_SECRET` is never set, the route refuses every request and nothing is
  dispatched — an unset secret costs punctuality, never money.

- [ ] HUMAN_APPROVAL APIFY-MMA-SOURCES-001 — Extend the approved Apify scope to
  MMA data actors for FightAIQ, so UFC and Oktagon events, cards and results
  have a second independent source and the site's empty boards can fill.
  What this approves, exactly:
  - **The plan:** the same Free-plan account as `APIFY-ACCOUNT-001`, still with
    no card on file. This item adds no account and no spend authority — it only
    widens what the existing token may fetch.
  - **What it costs:** $0 cash, now and on renewal. Estimated usage is
    $1.50–$3.00 of the $5 monthly platform credit (a Cheerio-class scrape run
    costs roughly $0.02–$0.05; a paid per-result UFC actor at ~$30 per 1,000
    calls costs ~$1.80/month at two calls a day). The MMA share is capped at
    $3.00/month in its own quota ledger beside GoVIRAL's. One warning: the
    GoVIRAL recipe was sized at ~$4.60/month of the same credit, so both
    programs cannot run at full planned cadence on one free account — if
    GoVIRAL goes live, cadences must be rebalanced under the $5, and the quota
    guard stops runs rather than overspending in the meantime.
  - **What it fetches:** public fight-card, result and fighter-record pages —
    candidate sources are UFCStats, ESPN MMA, Tapology (the only candidate
    with full Oktagon coverage) and Sherdog. Each actor is pinned in
    `config/mma-sources.json` with its price shape and a recorded
    `termsVerdict` before its first run, the same discipline that left
    oktagonmma.com disabled as `unclear`. No logins, no cookies, no personal
    accounts involved.
  - **What is done with it:** bout and event corroboration, results and stats
    flow into the `state/mma/` store with per-source receipts, feeding
    FightAIQ and the magazine's boards. Nothing is republished beyond checked
    facts with their provenance.
  - **Where the token is stored:** the existing `APIFY_TOKEN` Actions secret
    on `lukaskourilcz/quorum`, read only by `cycle.yml`.
  Until this is resolved the whole MMA-actor path is a $0 no-op that reports
  itself in one plain sentence per run. **Never upgrade the plan without a new
  approval** — Starter is $29/month, which alone would consume the entire $30
  all-in operating cap from `budget-2026-08e`.

## Resolved

- [x] HUMAN_APPROVAL DEVSHARK-BANNER-001 — Place the devShark house banner on
  DNESKAi, so a reader who finishes an article sees one quiet line about your own
  product.
  What this approves, exactly:
  - **What is placed:** one static SVG, 720×120, below the article footer, plus
    a `config/banner.json` that turns it on. Both are staged and hashed at
    `state/ventures/marketingshark/banner/`; the payload hash travels with them.
  - **What it costs:** $0. The asset is self-hosted in the target repository and
    the delivery rides the App channel that already carries the daily edition.
  - **What it fetches:** nothing. No script, no external font, no remote image,
    no tracking pixel. A test asserts the file contains none of those before it
    can be staged at all.
  - **How it is labelled:** `vlastní projekt`, visibly. DNESKAi does not sell
    advertising and this must not look like it does.
  - **What it claims:** that devShark is a quiz game for developers, and its
    address. No user count, no ranking, no testimonial.
  - **Why it needs you:** a house banner is a new outward-facing surface on a
    reader site, and no room may open one for itself. After this one approval the
    delivery runs within the recorded scope and needs no further sign-off.
  Nothing is delivered until this is ticked. geoShark never gets a banner
  anywhere; that is pinned by the config schema and by two tests, not by this
  sentence.
  **Approved by the owner on 2026-08-07.** Approval is not delivery: the payload is still
  `status: "staged"` with no receipt, because the delivery App credentials are not reachable
  from the session that staged it. The next run that holds them may deliver it within exactly
  this scope — the two creatives and the one slot config recorded in the contract's payload
  hash, and nothing else. `active: false` still ships, so the slot stays empty on DNESKAi
  until someone turns it on there.

- [x] HUMAN_APPROVAL REVENUE-HOSTING-001 — Owner confirmed on 2026-07-31 that
  both projects use an existing Vercel Pro subscription. Hosting is recorded as
  $0 incremental project cost. Reopen the cap decision if either project leaves
  Pro or the invoice allocation changes. Sponsor acceptance remains a separate
  HUMAN_APPROVAL. → approved 2026-07-31.

- [x] HUMAN_APPROVAL BRAND-CLEARANCE-001 — Owner explicitly accepted the
  collision risk with `Boardless, Inc.` and `boardless.ai` under hobby /
  non-commercial project mode (see `state/BUSINESS.md`). No commercial launch,
  no domain purchase, no handle registration, no trademark claim. Name
  `BoardlessAI` retained as a working title for the personal project. If mode
  is ever reclassified to commercial, this decision must be revisited with
  professional legal clearance. → approved 2026-07-28.
  The 2026-08-01 operating transition reopened that commercial clearance gate;
  the remaining owner action is tracked in `NEEDED.md`.

- [x] HUMAN_APPROVAL API-CREDENTIALS-001 — Owner provided `ANTHROPIC_API_KEY`
  and `OPENAI_API_KEY` for local development on 2026-07-28; keys stored in the
  gitignored `.env` file and loaded by the orchestrator via `src/env.ts`.
  Owner acknowledged the transcript-leak risk and will rotate the keys.
  GitHub Actions secrets now exist, but rotation remains pending in
  `NEEDED.md`. → approved 2026-07-28.

- [x] **CAUGHT-UP-DELIVERY-2026-08-01** — Resolved 2026-08-01: a technical no-edition fallback duplicated an already delivered provisional board status. The duplicate outbox package was held internally; a valid same-day edition may replace only that provisional status.

- [x] **CAUGHT-UP-DELIVERY-2026-08-05** — Resolved 2026-08-06: the same package delivered two hours later on a repeat run. Original report: schema_invalid: > aifirst@0.1.0 consume:edition /home/runner/work/_temp/aifirst-delivery-1 > tsx scripts/consume-edition-package.ts /home/runner/work/quorum/quorum/state/edition/outbox/2026-08-05-17eb32d81474601883eff58c095b8b5d41b056dc23100fdf44675787c8ff824c.json /home/runner/work/_temp/aifirst-delivery-1 [delive.
  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]

- [x] **CAUGHT-UP-DELIVERY-2026-08-12** — Resolved 2026-08-12: the edition for this date delivered on a later run. Original report: — content_invalid: > aifirst@0.1.0 check:content /home/runner/work/_temp/aifirst-delivery-1 > tsx scripts/check-content.ts [check] 14 MDX file(s), 8 board context file(s), and configs validated, no issues > aifirst@0.1.0 test /home/runner/work/_temp/aifirst-delivery-1 > vitest run [1m[46m RUN [49m[22m [36mv3.2.6 .
  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]


- [ ] **MMA-FILES-DELIVERY-2026-08-08-am** — hash_conflict: 2026-08-08:am reuses the slug of 2026-08-05:am.
  A different article already holds this date and slot in the magazine, so this one was held back. RELAY marked the delivery `needs_reconciliation`; same-slot content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]

- [ ] **DELIVERY-QUEUE-MMA-FILES** — the publish queue is not draining.
  Oldest held item: 2026-08-06 AM ufc-event-ufc-fight-night-gamrot-vs-salkilld (hash_conflict).
  Live counts are in state/delivery/queue-health/, rewritten every day. A parked package needs
  new bytes rather than another run; its own receipt says what the magazine refused and why.
  [imp:5] [owner:me] [time:30m] [kind:deploy]
