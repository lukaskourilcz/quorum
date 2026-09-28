# Optional maintenance and future checks

These do not block the active ventures. The 2026-09-28 review keeps them out of the required
owner checklist. Do not port unmerged Claude work or start paid evaluation without a separate scope.
The current release fixes repeated meeting archive reads; broader tracing and admin loader
refactors remain performance improvements, not missing operating prerequisites.

- [ ] **Regenerate the edition rubric receipts before porting its CI check** — `7208396f` on `claude/elegant-cori-h9cdgb` grades each committed edition against a versioned rubric and adds `pnpm edition:rubric -- --check` to CI (#535). Its receipts under `state/quality/edition-rubric/` stop at 2026-09-16, and the editions `main` has recorded since then have none, so the check would fail on arrival. Port the rubric, regenerate every receipt from 2026-09-16 on and commit them, then land the CI step. [imp:2] [owner:ai] [time:1h] [kind:setup]

- [ ] **Finish the decomposition started in issue 147** — `orchestrator/src/cycle.ts` is now
  1,397 lines. Its remaining seams are the double-fire guards, morning shift, operations review,
  artifact writers and night tail; extracting them requires one explicit context object rather
  than another purportedly mechanical move. `orchestrator/src/portfolio/run.ts` is 1,805
  lines and still separates naturally into room lifecycle, room content and the
  `RoomStayedShut` family. Keep the work behavior-neutral and one extracted module per commit.
  [imp:2] [owner:ai] [time:3h] [kind:deploy]

- [ ] **Give Implementation Plans data** — `state/programs/current.json` does not exist, so the
  admin page renders its unavailable state. The live synchronizer never runs in the cycle job:
  GitHub Actions sets `CI=true`, and `CI=true` disables it (`docs/IMPLEMENTATION-PLANS.md`). Settle
  the refresh path of #419 and #431 before building one, so a second progress system is not built
  by accident. [imp:2] [owner:ai] [time:1h] [kind:setup]

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

- [ ] **Load the admin's panels behind the tab that needs them** — `/admin` is `force-dynamic` and
  resolves around thirty loaders in one `Promise.all` before it renders anything, so changing
  `?view=` or `?venture=` costs a measured 5.3 seconds before the URL even commits. Every workspace
  pays for every other workspace's data. The launch board at the top of the overview needs the
  portfolio-wide reads; the venture tabs do not, and moving them behind their own boundaries is
  what turns a five-second tab change into an instant one.
  [imp:3] [owner:ai] [time:2h] [kind:deploy]

- [ ] **Sign off the layouts you have looked at** — `studio/src/family-review.ts` keeps a review record per family and all thirty say `signOff: null` (#543). For each family you accept in `docs/design-lab/families/`, add `signOff: { reviewer: "owner", reviewedAt, note }` to its `RECORDED` entry. Making a sign-off a condition of dealing a family is a separate change; the unused switch for it was left out as dead code (#581). [imp:3] [owner:me] [time:45m] [kind:content]

- [ ] **Re-verify the Czech distribution priors when the next AMI Digital Index publishes** — `config/goviral-distribution-priors.json` rests on the May 2026 edition (1,013 internet users, 15+) and records `verifiedAt: 2026-09-16`. A new edition means new percentages and a new `priorsVersion`. [imp:2] [owner:ai] [time:30m] [kind:content]

- [ ] **Re-verify the pinned Apify actor prices and success rates each quarter** — the prices in
  `config/goviral-sources.json` were verified live on 2026-08-06 and cannot be re-checked at
  runtime; an actor's store page is not an API. Two of the six are community actors and young:
  `themineworks/threads-scraper` was rebuilt on 2026-07-25 and had 104 users at pinning. If its
  30-day success rate drops below about 95%, switch the primary to
  `magicfingers/threads-scraper`, already in the config as the fallback.
  [imp:2] [owner:me] [time:20m] [kind:setup]

- [ ] **Review the Q1 target seeds** in `config/kpis/2026-Q1.json` — confirm the 2026-08-03
  `quarter_start` and the target values, or save your own, before using the quarter for decisions.
  Q1 lasts 90 days and content/social pace excludes the first 14. No code writes that file, so a
  target can only move if you move it. [imp:2] [owner:me] [time:15m] [kind:decision]

## Optional improvements outside the article-only requirement

These are not prerequisites for DNESKAi article delivery. Existing owner proposals remain unsigned.

- [ ] **Create an Anthropic Admin API key for the billed column** — `pnpm cost:report` writes `state/money/cost-report.json` from the metered ledger (#534). The billed column reads `unavailable` until you create an `sk-ant-admin…` key in the Console (organization owners only), store it as `ANTHROPIC_ADMIN_API_KEY` and set `PROVIDER_BILLING_ENABLED=true`. The key is read-only and makes no model call. The `cycle.yml` step passes neither variable today, so wiring them there is part of the same change. [imp:3] [owner:me] [time:15m] [kind:setup]

- [ ] **Decide what a pinned recipe does to a row that already recorded one** — #545's bulk render needs this answer first. `readRecordedRecipe` in `orchestrator/src/social/deck-style.ts` exists so composition reads what inventory wrote. The recommendation is skip-and-report, with an override only behind an explicit flag whose receipt counts the overrides. [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Realign `ROOM_DEGRADATION_ORDER` with the ventures that operate** — the order in `orchestrator/src/portfolio/schedule.ts` sheds `dm-growth`, `kv-desk`, `dm-desk`, `ts-desk` and `bh-desk` first. Those five rooms belong to ventures `operations-2026-09b` pauses, so they already cost `$0`, and the first drop that changes anything takes `gv-brief` while paused `tt-marketing` stays protected. Say which operating rooms go first. [imp:2] [owner:me] [time:15m] [kind:decision]

- [ ] **Review the imported events before the 4 Oct launch** — `pnpm events:import` merged 47 verified Czech and Slovak AI events (28 Oct – 31 Dec 2026, from the marketing plan's research) into `state/ventures/caught-up/events/events.json`; the receipt is `receipts/2026-09-28-import-ea06e2843443.json`. Open the admin Akce tab, correct or archive any you would not publish (future events are editable), and run `pnpm events:candidates` for the ČAUI Luma calendar's newer ones (#554, #592). The cycle syncs the store to aifirst `data/events.json`. [imp:3] [owner:me] [time:30m] [kind:content]

- [ ] **Countersign the DNESKAi yield proposals** — `state/decisions/2026-09-25-dneskai-yield-proposals.md` (`edition-2026-09a`, `Status: proposed`) lists five changes, each with its measured effect from `docs/reports/dneskai-yield-2026-09-25.md`; tick the ones you approve. Nothing in `config/edition-quality.json` changes before you do. [imp:3] [owner:me] [time:20m] [kind:decision]

- [ ] **Configure Vercel Spend Management** — add useful build-spend notifications and a sensible
  soft or hard limit for the Quorum project without purchasing a plan or add-on. [imp:4]
  [owner:me] [time:10m] [kind:setup]

- [ ] **Confirm the curated source registry** — `config/caught-up-streams.json` seeds three Medium
  tags, nine Substacks and eight podcast shows. Eight shows ship `enabled: false` with a note
  because their channel id could not be resolved without guessing, and two empty slots wait for
  the Czech AI shows you pick. Approve, edit or fill; every entry must carry its exact hostname,
  and a test fails if an enabled host is missing from `config/network-allowlist.json`.
  [imp:3] [owner:me] [time:30m] [kind:decision]

- [ ] **Review the curated scene proposals DNESKAi is collecting** — when the vision gate
  approves a licensed-search photograph at fit 8 or better with no vetoes, it is appended as an
  unchecked line to `state/ventures/caught-up/media/scene-proposals.md`, with its provider,
  licence, source URL and a drafted Czech scene line. Each one already ran above a published
  article. Ticking a line nominates it: a later session opens it at 640px, checks that no face in
  it is recognisable, and moves it into the curated set, which is the rung with the most
  predictable covers and currently the smallest. The queue stops at twenty open lines, so an
  unreviewed backlog quietly stops the flywheel rather than growing.
  [imp:2] [owner:me] [time:20m] [kind:content]

- [ ] **Decide the two efficiency-review calls.** Both were measured against the ledger and both
  are product decisions rather than engineering ones. [imp:3] [owner:me] [time:15m] [kind:decision]

- [ ] **Run the admin e2e specs on every pull request, not only on `[full-e2e]`** — the site's
  Playwright job in `.github/workflows/ci.yml` runs only when a PR title or commit message contains
  `[full-e2e]`, so nothing has run it for weeks. In that time the navigation guard drifted two
  destinations out of date, the visual guard was looking for baselines in a directory Playwright
  never writes to, a WCAG AA contrast failure went unseen and three assertions about the admin's
  privacy headers could never have passed against the dev server they run on. All are fixed, but
  the reason they accumulated is that nobody was looking. The four admin specs take about four
  minutes together; the venture-registry sweep is the slow one and could stay opt-in.
  [imp:3] [owner:me] [time:20m] [kind:setup]

- [ ] **Convert @devshark.app to a professional Instagram account** — DNESKAi is already professional, as confirmed in-session. [imp:5] [owner:me] [time:10m] [kind:setup]

- [ ] **Make both Instagram accounts professional** — @devshark.app is still personal (item above); @dneskai already is. Insights, boosting and the publisher all need it. [imp:5] [owner:me] [time:10m] [kind:setup]

- [ ] **Countersign `state/decisions/2026-09-26-devshark-social-queue.md`** — #568 wrote it with status `proposed`; set `countersigned` and name your approval on its signature line. [imp:5] [owner:me] [time:20m] [kind:decision]

- [ ] Add `PIXABAY_API_KEY` to GitHub Actions so the licensed-photo search can use pixabay. Openverse and Wikimedia remain active without it.
