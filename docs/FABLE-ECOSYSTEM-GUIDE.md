# BoardlessAI ecosystem guide for Fable

Updated: 2026-08-01  
Status: current operating and implementation reference  
Audience: product, service-design and agent-system brainstorming

## 1. What BoardlessAI is

BoardlessAI is a Git-backed operating system for a small portfolio of AI-assisted
projects. It is not a chat room where every agent speaks every day. It combines a
small decision-making board, on-demand specialists, fixed content services,
deterministic checks and human-only approval gates.

The system currently runs five workspaces:

1. **Caught Up** — a daily bilingual AI-news briefing.
2. **Titty Tuesdays** — a pre-commerce apparel/brand laboratory focused on future
   campaigns, not social production or sales.
3. **Magazine Incubator** — a research-only way to find possible publication niches.
4. **FightAIQ** — a sourced UFC and Oktagon data operation in data-only mode.
5. **MMA Files** — a public English/Czech MMA magazine and the reader-facing home for
   FightAIQ data.

BoardlessAI makes plans and content, records why a decision was made, counts external
cost, validates outputs and delivers bounded data files. It does not autonomously buy
anything, open accounts, found a project, publish social posts, place bets or change a
consumer application's code.

## 2. Current operating truth

| Item | Current truth |
| --- | --- |
| Business mode | Operating, pre-revenue |
| Stage | Validation |
| Recognized revenue | `$0` |
| Recorded API use | `$0.52` through 2026-08-01 13:33 UTC |
| All-in monthly limit | `$50`, countersigned |
| Model/API share | `$42` monthly |
| Daily model/API pace | `$2.20` |
| Projects | 5 |
| Registered agents | 38: 20 Anthropic, 18 OpenAI |
| Human decision owner | Lukas Kouril |
| Public BoardlessAI site | `https://boardless-ai.vercel.app` |
| Caught Up site | `https://caughtup-ai.vercel.app` |
| MMA Files site | `https://mma-files.vercel.app` |
| Social behavior | production roles off; global posting kill switch on |
| FightAIQ mode | data-only; model-analysis switch stays off |

The founding evidence gate has not passed. Caught Up entered validation through an
explicit owner adoption, not an invented market discovery. No active market
experiment or accepted revenue event exists yet. Those absences are visible state,
not gaps filled with optimistic copy.

## 3. The system in one diagram

```text
Human owner
  ├─ signs budget, scope, accounts, legal and mode changes
  ├─ rates outputs and supplies private credentials
  └─ can stop every live path
             │
             ▼
06:00 decision board
  VIZE + FORGE + PULSE + AUDIT
  ├─ reviews one bounded operating item
  ├─ may approve/hold it
  └─ may commission one allowlisted specialist agenda
             │
             ▼
Specialist agenda queue ───────────────┐
  bounded, idempotent, 3-day expiry   │
             │                         │
             ├─ Titty Tuesdays room    │
             ├─ incubator scan/synth   │
             ├─ FightAIQ analysis      │
             └─ MMA Files desk         │
                                       │
Fixed services and change triggers ────┤
  Caught Up edition/product            │
  MMA Files story/articles             │
  FightAIQ changed-source intake       │
                                       ▼
                             contracts + safety gates
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
             canonical Git state                 bounded delivery files
             records, cost, ideas,                Caught Up + MMA Files
             ratings, agendas, receipts                    │
                    │                                     ▼
                    ▼                              consumer-site CI/Vercel
          public BoardlessAI + /admin
```

## 4. Authority model

The system separates authority from expertise.

### Human-only authority

Only the owner can approve:

- a higher spending limit or an unplanned external expense;
- credentials, account access or broader repository permissions;
- project founding, stage changes or a change from data-only to analysis mode;
- live social publishing, ads, payments, inventory or commerce;
- changes to governing prompts, safety policy or legal posture;
- personal-data collection, commercial terms and public indexing decisions.

### Board authority

VIZE, FORGE, PULSE and AUDIT can evaluate approved internal work, vote within the
existing rules and commission a bounded specialist room. AUDIT can veto a concrete
rule breach. A board vote cannot override a human-only gate.

### Specialist authority

Specialists can collect approved evidence, compare records, propose work, write a
draft, translate, edit or produce a deterministic artifact. They cannot approve their
own release or expand their scope. A specialist room may ask for one allowlisted
follow-up. That request creates another agenda; it does not authorize its result.

### External text

Articles, feeds, APIs and owner notes enter as untrusted data. They never become
instructions. Output claims must remain traceable to allowed evidence.

## 5. Why the meeting strategy changed

The earlier design scheduled three paid company councils plus many full specialist
rooms every day. That made the calendar look active but paid agents to discover that
nothing needed doing. It also encouraged broad conversations because every role was
already in the room.

The current design treats the clock as a set of **wake-up windows**, not a promise to
call a model. It distinguishes five behaviors:

| Behavior | Purpose | Examples |
| --- | --- | --- |
| Decision room | choose priority and commission expertise | 06:00 morning board |
| Fixed service | maintain a real reader/product promise | Caught Up edition, MMA article slots |
| Agenda-gated room | solve a named specialist problem | TT campaign, incubator, MMA desk |
| Change-triggered room | react only to material new input | FightAIQ intake |
| Deterministic checkpoint | preserve the operating trail without model theatre | 14:00 and 22:00 |

This creates a two-level organization:

1. Decision-makers define the problem and name the evidence needed.
2. A narrow specialist cast works from that agenda and may request one next step.

The result should be less repetition, clearer accountability and lower cost without
weakening publication quality.

## 6. Agenda lifecycle

The agenda queue lives at `state/meeting-agendas/queue.json` and follows the
`meeting-agenda/1` contract.

An agenda contains:

- the target project and meeting phase;
- the requesting agent and source meeting;
- one short problem statement;
- zero to 12 evidence references;
- the earliest date it may run;
- request and expiry timestamps;
- `pending`, `consumed` or `expired` state;
- the consuming cycle when used.

Rules:

- The board can create at most one request in its meeting.
- At least three board approvals, including AUDIT, are required before the request is
  queued.
- Only VIZE, FORGE or PULSE can make the board request.
- Every transition is allowlisted in `config/meeting-policy.json`.
- Identical phase/date requests are idempotent.
- The queue permits at most 24 pending items.
- Unused requests expire after three days.
- A due agenda is consumed by the cycle that uses it.
- A scheduled agenda-gated phase with no request writes `not-needed` at `$0`.
- Manual runs bypass the agenda check for testing, but no other gate.

Current transition map:

| Source | Allowed follow-up |
| --- | --- |
| Morning board | TT campaign, incubator scan, FightAIQ intake, MMA story meeting or MMA desk |
| TT campaign | another TT campaign |
| Incubator scan | incubator synthesis |
| Incubator synthesis | another evidence scan |
| FightAIQ intake | analysis, MMA story meeting or MMA desk |
| FightAIQ analysis | new intake or MMA story meeting |
| MMA story meeting | MMA desk or FightAIQ intake |
| MMA desk | next story meeting or FightAIQ intake |

This map prevents an arbitrary agent from scheduling an arbitrary paid room.

## 7. Prague operating clock

| Time | Project | Window | Trigger | Maximum planned envelope |
| ---: | --- | --- | --- | ---: |
| 05:00 | Caught Up | Edition | fixed service and live gate | meeting `$0.08`; production `$0.35` |
| 06:00 | BoardlessAI | Morning board + Caught Up idea screening | fixed decision room | cycle hard cap `$0.20` |
| 07:00 | Incubator | Evidence scan | agenda | `$0.06` |
| 08:00 | FightAIQ | Data intake | material source change or agenda | `$0.06` |
| 09:00 | MMA Files | Story assignment | fixed service | `$0.05` |
| 10:00 | MMA Files | Morning article | assigned slot + verified evidence | `$0.16` |
| 11:00 | Titty Tuesdays | Campaign thinking | agenda | `$0.08` |
| 14:00 | BoardlessAI | Afternoon checkpoint | deterministic | `$0` |
| 17:00 | Caught Up | Product decision | fixed service | `$0.08` |
| 18:00 | MMA Files | Evening article | assigned slot + verified evidence | `$0.16` |
| 19:00 | FightAIQ | Model review | agenda + separate analysis gate | `$0.06` |
| 20:00 | MMA Files | Desk review | agenda | `$0.05` |
| 21:00 | Incubator | Proposal synthesis | agenda | `$0.06` |
| 22:00 | BoardlessAI | Night checkpoint + summary | deterministic | `$0` plus optional digest path |

The GitHub workflow now uses 17 unique UTC cron entries to represent these 14 Prague
windows across daylight saving time. The runtime checks the resolved Prague hour, so
the inactive seasonal entry does no work. Previously duplicated entries were removed.

The envelopes are maximum planning/reservation values, not a promise that each run
costs that amount. A skipped or evidence-killed phase costs `$0`; actual provider use
is written to the budget ledger.

## 8. Agent roster and model routing

The registry keeps 38 stable identities. The identity describes responsibility; model
routing remains centralized so models can be changed without rewriting biographies.

Council routing:

- VIZE and FORGE use configured Anthropic `claude-sonnet-5` calls.
- PULSE and AUDIT use configured OpenAI `gpt-5.6-luna` calls.
- The 06:00 Caught Up idea screen also uses the OpenAI specialist route for SPARK and
  the Anthropic digest route for VAULT.

Specialist routing:

- OpenAI specialists use configured `gpt-5.6-luna`.
- Anthropic specialists normally use configured `claude-haiku-4-5-20251001`.
- Caught Up curation, long-form writing and Czech localization use the quality path
  `claude-sonnet-4-6`.
- MMA Files English and Czech article calls use `claude-sonnet-4-6`.
- Deterministic SVG heroes and social templates make no image-model call.

These are the identifiers pinned in the repository, not a claim about a provider's
future default catalog.

### Decision-makers

| Agent | Specific responsibility | What it must not absorb |
| --- | --- | --- |
| VIZE | project focus, stage, opportunity and stop/pivot direction | implementation and release approval |
| FORGE | shippability, operational risk and bounded delivery | self-approval or silent scope expansion |
| PULSE | audience, distribution and measurable growth framing | accounting truth or direct publishing |
| AUDIT | evidence, budget, security and release-rule integrity | matters of taste without a rule breach |

### Shared operating specialists

| Agent | Specialty | Reuse logic |
| --- | --- | --- |
| SCOUT | market sources and evidence independence | shared research method; project sources stay separated |
| SCRIBE | plain-language public/admin summaries | one summary craft is enough across projects |
| LENS | metrics, experiments and signal/noise | shared analysis rules avoid conflicting numbers |
| QUILL | structural editorial clarity and claim support | can review different publications from their own stylebooks |
| RADAR | discoverability without manufactured pages | shared search standards |
| KEEPER | compliance with governing rules | a single constitutional interpretation |
| THREADS | text-native social drafts | currently disabled where content production is paused |
| INSTAGRAM | visual social concepts | currently disabled where content production is paused |
| PEOPLE | role usefulness, overlap and organizational review | prevents unmeasured agent sprawl |
| LEDGER | cost reconciliation and budget planning | one source of financial truth |
| STET | grammar, wording, format and generated-text tells | publication-specific stylebook still applies |
| HACEK | natural Czech editorial work | shared between Caught Up and MMA Files with separate registers |
| SPARK | Caught Up product/reader-growth idea | narrow product job despite global infrastructure status |
| VAULT | duplicate detection and idea memory | common memory rules with project namespaces |
| FRAME | deterministic visual production | one code-driven studio across brands; starts off where unnecessary |
| RELAY | bounded repository delivery and daily notification | shared protocol, separate target allowlists |
| ANGLE | positioning and niche definition | useful to TT and incubator through requested rooms |
| COHORT | adult audience definitions without personal data | shared method, project-specific packets |
| FUNNEL | cost-labelled campaign and measurement plans | TT guest only when the agenda is a funnel question |
| PALATE | evidence-linked taste memory | shares method but never blends project taste files |

### Titty Tuesdays specialists

| Agent | Specialty | Boundary |
| --- | --- | --- |
| SCENE | streetwear/skate/lifestyle signals | no fabricated brand, price or demand evidence |
| STUNT | low-cost, permission-aware campaign ideas | no ads, spend activation, platform breach or publishing |

The TT room always needs PULSE and AUDIT, normally uses ANGLE, and invites only one
useful guest from FUNNEL, STUNT, COHORT, SCENE, PALATE, SPARK or VAULT. QUILL,
THREADS, INSTAGRAM and FRAME start off. This turns the room into campaign thinking,
not a social-asset factory.

### FightAIQ specialists

| Agent | Specialty | Boundary |
| --- | --- | --- |
| CORNER | UFC fighter and event records | two-source/disagreement checks before model use |
| SPOTTER | Oktagon fighter, event, weigh-in and result records | regional sources need explicit provenance |
| TAPE | cited matchup/context adjustments | bounded, expiring and reviewable after the event |
| SIGMA | deterministic model, versions, backtests and calibration | cannot hand-edit a probability |
| VIG | de-vigged captured prices and closing-line comparison | no bookmaker automation or bet placement |
| SONAR | source access, terms, cost and corroboration mapping | proposal before adapter work |
| PIVOT | evidence handoff between FightAIQ and MMA Files | reader response never becomes a hidden model input |

### MMA Files specialists

| Agent | Specialty | Boundary |
| --- | --- | --- |
| CANVAS | two-slot editor-in-chief and source sufficiency | kills thin/repeated assignments before production |
| JAB | direct English MMA reporting | no unsupported figures, quotes, odds or hype |
| HACEK | natural Czech version | preserves facts and uncertainty; not literal translation |
| QUILL/STET | structure, wording and generated-text review | do not invent facts during cleanup |
| REACH | bilingual social variants | starts off; drafts only |
| SPLIT | honest social comparison and sample size | no optimization from invented metrics |
| TAPE/PIVOT | data context and desk bridge | no betting instruction or hidden model feedback |
| FRAME | deterministic hero/social visuals | hero path retained; optional social work starts off |

## 9. Why no new permanent agents were added

The audit considered splitting broad roles further. The current evidence does not
justify it.

Broad names are not automatically broad runtime jobs. A role receives a phase-specific
prompt, a bounded packet, allowed contracts and a small output shape. For example,
HACEK has one identity but receives separate Caught Up and combat-sports registers;
RELAY shares delivery mechanics but each destination has its own allowlist and schema.

Adding permanent agents now would create four costs:

1. another provider call when the role attends;
2. new registry, routing, prompt, test, admin and portrait maintenance;
3. more handoff points and disagreement without outcome evidence;
4. pressure to schedule the role merely because it exists.

The better next move is to measure failures by category. Add or split a role only if
several reviewed outputs show the same missing expertise and a tighter packet or local
validator cannot solve it.

Candidate future splits, only if evidence appears:

- **Caught Up source verification desk** if citation corrections remain high after
  source-packet improvements.
- **Oktagon regional-language researcher** if SPOTTER repeatedly misses material
  Czech/Slovak sources despite an adequate adapter.
- **MMA copy desk fact-checker** if editorial corrections are factual rather than
  stylistic and cannot be handled by TAPE + STET.
- **Experiment designer** if LENS reports repeated invalid tests across projects; it
  should be an on-demand mode before becoming an identity.

## 10. Shared infrastructure versus shared judgment

Some capabilities should be shared because duplication adds cost without adding
quality:

- provider gateway, cost estimation and budget ledger;
- source allowlists, cache, retries and prompt-injection treatment;
- Git state locking, schema validation, hashing and delivery receipts;
- owner ratings, taste update rules and idea duplicate detection;
- Czech-language mechanics, human-text checks and deterministic art tooling;
- calendar, admin authentication, summary format and alert delivery.

Other capabilities should not be merged even when their titles sound similar:

- SCOUT, SONAR and SCENE all find information, but market demand, MMA source terms
  and brand/culture signals need different judgment and source policies.
- QUILL and STET both improve copy, but QUILL owns editorial structure and claim
  support while STET owns surface quality, register and generated-text tells.
- HERALD and CANVAS are both editors-in-chief, but one selects AI news and the other
  runs an MMA slot/evidence desk.
- HACEK can be shared only because the project-specific style register is explicit and
  isolated in each packet.

The principle is: share machinery and reusable review methods; isolate source policy,
facts, taste and editorial accountability.

## 11. Caught Up in detail

### Promise

Caught Up gives a busy reader one consequential AI story per day in English and
Czech. It also maintains a small product-improvement loop. The consumer site renders
the content; BoardlessAI owns the source, decision and production trail.

### Inputs

- allowlisted source collection and source health;
- candidate items with timestamps, links and source grouping;
- recent edition/topic history for duplicate control;
- project quality thresholds and English/Czech writing registers;
- owner ratings and accepted taste observations;
- the current budget and live/delivery gates.

### Edition path

1. Source collection creates a bounded digest.
2. HERALD chairs the 05:00 room and selects one story or records `NO_EDITION`.
3. AUDIT can veto insufficient evidence; STET can hold low-quality copy.
4. The quality path curates, writes English and produces natural Czech.
5. Each language passes its own checks.
6. A deterministic hero is composed from approved brand tokens and text.
7. The package is schema-validated and hashed.
8. RELAY delivers only the agreed content into `lukaskourilcz/aifirst`.
9. A receipt records the target commit/deployment handoff.

`NO_EDITION` is a valid result. It is preferable to a weak article.

### Product path

The 06:00 room can produce one VAULT-screened SPARK idea. The 17:00 product room
accepts, defers, vetoes or supersedes that same idea. It does not invent a second idea
or authorize code/spend. The idea history remains project-namespaced.

### Current social state

THREADS, INSTAGRAM and FRAME are disabled for Caught Up social production. The article
and hero path remain enabled. `SOCIAL_KILL_SWITCH=true` prevents posting even if a
draft role is later enabled.

### Remaining owner proof

Run one reviewed live delivery, verify both languages/hero/receipt/deployment, then
review the first three editions before unattended use.

## 12. Titty Tuesdays in detail

### Promise

Titty Tuesdays is currently a brand and campaign-thinking laboratory. It keeps a
season, target audience, platform-risk notes and detailed future campaign ideas. It
does not create social carousels now and cannot sell, advertise, publish or promise
stock.

### Inputs

- the current 91-day season and brand rules;
- owner taste ratings tied to concrete artifacts;
- platform-risk notes and adult-audience boundaries;
- cited culture/competitor observations when a SCENE agenda needs them;
- past plan summaries and duplicate checks;
- the exact problem commissioned by the board or prior TT room.

### Agenda-driven campaign room

PULSE and AUDIT are locked on. ANGLE is normally active. One guest is selected for
the question:

- FUNNEL for measurement or future channel economics;
- STUNT for a permission-aware activation concept;
- COHORT for audience precision;
- SCENE for culture/competitor signals;
- PALATE for owner-rated visual direction;
- SPARK for a bounded idea;
- VAULT for memory or duplicate review.

The room writes a short admin summary and a detailed canonical Markdown plan. The
plan can describe a future campaign but cannot represent it as approved or executed.

### Current boundary

The public Titty Tuesdays application may read a sanitized concept feed. It receives
no private notes, account data or direct application writes. BoardlessAI does not
touch Shopify or commerce. Social asset/copy roles are off.

### Improvement path

Before more campaign volume, define one real, legal, low-cost demand experiment and
one measurable success/failure threshold. More ideas without an observed test will
increase the archive, not learning.

## 13. Magazine Incubator in detail

### Promise

The incubator finds possible daily-readable publication niches and gives the owner
evidence-backed proposals to rate. It cannot found a project or treat attention as
demand.

### Two-room chain

1. A due scan agenda asks SCOUT/ANGLE/COHORT/VAULT to bring cited candidates.
2. A scan with no qualifying external evidence returns zero candidates.
3. A follow-up synthesis agenda may be created from the scan.
4. Synthesis argues the evidence down to zero, one or two complete proposals.
5. Owner ratings can narrow the shortlist but cannot launch a project.

This chain is agenda-gated because daily scanning without a current strategic
question mostly creates duplicates and source costs.

### Improvement path

The next useful improvement is not another research agent. It is a clear quarterly
research thesis, source budget and owner definition of what would make a proposal
worth testing.

## 14. FightAIQ in detail

### Promise and mode

FightAIQ builds sourced UFC and Oktagon fighter/event records, captures market prices
and runs deterministic, versioned analysis. Current mode
is data-only: public model probability publishing and model-led analysis remain off.

### Source path

- Allowed adapters operate only against configured hosts.
- The Odds API quota is recorded and calls stop at reported zero remaining credits.
- CITO is a configured UFC data source.
- Oktagon can use owner-reviewed inputs until a compliant adapter is approved.
- Critical fighter facts require two agreeing sources or enter disagreement review.
- External content is normalized and treated as data, never prompt instructions.
- A stable material hash distinguishes real source change from timestamp/noise change.

### 08:00 behavior

The source check can wake every day without opening a paid specialist room. It opens
when the normalized source content materially changes or when a due agenda requests
it. It can then update the guarded source snapshot and deliver current public data to
MMA Files.

### Deterministic analysis

The codebase includes Glicko-2 ratings, versioned model inputs, uncertainty handling,
method/round distributions, market de-vigging, calibration and immutable results.
Agents may explain or review these outputs but cannot hand-edit the published number.
No bet is placed and no bookmaker account is automated.

### 19:00 behavior

The analysis room needs both a due agenda and
`FIGHTAIQ_ANALYSIS_ENABLED=true`. That switch must stay false until one reviewed UFC
event, one reviewed Oktagon event and a separate owner mode-change decision exist.

### Delivery

Only the sanitized FightAIQ content contract is delivered to
`data/boardless/fightaiq.json` in MMA Files. BoardlessAI intentionally has no duplicate
public fighters/events section.

## 15. MMA Files in detail

### Promise

MMA Files is a public English/Czech publication with up to two evidence-backed slots
per day. It also renders the approved FightAIQ fighter/event data. Its reader app and
BoardlessAI remain separate repositories.

### Story and article chain

1. At 09:00 CANVAS, JAB, QUILL and AUDIT review verified FightAIQ files, recent ideas
   and repetition history.
2. Each slot is assigned or killed with a reason.
3. At 10:00 or 18:00 the job loads its exact assignment and evidence first.
4. Missing/invalid evidence kills the slot at `$0` before a provider call.
5. JAB writes direct English from the packet.
6. HACEK creates the Czech article in the Czech combat-sports register.
7. Local quality checks independently review both languages.
8. A deterministic SVG hero is generated at `$0` model cost.
9. The bounded package is hashed and delivered to
   `data/boardless/articles.json` in the MMA Files repository.
10. MMA Files validates the data in CI and Vercel deploys `main`.

### Style system

The stylebook was derived from structural observations across ten Czech Fights.cz
articles and ten English MMA Fighting articles. It captures pacing, attribution,
sentence shape and common generated-text problems. It does not copy passages or treat
another publication as evidence for a fact.

### Desk room

The 20:00 desk is agenda-gated. It opens for a named editorial problem, a FightAIQ
handoff, a ratings pattern or tomorrow's required follow-up. It does not meet merely
to restate that two article slots exist.

### Social state

REACH and FRAME social work start off. SPLIT cannot learn without entered metrics.
Draft tooling can be re-enabled later, but the posting kill switch remains a separate
hard gate.

### Remaining owner proof

Add the repository to the existing delivery App, confirm Vercel demo/indexing
settings, deliver one article and one FightAIQ file, review both languages and the
public routes, then choose corrections/operator/privacy details before indexing.

## 16. State and contract architecture

Git is the canonical audit trail. Important areas:

| Path | Meaning |
| --- | --- |
| `config/agents.json` | stable agent identities and responsibilities |
| `config/models.json` | centralized provider/model routing |
| `config/ventures.json` | project rooms, casts and envelopes |
| `config/venture-agent-controls.json` | optional role switches |
| `config/meeting-policy.json` | agenda-required/change/service phases and transitions |
| `contracts/` | exported JSON Schemas for cross-repository validation |
| `state/decisions/` | append-only historical and current human decisions |
| `state/meeting-agendas/` | specialist request queue |
| `state/meetings/`, `state/standups/` | canonical operating records |
| `state/ideas/`, `state/ratings/`, `state/taste/` | learning trail with project isolation |
| `state/budget/`, `state/finance/` | actual usage and reconciled cost truth |
| `state/edition/` | Caught Up packages, runs, receipts and outbox |
| `state/mma/` | FightAIQ data, sources, model outputs and bridge |
| `state/ventures/` | project-native plans, slates, articles and stylebooks |
| `site/` | public explanation, five-day calendar and protected admin |

State-changing production jobs use a lock because the repository assumes one
serialized writer. Workflow commits must first integrate remote `main`; this avoids
the earlier non-fast-forward race when another session changed the calendar.

## 17. Public and admin experience

The public BoardlessAI site explains the system without exposing secrets, raw private
notes, credentials or internal approval packets. Its calendar shows one day in the
past, today and three days ahead. Finished work is green, missed/failed work red, test
work yellow, future planned work neutral and intentionally unused work `not-needed`.

The admin uses a username/password login that creates a signed HttpOnly session. It is
noindex/no-store and fails closed when credentials are missing. Production writes use
a fine-grained GitHub token limited to the BoardlessAI repository.

The admin is designed for scanning:

- short summaries first, with full Markdown/record expansion;
- project filters and optional agent switches;
- meeting-agenda queue visibility;
- ratings with complete history;
- FightAIQ source/manual review tools;
- MMA Files articles and metrics;
- unified human-readable Prague date formatting.

Admin notes enter repository history after saving, so they must contain no secret or
personal information.

## 18. Delivery and repository separation

The delivery GitHub App has Contents read/write only on specifically approved
repositories. BoardlessAI holds its App ID/private key in Actions. Consumer sites do
not need those secrets.

Delivery uses this pattern:

1. Produce a contract-valid content package.
2. Remove fields not allowed across the boundary.
3. Hash the bounded payload.
4. Obtain a repository-scoped App token.
5. Clone/fetch the latest target `main`.
6. Change only the agreed data path.
7. Validate and commit with an idempotency reference.
8. Rebase/retry safely if `main` moved.
9. Push and record a receipt.
10. Let consumer CI and Vercel render it.

Caught Up accepts its edition contract. MMA Files accepts article and FightAIQ data
contracts. Titty Tuesdays currently reads a sanitized public feed and is not a write
target.

## 19. Cost review

The cost strategy now prioritizes call avoidance:

- morning is the only paid company-wide decision room;
- afternoon/night became `$0` deterministic checkpoints;
- TT, incubator, FightAIQ analysis and MMA desk do not call without a due agenda;
- FightAIQ source checks use a material hash before a specialist call;
- missing article evidence kills work before writing;
- social production agents start off;
- deterministic heroes avoid image API cost;
- duplicate UTC cron declarations were removed;
- delivery-only retry reuses an existing package without another model call.

The previous board pattern could call four council agents at three shifts, plus SPARK
and VAULT in the morning: up to 14 board/idea calls per day. The current pattern uses
six only in the morning, removing eight routine calls before considering specialist
room savings.

A daily TT room previously averaged roughly five agent contributions. The current
room uses four contributors only when commissioned. Incubator's scan and synthesis
previously reserved up to 11 contributions per day; now both require a relevant chain
of agendas. MMA desk and FightAIQ analysis receive the same treatment.

These are avoided maximums, not guaranteed dollar savings. Actual savings depend on
how often the board creates agendas and on provider token use. The budget ledger, not
the envelopes, remains the source of actual cost.

### Why models were not downgraded

Caught Up and MMA Files public quality depends heavily on selection, English writing
and Czech localization. Lowering those routes before an A/B quality review risks more
owner corrections, failed editions and repeated calls. The current design first
removes meetings that do not need to happen. That is the safer saving and preserves
the output path the showcase depends on.

Use a cheaper model only after a blinded comparison shows equal fact preservation,
style quality, Czech naturalness and first-pass acceptance on a meaningful sample.

## 20. Safety and failure behavior

The system prefers an explicit non-result over fabricated activity:

- `NO_EDITION` when Caught Up lacks a consequential supported story;
- a killed MMA slot when evidence is missing;
- zero incubator proposals without external evidence;
- `not-needed` when no agenda exists;
- `PAUSED` when a live switch, budget or safety gate blocks work;
- unavailable data instead of zero when a metric is absent;
- fixture labels on dry proof;
- data-only FightAIQ output until the analysis decision exists.

Global and project kill switches stop work independently. Budget exhaustion stops new
paid work rather than silently borrowing. Idempotency keys and receipts make retries
safe. Historical decisions are never rewritten to make the present look cleaner.

## 21. Current manual dependencies

Code completion does not replace these owner actions:

1. Finish BoardlessAI admin credentials and the narrow Git-backed writer; verify one
   harmless saved rating.
2. Add `lukaskourilcz/mma-files` to the existing delivery App installation.
3. Finish the MMA Files Vercel demo/indexing settings.
4. Add THE_ODDS_API and CITO credentials only when live FightAIQ input is wanted.
5. Review a complete UFC and Oktagon event before any analysis-mode decision.
6. Prove one Caught Up edition delivery.
7. Prove one MMA Files article and one FightAIQ delivery.
8. Clear names, corrections contact, operator/privacy details and commercial terms
   before promotion, indexing, data collection or revenue.

`NEEDED.md` is the exact live checklist. `MANUAL STEPS.md` gives its safe order.

## 22. Highest-value next improvements

### A. Measure editorial acceptance

Add a small, explicit review dataset across Caught Up and MMA Files: first-pass
accepted, copy correction, factual correction, Czech-register correction and killed.
This will show whether the next investment belongs in sources, prompts, validators or
a new role.

### B. Give the board a finite priority queue

The morning board should choose from a human-readable queue of at most a few approved
operating questions. Archive stale questions and show why a specialist room was or
was not requested. This prevents the board from inventing work to fill its meeting.

### C. Add agenda outcome review

After 20 consumed agendas, measure:

- percentage producing a useful artifact;
- percentage requesting another meeting;
- cost per accepted output;
- owner rating;
- repeated agenda topics;
- expired/no-result requests.

Use that evidence to merge, split or retire roles and rooms.

### D. Close the consumer delivery proof

Caught Up and MMA Files are the showcase paths. One end-to-end delivery on each is
more valuable than another internal feature. Capture the target commit, CI result,
Vercel deployment, public render and owner review as one proof record.

### E. Define one experiment at a time

There is currently no eligible live market experiment. Choose one low-cost,
reversible test with a real signal and stop threshold. Do not run a portfolio of
content experiments before there is enough audience/traffic to distinguish noise.

### F. Make role review evidence-based

PEOPLE should review the roster quarterly or after 20 relevant outputs, not daily.
Retire or merge a role when it contributes little unique information. Split a role
only when repeated error categories prove that a missing specialty exists.

## 23. Questions for Fable brainstorming

Fable can use this system as a design brief and challenge it with questions such as:

1. How can the 06:00 board choose a genuinely important agenda without becoming a
   generic task generator?
2. What is the simplest visual explanation of decision room → specialist agenda →
   artifact → measured outcome?
3. How should the admin compare the short summary, full record, cost and owner rating
   without feeling like a corporate dashboard?
4. What evidence should trigger a new specialist identity instead of a new mode for an
   existing role?
5. Which agenda outcomes deserve a follow-up and which should close automatically?
6. How can Caught Up and MMA Files share editorial infrastructure while maintaining
   clearly different voices?
7. What would make TT campaign research useful before commerce without turning it
   into an endless idea archive?
8. How can FightAIQ show source quality, disagreement and model uncertainty clearly to
   a non-technical reader?
9. Which single real experiment should validate Caught Up's reader promise first?
10. What proof would justify turning MMA Files from demo/noindex into a promoted
    publication?
11. How should actual owner corrections feed role/prompt review without allowing one
    subjective rating to rewrite policy?
12. What is the best humane label for internal concepts such as ledger, venture,
    governance and canonical state on the public/admin surfaces?

## 24. Design principles to preserve

- A quiet calendar is healthy when no work is needed.
- A model call needs a service promise, material change or explicit agenda.
- Decisions and specialist work are separate layers.
- Share infrastructure; isolate facts, source policy and taste.
- Missing evidence produces no output, not a confident approximation.
- Actual cost comes from measured use, not a meeting label.
- The owner controls spend, credentials, legal scope and external publishing.
- Git history is a public operating trail, so corrections supersede rather than erase.
- Consumer applications accept bounded content, never orchestration authority.
- Quality-critical models should change through evidence, not intuition.
- More agents are not automatically more intelligence.

This is the current system Fable should brainstorm from. Historical review files and
fixture records remain useful for provenance, but they should not be treated as the
current operating design.
