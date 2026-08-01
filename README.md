# BoardlessAI

BoardlessAI is an evidence-governed operating system for a portfolio run by a
bounded AI council. The repository contains the TypeScript orchestrator,
Git-backed state, shared contracts, guarded automation, and a public/admin
Next.js site.

Current status: **operating, pre-revenue, VALIDATION**. The public site is
<https://quorum-site-chi.vercel.app>. Five project workspaces share this runtime:
Caught Up, Titty Tuesdays, the Magazine Incubator, FightAIQ and MMA Files.
Unsigned founding and budget records keep the relevant live switches off.

The founding evidence gate remains unpassed. Fixture evidence cannot support a
live decision, live founding cycles remain disabled, and external action always
passes the existing owner, budget, evidence, security and release gates.

## Portfolio

| Workspace | Current role | Boundary |
| --- | --- | --- |
| Caught Up | Bilingual daily AI briefing and product board | Live delivery needs owner gates and a repository-scoped GitHub App |
| Titty Tuesdays | Brand, concept seasons and marketing planning | No commerce, inventory, payment, ads, generated people or purchase claims |
| Magazine Incubator | Evidence-backed niche research for owner rating | No product creation or autonomous founding |
| FightAIQ | Sourced UFC and Oktagon data plus deterministic analysis | Data-only until one reviewed event per organization and a signed mode change; no bet placement |
| MMA Files | Two-slot bilingual MMA newsroom and social draft archive | Private admin newsroom only; live jobs require verified FightAIQ input and signed budget |

The common registry is `config/ventures.json`. It defines cadence, routing,
budgets, idea namespaces, taste participation and admin tabs. The human-readable
operating model is in [`docs/PORTFOLIO.md`](docs/PORTFOLIO.md).

## What is implemented

- Four voting council seats and 34 routed specialists in one validated
  38-agent registry. Twenty-seven portraits are validated; 11 new roles use the
  explicit text fallback pending owner-approved image generation.
- Anonymous council proposals, Borda ranking, `NO_ACTION`, concrete vetoes and
  fallback rechecks.
- Fail-closed monthly, daily, meeting, media and all-in budget enforcement.
- Evidence, opportunity, experiment, stage, finance, treasury, claim and
  content-quality gates.
- Venture-aware routing, ledgers, owner ratings, evidence-linked taste files and
  bounded visual-weight updates.
- Caught Up source collection, bilingual article production, English/Czech
  language desks, GitHub App delivery and draft social packs.
- Titty Tuesdays weekly marketing wheel, 91-day turnover, platform-risk gate,
  season concepts, public venture page and protected launch binder.
- Research-only incubator scan and synthesis rooms, complete proposal contract,
  rating lifecycle and public shortlist.
- FightAIQ source gates, two-source fighter records, Glicko-2 engine, versioned
  probabilities, owner odds capture, immutable results and public performance view.
- MMA Files source-first bilingual production, Czech and English style desks,
  deterministic hero/social art, private article previews and manual metrics.
- One 14-slot Prague calendar, correct DST cron pairs and collision
  validation shared by runtime and WeekBoard.
- One daily portfolio digest, capped at 400 words and idempotent per Prague
  date. The retired per-meeting email path is absent.
- Fail-closed Basic Auth admin with Git-backed rating persistence, social
  archive, venture tabs, card history and noindex/no-store headers.
- Responsive public site, feeds, metadata, accessibility checks, contrast tests
  and scroll-preserving stateful controls.
- SHA-pinned GitHub Actions with timeouts, concurrency guards and independent
  Caught Up, portfolio, social and health switches.

## Truth boundary

Public pages consume defensive projections. Raw prompts, private model output,
credentials, approval queue details and internal ledgers do not cross the
boundary. Missing measurements render as unavailable; fixtures are labeled and
excluded from live evidence and aggregate performance.

External content and owner notes are untrusted data. Numeric claims require
evidence. Unknown policy behavior remains marked `VERIFY`. No process may
self-approve spend, credentials, new scopes, publishing, commerce, stage changes
or prompt doctrine.

## Repository map

```text
config/                     agents, ventures, routing, models and policies
contracts/                  exported JSON Schemas
docs/PORTFOLIO.md           human portfolio operating model
docs/FIGHTAIQ.md            data, model and launch boundary
docs/MMA-FILES.md           private newsroom and publishing boundary
orchestrator/
  prompts/                  council and specialist role contracts
  src/                      runtime, gates, sources, ventures and notifications
  tests/                    deterministic contract and safety tests
site/
  src/app/                  public routes and protected admin
  src/components/           shared UI and operating surfaces
  public/agents/            27 validated WebP portraits plus safe fallbacks
state/
  meetings/                 sanitized meeting records
  ideas/<venture>/          append-only idea history and compact indexes
  ratings/<venture>/        append-only owner ratings when present
  taste/<venture>/          rating-linked taste doctrine
  ventures/<venture>/       venture-native plans, seasons and proposals
.github/workflows/          pinned CI, cycle, publisher and health automation
```

## Local development

Requirements: Node.js 22 or newer, Corepack, and pnpm 10.30.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm agents:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The site runs at `http://localhost:3000`. Dry artifacts stay under ignored
`tmp/dry-run/` or `orchestrator/.dry-run/` paths and do not mutate canonical
state.

Useful commands:

| Command | Result |
| --- | --- |
| `pnpm agents:validate` | Validates all 38 registry entries and available portrait assets |
| `pnpm cycle -- --phase morning --dry --explain-budget --explain-routing` | Runs and explains a dry portfolio-board shift |
| `pnpm cycle -- --phase cu-edition --dry` | Runs the dry Caught Up edition room |
| `pnpm cycle -- --phase tt-marketing --dry` | Runs the weekday Titty Tuesdays fixture room |
| `pnpm cycle -- --phase incubator-scan --dry` | Runs the research scan with no provider calls |
| `pnpm cycle -- --phase incubator-synthesis --dry` | Proves empty input creates no niche proposal |
| `pnpm cycle -- --phase mma-intake --dry` | Checks UFC and Oktagon without live calls |
| `pnpm cycle -- --phase mma-analysis --dry` | Reviews the fixture model state within the data-only gate |
| `pnpm cycle -- --phase mag-editorial --dry` | Accounts for both MMA Files article slots without inventing source packets |
| `pnpm cycle -- --phase mag-desk --dry` | Reviews the private bilingual newsroom queue |
| `pnpm proof:rooms` | Rebuilds fixture-labeled proof for all 12 room kinds |
| `pnpm fightaiq:backfill -- --input reviewed-history.json` | Seeds ratings from an owner-reviewed, two-source history file |
| `pnpm digest:daily -- --dry` | Builds the one daily digest through the log sink |
| `pnpm edition:dry` | Builds and validates a fixture EditionPackage |
| `pnpm delivery -- next` | Inspects the oldest valid delivery package |
| `pnpm social:publish -- --dry-if-disabled --validate-only` | Validates social state without publishing |
| `pnpm site:smoke` | Crawls production routes and internal links against a running build |
| `pnpm --filter @boardlessai/site test:e2e` | Runs Playwright accessibility and interaction checks |

## Environment and switches

Copy `.env.example` to `.env` for local work and never commit populated values.

Core credentials and endpoints:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — guarded live model calls. Missing
  credentials force scheduled work into dry mode.
- `ADMIN_USER`, `ADMIN_PASSWORD` — required together. Missing configuration
  returns `503`; invalid or absent credentials return `401`.
- `BOARDLESSAI_GITHUB_TOKEN` — fine-grained Contents read/write token for
  production rating history. `BOARDLESSAI_GITHUB_REPOSITORY` and
  `BOARDLESSAI_GITHUB_BRANCH` default to `lukaskourilcz/quorum` and `main`.
- `DELIVERY_APP_ID`, `DELIVERY_APP_PRIVATE_KEY` — GitHub Actions credentials for
  the App installed only on `lukaskourilcz/aifirst`.
- `THE_ODDS_API_KEY`, `CITO_API_KEY` — guarded FightAIQ data sources. Missing
  credentials skip the adapters; forbidden hosts remain unreachable.
- `PUBLIC_SITE_URL`, `CAUGHT_UP_SITE_URL` — canonical BoardlessAI and reader
  origins.
- `DAILY_DIGEST_EMAIL_MODE=resend`, `DAILY_DIGEST_EMAIL_FROM`,
  `DAILY_DIGEST_EMAIL_TO`, `RESEND_API_KEY`, `RESEND_FREE_TIER_MONTHLY` and
  `RESEND_FREE_TIER_DAILY` — optional inbox delivery for the one daily digest.

Repository variables are independent authorization switches:

- `AUTONOMY_KILL_SWITCH=false` allows the guarded workflow to evaluate work.
- `CAUGHT_UP_LIVE_ENABLED=true` permits scheduled Caught Up phases after their
  delivery checklist passes.
- `PORTFOLIO_LIVE_ENABLED=true` permits scheduled Titty Tuesdays and incubator
  phases after their decisions pass.
- `FIGHTAIQ_LIVE_ENABLED=true` permits live FightAIQ data rooms;
  `FIGHTAIQ_ANALYSIS_ENABLED=true` separately permits model analysis after the
  recorded data-only mode change.
- `MMA_FILES_LIVE_ENABLED=true` permits the private newsroom only after the
  signed budget and source packet checks pass.
- `SOCIAL_KILL_SWITCH=true` keeps all social output draft-only.
- `HEALTH_CHECK_ENABLED=true` opts into external production polling.

A committed `state/PAUSED` stops council work. `state/SOCIAL_PAUSED` stops the
publisher. Missing approval never authorizes a live action.

## Prague schedule and budget

The shared schedule is 05:00 Caught Up edition, 06:00 board morning, 07:00
incubator scan, 08:00 FightAIQ intake, 09:00 MMA Files story meeting, 10:00
article slot, 11:00 Titty Tuesdays, 14:00 board afternoon, 17:00 Caught Up
product, 18:00 article slot, 19:00 FightAIQ analysis, 20:00 MMA Files desk,
21:00 incubator synthesis and 22:00 board night. GitHub receives both UTC
daylight-saving variants; the runtime accepts only the one matching Prague time.

The owner countersigned `budget-2026-08d`, setting a `$50` all-in monthly limit,
`$42` model share and `$2.20` daily pace. Project switches and evidence gates
still control live work. At 80% the owner
gets a warning. At 100%, or after three exhausted daily limits in a row, spend
stops and one approval item is opened. Only the owner may raise the limit.

## Admin and publishing

`/admin` is dynamic, noindex, no-store and protected by constant-time Basic Auth.
Authenticated traffic is not counted as a failed login; repeated invalid
credentials are rate-limited. The page displays global social drafts and
project-specific ideas, plans, visuals, research proposals, FightAIQ data,
agent switches and the MMA Files newsroom. Ratings are
re-ratable; the latest value governs the UI and prior values remain visible.

Instagram and Threads production starts switched off. The current guarded Instagram path
does not implement the intended four-frame carousel transaction, so autopublish
must remain disabled. A separate owner-approved change must verify current Meta
contracts, scopes and policy before connecting accounts.

## Deployment and rollback

Vercel project `quorum-site` auto-deploys `main`; the confirmed hosting plan is
Pro. The operator checklist is [`NEEDED.md`](NEEDED.md), and the ordered setup
runbook is [`MANUAL STEPS.md`](MANUAL%20STEPS.md).

Rollback:

1. Set the relevant repository kill switch and add `state/PAUSED` when council
   execution must stop.
2. Promote the last known-good immutable Vercel deployment or redeploy that
   exact commit.
3. Run public health, admin-auth, feed and link checks.
4. Record the incident and recovery before re-enabling schedules.

## Current limitations

- BoardlessAI has a documented name-collision risk and must be cleared or
  renamed before paid sponsorship.
- Titty Tuesdays and FightAIQ founding plus the `$50` budget await owner signatures.
- Production admin credentials, Git-backed rating credentials, Caught Up
  delivery credentials and live variables require the owner steps in
  `NEEDED.md`.
- No eligible live experiment or accepted market evidence exists yet.
- Git-backed runtime state assumes one serialized writer.
- Admin has one Basic Auth identity, not SSO, MFA or per-user audit identity.
- FightAIQ remains data-only; live public probabilities are not authorized.
- MMA Files has no public publication route or destination repository yet.
- Commerce, payment, inventory, ads and incubator founding are not implemented.

License: MIT. Security-sensitive operation requires the documented human
approvals and current provider-policy verification.
