# NEEDED — what the owner has to do

**This is the only owner document.** It replaces `NEEDED.md`, `NEEDS_YOUR_HELP_NOW.md` and
`MANUAL STEPS.md`, which were three views of one list. Git cannot inspect a secret's value or an
external account's settings, so an item stays unchecked until you have seen it in the provider's
own UI. Never paste a credential into Git, an issue, a meeting record or chat.

Every task carries the shared marker format:
`- [ ] **Title** — description. [imp:1-5] [owner:me|ai] [time:30m] [kind:setup|deploy|legal|content|decision]`

Updated: 2026-08-28.

---

## The launch shortlist — 2026-08-28

The owner set the launch set: DNESKAi, MMA Files, marketingShark, BOOKSOFHISTORY, Tehdejší
svět, Kvórum, plus the owner-only Personal Growth desk. Titty Tuesdays, Door Money, WebDev
Signal and Contest Radar wait until after launch. The implementation half lives in
`docs/LAUNCH-BUILD-PROMPT.md` and becomes a GitHub issue program; this shortlist is the owner
half, ordered by what unblocks the most. Every referenced item already exists below or in
`state/INBOX.md` — tick it where it lives, not here.

- [x] **Merge the release-gate repair** — done 2026-08-29 in #460 and #461. The gate had been red
  since 28 August 15:00 UTC and every council room since had recorded a skip.
- [x] **Create the launch issue program** — done 2026-08-29. #462 is the parent; #463–#473 are the
  eleven children, in working order. #463's outage half is already closed.

- [x] **Countersign the two drafted decision records** — both are written and waiting only for your
  status line and signature. They are one story and should be signed together:
  `state/decisions/2026-08-29-launch-idea-room-hold.md` holds `cu-product` and `tt-marketing` for
  the launch period, and `state/decisions/2026-08-12-kvorum-budget-capacity.md` claims the `$0.08`
  that the second hold frees, which is exactly what Kvórum's capacity gate requires. Signing both
  stops the idea rooms you said aren't earning their keep and opens Kvórum's desk. Neither grants a
  source, account, credential or publishing authority. [imp:5] [owner:me] [time:20m] [kind:decision]

**Owner setup completed 2026-08-29.** The Apify token, the `/admin` credentials,
`PORTFOLIO_LIVE_ENABLED` and `CAUGHT_UP_STREAMS_ENABLED` are all set, the launch-set approvals are
ticked and the five launch decisions countersigned. Two things follow from that and are worth
knowing before reading the rest of this list:

- **marketingShark spends about $0.035 a day and has never produced a package.** Nineteen paid
  `ms-daily` calls since 8 August, seventeen of them billed at exactly 3,000 output tokens — CHUM's
  `maxOutputTokens` in `config/models.json`. The reply is truncated mid-package and the room
  recorded it as `model-output-invalid`, so the cause read as a bad model rather than a small cap.
  The reporting is fixed; the cure is a cap raise, which is spend and therefore yours. See below.
- **Titty Tuesdays and Door Money remain unsigned on purpose**, being outside the launch. Their ten
  approvals are the ones still unticked in `state/INBOX.md`.

- [ ] **Decide CHUM's output cap** — a bilingual five-slide package does not fit in 3,000 output
  tokens and has never once fitted. Raising it is the only thing standing between marketingShark
  and its first draft. At the measured rate for `claude-sonnet-5` (about $2/MTok in, $10/MTok out)
  each 500 extra tokens costs about $0.005 a call, so 4,500 lands near $0.050 against the room's
  `$0.10` daily envelope, which also has to cover the one retry. Either raise it in
  `config/models.json` and accept roughly $1.50/month for a venture that currently returns nothing
  for $1.05, or turn the room off until it is worth running. Doing neither keeps paying for
  truncated replies every morning. [imp:4] [owner:me] [time:10m] [kind:decision]

Then, in order, the existing items:

1. **Countersign the launch foundings** — Kvórum, BOOKSOFHISTORY and Tehdejší svět from the
   four 12 August founding decisions (Door Money can wait), plus `KV-EDITORIAL-004`. The Kvórum
   capacity record is drafted and listed above.
2. **Create the Apify account** — `APIFY-ACCOUNT-001`, then `KV-APIFY-001` and
   `KV-SOURCES-002` (Kvórum's Facebook page + seven Czech feeds); `APIFY-MMA-SOURCES-001` is
   optional. Add the free Podcast Index key pair. Fill `state/ventures/goviral/profile.md` —
   GoVIRAL has never run for want of exactly these.
3. **Flip the switches** — `PORTFOLIO_LIVE_ENABLED=true` (opens the venture rooms including
   the Personal Growth desk) and `CAUGHT_UP_STREAMS_ENABLED=true`.
4. **Set the `/admin` production credentials** — `ADMIN_USER`, `ADMIN_PASSWORD`,
   `BOARDLESSAI_GITHUB_TOKEN`; without them every admin write stays read-only.
5. **Merge the mma-files hero-correction branch** — `claude/article-image-selection-61rs70`
   in `lukaskourilcz/mma-files`; the two wrong heroes stay live until it lands.
6. **Content approvals for the two held desks** — `TS-SNAPSHOT-001`, `TS-MEDIA-002` and the
   12-feature bank for Tehdejší svět; `BH-RESEARCH-001`, `BH-SEED-002` and the launch
   questions for BOOKSOFHISTORY.
7. **Clear handles, then create the accounts yourself** — Instagram + Threads for DNESKAi and
   MMA Files (the credential table under "Only before social posting" below is ready for later
   API posting), `BH-ACCOUNTS-003`, `TS-ACCOUNTS-003` (domain first), `KV-ACCOUNTS-003`.
   Personal Growth uses the existing `lukaskouril93`. Manual posting from the admin's packs is
   the launch mode; tokens and `SOCIAL_KILL_SWITCH=false` come only after the activation
   counters pass.
8. **Pick the launch five in the Design Lab** — walk the template families, save presets for
   the five you want per brand and set them live; decide the DNESKAi lockup line while you are
   there.
9. **Review the curated scene proposals** — both magazines' queues; the curated rung is the
   cheapest cure for FRAME-plate covers and it only grows when you tick lines.
10. **Leave analytics, monetization and Titty Tuesdays where they are** — deliberately parked;
    reopening any of them is a new decision, not a launch task.

---

## Blocking output right now

In the order that unblocks the most. Each of these is a switch, a key or an account, and each one
is the single thing standing between a proven path and a working one.

- [ ] **Verify the linked Quorum Vercel project** — from the repository root run
  `pnpm exec vercel link`, select the existing Quorum team/project, and confirm in its settings
  that Root Directory is `site`. Do not create a duplicate project. [imp:5] [owner:me] [time:10m]
  [kind:setup]

- [ ] **Disable Vercel On-Demand Concurrent Builds** — inspect the Quorum project setting and turn
  it off if it is currently enabled; do not change the paid plan. [imp:3] [owner:me] [time:5m]
  [kind:setup]

- [ ] **Configure Vercel Spend Management** — add useful build-spend notifications and a sensible
  soft or hard limit for the Quorum project without purchasing a plan or add-on. [imp:4]
  [owner:me] [time:10m] [kind:setup]

- [ ] **Inspect the Vercel build machine** — confirm the assigned machine and remove an
  unjustified Enhanced or Turbo override; keep a larger machine only with a recorded reason.
  [imp:3] [owner:me] [time:5m] [kind:decision]

- [ ] **Verify the Git deployment guard after release** — after the production deployment that
  carries `git.deploymentEnabled: false`, push a normal source commit and confirm that it creates
  no Vercel deployment while GitHub CI still runs. [imp:5] [owner:me] [time:10m] [kind:deploy]

- [ ] **Verify one manual preview and production release** — run `pnpm deploy:check`, deploy one
  prebuilt preview, inspect environment-specific routes and cron configuration, then run the
  guarded production command. If prebuilt output is not viable, record the exact limitation
  before using the explicitly confirmed one-cloud-build fallback. [imp:5] [owner:me] [time:30m]
  [kind:deploy]

- [x] **Switch the DNESKAi streams on** — set the Actions variable
  `CAUGHT_UP_STREAMS_ENABLED=true`. Until then `/o-cem-se-mluvi` and `/podcasty` render their
  honest empty states, which is the correct state and costs nothing. The delivery steps live
  inside the existing daily cycle, call no model and spend nothing from the model share; the
  only thing switching them on changes is that two committed JSON files start moving.
  [imp:3] [owner:me] [time:5m] [kind:setup]

- [ ] **Decide on the nightly content scoring** — set the Actions variable
  `CONTENT_GATE_ENABLED=true` to have one comparative model call score each day's published
  articles and dataset appends, recorded to `state/ventures/<venture>/content-scores/`. It is
  capped at $0.05 a call and is the first rung the budget ladder drops, so a tight month loses the
  scoring before it loses a room. Off is the default and off writes nothing.
  [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Decide on the Monday retro meeting** — set `WEEKLY_RETRO_ENABLED=true` to have two seats
  read the weekly report the night writes and add a short summary plus up to three fix tasks.
  Capped at $0.05 a week. With it off, the weekly report still gets written and simply carries no
  written summary, which is a complete report rather than a gap.
  [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Sign the six Titty Tuesdays image approvals, or decide not to** — `TT-VISUALS-SPEND-001`
  through `TT-VISUALS-CONTRACT-006` in `state/INBOX.md`, all-or-nothing. They cover about $0.057 a
  day (roughly $1.70 a month, ceiling $2.00), the two renderer routes, keeping the images inside
  `state/` rather than the public site, the doctrine checklist and the delete-on-doctrine rule, the
  daily two-image shape, and the `design-proposal/1` contract. Nothing renders until all six are
  ticked and `TT_VISUALS_ENABLED=true` with both `OPENAI_API_KEY` and `FAL_KEY` present.
  [imp:3] [owner:me] [time:20m] [kind:decision]

- [ ] **Create the free Podcast Index key pair** — register at api.podcastindex.org and add
  `PODCASTINDEX_API_KEY` and `PODCASTINDEX_API_SECRET` to the quorum Actions secrets. It is free
  and it is only used for shows with no workable RSS or YouTube surface, so its absence degrades
  a few shows rather than the podcast stream. A live dry run without it already returns nine
  episodes. [imp:2] [owner:me] [time:15m] [kind:setup]

- [ ] **Confirm the curated source registry** — `config/caught-up-streams.json` seeds three Medium
  tags, nine Substacks and eight podcast shows. Eight shows ship `enabled: false` with a note
  because their channel id could not be resolved without guessing, and two empty slots wait for
  the Czech AI shows you pick. Approve, edit or fill; every entry must carry its exact hostname,
  and a test fails if an enabled host is missing from `config/network-allowlist.json`.
  [imp:3] [owner:me] [time:30m] [kind:decision]

- [x] **Set the `/admin` credentials in Vercel production** — done 2026-08-29. It needs
  `ADMIN_USER`, `ADMIN_PASSWORD` and a fine-grained `BOARDLESSAI_GITHUB_TOKEN`, plus
  `BOARDLESSAI_GITHUB_REPOSITORY` and `BOARDLESSAI_GITHUB_BRANCH` if you are not using the
  defaults, which are `lukaskourilcz/quorum` and `main`. All of them are read by the site alone
  and belong on the Vercel project; no workflow references any of them, so putting them in Actions
  secrets would leave the door shut.

  **The token needs two permissions, not one.** This entry used to name only Contents read/write,
  which is what saves a record back. The same token also POSTs to
  `actions/workflows/cycle.yml/dispatches` in `site/src/lib/mma-banner-delivery.ts`, so it needs
  **Actions read and write** as well. A Contents-only token passes every check until the first
  banner delivery, which then fails with a 403 — worth confirming on the token already issued.

  `ADMIN_PASSWORD` is also a signing secret, not just a password: the admin session cookie is an
  HMAC keyed on `boardlessai-admin\0<user>\0<password>`, so prefer something long and random over
  something memorable. Changing either value invalidates every live session at once, which is the
  way to log yourself out everywhere. Sessions last eight hours.
  [imp:5] [owner:me] [time:10m] [kind:setup]

- [x] **Create an Apify account on the Free plan and add `APIFY_TOKEN` to Actions secrets** — the
  single unblock for GoVIRAL's trend scouting. Free plan only: no card, and its $5 of monthly
  platform credit is the budget guard — when the credit is spent the actors stop, so an overspend
  is not possible. The weekly recipe uses about $1.03 of it and a month about $4.60, so the cash
  cost is $0 now and on renewal. The six pinned actors read logged-out public Instagram and Threads
  posts and none of them takes a login or a cookie, so your own accounts are never involved and
  carry no ban risk from this. Without the token everything still runs: the Monday room opens,
  finds no scout data, records that in one sentence and spends nothing. **Never upgrade the plan
  without a new approval**: Starter is $29/month, which would consume more than half of the $50
  all-in cap. `state/INBOX.md` carries this as `APIFY-ACCOUNT-001`.
  [imp:4] [owner:me] [time:10m] [kind:setup]

- [x] **Approve the reviewed MMA scope for the same Apify token** — `APIFY-MMA-SOURCES-001` in
  `state/INBOX.md` authorizes only the terms-reviewed Tapology promotion-page reference step.
  UFCStats and ESPN remain disabled and Sherdog remains blocked; approval does not turn them on.
  The current runnable plan is $0 cash and at most $0.20/month of Free-plan credit, beneath a
  separate $3 hard cap. Without both this approval and `APIFY_TOKEN`, the path is a logged $0
  no-op. Read the shared-credit warning before approving this alongside GoVIRAL.
  [imp:4] [owner:me] [time:5m] [kind:decision]

- [x] **Approve Kvórum's one-page Apify scope** — read and countersign `KV-APIFY-001` in
  `state/INBOX.md`. It covers only the pinned Facebook Posts Scraper build on the logged-out public
  page `facebook.com/stitdemokracie`, at most once a day and 30 rows, with a fixed-field mapper and
  30-day raw purge. The `$2.00` monthly venture share sits inside the existing Free-plan credit and
  still depends on `APIFY-ACCOUNT-001`; current `$0.151` run reservations mean the guard will skip
  days rather than fund a full month. No login, cookie, second page or plan upgrade is approved.
  [imp:4] [owner:me] [time:10m] [kind:decision]

- [x] **Approve Kvórum's seven free feed hosts** — `KV-SOURCES-002` in `state/INBOX.md` names the
  exact iROZHLAS, ČT24, Deník N, Seznam Zprávy, Poslanecká sněmovna, Vláda ČR and Czech Google News
  endpoints and allowlist hosts. Check those URLs and countersign the registry, or leave it pending;
  without approval every live feed read fails closed and the committed fixture remains the `$0`
  source. A new host or endpoint is a new review.
  [imp:4] [owner:me] [time:15m] [kind:decision]

- [x] **Countersign Kvórum's editorial constitution** — `KV-EDITORIAL-004` in `state/INBOX.md`
  records the policy already enforced by the gates: Štít is discovery rather than evidence;
  factual claims are typed and referenced; public figures only; no vote call, endorsement,
  unsupported crime accusation, voter mockery, paid amplification or alarm register; election
  claims use the higher source bar; corrections remain linked and the owner reads every final
  draft. This approval grants no source, account, publishing, budget or treasury authority.
  [imp:5] [owner:me] [time:15m] [kind:decision]

- [ ] **Fill in `state/ventures/goviral/profile.md`** — the writer half of the weekly brief: your
  niches, your voice, your audiences, and what you never write about. Nothing in it is generated
  and nothing should be; until you fill it in the room leans on the two magazine niches and says so
  plainly in the brief rather than inventing a voice for you. Half-thoughts and bullets are fine;
  it is read as data, never as instructions. [imp:4] [owner:me] [time:20m] [kind:content]

- [ ] **Rate the Titty Tuesdays idea cards in `/admin`** — the marketing room writes concrete
  campaign ideas every day and nothing has ever rated one, so the taste loop that turns your
  ratings into written style rules has no input and PALATE has nothing to work from. Nine cards sit
  unrated under the venture's ideas tab, every one still `proposed`
  (`state/ideas/titty-tuesdays/ledger.jsonl`); the count grows by roughly one a day until you rate
  them. Rating them is the whole of what starts the loop.
  [imp:4] [owner:me] [time:20m] [kind:decision]

- [ ] **Record the fal.ai prepaid credit in the finance state** — the prepayment on 2026-08-08
  is real operating spend under the $50 all-in cap, and only the owner records payments: add the
  amount and date where LEDGER reconciles (`state/treasury/` / `state/FINANCE.md`) so the monthly
  numbers include it. [imp:3] [owner:me] [time:5m] [kind:decision]

- [ ] **Finish the Vercel half of the aifirst credential audit** — the retired `ANTHROPIC_API_KEY`
  Actions secret is deleted; old source, image, promotion, heartbeat and generation-report
  credentials in the aifirst Vercel project are still open, and keys pasted into chat still want
  rotating. Tracked in `aifirst/NEEDED.md`. [imp:4] [owner:me] [time:15m] [kind:setup]

---

## Yours to decide

Judgement calls. Nothing is blocked on code for any of these.

- [ ] **Countersign or decline WebDev Signal's founding boundary** — review
  `state/decisions/2026-08-28-webdev-signal-founding.md`, check the working name and exact
  Instagram/Threads handles without creating an account, and accept or reject
  `WEBDEV-SIGNAL-FOUNDING-001`. Approval confirms the two-edition evidence policy, proposed
  `$0.03` selected-day / `$0.75` monthly ceiling and shared 05:00 Prague checkpoint; it grants no
  source, model, account, OAuth, render or publishing authority. [imp:4] [owner:me] [time:20m]
  [kind:decision]

- [x] **Sign or decline `BH-RESEARCH-001`** — decide whether BOOKSOFHISTORY may use
  web search on the existing Anthropic key. The item in `state/INBOX.md` fixes gather
  calls at five searches, QUILL checks at one to three, research at no more than
  `$0.10` per call, `$0.50` per cycle and `$5.00` per month, and requires the ledger,
  shelf-first reuse and `(bookId, briefHash)` idempotency. It creates no account or
  credential. Until signed, live research must remain `$0`.
  [imp:4] [owner:me] [time:10m] [kind:decision]

- [x] **Review and sign or decline `BH-SEED-002`** — inspect the authored 200-book
  seed library and accept only if its scores and notes read as editorial priors, never
  facts. The same item keeps every `coverRef` in protected admin context: no cover
  artwork may be downloaded, rendered or delivered, and only dossier claims may enter
  feature copy. [imp:3] [owner:me] [time:30m] [kind:content]

- [x] **Clear the two lanes and sign or decline `BH-ACCOUNTS-003`** — record the
  chosen platforms and cleared handles for separate Czech and English profiles, then
  approve the Czech and English AI-disclosure bio lines in `state/INBOX.md`. Signing
  lets only you create or prepare those profiles; agents still cannot create an
  account, touch a channel or post, and every package remains a draft for manual
  posting. [imp:3] [owner:me] [time:30m] [kind:legal]

- [x] **Sign or decline `BH-RESULTS-004`** — decide whether the protected admin may
  accept your manual per-lane post URL and any available views, likes, comments,
  shares, saves, follows or link taps. This is the only BOOKSOFHISTORY measurement
  source: D9 and `METRICS_INGESTION_ENABLED=false` stay in force, no platform is read,
  and absent numbers remain unavailable. [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Review and countersign or decline the four 12 August founding decisions** — read
  `state/decisions/2026-08-12-kvorum-founding.md`,
  `state/decisions/2026-08-12-booksofhistory-founding.md`,
  `state/decisions/2026-08-12-door-money-founding.md` and
  `state/decisions/2026-08-12-tehdejsi-svet-founding.md`. Each implemented venture remains
  fixture-only until its own countersignature and approvals are complete. Kvórum additionally
  needs a countersigned capacity reallocation that frees at least `$0.08` before a live desk.
  [imp:4] [owner:me] [time:75m] [kind:decision]

- [x] **Review the facts file and sign or decline `TS-SNAPSHOT-001`** — confirm that
  `state/ventures/tehdejsi-svet/facts.json` contains only facts copied by a
  human, structurally omits unsafe records and excluded media, and is the only daily
  read layer. Signing does not authorize a fetch, clone, sync or any connection to the
  product repository; a hash mismatch keeps the desk closed at `$0`.
  [imp:5] [owner:me] [time:20m] [kind:content]

- [x] **Sign or decline `TS-MEDIA-002`** — decide whether the nineteen eligible
  Wikimedia/CC BY-SA city photographs may appear in Tehdejší svět social cards with
  creator/source/licence attribution on the card and in the caption. Excluded media,
  incomplete credits, AI-generated historical imagery and destruction comparisons
  remain blocked. [imp:4] [owner:me] [time:15m] [kind:legal]

- [ ] **Land the production domain, clear the handle and sign or decline
  `TS-ACCOUNTS-003`** — finish the product's existing `[imp:5]` domain task and
  absolute OG URLs, then clear `@tehdejsisvet` (or record a fallback), approve the
  no-flags bilingual bio in `state/INBOX.md`, and personally create the Instagram,
  Facebook and Threads profiles if approved. `dontwannaknow.vercel.app` must never
  appear in a bio; no agent receives a credential or channel.
  [imp:5] [owner:me] [time:40m] [kind:setup]

- [x] **Sign or decline `TS-RESEARCH-004`** — decide whether the existing shared
  provider may research the Ukrainian coverage gap, names and music at no more than
  `$0.30` per brief and `$2.00` per month. Research stays venture-side marketing data;
  product-worthy findings stop in the owner-controlled insight queue.
  [imp:3] [owner:me] [time:10m] [kind:decision]

- [x] **Sign or decline `TS-RESULTS-005`** — decide whether the protected admin may
  accept owner-entered post results and owner-pasted comments as the venture's only
  measurement. D9 stays in force: no product analytics, platform API, scrape, pixel,
  cookie or automatic comment collection; recollections never become facts.
  [imp:3] [owner:me] [time:10m] [kind:decision]

- [ ] **Approve Tehdejší svět's first 12-feature content bank** — review both language
  packages, their source coverage, tier labels, licences, send-target questions and
  Design Lab previews before day 1. Approval of an individual feature still does not
  create an account or post it; the owner performs every external post by hand.
  [imp:4] [owner:me] [time:60m] [kind:content]

- [ ] **Decide whether the product should move from Vercel Hobby to the existing Pro
  team** — this is likely `$0` marginal but remains a product-side owner decision.
  Tehdejší svět does not move the product, change its plan or infer permission from the
  BoardlessAI Pro subscription. [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Answer the BOOKSOFHISTORY launch questions** — lane priority (both at once, or
  English first with Czech two weeks behind), the starting cycle length (3 days or 4),
  and any must-include books or hard exclusions to append or correct in the authored
  200-entry seed library before its first live cycle. All three are listed in the
  design's "Open questions".
  [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Approve Door Money's private source (`BOOK-SOURCE-001`)** — confirm that the English
  manuscript exists, create its private Git repository and keep the working clone outside this
  public checkout. Put the manuscript at the gitignored local path or pass it explicitly to the
  CLI; set `BOOK_PRIVATE_CLONE_PATH` for a local live desk. The optional fine-grained
  `BOOK_SOURCE_TOKEN` is only for the owner's read-only checkout step: the shipped runtime does not
  fetch a hosted database or send the token to the site. Check the matching item in
  `state/INBOX.md` only after accepting the 600-character excerpt cap, the 40 × 280-character
  exemplar cap and the rule that full text, chunks and embeddings stay private. Also record any
  English-edition launch date the growth room should plan backwards from.
  [imp:5] [owner:me] [time:20m] [kind:setup]

- [ ] **Approve and run the bounded ingestion (`BOOK-INGEST-002`)** — review the exact roles and
  ceilings in `state/INBOX.md`: $3.00 for the program, $0.80 per day and $0.10 per call, all still
  under the company caps. After both book approvals are checked, run
  `pnpm book:ingest -- --manuscript <ignored-path> --private-root <private-clone>` locally. A stop
  is resumable for the same manuscript hash; do not copy the source or private output into this
  repository to make a hosted run convenient.
  [imp:4] [owner:me] [time:20m] [kind:decision]

- [ ] **Clear Door Money and choose future accounts (`DM-ACCOUNTS-003`)** — finish the shared
  handle/collision/trademark screen for "Door Money", decide whether the account should instead
  carry the English book title, and choose any of Instagram, TikTok, X, Threads or YouTube. Check
  the matching item in `state/INBOX.md` before creating an account. You create and configure it;
  BoardlessAI remains drafts-only and has no credential, publisher or autopublish permission.
  [imp:3] [owner:me] [time:20m] [kind:legal]

- [ ] **Approve manual Door Money results (`DM-RESULTS-004`)** — decide whether views, likes,
  comments, shares, saves, follows and link taps typed from the platform's own screen may become
  `owner-result-entry/1` evidence. Check the matching item in `state/INBOX.md` to open that admin
  save; until then it fails closed. This remains inside D9: no analytics account, API, cookie,
  pixel, scrape or automated ingestion, and missing results remain unavailable rather than zero.
  [imp:3] [owner:me] [time:5m] [kind:decision]

- [ ] **Pick Kvórum's desk hour** — the design defaults to 21:00 Prague (full-day
  harvest, you review in the evening, posts go out next morning). If same-evening
  posting matters more than a complete day, the slot is 12:00 instead. One registry
  field, decided at founding, awkward to move later without a decision.
  [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Walk the thirteen new template families and say which ones you want in rotation** — open
  `/admin?venture=design-lab&tab=studio`, pick a delivered article and click through the chips.
  Thirteen of the twenty-three are new: billboard, broadsheet, zurich, concrete, terminal,
  marginalia, memo, versus, tally, counterweight, throughline, quiet, offset. All of them are in
  the pool already, because the engine deals from every registered family — so if one of them is
  not something you want going out unattended, the way to take it out is to save presets for the
  ones you do want and set them live, which narrows the pool to your list. Nothing here needs a
  key, an account or a payment; the renderer calls no model and this whole expansion cost $0.
  [imp:3] [owner:me] [time:20m] [kind:decision]

- [ ] **Decide what the carousel lockup says** — the kicker on every deck reads DNESKAi and the
  wordmark under it still reads CAUGHT UP, because `logoText` is the venture's registered mark and
  the kicker is the magazine's public name. On a slide a reader sees both at once and they
  disagree. Changing the wordmark to DNESKAi is one line in `CAROUSEL_BRANDS`; leaving it is a
  defensible answer too, since Caught Up is what the feed, the structured data and the deployment
  still say. It is a naming call, not an engineering one, which is why nothing here decided it.
  [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Rename the DNESKAi Vercel project and decide on a domain** — DNESKAi is the wordmark in the
  navigation, the footer and print; the page title, the social cards, the structured data and the
  Atom feed still say "Caught Up", which was your call and is not a bug. The deployment is still at
  `caughtup-ai.vercel.app`, the repository is still `aifirst`, and the venture is still `caught-up`
  in every contract and Actions variable — all deliberate, so that sealed package hashes and your
  existing settings keep working. The public URL is the one part only you can change. Delivery
  receipts record the article URL they published to, so changing the project name means the older
  receipts point at the old host. [imp:3] [owner:me] [time:20m] [kind:setup]

- [ ] **Enter actual fixed monthly costs in `/admin` — or leave the flag as your answer** —
  `config/fixed-costs.json` carries `confirmedNoFixedCosts: true`, which says "there are none"
  rather than "nobody has entered any". If that is right, tick this. If you do pay for something,
  enter each subscription with its monthly USD amount, category and first-paid date: that registry
  feeds the non-API half of the all-in total measured against the $50 cap (`allInNonApiSpentUsd` in
  `orchestrator/src/budget.ts`), so a wrong answer makes the company look cheaper than it is. Do
  not enter example prices. [imp:3] [owner:me] [time:15m] [kind:setup]

- [ ] **Merge `claude/article-image-selection-61rs70` in the mma-files repository** — the two
  wrong heroes are corrected on this side and cannot reach the magazine until that branch is on
  its `main`. A delivered article is immutable there by date and slot, which is what stops a
  published piece being swapped; the branch adds the one narrow exception, an
  `article-image-correction/1` block whose claim the consumer re-checks itself, and refuses
  anything where more than the picture differs. Its own `npm test` is green at 27, including two
  new cases. Once merged, the next two cycles deliver the corrections through the normal outbox
  and the government official and the firearms range stop being live assets.
  [imp:4] [owner:me] [time:5m] [kind:deploy]

- [ ] **Replace three curated MMA photographs that no longer exist on Commons** — probed on
  2026-08-09: `UFC Fight Night Belfast weigh-ins (29923390484).jpg`, `MMA gloves (Unsplash).jpg`
  and `O2 arena Praha 2019.jpg` all return `missing`. The rotation in
  `orchestrator/src/images/illustrative.ts` skips them, so nothing breaks and every article that
  reaches that rung simply loses its first choice; six of the nine still resolve. Finding
  replacements is the curated-set rule: open a candidate at 640px, check that no face in it is
  recognisable, write the Czech scene line. The scene-proposal queue below is where candidates
  now collect. [imp:2] [owner:me] [time:30m] [kind:content]

- [ ] **Review the curated scene proposals both magazines are collecting** — when the vision gate
  approves a licensed-search photograph at fit 8 or better with no vetoes, it is appended as an
  unchecked line to `state/ventures/caught-up/media/scene-proposals.md` or the mma-files file
  beside it, with its provider, licence, source URL and a drafted Czech scene line. Each one
  already ran above a published article. Ticking a line nominates it: a later session opens it at
  640px, checks that no face in it is recognisable, and moves it into the curated set, which is
  the rung with the most predictable covers and currently the smallest. The queue stops at twenty
  open lines, so an unreviewed backlog quietly stops the flywheel rather than growing.
  [imp:2] [owner:me] [time:20m] [kind:content]

- [ ] **Write season 002 for Titty Tuesdays before 2026-10-30** — season 001 expires then and the
  marketing room works from the current season; with none it has a standing objective and no
  material. The warning appears in the room's own daily brief as the date approaches.
  [imp:2] [owner:me] [time:60m] [kind:content]

- [ ] **Decide the two efficiency-review calls.** Both were measured against the ledger and both
  are product decisions rather than engineering ones:
  1. *May the DNESKAi edition arrive at 09:00?* Every delivered edition except 6 August needed the
     09:00 retry, and every retry that ran succeeded — so 05:00 is a paid rehearsal for it. Moving
     the slot deletes the retry machinery (`config/ventures.json` `daily@05:00` → `daily@09:00`,
     `EDITION_RETRY_HOUR` and its special-case dispatch, two `site/vercel.json` cron entries). Two
     things to resolve first: 09:00 already belongs to `mag-editorial`, so either confirm
     `cycle.yml` runs two dispatches in one hour without the concurrency group cancelling one, or
     move `mag-editorial` to 08:00. If you want the 05:00 promise kept, the cheaper variant is a
     $0 pre-flight at 05:00 that runs only the source and budget gates and records what would have
     blocked, then produces at 09:00.
  2. *Do the three backstop sweeps shrink to one?* A Vercel dispatch lands on the hour and does the
     work; a GitHub `schedule` firing lands 13 minutes to 3 hours 20 late and exits a guard. Each
     sweep can only rescue a slot still inside its 6-hour window, and the three fixed times
     (`55 3`, `55 11`, `55 19` UTC in `cycle.yml`) still leave edge slots effectively uncovered.
     Appending the sweep's "any unopened slot still in window?" check
     as a $0 post-step of every punctual run gives eighteen checks a day instead of three, with
     coverage that tracks the schedule automatically, and leaves a single midday dead-man's entry.
  [imp:3] [owner:me] [time:15m] [kind:decision]

- [ ] **Decide the Titty Tuesdays dock bay** — a bay is where a courier loads, and that venture
  *collects*: it pulls a feed and nothing is delivered to it. The bay lines up with no courier exit
  and a dashed lane in its own hue points back at the room, but the old window-and-sill drawing
  said the asymmetry more plainly. The day performance does not depend on the bay either way.
  [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Decide Board HQ's roster length** — the opened room lists all 23 roles scoped `global`,
  correct by the registry but a long column beside rooms showing two or three. Restricting it to
  the council is a one-line change. [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **MMA Files' room card cannot link its article** — no delivery receipt under
  `state/ventures/mma-files/deliveries/articles/` records an `articleUrl`, so the card shows a
  title and a date with no link and no thumbnail; DNESKAi's card is complete because its receipt
  records one. If the MMA delivery path starts writing `articleUrl` the card fills in with no
  further work — decide whether that path change is wanted.
  [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Two workspace controls sit under the 9.5px type floor** — `Jump to date` and `Show the
  delivered article` are at 7.5px and the channel rail at 9.5px after several shrink-on-request
  rounds, against the documented mono floor. Decide whether the floor bends for these two controls
  or they grow back to it. [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **The React Compiler costs more than it saves here — one line to reverse** — SI-09 turned
  `reactCompiler` on in `site/next.config.ts` as the programme specified, and it behaves: the wheel
  lock, all four panels, every room view and the whole day performance were walked by hand with it
  on and nothing desynchronised. But measured on the same build and machine it charges 24.2 kB of
  first-load JS (573.7 → 597.9 kB) and 7 kB more on the panel chunk, to save 14 ms of scripting
  across a thirty-second performance that never came near dropping a frame — more than the
  code-splitting in the same issue saved. The plan's motion is CSS and React only re-renders on the
  beat tick, so there was little render pressure to remove. Deleting the flag line returns the
  bytes; the measurement is recorded beside it in the config.
  [imp:2] [owner:me] [time:5m] [kind:decision]

- [ ] **Confirm the wallboard's five figures are the ones you want on the wall** — the home page's
  TV shows published articles, publishing reliability, cost per article, spend against the $50
  limit and ideas from meetings, all read from the record. Any figure the record cannot supply
  prints an em dash rather than a zero. [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Turn on "Automatically delete head branches" on `lukaskourilcz/quorum`** — Settings →
  General → Pull Requests. Sessions can push a branch but not delete one: the agent proxy answers a
  delete-ref push with HTTP 403, so the git-workflow rule about never leaving a stale branch behind
  is one no session can keep. The setting keeps it automatically.
  [imp:2] [owner:me] [time:2m] [kind:setup]

- [ ] **Public URLs for three projects** — FightAIQ, GoVIRAL and Titty Tuesdays have no public
  address, so their cards on the home page render nothing in the link slot rather than a "coming
  soon". Supply a URL each and the line appears. [imp:2] [owner:me] [time:10m] [kind:content]

- [ ] **Real office photography** — the six backdrops behind the seven home-page sections are
  AI-generated placeholders committed at `site/public/office/*.{avif,webp}`. The layout does not
  depend on them; replace the files at the same names and nothing else changes.
  [imp:2] [owner:me] [time:2h] [kind:content]

- [ ] **Portraits for the roles that have none** — 27 of 49 registered roles have an approved
  portrait; 22 still fall back to an initials tile on the team panel and to the anonymous
  silhouette in the workspace player, which is honest but plain.
  [imp:1] [owner:me] [time:1h] [kind:content]

- [ ] **Decide whether Python enters the toolchain** — three offline niches were named: the
  FightAIQ calibration lab, a wikitext parser and article extraction, each behind a JSON-contract
  boundary. Nothing in the runtime moves either way. [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Analytics — deliberately deferred.** Name the exact decisions the data would change, then
  approve the provider, legal posture and data minimisation before setting
  `METRICS_INGESTION_ENABLED=true`. Until then follower and engagement KPIs stay honestly
  unavailable, SPLIT stays off, the quarterly evaluator reports missing audience data as
  unavailable, and no analytics credential is required.
  [imp:1] [owner:me] [time:0m] [kind:decision]

### Verify once, then leave alone

- [ ] **Vercel production settings** — BoardlessAI tracks `main` at `https://boardless-ai.vercel.app`;
  DNESKAi at `https://caughtup-ai.vercel.app`; MMA Files at `https://mma-files.vercel.app` with
  `NEXT_PUBLIC_DEMO_MODE=false`. The delivery step builds its clone with demo mode off (`cycle.yml`
  passes `NEXT_PUBLIC_DEMO_MODE=false`), so leaving production on demo makes a delivered article's
  route 404 and fails every page check. Keep `NEXT_PUBLIC_ALLOW_INDEXING=false` on both magazines
  until each has a body of work worth indexing — that variable lives in the magazine projects, not
  here, and `social-2026-08a` does not cover it. Your call, separate from the social stop, and the
  answer today is still no. [imp:4] [owner:me] [time:10m] [kind:setup]

- [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json` — confirm the 2026-08-03
  `quarter_start` and the target values, or save your own, before using the quarter for decisions.
  Q1 lasts 90 days and content/social pace excludes the first 14. No code writes that file, so a
  target can only move if you move it. [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Add the first opportunity record to `state/OPPORTUNITIES.json`** — the file still holds only
  fixtures, so the opportunity gate stays dormant and publishes one line rather than a daily
  rejection. The task allowlist
  deliberately does not let any agent write this file; the narrow write scope is a guard, so do not
  widen it. Needs a score ≥35/50, no dimension below 2, and ≥3 independent non-fixture evidence
  refs in `state/EVIDENCE.jsonl`. This is not what holds the stage: `config/stages.json` reads
  `"current": "VALIDATION"` with `stageChangeAuthority: owner-only`.
  [imp:3] [owner:me] [time:60m] [kind:decision]

- [ ] **Re-verify the pinned Apify actor prices and success rates each quarter** — the prices in
  `config/goviral-sources.json` were verified live on 2026-08-06 and cannot be re-checked at
  runtime; an actor's store page is not an API. Two of the six are community actors and young:
  `themineworks/threads-scraper` was rebuilt on 2026-07-25 and had 104 users at pinning. If its
  30-day success rate drops below about 95%, switch the primary to
  `magicfingers/threads-scraper`, already in the config as the fallback.
  [imp:2] [owner:me] [time:20m] [kind:setup]

- [ ] **Optionally apply for Google's official Trends API alpha** — free, application-gated. If
  granted it would replace the Trends RSS fetch with a supported endpoint. Nothing depends on it
  and nothing may be built assuming it — the RSS path is the design.
  [imp:1] [owner:me] [time:10m] [kind:setup]

---

## Personal Growth owner actions

- [ ] **Configure the separate Personal Growth private clone and ingest owner-selected journals.**
  Set `PERSONAL_GROWTH_PRIVATE_CLONE_PATH` to a private clone that does not overlap this
  repository, then run the documented ingestion command separately for the Czech and optional
  English Rapovej deník sources. Select the files and titles yourself; no agent may infer,
  translate or move private journal text into Git. [imp:3] [owner:me] [time:30m] [kind:setup]

- [ ] **Review the Personal Growth recurrence anchors in Admin.** Confirm the first OKRAJ and
  BBARAK dates and adjust them through the protected Timeline controls if the seeded dates no
  longer match the real publishing rhythm. The owner writes and publishes both artifacts.
  [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Authorise the owner-only Meta insight connection.** Create or select the Meta app for
  `lukaskouril93`, grant only the Instagram/Threads read permissions listed in
  `docs/PERSONAL-GROWTH-PROVIDERS.md`, and place the access token plus Instagram and Threads account
  ids in the approved server-side secret store. Do not reuse a brand publisher credential or put a
  token in Git. Leave `instagramInsights`, `threadsInsights`, `threadsSearch`, `providerLive` and
  `tokenRefresh` false until a reviewed connection test confirms the exact scopes and renewal path.
  This task grants no posting or Buffer authority. [imp:2] [owner:me] [time:30m] [kind:setup]

- [ ] **Decide whether Personal Growth should ever use Buffer.** The adapter, queue, purchase and
  publishing authorities are all held. If scheduling becomes useful, approve the exact plan,
  account and queue scope first; do not enable `bufferQueue` or select the buffer allocation
  merely because the seam exists. [imp:1] [owner:me] [time:10m] [kind:decision]

- [ ] **Enable Personal Growth provider flags only after the reviewed connection test.** Once the
  exact read scopes, account ids, token storage and renewal path are verified, countersign the
  production change that enables only the required insight flags. Keep `publishing` false;
  Personal Growth has no posting authority. [imp:2] [owner:me] [time:10m] [kind:decision]

---

## Only before social posting

Roughly a month out. Nothing here is needed until a channel actually opens, and opening one is a
`HUMAN_APPROVAL` in `state/INBOX.md`, not a switch a session may flip.

- [x] **Approve Kvórum's future accounts and AI-disclosure bio** — `KV-ACCOUNTS-003` in
  `state/INBOX.md` covers an owner-led Instagram, Facebook, Threads or X setup only after the name
  and handles are cleared, with a bio that says AI assists the drafts and a human approves every
  post. Countersigning creates nothing and grants no posting automation: until then the workspace
  stays explicitly drafts-only, and afterward accounts, credentials and channels still require
  human setup outside Git.
  [imp:3] [owner:me] [time:15m] [kind:setup]

- [ ] **Countersign and connect Social Distribution (`SOCIAL-DISTRIBUTION-CONNECTION-001`).**
  Review `docs/SOCIAL-DISTRIBUTION-DESIGN.md`, confirm direct Meta as the core provider (or record a
  superseding choice), name each exact real profile, and choose Facebook Login or Instagram Login
  per Instagram connection. Create/authorise the accounts yourself; approve only the documented
  publishing scopes and any separately approved own-insight scope; store tokens and native ids in
  the server-side secret/variable names below. Explicitly accept or decline Buffer; leave Metricool,
  n8n, Make and Ayrshare disabled unless a later budgeted decision changes their role. Confirm the
  token renewal/App Review path, provider cancellation/rollback and exact routine publish scope.
  This single countersignature/setup packet grants no engagement automation and does not waive
  profile, capability, release, content, accessibility, cadence, budget, reconciliation, receipt or
  kill-switch gates. If an owned-amplifier proposal is later accepted, use its generated
  `amplifier-setup-packet/1` here: select one proposed brand name/handle, create the account
  manually and record only the generated credential reference name. Do not add an amplifier to the
  credential table before that owner decision. The Design Lab has no accounts and needs none.

  | Venture | Actions secrets | Repository variables |
  | --- | --- | --- |
  | DNESKAi | `CAUGHT_UP_THREADS_ACCESS_TOKEN`, `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID`, `CAUGHT_UP_INSTAGRAM_USER_ID` |
  | MMA Files | `MMA_FILES_THREADS_ACCESS_TOKEN`, `MMA_FILES_INSTAGRAM_ACCESS_TOKEN` | `MMA_FILES_THREADS_USER_ID`, `MMA_FILES_INSTAGRAM_USER_ID` |
  | Titty Tuesdays | `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`, `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN` | `TITTY_TUESDAYS_THREADS_USER_ID`, `TITTY_TUESDAYS_INSTAGRAM_USER_ID` |

  BOOKSOFHISTORY, Door Money, Kvórum and Tehdejší svět are intentionally absent from this
  credential table. Their owner may create only separately approved profiles, reviews every draft
  and posts by hand; none of those ventures has a platform credential, publisher or autopublish
  path in this repository.

  Decision `social-2026-08a` keeps all of this closed until each magazine has rendered ten articles.
  `state/social/activation.json` reads DNESKAi 2/7, MMA Files 3/10 and Titty Tuesdays 0/4 — the
  runtime's own per-venture thresholds, which are not all ten. Keep `SOCIAL_KILL_SWITCH=true`;
  setting it to `false` removes only the owner stop, and each venture's counter, credentials, roles
  and safety checks still have to pass. Until a channel is enabled the composer no longer renders
  inventory nothing can consume. [imp:2] [owner:me] [time:45m] [kind:setup]

- [ ] **Re-enable the social publisher's schedule trigger when a channel connects** — its hourly
  cron is commented out in `.github/workflows/social-publisher.yml` because it fired twenty-four
  times a day to confirm everything was still switched off. Restore it in the same change that
  connects the first account. [imp:1] [owner:me] [time:5m] [kind:setup]

---

## Waiting on an agent, not on you

Nothing here needs your hands. It is recorded so it is not lost.

- [ ] **Finish the decomposition started in issue 147** — `orchestrator/src/cycle.ts` is now about
  1,300 lines. Its remaining seams are the double-fire guards, morning shift, operations review,
  artifact writers and night tail; extracting them requires one explicit context object rather
  than another purportedly mechanical move. `orchestrator/src/portfolio/run.ts` is about 1,730
  lines and still separates naturally into room lifecycle, room content and the
  `RoomStayedShut` family. Keep the work behavior-neutral and one extracted module per commit.
  [imp:2] [owner:ai] [time:3h] [kind:deploy]

- [ ] **Repair marketingShark's live response contract** — paid `ms-daily` calls on 8 and 12 August
  both reached Anthropic and then closed `NO_ACTION` with `model-output-invalid`; the ledger records
  `$0.035138` and `$0.035142`. Reproduce the returned shape without logging provider prose, align
  CHUM's schema and prompt, and keep the fail-closed draft-only posture. Prove one synthetic valid
  package and one malformed response; do not rerun the paid room merely to force output.
  [imp:3] [owner:ai] [time:45m] [kind:deploy]

- [ ] **Root `pnpm test` flakes under its own concurrency** — it runs three workspaces at once,
  under which `orchestrator/tests/studio-lifecycle.test.ts` and `src/social/pack.test.ts` exceed
  their timeouts; the same files pass in about a minute run alone, and
  `pnpm -r --workspace-concurrency=1 test` passes every time. Raising those timeouts or serialising
  the workspaces would both do it. [imp:1] [owner:ai] [time:15m] [kind:deploy]

- [ ] **Scope the repo-root filesystem reads so Turbopack stops over-tracing** — about twenty
  modules in `site/src/lib/` open with `process.env.BOARDLESSAI_REPO_ROOT ??
  path.resolve(process.cwd(), "..")` and then read under it. Turbopack cannot statically scope that,
  so it traces the whole repository into every function that can reach one. It over-traces rather
  than under-traces, so nothing breaks — it costs bytes: 2,188 unique files and 40.7 MB carried
  across the deployment against webpack's 2,017 and 37.7 MB, with the largest single function at
  52.3 MB against 34.9 MB. Vercel's limit is 250 MB, so this is cold-start and deploy weight, not a
  failure. SI-10 fixed the one instance that mattered most (the studio's hook-library read, which
  alone doubled the home page's payload) with a `turbopackIgnore` and an explicit
  `outputFileTracingIncludes` entry; the same treatment applied module by module would recover the
  rest. It is deliberately not batch-applied: it trades inferred tracing for a hand-maintained
  list, and a wrong entry is a route that 500s in production, so each one wants checking against a
  real deployment. [imp:2] [owner:ai] [time:2h] [kind:deploy]

- [ ] **Stop a test from being able to read the cycle's live environment at all** — the council
  held no meeting between 9 and 11 August because the release gate ran `pnpm test` with the cycle
  job's own secrets in scope, so a test that reads `process.env` took the paid illustration rung
  and failed on what that render returned. CI exported neither switch, never took the rung, and
  reported green the whole time. The two switches are now blanked for both gate steps and the one
  test injects the rung dark, but the shape survives: any test reading ambient env still behaves
  differently under the gate than under CI, and the next one to do so closes the gate the same
  way. A vitest setup file that clears the provider keys for every run would end the class rather
  than the instance. [imp:3] [owner:ai] [time:30m] [kind:deploy]

---

## How to prove a path once its account exists

Procedures, not gates. They verify plumbing; none of them is a content approval.

### 1. Confirm Q1 targets and enter real fixed costs

1. Sign in at `/admin`, open **Social posts and company files**, find **Fixed monthly costs**, and
   add each subscription BoardlessAI actually uses with its real monthly USD amount, category and
   first-paid date. Save the list. No example prices; API use is counted from receipts separately.
2. Review `config/kpis/2026-Q1.json` and adjust the seeds before relying on the quarter comparison.
3. Run the 06:00 `morning` phase once with dry mode off. Confirm the run saves
   `state/kpis/latest.json` and `state/money/public.json`, then open `/money`. Missing Phase 3
   measurements should say **No data**; recognised revenue stays `$0.00` until a verified revenue
   entry exists.

Monetization readiness is information-only. It creates no proposal or item in this
document, and no earning implementation may begin without a new owner decision.

### 2. Finish the remaining account connections

1. Add MMA Files to the existing delivery GitHub App if it is not already selected. Keep Contents
   read/write as the only write permission. The App ID and private key stay BoardlessAI Actions
   secrets; do not copy them into either consumer app.
2. Confirm MMA Files Vercel production tracks `main`, uses
   `NEXT_PUBLIC_SITE_URL=https://mma-files.vercel.app`, and remains in demo/noindex mode.
3. Add `PEXELS_API_KEY` and `PIXABAY_API_KEY` if you want their libraries in the licensed-image
   search. Openverse and Commons need no key; missing keys fall back to FRAME art without blocking
   an article.
4. Add the three brands' Instagram and Threads tokens and IDs from the table above. Keep
   `SOCIAL_KILL_SWITCH=true` during account validation.

### 3. Prove DNESKAi delivery

Run **Guarded council cycle** for `cu-edition` with dry mode off and delivery-only off. The mode
step must say `dry=false` and `skip=false`. A successful path:

1. creates the Czech article with exactly one licensed photo or FRAME fallback;
2. commits the two image sizes into `lukaskourilcz/aifirst`;
3. deploys the newest article as the home-page hero and older ones as thumbnails;
4. polls CI and the public route for up to 30 minutes;
5. records the content hash, image dimensions and attribution in a release proof.

If delivery fails after production, rerun the same phase with dry mode off and delivery-only on.
That retry reuses the package and makes no model call. If the automated verifier fails twice it
reverts the target commit and pauses DNESKAi.

Then run `morning` and `cu-product` once with dry mode off to populate the normal product path.
Afternoon and night are `$0` checkpoints.

### 4. Prove FightAIQ and MMA Files delivery

Set `FIGHTAIQ_ANALYSIS_ENABLED=true` (decision D8 authorises it), keep `FIGHTAIQ_LIVE_ENABLED=true`
and `MMA_FILES_LIVE_ENABLED=true`, and confirm `CITO_API_KEY` and `THE_ODDS_API_KEY` are present.
Then run:

1. `mma-intake` — checks the $0 source allowlist, advances one bounded UFC roster page, discovers
   bouts, enriches one Wikimedia history batch, rebuilds career totals and delivers
   `fightaiq-delivery/2` to MMA Files;
2. `mma-analysis` — creates predictions only for future confirmed bouts with two eligible fighter
   cards. Zero eligible bouts is an honest successful result, not a reason to loosen the gate;
3. `mag-editorial` — assigns or evidence-kills both article slots;
4. the assigned `article-am` or `article-pm` — produces, delivers and verifies one Czech article
   plus its image;
5. `mag-desk` — exercises the desk room when manually requested.

In MMA Files, confirm cancelled bouts are absent from upcoming cards, every rendered fighter name
opens a profile, and any prediction shows "Early model" plus "Model output, not betting advice."
BoardlessAI should show the same prediction only as a Stats entry, never as a duplicate public
fighter section.

Missing source evidence must kill the article before a model call. A verifier failure retries once,
then reverts and pauses only MMA Files.

### 5. Prove every boardroom without spending

Run `pnpm proof:rooms`. It dispatches every room kind with `fixture: true`, saves the visible
records and labels them as tests. This proves routing, contracts, calendar projection and room
pages; it does not claim a live provider decision. It includes the Design Lab room, which renders
complete DNESKAi, MMA Files and Titty Tuesdays fixture sets through live templates without an image
model or provider call. Review template statuses, slides, formats and brand skins in `/admin`; the
public `/ventures/carousel-studio` page shows live fixture samples.

Scheduled windows are wake-ups, not guaranteed paid meetings. The 06:00 board chooses from the
priority queue and may commission a focused specialist room. Empty or unsupported work becomes
`not-needed`, `NO_EDITION`, a killed slot or a reasoned `why-not` at `$0`.

### 6. Validate social readiness without posting

Run **Guarded social publisher** with **Validate only** selected. The daily evaluator shows these
counters in `/admin` and the digest:

- DNESKAi: seven consecutive passed release proofs; `NO_EDITION` is neutral.
- MMA Files: ten consecutive passed article proofs with no unresolved failure.
- Titty Tuesdays: four complete approved campaigns, credentials and the tested safety checker.

When the accounts are correct and you want the pre-authorised project gates to post, set
`SOCIAL_KILL_SWITCH=false`. The global switch remains the immediate owner stop. Every post is
idempotent, verified live and retried once; a second failure pauses only that project. Titty
Tuesdays posts on Prague Tuesdays and uses typographic graphics, never people photography.

### 7. Leave the human-only boundaries closed

FightAIQ analysis is approved by D8; do not weaken its evidence gates. Keep MMA Files noindex until
name, corrections, operator and privacy details are ready. Budget raises, commerce, payments, ads,
personal data and legal posture remain manual owner decisions; no live switch can authorise them.
When the separate indexing decision is complete, set `MMA_FILES_INDEXING_ENABLED=true` — that
records readiness evidence but does not edit the MMA Files deployment or activate an earning
method.

---

## Reference

### Repository variables — everything is inert until these are set

GitHub **repository variables** (Settings → Secrets and variables → Actions → Variables), not
secrets, read by `.github/workflows/cycle.yml`. A missing variable is not an error: the run either
records a skip or drops to a fixture-only dry pass, and costs $0 either way — which is why a
misconfigured repository looks healthy and produces nothing. Which kind you get:
`CAUGHT_UP_LIVE_ENABLED` forces the dry pass; `PORTFOLIO_LIVE_ENABLED`, `MMA_FILES_LIVE_ENABLED`,
`FIGHTAIQ_LIVE_ENABLED` and `FIGHTAIQ_ANALYSIS_ENABLED` set `skip`. The four newer venture rooms
share `PORTFOLIO_LIVE_ENABLED`; their founding and approval gates still fail closed, so there is no
separate live variable for BOOKSOFHISTORY, Door Money, Kvórum or Tehdejší svět.
`AUTONOMY_KILL_SWITCH` works the other way — it is a job-level `if`, so only setting it to `true`
stops anything, and GitHub skips the job before any record is written. Since 2 August a skipped slot is written to
`state/meetings/skips/` and shown on the calendar as **Skipped** with its reason.

| Variable | Set to | Unlocks |
| --- | --- | --- |
| `AUTONOMY_KILL_SWITCH` | anything except `true` | every scheduled cycle; `true` halts all |
| `PORTFOLIO_LIVE_ENABLED` | `true` | the global board and every venture room |
| `CAUGHT_UP_LIVE_ENABLED` | `true` | `cu-edition`, `morning`, `cu-product` |
| `MMA_FILES_LIVE_ENABLED` | `true` | `mag-editorial`, `mag-desk`, `article-am`, `article-pm`, MMA delivery |
| `FIGHTAIQ_LIVE_ENABLED` | `true` | FightAIQ intake |
| `FIGHTAIQ_ANALYSIS_ENABLED` | `true` | FightAIQ D8 analysis |

MMA Files needs **both** `PORTFOLIO_LIVE_ENABLED` and `MMA_FILES_LIVE_ENABLED`; either alone still
skips. Leave `SOCIAL_KILL_SWITCH` as it is — it beats every per-channel unlock.

Secrets for any model call: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Publishing additionally needs
`DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`. The six variables above and both model keys were
confirmed present on 2026-08-02; the two delivery App secrets were already working before that.
`THE_ODDS_API_KEY` and the optional `CITO_API_KEY` were also confirmed present on 2026-08-02.

### Diagnosing an empty day

| Symptom | Where to look |
| --- | --- |
| A calendar slot is **Skipped** | its tooltip names the gate; `state/meetings/skips/<date>-<phase>.json` |
| An article slot is **Skipped** | its tooltip carries the run's reason; `state/ventures/mma-files/runs/<date>-<slot>.json` |
| A calendar slot is **Did not happen** | no run reached it at all — check the Actions run for that hour |
| Delivery reverted a published article | Actions → **Delivery doctor**, about one minute, read-only |
| An article was written but not published | `state/ventures/mma-files/runs/<date>-<slot>.json` lists the gate violations |
| DNESKAi produced no edition | `state/edition/runs/` — the newest file names the stage that stopped |
| An article slot says `no_sourced_subject_on_file` | the editorial room wrote no slate *and* the desk's own fallback found no uncovered, source-backed subject; look in `state/mma/fighters/` and `state/mma/events/` |
| An article slot says `slate_derivation_failed` | the fallback threw reading the records; the run file's `detail` names what threw |

### Standing constraints

- The priority queue fills itself; you do not add items by hand. Every live 06:00 board gives each
  agenda venture one open item written from that venture's own `growth_objective` in
  `config/ventures.json`, expiring after a week. A venture that already holds a live item — open,
  selected, or declined and still selectable — is skipped, so a re-run adds nothing. `/admin` can
  still add one, but nothing waits for it.
- What rations the agenda-gated phases (`agendaRequiredPhases` in `config/meeting-policy.json`) is
  `maxRequestsPerMeeting` in that file: the 06:00 board may commission two rooms, at most one per
  project. An item it does not select is recorded `why-not` with the reason, and a `why-not` item
  goes back on the next morning's list. A room that does open can request a follow-up agenda for a
  different phase. A phase with no due agenda records `PAUSED` at $0, which is the gate working.
- The opportunity gate reads `state/OPPORTUNITIES.json` and no task type may write it. That narrow
  write scope is a guard; seed the file by hand rather than widening the allowlist.
- Optional Pexels/Pixabay keys are not blockers. GNews, Guardian and NYTimes keys are not used.
  The Design Lab needs no credential, account or separate deployment — only links.
- **Completion rule.** A killed edition, a killed article or a room nobody needed costs $0 and is a
  successful gated outcome. Do not pay for a rerun to force content. A killed day still delivers its
  explanation, so an empty day on the calendar tells you which gate closed rather than looking like
  a fault.

### The day, and what it costs

Eighteen primary hourly duties, plus an edition retry at 09:00: 05:00 edition production, 06:00 board, 07:00
marketingShark carousel room, 08:00 fight data check, 09:00 story meeting, 10:00 article
production, 11:00 Titty Tuesdays marketing, 12:00 BOOKSOFHISTORY desk, 13:00 GoVIRAL trend room
(Mondays only — the other six days cost $0), 14:00 checkpoint, 15:00 Door Money desk, 16:00 Door
Money growth room (Thursdays only), 17:00 DNESKAi product room, 18:00 Tehdejší svět desk, 19:00
model check, 20:00 desk review, 21:00 Kvórum desk and 22:00 checkpoint. Vercel carries paired UTC
cron entries for Prague daylight-saving time; `cycle.yml` keeps three backstop sweeps. No full day
under this clock has been measured: 6 August came to $0.363 across six slots and 4 August to $0.412
across seven, both against a $1.00 daily pace and the $30 all-in monthly cap from `budget-2026-08e`.
marketingShark adds about 6c to a day. BOOKSOFHISTORY advances one phase per working
day; research remains capped at `$0.10` per call, `$0.50` per cycle and `$5.00` per
month, while a shelf or stretched day may cost `$0`.

---

## Recently finished

- **The 2026-08-28 release-gate outage was root-caused and fixed**, same day, on branch
  `claude/venture-launch-review-7l5nkd`. The webdev-signal brand's mint accent failed the
  studio's 4.5:1 contrast floor once the legacy mesh cover composited it over the surface at
  0.5 opacity, so `pnpm test` went red on `main` at 15:00 UTC and every scheduled room since
  recorded `repository release gate failed`. The accent deepened to `#5ed3a8`, the two moved
  SVG hashes were re-pinned, and studio (173), orchestrator webdev (7) and site webdev (2)
  suites all pass. The fix reaches the engine when the branch merges — the first line of the
  launch shortlist above.
- **The repository-wide Markdown sweep completed**, 2026-08-13. It began with 345 tracked
  Markdown files and ends with 352: five served documents were deleted, four durable Kvórum files
  arrived with its completed programme, and eight mirrored tool-boundary notes were added so
  vendored skills keep their pinned bytes without linking to an uninstalled upstream catalog.
  Deleted one by one: `docs/HANDOFF-147-DECOMPOSITION.md` after its remaining decomposition work
  moved here; `docs/KVORUM-CODEX-BUILD-PROMPT.md` after execution; the served
  `docs/SECRETS-AUDIT-2026-08-06.md`; `docs/WORKFLOWS-MAP-DESIGN-SPEC.md` after its live invariants
  moved to component tests and docs; and the served `docs/fightaiq-review.md`. The root entry,
  owner guides, session contracts, ecosystem/portfolio maps, seven venture designs, Design Lab,
  hook knowledge, owner list and living state were reconciled. All 352 survivors are protected
  records, runtime inputs, convention-required owner docs or have an internal reader link. No
  temporary inventory file was created; the 345-file classification remains on SWEEP-00.
- **Four venture programmes are implemented but still fixture-only**, 2026-08-13. Kvórum,
  BOOKSOFHISTORY, Door Money and Tehdejší svět now have bounded desks, contracts, admin surfaces
  and tests. Their founding countersignatures, named approvals and owner-created accounts remain
  open above; implementation granted no live, publishing, source, treasury or channel authority.
- **The completed setup checks left the live list**, 2026-08-13. GitHub confirms
  `THE_ODDS_API_KEY`, `CITO_API_KEY`, `FAL_KEY`, `PEXELS_API_KEY` and `PIXABAY_API_KEY` are present;
  the fal.ai illustration variable is enabled. Its prepaid amount still needs entering in finance
  state and remains open above.
- **marketingShark made its first live model call**, 2026-08-08. It spent `$0.035138` and failed
  closed as `model-output-invalid`; a second call on 2026-08-12 did the same at `$0.035142`. The
  completed owner action is retired and the response-contract repair is now an agent task.
- **The MMA Files relaunch programme completed**, 2026-08-09. Its twelve consumer issues and six
  quorum issues landed; production settings and indexing remain separately owner-gated.
- **The first production deck recipe save reached GitHub**, 2026-08-09. The deployed admin saved
  the `masthead` family, duotone phase and `0.9×` scale for the 2026-08-08 DNESKAi deck.
- **The aifirst illustration-origin branch merged**, 2026-08-09. Commit `4bc270c8` on its `main`
  accepts the bounded raster illustration origin and re-checks its bytes and licence.
- **The two heavy admin journeys no longer hide behind retries**, 2026-08-13. Playwright now uses
  `retries: 0`; failures are reported on their first attempt.
- **The Actions image keys and illustration rung were armed**, 2026-08-08. The fal.ai account,
  prepaid credit and illustration switch were supplied along with the Pexels and Pixabay keys; the
  article-image implementation reached `main` on 2026-08-09.

- **The engine grew the DNESKAi launch redesign**, 2026-08-09. The writing desk can file an
  edition under a section under a rule strict enough that uncategorised stays the common case,
  and the same call plus the Czech editor prompt now enforce Czech typography and an outright
  em-dash ban. Two contracts carry the magazine's new sections: `boardless-stream/1` for the
  external links and podcast episodes, `boardless-events/1` for the events the owner types in a
  new admin tab whose past entries cannot be edited without saying it is a correction. The
  fetcher calls no model, reaches only hosts the registry names and the allowlist permits, and
  turns a dead feed into a receipt line rather than a failed run. Both deliveries are their own
  kind with their own allowlist inside the existing daily cycle, so no new job, cron or phase
  appeared and nothing was drawn from the model share. Switched off until
  `CAUGHT_UP_STREAMS_ENABLED` is set.
- **The template library went from ten families to twenty-three**, 2026-08-10. Thirteen new
  compositions drawn from that year's typography-led design trends: a poster family whose scale is
  the whole design, an inside newspaper page, a Swiss grid, a soft neo-brutalist card, a monospace
  terminal, a highlighter-and-annotation family, a typed note, a contrast diptych, an oversized
  index numeral, a weight-contrast lockup, a line that runs continuously across every slide, a
  calm minimal one, and a misregistered two-plate print. Each rides the controls you already have
  — A/B, type scale, phase — and none of them added a colour, a typeface, a schema field or a
  paid call site. Nothing to approve and nothing to switch on; it is recorded because what the
  company's decks can look like is the kind of thing an owner should read off a list rather than
  off a diff. Cost: $0. The renderer cannot call a model, by decision D11.

- **The Design Lab has real typefaces, and they are in the repository**, 2026-08-09. Thirty-seven
  static faces under `studio/fonts/`, every one SIL OFL 1.1 with its `OFL.txt` beside it, serving
  all nine registered brand skins including the Czech and Cyrillic additions. The
  brands used to name system font stacks and no font file existed, so the render server drew in
  whatever it found. Nothing here needs an account, a licence purchase or a decision from you —
  it is recorded because the choice of typeface is the kind of thing an owner should be able to
  read off a list rather than off a diff. Costs nothing: the files ship with the repository.

- **The twelve-issue article-image programme ran and merged**, 2026-08-09. Every hero now passes
  a vision gate before it is attached: one budgeted call looks at the actual thumbnails and the
  verdict is stored beside the package, so the run report answers *why* a picture was chosen for
  the first time. The desk that writes an article now briefs the picture desk, the search runs
  after the write instead of before the story was even picked, retrieval fans every phrase out
  across four providers, the curated files are re-checked for drift, high-scoring finds queue
  themselves as curation proposals, and a generated illustration sits between the search and the
  drawn plate. The two wrong MMA heroes are corrected on this side; delivering them needs the
  mma-files merge above.

- **The fourteen-issue site-improvements programme ran and merged**, 2026-08-08. The Workflows
  section became a performance of the standing day behind one *Play the day* toggle; the room view
  was repaired; every output now walks its full journey to a real address; Carousel Studio became
  the Design Lab with an Instagram-story format; the panel bodies left the first load; the studio is
  consumed as built output and the site runs Turbopack; the high-severity Dependabot alert is
  closed; and the three owner runbooks became this document.
- **The `/ventures/carousel-studio` JSON error was explained, not fixed** — it was a truncated RSC
  stream from a client navigating away mid-request, which the server logs as `The destination stream
  closed early` and the browser reports as unterminated JSON. Every JSON file under `state/` parses;
  32 requests during a live e2e run all answered 200.
- **The e2e suite's timing failures were budgets, not bugs.** Every failure chased across the
  programme was a budget that had stopped matching the work. The suite's global timeout is 120s,
  `buttons.spec` has 600s, and the WeekBoard legend guard — genuinely red since 2 August — expects
  eight entries.
- **GitHub Actions minutes — resolved 2026-08-07** by making all three repositories public.
  Standard runners are unmetered on public repositories. A 2026-08-06 sweep of the working tree
  and full history of all three repositories found no secret; an independent re-sweep before the
  flip agreed. The served audit remains recoverable in git history.
- **The email in public commit history is accepted, decided 2026-08-07.** It is personal data
  rather than a credential. Do not propose rewriting history for this: on public repositories that
  means force-pushing three repos and breaking every published commit link.
- **The devShark banner on DNESKAi is approved**, 2026-08-07. The payload is staged and hashed under
  `state/ventures/marketingshark/banner/` with no receipt yet; the slot ships `active: false`.
- **marketingShark was founded, and devShark came into the portfolio with it** — a seventh project,
  a thirteenth clock slot at 07:00, and two roles. One question a day out of devShark's own bank,
  drawn as a Czech and an English carousel and left as a draft.
- **GoVIRAL was founded** on 2026-08-06: one room, Mondays at 13:00, reading public trend data and
  writing a weekly content brief plus marketing ideas. It cannot post, schedule, buy or open an
  account, and costs about $0.05 of model spend a week.
- **The Magazine Incubator is closed.** It sat six times and produced no proposal worth acting on.
  No new magazine will be ideated again — a future venture is founded by a direct registry entry.
- **Hook copy became one library with one brain.** The canonical knowledge base now holds 50 quiz,
  12 news and 16 MMA hooks; `docs/hooks/` documents their surface-specific truth gates and
  `lint:hooks` runs in CI.
- **Both magazines are Czech-only**, one writing call each instead of writing English and paying to
  translate it. Nothing indexed broke.
- **Both magazines publish.** MMA Files delivered its first council-produced article on 2 August,
  DNESKAi its first edition on 3 August. A day that produces no edition delivers the explanation
  instead of leaving a hole.
- **A skipped slot says why**, on the calendar and in `state/meetings/skips/`.
- **The record stopped misreporting itself** — the site published "$0.00 of $50" while the ledger
  held $1.18 against a $30 cap; a cycle that paid for calls and then failed discarded its own
  ledger; the calendar marked an article slot "missed" on the day it published.
- **Three Czech gates were weaker than they read** — six slop patterns could never match because
  `\b` is an ASCII word boundary; the MMA source marker was never resolved; a package with no
  English half recorded an english-route pass.
- **The two Sunday reverts are settled.** The editorial review stays non-blocking permanently; the
  doubled caps are back to `MAX_CYCLE_BUDGET_USD` 0.20, `CU_MEETING_BUDGET_USD` 0.08 and
  `DAILY_BUDGET_USD` 1.00, with the edition per-run cap at 0.50. `MONTHLY_BUDGET_USD` stays 25 and
  `MONTHLY_OPERATING_CAP_USD` stays 30.

---

## Branches

Session branches in this repository are temporary and are removed after their verified merge.
The completed DNESKAi redesign, article-image, SI and website-improvement programmes were merged
and their branches removed. The article-image decision remains at
`state/decisions/2026-08-08-article-image-fit.md`.

One branch is open in a consumer repository and is waiting on you, not on code:
`lukaskourilcz/mma-files` `claude/article-image-selection-61rs70`. Merging it is what lets the two
corrected MMA heroes reach the magazine. The matching aifirst branch was merged into its `main` as
`4bc270c8` on 2026-08-09 and then removed.
