# BoardlessAI workflows — complete trace, and the brief for Fable

Scouted from committed code and state on **2026-08-07**, at `main` = `c360689`.
Every number, path, gate and constant below was read out of the repository, not
recalled. Where the observed state differs from an older document, the observed
state is what is written here.

Repositories in scope: `lukaskourilcz/quorum` (the engine), `lukaskourilcz/aifirst`
(DNESKAi), `lukaskourilcz/mma-files`, `lukaskourilcz/react-express-app`
(StudyShark + devShark), `lukaskourilcz/titty-tuesdays`.

---

## Part 0 — What Fable is being asked to do

Two deliverables, in this order.

**0.1 — Review the process and find the waste.** Everything from Part 1 to Part 12
is the current mechanism, described exactly. Read it as an operations problem: 13
scheduled wake-ups a day, two dispatch paths, five repositories, one render engine,
$30/month all-in. Say where the design spends money, wall-clock or complexity it does
not need, and where a determinstic check could replace a paid judgment call. Say
which of the standing rooms earn their cadence and which should become
event-triggered. Be specific about which gate, file or constant you would move.

**0.2 — Design the `/workflows` section for the BoardlessAI site.** An animated,
scroll-driven explanation of the whole mechanism, accurate enough that a reader
finishes it understanding how a story becomes a published article, a rendered
carousel and a receipt. Part 13 is the shot list. The section must include
Titty Tuesdays and GoVIRAL even though neither publishes yet, because both are
already producing state.

**0.3 — Also design the Titty Tuesdays visual-proposal loop.** A new capability the
owner wants. Full brief in Part 14.3, including the constraints it has to survive.

The site is Next.js App Router under `site/`, server components by default, brand
tokens in `site/src/styles`. Existing venture pages are
`site/src/components/*-venture-page.tsx`. There is no motion library in the
dependency tree and the studio is imported as TypeScript source, so `site` runs
webpack (`next dev --webpack`) — Turbopack does not apply the `.js`→`.ts` alias and
every studio import fails under it.

---

## Part 1 — The system in one page

BoardlessAI is a Git-backed operating engine for seven projects. It has no database,
no message queue and no always-on process. Every action starts as a scheduled HTTP
request, runs inside one GitHub Actions job, and ends as a committed file.

```
Vercel cron ──► site/api/cron/[phase] ──► GitHub workflow_dispatch
                                              │
                                              ▼
                                    .github/workflows/cycle.yml
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
              board rooms              venture rooms           production jobs
          (morning/afternoon/night)  (cu-*, mma-*, mag-*,      (article-am)
                                      tt-*, gv-*, ms-*)
                     │                        │                        │
                     └────────────────────────┴────────────────────────┘
                                              │
                                     writes to  state/
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                 edition/outbox/     ventures/carousel-studio/  budget/ledger.json
                          │            summaries/
                          ▼                   │
              bounded GitHub App token        ▼
                          │            Carousel Studio
                          ▼            (deterministic SVG→PNG)
              clone target repo, run its
              own consumer script, path-
              allowlist the diff, commit,
              push to main
                          │
                          ▼
                  Vercel rebuilds the target
                          │
                          ▼
                  release:verify fetches the
                  live page and checks 7 things
                          │
                          ▼
                  receipt in state/edition/deliveries/
```

The seven projects and their current mode:

| Project | Target repo | Rooms | State today |
| --- | --- | --- | --- |
| DNESKAi (Caught Up) | `aifirst` | cu-edition 05:00, cu-product 17:00 | publishing daily |
| MMA Files | `mma-files` | mag-editorial 09:00, mag-desk 20:00, article-am 10:00 | publishing daily |
| marketingShark | `react-express-app` (2-way) | ms-daily 07:00 | drafting, never posts |
| FightAIQ | data into `mma-files` | mma-intake 08:00, mma-analysis 19:00 | data only, no bets |
| Titty Tuesdays | `titty-tuesdays` | tt-marketing 11:00 | pre-commerce, ideas only |
| GoVIRAL | none (feeds others) | gv-brief 13:00 (Mondays) | scout not yet credentialed |
| Carousel Studio | none (in-repo package) | no room | renders for everything |

Four rules hold everywhere and are worth stating before the detail, because most of
the mechanism exists to enforce them:

1. **Nothing publishes without a proof.** A delivery is not done when the push
   succeeds; it is done when a fetch of the live page returns the package hash.
2. **A refusal is a successful outcome.** `NO_EDITION`, a killed article slot, a
   `not-needed` agenda and a `no-hook` fallback are all recorded states that cost $0.
   Nothing in the system is rewarded for producing work.
3. **Money is one number.** $30/month all-in, $25 of that model/API, $1.00/day pace,
   from decision `budget-2026-08e`. Every room declares an envelope before it calls.
4. **Determinism where judgment is not needed.** Hook assignment, carousel summaries,
   question selection, slide rendering and every check are pure functions. Same input,
   same bytes.

---

## Part 2 — The clock, and what "a meeting starts" actually means

### 2.1 The clock is derived, not written down

There is no schedule file. `config/ventures.json` declares each venture's meetings
with a `cadence` of `daily@HH:00`, and `orchestrator/src/ventures/registry.ts`
resolves the clock from it:

- `PORTFOLIO_BOARD_SLOTS` — three fixed board rooms: morning 06:00, afternoon 14:00,
  night 22:00.
- `resolveMeetingClock()` — every `venture.meetings[].cadence`.
- `resolveProductionClock()` — every `venture.productionJobs[]`. MMA Files' one
  `article-production` job at `daily@10:00` becomes the `article-am` slot. The evening
  slot was removed: it was killed every day since launch because no second subject
  ever cleared the repeat rule, so the schedule now promises one article instead of
  promising two and reporting a kill.

That resolves to **13 Prague slots**:

| Prague | Phase | Venture | Envelope |
| ---: | --- | --- | ---: |
| 05:00 | `cu-edition` | DNESKAi | room $0.08 + production $0.50 |
| 06:00 | `morning` | board | cycle cap $0.20 |
| 07:00 | `ms-daily` | marketingShark | $0.10 per enabled brand |
| 08:00 | `mma-intake` | FightAIQ | $0.06 |
| 09:00 | `mag-editorial` | MMA Files | $0.05 |
| 10:00 | `article-am` | MMA Files | $0.16 |
| 11:00 | `tt-marketing` | Titty Tuesdays | $0.08 |
| 13:00 | `gv-brief` | GoVIRAL | $0.06 (Mondays only) |
| 14:00 | `afternoon` | board | $0 |
| 17:00 | `cu-product` | DNESKAi | $0.08 |
| 19:00 | `mma-analysis` | FightAIQ | $0.06 |
| 20:00 | `mag-desk` | MMA Files | $0.05 |
| 22:00 | `night` | board | $0 |

The sum is not the expected daily spend. An idle agenda room makes no provider call,
an evidence-killed article stops before generation, and every checkpoint, render, KPI
evaluation and verification is deterministic.

Two phases exist in the schemas and have no slot: `incubator-scan` and
`incubator-synthesis`. That venture was wound up. Its meeting records stay on disk and
the calendar can still read them; nothing can open the room. The `studio` phase is the
same — its last records (`state/meetings/2026-08-06-studio.json`) show
`status: "PAUSED"`, `decision.outcome: "NO_ACTION"` and five registered participants
who were not called.

### 2.2 Two dispatch paths, and why there are two

**The punctual path (primary).** `site/vercel.json` holds 28 cron entries — 13 slots ×
2 daylight-saving variants, plus 2 for the edition retry. Each calls
`site/src/app/api/cron/[phase]/route.ts`. That route:

1. Compares the `Authorization` header against `CRON_SECRET`. Both sides are SHA-256
   hashed first so `timingSafeEqual` always gets 32 bytes and never leaks the secret's
   length by throwing. An unset secret refuses everything — without that, the route is
   a public URL that starts paid runs.
2. Reads `config/ventures.json` off disk to get the phase's Prague hours. An
   unreadable registry refuses rather than firing blind.
3. Compares the current Prague wall hour against those hours. Both DST variants fire
   every day because a Vercel cron expression is UTC; exactly one lands in the right
   hour and the other returns `inactive-dst-variant` and does nothing. Reading the
   offset at call time is what makes the two changeover days work with no special case.
4. `POST`s `workflow_dispatch` on `cycle.yml` with `{ phase, trigger: "vercel-cron" }`
   and nothing else — so this route cannot ask for anything a cron firing could not.

**The backstop path.** `cycle.yml`'s `on.schedule` is three sweeps at `55 3`, `55 11`
and `55 19` UTC. Each looks for a slot today with no record that can still be opened.
This replaced 18 per-slot crons: measured over 5–6 August, a Vercel dispatch arrives on
the slot's own hour and does ~5.8 minutes of real work, while a GitHub cron arrives
hours late and spends ~0.9 minutes exiting a guard — about **600 billable minutes a
month duplicating a path that had already run**.

GitHub's `schedule` trigger is documented as best effort and behaves like it: 13–54
minutes late on 2 August, 2h23m–2h55m on 4 August, worst observed 3h20m.

### 2.3 The constants that make a late run still count

In `orchestrator/src/ventures/registry.ts` and `orchestrator/src/meetings/clock.ts`:

- `CRON_MINUTE = 55` — every cron fires at :55, off GitHub's most contended minute
  (:00) and its three neighbours (:15, :30, :45), buying a five-minute head start.
- `CRON_HOUR_CARRY_MINUTE = 30` → `CRON_HOUR_CARRY = 1`. A cron firing at :55 is
  reaching for the *next* hour. `cronSlotHour()` is the single place that decides which
  hour a firing belongs to; scattering `+1` at call sites is how a schedule drifts a
  slot at a time, silently, with every test still agreeing with itself.
- `CRON_LEAD_HOURS = 1` — the cron is scheduled an hour before its slot. A lead is a
  translation, not a correction: it moves the whole distribution earlier and does not
  narrow the spread by a minute. Covering the worst observed delay would need a
  four-hour lead, paid on every punctual day.
- `CRON_DELIVERY_WINDOW_HOURS = 6` — how long after its hour a fired cron can still
  name its meeting. Past it, `resolveCronDelivery` returns `beyond-window` and the slot
  is owed a stated reason rather than silence.
- `SLOT_DELIVERY_GRACE_MS = (6 − 1) × 3,600,000` = **5 hours** — how long the calendar
  keeps a slot `late` before calling it `missed`. Derived from the two constants above
  so the resolver and the calendar can never disagree about when a slot is beyond
  rescue.

`resolveCronDelivery(cron, at)` returns one of three things, and the caller writes
something different for each: a run that opens the room, a skip that names the slot it
lost, or nothing at all for a firing that never had a meeting behind it.

### 2.4 What the calendar shows

`buildCalendarFeed()` emits `calendar/1` for a Monday-anchored week. Each slot resolves
to one status:

| Status | Meaning |
| --- | --- |
| `scheduled` | the instant has not arrived |
| `late` | passed, but a run can still arrive and name it (≤ 5h) |
| `missed` | past the grace window with no record |
| `held` | a meeting record exists |
| `skipped` | a gate turned it off, and the reason is shown |
| `not-needed` | the record itself says `PAUSED` |

Two special sources feed it. Article slots (`article-am`) have no `MeetingRecord`
kind, so `loadArticleSlotOutcomes()` reads
`state/ventures/mma-files/runs/<date>-<slot>.json` instead — without it, 2 August 10:00
rendered as `missed` on the day it published the Shevchenko profile. And
`state/meetings/skips/` carries recorded skip reasons, because a slot a gate turned off
and a slot nobody reached used to both read `missed`, which is how eleven meetings
could fail on 2 August with nothing anywhere saying why.

### 2.5 One extra firing that is not a slot

`EDITION_RETRY_HOUR = 9`. Every delivered edition except 6 August needed a second run,
and every second run that ran succeeded — the first attempt was losing to a source
gate, a budget reserve refusal or a transient provider failure, all of which pass an
hour later. So `cu-edition` gets a second dispatch at 09:00. It is deliberately *not*
on `MEETING_CLOCK`: a slot owns a Prague hour and owes the calendar a record, and 09:00
already belongs to `mag-editorial`. A morning that already published costs $0 and
writes nothing.

---

## Part 3 — Trace A: DNESKAi, 05:00 to a live page

The flagship path, end to end. Entry point `orchestrator/src/edition/live.ts`,
`runLiveEdition()`.

### Step 1 — Scan the sources ($0, no model)

`config/sources.json` holds **32 enabled sources** across eight adapter kinds:

| Kind | Examples |
| --- | --- |
| `rss` (21) | 404 Media, Ars Technica, DeepMind, HuggingFace, Import AI, Interconnects, MIT Tech Review, OpenAI, Platformer, Rest of World, Simon Willison, Stratechery, TechCrunch AI, The Register, The Verge, Wired AI, Variety, Digiday, Social Media Today, Tensorfeed, Google Research |
| `html` (4) | Anthropic news, Meta AI, Nieman Lab, Tubefilter |
| `arxiv` (2) | cs.AI, cs.LG |
| `bluesky` (1) | `app.bsky.feed.searchPosts` |
| `github` (1) | AI releases |
| `hn` (1) | Hacker News top stories |
| `spaceflight` (1) | Spaceflight News API v4 |
| `stackexchange` (1) | ML questions |

Each carries a `weight`, `tags`, `maxItems` and the stages it is active in.
`runScrapersDetailed()` fetches them against `config/network-allowlist.json` —
`runtimeHosts` is the only set of hosts a runtime fetch may touch.
`createDigest(items, 80)` reduces the result to at most 80 candidates.

**Everything about this step is free.** No model has been called yet.

### Step 2 — Two gates, before any spend

*Budget.* `loadRuntimeBudgetLimits()` resolves the caps from the newest
countersigned decision rather than from literals — $25/month API, $1.00/day,
$30/month all-in, $0.50 per edition production. It blocks if the production cap is
under the configured floor, if today's spend plus the edition cost exceeds the daily
cap, if the month's does, if month + fixed costs + edition exceeds the all-in cap, or
if `caughtUpBudgetMode()` returns `no_edition`.

*Sources.* From `config/edition-quality.json`: `minimumSuccessfulSources: 10` and
`minimumCandidateItems: 10`. Either failing produces `source_gate:successful_sources_N`
or `source_gate:candidate_items_N`.

Either gate produces a `no_edition` package and stops. **Every terminal day gets a
public record.** This used to apply only to budget and source failures; quality blocks,
STET blocks, curation failures and delivery-invalid outcomes stayed inside BoardlessAI,
so a gated $0 day looked exactly like a crash on the magazine — nothing arrived and
nothing said why. 2 August has no board JSON at all for that reason.
`shouldQueueEditionDelivery()` now returns `true` unconditionally.

### Step 3 — Find a picture (three rungs, $0)

Only if `licensedImageSearchEnabled`. `imageSubjectQuery()` derives the day's subject
from the top 12 digest items' tags — the subject the day is *about*, not its headlines.

1. **Hand-reviewed scene.** `illustrativeScenePhoto({ subjectQuery, seed: date })`
   resolves a curated photograph by file name. The MMA desk has run this design since
   launch and it is why its covers are predictable; the edition's photograph used to
   depend entirely on what a live search happened to rank first that morning.
2. **Live licensed search.** `discoverLicensedPhotos()` queries four providers in
   parallel — **Openverse** (`api.openverse.org`) and **Wikimedia Commons**
   (`commons.wikimedia.org`), both keyless, plus **Pexels** and **Pixabay** if
   `PEXELS_API_KEY` / `PIXABAY_API_KEY` are set. A missing key appends a one-time task
   to `NEEDS_YOUR_HELP_NOW.md` and the search continues on the keyless two.
3. **FRAME plate.** A deterministic SVG. This is a legitimate delivered state, not a
   failure — a day whose licensed search found no usable photo still ships.

No image model is involved anywhere in this path. `config/models.json` carries an
`AVATAR_IMAGE` role on `gpt-image-2` for owner-requested avatar repairs only, and its
comment states in as many words that no article pipeline has a `gpt-image-2` call site
and none may gain one. The ledger has never carried a `kind: "image"` entry.

### Step 4 — Produce the edition (the only paid part)

`produceEdition()` in `orchestrator/src/edition/production.ts`.

**4a. Curate (HERALD).** `curate()` sees at most `maximumCurationCandidates: 50` items.
If a GoVIRAL scout snapshot exists, `trending` is injected as a **tiebreaker between
equally sourced candidates only** — a subject that fails the source gates fails them
whatever its velocity. `CurationGateError` records its usage before returning
`curation_gate_failed`, because the call happened and was billed even though the pick
list failed.

**4b. The write/review loop**, up to `maximumRegenerationAttemptsPerDate: 2`:

- `write()` produces the Czech article: `targetWords: 1100`, `briefsMaximum: 4`,
  `watchlistMaximum: 6`, `maximumOutputTokens: 6500`. It also writes `whyThisStory` —
  the Czech sentence under "Proč právě tento příběh". That used to be an English
  template rendered under a Czech heading, the only English left on a page a Czech
  reader reads.
- **Draft quality gate** — the cheap pass. Every metric the quality gate reads comes
  from the article's sources and tags, both fixed the moment `write()` returns. A full
  pass costs ~$0.22 of a $0.50 cap while a rewrite reserves ~$0.14, so a violation
  discovered *after* the desk had been paid was terminal and the two configured
  regenerations could never run. The thresholds are unchanged; this only fails earlier.
- `reviewCzechArticle()` (**STET**) — `minimumScore: 35`, `maximumRewriteAttempts: 1`.
  Blocks are counted whether or not they stop the article: a review that failed and was
  published anyway is still a review that failed.
- **Final quality gate** against the metrics that actually ship.

The gate thresholds, all from `config/edition-quality.json`:

| Metric | Threshold |
| --- | --- |
| `minimumSignalStrength` | 45 |
| `minimumCitedSources` | 3 |
| `maximumSingleSourceShare` | 0.5 |
| `minimumSourceDiversity` | 0.5 |
| `maximumDuplicateStorySimilarity` | 0.85 |
| `maximumRepeatedTopicFrequency` | 0.5 (after 3 published editions of warm-up) |
| `requirePrimarySourceWhenRelevant` | true |
| `maximumUnsupportedWatchlistItems` | 0 |
| `failureAction` | `no_edition` |

`repeatedTopicFrequency` is (article tags some recent edition already carried) ÷
(article tags). One shared tag scores 1/t, at most 0.5 across any multi-tag set — so
`ai` on the list every day is what an AI magazine looks like, while the same six tags
in the same order is a repeat. The old score divided by the *window* instead, so one
shared tag out of six read as a total repeat and the gate banned recurrence rather than
measuring it.

Findings split into **blocking** and **waived** (`publication-gate.ts`). Waived findings
do not stop the article; they travel to the reader in the package as
`unresolvedReview`, and the run report records
`shipped_with_unresolved_review:<codes>`.

**4c. Assemble.** `materializeLicensedPhoto()` downloads and re-hosts the chosen photo.
Alt text comes from `heroAltCs()` — **the archive's own description first, the writer's
second**. The writer produces its alt before any photograph is chosen: it is describing
an illustration it imagined, and attaching that to a real photograph tells a screen
reader about a picture that is not on the page. The 2026-08-06 edition described a
schematic that does not exist over a real Flickr photograph.

### Step 5 — Validate, and downgrade rather than crash

`validateEditionForDelivery()` rejects a package the site cannot serve. It used to
throw *before* the report was written, so a run that paid for the package left no
record of the spend and no statement that an edition had been assembled. It now
downgrades to a stated `no_edition` carrying the accrued cost. **This direction only** —
nothing in that branch can turn content a gate rejected into content that ships.

### Step 6 — Write four things, in this order

1. `state/edition/runs/<date>-<hash>.json` — the run report, with the source summary
   and evidence refs. **Written before the outbox**: if the delivery write fails, the
   spend and the reason are still on disk.
2. `state/edition/outbox/<date>-<hash>.json` — the `edition-package/1`.
3. **`state/ventures/carousel-studio/summaries/caught-up/<date>-<slug>.json`** — via
   `storeEditionCarouselSummary()`. This is the Carousel Studio handoff and Part 8
   covers it.
4. `state/budget/ledger.json` — via `appendEditionUsage()`. Curation is charged to
   HERALD, everything else to STET, keyed on a `requestHash` so a replay cannot
   double-count.

### Step 7 — Deliver (still the same GitHub Actions run)

In `.github/workflows/cycle.yml`:

1. `pnpm delivery -- next` → `oldestPendingDelivery()`. Oldest first, but it skips any
   date that already has a `delivered` receipt with a matching hash — one failed
   release used to jam the venture permanently, with the stale package shipping and
   reporting success while the new edition waited. A `no_edition` notice from an
   earlier day gets a terminal `superseded` receipt and its file is removed, because a
   "no edition today" notice is only true on its own day.
2. **Mint a bounded token.** `actions/create-github-app-token` with
   `DELIVERY_APP_ID` / `DELIVERY_APP_PRIVATE_KEY`, scoped `repositories: aifirst`. The
   engine never holds a long-lived credential for a target repo.
3. Clone `aifirst` at depth 1 (up to two attempts), restore the Next build cache.
4. `pnpm --dir <clone> consume:edition <package> <clone>` — **the target repo's own
   script** (`scripts/consume-edition-package.ts` → `lib/delivery/edition-package.ts`).
   The engine does not write the magazine's files; it hands over a package and the
   magazine materializes it. Failures are classified from the consumer's own output:
   `[delivery:hash_conflict]`, `[delivery:content_invalid]`.
5. **Path allowlist.** `git status --porcelain --untracked-files=all` is filtered
   against a regex per package status. Anything outside it fails the job:

   | Status | Allowed paths |
   | --- | --- |
   | `no_edition` | `^public/data/board/<date>\.json$` |
   | `edition` | `^((content/articles/<date>\.(en\|cs)\.mdx)\|(public/data/board/<date>\.json)\|(public/images/editions/<slug>/(hero\|thumb)\.(webp\|png\|svg)))$` |
   | `dataset` | `^data/(ai-facts\|ai-lessons)\.json$` |

   **An edition can never rewrite a dataset and a dataset append can never touch an
   article, an image or a board record.** That separation is enforced here, in the
   workflow, not in application code.
6. Build the magazine in the clone to prove the delivered content compiles.
7. Commit as `boardlessai-delivery[bot]`, subject
   `edition(<date>): <slug> [package:<hash12>]`, push to `main` with one
   fetch-and-rebase retry. Czech is added unconditionally; English is added only if the
   file exists, because `git add` on a pathspec matching nothing is fatal under
   `bash -e` and would abort *after* the consumer had already written.
8. **Vercel rebuilds `aifirst` from `main`.** Static Next build, CDN.

### Step 8 — Prove it (`pnpm release:verify`)

`verifyReleaseSnapshot()` fetches the live page and runs seven checks:

| Check | What it proves |
| --- | --- |
| `czech-route` | HTTP 200 with a non-empty body |
| `english-route` / `english-absent` | reported under its own name either way |
| `title-slug` | rendered `<h1>` matches, path contains `/articles/<slug>` |
| `content-hash` | `<meta name="boardless-content-hash">` equals the package's `idempotencyKey` |
| `hero-image` | image URL returns 200 with bytes |
| `image-dimensions` | `sharp` metadata matches the package's declared width/height |
| `attribution` | the licence line is present in the rendered text (skipped for the SVG plate, which needs no external credit) |

CI state on the target commit is resolved from *both* GitHub signals; a null means the
endpoint was unreadable, which is not the same as reporting nothing, so an unreadable
half never invents a green.

**One failure retries the same package with an idempotent re-consume, at no model
cost. A second failure reverts and pauses only DNESKAi.**

### Step 9 — The receipt

`recordDelivery()` writes:

- `state/edition/deliveries/<date>.json` — status, `packageHash`, `targetCommit`,
  `articleUrl`, `tags`, and `supersededPackageHashes` if the date was re-delivered.
- `state/edition/archive/<date>-<hash>.json` — the exact bytes that were sent. The
  outbox file is deleted on delivery, so without this the only copy of what the
  magazine received lived in the magazine's own history and the meeting page could
  show nothing of what it produced.
- Deletes the outbox file, and ticks any open `CAUGHT-UP-DELIVERY-<date>` item in
  `state/INBOX.md`.

On failure it writes a plain-English sentence into the public meeting record and puts
the technical detail in the INBOX only. The record for 5 August had published a CI
runner path, a 40-character hash and the failing command line, and the calendar cell
showed the first 180 characters of it.

### Step 10 — What the magazine does with it

`aifirst` is a static Git/MDX reader. No content database, no runtime CMS, no
per-request generation. It receives `content/articles/<date>.cs.mdx`,
`public/data/board/<date>.json` and `public/images/editions/<slug>/{hero,thumb}`, and
its own static build renders `/`, `/articles/<slug>`, `/radar`, `/topics`, `/weekly`,
`/archive`, the Atom feeds and the JSON endpoints. Its daily workflow is a **sentinel
only**: it checks that the day has either a Czech article whose `package_hash` matches
the board record, or an honest no-edition board record.

Its three daily widgets (`DailyLesson`, `DidYouKnow`, `BannerSlot`) read `data/`, not
the edition pipeline. The dataset arrays are a **reveal schedule, not a list** —
`entries[0]` is revealed on the anchor and each later day resolves through a modulo, so
a published entry is as immutable as a published edition. `verifyDatasetAppend` refuses
insertion, reordering, removal and any anchor move.

---

## Part 4 — Trace B: MMA Files, three rooms and one article

### 09:00 `mag-editorial` — assign or kill

Cast: **CANVAS, JAB, QUILL, AUDIT**. Context assembled by
`composePortfolioContext()`: the stylebook (`state/ventures/mma-files/STYLEBOOK.md`),
the taste packet, the FightAIQ bridge (`state/mma/BRIDGE.md`), the fight-week event
priority from `fightWeekFocus()`, the day's slate, the article index, and the GoVIRAL
trend tiebreaker if a snapshot exists. Capped at 18,000 characters.

Output: an `editorial-slate/1` at `state/ventures/mma-files/slates/<date>.json`.
CANVAS assigns the day's single slot or kills it. **A kill happens before any writing
model call.**

### 10:00 `article-am` — write it

`runLiveArticleProduction()` in `orchestrator/src/mma-files/live.ts`.

The evidence packet is built under three hard limits, each of which was a real bug:

- **`RECORD_DIRECTORIES = ["fighters", "bouts"]`.** An allowlist, not an exclusion
  list. Substring-matching every JSON under `state/mma` meant any file that merely
  mentioned the subject qualified as a source — a Shevchenko profile cited an API-quota
  ledger of monthly call counts and page cursors as one of its six sources, and
  inherited the 50 unrelated fighter ids parked in it. The backfill queue had already
  been excluded by name once, and the next bookkeeping file simply took its place.
- **`MAX_BOUTS_IN_EVIDENCE = 6`.** Refs used to be harvested from every string in every
  matched file, so a profile inherited each opponent in the subject's history and the
  style gate then demanded a profile link for all of them. Vemola has 48 bouts on file.
- **`MAX_EVIDENCE_CHARS = 24,000`.** It used to be one cut across the whole
  concatenation, and the first file alone overran it: the Shevchenko packet declared
  nine source files totalling 116,314 characters, so the cut landed inside file one and
  the writer received exactly one card — an opponent's — while the six bout files the
  packet declared as sources arrived as nothing at all.

Roles: **JAB** drafts in Czech, **STET** removes generated-text tells, **HACEK** owns
the register, **AUDIT** checks the release, **FRAME** supplies the hero
(`fighterIdentityPhoto` → `illustrativeSportPhoto` → licensed search → deterministic
typographic fallback), **CANVAS** holds release quality.

The style gate lives **here**, upstream. `mma-files` has no `src/lib/style-guard.ts`
and adding a second banned-phrase list would put two desks in disagreement about the
same copy.

The localization schema carries `altHeadline` — max 90 characters, **the short Czech
line written for a carousel cover**, produced in the same call as the article so it
passes the same style review. The reader pages use `title`; `altHeadline` must never be
rendered as a headline on an article page, because it is written for a square.

Output: an `ArticlePackage`, plus `storeArticleCarouselSummary()`, plus
`state/ventures/mma-files/runs/<date>-am.json` carrying `published` / `killed` /
`blocked` with its reason. When a gate closes the slot before anything runs,
`recordClosedArticleSlot()` writes `blocked` with one of
`budget_decision_not_countersigned`, `portfolio_gate_closed`, `mma_files_gate_closed` —
and returns `null` if a record already exists, so re-running a workflow cannot replace
a real `published` with a `blocked` that never happened.

Delivery follows the same shape as Part 3: bounded App token scoped to `mma-files`,
clone, `npm run consume:boardless <package> <root>`, path allowlist, commit, push,
Vercel rebuild, `release:verify`. The consumer writes only
`data/boardless/articles.json` (or `data/boardless/fightaiq.json`) and
`public/images/articles/<slug>/{hero,thumb}`.

On the reader side, `src/lib/repository.ts` is the only sanctioned read path — route
files must not import `src/content/` directly. `demoMode` defaults to **true** when
`NEXT_PUBLIC_DEMO_MODE` is unset, so production must set it to `false`; without it, a
delivery the reader cannot parse silently hands the magazine back to seven fictional
demo stories.

### 20:00 `mag-desk` — review

Cast: **CANVAS, PIVOT, AUDIT**. Due agenda only. Reviews the day's article, owner
ratings, the social draft queue and the FightAIQ bridge, and leaves sourced provisional
angles for tomorrow.

### 08:00 / 19:00 — FightAIQ, the data supplier

`mma-intake` (FORGE, CORNER, SPOTTER, TAPE, SONAR — plus SONAR only on Tuesdays and
Fridays) maintains sourced UFC and Oktagon fighter cards from `$0` sources: Wikimedia,
Wikidata, approved free-tier APIs and owner-reviewed local imports. Source adapters
stop at their quota; hostile or unclear automated access stays disabled.

`mma-analysis` (FORGE, SIGMA, VIG, TAPE, PIVOT, AUDIT) needs a due agenda *and* the D8
switch (`FIGHTAIQ_ANALYSIS_ENABLED=true`). A prediction requires a future confirmed
bout, two agreeing bout sources and two eligible fighter-card snapshots. Outputs retain
model version, hashes and uncertainty.

**FightAIQ never places a bet, signs into a bookmaker, publishes an affiliate link or
calls model output advice or income.** Its reader-facing data belongs only in MMA
Files; BoardlessAI shows operational stats. PIVOT is the evidence bridge between the
two and cannot turn response or context into hidden model input.

---

## Part 5 — Trace C: marketingShark ↔ react-express-app, the only two-way loop

This is the one relationship where data flows both directions. It is also the answer to
"quorum only takes questions from react-express-app to render social carousels" — that
is the inbound half; there is an outbound half too.

### Inbound: the question bank

`scripts/marketingshark-import-bank.ts` with
`orchestrator/src/ventures/marketingshark/react-express-app-adapter.ts` imports
directly from the source repo's modules:

| Subject | Question modules | Czech translation modules |
| --- | --- | --- |
| `webdev` | `lib/quiz-data.ts` (`questions`), `lib/roadmap-questions-fix-the-test.ts` (`fixTheTestQuestions`) | `lib/quiz-data.cs.ts`, `lib/roadmap-questions-fix-the-test.cs.ts` |
| `geography` | `lib/roadmap-questions.geography.ts` | `lib/roadmap-questions.geography.cs.ts` |

The adapter **mirrors** `lib/question-bank-loader.ts` rather than importing it, because
that module also pulls `product-scope` and `shared/subject-catalog`, which drag
deployment-scope logic this import has no business evaluating. A bank that moves in the
source shows up as a missing export rather than as a quietly smaller import.

Result: `state/marketingshark/question-banks/devshark.json` —
**3,633 questions**, `sourceCommit eabe50ecfb4cb5553f2d5f69ad7ecbcafb0e5674`,
`contentHash 0265646a…`, imported 2026-08-07. Read-only, pinned, and **nothing is
written back to that repository through this path**.

The Czech side is deliberately partial. The source stores Czech as per-field overrides
that fall back to English, so a question can have a Czech explanation and no Czech
options. Filling the gaps with English would hand CHUM a "Czech" reference that is half
English and invite it to keep the English. What exists is preserved and what does not
is absent.

### The 07:00 room

`runMarketingSharkCycle()`. Five steps, of which exactly one costs money:

1. **`selectQuestion()`** — a seeded order over the bank keyed on `contentHash`. Every
   question is served once before any repeats, and the same date always produces the
   same question. `$0`.
2. **`assignPackHook()`** — the studio's hook brain. `$0`. Detail in Part 8.4.
3. **`buildChumPacket()`** — the question, the assigned hook line, the craft rules, the
   brand's `slide5` closing line.
4. **CHUM** writes slides 2–5 in Czech and English. One `claude-sonnet-5` call per
   enabled brand per day, ~$0.05, inside a $0.10 envelope that also covers the retry.
   This is the venture's only quality-critical call — native-register Czech plus
   English creative in one pass, where Haiku-class output is not acceptable for a public
   brand voice. **CHUM cannot choose the question, the hook, the template or the
   closing line, and there is no field in its output through which it could author hook
   copy at all.**
5. **`runTruthGates()`** — deterministic, after the model has answered:
   - the assigned hook line is unchanged
   - the brand's closing line is verbatim
   - any code block reached the slide byte for byte
   - no number in the hook appears in neither the question nor the assigned line

   A failure **aborts the brand and leaves nothing behind**.
6. **`renderCarousel()`** — five slides through the brand's `templateMap`:
   `hook → minimal-text-poster`, `context → quiz-code-context`,
   `reveal → stat-highlight`, `why → quote-card`, `footer → minimal-text-poster`.

Every package is written with `status: "draft"` and every approval check pending.
marketingShark owns no social account and no credentials, and
`isPublishingVenture()` **refuses it by name** rather than by an absent switch — so the
publisher would still refuse it if someone added credentials by mistake.

Brands: **devShark enabled**, **geoShark present and disabled** (enabling it is one
importer run and one `enabled` flag).

### Outbound: the hook library

`orchestrator/src/studio/hook-delivery.ts` cuts a `hook-library/1` package from
`studio/hooks/` and delivers it to `lukaskourilcz/react-express-app` through the same
bounded channel articles use.

- `lintLibrary()` runs **here**, not trusted from CI, because this is the last point
  where refusing costs nothing. Errors block outright. Warnings travel in the package
  so the acceptance is on the record — the three standing `unreachable-variant`
  warnings are deliberate, and blocking on them would mean the library could never ship.
- `idempotencyKey = sha256(libraryHash + ":" + vectorsHash)`. `pendingHookDelivery()`
  returns `null` when the receipt already carries that key, so the daily cycle does not
  push an identical library every morning and leave a receipt trail of no-op commits
  that makes a real re-delivery impossible to spot.
- Receipt at `state/ventures/carousel-studio/hook-delivery-receipt.json`.

So the loop is: **react-express-app supplies questions → quorum renders carousels and
refines hook copy → quorum ships the hook library back so the quiz apps can use the
same lines in-product.**

---

## Part 6 — Trace D: Titty Tuesdays

### The room

11:00 daily. Cast is **not** what `config/ventures.json` says — that field is the
floor. `orchestrator/src/titty-tuesdays/schedule.ts` resolves the live cast:

- Fixed every day: **PULSE, ANGLE, AUDIT**.
- Weekday wheel: Mon **COHORT**, Tue **STUNT**, Wed **COHORT**, Thu **SCENE**,
  Fri/Sat/Sun nobody extra.
- **PALATE** runs as a free pre-step on every one of these rooms (`taste: true`).
- Every 91 days from `2026-08-01`, a **season turnover**: PULSE, ANGLE, COHORT, SCENE,
  STUNT, AUDIT all seated.

COHORT sits twice a week because audience specifications are the binding constraint:
the social unlock counts only approved plans with a non-empty `audienceRefs`, and
ANGLE's plans keep failing that check without audience input. SPARK, PALATE, VAULT and
FUNNEL were each considered for the remaining four seats and each rejected for a stated
reason.

### Context and output

The room reads the **newest** season file (not `season-001` forever — it expires
2026-10-30 and the room would have gone on stamping an expired season id onto every
plan), plus its own idea index, plus the taste document. The idea index exists because
four of the first seven ideas on the ledger were near-duplicates of one concept: the
room had no way to know what it had already said.

Output: `marketing-plan/1` at
`state/ventures/titty-tuesdays/plans/plan-<date>-*.{json,md}`. Each plan carries
`tactics[]` (typed `guerrilla`/`social`/`content`/`paid`/`partnership`, each with
`assetsNeeded`, `estCostUsd`, a required `platformPolicyNote` and an optional
`legalityNote`), a weekly `calendar[]`, and `audienceRefs[]`.

The standing instruction is explicit: adults only, current crop-top season,
**pre-commerce** — no stock, price, availability or purchase path; no paid ads, no
publishing, **no human imagery, no anatomy-led art, no sexual supporting copy**.

### Ratings and taste

`state/ratings/titty-tuesdays/ledger.jsonl` holds `rating/1` records:
`objectKind ∈ {idea, plan, visual, slate, article, social-variant, template}`,
`rating ∈ {perfect, good, bad}`, an `objectRef` with `id` + `contentHash`, an optional
500-char note.

`PALATE` distils them into `state/taste/titty-tuesdays/TASTE.md` — `claude-haiku-4-5`,
`PALATE_PASS_BUDGET_USD = 0.02`, output constrained to `pursue` / `avoid` / `open`
rules plus `visualAdjustments`, each citing the rating ids it came from. Owner notes
are sanitized and can be quarantined. **PALATE cannot edit pinned prompts and taste is
never treated as evidence.**

### The consumer

`titty-tuesdays` is a headless Shopify storefront that **fails closed**. It reads a
sanitized public catalog feed at `<boardless>/public/ventures/titty-tuesdays/catalog`
via `src/lib/boardless/client.ts`. Any failure — not configured, request failed, HTTP
error, invalid payload — resolves to `ok: false`, and the catalog resolver treats that
as "every concept stays in concept mode". `commerceMode` defaults to `precommerce`
everywhere, **including when env parsing fails**. `resolvePurchasability()` in
`src/lib/catalog/gating.ts` is the only gate, and adding a path that bypasses it is a
bug. `policy.allowHumanImagery = false`.

**An unreachable BoardlessAI can degrade the storefront to concept-only; it can never
promote anything to sellable.**

---

## Part 7 — Trace E: GoVIRAL

13:00, but **Mondays only**. There is no weekly cadence form in the registry schema and
adding one would break eight consumers, so the day is a deterministic gate in
`portfolio/run.ts` (`isScoutDay()` checks the Prague weekday) and **the other six
firings are $0 no-ops** that record a stated skip.

Cast: **PULSE, SCOUT, ANGLE, AUDIT**.

### The scout

`config/goviral-sources.json` declares which Apify actors may run and on which topic
sets — `apify/instagram-search-scraper` ($1.50/1000),
`scrapesmith/instagram-hashtag-scraper` ($0.50/1000), and others. Each entry carries a
`termsVerdict`, a `termsNote` citing the legal basis (Meta v. Bright Data, N.D. Cal.
2024 — logged-out public data only, no login, no cookie, so the owner's accounts are
never involved) and an `evidenceUrl`.

**The budget guard is structural**: Apify's Free plan gives $5 of monthly platform
credit and the actors stop when it is spent, so overspend is impossible and no cash is
at risk. Upgrading needs owner approval — Starter is $29/month and does not fit inside
the $30 all-in cap.

`APIFY_TOKEN` is not set today, so no scout has run and an absent snapshot is the
normal state.

### What it produces

A weekly trend snapshot. Two rules shape every type in `sources/goviral-trends.ts`:

- **Scraped material is untrusted data.** It reaches a room only inside the existing
  untrusted-data wrapping, it is never handed to a writer as an instruction, and no
  post, handle or image is ever republished. Item text is clipped to 280 characters —
  enough to recognise a subject, never enough to republish.
- **Raw items are transient.** `TREND_ITEM_RETENTION_DAYS = 30`; `pruneItems()` drops
  older ones every run. The aggregate `signals` persist, because a trend line is ours
  and a stranger's post is not.

`TREND_SNAPSHOT_MAX_AGE_DAYS = 14` — past that the room would rather not meet.

The room also gets the raw *aggregate* only: handing four seats a list of strangers'
posts is both a bigger prompt and a worse idea.

Output goes two ways: the owner's weekly content brief, and `forMagazines.ai` /
`forMagazines.mma` — injected into DNESKAi curation and MMA Files editorial as a
**tiebreaker between equally sourced candidates**, never as a substitute for sourcing.
GoVIRAL may hand at most one trend-driven agenda to another venture's room.

---

## Part 8 — Carousel Studio: the spine

`@boardlessai/carousel-studio` lives in this monorepo at `studio/`. No separate
service, no image model, no network call.

### 8.1 The pipeline

**template + payload + brand tokens → SVG → PNG**, pure, with stable hashes.

- **11 live templates**: `quote-card`, `listicle-steps`, `stat-highlight`,
  `before-after`, `headline-three-bullets`, `timeline`, `comparison`, `cover-cta`,
  `five-slide-story`, `minimal-text-poster`, `quiz-code-context`.

  The eleventh was added for marketingShark and justified by a gap rather than a
  preference: every other live layout's widest monospace slot holds 100 characters over
  two lines, which is a source label and not a program, so a quiz question carrying a
  fenced code block had nowhere legible to put it.
- **5 brand token sets**: `caught-up`, `mma-files`, `titty-tuesdays`, `devshark`,
  `geoshark`.
- `carousel-template/1` defines safe areas, slides, text slots, fit rules, optional
  imagery and a semantic version.
- The renderer draws shapes, rules, logos, mesh gradients (radial gradients, not
  bitmaps, so they render offline at any canvas size and read as each venture's own
  palette) and images. Missing image bytes draw nothing and the slide still renders,
  because a missing photograph is not a reason to lose the words. Photo bytes are
  passed as decoded buffers, never in the payload — the payload is hashed into the pack
  and stored in Git, and a 200 kB base64 photo does not belong in either.
- Schema, contrast, safe-area, token, overflow, asset and determinism checks can
  promote a version automatically. **Versions are deprecated, never deleted.**
- The public and admin galleries serve the **checked SVG directly**, so previews do not
  depend on a native image library inside a serverless request. Final deliverables use
  the deterministic PNG renderer.

### 8.2 The carousel summary — how an article reaches the studio

`studio/src/summary.ts`, `buildCarouselSummary()`.

A delivered article is 1,000–1,200 Czech words. A carousel is a handful of frames.
Sending the whole article would mean the renderer decides what the piece is about — a
decision the desk already made and wrote down. So delivery hands over a **summary**:
kicker, headline, standfirst, an ordered set of passages, closing line, sources,
`hasHero`, `heroCredit`.

- `MIN_SUMMARY_PASSAGES = 3`, `MAX_SUMMARY_PASSAGES = 8`.
- **The article's own order is kept** — an argument reordered is an argument changed —
  and the selection is a prefix, not a sample. A reader who swipes reads the beginning
  of the piece rather than a shuffle of its middle.
- A short article yields few passages and the summary says so rather than padding. A
  template that needs four passage slides and is given two renders two, because
  inventing a third is how a carousel starts making claims the article never made.
- **Deterministic and free.** Splitting prose at a sentence boundary is arithmetic. A
  model call here would add cost, latency and a way for a slide to say something the
  article does not. It reuses `slides.ts`'s splitter rather than re-implementing
  sentence detection, because the Czech boundary rules there (ordinals, "vs.",
  abbreviations) were found by looking at rendered slides and a second copy would drift.
- Sources travel as `{ kind, label }` only. An article's `sources[].ref` is a
  repository path, which is an internal address; the studio renders public slides.
- `heroCredit` is mandatory when `hasHero` — a carousel without it is a licence breach.

**A delivery cannot happen without a summary beside it.** Both
`storeArticleCarouselSummary()` and `storeEditionCarouselSummary()` are called on the
delivery path. The summary is *recorded* rather than derived on demand, because this is
what was actually sent: the site can rebuild the same summary from the package with the
same function and does, for anything published before the store existed — but once a
package is corrected, a re-derived summary would show the owner something that never
left the building. **A recorded summary always wins over a derived one.**

A `no_edition` package writes no summary, because an edition that did not go out has
nothing to put on a slide.

### 8.3 Where the summaries are

`state/ventures/carousel-studio/summaries/<venture>/<date>-<slug>.json`.

**Observed today: the directory is empty.** `storeEditionCarouselSummary` and
`storeArticleCarouselSummary` are wired into both delivery paths, but no summary has
been written yet — the deliveries in `state/edition/deliveries/` predate the store, and
the site is currently rebuilding summaries from packages via the derived path. Worth
flagging to Fable as a live gap: the animation should show the recorded path, and the
first real edition after this lands will produce the first file.

### 8.4 The hook brain — the studio's second job

The studio is also **the assignment brain for hook copy across every surface**.

A hook is one line on slide 1 whose job is to earn the next interaction. It is
**gated**: each hook declares `truthRequires` predicates and may only render on content
whose metadata makes them true. "Two answers look right. One is." may only run on a
question that actually has four options and is not trivial.

**Gates license claims — that is the entire honesty model, and it is why the engine
ports everywhere while the strings do not.**

Libraries live at `studio/hooks/`:

| File | Contents |
| --- | --- |
| `quiz.hooks.json` | 49 hooks (devShark, geoShark) |
| `quiz.research.json` | 49 matching research records (archetype, evidence) |
| `quiz.tier-b.json` | 9 Tier B entries |
| `hooks.predicates.spec.json` | conformance vectors for the predicate semantics |

`news.hooks.json` and `mma.hooks.json` **are not written**. That is a valid state:
those surfaces take a logged `no-hook` fallback and the template's own headline renders.
**A missing hook never blocks a pack.**

Assignment (`assignPackHook()`) is deterministic and costs `$0`:

1. Eligible set from the item's own metadata, via the `truthRequires` predicates.
2. Channel cooldown of `max(2 × cooldownDays, 14)` days.
3. No repeat of the channel's previous archetype.
4. A seeded pick over what survives — seeded from **channel, date and item**, so a
   rebuild reaches the same slide 1 that a rebuild reaches the same pixels.

The decision is recorded as `hook-assignment/1` in the pack, carrying `seed`,
`eligibleSetHash`, `eligibleIds`, `availableIds`, a `cooldownSnapshot` and either a
`hookId` or a `noHookReason`. A `no-hook` fallback still records the seed and the set it
evaluated, so "nothing was eligible" can be reproduced rather than taken on trust.

`assertHookAssignmentValid()` rehashes `eligibleIds` and compares. **The eligible set is
the licence**: every hook in it was checked against this item's own metadata, so
anything inside it is honest and anything outside it is a claim nothing verified.
Widening `eligibleIds` to smuggle a hook in changes the hash and the package stops
validating.

`applyHookOverride()` is the whole of what an agent may do to slide 1: swap the proposed
hook for **another member of the recorded eligible set**, and nothing else. No path
exists from a meeting to a hook outside the set, to a rewritten line, or to a new
library entry — those go through the authoring bar and `lint:hooks` in CI.

`docs/hooks/` is the canonical knowledge base — seven files covering the mechanism
catalogue and evidence tags (01), the writing playbook and honesty rules (02), metrics,
cooldowns and A/B method (03), schema, predicate semantics and Tier B build specs (04),
per-surface vocabularies and the extra honesty rules for news and MMA (05), and
assignment, cooldown scopes, override limits and conformance vectors (06). Consuming
repositories reference these files rather than copying them; a forked playbook drifts
within weeks.

### 8.5 The social pack

When social content generation is enabled, `composeEditionSocialPack()`
(`orchestrator/src/social/pack.ts`) resolves a **live** `template_id` and semantic
`version` through `resolveLiveCarouselTemplate()`, binds the project's brand tokens,
renders PNGs, validates accessibility and provenance, and records the renderer version
on the queue item and the receipt. Schema validation rejects missing or non-live
references. **There is no freeform social image path.**

The `A`/`B` variant is `deterministicVariant(id)` — the first byte of the id's SHA-256,
mod 2. Alt text per frame travels on the queue item, capped at 1,000 characters.

---

## Part 9 — The roster: 42 roles, 33 active

From `config/agents.json`. `skillRefs` is a declarative registry field for org review
and interactive sessions — **runtime prompts do not load skill files**. GoVIRAL's craft
rules are distilled into `orchestrator/prompts/goviral.md` instead.

### Board (4)

| Agent | Job | Cannot |
| --- | --- | --- |
| **VIZE** | strategy and stage direction | implement, or approve a release alone |
| **FORGE** | production-ready implementation and release judgment | widen approved scope |
| **PULSE** | growth, positioning, campaign direction | activate accounts, ads or commerce |
| **AUDIT** | rule-based challenge and veto | veto without naming a concrete violated rule |

### DNESKAi (6)

**HERALD** story selection and edition quality · **STET** removes wording errors and
generated-text tells (cannot change supported facts) · **HACEK** the Czech editorial
register and copy floor (cannot change uncertainty or intent) · **SPARK** one
ledger-checked product idea · **VAULT** idea memory and duplicate control · **QUILL**
public-claim clarity.

### MMA Files + FightAIQ (10)

**CANVAS** assignments and release quality, kills unsupported slots before spend ·
**JAB** direct sourced reporting · **CORNER** sourced UFC files · **SPOTTER** sourced
Oktagon files (cannot introduce KSW or unclear automated access) · **TAPE** cited
fight-context adjustments (cannot hand-edit a probability) · **SIGMA** the deterministic
model and calibration (cannot choose an outcome manually) · **VIG** captured odds and
economic comparison (cannot place bets or claim profit) · **SONAR** source terms, cost
and overlap review (cannot wire a source before terms approval) · **PIVOT** the evidence
bridge · **REACH** Czech social variants (disabled).

### Titty Tuesdays (4)

**ANGLE** precise position and niche · **COHORT** adult audience definition without
personal data · **SCENE** competitor and culture signals (cannot fabricate brands,
prices or examples) · **STUNT** permission-aware low-cost stunts (cannot execute or buy
an activation).

### marketingShark (2)

**MAKO** direction and KPI honesty — its weekly package review is specified at
`orchestrator/prompts/marketingshark/strategy.md` and **is not yet wired to a room**, so
no weekly call runs and none is billed · **CHUM** one day's carousel copy per brand,
Czech and English.

### Cross-cutting (7)

**FRAME** article heroes and deterministic visual rendering (social path is Carousel
Studio only; no publishing) · **RELAY** bounded delivery, digest and reconciliation
(cannot edit consumer-app code outside packages) · **PALATE** rating-linked taste memory
· **KEEPER** compliance, privacy, permissions · **LEDGER** costs, budget, unit economics
(cannot create payments or invent revenue) · **PEOPLE** role usefulness and routing
review · **SCOUT** market scanning.

### Stood down (9)

**Paused (6)**: SCRIBE (record writers produce the summaries), LENS (no measurements to
interpret), RADAR (neither magazine is optimising for search), THREADS and INSTAGRAM (no
channel has credentials and nothing composes for one), FUNNEL (no channel to plan a
funnel into).

**Retired (3)**: SPLIT (the reader measurement it waited for is not being built), EASEL
(the studio renders deterministically and holds no meeting), MOTIF (nothing reads layout
observations).

---

## Part 10 — Skills

Two layers.

**Repository-owned (11)**, in `.claude/skills/`: `agent-identity`,
`boardroom-routing`, `brand-identity`, `business-validation`,
`financial-operations`, `organization-operations`, `page-publishing`,
`safe-release`, `social-operations`, `stop-slop`, `titty-tuesdays-brandbook`.

**Vendored from `coreyhaines31/marketingskills` at `7868cb9` (MIT) — 8**: `ai-seo`,
`content-strategy`, `copywriting`, `marketing-ideas`, `marketing-loops`,
`marketing-psychology`, `product-marketing`, `social`.

All 19 are mirrored byte-for-byte into `.agents/skills/` for Codex CLI sessions. Both
copies must be edited in the same commit; `orchestrator/tests/architecture.test.ts`
fails on any drift, file by file.

**The vendored eight are generic advice and this repository's contracts always win**:
the $30 all-in cap, the social triple-lock, the truth gates and the treasury rules are
not negotiable by a skill file. Each carries an `UPSTREAM.md` recording where it
diverges — most importantly `social`, whose reverse-engineering reference suggests
standing up an Apify account that this system already owns and quota-guards.

Four more are vendored verbatim across every repository and kept identical:
`task-observer`, `stop-slop`, `ui-ux-pro-max`, `find-skills`.

Skill assignment by agent (from `skillRefs`) — the ones that matter for the workflow:

| Agent | Skills |
| --- | --- |
| PULSE | business-validation, marketing-ideas, marketing-loops, marketing-psychology, social-operations, social |
| ANGLE | boardroom-routing, business-validation, content-strategy, marketing-psychology, product-marketing |
| MAKO / CHUM | copywriting, social, marketing-psychology, product-marketing |
| STET / HACEK / CANVAS / JAB | stop-slop (+ page-publishing or business-validation) |
| FRAME / PALATE | brand-identity (+ page-publishing / safe-release) |
| RELAY / FORGE / AUDIT / KEEPER | safe-release |
| LEDGER | financial-operations |
| PEOPLE / VAULT | organization-operations |
| SCOUT | business-validation, content-strategy, social |
| EASEL (retired) | ui-ux-pro-max |

---

## Part 11 — The gates, in one place

### Money

$30/month all-in · $25/month model+API share · $1.00/day pace. Decision
`budget-2026-08e`, 2 August. Resolved by `loadRuntimeBudgetLimits()` from the newest
countersigned decision, never from literals — the fallbacks used to be $50 all-in
(superseded) and $15/month with $0.70/day (predating the raise), so an unconfigured run
enforced an all-in limit $20 looser than approved and a daily pace tighter than it.

Every provider call reserves against the envelope first (`estimateTextCall()`,
`ReserveContext`). A `BudgetError` is not a bad article: it returns `budget_exhausted`
immediately rather than spending the remaining attempts on calls the budget refuses
instantly and feeding the budget error text back to the writer as editorial feedback.

Purchases run through `state/treasury/ledger.json`. **Only the human executes payments
and resolves SPEND items.**

### Social — a triple lock

1. `SOCIAL_KILL_SWITCH` — global, immediate.
2. Per-venture unlock counters: **DNESKAi 7** consecutive release proofs, **MMA Files
   10**, **Titty Tuesdays 4** passing campaigns.
3. Complete credentials per venture (four env vars each: Threads token + user id,
   Instagram token + user id).

**Composition is not posting.** `socialContentGenerationEnabled()` and
`socialChannelsEnabled()` are separate checks. They used to be the same one, which made
the code stricter than the decision it implements — decision `social-2026-08a` says in
as many words that the pipeline still composes drafts and queues them, and `draft` only
stops the send. Gating composition on the posting flag meant no carousel was ever built
for either magazine, so on the day the counters unlock there would be no evidence any
of it works.

`social-publisher.yml`'s cron is **commented out**; it runs on `workflow_dispatch`
only. The publisher validates the queue without an LLM, uses an idempotency key,
records a platform receipt, and checks the live post at `$0`. One retry; a second
failure pauses that project. It never follows, likes, comments, messages or downloads
engagement data.

### Human-only, always

Money, account creation, ads, personal data, credentials, new OAuth scopes, legal
posture, public indexing decisions, governing prompt changes, and enabling a channel's
`autopublish`. These go to `state/INBOX.md` as `HUMAN_APPROVAL`. **A model vote cannot
override any of them.**

### Measurement

`METRICS_INGESTION_ENABLED=false`. No visitor, reader or engagement data crosses into
state or prompts. Public pages expose defensive projections only.

### External content

Every external page, article, API response and owner note enters as **untrusted data**
inside `wrapUntrustedData()` / `sanitizeExternalContent()`. It never becomes an
instruction. Numeric and factual claims must retain evidence references. External URLs
are allowlisted via `config/network-allowlist.json`.

### The presentation barrier

Portraits, visitor-facing language and decorative page details are kept out of prompts
and meeting packets.

---

## Part 12 — What is actually running, as of 2026-08-07

Measured, not assumed.

**Spend ledger** (`state/budget/ledger.json`): 184 entries, **$3.39 cumulative**
against a $30/month cap.

By phase: `morning` 28 · `cu-edition` 28 · `tt-marketing` 28 · `mag-editorial` 25 ·
`mma-intake` 24 · `article-production` 12 · `incubator-scan` 10 (retired venture) ·
`mag-desk` 7 · `morning-idea` 6 · `idea-dedupe` 6 · `mma-analysis` 6 · `afternoon` 4.

By venture: `mma-files` 44 · `global` 36 · `fightaiq` 30 · `caught-up` 28 ·
`titty-tuesdays` 28 · `incubator` 10.

**DNESKAi deliveries**, `state/edition/deliveries/`:

| Date | Status | Result |
| --- | --- | --- |
| 08-01 | delivered | — |
| 08-02 | delivered | `no_edition` |
| 08-03 | delivered | edition, 6 tags (English vocabulary) |
| 08-04 | delivered | `no_edition` |
| 08-05 | delivered | edition, 6 tags (English vocabulary) |
| 08-06 | delivered | edition, 6 tags (**Czech vocabulary** — the `CZECH_TAG_CUTOVER_DATE`) |

The tag cutover is load-bearing: the writer emitted English tags on the 3rd and 5th and
Czech ones on the 6th, so the same subject appeared twice under two names. The freshness
window read them as fresh and `/topics` split the topic in two. `recentEditionTags()`
skips receipts before the cutover so `repeatedTopicShare` measures one vocabulary
against itself.

**MMA Files**: run files for 08-02 through 08-06 (am and pm), 08-06 am. The pm slot was
retired after being killed every day.

**marketingShark**: bank imported (3,633 questions, 2026-08-07). Ledger exists. No
package drafted yet.

**Carousel Studio summaries**: none written yet (see 8.3).

**Social**: `state/social/queue/` holds four items (08-05 and 08-06, `cs`,
`instagram` + `threads`), `state/social/packs/` two packs, `state/social/assets/` two
asset records, `state/social/posts/` **empty**. Composition is working; nothing has
posted.

**Titty Tuesdays**: two plans (08-05, 08-06), a ratings ledger, a taste document.

**GoVIRAL**: profile only. No snapshot — `APIFY_TOKEN` is unset.

**KPIs**: quarter 2026-Q1 open, 30 on track, 0 at risk, 11 off track, 9 unavailable.
Critical gaps: `company.monthly-all-in-usd`, `company.monthly-api-usd`,
`carousel-studio.engine-post-rate`.

---

## Part 13 — The `/workflows` section: what the animation must show

The brief for deliverable 0.2. Seven movements. The reader should be able to follow one
story from a cron firing to a rendered carousel without ever seeing a claim the system
does not actually make.

### Movement 1 — The clock

A 24-hour Prague dial with 13 marks. Each mark carries its phase, its venture colour and
its envelope. Hovering a mark shows the room's cast.

**Must show, because it is the honest part:** every mark is a *wake-up, not a promise to
spend*. Show the two dispatch paths as two different lines converging on the same
workflow — the punctual Vercel line landing on the hour, the GitHub backstop line
arriving visibly late and finding the work already done. Show the 5-hour grace window as
a widening band behind each mark, and a slot moving `scheduled → late → held`.

### Movement 2 — The scan

32 source nodes fanning into a digest. Group them by adapter kind. Animate the count
falling: *N sources responded → 80 candidates → 50 shown to the editor → 1 chosen*.

Show the two gates as physical stops: fewer than 10 successful sources, or fewer than 10
candidates, and the whole line stops with a labelled `no_edition`. **A stopped line is
not a broken line** — that should be visually clear, not a red error.

### Movement 3 — The write

The regeneration loop, drawn as a loop. Curate → write → draft gate → STET → final gate,
with the two rewrite attempts as visible returns. Show cost accumulating against a $0.50
bar as each stage completes, and show the draft gate catching a violation *before* STET
is paid — that reordering is one of the clearest efficiency wins in the system and it
deserves a beat.

### Movement 4 — The picture

Three rungs, falling through: curated scene → licensed search across four providers →
deterministic SVG plate. The plate should look like a finished thing, not a fallback,
because it is a legitimate delivered state.

### Movement 5 — The delivery

The most visually interesting part. Show, in order: the bounded token minted and scoped
to one repository · the target repo cloned · the consumer script running *inside the
clone* · **the path allowlist as a literal filter**, with a diff of four files passing
through and anything else bouncing off · the commit · the push · Vercel rebuilding · the
verifier fetching the live page and ticking seven checks · the receipt.

The allowlist is the single best thing to animate in the whole system. Show the three
allowlists side by side (edition, no-edition, dataset) and show a dataset append being
physically unable to touch an article.

### Movement 6 — Carousel Studio

The article arriving as a **summary**, not as an article: 1,100 words collapsing to
kicker + headline + standfirst + 3–8 passages + sources. Then template + payload + brand
tokens composing into SVG, then PNG. Show the same input rendering twice and producing
identical bytes.

Then the hook brain, as a filter cascade: 49 hooks → eligible (gates against this item's
metadata) → after cooldown → after archetype variety → seeded pick → slide 1. Show the
`eligibleSetHash` as a seal, and show an override picking a *different card from the
same hand*.

Show `no-hook` too, for DNESKAi and MMA Files, as an ordinary outcome where the
template's own headline renders.

### Movement 7 — The five repositories

The full map. quorum at the centre; `aifirst` and `mma-files` receiving packages;
`react-express-app` in a **two-way** relationship (3,633 questions in, hook library
out); `titty-tuesdays` **pulling** a sanitized catalog feed rather than being pushed to,
and failing closed to concept mode when it cannot reach it; GoVIRAL as a signal that
feeds back into the two magazines' rooms without ever having a repository of its own.

Each edge should be labelled with what actually crosses it and what cannot.

### What the section must not do

- Do not animate money being spent when the path is deterministic. The summary builder,
  the hook brain, question selection, every gate and every render are $0, and showing
  them as costing something misrepresents the whole design.
- Do not show social posting as live. Nothing has posted. Show the queue filling and the
  lock holding.
- Do not invent metrics. `METRICS_INGESTION_ENABLED=false` and there are no engagement
  numbers to show.
- No generated imagery standing in for real UI, and no fake dashboards.

---

## Part 14 — Open problems for Fable

### 14.1 Efficiency questions

1. **Standing rooms that rarely change a decision.** `tt-marketing` has run 28 paid
   rooms and produced two plans on file. `mma-intake` has run 24. Which of the 13 slots
   should become event-triggered — fired by a material source change or a due agenda
   rather than by the clock?
2. **The retry design.** Every delivered edition except one needed the 09:00 retry, and
   every retry that ran succeeded. If the first attempt fails predictably, is the 05:00
   slot in the wrong place, or is the retry actually the primary?
3. **Two dispatch paths.** The backstop already cost ~600 billable minutes/month before
   it was cut to three sweeps. Is three still two too many?
4. **The board rooms.** `morning` has 28 ledger entries; `afternoon` has 4 and is
   documented as a deterministic $0 checkpoint. What does the morning board decide that
   a deterministic priority queue could not?
5. **Which repeated decisions can become checks.** Name specific ones.
6. **Carousel Studio summaries are not being written yet** (8.3). What should the
   backfill be, and should the derived path stay as a permanent fallback or be retired?
7. **MAKO's weekly review is specified and unwired.** Wire it, drop it, or fold it into
   `mag-desk`?

### 14.2 Design questions for the section itself

1. How do you show 13 daily wake-ups without the page feeling like a cron table?
2. How do you make "this stopped and that is correct" read as competence rather than
   failure?
3. The most interesting mechanism (the path allowlist, the eligible-set hash) is also
   the most abstract. How do you make a hash comparison legible?
4. Five repositories, one of which pulls instead of being pushed to. What layout makes
   that asymmetry obvious at a glance?

### 14.3 New capability: Titty Tuesdays visual proposals

**The owner's requirement, verbatim in intent:**

> Titty Tuesdays must send its proposals as images, so they can be rated properly in the
> Admin section. They must be SVG images that render in the admin. The agents must first
> come up with the idea, then rewrite that idea into a prompt and send it via API call to
> ChatGPT and to Gemini. The owner then gives ratings and picks which t-shirt designs get
> used.

**Design this.** The pipeline is: *room produces a concept → concept is rewritten into an
image prompt → prompt goes to two providers → results render in `/admin` → owner rates →
ratings feed PALATE → PALATE's taste steers the next room.*

What already exists and should be reused rather than rebuilt:

- `rating/1` already has `objectKind: "visual"`. The rating ledger, the
  `rating-widget.tsx` component and the `state/ratings/titty-tuesdays/ledger.jsonl`
  append path are all in place.
- PALATE already distils ratings into `state/taste/titty-tuesdays/TASTE.md` and already
  emits `visualAdjustments`, and already runs as a free pre-step on every `tt-marketing`
  room. The feedback loop the owner wants is **already wired** — it just has nothing
  visual to rate.
- Carousel Studio already renders deterministic SVG and already has a
  `titty-tuesdays` brand token set.
- The admin already renders checked SVG directly (`carousel-studio-panel.tsx`,
  `carousel-article-studio.tsx`), specifically so previews do not need a native image
  library in a serverless request.
- `visual-weights.schema.json` and `config/visual-weights/` already exist.

**Constraints this design has to survive.** State these back to the owner rather than
designing around them silently:

1. **SVG and image models are not the same thing.** ChatGPT's and Gemini's image
   endpoints emit raster (PNG/WebP). They do not emit SVG. "SVG images rendering in the
   admin" and "generated via image API" are two different mechanisms, and the design has
   to pick or bridge:
   - *(a)* the model returns a **structured design spec** (palette, type field, motif,
     placement) and Carousel Studio composes deterministic SVG from it — keeps the whole
     render deterministic, hash-stable and free, and keeps the model doing the part it is
     good at;
   - *(b)* raster generation, stored as a re-hosted asset with provenance, previewed in
     admin — genuine visual variety, but breaks determinism and adds per-image cost;
   - *(c)* both: (a) for the on-brand composition, (b) as reference imagery labelled as
     such.

   Recommend one and say why.
2. **There is no Gemini provider in this system.** `config/models.json` has exactly two
   providers, `anthropic` and `openai`. Adding Google means a new adapter, a new
   credential and a new host on `config/network-allowlist.json` — and a new credential is
   a **`HUMAN_APPROVAL` INBOX item** under golden rule 5, not a config edit.
3. **Image generation is new spend inside a $30 cap** that currently runs at $3.39/month.
   `config/models.json`'s `AVATAR_IMAGE` role exists but its comment states no article
   pipeline has a `gpt-image-2` call site and none may gain one. The ledger has never
   carried a `kind: "image"` entry. A new image path needs a treasury ledger line and an
   envelope before it runs. Price it: N concepts × 2 providers × cost/image × 30 days.
4. **`allowHumanImagery: false`** is enforced in the consumer repo and is brand doctrine,
   not a preference. No human imagery, no nudity, no suggestive posing, no isolated body
   parts, no anatomy-led visuals. Flat lays, garment silhouettes, fabric, labels,
   packaging, type fields and construction details only. Every garment carries the exact
   words `TITTY TUESDAYS`. The prompt-rewriting step has to enforce this, and a
   deterministic checker has to verify the output before it reaches the admin — a model
   asked politely is not a gate.
5. **The venture is pre-commerce.** A rated design is a concept, not a product. Nothing
   in this path may create a sellable state; `resolvePurchasability()` stays the only
   gate.
6. **Provenance.** Every generated asset needs its provider, model version, the exact
   prompt, a content hash and a timestamp on file, the same way `article-image` and the
   licensed-photo path already record theirs.

Deliverable: the contract (a new `design-proposal/1` schema?), the storage path, the
admin surface, the rating flow, the PALATE feedback shape, the cost envelope, the
approval items the owner has to sign, and which of the three mechanisms in constraint 1
you recommend.

---

## Appendix — File map for anything above

| What | Where |
| --- | --- |
| Clock resolution, cron arithmetic | `orchestrator/src/ventures/registry.ts` |
| Cron→meeting resolution, Prague time | `orchestrator/src/meetings/clock.ts` |
| Calendar feed, slot statuses | `orchestrator/src/meetings/calendar.ts` |
| Agenda queue, starvation rule | `orchestrator/src/meetings/agenda.ts` |
| Cycle orchestration | `orchestrator/src/cycle.ts` (1,937 lines) |
| Venture rooms | `orchestrator/src/portfolio/run.ts` (1,720 lines) |
| Edition run | `orchestrator/src/edition/live.ts` |
| Edition production loop | `orchestrator/src/edition/production.ts` |
| Quality gates | `orchestrator/src/edition/quality.ts`, `publication-gate.ts` |
| Source scraping | `orchestrator/src/sources/` |
| Licensed images | `orchestrator/src/images/licensed.ts` |
| Delivery queue and receipts | `orchestrator/src/delivery/outbox.ts` |
| Release proof | `orchestrator/src/delivery/verifier.ts` |
| MMA article production | `orchestrator/src/mma-files/live.ts` (912 lines) |
| marketingShark room | `orchestrator/src/ventures/marketingshark/run.ts` (824 lines) |
| Question bank import | `orchestrator/src/ventures/marketingshark/react-express-app-adapter.ts` |
| Titty Tuesdays cast | `orchestrator/src/titty-tuesdays/schedule.ts` |
| GoVIRAL trends | `orchestrator/src/sources/goviral-trends.ts` |
| Hook brain (orchestrator side) | `orchestrator/src/studio/hook-brain.ts` |
| Hook library delivery | `orchestrator/src/studio/hook-delivery.ts` |
| Carousel summary store | `orchestrator/src/studio/carousel-summary-store.ts` |
| Summary builder | `studio/src/summary.ts` |
| Renderer | `studio/src/renderer.ts` |
| Template + brand library | `studio/src/library.ts` |
| Hook libraries | `studio/hooks/` |
| Hook knowledge base | `docs/hooks/01`–`06` |
| Taste distillation | `orchestrator/src/taste/pipeline.ts` |
| Social pack, queue, activation | `orchestrator/src/social/` |
| Delivery workflow | `.github/workflows/cycle.yml` (1,567 lines) |
| Vercel dispatch route | `site/src/app/api/cron/[phase]/route.ts` |
| Vercel cron table | `site/vercel.json` |
| Venture registry | `config/ventures.json` |
| Agent roster | `config/agents.json` |
| Model routing | `config/models.json` |
| Edition gates | `config/edition-quality.json` |
| Sources | `config/sources.json` |
| GoVIRAL sources | `config/goviral-sources.json` |
| Contracts | `contracts/*.schema.json` (42 files) |
