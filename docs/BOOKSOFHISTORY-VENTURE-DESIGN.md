# BOOKSOFHISTORY: the book-history venture — design

Status: proposed, pre-founding. Nothing runs until the owner countersigns
`state/decisions/<date>-booksofhistory-founding.md` and the §12 items are resolved in
`state/INBOX.md`. The implementation contract is `docs/BOOKSOFHISTORY-CODEX-BUILD-PROMPT.md`
— scaffolding, deleted when executed; the decision record and this document outlive it.

The shape in one line: **a cheap seed library routes attention, agents spend research money
only where a story might live, every paid dossier becomes a permanent asset that keeps
producing posts, and the owner is the gate.** The venture's real product is not the next
post; it is an ever-better answer to "which book is worth researching?"

Scope, restated as a hard boundary: **social content production and growth only.** No
public website, book pages, SEO archive, searchable database, newsletter or storefront in
this implementation. The data model stays clean enough that those could exist later, and
nothing is built for them now.

## 1. Product concept and positioning

BOOKSOFHISTORY tells the stories *behind* famous books: the rejections, bans, feuds,
accidents, obsessions and afterlives — in Czech and in English, as designed narrative
carousels. Not reviews, not summaries, not literary analysis: publishing-history true
crime, told with receipts.

The lane is proven internationally (books-trivia and literary-history accounts thrive on
Instagram and TikTok) and nearly empty in Czech. The differentiators BoardlessAI brings:
a deterministic visual system (no competitor renders a consistent card language), a
verification discipline (the space is famously full of repeated fake trivia — "rejected
27 times" folklore — and an account that visibly gets it right owns the credibility
niche), and the bilingual twin engine: one research investment, two native audiences.

## 2. Name and branding direction

Name: **BOOKSOFHISTORY** (owner-given). Venture id: `booksofhistory` — one word, the
marketingshark/goviral id style. The English name serves both audiences; Czech copy runs
under the same mark the way Czech accounts routinely follow English-named brands. Handle
clearance is an owner check (§12); ids survive any public rename.

Visual identity direction: **the first-edition card** — cream paper ground, oxblood ink,
a foil-gold accent, serif display from the committed OFL set, colophon-style footers
carrying sources. One deliberate constraint that becomes the signature: **no book-cover
artwork is ever republished** (covers are copyrighted art and scraping them is exactly
the kind of gray path the house image discipline exists to refuse). Every visual is a
typographic edition card rendered by the Design Lab — title, author, year, one fact —
which costs $0, carries zero licensing risk, and makes the brand recognizable at
thumbnail size. Seed records may hold a cover *reference URL* for the owner's admin
context only; a test keeps it off every rendered surface.

## 3. Target audience

Czech lane: readers 25–60, the Databáze knih / book-club / veletrh public, plus the
general-interest audience that shares "I never knew that" material. English lane: the
global Bookstagram/BookTok-adjacent audience that follows literary-history and
publishing-trivia accounts. Two separate profiles per platform (a bilingual single feed
underperforms both algorithms and both audiences); one brand system over both. The twin
engine is the moat: Czech classics (Švejk, Čapek — who gave the world the word "robot" —
Kundera, Hrabal) are exotic material for the English lane, and world classics arrive in
the Czech lane with native-quality Czech telling, not translation.

## 4. Core workflows

The ten phases of the commission fold into **one daily room and a persistent cycle state
machine** — no new job graph, no rigid sequential pipeline. `bh-desk` fires daily at
12:00 Prague; a state file says which phase the current cycle is in; the room does that
phase's work and advances the state only when the phase actually completed. A missed day
resumes, never skips. The cycle targets three working days (`cycleDays` configurable) and
stretches itself under budget pressure rather than skipping.

- **Day A — selection and editorial meeting.** Deterministic scoring ranks the seed
  library (§8); FOLIO reviews the top-10 shortlist, discusses in the room packet, picks
  2 candidates for research (3 only when the month has headroom), and writes a tailored
  research brief per candidate. Books with paid-but-unused dossier stories shortcut the
  whole cycle: if the shortlist's top entry already has a dossier with an unused story
  candidate scoring above threshold, the cycle jumps straight to Day C — research money
  is spent only when the shelf is empty.
- **Day B — research and verification.** `researchBook(bookRef, brief)` runs per
  candidate through the research provider (§7): a gathering call with provider web
  search, then a synthesis call that normalizes into the dossier shape — claims with
  sources, story candidates with evidence refs, quotes, visual notes. Deterministic
  claim triage follows: sensational claims (superlatives, precise dramatic numbers,
  "banned/rejected/burned" hooks) escalate to a targeted verification call; everything
  gets a verification state. The research ledger records every call, its cost, its
  reason, its requesting meeting — and later, whether it was used.
- **Day C — story selection and production.** Dossiers are compared on *story score*,
  not seed score (the seed ranking is explicitly reversible — the commission's Book B
  case). FOLIO's selection is recorded with the losing dossiers kept as shelf stock.
  PLOT writes the canonical story brief (language-neutral: the narrative arc, the claims
  it stands on, the turn, the ending), then the Czech package and the English package as
  two independent writing passes over the same brief — never translation, never a second
  research call. Gates check claims against the dossier, quote caps, and register.
  Packages land as `venture-recommendation/1` drafts; approval renders both languages in
  the Design Lab; the owner posts by hand and records URLs and, later, numbers.

## 5. Agent structure and responsibilities

Two new agents:

- **FOLIO** — editorial lead. Ranks candidates in the meeting, decides what gets
  researched, writes research briefs, selects the winning story. Cannot call the
  research provider outside the room's decision record, cannot publish, cannot override
  a verification state. Sonnet — the venture's judgment seat.
- **PLOT** — story editor and writer. Mines story candidates (in the synthesis step),
  writes the canonical story brief and both language packages. Cannot invent a claim
  (every factual sentence carries dossier claim refs), cannot touch verification
  states, cannot post. Sonnet — narrative quality is the product.

Reused seats: **QUILL** (global, active: "public-claim clarity and support — cannot add
unsupported facts") chairs the verification stage — the claim-triage escalation runs
under its identity; **HACEK** extends its Czech register floor to a fourth venture;
**AUDIT** vetoes; **PALATE** distils owner ratings (`taste: true`). The publisher
refuses `booksofhistory` by name until a future decision.

## 6. Meeting structure and recurring agendas

| Meeting | Hour | Cast | Envelope | Behaviour |
| --- | --- | --- | --- | --- |
| `bh-desk` | daily@12:00 | FOLIO, PLOT, QUILL, HACEK, AUDIT | $0.50 | daily firing; the cycle state machine decides the day's phase; off-phase days that need nothing record a $0 line |

12:00 Prague is free and sits exactly 60 minutes from `tt-marketing` (11:00) and
`gv-brief` (13:00) — the registry's spacing rule holds. The envelope covers the worst
day (research day, ~$0.46); selection and production days run far under it, and the
runner tightens the cap per phase-day (a phase may lower a cap, never raise one). The
room may file one agenda onward (a Czech-book crossover to DNESKAi's desk; a trend
question to GoVIRAL) and consumes GoVIRAL's Monday brief in its scoring (§10).

## 7. Data sources and integrations — the research provider

The commission asks how external research is currently abstracted. Audited answer: the
budget layer is **already web-search-ready** — `estimateTextCall` accepts
`webSearchUses` and `maxSearchContentTokens`, refuses a search without an explicit
search-content reservation, and bills `toolUsd` at `WEB_SEARCH_USD_PER_CALL` ($0.01, the
Anthropic web-search price) — but no text call site uses it yet. So the research
provider is a thin, honest extension of the existing funnel, not new infrastructure:

- `orchestrator/src/research/provider.ts` defines the interface —
  `researchBook(input: { bookRef, brief, envelopeUsd }) → RawResearch` — and a provider
  registry with one implementation now: `anthropic-web-search`, built on the existing
  guarded call path with the provider's server-side web-search tool enabled, capped
  `webSearchUses`, reserved search-content tokens, and the actual search count recorded
  into the ledger's existing `toolUses` field. Adding a second provider later (an OpenAI
  deep-research route, a different vendor) is a new registry entry implementing the same
  interface — the venture never couples to a vendor.
- Model roles in `config/models.json`: `RESEARCH_GATHER` (Haiku — retrieval and
  source-grounded extraction, ≤8 searches, large search-content reservation),
  `RESEARCH_SYNTH` (Haiku — dossier normalization + story mining), `CLAIM_CHECK`
  (Haiku, ≤3 searches — the escalation call), `FOLIO` and `PLOT` (Sonnet). Every call
  under the $0.10 per-call cap by construction; a gathering call that would exceed it
  splits its brief.
- Everything else is reused: seed and dossiers are venture state; results are
  owner-entered; rendering is the Design Lab; trend context is GoVIRAL. No Apify, no
  scraping, no new credentials — the research provider rides the existing Anthropic key.

## 8. Content generation workflow — the decision hierarchy

The commission's product principle, implemented as four widening funnels, each cheaper
than the next stage it feeds:

1. **Seed library (≈200 books, ~$0 to hold).** `bh-seed/1` records with exactly the
   cheap fields: title, original title, author, year, language, genres, Czech and
   international relevance, recognition and significance priors, storytelling-potential
   prior, audience-familiarity priors per lane, candidate content categories, cover
   reference (admin-only), provenance, author dates (they power anniversaries). Seeded
   once at implementation time as an authored, reviewable artifact — priors are labeled
   priors, not facts; no dossiers, no biographies, no AI essays. A `bh:seed` CLI
   validates and appends later additions.
2. **Deterministic shortlist (daily, $0).** Opportunity score = weighted blend of the
   seed priors × anniversary proximity (publication and author dates → 25/50/75/100/150
   boosts) × GoVIRAL trend crossover × diversity pressure (recent genres, geographies,
   periods, angle types get penalized) × lane performance history (owner-entered) ×
   **shelf bonus** (an existing dossier with unused story candidates is the strongest
   single boost — paid knowledge posts first). Every factor is recorded on the shortlist
   entry so the meeting, and the admin, see *why* a book ranks.
3. **Editorial meeting (one Sonnet call).** FOLIO argues the top-10 down to 2 (3 with
   headroom), writes each survivor a tailored research brief — objective, specifics to
   investigate, what to look for, what to avoid, exactly the commission's example shape,
   generated from the seed record and the venture's angle history so no two briefs are
   the generic "tell me interesting facts" query.
4. **Research → dossier → story → twin packages** (§4 Days B–C). The dossier is the
   asset; the post is a withdrawal from it.

## 9. Admin experience

Workspace `/admin?venture=booksofhistory`, three tabs:

- **`shortlist`** — today's ranked candidates with their factor breakdowns (why this
  book, visibly), the meeting's decisions and briefs, cycle state ("Day B of cycle 14:
  researching 2 of 2"), and the anniversary radar for the next 60 days.
- **`dossiers`** — the knowledge shelf: per book, claims with verification badges and
  sources, story candidates with scores and used/unused state, quotes, the research
  ledger lines (provider, cost, reason, requesting meeting, used-or-not), and the
  venture's research-efficiency figure (dossiers that became posts ÷ dossiers paid for)
  rendered honestly (`null` before there is a denominator).
- **`features`** — the approval queue, the shared recommendation-card surface: both
  language packages side by side, the story brief, the claims table with badges, gate
  results, Design Lab handoff, approve / edit / reject, posted-URL and results entry,
  RatingWidget.

## 10. GoVIRAL and Design Lab — the shared spine (all ventures)

Standing rule, applied here and retrofitted to the sibling programs: **every BoardlessAI
venture is fully connected to GoVIRAL and the Design Lab.** Concretely, a venture is
"connected" when all four hold:

1. **GoVIRAL scouts for it** — `config/goviral-sources.json` `topicSets` gains a set per
   venture (for BOOKSOFHISTORY: book-history, literary-anniversary and publishing-story
   terms in both languages), so the Monday scout reads the market for every venture at
   no extra recipe cost.
2. **The venture reads the brief** — its runner consumes the latest recorded GoVIRAL
   plan as deterministic context (here: trend-crossover boosts in the shortlist and a
   "cultural moment" flag the meeting sees).
3. **Agendas flow both ways** — `config/meeting-policy.json` transitions let `gv-brief`
   hand one agenda to the venture's room and the venture's room file one back.
4. **The Design Lab is the only rendering path** — a venture brand token set, the
   recorded carousel summary as the studio handoff, and every visual deterministic. No
   venture ever grows a private rendering path.

BOOKSOFHISTORY adds the bilingual wrinkle: each feature writes **two** recorded
summaries (locale `cs` and `en`) under the same slug, so both language decks sit side by
side in the studio rail with all 23 families and export paths. The summary contract's
per-record locale (introduced by whichever sibling build lands first) covers this.

## 11. Automation opportunities

Ranked: the **shelf-first shortcut** (§8's shelf bonus — the single biggest cost lever);
series formats as recurring franchises ("Rejected", "Banned", "First Editions",
"The Advance Was Terrible") driven by story-candidate tags, because repeatable formats
are what social growth compounds on; derivative packages from the same dossier (quote
card, thread, single-fact card — no new research, gate-checked against the same claims);
the anniversary calendar auto-proposing cycle timing weeks ahead; supplemental
"freshness" calls (≤$0.05, capped) when a shelf dossier is chosen after 90+ days —
stable history is reused, only the time-sensitive layer refreshes; cross-venture
crossovers (a Czech classic for DNESKAi's audience, a music memoir for Door Money's);
and — post-triple-lock — queued autopublish per lane behind the venture's own unlock
counter.

## 12. Human approval requirements

`HUMAN_APPROVAL` items at founding:

1. **BH-RESEARCH-001** — the research provider: web-search-enabled calls on the
   existing Anthropic key, per-call search caps, the per-cycle research envelope
   (≤ $0.50) and monthly research ceiling (≤ $5.00 inside the model share), the
   research ledger, and the idempotency rules. No new account, no new credential.
2. **BH-SEED-002** — the seed library as an authored artifact with prior-not-fact
   labeling, and the no-cover-art rule (references admin-only, never rendered).
3. **BH-ACCOUNTS-003** — the two profile lanes (CS and EN) on the owner's chosen
   platforms, handle clearance for BOOKSOFHISTORY, AI-disclosure bio line; drafts-only
   until signed.
4. **BH-RESULTS-004** — owner-entered per-post results as the venture's only
   measurement, inside the D9 hold.

## 13. Metrics and KPIs

`growth_objective`: "Turn cheap candidate intelligence into researched, verified,
twice-told book stories" with components `feature-cadence` (one feature per cycle,
cycle-aware evaluator) and `research-efficiency` (used ÷ paid dossiers) — both new enum
members, priced into the build with fixtures and evaluator honesty (`null` until
denominators exist). KPI seeds: cycle completed or honestly stretched ≥ 90% of cycles;
≥ 8 features/month at the 3-day default; research-efficiency ≥ 0.7 after month one
(the commission's "12 researched, 7 posted" learning loop, as a number the board sees);
verification: 100% of published claims carry a state, and zero published claims in the
`legend` state stated as fact; model spend ≤ $8/month for the venture.

## 14. Feedback loops

Owner ratings → PALATE → FOLIO's meeting packet. Owner-entered lane results →
per-category/era/geography weights in the shortlist scorer (bounded, floor-protected,
adjusted only by a recorded proposal citing result ids — the shared mechanism). The
research ledger closes the venture's own loop: used-flags backfill when a package
publishes, the efficiency figure confronts the meeting monthly, and FOLIO's selection
prompt carries the last month's hit-rate by category so candidate selection learns
where research money converts. Verification states close the credibility loop: a claim
demoted after publication forces a correction package, same as the sibling ventures.

## 15. Scaling strategy

Cadence is the throttle: 3-day → 2-day → daily by raising the research ceiling, with the
shelf making each step cheaper than linear (mature shelf = many cycles that skip
research entirely). Lane expansion after the two launch lanes prove: TikTok/Reels
scripts from the same story briefs (owner-recorded, phase 2), a third language lane is
structurally free above the dossier (the language-neutral layer was the point). Format
franchises grow follow-through; anniversary seasons (a "1926 centenary month") turn the
calendar into campaigns. Autopublish per lane once counters, credentials and the global
switch align. The seed library itself scales by appends — 200 is a starting shelf, not
a cap — and the scorer's diversity pressure keeps the feed from collapsing into the
same ten famous books.

## 16. Risks and safeguards

- **Fake trivia** — the core occupational hazard; the claim triage + escalation +
  verification states + "legend, as legend" publishing rule (a great unverifiable story
  may run *labeled as legend*, never as fact) turn it into the brand's edge instead.
- **Copyright** — no cover art rendered, ever (test-enforced); quotes capped at 300
  characters with attribution; long excerpts never ship.
- **Research cost drift** — per-call caps, per-cycle envelope, monthly research
  ceiling, the ledger with used-flags, and the efficiency KPI staring at the board.
- **Cycle stall** — the state machine resumes phases instead of skipping; a cycle that
  cannot afford research stretches or falls back to the shelf; a truly empty day is an
  honest $0 record.
- **Repetition** — diversity pressure in scoring, story-angle cooldowns, the
  recommendation history duplicate gate.
- **Living persons** — modern authors are public figures; claims about them follow the
  same on-record sourcing rules as the politics venture; no health/private-life
  material regardless of sourcing.

## 17. Technical architecture

`orchestrator/src/ventures/booksofhistory/`: `run.ts` (dispatched from `cycle.ts`;
reads/advances the cycle state machine), `score.ts` (deterministic shortlist),
`briefs.ts` (brief assembly around FOLIO's meeting output), `research.ts` (calls the
provider module, writes dossiers + ledger, idempotency by `(bookId, briefHash)` with an
in-flight lock), `verify.ts` (claim triage rules + escalation call + state
transitions), `produce.ts` (story brief + twin packages + gates), `state.ts` (cycle
machine, one writer). Shared: `orchestrator/src/research/provider.ts` (the venture-
agnostic interface + anthropic-web-search adapter — deliberately outside the venture
folder so the next venture reuses it). Prompts under `orchestrator/prompts/
booksofhistory/` (folio, plot, research-gather, research-synth, claim-check, craft).
Site: `admin-booksofhistory.ts` loader + three panels + API routes on the standard
ladder. Studio: `booksofhistory` brand tokens + summary venture with per-record locale.

## 18. Database / data-model implications

Contracts (valid + poison fixtures each): `bh-seed/1` (the library; priors labeled),
`bh-shortlist/1` (daily scored ranking with factor breakdowns — recorded so admin and
meeting see the same numbers), `bh-research-brief/1`, `bh-dossier/1` (claims with id,
text, sources, source category, confidence, corroboration, verification state
`verified | probable | single-source | legend | rejected`, publication suitability;
story candidates with angle, score, claim refs, used-state; quotes; visual notes; raw
provider response retained beside the normalized form), `bh-research-ledger/1`
(provider, model, timestamps, book, reason, tokens, searches, cost, requesting meeting,
used-flag), `bh-cycle/1` (the state machine), plus the shared
`venture-recommendation/1` gaining `evidence.kind: "dossier-story"` and the shared
`owner-result-entry/1` and weights files. State:
`state/ventures/booksofhistory/{seed,shortlists,briefs,dossiers/<bookId>/,
research-ledger.jsonl,cycle.json,recommendations,results,playbooks}` — dossiers under
one writer, append-preferring, raw responses beside normalized truth.

## 19. Background jobs and scheduling requirements

One slot: 12:00 Prague, two DST cron variants in `site/vercel.json`, phase `bh-desk`
through the standard plumbing (types, meeting-record enum, cycle.yml, meeting-policy,
backstop sweeps). Degradation: research trims 2→1 candidates, then the cycle stretches,
then `bh-desk` drops — after the Door Money rooms, before `gv-brief` is restored to its
ladder position relative to the magazines, and always before any reader-facing promise.
The registry's envelope arithmetic and `system-audit.test.ts`'s actual assertions are
verified at build time, not assumed.

## 20. Implementation phases

`BH-01…`-shaped checkboxes in the founding decision, one commit each: Phase A founding
records + registration + agents + cycle state machine skeleton (dry holds, $0). Phase B
seed library + scorer + shortlist records. Phase C the research provider module +
dossier store + ledger + idempotency (fixtures first, live behind BH-RESEARCH-001).
Phase D verification triage + escalation + states. Phase E production: story brief,
twin packages, gates, recommendation records. Phase F admin tabs + Design Lab
(bilingual summaries). Phase G GoVIRAL spine (topicSets, brief consumption,
transitions) + results/weights + docs + NEEDED + honest-gaps + prompt deletion.

---

## What this does not touch

The $30 / $25 / $1.00 ceilings. The social triple-lock — drafts-only, no channels, no
credentials, publisher refuses by name. Treasury and payments.
`METRICS_INGESTION_ENABLED=false` — owner-entered results only. The magazines' truth
gates and delivery paths. GoVIRAL's Apify recipe and quota (the topicSet additions ride
free signals). The Design Lab's determinism. The Kvórum and Door Money designs, except
the shared contracts they were already designed to share. BoardlessAI corporate brand.
The mirrored skill directories.

## Open questions for the owner

1. Handle clearance: is `booksofhistory` available where it matters, and should the
   Czech lane run under the same handle with a `.cz` suffix or its own name?
2. Lane priority: launch both lanes at once, or English first (bigger pool, faster
   signal) with Czech two weeks behind?
3. Is the 3-day cycle right for launch, or start at 4 days and tighten once the shelf
   has stock?
4. Seed canon: any must-include books or hard exclusions before the 200 are authored?
