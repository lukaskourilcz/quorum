# Needs your help now — one owner checklist

Updated: 2026-08-04

The only canonical list of human-owned setup across all six ventures. Git cannot inspect a
secret's value or an external account's settings, so an item stays unchecked until you have
seen it in the provider's own UI. Never paste a credential into Git, an issue, a meeting
record or chat.

## What already works

Both magazines are Czech-only. MMA Files and DNESKAi (formerly Caught Up) each
write their article in one Czech call instead of writing English and paying again
to translate it. Measured: MMA Files was spending 51% of an article on a draft
nobody read, DNESKAi 39% of an edition. Both sites serve Czech and no longer
offer English; no indexed URL broke doing it.

Both magazines publish. MMA Files delivered its first council-produced article on 2 August — a
Valentina Shevchenko profile, past all nine release checks in
`state/release-proofs/mma-files/`. DNESKAi delivered its first edition on 3 August; its 1 and
4 August deliveries carried no edition, which is a gated outcome at $0 rather than a failure,
and 2 August produced no delivery at all. The delivery App can read the commit, its status and
its check runs on both target repositories; `Delivery doctor` (Actions → run manually) confirms
that in about a minute and names the exact permission if it ever regresses.

The article desk survives a quiet editorial room. On 3 August the 09:00 room left no record and
no slate, and both article slots died with `missing_editorial_slate`. A slot now replays the
desk's own deterministic subject choice from the fighter and event cards on disk instead, and
says in its run file that the slate was derived.

The priority queue and the agenda loop run without you. Every live 06:00 board writes one open
priority item per agenda venture from that venture's `growth_objective` in
`config/ventures.json` — five ventures qualify, and five items were written on 3 August. It
then spends at most one of them commissioning a single specialist room; on 3 August it spent
none, and all five items read `why-not` with that reason. A room that does open can queue a
follow-up agenda for another phase. A phase with no due agenda records `PAUSED` at $0.

What is still waiting: Sunday's budget revert, the two decisions the Czech-only move handed
you, Carousel Studio, the `/admin` credentials that both remaining unblock actions run
through, the company's own opportunity record, five verify-once settings, and social posting.
The sections below are those, in the order that unblocks the most.

## Dated: reverts on Sunday 2026-08-09

- [ ] **Decide whether the editorial review blocks publication again.** On 2026-08-04 you chose
  to publish one article a day and tune the thresholds against real articles on the site rather
  than against a gate nobody had seen output from. One constant carries that:
  `EDITORIAL_REVIEW_BLOCKS_PUBLICATION` in `orchestrator/src/edition/publication-gate.ts`, now
  `false`. Set it to `true` and the old behaviour returns everywhere at once — nothing else in
  the codebase branches on it. Only stylistic and topical verdicts were unblocked: the register
  rules, and the two gates that judge whether the day's story choice is fresh. Everything that
  decides whether the article is *false* still stops the run — supplied source links, cited
  sources, source diversity, signal strength, single-source share, primary sourcing, watchlist
  support, the copy review's source-instruction rule and every cost cap. What to read before
  deciding: each run file under `state/edition/runs/` carries an `unresolvedReview` block
  naming what that day published over, and the delivered package carries the same list, so the
  log of what a blocking gate would have refused is complete for this period.
  [imp:4] [owner:me] [time:15m] [kind:decision]

- [ ] **Put the four doubled budget caps in `.github/workflows/cycle.yml` back.** You doubled
  them on 2026-08-04 because testing rather than production work was spending them, and a cap
  hit was stopping articles from shipping: that morning's edition run billed three calls for
  about $0.25 and delivered no edition. `rewrite_1`'s article failed the quality gate on
  `maximum_repeated_topic_frequency`, and `rewrite_2`, the attempt that would have replaced it,
  could not start — "Edition call reserve 0.138261 would exceed 0.35" in
  `state/edition/runs/2026-08-04-18f2f821b302*.json`. The raise buys more attempts at an
  article that passes the gate; no quality threshold moved. The originals to restore are
  `MAX_CYCLE_BUDGET_USD` `0.20` (now `0.40`), `CU_MEETING_BUDGET_USD` `0.08` (now `0.16`),
  `EDITION_PRODUCTION_BUDGET_USD` `0.35` (now `0.70`) and `DAILY_BUDGET_USD` `1.00` (now
  `2.00`). Each line in the workflow carries the same figure and date beside it. The revert
  also deletes the `temporaryCaps` list in `orchestrator/tests/ci-policy.test.ts`, which pins
  the doubled values, their originals and this date; restoring the workflow without deleting
  that list turns the test red, so the two move in one commit and a half-finished revert
  cannot sit on `main` unnoticed. Nothing warns you if the date simply passes — this checklist
  item and the workflow comments are what carry the date. The two monthly ceilings were not
  touched and need no revert: `MONTHLY_BUDGET_USD` stays 25 and `MONTHLY_OPERATING_CAP_USD`
  stays 30, from `budget-2026-08e`, and the same test asserts both, so the ceiling cannot move
  with the revert either. [imp:5] [owner:me] [time:5m] [kind:setup]

## 0. Decisions the Czech-only move handed you

These are not setup steps. They are choices the migration surfaced that are
yours, not the runtime's.

- [x] **HACEK's registry entry now says what HACEK does.** You authorised the
  `config/agents.json` edit directly, so the mission, responsibilities and
  capability tags no longer describe the removed translation stage. HACEK keeps
  its seat in the DNESKAi edition room (`config/agent-routing.json` lists it as
  required), keeps `editorial:czech` and `social:czech`, and still owns the Czech
  register and the copy repair in `orchestrator/src/edition/localize.ts`. What it
  lost is the production call that adapted an English article;
  `translation:fidelity`, which nothing exercised, is now `editorial:register`.
  JAB, REACH and CANVAS carried the same stale two-language wording and were
  corrected with it. Two fields were deliberately left alone: HACEK's
  `visual.motif` and `visual.avatarAlt` still read "paired translation pages",
  because that is what the rendered portrait at `/agents/hacek.webp` shows and
  rewording them alone would describe an image that does not exist.
  `state/agent-identities/manifest.json` now carries a `pendingRegeneration` entry
  for HACEK saying exactly that, so the stale motif is recorded rather than hidden.
  Regenerating the picture goes through the brand flow, not a string edit.

- [x] **Six runtime prompts no longer describe the two-language newsroom.** You
  authorised these directly. `hacek.md` opened "Receive only an English article"
  and now receives the Czech article the desk already wrote; `jab.md` drafted "the
  English article" and now drafts the Czech one and picks the licensed image;
  `reach.md` asked for "two bilingual draft variants", `canvas.md` for a "two-slot
  bilingual fight newsroom", both now Czech. Two more turned up that the first
  pass had not named: `magazine.md` called the room "bounded bilingual" and told
  it to "keep English and Czech together", and `_shared.md` — the preamble on
  every council call — introduced "STET English copy" and "JAB English reporting".
  These are read into live rooms, so each was an instruction a model acted on.

- [x] **HACEK's third KPI now counts something that happens.**
  `localization.parity_failure_rate` measured agreement between two tellings and
  there is only one, so it could never move off zero. It is now
  `localization.copy_block_rate` (`caughtUpCzechCopyBlockRate`), the share of
  editions the Czech copy gate blocks — same target of 0, same direction, same
  14-cycle warm-up, following the `published-hero-rate` rename. No target was
  lowered and no past snapshot was rewritten.
  **Correction to this entry, 2026-08-04:** it originally ended "it still has no
  collector wired, so it reads 'No verified measurement is connected.'" That was
  wrong. The KPI read nothing at all. The quoted sentence belongs to
  `state/kpis/latest.json`, which is built from the separate quarterly set in
  `config/kpis/2026-Q1.json`; at the time that snapshot carried no `localization.*`
  id, so there was no status, reason or value anywhere to read. It has a collector
  now: `config/kpis.json` declares `receipts/caught-up#copy_block_rate` for this
  id, `config/kpis/2026-Q1.json` carries the same id, and
  `orchestrator/src/metrics/quarterly-collector.ts` produces that measurement.
  `state/kpis/latest.json` is still the older 37-status snapshot, so a number
  appears there only after the next collector run.

- [x] **The bilingual KPI now counts what the desk promises.** It was "Editions
  delivered in English and Czech with a hero image", a practice the company
  stopped on purpose, and it counted an `english-route` check that a Czech-only
  package no longer emits. It is now `caught-up.published-hero-rate`, "Editions
  delivered in Czech with a hero image" — same target of 1, same ratio, counting
  the Czech page and the hero image. No target was lowered and no past snapshot
  was rewritten.

- [ ] **Rename the DNESKAi Vercel project and decide on a domain.** The
  publication is DNESKAi everywhere a reader can see. The deployment is still at
  `caughtup-ai.vercel.app`, the repository is still `aifirst`, and the venture is
  still `caught-up` in every contract and Actions variable — all deliberate, so
  that sealed package hashes and your existing settings keep working. The public
  URL is the one part only you can change. [imp:3] [owner:me] [time:20m] [kind:setup]

- [ ] **Decide whether to keep 77 KPIs that state they have no source.** Renaming
  HACEK's third KPI turned up the larger fact: `config/kpis.json` declared 89
  measurements and produced none. `collectKpis`, the only code that turned those
  definitions into observations, had no caller at all — not a runtime module, not
  a test — and the KPI artifact the runtime does emit, `state/kpis/latest.json`,
  is built from the separate quarterly set in `config/kpis/2026-Q1.json`, whose
  ids did not overlap the registry.
  As of 2026-08-04 that half is fixed in code and the file has stopped claiming
  what it does not have. `collectKpis` is gone; `orchestrator/src/metrics/collect.ts`
  now parses the registry and is imported by `orchestrator/src/org/maintenance.ts`,
  which is what actually used the file — it counts how many entries name an agent
  as owner during an org change and never reads `metric`, `target` or `dir`. Every
  entry now carries a `measurement` block: 12 name a metric source the quarterly
  collector produces (the quarterly set grew from 37 KPIs to 50 to hold them), and
  77 say in the record itself that they have no source and why.
  What is left for you is the 77. Keeping them is defensible — they record which
  role owns which bar, and that is load-bearing for org changes — but a bar nobody
  can read is not a KPI, and two live prompts still talk as though every one of
  them arrives with a number: `orchestrator/prompts/_shared.md` tells every agent
  its owned KPIs come with an `ok|warn|fail|n-a` status, and `retro.md` says a
  tightened target "is written to `config/kpis.json`" when no code writes that
  file. Decide whether the 77 stay as an ownership record with the prompts
  corrected to match, or get cut. [imp:3] [owner:me] [time:45m] [kind:decision]

## 1. Blocking a venture right now

1. [ ] **Add 3–5 inspiration links for Carousel Studio.** In `/admin`, under Carousel
   Studio, paste individual HTTPS article or post links. The list at
   `state/ventures/carousel-studio/inspiration/owner-links.json` is empty, and with an empty
   list the 13:00 room has nothing to work from and can only record an empty decision — it
   has never produced a template. Pinterest boards and bare homepages are rejected; link
   individual pages. No credential or account is needed for this venture.
   [imp:5] [owner:me] [time:15m] [kind:setup]

2. [ ] **Set the `/admin` credentials in Vercel production.** Both remaining unblock actions —
   the Carousel Studio links above and the fixed monthly costs below — run through `/admin`,
   and it needs `ADMIN_USER`, `ADMIN_PASSWORD` and a fine-grained
   `BOARDLESSAI_GITHUB_TOKEN` with Contents read/write on this repository (plus
   `BOARDLESSAI_GITHUB_REPOSITORY` and `BOARDLESSAI_GITHUB_BRANCH` if you are not using the
   defaults). Without them the checklist points at a door that will not open.
   [imp:5] [owner:me] [time:10m] [kind:setup]

3. [ ] **Add the first opportunity record to `state/OPPORTUNITIES.json`.** The file still holds
   only fixtures, so the opportunity gate scores every shift `INSUFFICIENT_EVIDENCE` — the
   newest scorecard that ran the gate, `state/scorecards/20260803203958-night.json`, reads
   34/50 against `FIX-OPP-003`, one point under the gate, with no eligible evidence — and
   each shift record carries an empty evidence list as a result. The
   task allowlist deliberately does not let any agent write this file; the narrow write scope
   is a guard, so do not widen it. Needs a score ≥35/50, no dimension below 2, and ≥3
   independent non-fixture evidence refs in `state/EVIDENCE.jsonl`. This is no longer what
   holds the stage: `config/stages.json` reads `"current": "VALIDATION"` with
   `stageChangeAuthority: owner-only`, and `state/BUSINESS.md` records the entry as
   2026-08-01. (The commit that flipped the file from DISCOVERY is dated 31 July, so the two
   records disagree by a day; nothing in the runtime depends on which is right.)
   [imp:5] [owner:me] [time:60m] [kind:decision]

## 2. Verify once, then leave alone

4. [ ] **Vercel production settings.** BoardlessAI tracks `main` at
   `https://boardless-ai.vercel.app`; DNESKAi at `https://caughtup-ai.vercel.app`; MMA
   Files at `https://mma-files.vercel.app` with `NEXT_PUBLIC_DEMO_MODE=false`. The delivery
   step builds its clone with demo mode off (`cycle.yml` passes `NEXT_PUBLIC_DEMO_MODE=false`),
   so leaving production on demo makes a delivered article's route 404 and fails every page
   check. Keep `NEXT_PUBLIC_ALLOW_INDEXING=false` on both magazines until each has a body of
   work worth indexing. That variable lives in the magazine projects, not this repository, and
   `social-2026-08a` does not cover it — it is your call, separate from the social stop, and
   the answer today is still no. [imp:4] [owner:me] [time:10m] [kind:setup]

5. [ ] **The two FightAIQ free-tier keys in Actions secrets.** `CITO_API_KEY` is bounded
   below 500 calls/month and 200/day, and one run reserves two calls —
   `CITO_MONTHLY_CALL_CAP`, `CITO_DAILY_CALL_CAP` and `CITO_CALL_RESERVATION` in
   `orchestrator/src/portfolio/evidence.ts`. The reservation was five while the run also
   fetched each event's bout list; that endpoint returned nothing on every run and was
   dropped. `THE_ODDS_API_KEY` is optional and stops at the provider's zero quota. Do not
   add GNews, Guardian, NYTimes or any paid data API; Wikimedia and reviewed imports are the
   $0 baseline. [imp:3] [owner:me] [time:5m] [kind:setup]

6. [ ] **Enter actual fixed monthly costs in `/admin`.** Each subscription with its monthly
   USD amount, category and first-paid date. `config/fixed-costs.json` holds an empty `costs`
   array, which means "not entered", not "free". The cap itself is the $30 from
   `budget-2026-08e`; what this registry feeds is the non-API half of the all-in total that
   gets measured against it (`allInNonApiSpentUsd` in `orchestrator/src/budget.ts`), so an
   empty registry makes the company look cheaper than it is. Do not enter example prices.
   [imp:3] [owner:me] [time:15m] [kind:setup]

7. [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json`. Confirm the 2026-08-03
   `quarter_start` and the target values, or save your own, before using the quarter for
   decisions. The set grew from 37 KPIs to 50 on 4 August when the registry's wired entries
   were given quarterly ids, so the 13 newest are the ones you have not seen. No code writes
   that file, so a target can only move if you move it.
   [imp:2] [owner:me] [time:15m] [kind:decision]

8. [ ] **Optionally add `PEXELS_API_KEY` and `PIXABAY_API_KEY`.** They widen the licensed
   photo search. Not a blocker: Openverse, Wikimedia Commons and the deterministic FRAME
   hero remain available, and a photo is now only used when its own title, author or URL
   names the article's subject. [imp:1] [owner:me] [time:5m] [kind:setup]

## 3. Only before social posting

9. [ ] **Connect Instagram and Threads per brand.** Carousel Studio has no accounts.

    | Venture | Actions secrets | Repository variables |
    | --- | --- | --- |
    | DNESKAi | `CAUGHT_UP_THREADS_ACCESS_TOKEN`, `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID`, `CAUGHT_UP_INSTAGRAM_USER_ID` |
    | MMA Files | `MMA_FILES_THREADS_ACCESS_TOKEN`, `MMA_FILES_INSTAGRAM_ACCESS_TOKEN` | `MMA_FILES_THREADS_USER_ID`, `MMA_FILES_INSTAGRAM_USER_ID` |
    | Titty Tuesdays | `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`, `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN` | `TITTY_TUESDAYS_THREADS_USER_ID`, `TITTY_TUESDAYS_INSTAGRAM_USER_ID` |

    Decision `social-2026-08a` keeps all of this closed until each magazine has rendered ten
    articles. `state/social/activation.json` reads DNESKAi 1/7, MMA Files 1/10 and Titty
    Tuesdays 0/4 — the runtime's own per-venture thresholds, which are not all ten. Keep
    `SOCIAL_KILL_SWITCH=true`; setting it to `false` removes only the owner stop, and each
    venture's counter, credentials, roles and safety checks still have to pass.
    [imp:2] [owner:me] [time:45m] [kind:setup]

## 4. One scheduling key that does nothing

- [ ] **`timezone:` under `on.schedule` is not honoured by GitHub Actions.** `health.yml` and
  `social-publisher.yml` both carry `timezone: "Europe/Prague"` beside their cron. The files
  parse and the workflows do fire, so nothing is blocked, but the key has no effect and the cron
  is read as UTC. The evidence for that is the Actions run list, not this repository: every
  scheduled `Production health` run since 24 July started at or after 08:15 UTC (earliest
  08:23), never near 06:15 UTC, which is what 08:15 Prague would be in summer. Nothing under
  `state/` records those start times, so the run list is the only place to re-check it.
  So the health workflow — and the daily meeting reconciler that now runs as a second job
  inside it — fires at 08:15 UTC, roughly 10:15 Prague in summer and 09:15 in winter. That is
  still hours after the last slot of the day being reconciled, so the reconciler is correct
  either way; the schedule simply is not the Prague time it looks like. Decide whether to drop
  the key or move the cron. `orchestrator/tests/ci-policy.test.ts` asserts the key is present in
  both files, so removing it means changing that assertion in the same commit. The social
  publisher runs hourly, so its own schedule is unaffected. [imp:2] [owner:me] [time:10m] [kind:decision]

## Deliberately deferred

10. [ ] **Analytics.** Name the exact decisions the data would change, then approve the
    provider, legal posture and data minimisation before setting
    `METRICS_INGESTION_ENABLED=true`. Until then follower and engagement KPIs stay honestly
    unavailable and no analytics credential is required. [imp:1] [owner:me] [time:0m] [kind:decision]

## Already done

- [x] **"Add a priority item through `/admin`" is retired, not done by you.** It was on this
  list because an agenda-gated room needs a due agenda, an agenda needs an open priority item,
  and the admin UI was the only writer. The 06:00 board now seeds one item per agenda venture
  from that venture's `growth_objective`, so the loop starts from inside the system; five
  items were written on 3 August. The item's other claim — that Titty Tuesdays marketing and
  Carousel Studio skipped for want of one — was wrong in a second way: an empty queue was not
  what stopped them, and the rooms record `PAUSED` at $0, not a skip.
- [x] **The six repository variables and both model API keys.** All present as of
  2026-08-02. `PORTFOLIO_LIVE_ENABLED` was set at 12:26 UTC, which is why the morning half
  of that day correctly skipped.
- [x] **Delivery App `Checks` and `Commit status` read access.** Granting the permission on
  the App is not enough; each installation has to accept the update before the tokens it
  mints carry it. Verified with `Delivery doctor`.
- [x] **The delivery App covers both `lukaskourilcz/aifirst` and `lukaskourilcz/mma-files`,**
  with Contents read/write as the only write permission.
- [x] **Five stale branches were cleared on 3 August.** Four were ancestors of `main` with
  nothing unique in them. The fifth carried Gemini, Groq and OpenRouter adapters; the owner
  declined the providers, so it was deleted (`01b9445`). Anthropic and OpenAI remain the only
  model providers, and `config/network-allowlist.json` gains no new host. `main` was the only
  branch left afterwards; the repository holds working branches again as sessions open them,
  which is expected — the cleanup was about abandoned work, not about staying at one branch.

## Completion rule

A `NO_EDITION`, a killed article or a `not-needed` room costs $0 and is a successful gated
outcome. Do not pay for a rerun to force content. The calendar now marks a slot a gate
turned off as **Skipped** with the reason in its tooltip, so an empty day tells you which
gate to open rather than looking like a fault.

## SOCIAL-PLATFORM-CREDENTIALS

Add the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: caught-up: CAUGHT_UP_THREADS_ACCESS_TOKEN, CAUGHT_UP_THREADS_USER_ID, CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN, CAUGHT_UP_INSTAGRAM_USER_ID; mma-files: MMA_FILES_THREADS_ACCESS_TOKEN, MMA_FILES_THREADS_USER_ID, MMA_FILES_INSTAGRAM_ACCESS_TOKEN, MMA_FILES_INSTAGRAM_USER_ID; titty-tuesdays: TITTY_TUESDAYS_THREADS_ACCESS_TOKEN, TITTY_TUESDAYS_THREADS_USER_ID, TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN, TITTY_TUESDAYS_INSTAGRAM_USER_ID. The per-venture gates remain locked and no post is attempted.
