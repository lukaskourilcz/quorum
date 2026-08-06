# Needs your help now — one owner checklist

Updated: 2026-08-06

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

Both magazines publish, and every day now ends with something delivered. MMA Files delivered
its first council-produced article on 2 August — a Valentina Shevchenko profile, past all nine
release checks in `state/release-proofs/mma-files/`. DNESKAi delivered its first edition on
3 August. A day that produces no edition now delivers the explanation instead of leaving a
hole, and 2 August, the one date with no delivery at all, has a receipt.

The day is eleven slots: 05:00 edition production with a 09:00 retry, 06:00 board, 08:00 fight
data check, 09:00 story meeting, 10:00 article production, 11:00 marketing, 14:00 checkpoint,
17:00 DNESKAi product room, 19:00 model check, 20:00 desk review, 22:00 checkpoint. No full day
under this clock has been measured yet: 6 August came to $0.363 across six slots and 4 August to
$0.412 across seven, both against a $1.00 daily pace and the $30 all-in monthly cap from
`budget-2026-08e`.

The site says what happened in words. Live meeting pages show their full discussion, a slot
nobody needed shows one sentence and is not clickable, and no public surface prints a URL,
a file path, a commit hash or a machine code — the record parser rejects one that tries. The
single deliberate exception is the collapsible "See the article that was sent in .json" block
on a delivery day.

What is still waiting: one API key that unblocks every FightAIQ output, two optional photo
keys, the taste loop for Titty Tuesdays, the `/admin` credentials that several actions run
through, the DNESKAi public URL, the fixed-cost registry, the next Titty Tuesdays season, and
social posting. The list below is those, in the order that unblocks the most.

## 1. Blocking output right now

1. [ ] **Add `THE_ODDS_API_KEY` to Actions secrets** (and optionally `CITO_API_KEY`). This is
   the single unblock for every FightAIQ output: without a price source the evening model check
   has nothing to compare a model estimate against, so it records no calibration and the
   readiness dossiers stay empty. `THE_ODDS_API_KEY` stops at the provider's zero quota by
   design. `CITO_API_KEY` is bounded below 500 calls/month and 200/day, and one run reserves
   two calls — `CITO_MONTHLY_CALL_CAP`, `CITO_DAILY_CALL_CAP` and `CITO_CALL_RESERVATION` in
   `orchestrator/src/portfolio/evidence.ts`. Do not add GNews, Guardian, NYTimes or any paid
   data API; Wikimedia and reviewed imports are the $0 baseline.
   [imp:5] [owner:me] [time:10m] [kind:setup]

2. [ ] **Optionally add `PEXELS_API_KEY` and `PIXABAY_API_KEY`.** Free tier, and they widen the
   licensed photo pool for both magazines at once. Not a blocker: Openverse, Wikimedia Commons,
   the curated illustrative set and the deterministic FRAME plate remain available, and a photo
   is only used when its own title, author or URL names the article's subject.
   [imp:4] [owner:me] [time:5m] [kind:setup]

3. [ ] **Rate the seven Titty Tuesdays idea cards in `/admin`.** The marketing room writes
   concrete campaign ideas every day and nothing has ever rated one, so the taste loop that
   turns your ratings into written style rules has no input and PALATE has nothing to work
   from. Seven cards are waiting under the venture's ideas tab. Rating them is the whole of
   what starts the loop. [imp:4] [owner:me] [time:20m] [kind:decision]

4. [ ] **Set the `/admin` credentials in Vercel production.** Several actions on this list run
   through `/admin` — the idea ratings above, the fixed costs below, the deck design switcher —
   and it needs `ADMIN_USER`, `ADMIN_PASSWORD` and a fine-grained `BOARDLESSAI_GITHUB_TOKEN`
   with Contents read/write on this repository (plus `BOARDLESSAI_GITHUB_REPOSITORY` and
   `BOARDLESSAI_GITHUB_BRANCH` if you are not using the defaults). Without them the checklist
   points at a door that will not open. [imp:5] [owner:me] [time:10m] [kind:setup]

## 2. Yours to decide

5. [ ] **Rename the DNESKAi Vercel project and decide on a domain.** The publication is DNESKAi
   everywhere a reader can see. The deployment is still at `caughtup-ai.vercel.app`, the
   repository is still `aifirst`, and the venture is still `caught-up` in every contract and
   Actions variable — all deliberate, so that sealed package hashes and your existing settings
   keep working. The public URL is the one part only you can change. Delivery receipts now
   record the article URL they published to, so changing the project name means the older
   receipts point at the old host. [imp:3] [owner:me] [time:20m] [kind:setup]

6. [ ] **Enter actual fixed monthly costs in `/admin` — or leave the flag as your answer.**
   `config/fixed-costs.json` now carries `confirmedNoFixedCosts: true`, which says "there are
   none" rather than "nobody has entered any". If that is right, this item is done and you can
   tick it. If you do pay for something, enter each subscription with its monthly USD amount,
   category and first-paid date: that registry feeds the non-API half of the all-in total
   measured against the $30 cap (`allInNonApiSpentUsd` in `orchestrator/src/budget.ts`), so a
   wrong answer makes the company look cheaper than it is. Do not enter example prices.
   [imp:3] [owner:me] [time:15m] [kind:setup]

7. [ ] **Write season 002 for Titty Tuesdays before 2026-10-30.** Season 001 expires then and
   the marketing room works from the current season; with none, it has a standing objective and
   no material. The warning appears in the room's own daily brief as the date approaches.
   [imp:2] [owner:me] [time:60m] [kind:content]

## 3. Only before social posting

8. [ ] **Connect Instagram and Threads per brand.** Roughly a month out. Carousel Studio has no
   accounts.

    | Venture | Actions secrets | Repository variables |
    | --- | --- | --- |
    | DNESKAi | `CAUGHT_UP_THREADS_ACCESS_TOKEN`, `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID`, `CAUGHT_UP_INSTAGRAM_USER_ID` |
    | MMA Files | `MMA_FILES_THREADS_ACCESS_TOKEN`, `MMA_FILES_INSTAGRAM_ACCESS_TOKEN` | `MMA_FILES_THREADS_USER_ID`, `MMA_FILES_INSTAGRAM_USER_ID` |
    | Titty Tuesdays | `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`, `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN` | `TITTY_TUESDAYS_THREADS_USER_ID`, `TITTY_TUESDAYS_INSTAGRAM_USER_ID` |

    Decision `social-2026-08a` keeps all of this closed until each magazine has rendered ten
    articles. `state/social/activation.json` reads DNESKAi 1/7, MMA Files 1/10 and Titty
    Tuesdays 0/4 — the runtime's own per-venture thresholds, which are not all ten. Keep
    `SOCIAL_KILL_SWITCH=true`; setting it to `false` removes only the owner stop, and each
    venture's counter, credentials, roles and safety checks still have to pass. Until a channel
    is enabled the composer no longer renders inventory nothing can consume, and the hourly
    publisher cron is commented out in `.github/workflows/social-publisher.yml` — restore both
    when you connect an account. [imp:2] [owner:me] [time:45m] [kind:setup]

## Verify once, then leave alone

- [ ] **Vercel production settings.** BoardlessAI tracks `main` at
  `https://boardless-ai.vercel.app`; DNESKAi at `https://caughtup-ai.vercel.app`; MMA
  Files at `https://mma-files.vercel.app` with `NEXT_PUBLIC_DEMO_MODE=false`. The delivery
  step builds its clone with demo mode off (`cycle.yml` passes `NEXT_PUBLIC_DEMO_MODE=false`),
  so leaving production on demo makes a delivered article's route 404 and fails every page
  check. Keep `NEXT_PUBLIC_ALLOW_INDEXING=false` on both magazines until each has a body of
  work worth indexing. That variable lives in the magazine projects, not this repository, and
  `social-2026-08a` does not cover it — it is your call, separate from the social stop, and
  the answer today is still no. [imp:4] [owner:me] [time:10m] [kind:setup]

- [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json`. Confirm the 2026-08-03
  `quarter_start` and the target values, or save your own, before using the quarter for
  decisions. No code writes that file, so a target can only move if you move it.
  [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Add the first opportunity record to `state/OPPORTUNITIES.json`.** The file still holds
  only fixtures, so the opportunity gate scores every shift `INSUFFICIENT_EVIDENCE`. The task
  allowlist deliberately does not let any agent write this file; the narrow write scope is a
  guard, so do not widen it. Needs a score ≥35/50, no dimension below 2, and ≥3 independent
  non-fixture evidence refs in `state/EVIDENCE.jsonl`. This is not what holds the stage:
  `config/stages.json` reads `"current": "VALIDATION"` with `stageChangeAuthority: owner-only`.
  [imp:3] [owner:me] [time:60m] [kind:decision]

## Deliberately deferred

- [ ] **Analytics.** Name the exact decisions the data would change, then approve the
  provider, legal posture and data minimisation before setting
  `METRICS_INGESTION_ENABLED=true`. Until then follower and engagement KPIs stay honestly
  unavailable and no analytics credential is required. [imp:1] [owner:me] [time:0m] [kind:decision]

## Already done

- [x] **The two Sunday reverts are settled, not pending.** The editorial review stays
  non-blocking permanently: style and freshness verdicts publish with an `unresolvedReview`
  record, and every gate that decides whether an article is *false* still stops the run. The
  doubled caps are back to `MAX_CYCLE_BUDGET_USD` 0.20, `CU_MEETING_BUDGET_USD` 0.08 and
  `DAILY_BUDGET_USD` 1.00; the edition per-run cap settles at 0.50 rather than 0.35, which is
  what makes the promised second rewrite affordable inside unchanged daily and monthly
  ceilings. `MONTHLY_BUDGET_USD` stays 25 and `MONTHLY_OPERATING_CAP_USD` stays 30.
- [x] **Carousel Studio needs no inspiration links from you.** The venture holds no meeting
  now — its engine renders deterministically at $0 — so nothing is waiting on a reading list.
  The link store still exists and still refuses boards and bare homepages if you want to use it.
- [x] **The `timezone:` key that did nothing is gone.** GitHub reads every cron as UTC and
  ignores the key; `health.yml` and `social-publisher.yml` no longer carry it, and the test
  that pinned its presence now pins its absence.
- [x] **"Add a priority item through `/admin`" is retired.** The 06:00 board seeds one item per
  agenda venture from that venture's `growth_objective`, so the loop starts from inside the
  system.
- [x] **The six repository variables and both model API keys.** All present as of 2026-08-02.
- [x] **Delivery App `Checks` and `Commit status` read access,** verified with `Delivery doctor`.
- [x] **The delivery App covers both `lukaskourilcz/aifirst` and `lukaskourilcz/mma-files`,**
  with Contents read/write as the only write permission.

## Completion rule

A killed edition, a killed article or a room nobody needed costs $0 and is a successful gated
outcome. Do not pay for a rerun to force content. What changed is that a killed day still
delivers its explanation, so an empty day on the calendar tells you which gate closed rather
than looking like a fault.

## SOCIAL-PLATFORM-CREDENTIALS

Add the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: caught-up: CAUGHT_UP_THREADS_ACCESS_TOKEN, CAUGHT_UP_THREADS_USER_ID, CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN, CAUGHT_UP_INSTAGRAM_USER_ID; mma-files: MMA_FILES_THREADS_ACCESS_TOKEN, MMA_FILES_THREADS_USER_ID, MMA_FILES_INSTAGRAM_ACCESS_TOKEN, MMA_FILES_INSTAGRAM_USER_ID; titty-tuesdays: TITTY_TUESDAYS_THREADS_ACCESS_TOKEN, TITTY_TUESDAYS_THREADS_USER_ID, TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN, TITTY_TUESDAYS_INSTAGRAM_USER_ID. The per-venture gates remain locked and no post is attempted.
