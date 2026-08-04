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
Valentina Shevchenko profile, live in Czech, past all nine release checks. DNESKAi delivered its
first edition on 3 August; its 1 and 4 August deliveries recorded `no_edition`, which is a
gated outcome at $0 rather than a failure. The delivery App can read the commit, its status and
its check runs on both target repositories; `Delivery doctor` (Actions → run manually) confirms
that in about a minute and names the exact permission if it ever regresses.

The article desk survives a quiet editorial room. On 3 August the 09:00 room left no record and
no slate, and both article slots died with `missing_editorial_slate`. A slot now replays the
desk's own deterministic subject choice from the fighter and event cards on disk instead, and
says in its run file that the slate was derived.

The priority queue and the agenda loop run without you. Every live 06:00 board writes one open
priority item per agenda venture from that venture's `growth_objective` in
`config/ventures.json`, then spends at most one of them commissioning a single specialist room;
a room that opens can queue a follow-up agenda for another phase. A phase with no due agenda
records `PAUSED` at $0.

Carousel Studio, the company's own opportunity record and social posting are what is still
waiting. The sections below are those, in the order that unblocks the most.

## 0. Decisions the Czech-only move handed you

These are not setup steps. They are choices the migration surfaced that are
yours, not the runtime's.

- [x] **HACEK's registry entry now says what HACEK does.** You authorised the
  `config/agents.json` edit directly, so the record no longer describes the
  removed translation stage. HACEK keeps its seat in the DNESKAi edition room,
  keeps `editorial:czech` and `social:czech`, and still owns the Czech register
  and the copy repair in `orchestrator/src/edition/localize.ts`. What it lost is
  the production call that adapted an English article; `translation:fidelity`,
  which nothing exercised, is now `editorial:register`. JAB, REACH and CANVAS
  carried the same stale two-language wording and were corrected with it.

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
  lowered and no past snapshot was rewritten. Like HACEK's other two, it still has
  no collector wired, so it reads "No verified measurement is connected."

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

- [ ] **Decide what `config/kpis.json` is for. Nothing measures it.** Renaming
  HACEK's third KPI turned up the larger fact: none of that file's 89 KPIs
  produces a number anywhere, and HACEK's three are not a special case.
  `collectKpis` in `orchestrator/src/metrics/collect.ts` is the only code that
  turns those definitions into observations, and nothing imports it — no runtime
  module and no test; `evaluateKpi` is reachable only through it. The single
  runtime read of the file, `orchestrator/src/org/maintenance.ts`, counts how
  many entries name an agent as owner during an org change and never looks at
  `metric`, `target` or `dir`. The KPI artifact the runtime does emit,
  `state/kpis/latest.json`, holds 37 statuses and is built from the separate
  quarterly set in `config/kpis/2026-Q1.json`; the two id sets share not one id,
  so no `vize.*`, `forge.*` or `localization.*` reading exists to look up. Two
  live prompts describe the missing half as though it were there:
  `orchestrator/prompts/_shared.md` tells every agent its owned KPIs arrive with
  an `ok|warn|fail|n-a` status, and `retro.md` says a tightened target "is
  written to `config/kpis.json`" — no code writes it. Three honest ways out, and
  which one is a call about what the company wants to pay for: wire collectors
  for the handful of metrics worth measuring, cut the file down to what the
  quarterly set already measures, or keep all 89 and relabel the file as the
  role-ownership record it actually is. [imp:3] [owner:me] [time:45m] [kind:decision]

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
   newest scorecard reads 34/50 against `FIX-OPP-003`, one point under the gate, with no
   eligible evidence — and each shift record carries an empty evidence list as a result. The
   task allowlist deliberately does not let any agent write this file; the narrow write scope
   is a guard, so do not widen it. Needs a score ≥35/50, no dimension below 2, and ≥3
   independent non-fixture evidence refs in `state/EVIDENCE.jsonl`. This is no longer what
   holds the stage: the company entered VALIDATION on 1 August through the owner-only stage
   mechanism in `config/stages.json`. [imp:5] [owner:me] [time:60m] [kind:decision]

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
   below 500 calls/month, 200/day and five per run. `THE_ODDS_API_KEY` is optional and stops
   at the provider's zero quota. Do not add GNews, Guardian, NYTimes or any paid data API;
   Wikimedia and reviewed imports are the $0 baseline. [imp:3] [owner:me] [time:5m] [kind:setup]

6. [ ] **Enter actual fixed monthly costs in `/admin`.** Each subscription with its monthly
   USD amount, category and first-paid date. An empty registry means "not entered", not
   "free", and the all-in cap is computed from it. Do not enter example prices.
   [imp:3] [owner:me] [time:15m] [kind:setup]

7. [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json`. Confirm the 2026-08-03
   start and the values, or save your own, before using the quarter for decisions. The
   runtime cannot lower a target or rewrite a past snapshot.
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
  is read as UTC: every scheduled `Production health` run since 24 July started at or after
  08:15 UTC (earliest 08:23), never near 06:15 UTC, which is what 08:15 Prague would be in
  summer. So the health workflow — and the daily meeting reconciler that now runs as a second job
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
- [x] **The repository holds one branch.** Four were ancestors of `main` with nothing unique
  in them. The fifth carried Gemini, Groq and OpenRouter adapters; the owner declined the
  providers on 3 August, so it was deleted (`01b9445`). Anthropic and OpenAI remain the only
  model providers, and `config/network-allowlist.json` gains no new host.

## Completion rule

A `NO_EDITION`, a killed article or a `not-needed` room costs $0 and is a successful gated
outcome. Do not pay for a rerun to force content. The calendar now marks a slot a gate
turned off as **Skipped** with the reason in its tooltip, so an empty day tells you which
gate to open rather than looking like a fault.

## SOCIAL-PLATFORM-CREDENTIALS

Add the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: caught-up: CAUGHT_UP_THREADS_ACCESS_TOKEN, CAUGHT_UP_THREADS_USER_ID, CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN, CAUGHT_UP_INSTAGRAM_USER_ID; mma-files: MMA_FILES_THREADS_ACCESS_TOKEN, MMA_FILES_THREADS_USER_ID, MMA_FILES_INSTAGRAM_ACCESS_TOKEN, MMA_FILES_INSTAGRAM_USER_ID; titty-tuesdays: TITTY_TUESDAYS_THREADS_ACCESS_TOKEN, TITTY_TUESDAYS_THREADS_USER_ID, TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN, TITTY_TUESDAYS_INSTAGRAM_USER_ID. The per-venture gates remain locked and no post is attempted.
