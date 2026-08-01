# BoardlessAI project model

BoardlessAI is one guarded operating system with five project workspaces. Shared
infrastructure owns the agent registry, budget, source policy, meeting records,
specialist agendas, calendar, admin, delivery checks and public explanation. Each
project keeps a narrow output boundary rather than cloning the orchestrator.

## Projects

| Project | State | What it does | Hard boundary |
| --- | --- | --- | --- |
| Caught Up | Operating in validation | Daily English and Czech AI briefing, product decisions and an article hero | Content-only delivery needs its narrow GitHub App; social roles start off |
| Titty Tuesdays | Operating, pre-commerce | Brand seasons, audience work and future campaign planning | No shop, stock, payments, ads, people imagery, posting or purchase claims |
| Magazine Incubator | Research only | Finds evidence-backed publication ideas for owner rating | Cannot found a project, build a product or invent demand |
| FightAIQ | Operating, data-only | UFC and Oktagon fighter/event files and deterministic analysis | No live probability publishing, bet placement, affiliate links or bookmaker automation |
| MMA Files | Operating public magazine | Two daily bilingual article slots and the sole reader-facing FightAIQ home | Content-only delivery; no article spend without a verified source packet |

`config/ventures.json` stores each project's meetings, cast, cost envelope and admin
tabs. `config/venture-agent-controls.json` stores optional agent switches. Internal
contracts retain the word `venture` for compatibility; visitor-facing text says
`project`.

## People and authority

Four decision-makers—VIZE, FORGE, PULSE and AUDIT—hold company-wide authority.
Thirty-four specialists do bounded work only when a service path or due agenda needs
their domain. The registry has 38 agents: 20 Anthropic and 18 OpenAI. Twenty-seven
have validated portraits; 11 MMA roles use a safe text fallback until image work is
approved.

PULSE chairs project rooms and AUDIT keeps its rule-based veto. Owner ratings teach
format and taste; they are not commands. Agents cannot approve their own spending,
credentials, account access, publishing, stage changes or governing prompts.

## Decision room, service paths and specialist agendas

The 06:00 morning board is the paid company decision room. It may issue one bounded,
allowlisted specialist agenda. A specialist room may request one follow-up room; the
request goes back into the queue and still has to satisfy its live, evidence and
budget gates. Pending agendas expire after three days and the queue is bounded to 24.

Not every clock entry is a meeting:

- **Decision:** the 06:00 board decides company priorities and may commission a room.
- **Service:** Caught Up production, Caught Up product review, MMA Files story
  assignment and article production retain their fixed reader promise.
- **Agenda-gated:** Titty Tuesdays, both incubator rooms, FightAIQ analysis and the
  MMA Files desk run only when requested.
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
| 14:00 | Board afternoon | `$0` checkpoint |
| 17:00 | Caught Up product meeting | fixed service |
| 18:00 | MMA Files evening article | assigned slot and evidence only |
| 19:00 | FightAIQ model check | due agenda and analysis-mode gate only |
| 20:00 | MMA Files desk review | due agenda only |
| 21:00 | Incubator synthesis | due agenda only |
| 22:00 | Board night | `$0` checkpoint and daily summary |

Seventeen unique UTC cron wake-ups cover Prague summer and winter time. The runtime
accepts only the entry resolving to the intended Prague hour, and schedule validation
rejects collisions under 60 minutes. The public five-day calendar reads the same
resolved table.

## Spending behavior

The owner countersigned one `$50` monthly all-in limit in `budget-2026-08d`. No more
than `$42` is reserved for model/API calls, with a `$2.20` daily pace. At 80% the
summary warns with a project breakdown. At 100%, or after three consecutive exhausted
days, new paid work stops and one approval item opens. The runtime cannot borrow from
next month or raise its own limit. Payments remain human-only.

The meeting redesign saves cost by avoiding unnecessary calls, not by lowering the
models that determine publication quality. Static cron wake-ups and `not-needed`
records cost no model money.

## Saved work and review

Ideas live under `state/ideas/<project>/`; ratings under
`state/ratings/<project>/`; learned style under `state/taste/<project>/`; and image
preferences under `config/visual-weights/<project>.json`. Specialist requests live in
`state/meeting-agendas/queue.json`. The protected admin uses a signed login session;
approved writes use a repository-scoped GitHub token in production.

The admin includes short summaries with full-record expansion, agent switches,
Caught Up work, Titty Tuesdays plans, incubator ideas, FightAIQ data and MMA Files
articles. Perfect, Good and Bad ratings keep their full history. A rating cannot found
a project or publish an item.

At 22:00 the runtime builds one idempotent, 400-word maximum summary for the Prague
date. Held, paused, failed and not-needed windows remain distinguishable.

## Delivery boundaries

- Caught Up receives hash-checked bilingual edition files in
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
- `SOCIAL_KILL_SWITCH=true` — prevents posting; social production roles also start off.

Missing variables deny the action. The exact owner checklist is `NEEDED.md`; the
ordered setup path is `MANUAL STEPS.md`.
