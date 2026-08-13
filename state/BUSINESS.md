# Business plan (living)

## Project mode

**Operating (pre-revenue)** effective 2026-08-01 by owner decision.

Caught Up is the first project. The owner adopted it directly; the founding council
did not discover or approve it. That historical distinction remains visible, while a
new pre-signed content-project template now permits tightly fenced founding:

- Only a board-approved proposal that passes every template field can be founded
  automatically; anything needing new accounts, commerce, legal/personal-data scope,
  an unapproved target or more than `$0.15/day` stops for the owner.
- Fixture evidence remains ineligible for business decisions.
- SCOUT may collect live evidence from approved, allowlisted sources.
- Recognized revenue is measured at $0 until a real revenue event is accepted.
- Only the human owner may accept money or execute a payment.

The registry now holds eleven projects. Caught Up and MMA Files are the two public Czech
magazines. Titty Tuesdays remains pre-commerce. FightAIQ is a sourced UFC and Oktagon
analysis desk with no betting action. GoVIRAL and marketingShark produce bounded internal
briefs and draft packages. Design Lab is the deterministic shared renderer. BOOKSOFHISTORY,
Door Money, Kvórum and Tehdejší svět are implemented venture programmes whose live work
still waits behind their own founding countersignatures and named approvals. None of the
four may create an account, publish, contact a channel or infer authority from its
`operating` registry status.

## Owner and roles

- Operator: Lukas Kouril (contact via the repository owner account)
- Incident owner and approver: Lukas Kouril
- Emergency stop: repository variable `AUTONOMY_KILL_SWITCH=false` for the
  approved runtime; the owner can restore it to `true` at once

## Budget

Effective countersigned all-in hard cap: $30 USD.

- API monthly cap: $25
- API daily cap: $1.00
- Venture standup cap: $0.20 per cycle
- Caught Up meeting cap: $0.08 per meeting
- Edition production cap: $0.35 per article run
- Media monthly cap: $2, with deterministic media costing $0 by default

The owner countersigned `budget-2026-08e` on 2026-08-02. It sets one $30 limit,
a $25 model share and a $1.00 daily pace across the portfolio. Project-specific
live switches and evidence gates still decide whether a meeting may run.

`config/fixed-costs.json` currently records `confirmedNoFixedCosts: true` and an empty
list, so fixed subscriptions evaluate to `$0` rather than unavailable. The owner must
remove that flag and enter any real subscription. The fal.ai prepayment is known to
exist but its amount has not yet been entered in treasury state, so the recorded all-in
total is incomplete. API cost remains sourced only from the budget ledger.

## Stage and decision

Current stage: **VALIDATION**

Entered: 2026-08-01 through the `config/stages.json` current-stage mechanism

Next gate: D9 defines measurement-ready contracts, but live ingestion remains closed.
No visitor, reader or engagement signal is collected while
`METRICS_INGESTION_ENABLED=false`.

Thesis confidence: owner-adopted, unvalidated

The DISCOVERY gate did not pass. Owner adoption advanced Caught Up to the
first post-discovery stage without rewriting the founding record.

Quarterly KPI results inform the stage review but never change the stage by
themselves. Each quarter lasts 90 days. A project below 70% of its targets, or missing
any critical target, receives a mandatory `continue / pivot / stop` reassessment. A
company miss makes the board review its own operating pattern. Only the owner may
approve a stage change after reading that evidence.

## Thesis

Caught Up pairs a Czech daily AI briefing with BoardlessAI's public decision
record. The verifiable chain from promise to decision to edition to outcome is
the product thesis under validation.

## Evidence

`FIX-*` records remain synthetic fixtures and cannot support a decision. New
source observations enter `state/EVIDENCE.jsonl` as live records with capture
dates and references. No live market evidence has been accepted yet.

## Audience, job and alternatives

Primary readers are busy developers, founders, technology leaders, AI
practitioners and informed professionals who want one bounded daily briefing.
They currently use newsletters, feeds and social timelines without a public
record of why each story was selected.

## Offer and pricing hypothesis

Caught Up remains free during validation. A first-party, labeled sponsorship is
a future hypothesis, not an accepted offer. The owner must clear brand and
sponsor approval gates before the first payment.

## Distribution

Git and MDX remain the saved source. Caught Up publishes through its Vercel site after
a validated repository commit and automated post-deploy proof. Social posting remains
locked per project until its health/credential gate passes; the global kill switch can
stop every post.

## Phase 3 measurement hold

Visitor paths, readership, social results and experiments are deliberately unavailable.
Phase 3 contracts and deterministic variant assignment exist, but
`METRICS_INGESTION_ENABLED=false`; SPLIT stays idle until a future owner decision
chooses a lawful provider and useful measurement scope.

## Unit economics

Recognized revenue: $0.00

Refunds: unavailable

Payment fees: unavailable

API cost: $4.26

Treasury cost: $0.00

Other cost: $0.00

Gross profit: -$4.26 from recorded August API usage through 2026-08-12 12:39 UTC

Zero revenue is a measured operating fact. Unconnected fee or refund data stays
unavailable.

## Money and quarterly KPIs

Decision D10 starts `2026-Q1` on 2026-08-03 for 90 days. Content and social targets
exclude the first 14 days from their linear pace. The daily evaluator uses saved
receipts, internal stats and state measurements at `$0`; missing Phase 3 inputs remain
`unavailable`, not zero. The 06:00 packet, protected admin and public `/money` page
read the same evaluated status.

Earning methods move through `locked`, `ready`, `proposed` and `active`. Readiness
prepares a complete owner proposal. It cannot activate sponsorship, affiliates,
commerce, payments or accounts. Activation always needs an explicit owner decision,
and FightAIQ remains unmonetized in Q1 and Q2.

## Active experiment

None. Adoption starts validation; it does not fabricate an experiment.

## Stage gates, pivot and kill criteria

Stay in VALIDATION while Phase 3 remains closed. A future experiment must have a
written cost, loss, evidence and stop threshold. Template-compliant content-project
founding does not imply market validation or a stage change.

## Solution and scope

BoardlessAI runs the shared project list and public calendar. For Caught Up it
owns source collection, edition and product rooms, guarded production, delivery
records and governance surfaces. For Titty Tuesdays it owns pre-commerce brand,
season, audience and marketing planning only. FightAIQ owns sourced fighter/event
records, captured prices and code-generated analysis without bet placement. MMA Files
owns the public Czech articles and the reader-facing FightAIQ data pages. The two
sites accept only bounded, hash-checked content files through their GitHub repositories;
BoardlessAI cannot change their application code. Social packs are built inside
existing production calls and post only after project health gates. Caught Up keeps
a static reader path with Git and MDX as canon. BOOKSOFHISTORY, Door Money, Kvórum and
Tehdejší svět add draft-only state, research and owner-review workflows; their source,
results, account and spend permissions remain individually gated.

## Constraints

The countersigned `$30` all-in limit and `$25` model/API share, human-only payments,
per-project social gates, the global posting stop, sanitization boundary, evidence
rules, security controls and release gates remain binding. Titty Tuesdays carries a
standing daily agenda for pre-commerce marketing ideas. Other agenda-gated specialist
windows need a due agenda; FightAIQ intake may open for a material source change.
Caught Up and MMA Files receive only bounded, hash-checked content through their
approved repositories.
