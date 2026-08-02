# BoardlessAI

BoardlessAI is an evidence-governed operating system for a portfolio run by a
bounded AI council. The repository contains the TypeScript orchestrator,
Git-backed state, shared contracts, guarded automation, and a public/admin
Next.js site.

Current status: **operating, pre-revenue, VALIDATION**. The public site is
<https://boardless-ai.vercel.app>. Six project workspaces share this runtime:
Caught Up, Titty Tuesdays, the Magazine Incubator, FightAIQ, Carousel Studio and MMA Files.
The $50 operating limit plus the Caught Up, Titty Tuesdays and FightAIQ scope
decisions are countersigned. Separate live switches, evidence checks and delivery
credentials still decide whether a scheduled wake-up may do work.

The founding evidence gate remains unpassed. Fixture evidence cannot support a
live decision, live founding cycles remain disabled, and external action always
passes the existing owner, budget, evidence, security and release gates.

## Portfolio

| Workspace | Current role | Boundary |
| --- | --- | --- |
| Caught Up | Bilingual daily AI briefing and product board | Guarded delivery writes content only through a repository-scoped GitHub App |
| Titty Tuesdays | Brand, concept seasons and marketing planning | No commerce, inventory, payment, ads, generated people or purchase claims |
| Magazine Incubator | Evidence-backed niche research and fenced content-project founding | Can found only projects that pass the pre-signed template; anything else stops for the owner |
| FightAIQ | Sourced UFC/Oktagon fighter cards, bout discovery and deterministic analysis | D8 evidence gates; no bet placement, affiliate links or bookmaker automation |
| Carousel Studio | Shared deterministic carousel templates and rendering | Internal engine and public showcase only; no accounts, marketing, analytics or image-model calls |
| MMA Files | Public bilingual MMA magazine and social draft archive | Content-only delivery; live articles require verified FightAIQ input and the MMA live switch |

The common registry is `config/ventures.json`. It defines cadence, routing,
budgets, idea namespaces, taste participation and admin tabs. The complete standing
operating model is [`docs/ECOSYSTEM.md`](docs/ECOSYSTEM.md); the compact architecture
summary remains in [`docs/PORTFOLIO.md`](docs/PORTFOLIO.md).

## What is implemented

- Four voting council seats and 36 routed specialists in one validated
  40-agent registry, each with a deterministic illustrated character identity.
- Anonymous council proposals, Borda ranking, `NO_ACTION`, concrete vetoes and
  fallback rechecks.
- Fail-closed monthly, daily, meeting, media and all-in budget enforcement.
- Evidence, opportunity, experiment, stage, finance, treasury, claim and
  content-quality gates, plus a priority queue with per-project caps and a seven-day
  starvation check.
- A 90-day quarterly KPI system with honest unavailable states, a 14-day Q1
  content/social ramp, deterministic daily pace checks and mandatory strategy
  reassessment after a failed quarter.
- Venture-aware routing, ledgers, owner ratings, evidence-linked taste files and
  bounded visual-weight updates.
- Caught Up source collection, bilingual article production, licensed-photo-first
  heroes, English/Czech language desks, verified GitHub App delivery and social packs.
- Titty Tuesdays agenda-driven campaign rooms, 91-day turnover, platform-risk gate,
  season concepts, public venture page and protected launch binder.
- Agenda-led incubator scan and synthesis rooms, complete proposal contract, rating
  lifecycle, public shortlist and pre-signed content-project template founding.
- FightAIQ source gates, two-source fighter records, Glicko-2 engine, versioned
  probabilities, owner odds capture, immutable results and public performance view.
- MMA Files source-first bilingual production, Czech and English style desks,
  licensed-photo-first heroes, public delivery, release proof and guarded social packs.
- Carousel Studio's `carousel-template/1` DSL, ten checked layouts, deterministic
  SVG/PNG renderer, lifecycle, admin preview controls and public showcase.
- One 15-window Prague calendar, 17 deduplicated UTC wake-ups, correct DST
  resolution and collision validation shared by runtime and WeekBoard. Agenda-gated
  windows record `not-needed` without opening paid rooms.
- One daily portfolio digest, capped at 400 words and idempotent per Prague date,
  including deliveries, release proofs, failures and social-unlock counters.
- Fail-closed username/password admin session with Git-backed rating persistence,
  social archive, project tabs, card history and noindex/no-store headers.
- Responsive public site, feeds, metadata, accessibility checks, contrast tests
  and scroll-preserving stateful controls.
- Public `/money` reporting for earning-method gates, quarterly targets, API and
  owner-entered fixed costs, plus a protected fixed-cost editor and owner proposals.
- SHA-pinned GitHub Actions with timeouts, concurrency guards, rebase-first state
  commits and independent Caught Up, portfolio, social and health switches.
- A presentation-only workplace-show skin with season/episode labels and an enforced
  model-packet barrier; no visitor or engagement data is collected.

## Truth boundary

Public pages consume defensive projections. Raw prompts, private model output,
credentials, approval queue details and internal ledgers do not cross the
boundary. Visitor measurement is disabled by design; operational gaps render as
unavailable. Fixtures are labeled and excluded from live evidence and internal
quality signals.

External content and owner notes are untrusted data. Numeric claims require
evidence. Unknown policy behavior remains marked `VERIFY`. No process may
self-approve spend, credentials, new scopes, commerce, stage changes or prompt
doctrine. Content and social posting occur only through pre-signed contracts, health
gates, receipts and kill switches.

## Repository map

```text
config/                     agents, ventures, routing, models, KPIs, costs and policies
contracts/                  exported JSON Schemas
docs/PORTFOLIO.md           human portfolio operating model
docs/ECOSYSTEM.md           canonical full-context brief plus generated operating truth
studio/                     deterministic Carousel Studio package and seed templates
docs/FIGHTAIQ.md            data, model and launch boundary
docs/MMA-FILES.md           public magazine and content-delivery boundary
orchestrator/
  prompts/                  council and specialist role contracts
  src/                      runtime, gates, sources, ventures and notifications
  tests/                    deterministic contract and safety tests
site/
  src/app/                  public routes and protected admin
  src/components/           shared UI and operating surfaces
  src/show/                 presentation-only workplace-show configuration
state/
  meetings/                 sanitized meeting records
  meeting-agendas/          bounded specialist-room requests and consumption state
  ideas/<venture>/          append-only idea history and compact indexes
  ratings/<venture>/        append-only owner ratings when present
  taste/<venture>/          rating-linked taste doctrine
  ventures/<venture>/       venture-native plans, seasons and proposals
  kpis/                     latest pace check, quarter reports and reassessments
  money/public.json         sanitized costs, revenue and earning-method status
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
| `pnpm agents:validate` | Validates all 40 registry entries and available portrait assets |
| `pnpm cycle -- --phase morning --dry --explain-budget --explain-routing` | Runs and explains a dry portfolio-board shift |
| `pnpm cycle -- --phase cu-edition --dry` | Runs the dry Caught Up edition room |
| `pnpm cycle -- --phase tt-marketing --dry` | Runs the weekday Titty Tuesdays fixture room |
| `pnpm cycle -- --phase incubator-scan --dry` | Runs the research scan with no provider calls |
| `pnpm cycle -- --phase incubator-synthesis --dry` | Proves empty input creates no niche proposal |
| `pnpm cycle -- --phase mma-intake --dry` | Checks UFC and Oktagon without live calls |
| `pnpm cycle -- --phase mma-analysis --dry` | Proves the D8 analysis path without a live provider call |
| `pnpm cycle -- --phase mag-editorial --dry` | Accounts for both MMA Files article slots without inventing source packets |
| `pnpm cycle -- --phase mag-desk --dry` | Reviews the bilingual newsroom queue |
| `pnpm cycle -- --phase studio --dry` | Proves the agenda-ready Carousel Studio room without a provider call |
| `pnpm proof:rooms` | Rebuilds fixture-labeled proof for all 13 room kinds |
| `pnpm docs:refresh` | Rebuilds the `$0` operating-truth block in `docs/ECOSYSTEM.md` |
| `pnpm fightaiq:backfill -- --input reviewed-history.json` | Imports cited owner-reviewed history and rebuilds ratings |
| `pnpm fightaiq:roster-sync` | Runs the keyless roster check and one bounded Wikimedia history batch |
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
  production rating history, priorities, agent switches and fixed costs.
  `BOARDLESSAI_GITHUB_REPOSITORY` and
  `BOARDLESSAI_GITHUB_BRANCH` default to `lukaskourilcz/quorum` and `main`.
- `DELIVERY_APP_ID`, `DELIVERY_APP_PRIVATE_KEY` — GitHub Actions credentials for
  the content-only App installed on the approved Caught Up and MMA Files repositories.
- `THE_ODDS_API_KEY`, `CITO_API_KEY` — guarded FightAIQ data sources. Missing
  credentials skip the adapters; forbidden hosts remain unreachable.
- `PEXELS_API_KEY`, `PIXABAY_API_KEY` — optional licensed-photo sources. Openverse,
  Wikimedia Commons and the FRAME fallback work without them.
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
  `FIGHTAIQ_ANALYSIS_ENABLED=true` permits the guarded model path approved in D8.
  Confirmed bouts and both fighter cards still have to pass their evidence checks.
- `MMA_FILES_LIVE_ENABLED=true` permits guarded article production and public
  content delivery after the source packet checks pass.
- `MMA_FILES_INDEXING_ENABLED=true` records the owner's separate indexing decision
  for the MMA Files earning-readiness check. It defaults to false and does not itself
  authorize sponsorships, affiliates or search indexing changes in the consumer app.
- `SOCIAL_KILL_SWITCH=true` is the supreme manual posting stop. With it set to
  `false`, each project still remains locked until its own deterministic health and
  credential gate passes.
- `HEALTH_CHECK_ENABLED=true` opts into external production polling.

A committed `state/PAUSED` stops council work. `state/SOCIAL_PAUSED` stops the
publisher. Missing approval never authorizes a live action.

## Prague schedule and budget

The shared wake-up schedule is 05:00 Caught Up edition, 06:00 board morning, 07:00
incubator scan, 08:00 FightAIQ intake, 09:00 MMA Files story meeting, 10:00
article slot, 11:00 Titty Tuesdays, 13:00 Carousel Studio, 14:00 board afternoon, 17:00 Caught Up
product, 18:00 article slot, 19:00 FightAIQ analysis, 20:00 MMA Files desk,
21:00 incubator synthesis and 22:00 board night. GitHub receives both UTC
daylight-saving variants; duplicates are removed and the runtime accepts only the
one matching Prague time. The morning council may place one bounded specialist
agenda. Titty Tuesdays, both incubator rooms, Carousel Studio, FightAIQ analysis and
the MMA Files desk open on scheduled runs only when an agenda is due. FightAIQ intake also opens
after a material source change. Manual runs remain available for explicit tests.
Afternoon and night are zero-model checkpoints.

The owner countersigned `budget-2026-08d`, setting a `$50` all-in monthly limit,
`$42` model share and `$2.20` daily pace. Project switches and evidence gates
still control live work. At 80% the owner
gets a warning. At 100%, or after three exhausted daily limits in a row, spend
stops and one approval item is opened. Only the owner may raise the limit.

## Admin and publishing

`/admin` is dynamic, noindex, no-store and protected by a constant-time credential
check plus a signed, HttpOnly session cookie.

The global admin view shows the current quarter, earning-method readiness and full
owner proposals when a method becomes ready. Its fixed-cost editor writes real
subscriptions to `config/fixed-costs.json`; an empty list is valid and never implies
that hosting or software is free. `/money` reads only `state/money/public.json`, which
contains amounts and categories without invoices, credentials or personal data.
Authenticated traffic is not counted as a failed login; repeated invalid
credentials are rate-limited. The page displays the priority queue, social readiness
and project-specific ideas, plans, visuals, research proposals, meeting agendas, FightAIQ data,
agent switches, the MMA Files newsroom and Carousel Studio's all-status/all-brand/all-format
template previews, checks, ratings and inspiration links. Ratings are
re-ratable; the latest value governs the UI and prior values remain visible.

Instagram and Threads posting is pre-authorized within the recorded project scopes.
It unlocks separately after verified delivery/campaign health, complete brand
credentials and safety checks. Every post has an idempotency key, live proof and one
safe retry. No follows, likes, comments, messages or result collection exists.

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
- Social account credentials, optional Pexels/Pixabay keys and confirmation of the
  MMA Files App/Vercel connection remain owner-controlled steps in `NEEDED.md`.
- No eligible live experiment or accepted market evidence exists yet.
- Git-backed runtime state assumes one serialized writer.
- Admin has one username/password identity and signed session, not SSO, MFA or
  per-user audit identity.
- FightAIQ analysis is authorized under D8. Current coverage is still incomplete:
  the keyless baseline is historical, UFC active status arrives through a complete
  bounded roster crawl, and no reviewed $0 current Oktagon roster source is wired.
- Delivery proof is automated; missing/broken consumer output retries once, then
  reverts and pauses the affected project.
- Commerce, payment, inventory and ads are not implemented. Incubator founding is
  limited to the pre-signed, no-new-account content-project template.

License: MIT. Security-sensitive operation requires the documented human
approvals and current provider-policy verification.
