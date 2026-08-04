# BoardlessAI project model

BoardlessAI is one guarded operating system with six project workspaces. Shared
infrastructure owns the agent registry, budget, source policy, meeting records,
specialist agendas, calendar, admin, delivery checks and public explanation. Each
project keeps a narrow output boundary rather than cloning the orchestrator.

## Projects

| Project | State | What it does | Hard boundary |
| --- | --- | --- | --- |
| Caught Up | Operating in validation | Daily Czech AI briefing, product decisions and an article hero | Delivery is automatically checked after deploy; social posting unlocks after seven consecutive passed proofs |
| Titty Tuesdays | Operating, pre-commerce | Brand seasons, audience work and future campaign planning | No shop, stock, payments, ads, people imagery, posting or purchase claims |
| Magazine Incubator | Research and fenced founding | Finds evidence-backed publication ideas and can create a template-compliant content project | Anything needing a new account, more than `$0.15/day`, commerce, legal or personal-data work stops for the owner |
| FightAIQ | Operating, guarded analysis | UFC and Oktagon fighter cards, discovered bouts, historical backfill and deterministic predictions | Two-source bout/card gates; no bet placement, affiliate links or bookmaker automation |
| Carousel Studio | Operating internal engine | Original template library and deterministic social-carousel rendering for every brand | No accounts, marketing, analytics, external inspiration bytes or image-model calls |
| MMA Files | Operating public magazine | Two daily Czech article slots and the sole reader-facing FightAIQ home | Content-only delivery; no article spend without a verified source packet |

`config/ventures.json` stores each project's meetings, participating roles, cost
envelope and admin tabs. `config/venture-agent-controls.json` stores optional agent switches. Internal
contracts retain the word `venture` for compatibility; visitor-facing text says
`project`.

## People and authority

Four decision-makers—VIZE, FORGE, PULSE and AUDIT—hold company-wide authority.
Thirty-six specialists do bounded work only when a service path or due agenda needs
their domain. The registry has 40 agents: 21 Anthropic and 19 OpenAI. The 27
established roles keep their approved photographic portraits. Newer roles use neutral
name-based placeholders until approved media exists. Public visuals never enter model
prompts or meeting packets. The public interface uses names and work labels. It does
not present quarters as seasons, days as episodes or agents as entertainment
characters.

PULSE chairs project rooms and AUDIT keeps its rule-based veto. Owner ratings teach
format and taste; they are not commands. Agents cannot approve their own spending,
credentials, account access, stage changes or governing prompts. Content release and
pre-scoped social posting are agent-owned only inside the recorded contracts and
health gates.

## Decision room, service paths and specialist agendas

The 06:00 morning board is the paid company decision room. It chooses only from the
open priority queue and may issue one bounded, allowlisted specialist agenda. A
specialist room may request one follow-up room; the
request goes back into the queue and still has to satisfy its live, evidence and
budget gates. Pending agendas expire after three days, the queue is bounded to 24 and
each project can hold at most eight pending items. Any project without a consumed
agenda for seven days becomes a mandatory board item with either a commission or a
saved `why-not` reason.

Not every clock entry is a meeting:

- **Decision:** the 06:00 board decides company priorities and may commission a room.
- **Service:** Caught Up production, Caught Up product review, MMA Files story
  assignment and article production retain their fixed reader promise.
- **Agenda-gated:** Titty Tuesdays, both incubator rooms, FightAIQ analysis and the
  MMA Files desk plus Carousel Studio run only when requested.
- **Change-triggered:** FightAIQ intake runs when its source snapshot materially
  changes or an agenda requests it.
- **Checkpoint:** 14:00 and 22:00 update the operating trail deterministically and
  make no model call.

An unused scheduled window records `not-needed` at `$0`. A manual workflow run is an
explicit operator request, so it bypasses only the agenda check—not live switches,
credentials, evidence, cost limits or safety rules.

## One Prague clock

| Prague | Window | Runtime behavior |
| ---: | --- | --- |
| 05:00 | Caught Up edition | fixed service |
| 06:00 | Board morning | decision room |
| 07:00 | Incubator evidence scan | due agenda only |
| 08:00 | FightAIQ data check | material change or agenda |
| 09:00 | MMA Files story meeting | fixed service |
| 10:00 | MMA Files morning article | assigned slot and evidence only |
| 11:00 | Titty Tuesdays campaign room | due agenda only |
| 13:00 | Carousel Studio room | due agenda only; deterministic rendering remains `$0` |
| 14:00 | Board afternoon | `$0` checkpoint |
| 17:00 | Caught Up product meeting | fixed service |
| 18:00 | MMA Files evening article | assigned slot and evidence only |
| 19:00 | FightAIQ model check | due agenda; D8 analysis and evidence gates apply |
| 20:00 | MMA Files desk review | due agenda only |
| 21:00 | Incubator synthesis | due agenda only |
| 22:00 | Board night | `$0` checkpoint and daily summary |

Seventeen unique UTC cron wake-ups cover Prague summer and winter time. The runtime
accepts only the entry resolving to the intended Prague hour, and schedule validation
rejects collisions under 60 minutes. The public five-day calendar reads the same
resolved table.

## Spending behavior

The owner countersigned one `$30` monthly all-in limit in `budget-2026-08e`. No more
than `$25` is reserved for model/API calls, with a `$1.00` daily pace. At 80% the
summary warns with a project breakdown. At 100%, or after three consecutive exhausted
days, new paid work stops and one approval item opens. The runtime cannot borrow from
next month or raise its own limit. Payments remain human-only.

The meeting redesign saves cost by avoiding unnecessary calls, not by lowering the
models that determine publication quality. Static cron wake-ups and `not-needed`
records cost no model money.

## Money and quarterly targets

The owner-approved D10 protocol gives the company and every project a public 90-day
target set. Q1 starts on 2026-08-03. Its content and social targets have a 14-day
setup period before linear pace begins. The daily `$0` evaluator reads only
deterministic receipt, stats and state paths and labels each target `on-track`,
`at-risk`, `off-track` or `unavailable`. It does not turn a missing Phase 3 measure
into zero.

At quarter end, a project below 70% of its targets or missing a critical target gets
a mandatory `continue / pivot / stop` board item and owner packet. A company miss
also requires the board to review its operating pattern. The evidence can inform a
stage decision, but only the owner can change the stage.

`/money` publishes the sanitized target status, earning-method gates, API spend,
owner-entered fixed-cost categories and verified revenue. Earning methods may move
from waiting to ready and produce a complete owner proposal. They never become active
without the owner. FightAIQ remains explicitly unmonetized in Q1 and Q2 while its
evaluation record is too young.

The protected admin holds the full proposal checklists and edits
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
Caught Up work, Titty Tuesdays plans, incubator ideas, FightAIQ data and MMA Files
articles. Perfect, Good and Bad ratings keep their full history. A rating cannot found
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

## Live switches

- `CAUGHT_UP_LIVE_ENABLED` — Caught Up edition and product work.
- `PORTFOLIO_LIVE_ENABLED` — Titty Tuesdays and incubator rooms when an agenda is due.
- `FIGHTAIQ_LIVE_ENABLED` — FightAIQ source/data work.
- `FIGHTAIQ_ANALYSIS_ENABLED` — model analysis only after the separate mode decision.
- `MMA_FILES_LIVE_ENABLED` — source-first newsroom work and content delivery.
- `MMA_FILES_INDEXING_ENABLED` — owner-controlled evidence for the future MMA Files
  earning-readiness check; absent or false keeps that method waiting.
- `SOCIAL_KILL_SWITCH=true` — supreme manual posting stop. When false, each project
  still needs its own proof/campaign counter, account credentials and safety gate.
- `METRICS_INGESTION_ENABLED=false` — keeps all visitor, reader and engagement
  measurement out of state; SPLIT stays idle. REACH also stays disabled while the MMA
  social-content phase is locked; both roles already carry current output contracts.

Missing variables deny the action. The exact owner checklist is `NEEDED.md`; the
ordered setup path is `MANUAL STEPS.md`.

The canonical, standalone description of all six projects, 40 roles, D1–D12 and
current generated state is `docs/ECOSYSTEM.md`.
