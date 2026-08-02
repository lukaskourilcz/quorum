# Needs your help now — one owner checklist

Updated: 2026-08-02

This is the only canonical list of human-owned setup across all six projects. Code,
contracts, `$0` dry proofs and release checks are complete. Git cannot inspect secret
values or external account settings, so an item remains unchecked until the owner has
verified it in the provider UI. Never paste a credential into Git, an issue, a meeting
record or chat.

## Required to prove the two publishing projects

1. [ ] **Verify the delivery GitHub App installation.** It must include both
   `lukaskourilcz/aifirst` and `lukaskourilcz/mma-files`, with Contents read/write as
   the only write permission. `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY` stay in
   `lukaskourilcz/quorum` Actions secrets. If both repositories are already selected,
   mark this done without rotating the key again.
2. [ ] **Verify Vercel production settings.** BoardlessAI must track `main` at
   `https://boardless-ai.vercel.app`. Caught Up must track `main` at
   `https://caughtup-ai.vercel.app`. MMA Files must track `main` at
   `https://mma-files.vercel.app` with `NEXT_PUBLIC_DEMO_MODE=true` and
   `NEXT_PUBLIC_ALLOW_INDEXING=false`. The public BoardlessAI URL is not secret; use a
   repository variable unless a workflow explicitly reads it from secrets.
3. [ ] **Verify the two surviving FightAIQ free-tier keys in Actions secrets.**
   `CITO_API_KEY` is bounded below 500 calls/month, 200/day and five/run.
   `THE_ODDS_API_KEY` is optional for current prices and stops at the provider's zero
   quota. Predictions still work without odds. Do not add GNews, Guardian, NYTimes or
   another paid data API; Wikimedia and reviewed imports remain the `$0` baseline.
4. [ ] **Optionally add licensed-photo keys.** `PEXELS_API_KEY` and
   `PIXABAY_API_KEY` expand the allowed photo search. They are not launch blockers:
   Openverse, Wikimedia Commons and FRAME's deterministic fallback remain available.

## Required before automatic social posting

5. [ ] **Connect Instagram and Threads for each external brand.** Carousel Studio has
   no accounts. Add the following values to the BoardlessAI repository, then run the
   publisher in Validate-only mode:

   | Project | Actions secrets | Repository variables |
   | --- | --- | --- |
   | Caught Up | `CAUGHT_UP_THREADS_ACCESS_TOKEN`, `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID`, `CAUGHT_UP_INSTAGRAM_USER_ID` |
   | MMA Files | `MMA_FILES_THREADS_ACCESS_TOKEN`, `MMA_FILES_INSTAGRAM_ACCESS_TOKEN` | `MMA_FILES_THREADS_USER_ID`, `MMA_FILES_INSTAGRAM_USER_ID` |
   | Titty Tuesdays | `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`, `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN` | `TITTY_TUESDAYS_THREADS_USER_ID`, `TITTY_TUESDAYS_INSTAGRAM_USER_ID` |

   Keep `SOCIAL_KILL_SWITCH=true` during validation. Changing it to `false` removes
   only the owner stop; each project's proof/campaign counter, credentials, enabled
   roles and safety checks still have to pass.

## Required for honest Money and KPI reporting

6. [ ] **Enter actual fixed monthly costs in `/admin`.** Add each subscription with
   its monthly USD amount, category and first-paid date. The empty registry means
   “not entered,” not “free.” Do not enter example prices or API estimates.
7. [ ] **Review Q1 target seeds.** Confirm the 2026-08-03 start and values in
   `config/kpis/2026-Q1.json`. Keep them or save your chosen values before using the
   quarter for decisions. Runtime cannot lower a target or rewrite a past snapshot.

## Deliberately deferred; not a launch blocker

8. [ ] **Choose an analytics provider and lawful measurement plan only when useful.**
   Name the exact decisions the data would change, then approve the provider, legal
   posture and data minimization before setting `METRICS_INGESTION_ENABLED=true`.
   Until then, keep it false; SPLIT remains disabled and follower/engagement KPIs stay
   honestly unavailable. No analytics credential is currently required.

## Completion rule

When items 1–3 and 6–7 are verified, Caught Up and MMA Files are ready for the live
proof order in `MANUAL STEPS.md`. Item 5 is needed only before social posting. Item 4
is optional and item 8 is intentionally deferred. A valid `NO_EDITION`, killed article
or `not-needed` room costs `$0` and is a successful gated outcome; do not pay for a
rerun merely to force content.
