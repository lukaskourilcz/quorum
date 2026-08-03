# Needs your help now — one owner checklist

Updated: 2026-08-03

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

MMA Files publishes. The first council-produced article — a Valentina Shevchenko profile —
is live in English and Czech and passed all nine release checks. The delivery App can read
the commit, its status and its check runs on both target repositories; `Delivery doctor`
(Actions → run manually) confirms that in about a minute and names the exact permission if
it ever regresses.

Nothing else publishes yet. The three sections below are what each remaining venture is
waiting for, in the order that unblocks the most.

## 0. Decisions the Czech-only move handed you

These are not setup steps. They are choices the migration surfaced that are
yours, not the runtime's.

- [ ] **Decide what happens to HACEK.** HACEK was the Czech language editor: it
  adapted the English edition and the English article into Czech. Both magazines
  are written in Czech now, so the role has no model call attached to it. The
  agent still holds a seat in the DNESKAi edition room and its approved role
  record still names `orchestrator/src/edition/localize.ts`, which now holds the
  Czech register and the copy repair rather than a translation stage. Removing an
  agent from a room is an org change and goes through PEOPLE, so nothing was
  touched. [imp:3] [owner:me] [time:20m] [kind:decision]

- [ ] **Decide what `bilingual_hero_rate` should measure.** The KPI is literally
  named "Editions delivered in English and Czech" and the company has stopped
  doing that on purpose. It now reads honestly — a Czech-only edition scores
  zero — rather than borrowing a pass from a check that no longer runs. Either
  retire it or replace it with the thing you actually want counted. The runtime
  cannot lower a target or rewrite a past snapshot, so this is yours.
  [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Rename the DNESKAi Vercel project and decide on a domain.** The
  publication is DNESKAi everywhere a reader can see. The deployment is still at
  `caughtup-ai.vercel.app`, the repository is still `aifirst`, and the venture is
  still `caught-up` in every contract and Actions variable — all deliberate, so
  that sealed package hashes and your existing settings keep working. The public
  URL is the one part only you can change. [imp:3] [owner:me] [time:20m] [kind:setup]

## 1. Blocking a venture right now

1. [ ] **Add 3–5 inspiration links for Carousel Studio.** In `/admin`, under Carousel
   Studio, paste individual HTTPS article or post links. The list at
   `state/ventures/carousel-studio/inspiration/owner-links.json` is empty, and with an empty
   list the 13:00 room has nothing to work from and can only record an empty decision — it
   has never produced a template. Pinterest boards and bare homepages are rejected; link
   individual pages. No credential or account is needed for this venture.
   [imp:5] [owner:me] [time:15m] [kind:setup]

2. [ ] **Set the `/admin` credentials in Vercel production.** Two documented unblock
   actions — adding a priority item and entering fixed costs — both run through `/admin`,
   and it needs `ADMIN_USER`, `ADMIN_PASSWORD` and a fine-grained
   `BOARDLESSAI_GITHUB_TOKEN` with Contents read/write on this repository (plus
   `BOARDLESSAI_GITHUB_REPOSITORY` and `BOARDLESSAI_GITHUB_BRANCH` if you are not using the
   defaults). Without them the checklist points at a door that will not open.
   [imp:5] [owner:me] [time:10m] [kind:setup]

3. [ ] **Add a priority item through `/admin`.** Six specialist phases need a due agenda,
   an agenda needs an open priority item, and the only automatic producer is the quarter-end
   protocol, which does not run until 2026-10-31. Until one item exists, Titty Tuesdays
   marketing and Carousel Studio record a $0 skip every day. Needs item 2 first.
   [imp:4] [owner:me] [time:10m] [kind:setup]

4. [ ] **Add the first opportunity record to `state/OPPORTUNITIES.json`.** The DISCOVERY
   gate reads this file, and the task allowlist deliberately does not let any agent write
   it — the narrow write scope is a guard, so do not widen it. Needs a score ≥35/50, no
   dimension below 2, and ≥3 independent non-fixture evidence refs in `state/EVIDENCE.jsonl`.
   Until then the company board returns `NO_ACTION` every cycle, which is the gate working,
   not a fault. [imp:5] [owner:me] [time:60m] [kind:decision]

## 2. Verify once, then leave alone

5. [ ] **Vercel production settings.** BoardlessAI tracks `main` at
   `https://boardless-ai.vercel.app`; Caught Up at `https://caughtup-ai.vercel.app`; MMA
   Files at `https://mma-files.vercel.app` with `NEXT_PUBLIC_DEMO_MODE=false`. The delivery
   step builds its clone with demo mode off, so leaving production on demo makes a delivered
   article's route 404 and fails every page check. Keep `NEXT_PUBLIC_ALLOW_INDEXING=false`
   until each magazine has ten articles, per `social-2026-08a` — separate switch, do not
   change it yet. [imp:4] [owner:me] [time:10m] [kind:setup]

6. [ ] **The two FightAIQ free-tier keys in Actions secrets.** `CITO_API_KEY` is bounded
   below 500 calls/month, 200/day and five per run. `THE_ODDS_API_KEY` is optional and stops
   at the provider's zero quota. Do not add GNews, Guardian, NYTimes or any paid data API;
   Wikimedia and reviewed imports are the $0 baseline. [imp:3] [owner:me] [time:5m] [kind:setup]

7. [ ] **Enter actual fixed monthly costs in `/admin`.** Each subscription with its monthly
   USD amount, category and first-paid date. An empty registry means "not entered", not
   "free", and the all-in cap is computed from it. Do not enter example prices.
   [imp:3] [owner:me] [time:15m] [kind:setup]

8. [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json`. Confirm the 2026-08-03
   start and the values, or save your own, before using the quarter for decisions. The
   runtime cannot lower a target or rewrite a past snapshot.
   [imp:2] [owner:me] [time:15m] [kind:decision]

9. [ ] **Optionally add `PEXELS_API_KEY` and `PIXABAY_API_KEY`.** They widen the licensed
   photo search. Not a blocker: Openverse, Wikimedia Commons and the deterministic FRAME
   hero remain available, and a photo is now only used when its own title, author or URL
   names the article's subject. [imp:1] [owner:me] [time:5m] [kind:setup]

## 3. Only before social posting

10. [ ] **Connect Instagram and Threads per brand.** Carousel Studio has no accounts.

    | Venture | Actions secrets | Repository variables |
    | --- | --- | --- |
    | Caught Up | `CAUGHT_UP_THREADS_ACCESS_TOKEN`, `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID`, `CAUGHT_UP_INSTAGRAM_USER_ID` |
    | MMA Files | `MMA_FILES_THREADS_ACCESS_TOKEN`, `MMA_FILES_INSTAGRAM_ACCESS_TOKEN` | `MMA_FILES_THREADS_USER_ID`, `MMA_FILES_INSTAGRAM_USER_ID` |
    | Titty Tuesdays | `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`, `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN` | `TITTY_TUESDAYS_THREADS_USER_ID`, `TITTY_TUESDAYS_INSTAGRAM_USER_ID` |

    Decision `social-2026-08a` keeps all of this closed until each magazine has rendered ten
    articles. MMA Files has one. Keep `SOCIAL_KILL_SWITCH=true`; setting it to `false`
    removes only the owner stop, and each venture's counter, credentials, roles and safety
    checks still have to pass. [imp:2] [owner:me] [time:45m] [kind:setup]

## Deliberately deferred


11. [ ] **Analytics.** Name the exact decisions the data would change, then approve the
    provider, legal posture and data minimisation before setting
    `METRICS_INGESTION_ENABLED=true`. Until then follower and engagement KPIs stay honestly
    unavailable and no analytics credential is required. [imp:1] [owner:me] [time:0m] [kind:decision]

## Already done

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
