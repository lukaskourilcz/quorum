# BoardlessAI ecosystem — standing full-context brief

Updated: 2026-08-02  
Status: implementation complete; launch-ready after the owner-only setup in `NEEDS_YOUR_HELP_NOW.md`  
Audience: owner, product partners and Fable brainstorming  
Authority: current code, committed state and countersigned decisions D1–D12

## What BoardlessAI is

BoardlessAI is a Git-backed operating system for six AI-assisted projects. It is not
an always-on group chat and it does not reward agent activity for its own sake. A
small board chooses bounded work, specialist rooms open only for a concrete agenda or
service need, deterministic code handles checks wherever judgment is unnecessary,
and human-only gates retain control of money, accounts, legal scope and personal data.

Its promises are simple: preserve evidence, make costs visible, keep every action
inside an explicit contract, publish only through verified delivery paths, and record
an honest `not-needed`, `unavailable` or failure state instead of inventing work.

The public BoardlessAI site explains the company and its saved outputs. `/admin` is the
owner's protected operating view. Caught Up and MMA Files are bounded consumer apps:
they accept content/data packages and render them, but never orchestrate BoardlessAI.
Titty Tuesdays remains pre-commerce. FightAIQ never places bets. Carousel Studio is
an internal renderer with a public gallery, not another social brand.

## How to maintain this document

This file has two layers. The sections outside the generated markers are curated
design truth. Every future implementation handoff must update them when it changes a
project, role, decision, clock window, gate, cost rule or owner action. The generated
block is rebuilt at `$0` from committed state by `pnpm docs:refresh`, during production
builds and after a real 22:00 checkpoint. Never hand-edit the generated block.

<!-- GENERATED:CURRENT-OPERATING-TRUTH:START -->
## Current operating truth (generated)

Refreshed from committed state: **2026-08-02T12:01:40.759Z**. This block is generated deterministically; edit the source state, not these lines.

| Item | Current value |
| --- | --- |
| Portfolio | 6 projects; 5 marked operating |
| Agent roster | 40 active: 21 Anthropic, 19 OpenAI |
| Scheduled specialist/service rooms | 10; combined maximum room envelopes $0.64 if every room is commissioned |
| Approved spend boundary | $50 all-in monthly; $42 model/API share; $2.20 daily model/API pace |
| Recorded API spend | $0.50 this month; $0.52 cumulative |
| Entered fixed costs | $0.00 monthly |
| Recognized revenue | $0.00 |
| KPI quarter | 2026-Q1; open; 22 on track, 0 at risk, 0 off track, 15 unavailable |
| Critical KPI gaps | company.valid-window-rate, company.monthly-all-in-usd, carousel-studio.engine-post-rate |
| FightAIQ analysis | approved by D8; production still requires `FIGHTAIQ_ANALYSIS_ENABLED=true` plus live and evidence gates |
| Visitor/engagement measurement | disabled (`METRICS_INGESTION_ENABLED=false`) |
| Global social posting | stopped while `SOCIAL_KILL_SWITCH=true`; project counters and credentials remain separate gates |

### Project modes and social readiness

| Project | Mode | Rooms | Disabled optional roles | Social readiness |
| --- | --- | --- | --- | --- |
| Caught Up | operating | cu-edition 05:00; cu-product 17:00 | THREADS, INSTAGRAM | locked (0/7) |
| Titty Tuesdays | operating | tt-marketing 11:00 | QUILL, THREADS, INSTAGRAM | locked (0/4) |
| Magazine Incubator | exploration | incubator-scan 07:00; incubator-synthesis 21:00 | none | not applicable |
| FightAIQ | operating | mma-intake 08:00; mma-analysis 19:00 | none | not applicable |
| Carousel Studio | operating | studio 13:00 | none | not applicable |
| MMA Files | operating | mag-editorial 09:00; mag-desk 20:00 | REACH, SPLIT | locked (0/10) |

<!-- GENERATED:CURRENT-OPERATING-TRUTH:END -->

## Authority and operating model

The owner controls budget changes, new credentials or accounts, legal and brand
clearance, commerce, payments, ads, personal-data collection, project scope outside
the signed template, public indexing decisions and governing prompt changes. Global
kill switches remain immediate stops.

The board consists of VIZE, FORGE, PULSE and AUDIT. It may prioritize already allowed
work, vote, hold, or commission one bounded specialist agenda. AUDIT can veto a
specific rule breach. A vote cannot override a human-only gate.

Specialists collect evidence, design, write, translate, check, calculate or deliver
within their packet. They do not approve their own release or expand their own scope.
External pages, articles, APIs and owner notes enter as untrusted data; they never
become instructions. Numeric and factual claims must retain evidence references.

## The six projects

### Caught Up

Promise: one useful AI-news briefing in English and Czech, with a hero image and a
clear reader destination. Inputs come from the allowed source registry. HERALD chooses
the story, STET edits the English surface, HACEK creates natural Czech, AUDIT can veto,
FRAME supplies exactly one licensed image or deterministic fallback, and RELAY delivers
a hash-checked edition package to `lukaskourilcz/aifirst`.

The target repository runs its own CI and Vercel deployment. BoardlessAI then checks
the target commit, both language routes, content marker, image dimensions and
attribution. One verification failure retries the same package without a model call;
a second failure reverts and pauses only Caught Up. Social publishing stays locked
until seven consecutive release proofs, complete credentials, project checks and the
global switch all pass. THREADS and INSTAGRAM remain disabled, but their contracts are
Carousel Studio-ready.

### Titty Tuesdays

Promise: develop a distinctive adult streetwear/lifestyle brand through seasons,
audience thinking and future campaign plans. It is currently pre-commerce. The system
does not operate a shop, buy ads, hold inventory, accept payment, show generated
people, claim sales or publish social posts.

Its 11:00 room opens only for a due agenda. PULSE and ANGLE lead strategy; optional
specialists cover audiences, stunts, taste, editorial quality and deterministic
assets. Complete campaign state is preserved even while production roles are off.
Social unlock needs four passing campaigns plus credentials and the safety checker;
the global kill switch still wins.

### Magazine Incubator

Promise: find evidence-backed publication niches without pretending that research is
a business. The 07:00 scan and 21:00 synthesis rooms are agenda-gated. Proposals name
the reader problem, evidence, position, content system, cost and stop conditions.

The incubator can found a project autonomously only when every field passes the signed
content-project template: existing agents and delivery surface, no new credential or
account, no commerce/legal/personal-data surface, no unplanned spend and no calendar
collision. Anything outside that fence becomes an exact owner request.

### FightAIQ

Promise: maintain sourced UFC and Oktagon fighter cards, discover confirmed bouts and
produce guarded deterministic early-model probabilities. Inputs are `$0` sources:
Wikimedia, approved free-tier APIs and owner-reviewed local imports. Source adapters
stop at their quota and hostile or unclear automated access remains disabled.

The 08:00 intake reacts to a material source change or due agenda. The 19:00 analysis
room requires an agenda plus the D8 switch. A prediction needs a future confirmed bout,
two agreeing bout sources and two eligible fighter-card snapshots. Outputs retain
model version, hashes and uncertainty. FightAIQ never places a bet, signs into a
bookmaker, publishes an affiliate link or calls model output advice or income. Its
reader-facing data belongs only in MMA Files; BoardlessAI shows operational stats.

### MMA Files

Promise: publish direct, sourced MMA journalism in English and natural Czech, and act
as the only public home for FightAIQ fighter/bout/prediction data. CANVAS assigns the
two daily slots, JAB drafts, STET removes generated-text tells, HACEK translates,
AUDIT checks the release, FRAME supplies the hero, and RELAY delivers to
`lukaskourilcz/mma-files` with the same retry/revert proof used by Caught Up.

An article is killed before any model call when its source packet is incomplete.
REACH and SPLIT are currently disabled. REACH's bilingual A/B draft contract already
uses live Carousel Studio templates; SPLIT remains measurement-only and idle. Social
unlock requires ten consecutive article proofs, credentials, project safety and the
global switch. Indexing remains an independent owner decision.

### Carousel Studio

Promise: provide one deterministic, brand-token-driven carousel engine for every
project. It lives inside this monorepo as `@boardlessai/carousel-studio`; no separate
service or image model is involved. A `carousel-template/1` record defines safe areas,
slides, text slots, fit rules, optional imagery and semantic version. The pure pipeline
is template + payload + brand tokens → SVG → PNG, with stable hashes.
The public and admin galleries serve the checked SVG directly so their previews do
not depend on a native image library inside a serverless request. Final deliverables
still use the deterministic PNG renderer.

Ten original seed layouts are live: quote, steps, statistic, before/after, headline
plus bullets, timeline, comparison, cover/CTA, five-slide story and minimal poster.
MOTIF records cited text observations without crawling or downloading imagery. EASEL
authors original data-only proposals. Schema, contrast, safe-area, token, overflow,
asset and determinism checks can promote a version automatically. Versions are
deprecated, never deleted. Owner ratings teach PALATE but cannot bypass checks.

The 13:00 room is agenda-gated and costs `$0` when idle. The protected admin renders
all slides for all statuses, three brands and three formats, with checks, ratings,
status controls and an individual-link inspiration box. The English public project
page shows live fixture previews and, after unlock, receipt-backed real posts. The
project has no social account, marketing or visitor analytics. Standalone extraction
is only a locked future earning possibility.

## Prague operating clock

Every row is a wake-up, not a promise to spend. GitHub stores 17 unique UTC cron
expressions covering Prague winter and summer time. Runtime DST resolution accepts
only the entry matching the intended local hour. Calendar validation rejects
collisions and the public calendar uses the same source.

| Prague | Window | Behavior | Maximum paid envelope |
| ---: | --- | --- | ---: |
| 05:00 | Caught Up edition | fixed service; evidence and live gates | room `$0.08`, production `$0.35` |
| 06:00 | Morning board | decision room; one specialist commission | cycle cap `$0.20` |
| 07:00 | Incubator scan | due agenda only | `$0.06` |
| 08:00 | FightAIQ intake | material change or due agenda | `$0.06` |
| 09:00 | MMA Files editorial | fixed assignment service | `$0.05` |
| 10:00 | MMA Files article AM | assigned slot and evidence only | production cap `$0.35` |
| 11:00 | Titty Tuesdays | due agenda only | `$0.08` |
| 13:00 | Carousel Studio | due agenda only | `$0.06` |
| 14:00 | Afternoon board | deterministic checkpoint | `$0` |
| 17:00 | Caught Up product | fixed service | `$0.08` |
| 18:00 | MMA Files article PM | assigned slot and evidence only | production cap `$0.35` |
| 19:00 | FightAIQ analysis | due agenda + D8/evidence gates | `$0.06` |
| 20:00 | MMA Files desk | due agenda only | `$0.05` |
| 21:00 | Incubator synthesis | due agenda only | `$0.06` |
| 22:00 | Night board | `$0` checkpoint, digest and document truth refresh | `$0` |

The sum of room envelopes is not expected daily spend: idle agenda rooms make no
provider call, evidence-killed production stops before generation, and checkpoints,
rendering, KPI evaluation, delivery verification and publishing verification are
deterministic. The daily API pace remains `$2.20`; the monthly model/API share is
`$42` inside the `$50` all-in ceiling.

## Public and admin presentation

The public site and protected admin use the original BoardlessAI presentation. The 27
established roles keep their approved photographs and names. Newer roles use neutral,
name-based placeholders until an approved portrait exists. Pages describe each role's
job and saved work without treating agents as entertainment characters.

The retired workplace-show skin does not appear in the interface. Quarters are not
called seasons and calendar days or meetings are not called episodes. Titty Tuesdays
may still use `season` inside its own campaign records because that term describes its
91-day brand plan, not the BoardlessAI interface. The five-day calendar keeps plain
project and meeting labels, project icons and status colors for completed, failed,
test, planned and intentionally unused windows.

The model-packet presentation barrier remains active. It keeps portraits, visitor
language and other decorative page details out of prompts and meeting packets.

## Agenda and priority queue

`state/priority-queue.json` stores bounded questions with the decision that would
change. The morning board may choose one. `state/meeting-agendas/queue.json` stores
the specialist request under `meeting-agenda/1`: target project/phase, requester,
source meeting, one short problem, evidence refs, earliest run, expiry and status.

Requests are allowlisted: morning can request TT, incubator scan, FightAIQ intake,
MMA editorial/desk or Studio; Studio can request Studio; each other project room can
request only its defined next step. One meeting creates at most one request, queues
are capped at 24 and eight per project, duplicate phase/date requests collapse, due
agendas are consumed once, and pending requests expire after three days. Seven days
without a consumed project agenda forces a morning-board commission or saved why-not.
A manual run bypasses the agenda timing only; it cannot bypass live, evidence, cost,
credential or safety gates.

## Forty-agent roster

Model routing is declared in `config/models.json` and `config/agent-routing.json`.
Council judgment uses Claude Sonnet 5 or GPT-5.6 Luna. Narrow specialists use the
shared Anthropic/OpenAI specialist routes, generally Claude Haiku 4.5 or GPT-5.6
Luna. Deterministic roles and checks do not call a provider merely because they have
an agent identity. Every paid room receives a bounded packet, turn/token caps and an
envelope before any call.

| Agent | One responsibility | Boundary |
| --- | --- | --- |
| VIZE | strategy and stage direction | cannot implement or approve a release alone |
| FORGE | production-ready implementation/release judgment | cannot widen approved scope |
| PULSE | growth, positioning and campaign direction | cannot activate accounts, ads or commerce |
| AUDIT | rule-based challenge and veto | must name a concrete violated rule |
| SCOUT | market/source evidence | cannot treat attention as demand |
| SCRIBE | public/admin summaries | cannot alter the underlying decision |
| LENS | experiment, forecast and finance interpretation | cannot manufacture missing measurements |
| QUILL | public-claim clarity and support | cannot add unsupported facts |
| RADAR | useful search discoverability | cannot manufacture SEO pages |
| KEEPER | compliance, privacy and permissions | cannot grant owner-only authority |
| THREADS | Threads-native draft copy | disabled; no publish/account action; live template refs only |
| INSTAGRAM | Instagram-native carousel draft | disabled; no freeform/image-model visual path |
| PEOPLE | role usefulness and routing review | cannot add roles without repeated evidence |
| LEDGER | costs, budget and unit economics | cannot create payments or invent revenue |
| HERALD | Caught Up story selection and edition quality | cannot bypass evidence/AUDIT/STET |
| STET | remove wording errors and generated-text tells | cannot change supported facts |
| HACEK | natural Czech translation/editorial register | cannot change uncertainty or intent |
| SPARK | one ledger-checked Caught Up product idea | cannot recycle rejected ideas without evidence |
| VAULT | idea memory and duplicate control | cannot approve an idea |
| FRAME | article heroes and deterministic visual rendering | social path is Carousel Studio only; no publishing |
| RELAY | bounded delivery, digest and reconciliation | cannot edit consumer-app code outside packages |
| ANGLE | precise position and niche | cannot assert an audience without evidence |
| COHORT | adult audience definition without personal data | cannot claim unsupported reach |
| FUNNEL | costed channel/test planning | cannot activate ads, offers or commerce |
| PALATE | rating-linked taste memory | cannot edit pinned prompts or treat taste as evidence |
| SCENE | TT competitor/culture signals | cannot fabricate brands, prices or examples |
| STUNT | permission-aware low-cost stunts | cannot execute or buy an activation |
| CORNER | sourced UFC files | cannot promote critical fields without required agreement |
| SPOTTER | sourced Oktagon files | cannot introduce KSW or unclear automated access |
| TAPE | cited fight-context adjustments | cannot hand-edit a probability |
| SIGMA | deterministic fight model and calibration | cannot choose an outcome manually |
| VIG | captured odds and economic comparison | cannot place bets or claim profit |
| SONAR | source terms, cost and overlap review | cannot wire a source before terms approval |
| CANVAS | MMA Files assignments and release quality | kills unsupported slots before spend |
| JAB | direct sourced MMA reporting | cannot promote unsupported detail into copy |
| REACH | bilingual MMA social variants | disabled; drafts use only live Carousel Studio templates |
| SPLIT | future social test analysis | disabled while metrics ingestion is false |
| EASEL | original carousel-template data | cannot copy a source or edit renderer code |
| MOTIF | cited textual layout observations | cannot crawl collections or download inspiration images |
| PIVOT | evidence bridge between FightAIQ and MMA Files | cannot turn response/context into hidden model input |

## Content, social and Carousel Studio flow

Caught Up and MMA Files spend on article language work only after source gates pass.
Both produce English and Czech; both use one licensed hero/fallback; both are delivered
through a repository-scoped App and verified after deployment. Social payload
generation is separately gated, so locked social projects make no caption/model calls.

When enabled, every social producer returns a live `template_id`, semantic `version`
and bounded `content` payload. FRAME resolves the version through Carousel Studio,
binds the project's tokens, renders PNGs, validates accessibility/provenance and saves
the renderer version on the queue/receipt. Schema validation rejects missing or
non-live references. There is no freeform social image path.

The publisher validates the queue without an LLM, uses an idempotency key, records a
platform receipt, and checks the live post at `$0`. One retry is allowed; a second
failure pauses that project. It never follows, likes, comments, messages or downloads
engagement data.

## KPI and quarter protocol

Q1 is a 90-day quarter beginning 2026-08-03. Content and social pace have a 14-day
spin-up. The daily evaluator reads saved state and labels targets on-track, at-risk,
off-track or unavailable; missing Phase 3 measurement is never converted to zero.
Company targets cover valid windows, all-in/API cost, content volume, delivery proof,
founding/rated proposals and agenda review. Each project has targets appropriate to
its promise. Carousel Studio requires ten live templates, six passing new proposals,
100% engine-rendered published carousels after unlock, green determinism and one cited
iteration per brand.

At quarter end, fewer than 70% passing targets or any missed critical target creates a
mandatory `continue / pivot / stop` reassessment. A company miss also reviews the
operating pattern. The protocol can create an owner packet; it cannot change stage or
lower a past target. The owner may edit future seed values in
`config/kpis/2026-Q1.json`.

## Money model

The public `/money` projection combines API ledger entries, owner-entered fixed costs,
verified revenue and KPI readiness. Recognized revenue remains `$0` until the owner
accepts a real event. Empty fixed-cost state means not entered, not free.

Caught Up sponsorship, MMA Files sponsorship/affiliate and Titty Tuesdays commerce
are locked hypotheses with explicit readiness and future legal/account/payment work.
FightAIQ is intentionally unmonetized through Q1/Q2; review begins only after 30
evaluated events and calibration. The incubator is research. Carousel Studio is an
internal engine; standalone extraction is a locked future possibility. Readiness may
prepare a proposal but never activate an earning method.

## Safety and launch gates

- `AUTONOMY_KILL_SWITCH`, project live switches, `SOCIAL_KILL_SWITCH`, pause files and
  budget stops deny work independently.
- Caught Up and MMA Files release only evidence-valid bilingual packages and prove the
  deployed result; failure is retried once, then reverted and project-paused.
- FightAIQ needs source/card/bout gates and D8; no bet or advice path exists.
- Template founding cannot create credentials, accounts, commerce, legal or personal-
  data surfaces. Carousel template promotion cannot bypass deterministic checks.
- `METRICS_INGESTION_ENABLED=false`; no visitor/reader/engagement data crosses into
  state or prompts. Public pages expose defensive projections only.
- Credentials never enter Git, prompts, meetings, public output or logs. External URLs
  are allowlisted and external content is untrusted.
- Payments, new spend, budget raises, account creation, legal posture and personal
  data remain human-only regardless of a model vote.

## Decision map D1–D12

| Decision | Current effect |
| --- | --- |
| D1 Agent-owned release | Caught Up/MMA agents release inside contracts; deterministic deploy proof replaces owner content approval |
| D2 Phased social activation | per-project counters/credentials plus global kill switch; idempotent posting and verification |
| D3 Licensed images | exactly one licensed hero or deterministic fallback per article |
| D4 Workplace-show skin | historical visual direction; D12 removes the skin while its model-packet barrier remains |
| D5 Operating priorities | bounded priority queue, one morning commission and honest no-work state |
| D6 Template founding | fenced content-project founding without new human-only surfaces |
| D7 Unchanged gates | money, accounts, legal, commerce, personal data and scope remain owner-only |
| D8 FightAIQ analysis/free data | guarded early-model analysis is approved; evidence and free-source rules bind it |
| D9 Measurement readiness | contracts/assignment may exist, but ingestion and SPLIT remain off |
| D10 Money and quarterly KPIs | public cost/revenue truth, 90-day protocol and owner-only earning activation |
| D11 Carousel Studio | sixth project, monorepo engine, 10 live templates, lifecycle, room and public showcase |
| D12 Original presentation | approved agent photographs and plain interface labels; no workplace-show framing |

Historical records remain append-only under `state/decisions/`; later decisions may
supersede a setting without rewriting the earlier context.

## Launch definition and owner handoff

Code readiness means contracts, dry proofs, tests, delivery adapters, rendering,
posting validation, gates, public/admin projections and rollback paths exist. It does
not mean Codex can create accounts, know invoices or accept legal terms. The one
deduplicated human checklist is `NEEDS_YOUR_HELP_NOW.md`; `NEEDED.md` and
`MANUAL STEPS.md` explain the same items and verification order without inventing
additional approval gates.

After those human inputs, a real workflow must report `dry=false` and `skip=false`.
An honest `NO_EDITION`, killed article or `not-needed` agenda is a successful `$0`
outcome, not a reason to rerun paid work.

## Open questions for Fable

1. Which owner-facing view would make six projects feel simpler without hiding gates
   or unavailable data?
2. Which repeated board decisions can become deterministic checks, and which still
   require genuine judgment?
3. After one full quarter, which rooms produce changed decisions often enough to keep
   their cadence and which should become event-triggered?
4. How should Carousel Studio ratings reveal useful template families without turning
   taste into a self-reinforcing monoculture?
5. What is the smallest lawful measurement plan worth enabling in Phase 3, and what
   decisions would each metric actually change?
6. Can Caught Up and MMA Files share more source verification or language QA without
   flattening their distinct editorial voices?
7. What evidence would justify creating a 41st specialist rather than tightening a
   packet or sharing an existing role?
8. Which earning hypothesis can be tested without weakening editorial trust or opening
   an account prematurely?
9. How should the system explain its rare failures so the owner can intervene once,
   not babysit recurring workflows?
10. What parts of Carousel Studio would need isolation, documentation and demand proof
    before standalone extraction becomes rational?
