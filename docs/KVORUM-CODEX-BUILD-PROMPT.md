# KVÓRUM — Codex build prompt

You are implementing a new BoardlessAI venture in this repository (`lukaskourilcz/quorum`).
This document is the owner's commission for the build. Per house convention it is
scaffolding: it is deleted in the final commit of the program, and what outlives it is the
countersigned founding decision you will write in `state/decisions/`, the design record
`docs/KVORUM-VENTURE-DESIGN.md`, and the code. Where this prompt, that design document and
the founding decision disagree, the decision wins, then the design document, then this
prompt. This commission authorizes edits outside the `AGENTS.md` standing write allowlist
for the files this program names — that allowlist governs unattended sessions, not
owner-issued builds.

## What you are building, in one paragraph

**Kvórum** (venture id `kvorum`): a drafts-only Czech political commentary venture. Once a
day at 21:00 Prague, deterministic code fetches the last 24 hours of posts from the public
Facebook page of Štít demokracie through Apify, corroborates against free allowlisted
Czech news and institutional feeds, clusters the items by entity and topic, and hands the
clustered digest to one model call (a new agent, TRIBUN). TRIBUN selects 1–2 topics and
drafts original recommendation packages — what happened, why it matters, what Štít
published, our differing angle, platform/format mapping, drafted copy, and a typed claims
table. Deterministic gates enforce sourcing, originality and an editorial constitution.
Approved packages render in the Design Lab under a new `kvorum` brand and are posted by
hand by the owner. Nothing in this build posts, creates an account, or touches a channel.
Read `docs/KVORUM-VENTURE-DESIGN.md` in full before writing code — it is the design this
prompt implements, including positioning, tone rules and the reasoning behind every
constraint below.

## Phase 0 — audit before you build (mandatory, no code yet)

This repository moves daily and this prompt was written against a specific day. Verify
every assumption before acting; where reality has drifted, follow reality and record the
divergence in the founding decision's "adapted during implementation" section.

Read, at minimum:

1. `CLAUDE.md`, `docs/ENGINEERING.md` (the 17 rules bind every line you write),
   `GOVERNANCE.md`, `docs/ECOSYSTEM.md`.
2. The newest files in `state/decisions/` — especially any operations decision newer than
   2026-08-12 and anything touching budget, social, Apify or venture founding. The two
   founding precedents you are extending: `2026-08-06-goviral-founding.md`,
   `2026-08-07-marketingshark-founding.md`.
3. The venture machinery: `config/ventures.json`,
   `orchestrator/src/contracts/venture-registry.ts`, `orchestrator/src/ventures/registry.ts`
   (cron math, slot spacing, `composeMeetingRouteDefinition`),
   `orchestrator/src/ventures/marketingshark/run.ts` (the dedicated-runner precedent your
   runner mirrors), `orchestrator/src/cycle.ts` (dispatch), `orchestrator/src/types.ts`
   (phase schemas), `orchestrator/src/contracts/meeting-record.ts`.
4. The money funnel: `orchestrator/src/llm/call.ts` (`guardedJsonCall` — every paid call
   goes through it), `orchestrator/src/budget.ts`, `orchestrator/src/portfolio/schedule.ts`
   + `limits.ts` (degradation ladder, envelope arithmetic), `config/models.json`.
5. The Apify discipline: `orchestrator/src/sources/apify.ts` (all four guard layers),
   `config/goviral-sources.json` (the registry shape you will mirror),
   `state/mma/source-quota/apify.json` (the quota-file shape), `state/INBOX.md` (state of
   `APIFY-ACCOUNT-001` — if it is still unresolved, everything you build must run its $0
   fixture path and say so honestly).
6. The evidence and safety rules: `orchestrator/src/security/url.ts` (`safeFetch`),
   `config/network-allowlist.json`, the untrusted-data wrapping used by GoVIRAL's scout,
   `config/social-policy.json` (duplicate threshold, prohibited claims).
7. The admin patterns: `site/src/app/admin/page.tsx` (the `Promise.all` load and the
   `tabView` invariant), `site/src/lib/admin-portfolio.ts` (adminTabs registry),
   `site/src/lib/design-lab.ts` and `site/src/lib/carousel-summaries.ts`, one store
   implementing the `persist()` GitHub-or-local ladder
   (`site/src/lib/caught-up-events-store.ts` is a good one), one API route
   (`site/src/app/admin/api/caught-up/events/route.ts`), `site/src/proxy.ts`.
8. The studio extension points: `studio/src/schema.ts` (`BrandTokensSchema`),
   `studio/src/library.ts` (`CAROUSEL_BRANDS`, `deckFormats`), `studio/src/summary.ts`
   (`CarouselSummaryVenture`, `KICKER`, `locale`), and the determinism tests that pin
   existing ventures' bytes.
9. The tests that will police you: `orchestrator/tests/architecture.test.ts`
   (`expectedPrompts`, routing/agents parity), `system-audit.test.ts` (room envelopes
   inside the daily pace), `vercel-cron.test.ts` (both DST variants, nothing else),
   `ci-policy.test.ts`, `ventures.test.ts`, `contracts.test.ts`.
10. `docs/NEEDED.md` — the current owner-blocked items; you will append, never restructure.

Also check whether the sibling program (`docs/DOOR-MONEY-CODEX-BUILD-PROMPT.md`) has
already landed: if `contracts/venture-recommendation.schema.json` exists, extend it with
this venture's evidence kind instead of creating it, and reuse the shared owner-results
and performance-weights modules it introduced.

## Non-negotiables

- The `budget-2026-08e` ceilings: $30 all-in, $25 model share, $1.00 daily pace. The new
  room's envelope is **$0.10** and the day's total envelope arithmetic must stay inside
  the pace — `system-audit.test.ts` is the proof, not your intention.
- The social triple-lock, the treasury rules, `METRICS_INGESTION_ENABLED=false`, both
  magazines' truth gates and delivery paths, the streams path's `apify: z.literal(false)`,
  and the append-only decision record: untouched. The publisher refuses `kvorum` by name,
  the marketingShark way.
- No new accounts, credentials, channels, paid plans or outward surfaces. Anything that
  would need one becomes a `HUMAN_APPROVAL` item in `state/INBOX.md` (§Approvals below)
  and code that fails closed until it is countersigned.
- Never upgrade the Apify plan; never use a login- or cookie-based actor; raw scraped
  items purge at 30 days; a fixed-field row mapper with a test asserting nothing else
  survives. Scraped content is untrusted data and is wrapped as such before any model
  sees it.
- Engineering contract throughout: versioned contracts with valid + poison fixtures for
  every boundary artifact; parse-or-drop with counted drops; recorded-not-re-derived;
  one writer per state path; reserve-before/record-after on every paid call; failure
  posture (an item costs an item, a source costs a section, nothing costs the run; every
  non-event writes a reason record); `null` is not `0`; ~400-line file cap; small
  commits, one concern each.
- Dry runs stay $0 and never call a provider (`guardedJsonCall` already throws on a paid
  call in dry mode — build so the throw can never be reached, not so it is caught).
- Model identity, session links or tool names never appear in committed artifacts.

## The build, in phases

Work phase by phase. Each phase ends with the full gate green
(`pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus
`pnpm --filter @boardlessai/site test:e2e` where the phase touches the site) and one
commit per task. Task ids `KV-01`… live as checkboxes in the founding decision; tick each
in its own commit.

### Phase A — founding records and registration (dry room holds, $0)

- **KV-01** Write `state/decisions/<today>-kvorum-founding.md` in the house shape
  (`Decision id: kvorum-2026-08a` or dated equivalent; `Status: pending countersignature`
  until the owner signs; `Supersedes: nothing. Extends the founding precedent set by
  goviral-2026-08a and marketingshark-2026-08a.`; the explicit paragraph that ceilings,
  truth gates, triple-lock and treasury are untouched; the task checkbox list KV-01…;
  a "What this does not touch" close; an honest-gaps section you fill at the end).
- **KV-02** Registry entry in `config/ventures.json`: id `kvorum`, name `Kvórum`,
  `status: "operating"`, `taste: true`, ledgerNamespace `kvorum`, growth_objective per
  the design (§13), adminTabs `["recommendations","monitor","claims"]` — extending the
  closed `adminTabs` enum in the contract as needed — and one meeting: kind `kv-desk`,
  `daily@21:00`, cast `["TRIBUN","HACEK","AUDIT"]`, envelope 0.10, packet
  `{topicType:"social", decisionNeeded:"PLAN", preset:"kv-desk-room", objectives:{dry,live}}`.
  Update the registry schema's closed enums (`cast`, `adminTabs`,
  `growth_objective.components` gains `recommendation-approval`) plus both fixtures.
- **KV-03** Phase plumbing: `kv-desk` into `PhaseSchema`/`RunnablePhaseSchema`/
  `ScheduledPhaseSchema` in `orchestrator/src/types.ts`, the meeting-record phase enum,
  `config/meeting-policy.json` (standing agenda phase; add any transition edges you can
  defend), `cycle.yml` workflow_dispatch choices and the `steps.mode` gate expressions,
  and `site/vercel.json` — exactly two DST cron variants for the slot, nothing else
  (`vercel-cron.test.ts` holds you to it). Confirm 21:00 clears the ≥60-minute spacing
  rule against the 22:00 night board; it does, exactly.
- **KV-04** TRIBUN: `config/agents.json` entry (kind specialist, provider Anthropic,
  `ventures: ["kvorum"]`, mission/boundaries per the design §5), matching
  `config/agent-routing.json` capabilities + the `kv-desk-room` preset,
  `config/venture-agent-controls.json` entry, `FoundingAgentSchema` addition,
  `orchestrator/prompts/kvorum/tribun.md` + `orchestrator/prompts/kvorum/craft.md`
  (distill the editorial constitution from the design — claims typing, register rules,
  banned content; runtime prompts never load skill files), `config/models.json` role
  `TRIBUN` (`claude-sonnet-5`, caps ~8000 in / 2500 out), and the `expectedPrompts`
  list in `architecture.test.ts` (subdirectory prompts follow the marketingshark
  precedent). Extend HACEK's `ventures` to include `kvorum`.
- **KV-05** State scaffold `state/ventures/kvorum/` (empty dirs are created lazily by
  first writes — commit only what has content, e.g. a venture `README.md` stating the
  drafts-only posture), `site/src/lib/venture-brand.ts` hue, `VENTURE_LABEL` map,
  KPI seeds in `config/kpis/2026-Q1.json` per design §13, and the degradation-ladder
  position in `portfolio/schedule.ts`: `kv-desk` drops after `gv-brief`, before the
  magazines' rooms — with its test.

Acceptance: `pnpm cycle -- --phase kv-desk --dry` holds a $0 room that records an honest
"no monitor data" outcome; every architecture test green.

### Phase B — the monitor (deterministic, fixture-first)

- **KV-06** `config/kvorum-sources.json` (new contract `kvorum-sources/1`, mirroring the
  goviral-sources shape): the pinned Apify actor — `apify/facebook-posts-scraper`, build
  id pinned at implementation time, pricing `$2.00/1k` with its evidence URL **verified by
  you at build time** (if the price or terms drifted, record the current truth and adjust
  the share math), target page `facebook.com/stitdemokracie`, `maxResults: 30`, one run
  per day — plus the free feeds: iROZHLAS, ČT24, Deník N, Seznam Zprávy, psp.cz, vlada.cz,
  Google News RSS `geo=CZ`. For each feed, resolve and verify the real feed URL; a feed
  you cannot verify ships `enabled:false` with a note, never a guess. Add every enabled
  host to `config/network-allowlist.json` `runtimeHosts` and extend the test that pins
  registry hosts to the allowlist.
- **KV-07** `config/kvorum-entities.json`: the entity lexicon (government members, party
  leaders, parties, institutions, standing topics per the design §7 — seed it from the
  design's mid-2026 political context and mark it owner-editable). Contract + fixtures.
- **KV-08** Quota: `state/kvorum/source-quota/apify.json` in the established quota shape
  with `shareCapUsd: 2.00` and a per-run reservation covering the worst case of one run
  (~$0.06 at 30 results); extend `orchestrator/src/sources/apify.ts` with the kvorum
  share following the exact four-layer pattern (INBOX approval gate reading
  `KV-APIFY-001`, token presence, local reserve-before/record-after, provider-usage
  preferred) — reuse the existing functions rather than copying them; if the module's
  shape resists a third tenant, refactor it into a parameterized guard with the two
  existing tenants unchanged and their tests still green.
- **KV-09** `orchestrator/src/ventures/kvorum/monitor.ts`: fetch (Apify run +
  `safeFetch` feeds), normalize, the fixed-field row mapper (source, url, publishedAt,
  text, entities, and for Štít items the page's post URL + engagement counts; commenter
  and private-individual data never enters state — test asserts the field set),
  30-day purge of raw items, and the receipt `state/ventures/kvorum/monitor/<date>.json`
  under a new `kvorum-monitor/1` contract. Failure posture per the design: any single
  source failing costs its section and a receipt line.
- **KV-10** `orchestrator/src/ventures/kvorum/cluster.ts`: deterministic entity/topic
  clustering (normalized entity sets, Jaccard threshold), ranking (corroboration ×
  entity weight × engagement salience × novelty against 14 days of recommendations),
  `continuationOf` detection. Pure functions, exhaustive unit tests, fixtures for a
  realistic day.

Acceptance: `pnpm test` green; a fixture-driven monitor run produces a receipt and
clusters byte-stable across two runs; no network in tests.

### Phase C — the desk

- **KV-11** `contracts/venture-recommendation.schema.json` (`venture-recommendation/1`)
  with valid + poison fixtures — or extend the existing one if the sibling program landed
  first. Discriminated `evidence` union; this venture uses `kind: "monitor-cluster"`
  carrying the cluster ref, the claims table (`fact-multi | fact-single | commentary`,
  each with refs), and the Štít attribution block (post URL, excerpt, engagement).
  Status flow `draft → approved → posted → archived` plus `rejected`, owner fields
  (`postedUrl`, `resultRefs`, edit history), designLab block, gate results.
- **KV-12** `orchestrator/src/ventures/kvorum/run.ts` — the dedicated runner dispatched
  from `cycle.ts` (mirror the marketingshark dispatch): monitor pre-step, cluster, then
  one `guardedJsonCall` as TRIBUN over the untrusted-wrapped digest, parsing into
  candidate packages. Dry mode uses fixtures end-to-end. Write the meeting record with
  honest statuses (`PLAN` with packages, or a quiet-day `NO_ACTION` with the digest
  attached).
- **KV-13** `orchestrator/src/ventures/kvorum/gates.ts`: schema; claim-ref resolution
  (two independent domains for `fact-multi`; Štít URLs never count as evidence);
  trigram-overlap originality ceiling against every source text in the cluster (align
  the threshold with `config/social-policy.json`'s duplicate rule and pin it in one
  place); exact-substring quote verification; banned-content rules (no vote
  recommendations, no endorsements, no crime accusations without on-record reporting
  refs, no private individuals, the alarm-vocabulary lint and register rules from
  `craft.md` in deterministic form where possible); required non-empty "our angle
  differs" field distinct from the source summary. A failed package is dropped and
  counted in the record, never re-asked.
- **KV-14** Recommendation store: one writer, atomic writes, records under
  `state/ventures/kvorum/recommendations/<date>-<slug>.json`, plus the day's queue
  index the admin reads. Idempotent per (date, cluster) so a re-run cannot double-draft.

Acceptance: dry `kv-desk` produces gated fixture packages; live path reserves and
records spend correctly in a test double; gates have poison-case tests for every rule
named above.

### Phase D — admin and Design Lab

- **KV-15** Studio: `kvorum` into `BrandTokensSchema.id` and `CAROUSEL_BRANDS` with the
  marker-yellow token set per design §2 (validate contrast through the existing checks);
  `CarouselSummaryVenture` gains `kvorum` with its own `KICKER`/closing (locale `cs`).
  Existing ventures' rendered bytes must not change — run the determinism tests before
  and after. Rebuild the studio (`pnpm -C studio build`) before anything that resolves
  the package.
- **KV-16** Approval write path: `POST /admin/api/kvorum/recommendations` on the
  standard ladder (`verifyAdminRequest`, origin check, size cap, typed persistence
  errors, the `persist()` GitHub-or-local ladder verbatim). Approve transitions the
  record, writes the recorded carousel summary under
  `state/ventures/carousel-studio/summaries/kvorum/…` so the package appears in the
  Design Lab studio rail, and never double-writes on retry. Edit-then-approve stores
  the owner's text as the approved copy with the original preserved. Reject requires a
  reason. Posted records the URL.
- **KV-17** Loader + panels: `site/src/lib/admin-kvorum.ts` (server-only, parse-or-drop,
  `missing|unreadable|present` distinctions), `kvorum-recommendations-panel.tsx`,
  `kvorum-monitor-panel.tsx` (digest, source-health strip, quota bar, purge clock),
  `kvorum-claims-panel.tsx` (ledger + correction flow per KV-18), wired through the
  `Promise.all` and the `tabView` `{node,count}` invariant in `admin/page.tsx`, tabs
  registered in `admin-portfolio.ts`, RatingWidget on every card, admin dark literal-hex
  palette, `useAdminWritesEnabled()` discipline, horizontal scrollers marked
  `data-horizontal-scroll`. E2e entries in `operating-surfaces.spec.ts` and the
  `@write-journey` block.
- **KV-18** Claims ledger: `kvorum-claim/1` contract + fixtures; append entries at
  approval time from the package's claims table; status transitions
  (`standing → corrected | retracted`) through an admin action that drafts the
  correction as a new recommendation (content, not shame — per the design).

Acceptance: full site gate + e2e green; a fixture recommendation approved in a local
run appears in the Design Lab rail and exports PNG/ZIP; the claims ledger renders.

### Phase E — results and weights

- **KV-19** Owner results: `owner-result-entry/1` (shared with the sibling venture if it
  landed first), `POST /admin/api/kvorum/results`, records under
  `state/ventures/kvorum/results/`, surfaced on the recommendation card (outcome beside
  intent). `state/ventures/kvorum/performance-weights.json` read by the cluster ranking
  and gate-side format weighting; adjusted only by a recorded weekly proposal citing
  result ids, with floors so small samples cannot collapse a format. This is
  owner-entered data; no automated collection of any kind.
- **KV-20** The GoVIRAL and Design Lab spine (the standing rule for every venture —
  see `docs/BOOKSOFHISTORY-VENTURE-DESIGN.md` §10): a `kvorum` topicSet in
  `config/goviral-sources.json` (Czech political and civic-trend terms; free signals
  only — GoVIRAL's Apify recipe and quota untouched); the desk's cluster ranking
  consumes the latest recorded GoVIRAL plan as its trend-crossover input;
  `config/meeting-policy.json` transitions `gv-brief ↔ kv-desk` (one agenda each way,
  inside the existing caps); and a test pinning that the venture's only rendering path
  is the Design Lab.

### Phase F — close out

- **KV-21** Documentation truth: sections in `docs/ECOSYSTEM.md` (curated layer),
  `docs/PORTFOLIO.md`, `README.md` project table, `about-project.md`, `scaling.md` cost
  lines; INBOX approval items (below) filed; `docs/NEEDED.md` owner items appended in
  the house marker format; the founding decision's honest-gaps section written; every
  KV checkbox ticked; this prompt file deleted in the final commit, with the deletion
  noted in the founding decision.

## Approvals to file in `state/INBOX.md` (exact house shape, "What this approves, exactly:")

- **KV-APIFY-001** — the Facebook Posts Scraper on the single public page
  `facebook.com/stitdemokracie`, $2.00/month venture share inside the Free plan's $5
  credit, one run/day, 30-result cap, 30-day raw purge, fixed-field mapper, no login or
  cookie actors, no plan upgrade ever. Depends on `APIFY-ACCOUNT-001` if still pending.
- **KV-SOURCES-002** — the free-feed registry and each named allowlist host.
- **KV-ACCOUNTS-003** — future creation of the venture's social accounts and the
  AI-disclosure bio line; until countersigned the venture is drafts-only and admin says
  so on the workspace.
- **KV-EDITORIAL-004** — the editorial constitution the gates implement (design §16),
  countersigned as policy.

Until KV-APIFY-001 and KV-SOURCES-002 are countersigned, the monitor runs its fixture
path, records that it did, and spends nothing — the same fail-closed posture every other
gated capability uses.

## Cost declaration (goes in the founding decision)

One TRIBUN call/day ≈ $0.05–0.07 → ≈ $2.10/month model spend inside the $25 share, under
the venture's $0.10 envelope with one retry; Apify ≤ $2.00/month of the free credit, $0
cash; everything else deterministic and $0. Reserve-before/record-after via
`guardedJsonCall` and the quota guard; the ledger attributes by `ventureId` automatically
once the registry entry exists.

## What is explicitly out of scope

Account creation, posting, channel registry changes, publisher changes, autopublish
counters, X/Facebook adapters, paid promotion, metrics ingestion, the promise tracker and
Sunday recap (phase-2 designs, listed in the honest-gaps section), monitoring any page
beyond the one named, and any change to GoVIRAL's recipe (the quota priority is stated in
the founding decision; GoVIRAL's own guard behavior is untouched).

## Definition of done

Every KV task ticked in the founding decision, full gate green
(`pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
`pnpm --filter @boardlessai/site test:e2e`), `pnpm cycle -- --phase kv-desk --dry`
recording an honest $0 room, no unrelated file churn, the founding decision awaiting the
owner's countersignature, and a short handoff note in the decision listing exactly what
the owner must do next (sign, resolve approvals, create accounts when ready, run the
first live desk).
