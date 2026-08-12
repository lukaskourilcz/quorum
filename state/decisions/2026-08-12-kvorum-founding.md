# Kvórum founding decision

Date: 2026-08-12

Decider: Lukas Kouril, owner

Status: pending countersignature

Decision id: `kvorum-2026-08a`

Supersedes: nothing. Extends the founding precedent set by goviral-2026-08a and marketingshark-2026-08a.

Signature / explicit approval reference: ____________________

Owner-commissioned on 2026-08-12 through the Kvórum venture program. This decision
authorizes implementation and dry proof. It does not authorize a live room, an external
source call, account creation or publishing. Missing signatures select the safer behavior.

## Decision

Build `kvorum`, a drafts-only Czech political commentary venture. Deterministic code reads
one approved public-page monitor plus verified Czech news and institutional feeds, normalizes
and clusters the day, and offers the digest to one TRIBUN call. Deterministic gates check
claim references, originality, attribution, public-figure scope and the editorial constitution.
The owner approves, edits or rejects each recommendation. The Design Lab supplies the only
rendering path. No code in this program posts.

The internal id remains `kvorum` if name clearance later changes the public name. The design
defaults to a 21:00 Prague desk, exactly 60 minutes before the night board. Both the public
name and hour remain provisional owner choices while their checklist items are open.

## Authority and closed gates

Every ceiling from `budget-2026-08e` remains unchanged: `$30` all-in per month, `$25` for
model and API use, and a `$1.00` daily pace. Both magazines' truth gates, the social
triple-lock, `METRICS_INGESTION_ENABLED=false`, the treasury rules and human-only payments
remain unchanged. Kvórum cannot treat a venture switch, a model result, a countersignature
on editorial policy or a passing dry run as permission to spend, post, create an account,
touch a channel, ingest engagement data or execute a payment.

Kvórum starts in fixture-only mode. Four separate owner approvals govern its future source
and account scope: `KV-APIFY-001`, `KV-SOURCES-002`, `KV-ACCOUNTS-003` and
`KV-EDITORIAL-004`. `KV-APIFY-001` also depends on the still-pending
`APIFY-ACCOUNT-001`. Missing any required approval produces a reason record, no provider
call and `$0` spend.

## Budget capacity hold

The requested `$0.10` desk envelope does not fit the live clock. Existing room envelopes,
article production and the morning cap reserve `$0.98` of the signed `$1.00` daily pace.
Registering the room may prove schemas, routing and the dry fixture path, but the live runner
must remain held while this decision is pending. Before countersignature can reach `main`, the
owner must record a reallocation that frees at least `$0.08` of worst-day capacity without
raising any ceiling or silently reducing another venture's authority. The system audit must
fail if a payable clock exceeds `$1.00`.

If capacity is approved, one TRIBUN call is expected to cost about `$0.05` to `$0.07` a day,
or about `$2.10` a month. The room reserves before the call and records actual cost after it.
Apify receives a separate `$2.00` monthly venture share inside the existing Free-plan credit,
with no cash spend and no plan upgrade. Free feeds, normalization, clustering, gates, storage,
admin review and rendering cost `$0`.

## Editorial and data posture

- Štít demokracie supplies topic discovery and salience only. Its posts never count as evidence.
- Factual claims retain typed references. A multi-source fact needs two independent domains;
  commentary remains labelled commentary.
- The monitor keeps only fixed public-post fields, rejects commenter and private-individual data,
  wraps external text as untrusted input and purges raw items after 30 days.
- The account publishes no voting recommendation, party endorsement, paid promotion or
  unsupported accusation. Corrections create a new audited record.
- The owner remains the final approval gate. Approval creates a draft-ready Design Lab package,
  not a post.

## Apify priority and failure posture

Kvórum may use only the pinned public-page actor named by `KV-APIFY-001`, without login or
cookies, at one 30-result run a day. The Free plan's `$5` platform credit remains the physical
stop and must never be upgraded by this program. Once all source approvals and budget capacity
exist, Kvórum reserves its bounded daily share before GoVIRAL's weekly recipe; GoVIRAL's own
guard and actor recipe remain unchanged. A failed item costs one item, a failed source costs one
section and a receipt line, and a day with no usable cluster records an honest quiet outcome.

## Phase 0 audit

### Governing state

- The company is operating, pre-revenue and in `VALIDATION`. No experiment is active and
  no experiment stop condition applies to this program. The owner commissioned this build
  directly; fixture evidence does not validate the venture or support performance claims.
- `budget-2026-08e` still sets the binding limits: `$30` all-in per month, `$25` for
  model and API use, and a `$1.00` daily pace. The August API ledger held `$4.2099446`
  when this audit ran. The treasury remains owner-operated.
- The finance and ecosystem generated totals lag the canonical ledger, and the owner's
  fal.ai prepayment still awaits reconciliation. Kvórum must not present those partial totals
  as a reconciled all-in cost.
- `METRICS_INGESTION_ENABLED=false`, both social channels remain in draft mode, and the
  global social kill switch remains on. Kvórum has no account, credential, channel or
  publisher path.
- `APIFY-ACCOUNT-001` and `APIFY-MMA-SOURCES-001` remain pending. Kvórum must add its
  own approval and share guard without treating either pending item as permission.
- The newest operations decision reports failed scheduled gates on 11 August. The current
  checkout passed `pnpm agents:validate`, lint, typecheck, 1,859 tests and the production
  build under Node 22.23.1 and pnpm 10.30.0. Existing Turbopack filesystem-tracing
  warnings remain warnings, not failed gates.

### Live-tree assumptions

- No sibling program has landed a shared `venture-recommendation`, research-provider,
  `owner-result-entry` or performance-weights implementation. The current carousel summary
  still accepts only `caught-up` and `mma-files` and fixes its locale to Czech. Kvórum must
  create the shared boundary once and leave it ready for later evidence kinds.
- The registry has seven ventures, nine venture rooms and one `$0.16` production job.
  The registered room envelopes total `$0.62`; with article production and the `$0.20`
  morning cap, the full clock already reserves `$0.98` of the `$1.00` daily pace.
- The 21:00 Prague slot is free and remains exactly 60 minutes before the 22:00 board.
  Vercel owns the two punctual daylight-saving entries per slot. GitHub Actions now runs
  three backstop sweeps rather than one scheduled cron per room.
- The Apify module already serves GoVIRAL and FightAIQ through two different quota shapes.
  A third tenant should parameterize shared account-credit checks without changing either
  existing tenant's approvals, estimates or failure posture. Kvórum's actor contract must
  keep the stricter pinned-build requirement; GoVIRAL's older actor entries do not have one.
- The runtime allowlist contains `news.google.com` but none of the proposed Czech feed hosts.
  Each later source entry must remain disabled until its real URL and exact hostname are
  verified.
- The Design Lab now carries 23 template families and five brand token sets. Its summary
  builder remains article-shaped, so a recommendation summary needs an explicit shared
  extension instead of an article-shaped workaround.
- The admin shell already enforces the `{ node, count }` tab invariant and has a tested
  GitHub-or-local persistence ladder. New Kvórum files must keep server reads outside client
  components and use that ladder without introducing a second writer.

## Adapted during implementation

- **KV-00 record timing:** issue #149 requested no file change, while the owner commission
  requires each completing commit to tick its checkbox in this decision. KV-00 therefore
  creates this audit-only scaffold and ticks its own box. KV-01 remains responsible for the
  founding terms.
- **Daily budget arithmetic:** the build prompt assumed a new `$0.10` room fit the signed
  pace. The live clock leaves only `$0.02`. No implementation may add `kv-desk` until the
  founding terms define a schedule or degradation rule that keeps the worst payable day at
  or below `$1.00`; tests must prove the arithmetic.
- **Desk hour and public name:** 21:00 and Kvórum remain the design defaults, but the owner
  checklist still marks both the hour and name/handle clearance as pending. The internal id
  stays `kvorum`; no implementation may create a public account or claim name clearance.
- **Cron architecture:** the prompt predates the three-sweep GitHub backstop. Kvórum will add
  a manual dispatch choice and mode gates to `cycle.yml`, plus the two punctual Vercel entries.
  It will not restore per-room GitHub schedules.
- **Prompt inventory:** `architecture.test.ts` inventories only root prompt files even though
  marketingShark already has a prompt subdirectory. Kvórum converts it to an explicit recursive
  relative-path inventory so both ventures' nested runtime prompts are checked without aliases.
- **Closed-enum sequencing:** the mandated title order registers `kv-desk` before the later
  phase-schema and Vercel-cron issues teach every schedule consumer about it. KV-02b's contract
  and KPI tests are green, but the full suite correctly refuses the unknown scheduled phase and
  the system audit separately refuses to treat its unapproved `$0.10` as payable inside a `$0.02`
  remainder. The tree is intentionally completed in order through Phase A before its full gate;
  no compatibility bypass, premature cron entry or relaxed budget assertion hides either blocker.
- **Agent assignment sequencing:** KV-04a installs the full TRIBUN/HACEK/AUDIT desk preset, but
  its validator-clean venture control record locks only TRIBUN and AUDIT until KV-04c extends
  HACEK's declared venture assignment. KV-04c must add HACEK to that locked control list in the
  same commit; no runtime phase boundary occurs between the two issues.
- **Documentation drift:** curated ecosystem prose still says six projects, 18 cron
  expressions, 11 templates and five brands in places where generated or live state now says
  seven projects, three GitHub sweeps, 23 families and five current brands. KV-21a must correct
  those statements without hand-editing the generated block.

## Implementation checklist

- [x] KV-00 — Phase 0 audit: read the contracts, verify every assumption
- [x] KV-01 — Write the founding decision record
- [x] KV-02a — Registry entry in `config/ventures.json`
- [x] KV-02b — Venture-registry schema enum extensions and fixtures
- [x] KV-03a — Register the `kv-desk` phase in type and record schemas
- [x] KV-03b — Meeting policy classification for `kv-desk`
- [x] KV-03c — `cycle.yml` dispatch choices and mode gates
- [x] KV-03d — Vercel cron entries for the 21:00 slot
- [x] KV-04a — TRIBUN in the agent registry, routing, controls and cast schema
- [x] KV-04b — TRIBUN prompts and the expected-prompts list
- [ ] KV-04c — TRIBUN model role and HACEK venture extension
- [ ] KV-05a — Venture scaffold, brand hue and labels
- [ ] KV-05b — KPI seeds for the quarter
- [ ] KV-05c — Degradation-ladder position with its test
- [ ] KV-06a — `kvorum-sources` registry with verified actors and feeds
- [ ] KV-06b — Network allowlist additions and the host-pinning test
- [ ] KV-07 — Entity lexicon config
- [ ] KV-08a — Venture Apify quota file and share cap
- [ ] KV-08b — Third-tenant extension of the Apify guard
- [ ] KV-09a — Monitor fetch, normalize and the fixed-field row mapper
- [ ] KV-09b — Monitor receipt contract and 30-day raw purge
- [ ] KV-10a — Deterministic entity/topic clustering
- [ ] KV-10b — Cluster ranking, novelty and continuation detection
- [ ] KV-11 — `venture-recommendation` contract with monitor-cluster evidence
- [ ] KV-12a — Desk runner dispatch and the TRIBUN call
- [ ] KV-12b — Honest meeting records for the desk
- [ ] KV-13a — Gates: claim resolution and originality
- [ ] KV-13b — Gates: banned content and register lint
- [ ] KV-14 — Recommendation store with idempotency
- [ ] KV-15a — Studio brand tokens for Kvórum
- [ ] KV-15b — Carousel-summary venture extension, byte-compatible
- [ ] KV-16 — Admin approval write path
- [ ] KV-17a — Server-only admin loader
- [ ] KV-17b — Recommendations panel
- [ ] KV-17c — Monitor panel
- [ ] KV-17d — Claims panel, tab wiring and e2e coverage
- [ ] KV-18 — Claims ledger and the correction flow
- [ ] KV-19a — Owner results: contract, route and store
- [ ] KV-19b — Performance weights with floors and recorded proposals
- [ ] KV-20a — GoVIRAL spine: topic set and brief consumption
- [ ] KV-20b — GoVIRAL spine: transitions and the Design-Lab-only test
- [ ] KV-21a — Documentation truth across the standing docs
- [ ] KV-21b — INBOX approvals and NEEDED owner items
- [ ] KV-21c — Honest gaps, checkbox sweep and prompt deletion

## Honest gaps

## What this does not touch

This decision does not change the `$30`, `$25` or `$1.00` ceilings; the publisher; channel
registry; social unlock counters; global kill switch; treasury; payments; ads; account or
credential ownership; GoVIRAL's actor recipe; either magazine's evidence, image or delivery
gates; the streams path's `apify: false`; BoardlessAI's corporate brand; or the append-only
history of earlier decisions. Phase 2 promise tracking, Sunday recaps, vote-record cards,
additional monitored pages and automated publishing remain out of scope.
