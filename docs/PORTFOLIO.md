# BoardlessAI project model

BoardlessAI is one operating system with shared safety rules and five project
workspaces. It does not clone an orchestrator for each project. The public site,
budget history, agent list, meeting records, calendar, private login and release
checks remain common infrastructure.

## Projects

| Project | State | What it does | Hard boundary |
| --- | --- | --- | --- |
| Caught Up | Operating in validation | Daily English and Czech AI briefing, product decisions and an article hero | Delivery needs its narrow GitHub App; social production starts off |
| Titty Tuesdays | Operating, pre-commerce | Brand seasons, audience work and marketing plans | No shop, stock, payments, ads, people imagery or purchase claims |
| Magazine Incubator | Research only | Finds evidence-backed publication ideas for owner rating | Cannot found a project or build a product |
| FightAIQ | Operating, data-only | UFC, KSW and Oktagon fighter/event files and deterministic analysis | No live probability publishing, bet placement, affiliate links or bookmaker automation |
| MMA Files | Operating as a private newsroom | Two daily bilingual article slots with optional social variants | No public magazine route; no paid production without verified FightAIQ input |

`config/ventures.json` stores meeting times, casts, cost limits, saved-item namespaces
and admin tabs. `config/venture-agent-controls.json` stores the admin switches. The site calls these “projects”
because that is clearer to visitors; internal contracts retain `venture` for
backward compatibility.

## People and authority

The four council seats—VIZE, FORGE, PULSE and AUDIT—keep company-wide authority.
Thirty-four specialists join only when their role is needed. The registry has 38
agents: 20 Anthropic and 18 OpenAI. Twenty-seven have validated portraits; the 11
new MMA roles use a deliberate fallback until the owner approves image generation.

PULSE chairs the project rooms and AUDIT keeps its veto. Owner ratings teach format
and taste; they are not instructions. Agents cannot approve their own spending,
credentials, account access, publishing, stage changes or governing prompts.

## One Prague clock

| Prague | Work |
| ---: | --- |
| 05:00 | Caught Up edition |
| 06:00 | Board morning |
| 07:00 | Incubator evidence scan |
| 08:00 | FightAIQ data check |
| 09:00 | MMA Files story meeting |
| 10:00 | MMA Files morning article slot |
| 11:00 | Titty Tuesdays marketing |
| 14:00 | Board afternoon |
| 17:00 | Caught Up product meeting |
| 18:00 | MMA Files evening article slot |
| 19:00 | FightAIQ model check |
| 20:00 | MMA Files desk review |
| 21:00 | Incubator synthesis |
| 22:00 | Board night |

Each slot receives summer and winter UTC cron entries. The runtime rejects the
inactive daylight-saving entry, and schedule validation rejects starts less than
60 minutes apart. The public calendar reads the same resolved table.

## Spending behavior

`budget-2026-08d` proposes one `$50` all-in monthly limit, including model calls,
images, services and other outside cost. Its model share is `$42` per month with a
`$2.20` daily pace. Until the owner countersigns that exact record, the safe fallback
remains `$20` all-in, `$15` for model calls and `$0.70` per day; live MMA Files jobs
remain off.

At 80% the daily summary warns the owner with a project breakdown. At 100%, or
after three days in a row exhaust the daily pace, further spend stops and one
approval item is opened. The runtime cannot borrow from next month or raise its own
limit. Payments remain human-only.

## Saved work and review

Ideas live under `state/ideas/<project>/`; ratings under
`state/ratings/<project>/`; learned style under `state/taste/<project>/`; and image
preferences under `config/visual-weights/<project>.json`. The private admin reads
these files through Basic Auth. In production, approved forms write through a
repository-scoped GitHub token.

The admin includes Caught Up social drafts, Titty Tuesdays plans, incubator ideas,
FightAIQ fighters/events/slates/sources and MMA Files articles/calendar/social lab.
Perfect, Good and Bad ratings keep their full history; no project is founded or
published merely because a card was rated.

After the night room, one summary is built for the Prague date. Each held meeting
gets one line, skipped rooms stay visible, and final-cycle failures are reported.
The body is capped at 400 words and replay is idempotent.

## Live switches

- `CAUGHT_UP_LIVE_ENABLED` — live edition and product rooms after delivery checks.
- `PORTFOLIO_LIVE_ENABLED` — shared Titty Tuesdays/incubator runtime.
- `FIGHTAIQ_LIVE_ENABLED` — live source/data rooms.
- `FIGHTAIQ_ANALYSIS_ENABLED` — model analysis only after the recorded data-only
  mode change.
- `MMA_FILES_LIVE_ENABLED` — live private newsroom after the signed budget.
- `SOCIAL_KILL_SWITCH=true` — keeps social work in draft mode.

Missing variables deny the action. The exact owner checklist is `NEEDED.md`; the
ordered setup path is `MANUAL STEPS.md`.
