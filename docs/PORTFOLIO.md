# BoardlessAI portfolio model

BoardlessAI is one operating system with shared controls and venture-specific
context. It does not clone an orchestrator for every product. The public site,
budget ledger, agent registry, meeting record, calendar, admin authentication
and release gates remain common infrastructure.

## Portfolio

| Workspace | Status | Purpose | External boundary |
| --- | --- | --- | --- |
| Caught Up | Operating in validation | Bilingual AI briefing, product decisions and draft social packs | Delivery needs the bounded GitHub App; publishing stays gated |
| Titty Tuesdays | Pre-commerce; owner countersign pending | Brand, concept seasons, audience work and marketing plans | No eshop, stock, payment, ads, people imagery or purchase claims |
| Magazine Incubator | Research-only exploration | Evidence-backed daily publication niches for owner rating | Cannot found a venture or create a product |

The registry in `config/ventures.json` defines each workspace, meeting cadence,
cast, routing preset, idea namespace, taste flag and admin tabs. Caught Up’s
behavior is preserved through that registry rather than a special scheduler.

## Agents and authority

The four council seats—VIZE, FORGE, PULSE and AUDIT—retain portfolio authority.
Global specialists are routed only when their contract is relevant. ANGLE,
COHORT, FUNNEL and PALATE serve the portfolio; SCENE and STUNT are assigned to
Titty Tuesdays. Caught Up retains its language and editorial desks.

PULSE chairs the new rooms and AUDIT retains veto. PALATE is a pre-meeting taste
pass, not a voter or cron. Owner ratings are evidence for taste, never
instructions. Prompt-doctrine changes, spend, accounts, credentials, scopes,
publishing and stage changes remain owner-only.

## One Prague clock

The shared schedule has eight daily wall-clock slots:

| Prague | Room |
| ---: | --- |
| 05:00 | Caught Up edition |
| 06:00 | Portfolio morning board |
| 07:00 | Incubator evidence scan |
| 11:00 | Titty Tuesdays marketing |
| 14:00 | Portfolio afternoon board |
| 17:00 | Caught Up product |
| 21:00 | Incubator synthesis |
| 22:00 | Portfolio night board |

Each slot receives summer and winter UTC cron variants. The runtime rejects the
inactive daylight-saving variant, and the registry rejects starts less than 60
minutes apart. The WeekBoard uses the same resolved schedule.

## Budget behavior

The owner budget record controls two shapes. Shape A uses `$18` monthly and
`$1.00` daily API caps and includes both incubator rooms. Until an exact
countersignature selects it, Shape B keeps `$15` and `$0.70`, caps Titty
Tuesdays at `$0.06`, and omits incubator synthesis.

Headroom degradation is automatic: below `$3` synthesis is removed; below
`$1.50` the incubator pauses and Titty Tuesdays becomes minimal; below `$0.50`
Titty Tuesdays pauses. Caught Up survives the final portfolio rung. The `$20`
all-in cap and human-only payments do not change.

## State and review

Ideas live under `state/ideas/<venture>/`; ratings under
`state/ratings/<venture>/`; taste under `state/taste/<venture>/`; and visual
weights under `config/visual-weights/<venture>.json`. The admin reads these
files through its existing Basic Auth boundary. Production ratings persist to
GitHub through a repository-scoped token and append immutable history.

Perfect moves an incubator proposal to the owner shortlist. Good records signal
without founding anything. Bad archives the proposal with its history intact.
The Titty Tuesdays binder includes approved plans and owner-rated Perfect plans
for future use; it does not imply a store exists.

After the night room, the workflow builds one digest for the Prague date. Each
meeting receives one line, skipped rooms stay visible, and a final-cycle failure
becomes a failure line. The body is capped at 400 words and a replay is
idempotent. Per-meeting email no longer exists.

## Go-live rule

`CAUGHT_UP_LIVE_ENABLED` and `PORTFOLIO_LIVE_ENABLED` are independent repository
variables. Missing variables keep their runtimes dry or skipped. Titty Tuesdays
also needs its founding countersignature; Shape A needs its own exact budget
countersignature. Social publishing and commerce remain outside these switches.
The owner checklist is `NEEDED.md`; the ordered runbook is `MANUAL STEPS.md`.
