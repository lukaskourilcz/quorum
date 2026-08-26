# BoardlessAI project model

BoardlessAI is one guarded operating system with eleven public project workspaces and
one owner-only Personal Growth workspace. Shared
infrastructure owns the agent registry, budget, source policy, meeting records,
specialist agendas, calendar, admin, delivery checks and public explanation. Each
project keeps a narrow output boundary rather than cloning the orchestrator.

## Projects

| Project | State | What it does | Hard boundary |
| --- | --- | --- | --- |
| Caught Up | Operating in validation | Daily Czech AI briefing, product decisions and an article hero | Delivery is automatically checked after deploy; social posting unlocks after seven consecutive passed proofs |
| Titty Tuesdays | Operating, pre-commerce | Brand seasons, audience work and future campaign planning | No shop, stock, payments, ads, people imagery, posting or purchase claims |
| GoVIRAL | Operating, Mondays only | Weekly trend brief for the owner and rated plays for configured project topic sets | Existing sets use the `$5`-guarded Apify Free recipe; Door Money and Tehdejší svět terms use keyless Google News; each current room emits at most one agenda |
| FightAIQ | Operating, guarded analysis | UFC and Oktagon fighter cards, discovered bouts, historical backfill and deterministic predictions | Two-source bout/card gates; no bet placement, affiliate links or bookmaker automation |
| Design Lab | Operating internal engine | Original template library and deterministic social-carousel rendering for every brand | No accounts, marketing, analytics, external inspiration bytes or image-model calls |
| marketingShark | Operating internal agency | Turns one devShark quiz question a day into one Czech and one English five-slide carousel rendered by the Design Lab | No social account, credentials or publisher path; every package is stored as a draft behind the approval queue |
| BOOKSOFHISTORY | Implementation complete, pending countersignature | Turns a deterministic shortlist and reusable source dossiers into independent Czech and English social-story drafts | No public surface, account, channel or posting path; no cover artwork; quotes are attributed and capped at 300 characters |
| MMA Files | Operating public magazine | One daily Czech article slot and the sole reader-facing FightAIQ home | Content-only delivery; no article spend without a verified source packet |
| Door Money | Implementation complete, pending countersignature | Evidence-linked English book-storytelling recommendations and a Thursday owner action packet | Manuscript/full chunks/embeddings stay private; no posting, account, channel or outreach; results are owner-entered only |
| Tehdejší svět | Implementation complete, pending countersignature | Ranks a hand-committed facts file and produces independent Czech and Ukrainian family-history drafts through a two-day cycle | The existing product and its repository stay separate; no runtime connection, tracking, account, channel or posting path; tier-two review blocks release |
| Kvórum | Implementation complete, held live | Turns corroborated Czech political clusters into one or two typed, cited recommendation drafts | Founding and capacity signatures plus four owner approvals fail closed independently; no party endorsement, automated post, account, analytics or treasury path |

## Directional capability map

`config/venture-capabilities.json` is the versioned, deny-by-default source of truth for
cross-venture and venture-to-service content/data access. A valid request must match one
exact source, target, capability and payload schema version; an allowed edge still grants
no publishing, spending, credentials or external-action authority.

BOOKSOFHISTORY and Tehdejší svět cannot exchange candidates, research, dossiers, claims,
drafts, agendas, performance priors or campaign packages. Personal Growth accepts no
automatic portfolio discovery or nominations. Kvórum has no outbound political-content
edge. FightAIQ has no monetization-execution capability. GoVIRAL can provide only bounded,
expiring intelligence packets, never final copy or publishing payloads.

Door Money has exactly three registered content/service relationships: a held GoVIRAL
intelligence input, an approved bounded summary to Design Lab and an approved immutable
package reference to Social Distribution. The latter still requires Social Distribution's
own connection, provider and routine authority. The planned WebDev Signal boundary mirrors
those three social-core relationships plus exact held access to its own metrics, progress,
health and owner-attention services; it has no core edge to Caught Up or any other venture.

`config/ventures.json` stores each project's meetings, participating roles, cost
envelope and admin tabs. `config/venture-agent-controls.json` stores optional agent switches. Internal
contracts retain the word `venture` for compatibility; visitor-facing text says
`project`.

## People and authority

Four decision-makers—VIZE, FORGE, PULSE and AUDIT—hold company-wide authority.
Thirty-six active specialists do bounded work only when a service path or due agenda needs
their domain. The registry holds 49 entries: 40 active, 6 paused and 3 retired. A
stood-down role stays on the record — the router skips it and names it — so the count
that matters is the forty that work. The 27
established roles keep their approved photographic portraits. Newer roles use neutral
name-based placeholders until approved media exists. Public visuals never enter model
prompts or meeting packets. The public interface uses names and work labels. It does
not present quarters as seasons, days as episodes or agents as entertainment
characters.

PULSE chairs generic project rooms and reads performance in Door Money growth. FOLIO and
PLOT own BOOKSOFHISTORY selection/research and its independent Czech/English packages;
GHOST and BOOKER own the two Door Money packets; LETOPIS and VERBA own Tehdejší svět's
Czech planning/writing and independent Ukrainian pass; TRIBUN owns Kvórum's Czech political
drafts. HACEK carries the Czech register across the magazines, BOOKSOFHISTORY and Kvórum,
while AUDIT keeps its rule-based veto.
Owner ratings teach format and taste; they are not commands. Agents cannot approve their own spending,
credentials, account access, stage changes or governing prompts. Content release and
pre-scoped social posting are agent-owned only inside the recorded contracts and
health gates.

## Decision room, service paths and specialist agendas

The 06:00 morning board is the paid company decision room. It chooses only from the
open priority queue and may issue one bounded, allowlisted specialist agenda. Policy
caps any meeting at two follow-ups; current specialist response contracts expose at
most one. A specialist request to an allowlisted next room goes back into the queue
and still has to satisfy its live, evidence and
budget gates. Pending agendas expire after three days, the queue is bounded to 24 and
each project can hold at most eight pending items. Any project without a consumed
agenda for seven days becomes a mandatory board item with either a commission or a
saved `why-not` reason.

Not every clock entry is a meeting:

- **Decision:** the 06:00 board decides company priorities and may commission a room.
- **Service:** Caught Up production, Caught Up product review, MMA Files story
  assignment and article production retain their fixed reader promise. The 07:00
  marketingShark room is fixed the same way, except that what it owes each day is a
  draft package rather than a published one.
- **Persistent cycle:** the 12:00 BOOKSOFHISTORY desk resumes one recorded selection,
  research or production phase, and the 18:00 Tehdejší svět desk resumes planning or
  bilingual production. A missed day stretches either cycle instead of skipping work
  or weakening a gate.
- **Standing:** Titty Tuesdays runs daily, GoVIRAL does paid work on Mondays, Door Money's
  desk runs daily and its growth room does paid work on Thursdays. The weekly rooms write
  honest `$0` no-op records on their other six scheduled firings.
- **Agenda-gated:** FightAIQ analysis and the MMA Files desk run only when requested.
- **Change-triggered:** FightAIQ intake runs when its source snapshot materially
  changes or an agenda requests it.
- **Checkpoint:** 14:00 and 22:00 update the operating trail deterministically and
  make no model call.

Kvórum's 21:00 desk is registered but not payable: its founding record and separate
capacity reallocation are pending. Even after those pass, external monitoring still
requires the source approvals. A scheduled wake-up therefore fails closed before a
provider call rather than consuming the remaining daily budget.

An unused scheduled window records `not-needed` at `$0`. A manual workflow run is an
explicit operator request, so it bypasses only the agenda check—not live switches,
credentials, evidence, cost limits or safety rules.

## One Prague clock

| Prague | Window | Runtime behavior |
| ---: | --- | --- |
| 05:00 | Caught Up edition | fixed service |
| 06:00 | Board morning | decision room |
| 07:00 | marketingShark carousel room | fixed daily service; one paid copy call per enabled brand |
| 08:00 | FightAIQ data check | material change or agenda |
| 09:00 | MMA Files story meeting | fixed service |
| 10:00 | MMA Files daily article | assigned slot and evidence only |
| 11:00 | Titty Tuesdays campaign room | standing future-eshop marketing ideation; optional focused agenda |
| 12:00 | BOOKSOFHISTORY editorial desk | persistent daily cycle; resumes its current phase |
| 13:00 | GoVIRAL trend room | Mondays only; an off-day firing is a `$0` no-op |
| 14:00 | Board afternoon | `$0` checkpoint |
| 15:00 | Door Money recommendation desk | daily drafts; private-knowledge and budget gates |
| 16:00 | Door Money growth room | Thursdays only; other days are `$0` no-ops |
| 17:00 | Caught Up product meeting | fixed service |
| 18:00 | Tehdejší svět editorial desk | persistent two-day bilingual cycle; drafts only and pending countersignature |
| 19:00 | FightAIQ model check | due agenda; D8 analysis and evidence gates apply |
| 20:00 | MMA Files desk review | due agenda only |
| 21:00 | Kvórum political desk | registered daily; live work held by authority and budget-capacity gates |
| 22:00 | Board night | `$0` checkpoint and daily summary |

A Vercel cron dispatches each window on its own Prague hour and does the work. The 38
entries are paired winter/summer variants for 18 paths plus two DNESKAi retries, across
19 unique UTC expressions. Three GitHub backstop sweeps a day rescue anything that
path missed. Schedule validation
still rejects collisions under 60 minutes. The public five-day calendar reads the same
resolved table.

## Spending behavior

The owner countersigned one `$50` monthly all-in limit in `budget-2026-08f`. No more
than `$25` is reserved for model/API calls, with a `$1.00` daily pace. Personal Growth
has a nested `$20` all-in limit and cannot borrow beyond either ceiling. At 80% the
summary warns with a project breakdown. At 100%, or after three consecutive exhausted
days, new paid work stops and one approval item opens. The runtime cannot borrow from
next month or raise its own limit. Payments remain human-only.

The meeting redesign saves cost by avoiding unnecessary calls, not by lowering the
models that determine publication quality. Static cron wake-ups and `not-needed`
records cost no model money.

BOOKSOFHISTORY research adds narrower guards inside those portfolio limits: at most
`$0.10` per call, `$0.50` per cycle and `$5.00` per month, with idempotency by
`(bookId, briefHash)`. Budget pressure reduces two research candidates to one, then
stretches the cycle at `$0`, then removes the room. It never raises a cap or repeats
research merely for the second language.

Tehdejší svět adds a `$0.30` per-brief and `$2.00` monthly research ceiling inside
the same portfolio limits. Its room envelope is `$0.25`; the two language passes share
one canonical brief, and its current Sunday signal and performance overlays are
deterministic `$0` work. The model-spend target remains at most `$4.00` monthly.

Door Money has a one-time ingestion ceiling of `$3.00`, a `$0.08` daily desk and a
`$0.06` Thursday growth room. Its routine model estimate is about `$2.50` monthly;
off-day growth records, selection, weights and keyless GoVIRAL collection cost `$0`.
Kvórum declares a `$0.10` room, a `$3.00` monthly model KPI ceiling and a `$2.00`
share inside the existing Apify Free credit. Its founding and capacity records are
unsigned, so its payable total remains `$0`.

Monthly headroom degrades in code, not by discretion: optional content scoring below
`$3`; one BOOKSOFHISTORY research candidate plus no Door Money growth below `$2.75`;
BOOKSOFHISTORY stretch and no Door Money desk below `$2.50`; no BOOKSOFHISTORY or
Tehdejší svět room below `$2.25`; no GoVIRAL below `$2`; no Kvórum and a minimal Titty
Tuesdays transcript below `$1.50`; no MMA Files editorial, desk or article below `$1`;
and no Titty Tuesdays below `$0.50`. A date whose due room envelopes still exceed the
`$1.00` daily pace drops rooms in this order: Door Money growth, Kvórum, Door Money
desk, Tehdejší svět, BOOKSOFHISTORY, GoVIRAL, Titty Tuesdays. Neither ladder raises a
ceiling or overrides an authority gate.

## Money and quarterly targets

The owner-approved D10 protocol gives the company and every project a public 90-day
target set. Q1 starts on 2026-08-03. Its content and social targets have a 14-day
setup period before linear pace begins. The daily `$0` evaluator reads only
deterministic receipt, stats and state paths and labels each target `on-track`,
`at-risk`, `off-track` or `unavailable`. It does not turn a missing Phase 3 measure
into zero.

BOOKSOFHISTORY measures cycle reliability, monthly feature cadence, paid-dossier reuse,
verification-state coverage, legend-as-fact violations and model spend. Its research
ledger marks a paid dossier used only after an owner-marked posted lane references it;
missing paid-dossier volume remains unavailable rather than becoming zero.

At quarter end, a project below 70% of its targets or missing a critical target gets
a mandatory `continue / pivot / stop` board item and owner packet. A company miss
also requires the board to review its operating pattern. The evidence can inform a
stage decision, but only the owner can change the stage.

`/money` publishes the sanitized target status, information-only earning readiness, API
spend, owner-entered fixed-cost categories and verified revenue. Every earning method
remains locked regardless of KPI readiness. No proposal, experiment, agenda, task or
owner-attention item is generated; monetization requires a new owner decision before any
implementation can begin. FightAIQ has no monetization execution capability.

The protected admin displays the read-only future-reference catalog and edits
`config/fixed-costs.json`. An empty fixed-cost file is valid but means "not entered,"
not "free." API totals still come only from the budget ledger, and public output does
not include invoices, credentials or personal data.

## Saved work and review

Ideas live under `state/ideas/<project>/`; ratings under
`state/ratings/<project>/`; learned style under `state/taste/<project>/`; and image
preferences under `config/visual-weights/<project>.json`. Specialist requests live in
`state/meeting-agendas/queue.json`. The protected admin uses a signed login session;
approved writes use a repository-scoped GitHub token in production.

The admin includes short summaries with full-record expansion, agent switches,
Caught Up work, Titty Tuesdays plans, FightAIQ data, MMA Files articles and
BOOKSOFHISTORY shortlist, dossier and feature tabs. The latter supports explicit
owner approval/rejection, Design Lab handoff and owner-entered per-lane results without
automatic channel ingestion. Door Money adds recommendations, owner actions and private-knowledge
status. Tehdejší svět adds feature, copied-facts library and owner-pasted signals tabs,
with explicit bilingual approval, manual posted URLs and owner-entered platform results.
Kvórum adds recommendation, monitor and claims tabs with owner approval, manual post
receipts, owner-entered results, claim status and correction drafts; none is a channel client.
Perfect, Good and Bad ratings keep their full history. A rating cannot found
a project or publish an item. The queue and its archive are editable by the owner, but
owner input is optional.

At 22:00 the runtime builds one idempotent, 400-word maximum summary for the Prague
date. Held, paused, failed and not-needed windows remain distinguishable. The summary
also lists delivery receipts, deploy proofs, failures and each social unlock counter,
then refreshes the generated truth block in `docs/ECOSYSTEM.md` at `$0`.

## Delivery boundaries

- Caught Up receives hash-checked Czech edition files in
  `lukaskourilcz/aifirst` and deploys at `caughtup-ai.vercel.app`.
- MMA Files receives only bounded article and FightAIQ data files in
  `lukaskourilcz/mma-files` and deploys at `mma-files.vercel.app`.
- Titty Tuesdays can read the sanitized public concept feed. BoardlessAI cannot
  change its application or commerce state.
- BoardlessAI deliberately has no duplicate public fighter or event pages.
- BOOKSOFHISTORY has no delivery repository or public route. Owner-approved Czech and
  English decks stop at a recorded Design Lab handoff for manual posting.
- Door Money has no public delivery target. Approval writes a bounded English summary to
  the Design Lab; the manuscript, full chunks and embeddings never enter this repository.
- Tehdejší svět is an adoption, not a delivery integration. Its existing product stays
  in its own repository; this repository runs only the marketing cycle from one
  hand-committed, hash-verified facts file and never reads or writes the product at runtime.
- Kvórum has no publisher mapping. An approved recommendation may create only a Design
  Lab summary; the owner performs and records any post manually.

## Live switches

- `CAUGHT_UP_LIVE_ENABLED` — Caught Up edition and product work.
- `PORTFOLIO_LIVE_ENABLED` — the shared portfolio-room gate. It does not replace the
  separate BOOKSOFHISTORY, Door Money, Tehdejší svět or Kvórum founding/authority gates.
- `FIGHTAIQ_LIVE_ENABLED` — FightAIQ source/data work.
- `FIGHTAIQ_ANALYSIS_ENABLED` — model analysis only after the separate mode decision.
- `MMA_FILES_LIVE_ENABLED` — source-first newsroom work and content delivery.
- `MMA_FILES_INDEXING_ENABLED` — owner-controlled evidence for the future MMA Files
  earning-readiness check; absent or false keeps that method waiting.
- Kvórum has no shortcut switch: the pending founding/capacity records and the four
  `KV-*` approvals independently fail closed before live source or model work.
- `SOCIAL_KILL_SWITCH=true` — supreme manual posting stop. When false, each project
  still needs its own proof/campaign counter, account credentials and safety gate.
- `METRICS_INGESTION_ENABLED=false` — keeps automatic visitor, reader and engagement
  measurement out of state; SPLIT stays idle. Explicit owner-entered BOOKSOFHISTORY,
  Door Money, Tehdejší svět and Kvórum results are the only exceptions and do not touch a channel.
  REACH also stays
  disabled while the MMA social-content phase is locked; both roles already carry
  current output contracts.

Missing variables deny the action. The owner checklist and the ordered setup path are
both in `docs/NEEDED.md`.

The canonical, standalone description of all eleven projects, 49 roles, D1–D14 and
current generated state is `docs/ECOSYSTEM.md`.
