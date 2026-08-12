# BOOKSOFHISTORY — Codex build prompt

You are implementing a new BoardlessAI venture in this repository (`lukaskourilcz/quorum`).
This document is the owner's commission for the build. Per house convention it is
scaffolding: it is deleted in the final commit of the program, and what outlives it is the
countersigned founding decision you will write in `state/decisions/`, the design record
`docs/BOOKSOFHISTORY-VENTURE-DESIGN.md`, and the code. Where this prompt, that design
document and the founding decision disagree, the decision wins, then the design document,
then this prompt. This commission authorizes edits outside the `AGENTS.md` standing write
allowlist for the files this program names — that allowlist governs unattended sessions,
not owner-issued builds.

## What you are building, in one paragraph

**BOOKSOFHISTORY** (venture id `booksofhistory`): a drafts-only bilingual (Czech +
English) social venture that tells the stories behind famous books. A ~200-entry seed
library of cheap metadata routes attention; a daily room at 12:00 Prague (`bh-desk`)
walks a persistent cycle state machine — Day A: deterministic shortlist + FOLIO's
editorial meeting picks 2 research candidates and writes tailored research briefs;
Day B: `researchBook(bookRef, brief)` runs per candidate through a new venture-agnostic
research-provider module (web-search-enabled guarded calls on the existing Anthropic
key), the results normalize into persistent verified dossiers, and claim triage
escalates sensational claims; Day C: dossiers are compared on story score, PLOT writes a
language-neutral canonical story brief and then independent Czech and English packages,
gates check every claim ref, and both land as recommendation drafts. Approval renders
both language decks in the Design Lab under a new `booksofhistory` brand; the owner
posts by hand. Every research call is ledgered with cost, reason and a used-flag;
dossiers are reusable assets checked before any new spend. **Scope is social content
production and growth only — no public website, book pages, SEO archive, database,
newsletter or storefront**; the data model stays clean, and nothing is built for those.
Read `docs/BOOKSOFHISTORY-VENTURE-DESIGN.md` in full before writing code.

## Phase 0 — audit before you build (mandatory, no code yet)

Verify every assumption against the live tree; where reality has drifted, follow reality
and record the divergence in the founding decision.

1. `CLAUDE.md`, `docs/ENGINEERING.md` (all 17 rules bind), `GOVERNANCE.md`,
   `docs/ECOSYSTEM.md`, the newest `state/decisions/*`, and the founding precedents
   `2026-08-06-goviral-founding.md`, `2026-08-07-marketingshark-founding.md`.
2. **Sibling programs.** Check whether the Kvórum and Door Money builds
   (`docs/KVORUM-CODEX-BUILD-PROMPT.md`, `docs/DOOR-MONEY-CODEX-BUILD-PROMPT.md`, or
   their founding decisions if the prompts are already deleted) have landed. Shared
   artifacts you must reuse rather than duplicate wherever they exist:
   `contracts/venture-recommendation.schema.json` (you add `evidence.kind:
   "dossier-story"`), `owner-result-entry/1`, the performance-weights mechanism, and
   the carousel-summary locale extension. If none have landed, you create the shared
   recommendation contract exactly as specified in those prompts' Phase C sections,
   with your evidence kind, so the later builds extend yours.
3. Venture machinery: `config/ventures.json`,
   `orchestrator/src/contracts/venture-registry.ts` (closed enums you will extend:
   `cast`, `adminTabs`, `growth_objective.components`),
   `orchestrator/src/ventures/registry.ts` (slot spacing, cron math),
   `orchestrator/src/ventures/marketingshark/run.ts` (runner shape),
   `orchestrator/src/cycle.ts`, `orchestrator/src/types.ts`,
   `orchestrator/src/contracts/meeting-record.ts`, `config/meeting-policy.json`, and
   the GoVIRAL Monday gate in `orchestrator/src/portfolio/run.ts` — the precedent for
   phase gating inside a daily cadence.
4. **The research plumbing you extend, not invent**: `orchestrator/src/budget.ts` —
   `estimateTextCall` already accepts `webSearchUses` and `maxSearchContentTokens`,
   throws `UNKNOWN_PRICE` on a search without a search-content reservation, and prices
   tool use at `WEB_SEARCH_USD_PER_CALL` ($0.01/search, `llm/prices.ts:176`);
   `orchestrator/src/llm/call.ts` (`guardedJsonCall` — note `toolUses: 0` is currently
   hardcoded for text calls; your extension records real counts);
   `orchestrator/src/llm/anthropic.ts` (`AnthropicTextClient` — you add optional
   server-side web-search tool support; verify the current tool type string against the
   SDK version in the lockfile, do not guess it); `orchestrator/src/llm/vision.ts`
   (the forced-tool pattern). Confirm whether OpenAI-side search exists before claiming
   the interface supports it — the interface is provider-agnostic, the first adapter is
   Anthropic.
5. The money rules: `orchestrator/src/portfolio/schedule.ts` + `limits.ts`
   (degradation ladder, `tightenedBy`), `config/models.json`, and **what
   `system-audit.test.ts` actually asserts about room envelopes** — satisfy the real
   assertion, and rely on the runtime pre-flight refusal for daily-pace contention
   rather than inventing your own arithmetic.
6. Admin patterns: `site/src/app/admin/page.tsx` (`Promise.all`, `tabView`
   `{node,count}`), `site/src/lib/admin-portfolio.ts`, a `persist()`-ladder store
   (`site/src/lib/caught-up-events-store.ts`), an API route
   (`app/admin/api/caught-up/events/route.ts`), `site/src/proxy.ts`.
7. Studio extension points: `studio/src/schema.ts` (`BrandTokensSchema`),
   `studio/src/library.ts` (`CAROUSEL_BRANDS`), `studio/src/summary.ts` — this venture
   needs **per-record locale** (`cs` and `en` summaries for the same feature); if a
   sibling build introduced locale already, extend it; existing ventures stay
   byte-identical (determinism tests before and after).
8. GoVIRAL surfaces you will connect to: `config/goviral-sources.json` (`topicSets`
   shape), where the recorded Monday plan lands under `state/ventures/goviral/`, and
   `config/meeting-policy.json` transitions.
9. Tests that police you: `orchestrator/tests/architecture.test.ts`
   (`expectedPrompts`, agents/routing parity), `vercel-cron.test.ts`,
   `ci-policy.test.ts`, `contracts.test.ts` (including its Czech-required/
   English-optional rule — your bilingual shapes must fit it honestly),
   `ventures.test.ts`.
10. `docs/NEEDED.md`, `state/INBOX.md` — current owner state.

## Non-negotiables

- **Scope fence.** No public website, no public book pages, no SEO archive, no public
  database, no newsletter, no storefront, no new public routes at all. The venture's
  only public output is social content posted by the owner's hand. Do not add
  speculative fields, tables or abstractions for hypothetical future products — the
  commission explicitly forbids over-engineering for them.
- **Research spend discipline.** Every research call through the guarded funnel with
  reserve-before/record-after, an explicit `webSearchUses` cap and search-content
  reservation, and a line in the venture research ledger (provider, model, timestamps,
  book, reason, tokens, searches, cost, requesting meeting ref, used-flag — the
  used-flag backfilled at publication). Idempotency by `(bookId, briefHash)` with an
  in-flight lock so retries, concurrent jobs and repeated agent actions cannot
  double-spend. Before any paid research: dossier-existence check, question-coverage
  check, trustworthiness check, staleness check, and the shelf-first shortcut — a
  book with unused above-threshold story candidates skips research entirely. Caps:
  ≤ $0.10 per call (the existing cap), ≤ $0.50 research envelope per cycle, ≤ $5.00
  research ceiling per month, 2 candidates default (3 only when the monthly schedule
  shows headroom).
- **No cover art is ever rendered or delivered.** Seed `coverRef` is admin-context
  only; a test asserts it reaches no rendered surface. Quotes cap at 300 characters
  with attribution; longer excerpts never ship.
- **Verification before virality.** Claims normalize to typed records with sources and
  a verification state (`verified | probable | single-source | legend | rejected`).
  Deterministic triage escalates sensational claims (superlatives, precise dramatic
  numbers, ban/rejection/burning hooks) to a capped `CLAIM_CHECK` call; a stronger
  claim needs stronger corroboration. A `legend`-state story may publish only labeled
  as legend; a `rejected` claim may not publish at all. Gates enforce claim refs on
  every factual sentence in both languages.
- **One research, two languages.** The dossier and canonical story brief are
  language-neutral; Czech and English packages are independent writing passes over the
  same brief. The research provider is never called twice for language reasons.
- The `budget-2026-08e` ceilings, the social triple-lock (publisher refuses
  `booksofhistory` by name), treasury rules, `METRICS_INGESTION_ENABLED=false`
  (owner-entered results only), magazines' gates, append-only decisions: untouched.
- Engineering contract throughout: contracts + valid/poison fixtures for every
  boundary artifact; parse-or-drop with counted drops; recorded-not-re-derived
  (dossiers, verdicts, shortlists and cycle state are written once and read back;
  re-research is a versioned supplement, never an overwrite); one writer per state
  path; failure posture (a malformed claim costs a claim, a failed research call costs
  a candidate and a ledger line, nothing costs the cycle — a missed day resumes its
  phase, never skips it); `null` ≠ `0`; ~400-line file cap; small commits.
- Dry runs are $0 end-to-end on fixtures, including a fixture dossier and fixture
  search results.

## The build, in phases

Full gate green at each phase end (`pnpm agents:validate && pnpm lint && pnpm typecheck
&& pnpm test && pnpm build`, site e2e where touched); one commit per task; task ids
`BH-01…` as checkboxes in the founding decision.

### Phase A — founding records, registration, cycle skeleton (dry holds, $0)

- **BH-01** `state/decisions/<today>-booksofhistory-founding.md` in the house shape
  (decision id, pending countersignature, extends the GoVIRAL/marketingShark
  precedent, untouched-ceilings paragraph, BH checkbox list, honest-gaps section,
  "What this does not touch" — including the scope fence, restated).
- **BH-02** Registry entry: id `booksofhistory`, name `BOOKSOFHISTORY`,
  `status: "operating"`, `taste: true`, ledgerNamespace `booksofhistory`,
  growth_objective per design §13 (new components `feature-cadence` and
  `research-efficiency` — extend the closed enum, fixtures, and the evaluator with
  honest `null` semantics), adminTabs `["shortlist","dossiers","features"]` (extend
  the enum), one meeting `bh-desk` `daily@12:00`, cast
  `["FOLIO","PLOT","QUILL","HACEK","AUDIT"]`, envelope 0.50, packet
  `{topicType:"edition", decisionNeeded:"PLAN", preset:"bh-desk-room",
  objectives:{dry,live}}`. Verify 12:00 clears the ≥60-minute spacing against 11:00
  and 13:00 — it does, exactly, on both sides.
- **BH-03** Phase plumbing: `bh-desk` into the phase schemas, meeting-record enum,
  `meeting-policy.json` (standing; transitions per BH-19), `cycle.yml` dispatch
  choices + mode gates, `site/vercel.json` two DST variants and nothing else.
- **BH-04** Agents: FOLIO and PLOT in `config/agents.json` (+ routing capabilities +
  the `bh-desk-room` preset, venture-agent-controls, `FoundingAgentSchema`), missions
  and boundaries per design §5; HACEK's and QUILL's `ventures` arrays extended;
  prompts `orchestrator/prompts/booksofhistory/{folio,plot,research-gather,
  research-synth,claim-check,craft}.md` + `expectedPrompts`; `config/models.json`
  roles `FOLIO` (sonnet ~8000/1200), `PLOT` (sonnet ~8000/3000), `RESEARCH_GATHER`
  (haiku, small prompt cap, `maxSearchContentTokens` ~20000, out ~4000),
  `RESEARCH_SYNTH` (haiku ~12000/3000), `CLAIM_CHECK` (haiku ~6000/1200).
- **BH-05** The cycle state machine: `bh-cycle/1` contract + fixtures,
  `orchestrator/src/ventures/booksofhistory/state.ts` (one writer; phases
  `selection → research → production`, advance-on-completion, resume-on-miss,
  stretch-under-pressure), `run.ts` dispatched from `cycle.ts` walking the machine
  with honest per-day records ($0 lines for days that need nothing). Venture
  `README.md`, venture-brand hue, `VENTURE_LABEL`, KPI seeds, degradation-ladder
  position (after the Door Money rooms, before `gv-brief`) with its test.

Acceptance: `pnpm cycle -- --phase bh-desk --dry` walks a full fixture cycle across
three invocations at $0; architecture tests green.

### Phase B — seed library and shortlist

- **BH-06** `bh-seed/1` contract + fixtures: exactly the cheap fields (title,
  originalTitle?, author, authorDates?, year, originalLanguage, genres[],
  czechRelevance, internationalRelevance, recognition and significance priors,
  storytellingPotential prior, audienceFamiliarity per lane, contentCategories[],
  coverRef? (admin-only), provenance, scoring metadata). Priors are labeled priors.
  The no-cover-art test lands here.
- **BH-07** Author the seed library: ~200 entries in
  `state/ventures/booksofhistory/seed/library.json`, written by you during this
  build (zero runtime cost, reviewable in the diff), provenance stamped
  `authored:implementation:<date>`. Canon guidance: ~25–30% Czech and Central
  European (Švejk, Čapek, Kundera, Hrabal, Havel, Němcová, Erben…), world classics
  across the 17th–21st centuries, genre spread (novels, poetry, drama, children's,
  sci-fi, crime, nonfiction landmarks), geography spread, a deliberate seam of
  books with famous publishing stories. Titles/authors/years from general knowledge
  are acceptable at seed quality — research corrects at research time; that is the
  design. Plus `pnpm bh:seed` — a validating append/rescore CLI, no model calls.
- **BH-08** `score.ts` + `bh-shortlist/1`: the deterministic opportunity scorer with
  every factor from the design (priors blend, anniversary proximity from
  year/authorDates, GoVIRAL trend crossover, diversity pressure over recent
  features, lane performance weights, shelf bonus for unused dossier stories),
  factor breakdown recorded per entry, daily shortlist record written on selection
  days. Pure functions, exhaustive tests, a fixture library slice.

### Phase C — the research provider and dossiers

- **BH-09** `orchestrator/src/research/provider.ts` — **outside the venture folder,
  venture-agnostic**: the `ResearchProvider` interface
  (`researchBook(input: {bookRef, brief, envelopeUsd}) → RawResearch`), a provider
  registry with one adapter `anthropic-web-search` built on the guarded funnel:
  extend `AnthropicTextClient` with optional server-side web-search tool support
  (verify the tool type string against the pinned SDK; cap `webSearchUses`; pass the
  search-content reservation through `estimateTextCall`; record actual search counts
  into the ledger's `toolUses`), never bypassing `guardedJsonCall`'s
  reserve-before/record-after order. Config choice of provider id follows the
  one-resolver rule. Do not build a second adapter; do not couple the interface to
  Anthropic shapes.
- **BH-10** `bh-research-brief/1` + `briefs.ts`: FOLIO's meeting output (Day A call —
  ranks the shortlist, picks 2 (3 with recorded headroom), writes per-candidate
  briefs in the commission's shape: objective, investigate-specifically, look-for,
  avoid) assembled deterministically around the seed record and angle history.
- **BH-11** `research.ts` + `bh-dossier/1` + `bh-research-ledger/1`: Day B — for each
  candidate, the pre-research checks (existing dossier? question answered?
  trustworthy? stale? shelf sufficient?), then gather → synth calls, normalization
  into the dossier (claims with sources and initial states, story candidates with
  claim refs and scores, quotes, visual notes; raw response retained beside the
  normalized form), ledger lines, idempotency by `(bookId, briefHash)` + in-flight
  lock, per-cycle and monthly research ceilings enforced before the first call.
  Supplemental freshness calls (`supplements/<date>.json`, ≤ $0.05, only when a
  shelf dossier older than 90 days is selected) are a separate, smaller path.
- **BH-12** `verify.ts`: deterministic claim triage (the sensational-claim ruleset),
  the capped `CLAIM_CHECK` escalation under QUILL's identity, state transitions
  recorded with reasons, and the publication-suitability flags the gates read.

Acceptance: fixture-driven research produces byte-stable dossiers; a repeated request
with the same `(bookId, briefHash)` makes zero provider calls and says so; ceilings
refuse correctly in tests; no network in tests.

### Phase D — story selection and twin production

- **BH-13** Day C in `run.ts` + `produce.ts`: dossier comparison on story score
  (recorded — the seed ranking is explicitly reversible and the record shows both
  numbers), FOLIO's selection, PLOT's canonical story brief (language-neutral,
  claim-ref'd), then the Czech package and the English package as two independent
  `guardedJsonCall` passes over the same brief (HACEK register rules bind the Czech
  pass; both passes are forbidden translation framing). Unchosen dossiers keep
  their unused story candidates on the shelf.
- **BH-14** Gates: every factual sentence in both languages resolves to dossier
  claim ids with acceptable states; `legend` framing enforced verbatim where
  required; quote caps; duplicate check against prior features; the
  no-vote-no-endorsement-style banned list appropriate to this venture (no health
  or private-life claims about living authors regardless of sourcing); stop-slop
  lint. Failed packages drop and are counted.
- **BH-15** Recommendation records: the shared `venture-recommendation/1` with
  `evidence.kind: "dossier-story"` (claim refs, story ref, dossier ref, both
  language payloads), one writer, idempotent per (cycle, story).

### Phase E — admin and Design Lab

- **BH-16** Studio: `booksofhistory` into `BrandTokensSchema.id` + `CAROUSEL_BRANDS`
  (first-edition card token set per design §2, contrast-checked); carousel-summary
  gains venture `booksofhistory` **with per-record locale** — reuse the sibling
  build's locale field if it landed, introduce it at record level if not; approval
  writes **two** recorded summaries (cs and en) per feature under
  `state/ventures/carousel-studio/summaries/booksofhistory/…`. Existing ventures
  byte-identical; `pnpm -C studio build` before anything that resolves the package.
- **BH-17** Approval write path `POST /admin/api/booksofhistory/features` on the
  standard ladder (verify, origin, size cap, typed persistence errors, the
  `persist()` GitHub-or-local ladder verbatim): approve (→ both summaries + ready-
  to-post), edit-then-approve (original preserved), reject-with-reason, posted-URL
  per lane, results entry per lane.
- **BH-18** Loaders + panels: `admin-booksofhistory.ts` (server-only,
  parse-or-drop, `missing|unreadable|present`), `booksofhistory-shortlist-panel.tsx`
  (ranked candidates with factor breakdowns, meeting decisions, cycle state line,
  anniversary radar), `booksofhistory-dossiers-panel.tsx` (dossier browser with
  verification badges, story shelf with used/unused, research ledger and the
  efficiency figure — `null` until it has a denominator),
  `booksofhistory-features-panel.tsx` (both language packages side by side, claims
  table, gates, approvals, RatingWidget). Wire through `Promise.all` + `tabView`,
  register tabs, e2e entries in `operating-surfaces.spec.ts` + the
  `@write-journey` block.

### Phase F — the GoVIRAL spine and the learning loop

- **BH-19** GoVIRAL connection, all four legs from design §10: a `booksofhistory`
  topicSet in `config/goviral-sources.json` (book-history/anniversary/publishing
  terms, CS + EN — free signals only, the Apify recipe untouched); the runner
  consumes the latest recorded GoVIRAL plan into the scorer's trend-crossover
  factor; `meeting-policy.json` transitions `gv-brief ↔ bh-desk` (one agenda each
  way, within the existing caps); and a test pinning that the venture's only
  rendering path is the Design Lab.
- **BH-20** Results and weights: the shared `owner-result-entry/1` per lane,
  `POST /admin/api/booksofhistory/results`, per-category/era/geography weights
  (bounded, floor-protected, recorded proposals citing result ids) read by
  `score.ts`; used-flag backfill in the research ledger at publication; the
  research-efficiency KPI evaluator.

### Phase G — close out

- **BH-21** Documentation truth (`docs/ECOSYSTEM.md` curated layer,
  `docs/PORTFOLIO.md`, `README.md` table, `about-project.md`, `scaling.md` cost
  lines), INBOX items filed (below), `docs/NEEDED.md` owner items appended in the
  house marker format, the founding decision's honest-gaps section written, every
  BH checkbox ticked, this prompt deleted in the final commit with the deletion
  noted in the decision.

## Approvals to file in `state/INBOX.md` (house shape, "What this approves, exactly:")

- **BH-RESEARCH-001** — web-search-enabled research calls on the existing Anthropic
  key: per-call search caps, ≤ $0.50/cycle envelope, ≤ $5.00/month ceiling, the
  research ledger, idempotency rules, and the shelf-first duplication guards. No new
  account or credential.
- **BH-SEED-002** — the authored ~200-book seed library with prior-not-fact labeling
  and the no-cover-art rule.
- **BH-ACCOUNTS-003** — the two profile lanes (CS and EN) on the owner's chosen
  platforms, handle clearance, AI-disclosure bio lines; drafts-only until signed.
- **BH-RESULTS-004** — owner-entered per-post results per lane as the venture's only
  measurement, inside the D9 hold.

## Cost declaration (goes in the founding decision)

Per 3-day cycle: Day A FOLIO ≈ $0.07; Day B research 2 × (gather ≈ $0.16 + synth ≈
$0.04) + ≤1 claim-check ≈ $0.06 → ≈ $0.46 worst; Day C story brief + two language
passes ≈ $0.20. Cycle ≈ $0.55–0.73; month at 3-day cadence ≈ **$6–8** inside the $25
share, trending down as the shelf fills (shelf-hit cycles skip Day B entirely). Seed
library $0 (authored). $0 cash anywhere. Every call reserve-before/record-after;
ledger attribution by `ventureId` automatic once registered.

## What is explicitly out of scope

Everything in the scope fence (public site, pages, archive, database, newsletter,
storefront, affiliates). Account creation, posting, channels, publisher changes,
autopublish counters. TikTok/Reels scripts, a third language lane, derivative quote-
card/thread formats, anniversary campaign seasons — phase-2 designs, named in the
honest-gaps section. A second research provider adapter. Any change to GoVIRAL's
Apify recipe or quota.

## Definition of done

Every BH task ticked; full gate green plus site e2e; `pnpm cycle -- --phase bh-desk
--dry` walking a complete fixture cycle (selection → research → production) across
three invocations at $0 with honest records each day; idempotency and ceiling tests
proving a duplicate research request costs nothing; the no-cover-art and quote-cap
tests guarding the boundary; both language decks of a fixture feature rendering in
the Design Lab rail; the founding decision awaiting countersignature with a handoff
note listing the owner's next steps (sign, resolve approvals, create the two profile
lanes when ready, run the first live cycle).
