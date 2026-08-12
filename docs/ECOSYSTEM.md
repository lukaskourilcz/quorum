# BoardlessAI ecosystem — standing full-context brief

Updated: 2026-08-12
Status: implementation complete; live work remains locked behind pending venture countersignatures and the owner-only setup in `docs/NEEDED.md`
Audience: owner, product partners and Fable brainstorming  
Authority: current code, committed state, decisions D1–D13 and the pending venture founding records

## What BoardlessAI is

BoardlessAI is a Git-backed operating system for nine AI-assisted projects. It is not
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
Titty Tuesdays remains pre-commerce. FightAIQ never places bets. The Design Lab is
an internal renderer with a public gallery, not another social brand. BOOKSOFHISTORY
produces owner-reviewed social drafts only: it has no public site, book pages, SEO
archive, database, newsletter, storefront, account, channel or posting path.

## How to maintain this document

This file has two layers. The sections outside the generated markers are curated
design truth. Every future implementation handoff must update them when it changes a
project, role, decision, clock window, gate, cost rule or owner action. The generated
block is rebuilt at `$0` from committed state by `pnpm docs:refresh`, during production
builds and after a real 22:00 checkpoint. Never hand-edit the generated block.

<!-- GENERATED:CURRENT-OPERATING-TRUTH:START -->
## Current operating truth (generated)

Refreshed from committed state: **2026-08-12T20:04:18.552Z**. This block is generated deterministically; edit the source state, not these lines.

| Item | Current value |
| --- | --- |
| Portfolio | 10 projects; 10 marked operating |
| Agent roster | 39 active: 24 Anthropic, 15 OpenAI |
| Scheduled specialist/service rooms | 13; combined maximum room envelopes $1.51 if every room is commissioned |
| Approved spend boundary | $30.00 all-in monthly; $25.00 model/API share; $1.00 daily model/API pace |
| Recorded API spend | $3.97 this month; $3.99 cumulative |
| Entered fixed costs | $0.00 monthly |
| Recognized revenue | $0.00 |
| KPI quarter | 2026-Q1; open; 32 on track, 2 at risk, 11 off track, 8 unavailable |
| Critical KPI gaps | company.monthly-api-usd, marketingshark.package-completeness, marketingshark.truth-gate-violations |
| FightAIQ analysis | approved by D8; production still requires `FIGHTAIQ_ANALYSIS_ENABLED=true` plus live and evidence gates |
| Visitor/engagement measurement | disabled (`METRICS_INGESTION_ENABLED=false`) |
| Global social posting | stopped while `SOCIAL_KILL_SWITCH=true`; project counters and credentials remain separate gates |

### Project modes and social readiness

| Project | Mode | Rooms | Disabled optional roles | Social readiness |
| --- | --- | --- | --- | --- |
| Caught Up | operating | cu-edition 05:00; cu-product 17:00 | THREADS, INSTAGRAM | locked (2/7) |
| Titty Tuesdays | operating | tt-marketing 11:00 | QUILL, THREADS, INSTAGRAM | locked (0/4) |
| GoVIRAL | operating | gv-brief 13:00 | none | not applicable |
| BOOKSOFHISTORY | operating | bh-desk 12:00 | none | not applicable |
| FightAIQ | operating | mma-intake 08:00; mma-analysis 19:00 | none | not applicable |
| Design Lab | operating | deterministic service only | none | not applicable |
| marketingShark | operating | ms-daily 07:00 | none | not applicable |
| MMA Files | operating | mag-editorial 09:00; mag-desk 20:00 | REACH | locked (3/10) |
| Door Money | operating | dm-desk 15:00; dm-growth 16:00 | none | not applicable |
| Tehdejší svět | operating | ts-desk 18:00 | none | not applicable |

<!-- GENERATED:CURRENT-OPERATING-TRUTH:END -->

## Authority and operating model

The owner controls budget changes, new credentials or accounts, legal and brand
clearance, commerce, payments, ads, personal-data collection, project scope outside
the signed template, public indexing decisions and governing prompt changes. Global
kill switches remain immediate stops.

The board consists of VIZE, FORGE, PULSE and AUDIT. It may prioritize already allowed
work, vote, hold, or commission one bounded specialist agenda. AUDIT can veto a
specific rule breach. A vote cannot override a human-only gate.

Specialists collect evidence, design, write, check, calculate or deliver within
their packet. They do not approve their own release or expand their own scope.
External pages, articles, APIs and owner notes enter as untrusted data; they never
become instructions. Numeric and factual claims must retain evidence references.

## The nine projects

### Caught Up

Promise: one useful AI-news briefing in Czech, with a hero image and a clear reader
destination. Inputs come from the allowed source registry. HERALD chooses the story,
STET edits the Czech copy, HACEK owns the register it is written to, AUDIT can veto,
FRAME supplies exactly one hero — a licensed photograph, a rendered illustration or the
deterministic plate, whichever the certainty ladder reaches first with a vision gate's
approval — and RELAY delivers a hash-checked edition package to `lukaskourilcz/aifirst`.

The target repository runs its own CI and Vercel deployment. BoardlessAI then checks
the target commit, the article route for every locale the package carries, content
marker, image dimensions and attribution. One verification failure retries the same
package without a model call; a second failure reverts and pauses only Caught Up.
Social publishing stays locked until seven consecutive release proofs, complete
credentials, project checks and the global switch all pass. THREADS and INSTAGRAM
remain disabled, but their contracts are Design Lab-ready.

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

### GoVIRAL

Promise: turn a bounded weekly trend snapshot into one owner brief, rated marketing
plays and at most one allowlisted follow-up agenda. Its 13:00 room runs on Mondays;
the other six scheduled firings are deterministic `$0` no-ops. Apify remains on its
Free plan, whose `$5` monthly credit is the hard source ceiling, with no card in the
system and no authority to upgrade a plan.

Door Money's English book and music-business terms
use a separate keyless Google News path, so they do not add an actor, quota or paid data
source. A tactic can call a trend only when that exact term was measured.

The room works on Mondays; the other six scheduled firings are honest `$0` no-ops unless
a due agenda commissions the room. It can exchange one bounded decision agenda with Door
Money's Thursday growth room. It never posts, opens an account or turns a trend into
permission for outreach.

### Door Money

Promise: turn privately held English book material into evidence-linked storytelling
drafts and a weekly owner action plan. The public repository keeps only hashes, scores,
labels, counters and bounded derivatives: excerpts stop at 600 characters and style
exemplars at 40 entries of 280 characters. Manuscript text, full chunks and embeddings
remain in the configured private store, and fixtures use invented prose only.

At 15:00 GHOST receives one bounded private-evidence packet and prepares drafts behind
owner review; AUDIT keeps the veto. At 16:00 BOOKER works only on Thursdays, turning the
rotating research agenda and owner-entered outcomes into cited tasks and templates; the
other six firings cost `$0`. Approval hands a summary to the shared Design Lab, which is
the venture's only rendering path. Nothing can post, create an account, touch a channel,
send outreach or authorize spend. The protected admin exposes recommendations, actions
and knowledge, and records owner review decisions, manual completions and manual results.

### marketingShark

Promise: one quiz question a day, written up honestly enough that a reader gets value from
the carousel whether or not they ever open the product. CHUM writes the day's copy in Czech and
again in English, and AUDIT holds the veto seat. MAKO's weekly review is specified — its
instructions are `orchestrator/prompts/marketingshark/strategy.md` — and is not yet wired to a
room, so no weekly call runs and none is billed.

devShark is the first brand and the only one enabled: its 3,633-question webdev bank is
consumed read-only as a committed snapshot pinned to a source commit, and nothing is written
back to that repository. geoShark is present in config and disabled; enabling it is one
importer run and one `enabled` flag.

Everything except one model call per brand per day is deterministic and costs nothing. Which
question runs comes from a seeded order over the bank, so every question is served once before
any repeats and the same date always produces the same question. Which opening line fronts it
is decided by the Design Lab's hook brain, not by the model and no longer from a library
inline in this venture's config: the studio evaluates the central library's gates against the
question's own metadata — "Two answers look right. One is." may only run on a question that
actually has four options and is not trivial — and slide 1 renders that line verbatim. CHUM
writes slides 2 to 5 to cash the promise slide 1 makes, and there is no field left in its
output through which it could author hook copy at all. After CHUM answers, deterministic gates
check that the assigned hook line is unchanged, that the brand's closing line is verbatim, that
any code block reached the slide byte for byte, and that no number in the hook appears in
neither the question nor the assigned line. A failure aborts the brand and leaves nothing behind.

Nothing it writes can post. marketingShark owns no social account and no credentials, every
package is written with `status: "draft"` and every approval check pending, and it is not a
publishing venture at all — the publisher refuses it by name rather than by an absent switch.

### BOOKSOFHISTORY

Promise: turn cheap candidate intelligence into sourced Czech and English social
stories about the history behind famous books. FOLIO selects from an authored seed
library and reusable shelf dossiers; PLOT mines a language-neutral story brief and
writes two independent native-language packages from the same accepted claims. QUILL,
HACEK and AUDIT enforce claim state, register and release safety. Every factual
sentence resolves to dossier claim ids; rejected claims are excluded and legends must
be labelled as legends.

The `bh-desk` room wakes daily at 12:00 Prague and resumes the recorded selection,
research or production phase instead of skipping missed work. Paid research is
idempotent by `(bookId, briefHash)`, costs at most `$0.10` per call, `$0.50` per cycle
and `$5.00` per month, and is reused across both languages and later features. When
budget tightens, the cycle drops from two research candidates to one, then stretches
at `$0`, then removes the room rather than weakening a ceiling.

Nothing is published or posted by the system. Recommendations stay drafts until the
owner approves each lane, sends it through the Design Lab and posts it manually.
There is no public BOOKSOFHISTORY route or delivery target. The protected admin shows
shortlists, dossiers and features and accepts explicit owner-entered per-lane results;
automatic metrics ingestion remains off. Book-cover references are context only and
never render. Quotes stop at 300 characters and require attribution.

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

Promise: publish direct, sourced MMA journalism in natural Czech, and act as the only
public home for FightAIQ fighter/bout/prediction data. CANVAS assigns the two daily
slots, JAB drafts in Czech, STET removes generated-text tells, HACEK owns the register
and the copy repair, AUDIT checks the release, FRAME supplies the hero, and RELAY
delivers to `lukaskourilcz/mma-files` with the same retry/revert proof used by Caught
Up.

An article is killed before any model call when its source packet is incomplete.
REACH and SPLIT are currently disabled. REACH's Czech A/B draft contract already
uses live Design Lab templates; SPLIT remains measurement-only and idle. Social
unlock requires ten consecutive article proofs, credentials, project safety and the
global switch. Indexing remains an independent owner decision.

### Design Lab

Promise: provide one deterministic, brand-token-driven carousel engine for every
project. It lives inside this monorepo as `@boardlessai/carousel-studio`; no separate
service or image model is involved. A `carousel-template/1` record defines safe areas,
slides, text slots, fit rules, optional imagery and semantic version. The pure pipeline
is template + payload + brand tokens → SVG → PNG, with stable hashes.
The public and admin galleries serve the checked SVG directly so their previews do
not depend on a native image library inside a serverless request. Final deliverables
still use the deterministic PNG renderer.

Eleven original seed layouts are live: quote, steps, statistic, before/after, headline
plus bullets, timeline, comparison, cover/CTA, five-slide story, minimal poster and
quiz-code-context. The eleventh was added for marketingShark and justified by a gap
rather than a preference: every other live layout's widest monospace slot holds 100
characters over two lines, which is a source label and not a program, so a quiz question
carrying a fenced code block had nowhere legible to put it. Brand token sets now cover
six brands — devShark and geoShark arrived with marketingShark, BOOKSOFHISTORY added a
typographic, cover-free set and Door Money adds the English book-storytelling set.
MOTIF records cited text observations without crawling or downloading imagery. EASEL
authors original data-only proposals. Schema, contrast, safe-area, token, overflow,
asset and determinism checks can promote a version automatically. Versions are
deprecated, never deleted. Owner ratings teach PALATE but cannot bypass checks.

The studio is also the **assignment brain for hook copy across every surface**. A hook is
one line on slide 1 whose job is to earn the next interaction, and it is gated: each hook
declares `truthRequires` predicates and may only render on content whose metadata makes
them true. Gates license claims — that is the entire honesty model, and it is why the
engine ports everywhere while the strings do not. The libraries live beside the engine in
`studio/hooks/`: 50 hooks for devShark and geoShark, 12 for DNESKAi and 16 for MMA Files,
each written against its own surface's confirmed vocabulary. The `no-hook` fallback remains
the standing behaviour for any pack whose gates all fail — the template's own headline renders
and the pack is logged rather than blocked.

**`docs/hooks/` is the canonical knowledge base for hooks and short-form viral copy**, for
this repository and for every consuming one — seven files covering mechanism catalogue and
evidence tags (`01`), the writing playbook and honesty rules (`02`), metrics, cooldowns and
A/B method (`03`), schema, predicate semantics and the Tier B build specs (`04`), per-surface
vocabularies and the extra honesty rules for news and MMA (`05`), and assignment, cooldown
scopes, override limits and conformance vectors (`06`). Consuming repositories reference
these files rather than copying them; a forked playbook drifts within weeks.

Assignment is deterministic and costs `$0`: eligible set from the item's metadata, then a
channel cooldown of `max(2 × cooldownDays, 14)` days, then no repeat of the channel's
previous archetype, then a seeded pick over what survives — seeded from channel, date and
item so a rebuild reaches the same slide 1 that a rebuild reaches the same pixels. The
decision is recorded as `hook-assignment/1` in the pack. Marketing meetings may swap the
proposed hook for another member of the recorded eligible set and for nothing else; the set
is hashed, so widening it to smuggle a hook in stops the package validating. `lint:hooks`
enforces the craft caps in CI.

Hooks front carousels and nothing else. A `hook-library/1` delivery to the quiz apps was built
and then removed on 2026-08-08: devShark already carries a rotating advisory line under every
question, and a hook's mechanism is to earn a *next* interaction, which is real on a feed and
not in a quiz the reader has already opened and started. The apps stay standalone and receive
no copy from here.

The 13:00 room is agenda-gated and costs `$0` when idle. The protected admin renders
all slides for all statuses, configured brands and formats, with checks, ratings,
status controls and an individual-link inspiration box. The English public project
page shows live fixture previews and, after unlock, receipt-backed real posts. The
project has no social account, marketing or visitor analytics. Standalone extraction
is only a locked future earning possibility.

## Prague operating clock

Every row is a wake-up, not a promise to spend. The schedule has 32 Vercel entries across
19 unique UTC cron expressions covering Prague winter and summer time. Runtime DST resolution accepts
only the entry matching the intended local hour. Calendar validation rejects
collisions and the public calendar uses the same source.

| Prague | Window | Behavior | Maximum paid envelope |
| ---: | --- | --- | ---: |
| 05:00 | Caught Up edition | fixed service; evidence and live gates | room `$0.08`, production `$0.35` |
| 06:00 | Morning board | decision room; one specialist commission | cycle cap `$0.20` |
| 07:00 | marketingShark carousel | standing daily; one paid call per enabled brand | `$0.10` per enabled brand |
| 08:00 | FightAIQ intake | material change or due agenda | `$0.06` |
| 09:00 | MMA Files editorial | fixed assignment service | `$0.05` |
| 10:00 | MMA Files article | assigned slot and evidence only | production cap `$0.35` |
| 11:00 | Titty Tuesdays | standing future-eshop marketing ideation; optional focused agenda | `$0.08` |
| 12:00 | BOOKSOFHISTORY desk | standing daily; resumes the current selection, research or production phase | research `$0.10` per call, `$0.50` per cycle and `$5.00` per month |
| 13:00 | GoVIRAL trend room | standing weekly; Mondays only, the other six days are `$0` no-ops | `$0.06` |
| 14:00 | Afternoon board | deterministic checkpoint | `$0` |
| 15:00 | Door Money desk | standing daily; private knowledge, evidence and budget gates | `$0.08` |
| 16:00 | Door Money growth | standing weekly; Thursdays only, the other six days are `$0` no-ops | `$0.06` |
| 17:00 | Caught Up product | fixed service | `$0.08` |
| 19:00 | FightAIQ analysis | due agenda + D8/evidence gates | `$0.06` |
| 20:00 | MMA Files desk | due agenda only | `$0.05` |
| 22:00 | Night board | `$0` checkpoint, digest and document truth refresh | `$0` |

The sum of room envelopes is not expected daily spend: idle agenda rooms make no
provider call, evidence-killed production stops before generation, and checkpoints,
rendering, KPI evaluation, delivery verification and publishing verification are
deterministic. The daily API pace is `$1.00`; the monthly model/API share is
`$25` inside the `$30` all-in ceiling.

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

Requests are allowlisted: morning can request TT, GoVIRAL, FightAIQ intake or MMA
editorial/desk; each other project room can request only its defined next step. GoVIRAL
and Door Money growth can hand one bounded decision agenda to each other. One meeting creates at most one request, queues
are capped at 24 and eight per project, duplicate phase/date requests collapse, due
agendas are consumed once, and pending requests expire after three days. Seven days
without a consumed project agenda forces a morning-board commission or saved why-not.
A manual run bypasses the agenda timing only; it cannot bypass live, evidence, cost,
credential or safety gates.

## Roster: thirty-five working roles, nine stood down

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
| SCOUT | paused | stood down; no venture is looking for a new market right now |
| SCRIBE | paused | stood down; the record writers produce the summaries |
| LENS | paused | stood down until there are measurements to interpret |
| QUILL | public-claim clarity and support | cannot add unsupported facts |
| RADAR | paused | stood down; neither magazine is optimising for search yet |
| KEEPER | compliance, privacy and permissions | cannot grant owner-only authority |
| THREADS | paused | stood down; no channel has credentials and nothing composes for one |
| INSTAGRAM | paused | stood down with THREADS; the studio renders every carousel |
| PEOPLE | role usefulness and routing review | cannot add roles without repeated evidence |
| LEDGER | costs, budget and unit economics | cannot create payments or invent revenue |
| HERALD | Caught Up story selection and edition quality | cannot bypass evidence/AUDIT/STET |
| STET | remove wording errors and generated-text tells | cannot change supported facts |
| HACEK | the Czech editorial register and copy floor | cannot change uncertainty or intent |
| SPARK | one ledger-checked Caught Up product idea | cannot recycle rejected ideas without evidence |
| VAULT | idea memory and duplicate control | cannot approve an idea |
| FRAME | article heroes and deterministic visual rendering | social path is the Design Lab only; no publishing |
| RELAY | bounded delivery, digest and reconciliation | cannot edit consumer-app code outside packages |
| ANGLE | precise position and niche | cannot assert an audience without evidence |
| COHORT | adult audience definition without personal data | cannot claim unsupported reach |
| FUNNEL | paused | stood down; no channel exists to plan a funnel into |
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
| REACH | Czech MMA social variants | disabled; drafts use only live Design Lab templates |
| SPLIT | retired | stood down; the reader measurement it waited for is not being built |
| EASEL | retired | stood down; the studio renders deterministically and holds no meeting |
| MOTIF | retired | stood down with EASEL; nothing reads layout observations |
| PIVOT | evidence bridge between FightAIQ and MMA Files | cannot turn response/context into hidden model input |
| MAKO | marketingShark direction and KPI honesty; its weekly package review is specified, not yet wired | cannot post, cannot edit the hook library silently, cannot invent a metric |
| CHUM | one day's carousel copy per brand, Czech and English | cannot choose the question, the hook, the template or the closing line |
| FOLIO | BOOKSOFHISTORY selection, bounded research briefs and dossier-backed story choice | cannot call research outside a recorded decision, post or override claim state |
| PLOT | dossier story mining, one canonical brief and independent Czech/English packages | cannot invent claims, change verification state or post |
| GHOST | evidence-linked English Door Money storytelling drafts | cannot select passages, alter the private knowledge profile or publish |
| BOOKER | cited Door Money owner tasks and reusable templates | cannot contact anyone, spend or claim an unrecorded result |

## Content, social and the Design Lab's flow

Caught Up and MMA Files spend on article language work only after source gates pass.
Both publish in Czech only; both use one licensed hero/fallback; both are delivered
through a repository-scoped App and verified after deployment. Social payload
generation is separately gated, so locked social projects make no caption/model calls.

Door Money never enters that publisher. Owner approval writes only a bounded English
summary and copy package for the Design Lab; the owner must perform any external post.
The shared renderer remains deterministic and `$0`, and no raw manuscript or embedding
crosses into its state.

When enabled, every social producer returns a live `template_id`, semantic `version`
and bounded `content` payload. FRAME resolves the version through the Design Lab,
binds the project's tokens, renders PNGs, validates accessibility/provenance and saves
the renderer version on the queue/receipt. Schema validation rejects missing or
non-live references. There is no freeform social image path.

The publisher validates the queue without an LLM, uses an idempotency key, records a
platform receipt, and checks the live post at `$0`. One retry is allowed; a second
failure pauses that project. It never follows, likes, comments, messages or downloads
engagement data.

BOOKSOFHISTORY does not enter that publisher. Its approved lane becomes a Design Lab
handoff for the owner, never a platform job; an owner may later record the posted URL
and result in the protected admin, but no crawler or channel integration measures it.

## KPI and quarter protocol

Q1 is a 90-day quarter beginning 2026-08-03. Content and social pace have a 14-day
spin-up. The daily evaluator reads saved state and labels targets on-track, at-risk,
off-track or unavailable; missing Phase 3 measurement is never converted to zero.
Company targets cover valid windows, all-in/API cost, content volume, delivery proof,
founding/rated proposals and agenda review. Each project has targets appropriate to
its promise. The Design Lab requires ten live templates, six passing new proposals,
100% engine-rendered published carousels after unlock, green determinism and one cited
iteration per brand.

BOOKSOFHISTORY targets at least 90% completed-or-honestly-stretched cycles, at least
eight features in its lowest full month, at least 70% reuse of paid dossiers after a
30-day ramp, 100% verification-state coverage and zero legends stated as fact. Its
model-spend KPI is at most `$8` monthly; the stricter research ceiling remains `$5`.

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
evaluated events and calibration. The Design Lab is an internal engine; standalone extraction is a locked future possibility. Readiness may
prepare a proposal but never activate an earning method.
BOOKSOFHISTORY has no website, newsletter, database, store or other earning surface in
this program; building one would require a separate owner decision.
Door Money is likewise drafts-only: it has no earning activation, publisher, channel or
account, and its owner action packets cannot send the outreach they describe.

## Safety and launch gates

- `AUTONOMY_KILL_SWITCH`, project live switches, `SOCIAL_KILL_SWITCH`, pause files and
  budget stops deny work independently.
- Caught Up and MMA Files release only evidence-valid Czech packages and prove the
  deployed result; failure is retried once, then reverted and project-paused.
- FightAIQ needs source/card/bout gates and D8; no bet or advice path exists.
- BOOKSOFHISTORY requires its pending founding countersignature and portfolio live
  switch, stays drafts-only and manual-posted, never renders a book cover, and caps
  attributed quotes at 300 characters. Its truth and nested research guards deny work
  independently of the portfolio budget.
- Template founding cannot create credentials, accounts, commerce, legal or personal-
  data surfaces. Carousel template promotion cannot bypass deterministic checks.
- `METRICS_INGESTION_ENABLED=false`; no visitor/reader/engagement data crosses into
  state or prompts. Public pages expose defensive projections only.
- Credentials never enter Git, prompts, meetings, public output or logs. External URLs
  are allowlisted and external content is untrusted.
- Door Money manuscript text, full chunks and embeddings never enter this public
  repository; committed excerpts and exemplars are contract-capped and test-enforced.
- Payments, new spend, budget raises, account creation, legal posture and personal
  data remain human-only regardless of a model vote.

## Decision map D1–D14

| Decision | Current effect |
| --- | --- |
| D1 Agent-owned release | Caught Up/MMA agents release inside contracts; deterministic deploy proof replaces owner content approval |
| D2 Phased social activation | per-project counters/credentials plus global kill switch; idempotent posting and verification |
| D3 Licensed images | exactly one hero per article, from a gated certainty ladder: entity-linked photograph, curated file, licensed search, generated illustration, deterministic plate |
| D4 Workplace-show skin | historical visual direction; D12 removes the skin while its model-packet barrier remains |
| D5 Operating priorities | bounded priority queue, one morning commission and honest no-work state |
| D6 Template founding | fenced content-project founding without new human-only surfaces |
| D7 Unchanged gates | money, accounts, legal, commerce, personal data and scope remain owner-only |
| D8 FightAIQ analysis/free data | guarded early-model analysis is approved; evidence and free-source rules bind it |
| D9 Measurement readiness | contracts/assignment may exist, but ingestion and SPLIT remain off |
| D10 Money and quarterly KPIs | public cost/revenue truth, 90-day protocol and owner-only earning activation |
| D11 Design Lab | sixth project, monorepo engine, 11 live seed templates, lifecycle, room and public showcase |
| D12 Original presentation | approved agent photographs and plain interface labels; no workplace-show framing |
| D13 marketingShark founding | seventh project, `ms-daily` at 07:00, MAKO and CHUM, devShark folded in as a portfolio product, geoShark present and disabled, drafts only |
| D14 BOOKSOFHISTORY founding | eighth project, `bh-desk` at 12:00, FOLIO and PLOT, reusable dossiers, independent Czech/English drafts, manual posting and no public surface |
| Door Money founding | ninth project, `dm-desk` at 15:00 and Thursday-only `dm-growth` at 16:00, private manuscript boundary, Design Lab-only rendering and drafts/actions only |

Historical records remain append-only under `state/decisions/`; later decisions may
supersede a setting without rewriting the earlier context.

## Launch definition and owner handoff

Code readiness means contracts, dry proofs, tests, delivery adapters, rendering,
posting validation, gates, public/admin projections and rollback paths exist. It does
not mean Codex can create accounts, know invoices or accept legal terms. The one
deduplicated human checklist is `docs/NEEDED.md`, which carries the items, the reference
tables and the verification order in one place without inventing additional approval
gates.

After those human inputs, a real workflow must report `dry=false` and `skip=false`.
An honest `NO_EDITION`, killed article or `not-needed` agenda is a successful `$0`
outcome, not a reason to rerun paid work.

## Open questions for Fable

1. Which owner-facing view would make nine projects feel simpler without hiding gates
   or unavailable data?
2. Which repeated board decisions can become deterministic checks, and which still
   require genuine judgment?
3. After one full quarter, which rooms produce changed decisions often enough to keep
   their cadence and which should become event-triggered?
4. How should the Design Lab ratings reveal useful template families without turning
   taste into a self-reinforcing monoculture?
5. What is the smallest lawful measurement plan worth enabling in Phase 3, and what
   decisions would each metric actually change?
6. Can Caught Up and MMA Files share more source verification or language QA without
   flattening their distinct editorial voices?
7. What evidence would justify creating a 47th registered role rather than tightening a
   packet or sharing an existing role?
8. Which earning hypothesis can be tested without weakening editorial trust or opening
   an account prematurely?
9. How should the system explain its rare failures so the owner can intervene once,
   not babysit recurring workflows?
10. What parts of the Design Lab would need isolation, documentation and demand proof
    before standalone extraction becomes rational?
