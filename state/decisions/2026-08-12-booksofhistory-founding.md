# BOOKSOFHISTORY founding

Date: 2026-08-12

Decider: Lukas Kouril, owner

Status: pending owner countersignature

Decision id: `booksofhistory-2026-08a`

Supersedes: nothing. Extends the owner-directed founding precedent in
`goviral-2026-08a` and `marketingshark-2026-08a`.

Owner-commissioned on 2026-08-12 through the BOOKSOFHISTORY implementation program.
Code may be built and proved with labelled fixtures while this decision is pending.
Nothing runs live until the owner countersigns this record and resolves the applicable
approval items. A missing approval always selects the safer, `$0`, drafts-only path.

Every ceiling from `budget-2026-08e` is untouched: `$30` all-in each month, a `$25`
model/API share and a `$1.00` daily pace. The per-call ceiling remains `$0.10`.
BOOKSOFHISTORY adds a research envelope of at most `$0.50` per cycle and an internal
research ceiling of at most `$5.00` per month; both are lower fences inside the signed
portfolio limits, never replacements for them. Truth gates, the social triple-lock,
treasury rules, append-only decisions and `METRICS_INGESTION_ENABLED=false` remain
unchanged.

## The venture

BOOKSOFHISTORY (`booksofhistory`) is a bilingual Czech-and-English social-content
venture about the stories behind famous books. A cheap authored seed library routes
attention. A deterministic shortlist and an editorial room decide which books justify
research. Paid research becomes a persistent, source-backed dossier that can support
more than one feature. PLOT then writes a language-neutral story brief and two
independent native-language packages. Both remain recommendation drafts until the
owner approves them, renders them through the Design Lab and posts them by hand.

The venture's operating room is `bh-desk`, daily at 12:00 Prague. Its persistent cycle
moves through selection, research and production, advances only after a phase completes
and resumes a missed phase instead of skipping it. A shelf dossier with an unused,
above-threshold story takes priority over new research.

## Research, truth and copyright gates

- Every paid research call uses the guarded reserve-before/record-after funnel. It
  carries an explicit search-use cap and search-content reservation, and its actual
  tokens, searches and cost are recorded.
- Idempotency is keyed by `(bookId, briefHash)` with an in-flight lock. Existing
  dossiers, question coverage, trustworthiness, staleness and unused shelf stories are
  checked before any new spend.
- No individual call may exceed `$0.10`, no cycle may spend more than `$0.50` on
  research and no month may spend more than `$5.00` on research. An estimated gather
  above the per-call ceiling is split before reservation; no caller may raise a cap to
  make it fit.
- Claims keep sources and one of `verified`, `probable`, `single-source`, `legend` or
  `rejected`. Sensational claims receive deterministic triage and, only when required,
  a capped check under QUILL. Rejected claims do not publish. A legend may appear only
  when the package labels it as legend.
- Every factual sentence in both languages resolves to acceptable dossier claim ids.
  Research is language-neutral and is never repeated merely to produce the second
  language.
- No book-cover artwork is rendered, delivered or placed in a social asset. A seed
  `coverRef` is admin context only. Quotes are at most 300 characters and carry
  attribution. Health and private-life claims about living authors are excluded
  regardless of sourcing.

## Cost declaration

The planning estimate is approximately `$0.07` for selection, up to `$0.46` for a
two-candidate research day and approximately `$0.20` for story selection plus two
native-language passes. A three-day cycle is expected to cost about `$0.55–0.73`, or
about `$6–8` per month at the initial cadence, and should fall as reusable dossiers
accumulate. These are forecasts, not permission to exceed a guard. The authored seed
library, deterministic scoring, dry fixtures and Design Lab rendering cost `$0`.
There is no cash spend and no treasury action in this program.

## Human approval gates

BH-21b files the exact owner items; this decision does not resolve them:

- `BH-RESEARCH-001` — guarded web-search research on the existing Anthropic key,
  including the research caps, ledger and idempotency rules.
- `BH-SEED-002` — the authored seed library, prior-not-fact labels and the no-cover-art
  boundary.
- `BH-ACCOUNTS-003` — handle clearance and any future Czech and English profile lanes.
- `BH-RESULTS-004` — owner-entered results per lane as the only measurement source.

Account creation, credentials, posting and channel access remain owner-only. No approval
item authorizes this implementation session to create an account, touch a channel or
post anything.

## Implementation checklist

- [x] **BH-00** — Phase 0 audit incl. sibling-build coordination
- [x] **BH-01** — Write the founding decision record
- [x] **BH-02a** — Registry entry in `config/ventures.json`
- [x] **BH-02b** — Registry schema enums, fixtures and the two new KPI evaluators
- [x] **BH-03a** — Register the `bh-desk` phase in type and record schemas
- [x] **BH-03b** — Meeting policy for `bh-desk`
- [x] **BH-03c** — `cycle.yml` dispatch choices and mode gates
- [x] **BH-03d** — Vercel cron entries for the 12:00 slot
- [x] **BH-04a** — FOLIO and PLOT in registry, routing, controls and cast schema
- [x] **BH-04b** — Prompts for FOLIO, PLOT and the research/verification calls
- [x] **BH-04c** — Model roles for the desk and the research ladder
- [x] **BH-05a** — Cycle state-machine contract
- [x] **BH-05b** — State machine, runner dispatch and per-day records
- [x] **BH-05c** — Scaffold, hue, labels, KPI seeds and ladder position
- [x] **BH-06a** — `bh-seed` contract and fixtures
- [x] **BH-06b** — The no-cover-art boundary test
- [x] **BH-07a** — Author the approximately 200-book seed library
- [x] **BH-07b** — The `bh:seed` validating CLI
- [x] **BH-08a** — The deterministic opportunity scorer
- [x] **BH-08b** — Shortlist contract and daily records
- [x] **BH-09a** — The venture-agnostic research-provider interface
- [x] **BH-09b** — The `anthropic-web-search` adapter over the guarded funnel
- [x] **BH-10** — Research briefs from the editorial meeting
- [x] **BH-11a** — Research runs and dossier writes
- [x] **BH-11b** — Dossier and research-ledger contracts
- [x] **BH-11c** — Research idempotency, in-flight lock and ceilings
- [x] **BH-11d** — Supplemental freshness calls
- [x] **BH-12a** — Deterministic claim triage
- [ ] **BH-12b** — `CLAIM_CHECK` escalation and verification-state transitions
- [ ] **BH-13a** — Story-score comparison and recorded selection
- [ ] **BH-13b** — Canonical story brief and independent twin passes
- [ ] **BH-14** — Production gates for both languages
- [ ] **BH-15** — Recommendation records with dossier-story evidence
- [ ] **BH-16a** — Studio brand tokens for `booksofhistory`
- [ ] **BH-16b** — Per-record locale and two summaries per feature
- [ ] **BH-17** — Admin approval write path
- [ ] **BH-18a** — Server-only admin loader
- [ ] **BH-18b** — Shortlist panel with factor breakdowns
- [ ] **BH-18c** — Dossiers panel with the research ledger
- [ ] **BH-18d** — Features panel, tab wiring and e2e
- [ ] **BH-19a** — GoVIRAL spine: topic set and trend factor
- [ ] **BH-19b** — GoVIRAL spine: transitions and the Design-Lab-only test
- [ ] **BH-20a** — Owner results per lane
- [ ] **BH-20b** — Category weights with floors
- [ ] **BH-20c** — Used-flag backfill and the research-efficiency KPI
- [ ] **BH-21a** — Documentation truth across the standing docs
- [ ] **BH-21b** — INBOX approvals and NEEDED owner items
- [ ] **BH-21c** — Honest gaps, checkbox sweep and build-prompt deletion

## Honest gaps

## Adapted during implementation

- **BH-00 tracker ordering.** BH-00 required an audit with no file changes, while this
  tracker did not exist until BH-01. The audit therefore completed in the empty commit
  `57d063a`; this first tracker commit marks it complete. This is the only way to keep
  the required title order, the audit's no-change acceptance and one commit per issue.
- **QUILL remains global.** BH-04a's issue text asks to extend QUILL's venture array,
  but the registry has `ventures: "global"` and design section 5 explicitly keeps QUILL
  global. HACEK gains `booksofhistory`; narrowing QUILL to a venture array would demote
  a shared public-claim control and contradict the higher-precedence design.
- **Door Money ladder insertion remains pending its sibling build.** BH-05c places the
  BOOKSOFHISTORY sequence (two research candidates, one, stretch, room drop) immediately
  before the existing `gv-brief` drop. No Door Money phase exists in the registry or phase
  schemas on this branch, and the program forbids touching `DM-` work, so this commit does
  not invent foreign phase ids. When that sibling lands, its rooms belong immediately before
  these BOOKSOFHISTORY rungs, preserving the issue's requested relative order.
- **Registered roles do not imply public profiles here.** The existing content-inventory
  test assumed every registered agent acquired a public `/agents/*` route. That would
  contradict this decision's no-public-route fence, so FOLIO and PLOT remain available
  to internal and admin consumers but are excluded from public static generation,
  navigation, sitemap and inventory.
- **Sibling coordination.** Neither the Kvórum nor Door Money build has landed. The
  shared recommendation contract, owner-result contract, performance weights and
  per-record carousel-summary locale are absent. BOOKSOFHISTORY will create or extend
  each only in its named BH issue; it will not duplicate speculative sibling modules.
- **Daily-envelope audit.** The current `system-audit.test.ts` adds every room maximum,
  one article-production maximum and the morning cap as though all reservations run in
  one day. The live schedule code already states that its reservation total can exceed
  the daily pace and relies on pre-flight refusal. Adding the specified `$0.50` room
  cannot satisfy that static sum. BH-02a/BH-02b will preserve the `$1.00` runtime cap
  and replace only the false simultaneity assertion with individual-envelope and
  pre-flight-refusal proof; no budget guard is weakened.
- **Research adapter reality.** The pinned `@anthropic-ai/sdk@0.113.0` exposes
  `web_search_20260318` and reports actual calls at
  `usage.server_tool_use.web_search_requests`. The OpenAI text adapter has no search
  tool path. The provider interface remains vendor-neutral, but the only implemented
  adapter in this program is Anthropic.
- **Studio locale reality.** `carousel-summary/1` currently permits only `locale: "cs"`
  and only the two magazine ventures. BH-16b must introduce locale on each record while
  keeping existing magazine summaries byte-identical.
- **Admin persistence naming.** The current canonical GitHub-or-local ladder is
  `saveEventsFile`, not a function literally named `persist`. BH-17 will reuse its
  authentication, origin, payload, production fail-closed and persistence semantics,
  without creating a second storage abstraction.

## What this does not touch

The scope is social content production and growth only. This program creates no public
website, public book pages, SEO archive, public or private database, newsletter,
storefront, affiliate path or new public route. It adds no speculative fields, tables or
abstractions for those possible products.

It does not touch the `$30 / $25 / $1.00` ceilings, the publisher, social unlock
counters, credentials, accounts, channels, autopublish, treasury or payments. It does
not enable engagement ingestion or change the magazines' evidence, release or delivery
paths. GoVIRAL's Apify recipe and quota remain unchanged. The Design Lab remains the
only rendering path, and the existing ventures' deterministic output remains unchanged.

## Owner countersignature

Selection: [ ] Found BOOKSOFHISTORY under this decision  [ ] Do not found

Name: ____________________

Date: ____________________

Signature / explicit approval reference: ____________________
