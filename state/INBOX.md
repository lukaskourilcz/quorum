# Human approval queue

<!-- The orchestrator appends stable, deduplicated items. The human resolves
items in place. Lack of response never authorizes an action. -->

## Pending

- [ ] HUMAN_APPROVAL BH-RESEARCH-001 — Allow BOOKSOFHISTORY to make guarded
  web-search research calls with the existing Anthropic key.
  What this approves, exactly:
  - **The provider and search caps:** the existing `anthropic-web-search` adapter
    only. A gather call may use at most five searches; a QUILL claim check may
    reserve one to three. Synthesis has no search tool. Each call remains beneath
    the portfolio's immutable `$0.10` text-call ceiling.
  - **The narrower spend guards:** no more than `$0.50` of research per cycle and
    `$5.00` per month, both inside the signed `$25` model/API share and `$30`
    all-in ceiling. Every call reserves before it runs and records actual use after.
  - **The retained evidence:** the research ledger records provider, model, book,
    reason, requesting meeting, tokens, searches, cost, dossier reference and later
    whether an owner-posted feature used the dossier.
  - **The duplication guards:** a reusable shelf story wins before new spend.
    Completed and in-flight work is deduplicated by `(bookId, briefHash)` with a
    cycle lock; the Czech and English lanes share one dossier and never trigger
    duplicate research merely for language.
  - **What this does not approve:** a new provider, account, credential, plan,
    ceiling, post, channel action or publication surface. Missing approval must
    remain the `$0` path.

- [ ] HUMAN_APPROVAL BH-SEED-002 — Accept the authored 200-book
  BOOKSOFHISTORY seed library and its prior-not-fact and no-cover rules.
  What this approves, exactly:
  - **The artifact:** the committed, hand-authored seed records are cheap routing
    context for deterministic selection. Their initial opportunity scores and notes
    are editorial priors, not evidence, claims or facts fit for publication.
  - **The evidence boundary:** a seed entry may nominate a book and research angle;
    only a source-backed dossier may support feature copy. Seed content cannot be
    promoted into a factual sentence without that research path.
  - **The artwork boundary:** `coverRef` may appear only as protected admin context.
    No book-cover artwork may be downloaded, rendered, delivered or placed in any
    BOOKSOFHISTORY asset. Design Lab output stays typographic.
  - **What this does not approve:** scraping cover art, a public book catalogue,
    book pages, SEO archive, database, newsletter, storefront or publication.

- [ ] HUMAN_APPROVAL BH-ACCOUNTS-003 — Clear the BOOKSOFHISTORY name and
  handles and authorize the owner to prepare separate Czech and English profile
  lanes on the platforms the owner records here.
  What this approves, exactly:
  - **The lanes:** one `cs` profile and one `en` profile per chosen platform, only
    after the owner records the cleared platform and handle for each. The venture id
    remains `booksofhistory` if a public handle changes.
  - **The bio disclosure:** Czech — „Příběhy za slavnými knihami. Výzkum a text
    vznikají s pomocí AI; člověk je kontroluje, zveřejňuje a odpovídá.“ English —
    “Stories behind famous books. Research and copy are AI-assisted; a human
    reviews, posts and replies.” Any replacement must disclose the same division.
  - **The operating boundary:** signing allows only the owner to create or prepare
    those profiles. Draft packages remain owner-reviewed and manually posted; the
    repository receives no credential, publisher route, scheduler or autopublish
    counter.
  - **What this does not approve:** this session or any agent creating an account,
    touching a channel, posting, replying, following, liking, messaging, buying ads
    or weakening the global social stop.

- [ ] HUMAN_APPROVAL BH-RESULTS-004 — Allow the owner to enter per-post
  BOOKSOFHISTORY results for the Czech and English lanes inside the D9 measurement
  hold.
  What this approves, exactly:
  - **The entry:** after the owner has posted a lane manually, the protected admin
    may record its recommendation id, `cs` or `en` lane, platform, HTTPS post URL,
    capture time and any available non-negative views, likes, comments, shares,
    saves, follows or link taps. At least one result number is required.
  - **The source:** every record says `enteredBy: "owner"`; retries are idempotent.
    The record may mark the referenced paid dossier used and may support a bounded,
    floor-protected performance-weight proposal.
  - **The D9 hold:** automatic metrics ingestion stays disabled. No crawler,
    platform API, pixel, webhook, credential or automatic audience ingestion is
    authorized, and missing numbers remain unavailable rather than zero.
  - **What this does not approve:** account access, posting, editing a live post,
    fabricated results, raw audience data, automatic optimization or a wider
    measurement program.

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

- [ ] HUMAN_APPROVAL BOOK-SOURCE-001 — Provide Door Money's private manuscript
  source and approve the public/private boundary.
  What this approves, exactly:
  - **The private source:** an owner-created private Git repository with a local
    clone outside this public checkout. A fine-grained read-only
    `BOOK_SOURCE_TOKEN` may be kept in Actions secrets and the local environment
    for the owner's checkout step; the shipped runtime does not send it to the
    site, admin or a model. Live ingestion reads the clone passed as
    `--private-root`; scheduled desk runs read `BOOK_PRIVATE_CLONE_PATH`.
  - **The local input:** the English manuscript may be passed with
    `--manuscript` or placed at the gitignored
    `state/ventures/door-money/manuscript/manuscript.md`. Ignored is not
    permission to stage it. Never paste the manuscript into an issue, fixture,
    prompt log or committed state.
  - **The split:** manuscript text, complete chunks, annotations and embeddings
    stay in the private clone. This repository receives hashes, counters, scores,
    labels and contract-validated derivatives only. Every committed excerpt is
    capped at 600 characters; the style profile allows at most 40 exemplars of
    280 characters each.
  - **What it costs:** $0 cash while the private repository uses the owner's
    existing plan. A hosted database, paid storage tier or network client is not
    part of the shipped path and would require a new design and approval.
  Until this item and `BOOK-INGEST-002` are both checked, live ingestion refuses
  before any paid call. A missing or public-repository clone also refuses.

- [ ] HUMAN_APPROVAL BOOK-INGEST-002 — Allow the one-time, resumable Door Money
  knowledge ingestion inside its program envelope.
  What this approves, exactly:
  - **The ceilings:** at most $3.00 for the whole ingestion program, at most
    $0.80 on any day and at most $0.10 for any paid call. These are sub-limits;
    the signed $30 all-in monthly, $25 model/API and $1.00 daily ceilings still
    win.
  - **The model work:** `BOOK_INGEST` uses the configured Anthropic Haiku route
    for bounded annotation, scoring and map work; `BOOK_STYLE` uses the
    configured Sonnet route for one versioned synthesis; the shared guarded
    embeddings wrapper uses `text-embedding-3-small`.
  - **The ledger:** text work remains `kind: "text"`; the vector call records
    `kind: "embedding"`. Every paid call reserves first, records actual usage
    after, and is attributed to `door-money` / `book-ingest`.
  - **What it does not approve:** a database, a public copy of source text, an
    automatic rerun or a budget raise. The owner starts `pnpm book:ingest` and a
    saved cursor resumes the same manuscript hash after a stop.

- [ ] HUMAN_APPROVAL DM-ACCOUNTS-003 — Clear the Door Money name and choose any
  future social accounts.
  What this approves, exactly:
  - **The name:** complete the handle, collision and trademark screen for
    "Door Money" and decide whether the public account instead carries the
    English book title. A hard conflict comes back to the owner; the system does
    not auto-rename the venture.
  - **The accounts:** the owner may choose Instagram, TikTok, X, Threads and/or
    YouTube and creates each account personally. This item provides no
    credential and the system cannot create, configure or contact an account.
  - **The boundary:** Door Money remains drafts-only until this is signed. After
    signing, manual posting is an owner action. Autopublishing, credentials, a
    publisher path, ads and paid promotion each remain outside this approval and
    would need their own decision and every existing social gate.
  - **What it costs:** $0. A domain, trademark service, ad or account purchase is
    a separate spend approval; no such spend is inferred here.

- [ ] HUMAN_APPROVAL DM-RESULTS-004 — Allow owner-entered Door Money post
  results as the venture's only performance evidence inside the D9 hold.
  What this approves, exactly:
  - **What the owner enters:** after manually recording a posted HTTPS URL, the
    owner may type the platform, an outcome note and at least one nonnegative
    count among views, likes, comments, shares, saves, follows and link taps.
  - **What the system does:** store `owner-result-entry/1` with
    `source: "owner-entry"`, show outcome beside intent, and let the Thursday
    room cite that record in bounded playbook or performance-weight proposals.
  - **What stays forbidden:** no analytics client, platform fetch, cookie,
    pixel, follower scrape or inferred metric. `METRICS_INGESTION_ENABLED=false`
    and D9 remain unchanged; missing data remains unavailable, never zero.
  Until this item is checked, the result store refuses the write. Approval does
  not post anything, connect a channel or authorize a model call outside the
  existing Thursday room envelope.

- [ ] HUMAN_APPROVAL TS-SNAPSHOT-001 — Accept Tehdejší svět's hand-committed
  facts file and its no-product-link boundary.
  What this approves, exactly:
  - **The read layer:** the owner may copy eligible public facts into the single
    `tehdejsi-facts/1` file in this repository. The desk verifies the recorded
    content hash before every read and aborts on any mismatch. There is no sync,
    pinned-commit fetch, clone, API call or runtime connection to the product.
  - **The exclusions:** records marked unsafe to share and excluded city media
    must be absent structurally before the file is committed. Leader profiles
    remain context only and cannot become feature subjects.
  - **The cost:** copying, hashing, validation and daily reads cost `$0`; this
    approval adds no account, credential, provider or data purchase.
  - **What this does not approve:** any read from or write to the product
    repository, automatic import, product-data edit, publication or weakening of
    source, sensitivity, licence or owner-review gates.

- [ ] HUMAN_APPROVAL TS-MEDIA-002 — Allow the nineteen eligible licensed city
  photographs in Tehdejší svět social drafts with attribution.
  What this approves, exactly:
  - **The deliberate divergence:** eligible Wikimedia/CC BY-SA city photographs
    may appear in social cards even though the product's own share-image rule is
    narrower. The product and its assets remain unchanged.
  - **The licence path:** every photo must be present as recorded local bytes and
    carry its creator/source/licence attribution on the rendered card and in its
    licence-respecting caption. An excluded image or incomplete credit fails the
    package before owner review.
  - **What stays forbidden:** AI-generated historical imagery, national flags as
    brand elements, remote image fetches during rendering, destruction-comparison
    imagery for cities under attack or occupation, and any automatic post.

- [ ] HUMAN_APPROVAL TS-ACCOUNTS-003 — Clear the Tehdejší svět handles and
  authorize the owner to prepare one bilingual profile on Instagram, Facebook and
  Threads.
  What this approves, exactly:
  - **The launch preconditions:** the product's production domain and absolute OG
    URLs must land first; `dontwannaknow.vercel.app` must never appear in a bio.
    The owner records the collision/trademark check and clearance for
    `@tehdejsisvet` (or the chosen fallback) before creating an account.
  - **The bilingual bio:** “Svět, ve kterém vyrůstali lidé, na kterých vám záleží.
    Світ, у якому виростали ваші близькі. CZ · UA · zdroje u každého příběhu.”
    Facebook may add the owner-approved methodology sentence. No flag emoji or
    unsupported product claim may be added.
  - **The operating boundary:** signing authorizes only the owner to create and
    configure the profiles. Every package remains owner-reviewed and manually
    posted; the repository receives no credential, publisher or scheduler.
  - **What this does not approve:** this session or any agent creating an account,
    touching a channel, posting, replying, joining groups, messaging, buying ads or
    weakening the social triple-lock.

- [ ] HUMAN_APPROVAL TS-RESEARCH-004 — Allow bounded Tehdejší svět marketing
  research through the existing shared provider.
  What this approves, exactly:
  - **The ceilings:** at most `$0.30` per brief and `$2.00` per month, inside the
    immutable `$0.10` per-call, `$1.00` daily, `$25` model/API and `$30` all-in
    portfolio limits. Every call reserves first and records actual use after.
  - **The priorities:** Ukrainian coverage gaps first, then names and music. A
    reusable cited dossier wins before new spend; one canonical dossier supports
    both language passes.
  - **The product boundary:** research is venture marketing data only. A useful
    product finding becomes a cited product-insight queue entry for the owner; it
    is never written, synced or promoted into the product automatically.
  - **What this does not approve:** a new provider, account, credential, product
    data source, uncited claim, higher ceiling, post, outreach or paid distribution.
    Missing approval keeps research on the `$0` path.

- [ ] HUMAN_APPROVAL TS-RESULTS-005 — Allow owner-entered Tehdejší svět results
  and owner-pasted comment harvests as its only measurement.
  What this approves, exactly:
  - **The result entry:** after the owner records a manually posted HTTPS URL, the
    protected admin may save available non-negative platform counts and an outcome
    note. Missing values remain unavailable, never zero; retries are idempotent.
  - **The memory entry:** the owner may paste selected comments. Extraction may
    group themes, requests and corrections, but every recollection stays labelled
    as a recollection and cannot become a historical fact or override a source.
  - **The D9 hold:** `METRICS_INGESTION_ENABLED=false` remains in force. No product
    analytics, social API, crawler, pixel, webhook, cookie, scrape, audience profile
    or automatic comment collection is authorized.
  - **What this does not approve:** account access, posting, replying, fabricated
    results, personal-data enrichment, automatic optimisation, outreach or a wider
    measurement programme.

- [ ] HUMAN_APPROVAL KV-APIFY-001 — Extend the existing Free-plan Apify scope to
  Kvórum's single reviewed public Facebook page monitor.
  What this approves, exactly:
  - **The source:** only the pinned Facebook Posts Scraper build reading logged-out
    public posts from `facebook.com/stitdemokracie`, at most once a day and thirty
    rows, through the fixed-field mapper. No login, cookie, comment or private-person
    data is allowed.
  - **The spend and retention:** a `$2.00` monthly Kvórum share inside the existing
    Free-plan credit, with current `$0.151` reservations and a 30-day raw purge.
    `APIFY-ACCOUNT-001` remains a separate prerequisite; a spent share skips work.
  - **What this does not approve:** another page or actor, a plan upgrade, a card,
    account creation, posting, outreach, paid amplification or a higher budget.

- [ ] HUMAN_APPROVAL KV-SOURCES-002 — Allow Kvórum to read the seven exact free
  feed endpoints recorded in `config/kvorum-sources.json`.
  What this approves, exactly:
  - **The hosts:** the recorded iROZHLAS, ČT24, Deník N, Seznam Zprávy,
    Poslanecká sněmovna, Vláda ČR and Czech Google News endpoints, each with
    its current network-allowlist entry and authority checks.
  - **The boundary:** a missing approval keeps every live feed read closed and the
    committed fixture remains the `$0` source. A new host, endpoint or adapter needs
    another review.
  - **What this does not approve:** scraping beyond those endpoints, a credential,
    model call, post, account, outreach, payment or budget change.

- [ ] HUMAN_APPROVAL KV-ACCOUNTS-003 — Clear the Kvórum name and handles and allow
  the owner to prepare any chosen Instagram, Facebook, Threads or X profiles.
  What this approves, exactly:
  - **The owner action:** after the collision and trademark check, the owner may
    create the selected profiles and use a bio that states AI assists drafts and a
    human approves every post.
  - **The operating boundary:** Kvórum remains drafts-only. Signing creates nothing,
    supplies no credential and grants no publisher, scheduler or autopublish path.
  - **What this does not approve:** this session or an agent creating an account,
    touching a channel, posting, replying, messaging, buying ads or weakening the
    social, treasury or budget gates.

- [ ] HUMAN_APPROVAL KV-EDITORIAL-004 — Countersign Kvórum's political editorial
  constitution as the owner policy already enforced by its gates.
  What this approves, exactly:
  - **The rules:** Štít remains discovery rather than evidence; factual claims stay
    typed and referenced; public figures only; election claims use the higher source
    bar; corrections remain linked and the owner reads every final draft.
  - **The prohibitions:** no vote call, endorsement, unsupported crime accusation,
    voter mockery, alarm register, paid amplification or concealed AI assistance.
  - **What this does not approve:** a source, account, publication, channel action,
    outreach, model call, payment, treasury movement or budget change.

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
- [ ] **caught-up release reverted** — package `cf7602a63515` failed post-deploy verification and was reverted in `6d31084fa3be`. Proof: `state/release-proofs/caught-up/cf7602a6351592e247c28c5bc957d64e7a5f7e60809de1b81f84074657c121b9.json`. [owner:me]

- [ ] **CAUGHT-UP-DELIVERY-2026-08-17** — post_deploy_verification: Delivery stopped without a reconciled target commit.
  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]

- [ ] **DELIVERY-QUEUE-CAUGHT-UP** — the publish queue is not draining.
  Oldest held item: 2026-08-17 edition (post_deploy_verification).
  Live counts are in state/delivery/queue-health/, rewritten every day. A parked package needs
  new bytes rather than another run; its own receipt says what the magazine refused and why.
  [imp:5] [owner:me] [time:30m] [kind:deploy]

- [ ] **DELIVERY-NOT-BUILT-CAUGHT-UP** — delivered but not being served.
  https://caughtup-ai.vercel.app/data/board/2026-08-19.json answers 404, so the host has not rebuilt since 2026-08-19 landed on main.
  Nothing is wrong with the package: the commit is on main and its gate was green. This is the
  build that never ran. An empty commit to the magazine's main triggers one; if that is what it
  takes twice, the host's git integration is the thing to look at.
  [imp:5] [owner:me] [time:15m] [kind:deploy]
