# Tehdejší svět adoption founding

Date: 2026-08-12

Decider: Lukas Kouril, owner

Status: pending owner countersignature

Decision id: `tehdejsi-svet-2026-08a`

Supersedes: nothing. Extends the owner-directed founding precedent in
`goviral-2026-08a`, `marketingshark-2026-08a` and `booksofhistory-2026-08a`.

Owner-commissioned on 2026-08-12 through the Tehdejší svět implementation program.
Code may be built and proved with labelled fixtures while this decision is pending.
Nothing runs live until the owner countersigns this record and resolves the applicable
approval items. A missing approval always selects the safer, `$0`, drafts-only path.

Every ceiling from `budget-2026-08e` is untouched: `$30` all-in each month, a `$25`
model/API share and a `$1.00` daily pace. The per-call ceiling remains `$0.10`.
Tehdejší svět adds a research ceiling of at most `$0.30` per brief and `$2.00` per
month; both are lower fences inside the signed portfolio limits, never replacements for
them. Truth gates, the social triple-lock, treasury rules, append-only decisions and
`METRICS_INGESTION_ENABLED=false` remain unchanged.

## The venture

Tehdejší svět (`tehdejsi-svet`) is the first **adoption**: the product already exists
and already works. `lukaskourilcz/dontwannaknow` is a client-only Czech application that
reconstructs the historical world a person grew up in, for Czechia and Ukraine, from
curated deterministic data with no runtime AI and no backend. BoardlessAI adopts its
**marketing**, not its code.

The venture turns that curated past into bilingual family conversations. A committed,
hash-verified snapshot of the product's public data routes attention. A deterministic
scorer ranks story candidates. `ts-desk`, daily at 18:00 Prague, walks a two-day cycle:
LETOPIS plans and writes the Czech feature, VERBA writes an independent native Ukrainian
adaptation of the same canonical brief. Both remain recommendation drafts until the owner
approves them, renders them through the Design Lab and posts them by hand.

The editorial filter is the product's own stated moment of value: **a concrete, honestly
framed fact the reader wants to ask a loved one about.** A candidate with no one to send
it to and no askable question fails, however interesting.

## Adoption terms

- **The product repository is read-only to this venture.** No module here writes to,
  pushes to or opens a pull request against `lukaskourilcz/dontwannaknow`. A test pins
  it. Product changes travel only as product-insight queue entries the owner acts on.
- **The product's own flags are honoured structurally.** Records marked
  `shareSafe: false` — every leader profile among them — and city images marked
  `excluded` are omitted when the snapshot is built, not filtered later at use.
- **The snapshot is committed, not fetched.** The venture reads a committed,
  hash-verified snapshot of the product's public data, the way marketingShark reads its
  question bank. The daily room never touches the network. See *Adapted during
  implementation*.
- **Marketing research never becomes product data.** Dossiers written here are venture
  assets. When research produces something the product should have, it becomes a
  product-insight queue item; only the owner carries it through the product's own
  editorial and provenance process.

## Bilingual, sensitivity and licence gates

- Czech and Ukrainian are **independent editorial passes** over one canonical,
  language-neutral story brief. VERBA receives the Czech copy as reference with an
  explicit anti-mirror instruction; a sentence-by-sentence mirror fails the gate.
  Research and snapshot reads are never repeated to produce the second language.
- Sensitivity runs in three tiers. Tier 0 is everyday culture. Tier 1 carries political
  context and requires the everyday-versus-system distinction, sourcing and register
  checks. Tier 2 — 1968, the Second World War, the Holodomor, deportations, Chornobyl,
  collaboration and the current war — sets a blocking human-review flag, bans
  participation calls to action and light formats, and requires two independent sources
  per claim. Excluded categories cannot be drafted at all.
- Ukrainian cities under attack or occupation are handled as remembrance. No
  then-versus-now destruction contrasts, and no engagement optimisation on those
  features.
- National flags are not brand elements, in slides or in bios. No AI-generated
  historical imagery, ever. Leader profiles are context, never post subjects.
- Licensed imagery renders only with its attribution: the ShareAlike obligation travels
  onto the card. A licensed photo without an attribution string fails the slide.
- Every factual sentence in both languages resolves to a snapshot record or a dossier
  claim. Records the product still marks `review-needed` — the whole of `cityFacts`
  today — publish only in single-source framing.

## Cost declaration

Per two-day cycle: planning about `$0.06`, the Czech and Ukrainian passes about `$0.15`
together, and a Sunday insights overlay about `$0.06` a week. Roughly thirteen cycles a
month is about **`$2.90` of model spend**, plus research at most `$2.00` a month against
the venture's `$4.00` target. A research-heavy month may reach about `$5.00` in total.

Snapshot building, scoring, clustering, gates, rendering, records and every admin read
are deterministic and cost nothing. There is no cash cost anywhere in this design: the
snapshot is a committed file and the venture buys no data.

## Human approval gates

1. **TS-SNAPSHOT-001** — the committed snapshot read layer: an owner-run CLI over a
   local clone of the product repository, the build-time exclusion rules, the
   hash-verified loader, and the standing term that nothing writes to the product
   repository. `$0`.
2. **TS-MEDIA-002** — the deliberate divergence from the product's internal rule: the
   nineteen licensed city photographs may appear in social cards with on-slide
   attribution and licence-respecting captions, exclusions honoured. The product's own
   share images are unchanged.
3. **TS-ACCOUNTS-003** — the venture's Instagram, Facebook and Threads accounts, handle
   clearance, and the bilingual bios. Drafts-only until countersigned. The product's
   production domain must land first; `dontwannaknow.vercel.app` never appears in a bio.
4. **TS-RESEARCH-004** — research within the shared provider: at most `$0.30` a brief and
   `$2.00` a month, the standing Ukrainian-gap, names and music priorities, and the
   marketing-research-is-not-product-data boundary.
5. **TS-RESULTS-005** — owner-entered per-post results and owner-pasted comment harvests
   as the venture's only measurement, inside the D9 hold. The product's analytics stay
   untouched and unwired; no tracking script is added anywhere.

## Implementation checklist

- [x] **TS-00** — Phase 0 audit across both repositories
- [x] **TS-01** — Write the founding decision record
- [ ] **TS-02a** — Registry entry in `config/ventures.json`
- [ ] **TS-02b** — Registry schema enum extensions and fixtures
- [ ] **TS-03a** — Register the `ts-desk` phase in type and record schemas
- [ ] **TS-03b** — Meeting policy for `ts-desk`
- [ ] **TS-03c** — `cycle.yml` dispatch choices and mode gates
- [ ] **TS-03d** — Vercel cron entries for the 18:00 slot
- [ ] **TS-04a** — LETOPIS and VERBA in registry, routing, controls and cast schema
- [ ] **TS-04b** — Prompts for LETOPIS, VERBA and the craft file
- [ ] **TS-04c** — Model roles for LETOPIS and VERBA
- [ ] **TS-05a** — Cycle state machine and runner dispatch
- [ ] **TS-05b** — Scaffold, hue, labels, KPI seeds and ladder position
- [ ] **TS-06a** — `tehdejsi-snapshot` contract
- [ ] **TS-06b** — Build-rule exclusion tests (`shareSafe`, excluded media)
- [ ] **TS-07** — The `tehdejsi:sync` CLI
- [ ] **TS-08** — Snapshot loader with hash verification and cache
- [ ] **TS-09a** — The social opportunity scorer
- [ ] **TS-09b** — Shortlist records
- [ ] **TS-10a** — Research reuse with venture ledger and ceilings
- [ ] **TS-10b** — The product-repo read-only pin
- [ ] **TS-11a** — Sensitivity tier classifier and tier effects
- [ ] **TS-11b** — Terminology table and its checks
- [ ] **TS-11c** — Wartime-remembrance, no-flags and no-AI-imagery lints
- [ ] **TS-12** — `venture-recommendation` evidence kind `tehdejsi-story`
- [ ] **TS-13** — Day A planning call and briefs
- [ ] **TS-14a** — Day B bilingual production with the anti-mirror rule
- [ ] **TS-14b** — Production gates for both languages
- [ ] **TS-15a** — Cyrillic-complete committed fonts
- [ ] **TS-15b** — Glyph-coverage test for the Ukrainian alphabet
- [ ] **TS-16** — Brand tokens from the product's export palette
- [ ] **TS-17a** — The bilingual family kit: slots and devices
- [ ] **TS-17b** — Photo slide variant with mandatory attribution
- [ ] **TS-17c** — Render module and recorded summaries
- [ ] **TS-18** — Studio bilingual determinism test
- [ ] **TS-19** — Admin approval write path with the tier-2 review gate
- [ ] **TS-20a** — Server-only admin loader
- [ ] **TS-20b** — Features panel with bilingual packages
- [ ] **TS-20c** — Library panel with snapshot state
- [ ] **TS-20d** — Signals panel, tab wiring and e2e
- [ ] **TS-21a** — Community signals: contract and extraction
- [ ] **TS-21b** — Product-insight queue, seeded with the five audit findings
- [ ] **TS-22a** — GoVIRAL spine: topic set and timing factor
- [ ] **TS-22b** — GoVIRAL spine: transitions and the Design-Lab-only test
- [ ] **TS-23a** — Owner results per platform
- [ ] **TS-23b** — Weights, used-flags and the experiment ladder
- [ ] **TS-24a** — Documentation truth across the standing docs
- [ ] **TS-24b** — INBOX approvals and NEEDED owner items
- [ ] **TS-24c** — Honest gaps, checkbox sweep and spec deletion

## Adapted during implementation

- **The snapshot is a committed file, not a runtime fetch.** The implementation spec
  described a snapshot index plus a runtime fetcher that read record bodies from the
  product repository at a pinned commit through the GitHub Contents API. The owner
  directed the marketingShark pattern instead: an owner-run importer reads a local clone
  and writes one committed, hash-verified snapshot, and the daily room reads only that
  file. This is strictly better here — the room needs no network, no token and no rate
  limit, the day is reproducible offline, and a hand-edited snapshot aborts instead of
  serving records its envelope no longer describes. `api.github.com` therefore gains no
  new runtime use, and TS-08 became the loader rather than a fetcher.

## Honest gaps

- **Short-form video is not built.** Reels and TikTok scripts remain a day-60 decision
  in the strategy record. There is no video contract, no platform-specific safe area,
  no account and no credential.
- **Community memory is owner-pasted, not collected.** Nothing scrapes comments and no
  comment API is wired. The signals path accepts what the owner pastes and nothing else.
- **The names and music datasets are venture research only.** Neither is written into
  the product; both surface as product-insight entries.
- **Ukrainian website localisation is not in scope.** It is recorded as a possible
  future product direction and nothing here assumes it.

## Closeout and owner handoff

After countersignature the owner: resolves the five approval items; lands the product's
production domain so a bio can name it; clears the handles and creates the accounts;
runs `pnpm tehdejsi:sync` against a local clone of the product repository to build the
first snapshot; approves the first content bank in `/admin`; and posts by hand.

## What this does not touch

The `dontwannaknow` repository — no writes, ever. The product's privacy architecture,
its no-runtime-AI rule, its monetisation limits and its editorial gates. The
`$30 / $25 / $1.00` ceilings, the publisher, social unlock counters, credentials,
accounts, channels, autopublish, treasury or payments. Engagement ingestion stays off.
The magazines' evidence, release and delivery paths are unchanged. GoVIRAL's Apify
recipe and quota are unchanged. The Design Lab remains the only rendering path and the
existing ventures' deterministic output remains byte-identical.

## Owner countersignature

Selection: [ ] Found Tehdejší svět under this decision  [ ] Do not found

Name: ____________________

Date: ____________________

Signature / explicit approval reference: ____________________
