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

- **The product repository is not reachable from this venture at all.** Nothing here
  reads, writes, clones or names it; a test fails if any module, prompt, config or
  workflow does. Product changes travel only as product-insight queue entries the owner
  acts on. See *Adapted during implementation*.
- **The product's own flags are honoured structurally.** Records marked
  `shareSafe: false` — every leader profile among them — and city images marked
  `excluded` are omitted when the snapshot is built, not filtered later at use.
- **The facts file is committed by hand, not fetched.** The venture reads one
  hash-verified file of era and history facts, copied here by a human, and the daily room
  never touches the network. See *Adapted during implementation*.
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

1. **TS-SNAPSHOT-001** — the committed facts file: what a human may copy across, the
   structural exclusion rules, the hash-verified loader, and the standing term that
   nothing here reaches the product repository at all. `$0`.
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
- [x] **TS-02a** — Registry entry in `config/ventures.json`
- [x] **TS-02b** — Registry schema enum extensions and fixtures
- [x] **TS-03a** — Register the `ts-desk` phase in type and record schemas
- [x] **TS-03b** — Meeting policy for `ts-desk`
- [x] **TS-03c** — `cycle.yml` dispatch choices and mode gates
- [x] **TS-03d** — Vercel cron entries for the 18:00 slot
- [x] **TS-04a** — LETOPIS and VERBA in registry, routing, controls and cast schema
- [x] **TS-04b** — Prompts for LETOPIS, VERBA and the craft file
- [x] **TS-04c** — Model roles for LETOPIS and VERBA
- [x] **TS-05a** — Cycle state machine and runner dispatch
- [x] **TS-05b** — Scaffold, hue, labels, KPI seeds and ladder position
- [x] **TS-06a** — `tehdejsi-facts` contract
- [x] **TS-06b** — Build-rule exclusion tests (`shareSafe`, excluded media)
- [x] **TS-07** — The committed facts file and its contract
- [x] **TS-08** — Facts loader with hash verification and cache
- [x] **TS-09a** — The social opportunity scorer
- [x] **TS-09b** — Shortlist records
- [x] **TS-10a** — Research reuse with venture ledger and ceilings
- [x] **TS-10b** — The no-product-link guard (inverted from a read-only pin)
- [x] **TS-11a** — Sensitivity tier classifier and tier effects
- [x] **TS-11b** — Terminology table and its checks
- [x] **TS-11c** — Wartime-remembrance, no-flags and no-AI-imagery lints
- [x] **TS-12** — `venture-recommendation` evidence kind `tehdejsi-story`
- [x] **TS-13** — Day A planning call and briefs
- [x] **TS-14a** — Day B bilingual production with the anti-mirror rule
- [x] **TS-14b** — Production gates for both languages
- [x] **TS-15a** — Cyrillic-complete committed fonts
- [x] **TS-15b** — Glyph-coverage test for the Ukrainian alphabet
- [x] **TS-16** — Brand tokens from the product's export palette
- [x] **TS-17a** — The bilingual family kit: slots and devices
- [x] **TS-17b** — Photo slide variant with mandatory attribution
- [x] **TS-17c** — Render module and recorded summaries
- [x] **TS-18** — Studio bilingual determinism test
- [x] **TS-19** — Admin approval write path with the tier-2 review gate
- [x] **TS-20a** — Server-only admin loader
- [x] **TS-20b** — Features panel with bilingual packages
- [x] **TS-20c** — Library panel with snapshot state
- [x] **TS-20d** — Signals panel, tab wiring and e2e
- [x] **TS-21a** — Community signals: contract and extraction
- [x] **TS-21b** — Product-insight queue, seeded with the five audit findings
- [x] **TS-22a** — GoVIRAL spine: topic set and timing factor
- [x] **TS-22b** — GoVIRAL spine: transitions and the Design-Lab-only test
- [x] **TS-23a** — Owner results per platform
- [x] **TS-23b** — Weights, used-flags and the experiment ladder
- [x] **TS-24a** — Documentation truth across the standing docs
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
- **There is no link to the product repository at all.** The owner then narrowed it
  further: this repository borrows marketingShark's *pattern*, not its plumbing. No
  workflow, CLI, clone, token or API call reaches `dontwannaknow` from here. What the desk
  reads is a facts file committed to this repository by hand — the interesting era and
  history facts, copied across once and carrying their own sources — and the room generates
  from that and nothing else. So TS-07 is no longer a sync CLI over a clone but the
  authoring and validation of that committed file, and TS-10b's read-only pin has nothing
  left to pin and is withdrawn. The hash verification stays: a hand-edited facts file must
  abort the room rather than quietly change what it claims.
- **The registered desk held a `$0` slot before its pipeline landed.** Registering the
  venture put `ts-desk` on the clock while the dispatcher still had no editorial branch.
  The first runner therefore recorded a deterministic checkpoint instead of taking the
  daily cycle red. TS-17c joined the existing planning and production modules to that
  runner. While the decision remains pending, a scheduled checkpoint may record the free
  shortlist but leaves planning active with no chosen facts; only the countersigned live
  path writes a canonical brief and advances to production. Advancing the free ranking had
  put production over a brief that did not exist. A manual invocation of the closed room
  still writes nothing. Neither path reads product data or touches a channel.
- **Owner results remain in TS-23a.** The TS-19 and TS-20b issue bodies repeated results
  entry in the approval ladder and feature panel, but the founding checklist and
  implementation design assign the
  shared `owner-result-entry/1` extension, its per-platform store and the `/results`
  route to TS-23a. TS-19 therefore records approval, rejection and owner-posted URLs
  only. This keeps one future result writer behind TS-RESULTS-005 instead of creating an
  early competing contract.
- **Licensed approval requires recorded image bytes.** A media reference and credit do
  not prove the Design Lab can draw the photograph. TS-19 therefore refuses READY until
  a renderable PNG exists at the deterministic venture-media path for that package. The
  preview and ZIP routes read the same bytes and never fetch the source URL. Typographic
  packages need no media file.
- **The library reports copied-facts freshness, not product drift.** TS-20c inherited
  the superseded snapshot request for a product `sourceCommit`, product `rel` scores and
  an automatic drift warning. With the founding decision's no-product-link rule, none of
  those values exists. The panel instead shows the verified facts-envelope hash, exact
  copy age, recorded scorer factors and an explicit warning that only the owner can
  compare sources before replacing the committed file. No synthetic commit or score is
  substituted.
- **The signals tab lands before its record writers.** TS-20d wires the three admin
  tabs and a bounded, serializable signals view, but the ordered checklist assigns the
  community contract and paste route to TS-21a and the product-insight contract and
  seed queue to TS-21b. Until those issues land, the live tab renders explicit empty
  states with no form or endpoint. Synthetic component fixtures prove the eventual
  digest, recurrence and queue layout without creating a competing state shape.
- **Research use is appended, not flipped.** TS-23b calls for used-flags to be
  backfilled at posting, but the existing `ts-research-ledger/1` contract is an
  append-only purchase-and-use ledger. The owner-posted action therefore appends one
  idempotent use receipt for each cited purchase instead of rewriting the purchase
  line. The same issue records the zero-cost experiment ladder in the shared hypothesis
  fields, while its venture guard keeps `maxCostUsd` and `maxLossUsd` at zero rather than
  using the sibling activation helper that requires spend authority.
- **The Sunday learning overlay is deterministic today.** The founding cost declaration
  allowed about `$0.06` for a weekly insights call. The shipped TS-23b implementation
  extracts signals and proposes replay-verified weight revisions in code, so the current
  overlay makes no provider call and spends `$0`. The `$0.25` room envelope, `$4.00`
  monthly model target and research ceilings remain unchanged.

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
reviews the committed facts file the desk reads and adds to it when a season runs thin;
approves the first content bank in `/admin`; and posts by hand.

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
