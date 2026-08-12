# Tehdejší svět — venture adoption: Codex implementation specification

You are implementing a new BoardlessAI venture in this repository (`lukaskourilcz/quorum`).
This document is the owner's commission for the build. Per house convention it is
scaffolding: it is deleted in the final commit of the program, and what outlives it is the
countersigned founding decision you will write in `state/decisions/`, the strategy record
`docs/TEHDEJSI-SVET-VENTURE-DESIGN.md`, and the code. Where this specification, that
strategy document and the founding decision disagree, the decision wins, then the strategy
document, then this file. This commission authorizes edits outside the `AGENTS.md`
standing write allowlist for the files this program names — that allowlist governs
unattended sessions, not owner-issued builds.

## What you are building, in one paragraph

**Tehdejší svět** (venture id `tehdejsi-svet`): BoardlessAI adopts the owner's existing
product (`lukaskourilcz/dontwannaknow`, a client-only React app that reconstructs the
historical world a person grew up in — Czechia + Ukraine, curated deterministic data,
privacy-first) as a **marketing-side social venture**. A read-only snapshot index of the
product's public runtime data — pinned to a source commit, honoring the product's own
`shareSafe`, sensitivity and exclusion flags at build time — feeds a daily room
(`ts-desk`, 18:00 Prague) that walks a two-day cycle: Day A mines and ranks bilingual
story candidates and writes briefs; Day B produces Czech copy (LETOPIS) and a native
Ukrainian editorial adaptation (VERBA), gates them, and lands recommendation drafts.
Approved features render in the Design Lab through a new bilingual family kit (CS first,
UA directly under, one slide) under a `tehdejsi-svet` brand token set matching the
product's export palette, with new Cyrillic-complete committed fonts. Deep research
reuses the shared research-provider module sparingly (≤ $2/month). The owner posts by
hand and enters results; community signals and product insights queue for the owner.
**The `dontwannaknow` repository is never written to by anything in this venture.**
Read `docs/TEHDEJSI-SVET-VENTURE-DESIGN.md` in full before writing code — it carries
the positioning, the bilingual slide law, the sensitivity tiers and the examples this
build implements.

## Phase 0 — audit before you build (mandatory, no code yet)

Inspect **both** repositories. Where reality has drifted from this spec, follow reality
and record the divergence in the founding decision.

In `quorum`:

1. `CLAUDE.md`, `docs/ENGINEERING.md` (all 17 rules bind), `GOVERNANCE.md`,
   `docs/ECOSYSTEM.md`, newest `state/decisions/*`, and the founding precedents
   (`2026-08-06-goviral-founding.md`, `2026-08-07-marketingshark-founding.md`).
2. **Sibling programs** — check for the Kvórum, Door Money and BOOKSOFHISTORY builds
   (their prompts in `docs/`, or founding decisions if already executed). Shared
   artifacts you must reuse rather than duplicate wherever they exist:
   `contracts/venture-recommendation.schema.json` (you add `evidence.kind:
   "tehdejsi-story"`), the research provider module (`orchestrator/src/research/
   provider.ts`) with its dossier/ledger contracts, `owner-result-entry/1`, the
   performance-weights mechanism, the carousel-summary locale field, and the
   cycle-state-machine pattern (BOOKSOFHISTORY's `bh-cycle/1`). If none landed, create
   the shared pieces exactly as those prompts specify, with your kinds, so later
   builds extend yours.
3. Venture machinery: `config/ventures.json`, `orchestrator/src/contracts/
   venture-registry.ts` (closed enums to extend), `orchestrator/src/ventures/
   registry.ts` (slot spacing — verify 18:00 clears ≥ 60 minutes against 17:00
   `cu-product` and 19:00 `mma-analysis`; it does, exactly, on both sides),
   `orchestrator/src/ventures/marketingshark/run.ts` and `bank.ts` (the runner shape
   AND the hash-verified committed-snapshot discipline your read layer mirrors),
   `orchestrator/src/cycle.ts`, `orchestrator/src/types.ts`,
   `orchestrator/src/contracts/meeting-record.ts`, `config/meeting-policy.json`.
4. Money and guards: `orchestrator/src/llm/call.ts`, `orchestrator/src/budget.ts`,
   `portfolio/schedule.ts` + `limits.ts` (degradation ladder), `config/models.json`,
   what `system-audit.test.ts` actually asserts about envelopes,
   `orchestrator/src/security/url.ts` (`safeFetch`) and `config/network-allowlist.json`
   (`api.github.com` is already present — your record-body fetches ride it).
5. Admin and studio: `site/src/app/admin/page.tsx` (`Promise.all`, `tabView`
   `{node,count}`), `site/src/lib/admin-portfolio.ts`, a `persist()`-ladder store, an
   admin API route, `site/src/proxy.ts`; `studio/src/schema.ts` (`BrandTokensSchema`),
   `studio/src/library.ts` (`CAROUSEL_BRANDS`, `deckFormats`), `studio/src/fonts.ts` +
   `font-metrics.generated.ts` (how committed fonts are measured), `studio/src/
   family-kit.ts` and one `families-*.ts` module (how a family composes slides),
   `studio/src/summary.ts`.
6. Tests that police you: `orchestrator/tests/architecture.test.ts`
   (`expectedPrompts`, agents/routing parity), `vercel-cron.test.ts`,
   `ci-policy.test.ts`, `contracts.test.ts` (its Czech-required/English-optional rule —
   your CS+UA shapes must fit it honestly), `ventures.test.ts`, and the studio
   determinism tests (existing brands' bytes must not change).

In `dontwannaknow` (read-only; a local clone, e.g. the one at
`/workspace/lukaskourilcz/dontwannaknow`, or a fresh shallow clone):

7. `AGENTS.md` (the product's 10 non-negotiables), `DOCS.md`, `DESIGN.md`,
   `monetization.md` (no ads, no tracking scripts — binding on anything you surface),
   `docs/fact-scoring.md`, `docs/data-city-images.md`.
8. The data layer: `dontwannaknow/src/data/public/**` (the datasets your index
   covers), `src/data/relevance/**` and `src/data/provenance/**` (sidecars),
   `src/data/dataSources.json` (the 43-dataset registry with `publicRuntime` and
   confidence flags), `src/data/editorialRules.json` (the sensitivity regexes you
   port), `src/data/cityImages/*.json` (licence records + the `excluded` flag).
9. The composition law and tokens: `src/lib/shareImage.ts` (margins, crosshair, top
   bar, coral tick, ratio type scale — the grammar your family kit echoes),
   `src/lib/brand.ts` (the export palette the venture brand adopts: paper `#f7f2e8`,
   ink `#18201d`, green `#1e3f39`, coral `#d9684f`, muted `#4d5f59`, rule `#d5cdbf`),
   `src/lib/relevance.ts` (axis order and weights — your scorer reuses the composite),
   `src/lib/report.ts` (types: `FactSensitivity`, `EditorialMetadata`, `shareSafe`
   semantics), `src/lib/historicalLocation.ts` (period city renames your place chips
   must match), `src/copy.ts` (brand copy the venture inherits verbatim).

## Non-negotiables

- **The product repository is read-only.** No module in this venture writes to, pushes
  to, or opens PRs against `dontwannaknow`. A test pins that the venture's orchestrator
  modules import nothing from a dontwannaknow checkout and that the only read paths are
  the snapshot builder CLI and the pinned-commit body fetcher. Product changes travel
  only as product-insight queue entries the owner acts on himself.
- **The product's own flags are honored structurally.** Records with
  `shareSafe: false` (all leaders included) and city-image records with
  `excluded: true` never enter the snapshot index — banned at build, not filtered at
  use. Sensitivity values ride the index and drive the tier gates; the product's
  `editorialRules.json` regexes are carried in the index envelope so they version with
  the data they police.
- **Bilingual is a format, not a translation step.** Every feature carries independent
  CS and UA payloads produced as separate editorial passes over one canonical story
  brief; the research/data layer is never invoked twice for language reasons; a gate
  rejects UA copy that is a sentence-by-sentence mirror of the CS (structure may
  match; wording must be native).
- **Licence discipline.** CC BY-SA / CC BY assets render with on-slide or in-caption
  attribution (the recommendation carries the attribution strings; the family kit has
  the slot; a gate refuses a licensed asset without one). The licence allowlist equals
  the product's (PD, CC0, CC BY, CC BY-SA; NC/ND/fair-use banned). No cover-to-cover
  quoting of CC BY-SA text without attribution. No scraped or AI-generated historical
  imagery, ever.
- **Sensitivity tiers** (strategy §26) are deterministic gates: tier-2 topics set a
  blocking human-review flag on the recommendation; excluded categories cannot be
  drafted at all; tier-2 features carry no participation CTAs; the wartime-UA
  remembrance rules are lint rules, not suggestions.
- The `budget-2026-08e` ceilings; envelope `ts-desk` $0.25; research ≤ $0.30/brief,
  ≤ $2.00/month; venture model spend ≤ $4.00/month target. Every paid call through the
  guarded funnel, reserve-before/record-after. The social triple-lock (publisher
  refuses `tehdejsi-svet` by name), treasury rules, `METRICS_INGESTION_ENABLED=false`
  (owner-entered results only; the product's Vercel Analytics is read by the owner,
  never wired), magazines' gates, append-only decisions: untouched.
- Engineering contract throughout: contracts + valid/poison fixtures; parse-or-drop
  with counted drops; recorded-not-re-derived (the index, dossiers, shortlists, cycle
  state, terminology table are written once and versioned); one writer per path;
  failure posture; `null` ≠ `0`; ~400-line cap; small commits, one concern each. Dry
  runs are $0 end-to-end on fixtures (fixture index, fixture records).

## The build, in phases

Full gate green at each phase end (`pnpm agents:validate && pnpm lint && pnpm typecheck
&& pnpm test && pnpm build`, site e2e where touched; `pnpm -C studio build` after any
studio change); one commit per task; task ids `TS-01…` as checkboxes in the founding
decision.

### Phase A — founding records, registration, cycle skeleton (dry holds, $0)

- **TS-01** `state/decisions/<today>-tehdejsi-svet-founding.md` in the house shape
  (decision id, pending countersignature, extends the GoVIRAL/marketingShark
  precedent, untouched-ceilings paragraph, the product-repo-read-only rule stated as a
  founding term, TS checkbox list, honest-gaps section, "What this does not touch").
- **TS-02** Registry entry: id `tehdejsi-svet`, name `Tehdejší svět`,
  `status: "operating"`, `taste: true`, ledgerNamespace `tehdejsi-svet`,
  growth_objective "Turn the product's curated past into bilingual family
  conversations" with components `feature-cadence` + `research-efficiency` (reuse from
  BOOKSOFHISTORY if landed; else create per its spec), adminTabs
  `["features","library","signals"]` (extend the closed enum), one meeting `ts-desk`
  `daily@18:00`, cast `["LETOPIS","VERBA","HACEK","QUILL","AUDIT"]`, envelope 0.25,
  packet `{topicType:"social", decisionNeeded:"PLAN", preset:"ts-desk-room",
  objectives:{dry,live}}`.
- **TS-03** Phase plumbing: `ts-desk` into the phase schemas, meeting-record enum,
  `meeting-policy.json` (standing; `gv-brief ↔ ts-desk` transitions), `cycle.yml`
  dispatch choices + mode gates, `site/vercel.json` two DST cron variants and nothing
  else.
- **TS-04** Agents: LETOPIS and VERBA in `config/agents.json` (+ routing capabilities
  + the `ts-desk-room` preset, venture-agent-controls, `FoundingAgentSchema`);
  HACEK's and QUILL's `ventures` arrays extended; prompts
  `orchestrator/prompts/tehdejsi-svet/{letopis,verba,craft}.md` + `expectedPrompts`
  (craft distills the strategy's editorial filter, sensitivity tiers, bilingual rules
  and the no-flags visual rule; runtime prompts never load skill files);
  `config/models.json` roles `LETOPIS` (`claude-sonnet-5`, ~8000/2500) and `VERBA`
  (`claude-sonnet-5`, ~6000/2000 — native UA quality is a brand promise).
- **TS-05** Cycle state machine: reuse the BOOKSOFHISTORY pattern (`ts-cycle/1`
  contract + fixtures if `bh-cycle/1` shipped a reusable helper, else the same shape
  freestanding): phases `plan → produce`, Sunday insights overlay flag,
  advance-on-completion, resume-on-miss, stretch-under-pressure.
  `orchestrator/src/ventures/tehdejsi-svet/run.ts` dispatched from `cycle.ts`,
  honest per-day records. Venture `README.md` (adoption terms, drafts-only posture),
  venture-brand hue, `VENTURE_LABEL`, KPI seeds (strategy §47), degradation-ladder
  position (drops with the other new ventures, after the Door Money rooms, before
  `gv-brief`) with its test.

Acceptance: `pnpm cycle -- --phase ts-desk --dry` walks a fixture cycle at $0;
architecture tests green.

### Phase B — the snapshot read layer

- **TS-06** `tehdejsi-snapshot/1` contract + fixtures: envelope `{schemaVersion,
  sourceRepo: "lukaskourilcz/dontwannaknow", sourceCommit, builtAt, contentHash,
  editorialRules: [...], records: [...]}`; per record — `dataset, key, country?,
  city?, year?, decade?, category?, chapter?, tone?, sensitivity, rel?: [6 ints],
  licence?, hasSource: boolean, textHash, excerpt (≤ 200 chars for admin browsing),
  media?: {file, licence, attribution, sourceUrl, excluded-omitted}`. Build rules
  stated in the contract's description and enforced by the builder: `shareSafe:false`
  records and `excluded:true` images are **omitted**; the product's
  `editorialRules.json` regexes are embedded verbatim; the envelope hash follows the
  marketingShark `bank.ts` discipline (hash mismatch = refuse to load).
- **TS-07** `pnpm tehdejsi:sync` CLI (`orchestrator/src/ventures/tehdejsi-svet/
  sync-cli.ts`): reads a **local clone path** of the product repo (argument or env;
  never clones by itself in CI), walks `src/data/public/**` + relevance + provenance
  sidecars + `dataSources.json` + `editorialRules.json` + `cityImages/*.json`, builds
  and atomically writes `state/ventures/tehdejsi-svet/snapshot/index.json`. Owner-
  triggered, $0, no model calls, no network. Drift surfaced honestly: the admin
  library tab shows sourceCommit and its age.
- **TS-08** Record-body fetcher (`kb.ts`): fetch a named record's full source file at
  the pinned commit through the GitHub Contents API (`api.github.com`, already
  allowlisted, public repo, unauthenticated — note the 60/hr anonymous rate limit in
  a comment; the desk fetches ≤ 20 files/cycle and caches), via `safeFetch`, verified
  against the index `textHash`, cached under
  `state/ventures/tehdejsi-svet/snapshot/cache/` with one writer. Fixture path for
  tests and dry runs.
- **TS-09** The scorer (`score.ts`) + `ts-shortlist/1`: the strategy §30 formula over
  the index — product `rel` composite (reuse the product's axis weights, read from
  the index, with livedProximity/recognition boosts), send-target clarity,
  participation potential, imagery availability, bilingual fit, diversity pressure
  (21-day window over pillar/city/decade/country), anniversary + GoVIRAL
  cultural-moment timing, performance weights, sensitivity friction. Factor
  breakdowns recorded per entry. Pure, exhaustively tested.

Acceptance: sync of a fixture product tree produces a byte-stable index; a
`shareSafe:false` fixture record and an `excluded` fixture image provably never
appear; scorer deterministic across runs.

### Phase C — research, dossiers, sensitivity

- **TS-10** Research reuse: wire the shared research provider (create it per the
  BOOKSOFHISTORY spec §BH-09 only if no sibling landed) with venture briefs and the
  venture's own ledger + ceilings (≤ $0.30/brief, ≤ $2.00/month), idempotency by
  `(topicKey, briefHash)`, used-flags. Standing brief priorities encoded as data, not
  prose: UA everyday/culture gaps, the pre-2010 CS+UA names dataset, era music.
  Research output lives under `state/ventures/tehdejsi-svet/dossiers/` and is
  **marketing data**: a test pins that no venture module writes inside any
  dontwannaknow path.
- **TS-11** Sensitivity gates (`gates.ts`, part 1): the tier classifier (index
  sensitivity + ported regexes + tier-2 topic list from the strategy), tier effects
  (tier-2 → blocking `humanReview` flag, participation-CTA ban, two-source rule;
  excluded categories → refuse draft), the wartime-UA remembrance lint, the
  terminology check against `state/ventures/tehdejsi-svet/terminology.json`
  (`ts-terminology/1`, seeded with the strategy's pairs, updated only by recorded
  meeting proposals), and the no-flags/no-AI-imagery/no-leader-subject rules.

### Phase D — production

- **TS-12** `venture-recommendation/1` — extend (or create per sibling spec) with
  `evidence.kind: "tehdejsi-story"`: snapshot record refs, optional dossier refs,
  sensitivity tier, terminology-check state, media refs with licence + attribution
  strings, and the bilingual payload `{slides: [{cs, ua}], captionCs, captionUa,
  ctaKind}`.
- **TS-13** Day A in `run.ts` + `briefs.ts`: deterministic shortlist → one LETOPIS
  `guardedJsonCall` (ranks, picks 1–2, decides research, writes canonical story
  briefs — the strategy's meeting-output example is the record shape). Honest
  quiet-day and stretch records.
- **TS-14** Day B: LETOPIS CS pass over the canonical brief (feature copy + caption +
  CTA from the taxonomy), then VERBA UA pass over the same brief plus the CS copy
  **as reference, with the anti-mirror instruction** (native adaptation; terminology
  table authoritative). Gates (part 2): claim refs resolve to snapshot records or
  dossier claims (product `review-needed` records publish only in single-source
  framing); per-slide word caps (CS ≤ 20, UA ≤ 20); quote-substring checks;
  duplicate/similarity vs prior features; CTA-frequency rules (tag prompts ≤ 1/week,
  product links ≤ half of features); anti-mirror check; stop-slop lint on both
  languages. Failed packages drop and are counted. Store as drafts, idempotent per
  (cycle, story).

### Phase E — Design Lab: fonts, brand, bilingual kit

- **TS-15** Cyrillic-complete fonts: add **Literata** and **Inter** static OFL cuts
  to the studio's committed font set, regenerate `font-metrics.generated.ts` with the
  existing tooling, and add a glyph-coverage test asserting the full Ukrainian
  alphabet (including Ї ї Є є Ґ ґ І і) and Czech diacritics measure correctly in
  both faces. Existing brands' rendered bytes must not change (determinism tests
  before and after).
- **TS-16** Brand tokens: `tehdejsi-svet` into `BrandTokensSchema.id` +
  `CAROUSEL_BRANDS` with the product's **export palette** (`#f7f2e8` paper,
  `#18201d` ink, `#1e3f39` green, `#d9684f` coral, `#4d5f59` muted, `#d5cdbf` rule),
  fonts Literata/Literata/Inter, logoText `Tehdejší svět`. Contrast checks must
  pass; where the palette needs a darker coral for small text, follow the product's
  own `coral-dark` approach and record it.
- **TS-17** The bilingual family kit: a `tehdejsi` family (or family set) composing
  the strategy §16 slide law — eyebrow slot, CS slot (scale 1.0), 40% hairline rule,
  UA slot (scale 0.85, ink at reduced opacity), footer with year·place chip (coral)
  and attribution slot; cover variant (CS hook large, UA at 0.8×); full-bleed photo
  slide variant with mandatory attribution slot; the top-bar + coral-tick +
  registration-crosshair devices from the product's share-image grammar. Per-slot
  fit/overflow validation through the existing checks. The venture's render module
  (`orchestrator/src/ventures/tehdejsi-svet/render.ts`, marketingShark shape) builds
  deck payloads from the recommendation's bilingual slides; recorded summaries under
  `state/ventures/carousel-studio/summaries/tehdejsi-svet/` make features appear in
  the studio rail (locale handling per whichever sibling landed; this venture's
  records carry `cs` as primary with the bilingual payload in the pack).
- **TS-18** A studio test rendering a fixture bilingual deck byte-stable, proving UA
  text shapes correctly (no tofu, no fallback face) and the attribution slot renders
  when a licensed image is present and refuses when absent.

### Phase F — admin

- **TS-19** Approval write path `POST /admin/api/tehdejsi-svet/features` on the
  standard ladder: approve (tier-2 requires the review flag cleared explicitly),
  edit-then-approve (original preserved), reject-with-reason, posted-URL, results
  entry per platform. Approve writes the recorded summary + marks the package
  ready-to-post (copy buttons for CS and UA captions, PNG/ZIP export via the
  existing routes).
- **TS-20** Loaders + panels: `admin-tehdejsi-svet.ts` (server-only, parse-or-drop),
  `tehdejsi-svet-features-panel.tsx` (shortlist with factor breakdowns, bilingual
  packages side by side, sensitivity badges, gates, approvals, RatingWidget),
  `tehdejsi-svet-library-panel.tsx` (index browser by city/decade/pillar with the
  product's scores and badges, dossier shelf, research ledger + efficiency, snapshot
  sourceCommit + age), `tehdejsi-svet-signals-panel.tsx` (community-memory digest
  entry + extracted themes, audience requests with recurrence counts, the
  product-insight queue). Wire through `Promise.all` + `tabView`, register tabs,
  e2e entries + `@write-journey`.
- **TS-21** Signals + insights: `ts-signal/1` (owner-pasted comment harvests →
  Sunday-overlay extraction into themes/requests/corrections; recollections marked
  as recollections, never facts) and `ts-product-insight/1` (evidence, proposed
  product action, owner-controlled status). **Seed the insight queue in this build**
  with the five audit findings: the chapter-04 music copy-vs-data bug, the missing
  music dataset, the coral token drift (`#b0492f` web vs `#d9684f` exports), the
  names-data gap (CZ 2010–2023 only), the UA film-premiere gap (36 vs 744) — each
  with its file-path evidence from the product repo.

### Phase G — the loop and close-out

- **TS-22** GoVIRAL spine (all four legs): a `tehdejsi-svet` topicSet in
  `config/goviral-sources.json` (CS+UA nostalgia/family-history/city-memory trend
  terms; free signals only, the Apify recipe untouched); the scorer consumes the
  latest recorded GoVIRAL plan (timing/cultural-moment factor, wartime news
  awareness); `meeting-policy.json` transitions both ways; the Design-Lab-only
  rendering test.
- **TS-23** Results + weights: shared `owner-result-entry/1` per platform,
  `POST /admin/api/tehdejsi-svet/results`, weights (bounded, floor-protected,
  Sunday-proposal-only, citing result ids) read by the scorer; research used-flags
  backfilled at posting; experiment records (one live at a time, the strategy §38
  ladder) in the sibling ventures' recorded-hypothesis shape.
- **TS-24** Documentation truth (`docs/ECOSYSTEM.md` curated layer,
  `docs/PORTFOLIO.md`, `README.md` table, `about-project.md`, `scaling.md` cost
  lines), INBOX approvals filed (below), `docs/NEEDED.md` owner items appended
  (launch preconditions from strategy §44: production domain, handles, accounts,
  content bank), founding decision honest-gaps written, every TS checkbox ticked,
  this file deleted in the final commit with the deletion noted in the decision.

## Approvals to file in `state/INBOX.md` (house shape, "What this approves, exactly:")

- **TS-SNAPSHOT-001** — the read layer: the committed snapshot index built from a
  local clone by owner-triggered CLI, pinned-commit record fetches via
  `api.github.com`, the build-time exclusion rules, and the standing term that
  nothing writes to the product repository. $0.
- **TS-MEDIA-002** — the deliberate divergence: licensed city photographs (CC
  BY-SA, Wikimedia) may appear in social cards with on-slide attribution and
  licence-respecting captions, exclusions honored; the product's internal
  share-image rule stays product-side.
- **TS-ACCOUNTS-003** — the venture's social accounts (IG + FB + Threads), handle
  clearance (@tehdejsisvet), bilingual bios per the strategy, and the launch
  precondition that the product's production domain lands first. Drafts-only until
  signed.
- **TS-RESEARCH-004** — research within the shared provider: ≤ $0.30/brief,
  ≤ $2.00/month, the standing UA-gap/names/music priorities, dossiers as marketing
  data with the product-promotion boundary.
- **TS-RESULTS-005** — owner-entered per-post results and owner-pasted comment
  harvests as the venture's only measurement, inside the D9 hold; the product's
  analytics remain untouched and unwired.

## Cost declaration (goes in the founding decision)

Per two-day cycle: Day A ≈ $0.06 (LETOPIS planning); Day B ≈ $0.15 (CS pass + UA
pass); Sunday overlay ≈ $0.06/week. ≈ 13 cycles/month ≈ **$2.90/month** model spend +
research ≤ $2.00/month, inside the $25 share and the venture's $4 target (research
months may reach ~$5 total; the founding decision states it). Snapshot sync and all
mining $0. $0 cash anywhere.

## What is explicitly out of scope

Any write to `dontwannaknow` (including the token-drift fix, the chapter-04 copy
fix, robots/sitemap, UA website localization — all are insight-queue entries for the
owner). Account creation, posting, channels, publisher changes, autopublish
counters. Reels/TikTok (day-60 decision). Paid distribution of any kind. Community
scraping or comment APIs (owner-pasted harvests only). A names or music dataset
inside the product (venture-side research data only). Anything from the strategy's
phase-2/phase-3 lists — named in the honest-gaps section.

## Definition of done

Every TS task ticked; full gate green plus site e2e and studio determinism; dry
`ts-desk` walking a complete fixture cycle (plan → produce) with honest records;
the snapshot builder provably excluding `shareSafe:false` and `excluded` records;
a fixture bilingual deck rendering byte-stable with correct Ukrainian shaping and
enforced attribution; the product-repo read-only test passing; the insight queue
seeded with the five audit findings; the founding decision awaiting
countersignature with a handoff note listing the owner's next steps (sign, resolve
approvals, land the production domain, clear handles, create accounts, run
`pnpm tehdejsi:sync`, approve the first content bank, launch).
