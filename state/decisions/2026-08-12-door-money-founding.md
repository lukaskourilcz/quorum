# Door Money founding

Date: 2026-08-12

Decider: Lukas Kouril, owner

Status: pending countersignature

Decision id: `door-money-2026-08a`

Supersedes: nothing. Extends the founding precedent set by `goviral-2026-08a` and
`marketingshark-2026-08a`.

Owner-commissioned on 2026-08-12 through
`docs/DOOR-MONEY-CODEX-BUILD-PROMPT.md`. Every ceiling from `budget-2026-08e` —
$30 all-in a month, a $25 model share and a $1.00 daily pace — is untouched. So
are every truth gate, the social triple-lock, the treasury rules and the
publisher. Door Money may prepare drafts and owner-review packets. It may not
post, create an account, touch a channel, send outreach or pay for anything.

## Door Money is founded

Door Money is an English-language book-storytelling venture. It turns privately
held source material into evidence-linked draft recommendations, then turns an
approved recommendation into a draft carousel or action packet. The venture is
drafts-only: owner approval records a decision, but never causes publication or
outreach.

- Registry: `id: door-money`, `status: operating`, `taste: true`, ledger
  namespace `door-money`, admin tabs `recommendations`, `actions` and
  `knowledge`.
- `dm-desk` opens daily at **15:00 Prague**. GHOST drafts; AUDIT vetoes. Its
  meeting envelope is `$0.08`.
- `dm-growth` fires daily at **16:00 Prague**, but code permits paid work only on
  Thursdays. BOOKER drafts; PULSE reads performance; AUDIT vetoes. Its meeting
  envelope is `$0.06`.

The Thursday rule is a deterministic gate in the runner, following GoVIRAL's
Monday precedent. Off-day firings write an honest `$0` record and make no model
call.

## The manuscript boundary is a founding term

**This public repository never carries the manuscript, full-text chunks or
their embeddings.** Private source text and vectors remain in the configured
private store. Public, committed derivatives are schemas, hashes, counters,
scores, labels and bounded excerpts only. A committed excerpt is capped at 600
characters. Style exemplars are capped at 40 entries of 280 characters each.
Fixtures use synthetic prose and never real book text.

Crossing those caps is the program's one irreversible mistake. The limits are
enforced at contract, writer and test boundaries; a private-store or approval
failure must stop the workflow rather than invite a public fallback.

## Approval and spend remain owner decisions

The program may add exactly the review items described in its work order:
`BOOK-SOURCE-001`, `BOOK-INGEST-002`, `DM-ACCOUNTS-003` and `DM-RESULTS-004`.
They remain pending until the owner resolves them. None is permission to infer a
credential, open an account, publish a draft or contact a person.

The ingestion allowance is a ceiling, not a target: `$0.80` per day, `$3.00`
total and `$0.10` per paid call. Every paid operation reserves before the call
and records after it through the existing budget ledger. There are no new fixed
costs and no treasury action in this decision.

## Adapted during implementation

- **DM-00 sequencing.** The audit issue required no file changes while the
  program required a commit for every issue and a checked item in this record.
  DM-00 therefore completed in the empty commit `aaca1d5`; its checkbox first
  appears checked in DM-01, when this record begins to exist.
- **The default branch already held both Door Money design documents.** The
  conditional docs-only branch merge was not needed.
- **The live baseline is seven projects, 42 registered agents and 33 active
  agents.** Door Money therefore targets 44 registered and 35 active agents,
  rather than assuming an unlanded sibling-program roster.
- **The proposed shared recommendation, owner-result and performance-weight
  artifacts were not present on the audited default branch.** Door Money owns
  their initial shared implementations; no sibling implementation is guessed.
- **`api.github.com` was already in the runtime network allowlist.** The program
  will use the existing entry and will not add a duplicate.
- **The audited Vercel schedule had 28 cron entries and the repository's pinned
  production limit is 100.** Adding the two Door Money hours in both DST forms
  takes the count to 32; the design note's 40-entry premise is not the live
  contract.
- **The existing conservative daily-envelope test has only `$0.02` of arithmetic
  headroom.** Door Money's `$0.14` cannot be added to that all-rooms-at-once sum.
  DM-05c must model the real weekday gates and degradation order while preserving
  the signed `$1.00` ceiling; it may not relax the ceiling to make the test pass.
- **Title order exposes temporary Phase A registration gaps.** DM-02a introduces
  the registry values before DM-02b extends the closed component, tab and cast
  enums. GHOST and BOOKER remain absent from agent configuration and routing until
  DM-04a. The full gate is restored at the Phase A boundary; no intermediate issue
  is represented as validated when its dependency has not landed.
- **The architecture inventory and persona loader assumed every prompt was a
  root-level Markdown file.** DM-04b requires a Door Money prompt directory, so the
  inventory now walks prompt directories, registers the two previously hidden
  marketingShark runtime prompts, and persona resolution explicitly maps GHOST and
  BOOKER there. Runtime prompts remain repository files and never load skill files.
- **The site duplicated the agent, meeting and public-calendar unions outside the
  shared contracts.** The DM-05a admin render failed at server startup even though the
  orchestrator schemas were already extended. The site copies now recognize both Door
  Money rooms and agents, price GHOST through its dedicated role, and render the venture's
  label and hue; this is display plumbing only and does not open either room.
- **The design names an approval trend and a passage-depletion watch without numeric
  quarterly bars.** The KPI contract accepts only nonnegative readings, so DM-05b records
  approval trend as a `1|0|null` boolean target and passage use as an at-most `0.80`
  depletion watch. Cash and model spend remain separate KPIs because `$0` and `$3` are
  separate promises; absent measurements remain `null`, never manufactured zeros.
- **Phase A acceptance arrives before the full desk and growth runners in title order.**
  DM-05c therefore adds a fixture-only Door Money dispatcher that records truthful `$0`
  `NO_ACTION` rooms and keeps live mode paused; DM-14b and DM-19 replace those scaffold
  paths with the gated runners. The phase-boundary run also found that the standup schema
  rejected DM-05b's honest `null` KPI readings and that two ideation tests pinned rotation
  dates whose modulo changed when Door Money joined. The schema now preserves `null`, and
  the tests resolve their named venture from the live ring without changing rotation.
- **The Phase A site gate exposed three more closed copies of pre-Door-Money state.**
  The punctual cron parser omitted both registered phases, the public fixture test still
  pinned 42 agents, and the Czech-only magazine guard also rejected Door Money's required
  English owner-review drafts. The parser and roster assertion now match the canonical
  registries; the language guard exempts only GHOST's three approved draft phrases and still
  rejects every English article, edition or localization claim.
- **The shared valid meeting fixture became Door Money's contract exemplar in DM-03a.**
  Social-pack tests had implicitly depended on that shared union fixture remaining a Caught Up
  edition meeting, so the Phase A gate rejected all pack composition. Those tests now build an
  explicit synthetic Caught Up meeting locally; the Door Money fixture remains synthetic and no
  real book text is introduced.
- **The full Phase A site e2e found four pre-existing low-contrast labels on the shared
  rendered-desk panel.** Door Money's own admin route passed, but the required all-site gate
  exercises the global route too. Only those four `#71717a` labels were raised to the existing
  `#a1a1aa` neutral; their wording and every venture behavior remain unchanged.
- **The historical WeekBoard e2e expected a future `scheduled` cell forever.** Public calendar
  feeds recompute an unrecorded slot against the current clock, so that assertion became false
  once the saved August week was wholly past. The navigation test now requires recorded held and
  missed states without manufacturing a permanently future meeting.
- **Four more Phase A e2e assertions had frozen mutable fixture counts or old route copy.** The
  MMA archive check now proves every currently rendered hero loads instead of pinning five, and
  the launch-binder journey proves its fixture is present without assuming it is the only ready
  plan. Login checks allow the current fail-closed `returnTo=/admin` parameter, while the plain-copy
  guard no longer mistakes the legitimate Threads and Instagram channel labels for leaked agent
  codenames; FRAME, SCRIBE and HERALD remain forbidden.
- **DM-10a's amended issue names an owner-created book database, while all three
  higher-precedence program records require the configured private store.** The design explicitly
  rules out a vector database, and the build prompt assigns private-store persistence to DM-11.
  The guarded wrapper therefore performs no persistence: it returns vectors in memory for the
  later DM-11 client, and no vector or source text is written to this public repository.
- **The DM-10b ledger-kind audit found four production readers and no need for the
  permitted fallback.** Image daily/monthly caps and the quarterly media KPI intentionally select
  only `image`; budget alerts and the daily digest classify `text` and `embedding` together as
  model cost. All four now use the shared kind helpers, and the wrapper records `embedding`.
- **DM-11a's amendment repeats the lower-precedence database substitution and adds a
  schema migration, but the build contract requires a private clone and explicitly rejects a
  vector database.** The CLI therefore introduces a fail-closed private-store interface instead
  of database credentials or tables. Dry ingestion uses an in-memory implementation at `$0`;
  live mode remains refused until DM-11b installs the private-clone writer and the two ingestion
  approvals are countersigned. Local ignored manuscript input remains one supported source path.
- **DM-11b's amended database client, credentials and host-pinning work are the same
  lower-precedence substitution.** Following the founding term and build contract, the completed
  split writes raw chunks, annotations and vectors only to an owner-provided local private clone;
  the public state receives contract-validated derivatives and version pointers. No database
  hostname was added to the network allowlist, and no `BOOK_DB_*` credential or table was created.
- **DM-12's amended issue replaces the specified private-store link with a database key.** The
  higher-precedence design and build contract require chunk references plus a private-store link,
  so `book-passage` evidence carries both immutable chunk ids and a credential-free
  `private-book://` pointer bound to the manuscript hash and excerpt chunk. It is not a public URL,
  repository link or credential, and the contract rejects links that disagree with the evidence.
- **DM-14a's amendment again substitutes a book database for the private store fixed above.**
  Packet assembly therefore reads the immutable DM-11b local-clone layout through a narrow
  private-store interface, validates its version, and caches chunk and embedding reads for the
  cycle. No database host, `BOOK_DB_*` credential or external request was added. Missing or
  inconsistent private knowledge returns the recorded `$0` fixture-required path without
  exposing a local path; the private root is refused if it sits inside this public repository.
- **DM-14b's packet wording leaves two selected chunks plus four full neighbors competing with
  the configured 8,000-token GHOST input cap.** The private in-memory packet still fetches and
  holds each complete selected chunk and both complete neighbors. Its provider view keeps the
  complete selected text but reduces each neighbor to the adjacent 1,000-character continuity
  edge, deduplicates overlaps, and omits duplicate score and exemplar payloads. Both selected
  passages therefore survive without weakening the model cap. Ungated GHOST output is never put
  in the public response cache; its ledger hash prevents a paid uncached call from being repeated.

## Delivery ledger

- [x] DM-00 — Phase 0 audit: read the contracts, verify every assumption
- [x] DM-01 — Write the founding decision record
- [x] DM-02a — Registry entry in config/ventures.json
- [x] DM-02b — Registry schema enums, fixtures and the action-completion evaluator
- [x] DM-03a — Register dm-desk and dm-growth in type and record schemas
- [x] DM-03b — Meeting policy for both rooms (Thursday gate lives in code)
- [x] DM-03c — cycle.yml dispatch choices and mode gates
- [x] DM-03d — Vercel cron entries for 15:00 and 16:00
- [x] DM-04a — GHOST and BOOKER in registry, routing, controls and cast schema
- [x] DM-04b — Prompts for GHOST, BOOKER and the craft file
- [x] DM-04c — Model roles: GHOST, BOOK_INGEST, BOOK_STYLE
- [x] DM-05a — Scaffold, gitignore line, hue and labels
- [x] DM-05b — KPI seeds for the quarter
- [x] DM-05c — Degradation-ladder position with its test
- [x] DM-06a — book-kb-index contract and fixtures
- [x] DM-06b — style-profile contract and fixtures
- [x] DM-06c — The excerpt-cap boundary test
- [x] DM-07 — Deterministic scene-aware chunker
- [x] DM-08a — Annotation and fifteen-axis scoring pass
- [x] DM-08b — Ingestion cursor and resumability
- [x] DM-09 — Style profile via map-reduce
- [x] DM-10a — Guarded embeddings wrapper
- [x] DM-10b — Budget-ledger kind for embeddings
- [x] DM-11a — The book:ingest CLI with envelopes
- [x] DM-11b — Public/private output split and manuscript-hash idempotency
- [x] DM-12 — venture-recommendation evidence kind book-passage
- [x] DM-13 — Deterministic passage selection
- [x] DM-14a — Packet assembly and the private-store fetcher
- [x] DM-14b — Desk runner, GHOST call and honest records
- [x] DM-15a — Voice lint and stop-slop gate
- [ ] DM-15b — Claim, quote, cap, duplicate and CTA gates
- [ ] DM-16a — Studio brand tokens for door-money
- [ ] DM-16b — English locale in the carousel summary, byte-compatible
- [ ] DM-17 — Admin approval write path
- [ ] DM-18a — Server-only admin loader
- [ ] DM-18b — Recommendations panel
- [ ] DM-18c — Actions panel
- [ ] DM-18d — Knowledge panel, tab wiring and e2e
- [ ] DM-19a — Thursday gate and the rotating agenda wheel
- [ ] DM-19b — Action-packet contract and the BOOKER call
- [ ] DM-19c — Playbook store and the action check-off route
- [ ] DM-20a — Owner results: contract, route, store
- [ ] DM-20b — Performance weights with floors
- [ ] DM-21a — GoVIRAL spine: topicSet and trend boosts
- [ ] DM-21b — GoVIRAL spine: transitions and the Design-Lab-only test
- [ ] DM-22a — Documentation truth across the standing docs
- [ ] DM-22b — INBOX approvals and NEEDED owner items
- [ ] DM-22c — Honest gaps, checkbox sweep, prompt deletion

## Honest gaps

## What this does not touch

The `$30` all-in monthly ceiling, `$25` model ceiling, `$1.00` daily pace,
reserve-before-call discipline or treasury rule that only the owner pays and
only the owner resolves a SPEND item. Any sourcing, evidence, truth, quote,
claim, privacy, quality or cost gate elsewhere in the company. The social
triple-lock and `SOCIAL_KILL_SWITCH`: nothing here posts, schedules, creates an
account, touches a channel or sends outreach. Existing magazine publication,
the Czech single-call article design, repository visibility, billing and plans,
append-only decisions, or another venture program's files and issues.
