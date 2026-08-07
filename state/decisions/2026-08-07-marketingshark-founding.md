# marketingShark founding, and devShark folded into the portfolio

Date: 2026-08-07

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `marketingshark-2026-08a`

Supersedes: nothing. Extends the founding precedent set by `goviral-2026-08a`.

Owner-commissioned on 2026-08-07 by issuing `docs/marketingshark-implementation-prompt.md`
to an implementation session. Every ceiling from `budget-2026-08e` — $30 all-in a month, a
$25 model share, a $1.00 daily pace — is untouched, and so are the truth gates, the social
triple-lock, the treasury rules and the publisher.

## marketingShark is founded

A seventh project, and the second one that exists to make the others' publishing better
rather than to publish. GoVIRAL reads the market and hands out ideas; marketingShark takes
one product's own content and turns it into finished bilingual drafts every morning.

- Registry: `id: marketingshark`, `status: operating`, `taste: false`, ledger namespace
  `marketingshark`, admin tab `packages`.
- One meeting, `ms-daily`, at **07:00 Prague** — the hour the closed incubator vacated.
  Cast: MAKO directs, CHUM writes, AUDIT vetoes. Envelope `$0.10` per enabled brand.
- Its one job: turn one quiz question into one Czech and one English five-slide carousel per
  active brand, rendered by Carousel Studio, stored as a draft social package behind the
  approval queue.

`taste: false` on purpose. A PALATE pre-step is a second model call, and this room is
designed around exactly one paid call per brand per day.

## devShark is a portfolio product, not a rebuild

`lukaskourilcz/react-express-app` ships a finished developer-learning game. It is folded in
as a product marketingShark markets, and nothing else: this repository makes no code change
there, consumes its question bank read-only as a pinned committed snapshot, and records the
source commit in the snapshot envelope. The bank's answers already sit in a public
repository, so committing them leaks nothing that was not already public.

geoShark is present in the config from day one and disabled. Phase 2 is one importer run
and one `"enabled": false` → `true` edit, which is the whole point of building it
brand-generic before there is a second brand to prove it on.

`lukaskourilcz/geoshark` is a stale precursor whose README describes the old webdev quiz
under a GeoShark title. It is ignored. Both banks live in `react-express-app`.

## Two agents, and neither of them can post

The registry grows 40 → 42.

- **MAKO** — marketingShark direction: brand configs, the weekly package review,
  hook-library proposals, KPI honesty. It cannot post, cannot edit the hook library
  silently (proposals only) and cannot invent a metric.
- **CHUM** — one bilingual quiz-carousel copy pass per brand per day. It writes copy only.
  Question choice, hook choice, template choice, rendering, publishing and the slide-5 line
  are code and config, and its budget is one call plus one retry.

Both route to Claude Sonnet 5 on the existing council route. CHUM's call is the venture's
only quality-critical one — native-register Czech and English creative in a single pass —
and at roughly $0.05 the quality tier costs almost nothing. Neither is a social production
role; neither touches the publisher. A future Haiku trial for CHUM goes through PEOPLE, not
through this decision.

## Everything except one step costs $0

Stated here because it is the design, not an observation about a good day. Question
selection and the ledger, hook assignment and the truth predicates, config and schema
validation, the output truth gates, Carousel Studio rendering and its checks, packaging,
the queue write, KPI evaluation, the calendar pre-check and both abort paths are
deterministic code. The only paid step is CHUM's call, plus one MAKO review a week.

About **$1.66 a month** in Phase 1 and **$3.15** in Phase 2, against a $30 all-in cap that
currently runs near $16. $0 fixed costs, $0 cash, no treasury items: rendering is free and
the model spend rides the existing API ledger.

## Nothing posts

`SOCIAL_KILL_SWITCH` remains the supreme stop and this venture does not touch it. Packages
are written with `status: "draft"`, enqueued in the existing approval queue, and
draft-locked while the switch is up. marketingShark has no credentials, no channel and no
publisher path, and the shark brands have no social accounts to gain one from. When those
accounts exist, they are an owner decision that arrives through `state/INBOX.md` like every
other one.

## One outward-facing surface, gated once

A single static devShark banner on DNESKAi, delivered through the existing Contents-only
GitHub App channel that already carries the daily edition, hash-checked and verified after
deploy like an edition. Because a house banner is a new kind of surface on a reader site,
the first placement waits on one `HUMAN_APPROVAL` item. geoShark never gets a banner
anywhere, and that is pinned by the config schema and by a test rather than by this
sentence.

DNESKAi's banner carries the honest `vlastní projekt` label. The site does not sell ads and
must not look like it does.

## Two things the work order asked for that are not built

Recorded rather than quietly dropped, in the shape `goviral-2026-08a` used for the same kind of
gap.

**The agenda transitions.** `ms-daily` was to be a standing agenda window that the morning board
could focus, and that could itself request MAKO's weekly review. Neither is wired, and offering
the first without the engine that reads it would be worse than not offering it: `run.ts` is the
only place a due agenda is ever consumed, `ms-daily` runs from `cycle.ts`, and an agenda filed
for it would sit in the queue until its three-day TTL expired while the morning board's record
claimed it had handed work onward. That is the same trap `cu-product` fell into. The room is a
standing daily window in behaviour — it opens without a due agenda — it is simply not registered
as one in `config/meeting-policy.json`.

**MAKO's weekly review.** Its instructions exist and are byte-perfect at
`orchestrator/prompts/marketingshark/strategy.md`, and nothing calls them. No weekly room is
registered, no weekly call is made, and no weekly cost is incurred. The cost figures in this
decision were written for a design that included it; the venture actually runs at about $1.50 a
month with one brand and $3.00 with two, and wiring the review would add roughly $0.16.

## What this does not touch

The $30 / $25 / $1.00 ceilings. The publisher, the treasury and the INBOX flows. Every
truth gate in both magazines. The office walkthrough's layout invariants. The mirrored
skill directories — this venture adds no skill directory, and its runtime craft rules are
distilled into `orchestrator/prompts/marketingshark/` the way GoVIRAL's are into
`orchestrator/prompts/goviral.md`. SPLIT stays retired and `METRICS_INGESTION_ENABLED`
stays false: A/B hook variants are recorded in SPLIT-compatible form and never ranked,
because there is no data to rank them with.
