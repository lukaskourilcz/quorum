# BoardlessAI

BoardlessAI is an evidence-governed, agent-operated company operating system.
The repository contains a bounded council orchestrator, a transparent public
site and git-backed state. Four voting agents make formal decisions; ten
specialists provide routed expertise and independent controls.

Current status: **operating (pre-revenue)** effective 2026-08-01. The site is
deployed at <https://quorum-site-chi.vercel.app>. The owner adopted Caught Up
as Venture 001 and advanced the operating stage to VALIDATION. The founding
gate did not pass, live founding cycles remain disabled, and fixture evidence
stays ineligible. `state/BUSINESS.md` records the decision and boundaries.

The working corporate name has a documented high collision risk. Operating
mode triggered the 2026-08-01 revisit. Caught Up carries product identity and
future revenue; BoardlessAI remains the studio label. The owner must rename or
clear BoardlessAI before accepting a paid sponsorship.

## What is implemented

- Strict pnpm monorepo with a Next.js public/admin site and TypeScript
  orchestrator.
- Fail-closed monthly, daily, cycle and media budget guards.
- Four-seat anonymous proposal/voting flow with Borda ranking, NO_ACTION,
  concrete vetoes and fallback re-checks.
- Deterministic opportunity, evidence, experiment, stage, finance and treasury
  gates.
- Typed Boardroom routing with mandatory control roles, participant reasons and
  sanitized public projections.
- Guarded file patching, network allowlists, external-content sanitization and
  generated-code controls.
- Three-shift standup, finance, social, organization and public-projection
  contracts.
- Twenty canonical agent profiles, shared visual identity, generated WebP
  portraits, provenance manifest and deterministic asset checks.
- Responsive corporate site with all requested routes, feeds, sitemap, metadata
  and a fail-closed Basic Auth admin surface.
- Draft-first Threads/Instagram queue, explicit approvals, two-phase claims,
  immutable receipts and guarded official-API connectors.
- Pinned, timezone-aware GitHub Actions for read-only CI, council cycles, social
  publishing and optional production health checks.

## Truth boundary

The site deliberately renders `n/a` for unavailable measurements and marks
fixture content visibly. `FIX-*` evidence and opportunity cards can exercise
the software but can never select a venture. The fixture standup is excluded
from RSS, JSON Feed, sitemap and aggregate runtime metrics.

Public pages consume sanitized projections only. Raw prompts, private model
output, hidden reasoning, credentials, approval queue contents and detailed
ledgers are never imported into the public site.

## Repository map

```text
config/                   validated models, stages, agents, routing and policies
orchestrator/
  prompts/                council and specialist contracts
  src/sources/adapters/   guarded 11-kind Caught Up source collection
  src/                    cycle, guards, evidence, finance, social and org logic
  tests/                  deterministic safety and end-to-end contract tests
site/
  src/app/                public routes and protected admin route
  src/brand/              canonical tokens and SVG marks
  src/components/ui/      installed UI primitives
  public/agents/          optimized stable agent portraits
state/                    git-backed operating source of truth
  standups/               sanitized, timestamped live shift records
  ideas/                  append-only idea snapshots + compact VAULT index
  public/                 sanitized projections only when generated
  agent-identities/       avatar prompt/provenance/QA/cost manifest
.claude/                  Claude agents, commands and nine operating skills
.agents/skills/           byte-identical Codex mirrors of the nine skills
.github/workflows/        pinned automation
```

## Requirements and local start

- Node.js 22 or newer
- Corepack and pnpm 10.30.0

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

The site runs at `http://localhost:3000`.

Useful commands:

| Command | Result |
| --- | --- |
| `pnpm agents:validate` | Validates the 20 registry entries and all portrait files |
| `pnpm lint` | Runs TypeScript lint checks and Next ESLint |
| `pnpm typecheck` | Typechecks both workspaces |
| `pnpm test` | Runs all deterministic unit and policy tests |
| `pnpm build` | Builds orchestrator output and the production Next app |
| `pnpm cycle -- --phase founding --dry` | Runs an offline founding fixture |
| `pnpm cycle -- --phase morning --dry --explain-budget --explain-routing` | Explains a bounded dry Morning shift |
| `pnpm cycle -- --phase afternoon --dry` | Runs a bounded dry Afternoon shift |
| `pnpm cycle -- --phase night --dry` | Runs a bounded dry Night shift |
| `pnpm edition:dry` | Builds and validates a fixture-backed EditionPackage without paid calls |
| `pnpm delivery -- next` | Inspects the oldest schema- and content-valid delivery outbox item |
| `pnpm sources:shadow` | Collects the 35-source digest into an unconsumed dry-run artifact |
| `pnpm social:publish -- --dry-if-disabled --validate-only` | Validates the social queue without publishing |

Dry-cycle artifacts are written only below `tmp/dry-run/state/`, which is
ignored by git. Canonical state is not mutated.
Source-shadow artifacts are written below `orchestrator/.dry-run/sources/`,
also ignored by git, and no edition or public consumer reads them.
Edition dry-run packages, reports and bilingual MDX build artifacts are written
below `orchestrator/.dry-run/editions/`; delivery does not consume them.

## Environment

Copy `.env.example` to `.env` for local use. `orchestrator/src/env.ts`
preloads `.env` from the repo root via `dotenv` at the top of every
orchestrator entry point. Never commit populated files.

Core variables:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — real council calls. If either is
  missing in scheduled automation, the cycle is forced into dry fixture mode.
- `DELIVERY_APP_ID`, `DELIVERY_APP_PRIVATE_KEY` — Actions-only credentials for
  the `boardlessai-delivery` App installed on `lukaskourilcz/aifirst` with
  repository contents read/write and no broader permission.
- `MONTHLY_OPERATING_CAP_USD`, `MAX_CYCLE_BUDGET_USD`,
  `DAILY_BUDGET_USD`, `MONTHLY_BUDGET_USD` — hard text/API limits.
- `MAX_MEDIA_ASSET_USD`, `DAILY_MEDIA_BUDGET_USD`,
  `MONTHLY_MEDIA_BUDGET_USD` — social media limits.
- `MAX_AGENT_AVATAR_USD`, `MAX_AVATAR_SET_BUDGET_USD` — stable identity asset
  limits.
- `ADMIN_USER`, `ADMIN_PASSWORD` — required together for `/admin`; missing or
  partial credentials return 503, never an open admin.
- `PUBLIC_SITE_URL` — canonical production URL used by metadata, health checks
  and hosted Instagram media.
- `META_GRAPH_API_VERSION`, user IDs and access tokens — used only after the
  corresponding channel is explicitly human-enabled for `autopublish`.

GitHub repository variables provide independent emergency switches. The owner
authorized the council schedule on 2026-07-30:
`AUTONOMY_KILL_SWITCH=false`; social publishing remains disabled with
`SOCIAL_KILL_SWITCH=true`. The Caught Up edition room, SPARK's morning idea slot
and the product room remain dry unless the operator explicitly sets
`CAUGHT_UP_LIVE_ENABLED=true`; edition delivery additionally requires the
installed delivery App. `HEALTH_CHECK_ENABLED=false` until an operator
explicitly opts in. A committed `state/PAUSED` stops both runtimes;
`state/SOCIAL_PAUSED` stops publishing only.

## Council cycles

Five meeting slots use `Europe/Prague` wall time. GitHub receives both UTC DST
variants for each slot; a shared runtime clock table rejects the wrong variant:

- 05:00 — Caught Up edition room
- 06:00 — Morning shift, covering 06:00–14:00
- 14:00 — Afternoon shift, covering 14:00–22:00
- 17:00 — Caught Up product room
- 22:00 — Night shift, covering 22:00–06:00

The Caught Up edition phase has a live producer behind the explicit repository
variable and delivery-secret gates. It collects the guarded source registry,
reserves each Anthropic call against the edition envelope, applies the content
and STET gates, and commits one package to `state/edition/outbox/`. Delivery
drains the oldest package, one per cycle, into the four authorized aifirst paths
with a one-retry, fail-closed GitHub App transaction. Equal hashes are successful
no-ops; conflicts become `NEEDS_RECONCILIATION`. The product room consumes the
single VAULT-screened morning handoff, receives only the compact idea index,
and appends its accept, veto, defer or supersede verdict to the idea ledger.
Exact duplicates stop before a model call; evidence-free dead-idea revivals
never enter deliberation. Both Caught Up rooms remain behind the explicit live
repository-variable gate. Dry rooms still write only fixture artifacts and use
the local email log sink; Resend is not called yet.

Every shift seats VIZE, FORGE, PULSE and AUDIT with LEDGER as the required
finance control. Specialists enter only when routing rules need them. An
owner-authorized, non-dry shift obtains one budget-guarded, structured public
position from each council seat, then writes a sanitized timestamped transcript
and exactly one pre-approved internal work item. The queue cannot authorize
market research, publishing, spend, account changes, credentials, unreviewed
code changes or a business-stage change.

Each run installs from the lockfile, honors the kill switch, runs the complete
pre-gate, calculates routing and worst-case budget, executes at most the
bounded cycle, repeats the release gate and then creates one normal `cycle(N)`
state commit when state changed. A live edition may then create one content-only
commit in aifirst and one source-repository delivery receipt commit. Vercel
builds the reader from the independently validated aifirst commit. There is no
force push. A concurrent run cannot overlap.

A live founding cycle is intentionally unavailable until both provider keys are
configured. With no keys:

```bash
pnpm cycle -- --phase founding --dry
```

returns `INSUFFICIENT_EVIDENCE`, because every bundled opportunity/evidence
record is synthetic. This is the required honest outcome, not an error.

## Social publishing

Both channels begin in `draft` mode with no scopes and no human enablement date.
The hourly publisher therefore validates state and exits without an external
call.

Enabling routine organic autopublishing requires all of the following in one
reviewed, human-authorized change:

1. Record the resolved HUMAN_APPROVAL for account creation, OAuth scopes and
   autopublish.
2. Re-verify current official Meta API versions, required scopes, content
   constraints and rate limits.
3. Store user IDs as GitHub variables and tokens as encrypted GitHub secrets.
4. Set exactly the approved scopes, `enabledByHumanAt` and
   `mode: "autopublish"` for that channel in `config/channels.json`.
5. Submit only immutable queue items with PULSE selection, all eight approval
   checks passing, hosted media and a verified `content.contentHash`.
6. Run `workflow_dispatch` with `validate_only: true` before allowing the next
   scheduled publisher.

The publisher persists the claim before the external call. Any uncertain
response becomes `needs_reconciliation`, receives a sanitized receipt and is
never blindly retried. Paid ads, new scopes, account changes and
deletion/correction remain separate human-authorized actions.

## Agent portraits

The 20 portraits and one style anchor were generated as one coherent square
series through the built-in ChatGPT Images capability. Public files are
1024×1024 WebP. The implementation validates magic bytes, dimensions, file
size, exact slug set and duplicate hashes.

The session tool did not use the project's API key, so actual project API cost
is truthfully `null`, not `$0` or an invented charge. The verified
`gpt-image-2` high-quality API-equivalent estimate for the original set was
`$3.616155`. The six-portrait Caught Up extension used eight session calls,
including two targeted repairs, for a `$1.70172` API-equivalent estimate below
its specified `$1.80` envelope. The cumulative session-only equivalent is
`$5.317875`; no project API spend was booked.
Prompts, call references, hashes, alt text and visual QA are recorded in
`state/agent-identities/`.

## Admin and security

`/admin` is dynamic, `noindex` and protected in the Next proxy with constant-time
credential comparison, bounded failure tracking and security headers. It reads
state through a server-only allowlist. Public routes never share the admin
reader.

The release gate rejects:

- secrets, private-state leakage and unsafe generated code;
- unallowlisted paths, dependencies, environment variables and network hosts;
- unsupported claims, uncited evidence and duplicate/thin content;
- budget, stage, finance, permission or approval bypasses;
- publisher state jumps and self-approved releases or organization changes.

## Production deployment, health and rollback

Deployed on Vercel as project `quorum-site`
(`https://quorum-site-chi.vercel.app`), Next.js framework, auto-deploy from
`main`. GitHub secrets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and
`PUBLIC_SITE_URL` are configured for CI. Vercel environment variables
(`PUBLIC_SITE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`) are set in the Vercel
dashboard rather than the repo. The `Production health` workflow stays off
(`HEALTH_CHECK_ENABLED=false`) while the operator has not opted in to
external polling.

When any commercial-mode requirement is re-opened:

1. Reopen the brand-clearance decision using the revisit triggers listed in
   `state/brand-clearance/2026-07-28.md`.
2. Confirm the Vercel project, `PUBLIC_SITE_URL`, admin credentials and
   provider secrets are still current.
3. Deploy an immutable commit after CI succeeds; never deploy a dirty tree.
4. Flip `HEALTH_CHECK_ENABLED=true` after adding an external uptime monitor.
5. Confirm admin returns 401 without credentials and 200 only with the approved
   pair.

Rollback procedure:

1. Set both GitHub kill switches and, for a social incident, add
   `state/SOCIAL_PAUSED`.
2. Select the last known-good immutable hosting deployment/commit.
3. Redeploy or promote that exact artifact; do not rewrite git history or force
   push.
4. Re-run public health, admin-auth and feed checks.
5. Record the incident, uniquely attributable release and recovery before
   resuming schedules.

## Verification record

Primary technical sources were rechecked on **2026-07-23**. Configuration stores
its own `verifiedAt` dates and must be reviewed before changing models, prices,
scopes or platform behavior:

- OpenAI pricing, web search, image generation and moderation:
  <https://developers.openai.com/api/docs/>
- Anthropic models, pricing and web search:
  <https://platform.claude.com/docs/>
- GitHub Actions workflow syntax and timezone-aware schedules:
  <https://docs.github.com/actions/reference/workflows-and-actions/workflow-syntax>
- Next.js Proxy:
  <https://nextjs.org/docs/app/api-reference/file-conventions/proxy>
- Google people-first AI content and spam policies:
  <https://developers.google.com/search/docs/fundamentals/using-gen-ai-content>
- Threads API:
  <https://developers.facebook.com/documentation/threads/>
- Instagram content publishing:
  <https://developers.facebook.com/documentation/instagram-platform/content-publishing>
- European Commission data protection:
  <https://commission.europa.eu/law/law-topic/data-protection_en>
- FTC endorsements and affiliate disclosure:
  <https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking>

GitHub Actions are pinned to full immutable commits corresponding to
`actions/checkout@v7.0.1`, `actions/setup-node@v6.5.0` and
`pnpm/action-setup@v6.0.9`.

## Intentional deviations and blockers

- **Owner-adopted venture.** Caught Up is Venture 001 by owner decision. The
  founding gate remains unpassed, and no fixture is promoted to live evidence.
- **No connected social account.** Channels remain draft-only; account/OAuth
  work requires HUMAN_APPROVAL.
- **Provisional studio name.** BoardlessAI has unresolved adjacent company and
  domain collisions. A rename-or-clear gate blocks the first paid sponsor.
- **Reference design:** no Refero/Awesomic logo, text, image or proprietary
  asset was copied; only the specified editorial zinc/Ember design language was
  implemented.
- **Image billing:** built-in session generation exposes no project invoice
  metadata, so the manifest separates an API-equivalent estimate from actual
  project spend.

License: MIT. See `LICENSE`.
