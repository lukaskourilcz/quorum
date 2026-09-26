# BoardlessAI ecosystem — standing full-context brief

Updated: 2026-09-26
Status: since `operations-2026-09b` only DNESKAi, marketingShark, GoVIRAL, the Design Lab and WebDev Signal run; every other venture is paused with its code and state kept
Audience: owner, product partners and Fable brainstorming  
Authority: current code, committed state, decisions D1–D14, the 2026-08-26 autonomy-first decision, the countersigned founding records and `operations-2026-09b`

## What BoardlessAI is

BoardlessAI is a Git-backed operating system for fourteen registered AI-assisted projects,
five of them running. It is not an always-on group chat and it does not reward agent activity for its own sake. A
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
Door Money, Tehdejší svět and Kvórum are also drafts-only. Tehdejší svět adopts marketing for
an existing product without connecting to its separate repository: this repository
reads one hand-committed, hash-verified facts file and never reads or writes the product.
Kvórum's founding and daily-capacity decisions are countersigned, and the registry pause
holds it: it runs nothing and costs `$0`.

## How to maintain this document

This file has two layers. The sections outside the generated markers are curated
design truth. Every future implementation handoff must update them when it changes a
project, role, decision, clock window, gate, cost rule or owner action. The generated
block is rebuilt at `$0` from committed state by `pnpm docs:refresh`, during production
builds and on the morning room's day checkpoint. Never hand-edit the generated block.

<!-- GENERATED:CURRENT-OPERATING-TRUTH:START -->
## Current operating truth (generated)

Refreshed from committed state: **2026-09-25T13:03:54.977Z**. This block is generated deterministically; edit the source state, not these lines.

| Item | Current value |
| --- | --- |
| Portfolio | 11 public projects; 3 owner-only workspaces |
| Agent roster | 40 active: 25 Anthropic, 15 OpenAI |
| Scheduled specialist/service rooms | 14; combined maximum room envelopes $1.61 if every room is commissioned |
| Approved spend boundary | $50.00 all-in monthly; $25.00 model/API share; $1.00 daily model/API pace |
| Recorded API spend | $8.77 this month; $23.04 cumulative |
| Entered fixed costs | $19.00 monthly |
| Recognized revenue | $0.00 |
| KPI quarter | 2026-Q1; open; 31 on track, 5 at risk, 29 off track, 26 unavailable |
| Critical KPI gaps | company.valid-window-rate, company.monthly-all-in-usd, marketingshark.package-completeness, marketingshark.truth-gate-violations, door-money.desk-reliability, door-money.cash-spend, tehdejsi-svet.cycle-reliability, tehdejsi-svet.language-parity, tehdejsi-svet.research-spend-usd, kvorum.desk-reliability, kvorum.published-claim-reference-rate, kvorum.apify-monthly-usd, personal-growth.unavailable-honesty-rate |
| FightAIQ analysis | approved by D8; production still requires `FIGHTAIQ_ANALYSIS_ENABLED=true` plus live and evidence gates |
| Visitor/engagement measurement | disabled (`METRICS_INGESTION_ENABLED=false`) |
| Global social posting | stopped while `SOCIAL_KILL_SWITCH=true`; project counters and credentials remain separate gates |

### Project modes and social readiness

| Project | Mode | Rooms | Disabled optional roles | Social readiness |
| --- | --- | --- | --- | --- |
| Caught Up | operating | cu-edition 05:00; cu-product 17:00 | THREADS, INSTAGRAM | locked (10/7) |
| Titty Tuesdays | paused | tt-marketing 11:00 | QUILL, THREADS, INSTAGRAM | locked (0/4) |
| GoVIRAL | operating | gv-brief 13:00 | none | not applicable |
| BOOKSOFHISTORY | paused | bh-desk 12:00 | none | not applicable |
| FightAIQ | paused | mma-intake 08:00; mma-analysis 19:00 | none | not applicable |
| Design Lab | operating | deterministic service only | none | not applicable |
| marketingShark | operating | ms-daily 07:00 | none | not applicable |
| MMA Files | paused | mag-editorial 09:00; mag-desk 20:00 | REACH | locked (10/10) |
| Door Money | paused | dm-desk 15:00; dm-growth 16:00 | none | not applicable |
| Tehdejší svět | paused | ts-desk 18:00 | none | not applicable |
| Kvórum | paused | kv-desk 21:00 | none | not applicable |

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

## Venture capability boundaries

`config/venture-capabilities.json` is the versioned source of truth for cross-venture
and venture-to-service content/data access. The default is deny. Every allowed or held
handoff names its direction, exact capability and payload schema; isolation rules win
before an edge is considered. Shared topics, tags, services, repository paths or similar
data shapes never create an implicit bridge. An allowed edge carries neither publishing
nor spending authority, and all stricter venture, evidence, connection and owner gates
remain independent.

BOOKSOFHISTORY and Tehdejší svět are mutually isolated. Personal Growth cannot discover,
scan or receive nominations from the portfolio. Kvórum cannot export recommendations,
claims or political output to another venture, profile or Social Distribution. FightAIQ
cannot resolve a monetization action. GoVIRAL supplies only bounded measured intelligence
with evidence and expiry, never final copy, campaigns or a publish package.

Door Money has exactly a held GoVIRAL intelligence input, a bounded approved render
summary to Design Lab and an immutable approved package reference to Social Distribution;
no manuscript, chunk, embedding, private annotation or style exemplar can cross. The
`webdev-signal` node has the same three Instagram/Threads relationships and exact held
own-metrics, progress, health and owner-attention service edges. It has no content edge to Caught
Up, devShark or any other venture. Website and house-promotion edges are outside the program.

## The projects

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

Its 11:00 room is a standing daily ideation window and may also receive a focused agenda.
PULSE and ANGLE lead strategy; optional
specialists cover audiences, stunts, taste, editorial quality and deterministic
assets. Complete campaign state is preserved even while production roles are off.
Social unlock needs four passing campaigns plus credentials and the safety checker;
the global kill switch still wins.

### GoVIRAL

Promise: turn a bounded weekly trend snapshot into one owner brief, rated marketing
plays and at most one allowlisted follow-up agenda. Its 13:00 room runs on Mondays;
the other six scheduled firings are deterministic `$0` no-ops. Apify is on a paid plan since
2026-09-15. The repository assumes Starter (`$19` a month for `$19` of credit,
`config/fixed-costs.json`) until #528 confirms it, and the reservation in
`orchestrator/src/sources/apify.ts` is the only ceiling before overage reaches the card.

Door Money's English book and music-business terms and Tehdejší svět's configured
history terms use separate keyless Google News collection, so they do not add an actor,
quota or paid data source. A tactic can call a trend only when that exact term was measured.

The room works on Mondays; the other six scheduled firings are honest `$0` no-ops unless
a due agenda commissions the room. The allowlist connects it to BOOKSOFHISTORY, Door
Money growth, Tehdejší svět, Kvórum, MMA Files and Titty Tuesdays; each current room
schema emits no more than one bounded follow-up. It never posts, opens an account or
turns a trend into permission for outreach.

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

### Tehdejší svět

Promise: turn curated Czech and Ukrainian history facts into bilingual family
conversation drafts without changing or connecting to the existing product. The
product remains in its own repository. This venture reads one owner-committed,
hash-verified facts file; its daily room has no product-network path and marketing
research never becomes product data.

At 18:00 `ts-desk` advances one step of a two-day cycle. LETOPIS plans the canonical
brief and writes the Czech feature; VERBA independently adapts that brief for native
Ukrainian readers rather than mirroring the Czech sentences. HACEK, QUILL and AUDIT
enforce fact, register, sensitivity, licence and stop gates. Tier-2 subjects require
human review and two independent sources. The Design Lab is the only renderer, and
licensed photographs render only from recorded local bytes with on-slide attribution.

Every feature remains a draft until the owner approves it and later records any posted
URL and result manually. The venture cannot post, create an account, read analytics,
touch a channel or spend outside its nested limits. Its current Sunday performance
overlay is deterministic and costs `$0`; owner-entered results may change bounded
selection priors but cannot weaken the factual or sensitivity gates.

### marketingShark

Promise: one post each weekday, written up honestly enough that a reader gets value from the
carousel whether or not they ever open the product. The kind rotates by weekday inside the same
envelope (#576): a quiz question on Monday and Thursday, a feature spotlight on Tuesday, a
challenge teaser on Wednesday and the week's note on Friday. Saturday and Sunday have no room.
CHUM writes the day's copy in English, the language devShark ships in, with one caption each for
LinkedIn, Instagram and Threads, and AUDIT holds the veto seat. Each brand names its languages in
`config/marketingshark.json`; the Czech path stays for a brand that lists it, and the kinds beyond
the quiz are English only. MAKO's weekly review is specified — its instructions are
`orchestrator/prompts/marketingshark/strategy.md` — and is not yet wired to a room, so no weekly
call runs and none is billed.

devShark is the only brand: its webdev bank is consumed read-only as a committed snapshot pinned
to a source commit, and nothing is written back to that repository. geoShark, the disabled brand
that pointed at StudyShark's geography bank, was removed when StudyShark was retired in September
2026, together with its `geo` hook lines.

Everything except one model call per brand per day is deterministic and costs nothing. The day's
plan is made first, at `$0`. On a quiz day, which question runs comes from a seeded order over the
bank, so every question is served once before any repeats and the same date always produces the
same question. Which opening line fronts it is decided by the Design Lab's hook brain, not by the
model and no longer from a library inline in this venture's config: the studio evaluates the
central library's gates against the question's own metadata — "Two answers look right. One is."
may only run on a question that actually has four options and is not trivial — and slide 1 renders
that line verbatim. CHUM writes slides 2 to 5 to cash the promise slide 1 makes, and there is no
field left in its output through which it could author hook copy at all. After CHUM answers,
deterministic gates check that the assigned hook line is unchanged, that the brand's closing line
is verbatim, that any code block reached the slide byte for byte, and that no number in the hook
appears in neither the question nor the assigned line. A failure aborts the brand and leaves
nothing behind.

The other kinds take their facts from code, and CHUM writes only the fields code leaves it. The
spotlight shows one screen the fact sheet in effect names, a new one each week. The teaser shows
an Easy challenge's prompt and first hint from a committed snapshot of devShark's challenges,
labelled by devShark's own difficulty step, and never a solution; until that snapshot is imported,
Wednesday drafts the quiz and says why. The weekly note recaps the week's own packages. GoVIRAL's
trend hook, read through its own `goviral-intelligence-packet/1` edge, may choose which of the
bank's category labels leads the week; the tag itself never reaches a slide or the writer. A kind
whose source is missing falls back to the quiz, and the package records which kind it stood in
for. On launch day the owner's own announcement copy, saved under
`state/ventures/marketingshark/announcements/`, takes the day with no model call. Every kind runs
the caption rules, the clip gate, a no-invented-numbers gate against its own sources and the
reward-for-engagement gate.

The five reviewed slides are rasterised to PNG frames and JPEG copies under
`site/public/social/devshark/<date>/en/`, and the package records every file's hash beside the
SVG hash of the slide the gates passed. Each package becomes three queue v2 drafts, one per
platform, bound to devShark's own profiles and carrying the package hash, under the two
capability edges `state/decisions/2026-09-26-devshark-social-queue.md` proposes. No post may
promise a reward for following, liking, sharing or commenting; a gate enforces it.

Nothing it writes can post. Every draft has all eleven checks pending, devShark's connections
are held, both channels are drafts, a LinkedIn item is refused by name until its transport
exists, and marketingShark is not a publishing venture — the publisher refuses it by name
rather than by an absent switch.

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
public home for FightAIQ fighter/bout/prediction data. CANVAS assigns the daily
slot, JAB drafts in Czech, STET removes generated-text tells, HACEK owns the register
and the copy repair, AUDIT checks the release, FRAME supplies the hero, and RELAY
delivers to `lukaskourilcz/mma-files` with the same retry/revert proof used by Caught
Up.

An article is killed before any model call when its source packet is incomplete.
REACH and SPLIT are currently disabled. REACH's Czech A/B draft contract already
uses live Design Lab templates; SPLIT remains measurement-only and idle. Social
unlock requires ten consecutive article proofs, credentials, project safety and the
global switch. Indexing remains an independent owner decision.

### Kvórum

Promise: turn a corroborated Czech political-news digest into one or two original,
typed and cited recommendation drafts for the owner. The registered desk is 21:00
Prague. A pinned public-page actor may discover what Štít demokracie discussed, while
seven verified Czech news and institutional feeds supply evidence. Štít is never
evidence itself. Deterministic clustering, repeat detection, public-person scope,
claim-reference, originality and Czech-register gates surround the single TRIBUN call;
HACEK and AUDIT cannot waive a failed gate.

The shipped path is held by the registry pause. The founding record and the separate
capacity reallocation are countersigned, and `KV-APIFY-001`, `KV-SOURCES-002`,
`KV-ACCOUNTS-003` and `KV-EDITORIAL-004` are approved. While the venture is paused the desk
makes no external or model call and spends `$0`.
The declared room envelope is `$0.10`; an authorized call is estimated at `$0.05–0.07`.
The actor share is capped at `$2.00` inside the Apify plan's monthly credit, but its
current `$0.151` maximum run reservation cannot support daily cadence under that share,
so the quota guard stops rather than upgrading the plan or overspending.

Owner approval writes a recommendation summary to the Design Lab, the sole rendering
path. It never posts. Manual post receipts, owner-entered results, claim status and
correction drafts remain typed records in the protected workspace; no engagement
collector, freeform image generator or treasury action exists.

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
nine brands: DNESKAi, MMA Files, Titty Tuesdays, devShark, BOOKSOFHISTORY, Door Money,
Tehdejší svět, Kvórum and WebDev Signal. Tehdejší svět uses committed Cyrillic-complete
Literata and Inter cuts plus a Ukrainian glyph-coverage gate.
MOTIF records cited text observations without crawling or downloading imagery. EASEL
authors original data-only proposals. Schema, contrast, safe-area, token, overflow,
asset and determinism checks can promote a version automatically. Versions are
deprecated, never deleted. Owner ratings teach PALATE but cannot bypass checks.

The studio is also the **assignment brain for hook copy across every surface**. A hook is
one line on slide 1 whose job is to earn the next interaction, and it is gated: each hook
declares `truthRequires` predicates and may only render on content whose metadata makes
them true. Gates license claims — that is the entire honesty model, and it is why the
engine ports everywhere while the strings do not. The libraries live beside the engine in
`studio/hooks/`: 50 hooks for devShark, 12 for DNESKAi and 16 for MMA Files,
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

The Design Lab has no meeting room or paid call. The protected admin renders all slides
for all statuses, configured brands and formats, with checks, ratings,
status controls and an individual-link inspiration box. The English public project
page shows live fixture previews and, after unlock, receipt-backed real posts. The
project has no social account, marketing or visitor analytics. Standalone extraction
is only a locked future earning possibility.

## Prague operating clock

Every row is a wake-up, not a promise to spend. `site/vercel.json` holds ten entries, two
UTC variants per running slot for Prague winter and summer time, and the sweep and dispatch
options derive from the registry, so a paused venture holds no slot. Runtime DST resolution
accepts only the entry matching the intended local hour. Three GitHub backstop sweeps (03:55,
11:55 and 19:55 UTC) rescue a missed slot. Calendar validation rejects collisions and the
public calendar uses the same source.

| Prague | Slot | Behavior | Maximum paid envelope |
| ---: | --- | --- | ---: |
| 05:00 | DNESKAi day (`cu-day`) | WebDev Signal pre-step at `$0`, then the edition and the product check | room `$0.08` each |
| 06:00 | Morning board | decision room; day checkpoint, previous day's digest and document truth refresh | cycle cap `$0.20` |
| 07:00 | marketingShark | weekdays, kind by weekday; one paid call per enabled brand, none at the weekend | `$0.10` per enabled brand |
| 09:00 | DNESKAi edition retry | runs only when the 05:00 edition has not published | production cap `$0.50` |
| 13:00 | GoVIRAL trend room | Mondays only; the other six days are `$0` no-ops | `$0.06` |

A paused venture keeps its rooms and envelopes in the registry and returns to the clock when it
resumes; the ladders below still name its rooms for that reason.

The sum of room envelopes is not expected daily spend: idle agenda rooms make no
provider call, evidence-killed production stops before generation, and checkpoints,
rendering, KPI evaluation, delivery verification and publishing verification are
deterministic. More importantly, the live payable shape is capped: existing room
envelopes, article production and the morning cap reserve `$0.98`. Adding Kvórum's
declared envelope would make `$1.08`, so the runner excluded it until `budget-2026-08g`
(countersigned 2026-08-29) freed `$0.08` by holding the Titty Tuesdays room. The daily API pace remains `$1.00`; the monthly
model/API share remains `$25` inside the `$50` all-in ceiling.

There are two deterministic degradation checks. Monthly API headroom first disables
optional content scoring below `$3`; below `$2.75` BOOKSOFHISTORY researches one
candidate and Door Money growth drops; below `$2.50` BOOKSOFHISTORY stretches at `$0`
and the Door Money desk drops; below `$2.25` the BOOKSOFHISTORY and Tehdejší svět rooms
drop; below `$2` GoVIRAL drops; below `$1.50` Kvórum drops and Titty Tuesdays uses its
minimal transcript; below `$1` the MMA Files editorial, desk and article phases drop;
below `$0.50` Titty Tuesdays pauses. Independently, if one date's due room envelopes
would exceed the `$1.00` daily pace after non-room reservations, they fall in this
order: Door Money growth, Kvórum, Door Money desk, Tehdejší svět, BOOKSOFHISTORY,
GoVIRAL, Titty Tuesdays. Kvórum is paused, so neither ladder reaches it today.

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
exchanges bounded agendas with BOOKSOFHISTORY, Door Money growth, Tehdejší svět and
Kvórum; the MMA rooms keep their existing internal transitions. Policy permits at most
two requests from a meeting, while current specialist response contracts expose at most
one. Queues are capped at 24 and eight per project, duplicate phase/date requests collapse, due
agendas are consumed once, and pending requests expire after three days. Seven days
without a consumed project agenda forces a morning-board commission or saved why-not.
A manual run bypasses the agenda timing only; it cannot bypass live, evidence, cost,
credential or safety gates.

## Roster: forty working roles, nine stood down

Model routing is declared in `config/models.json` and `config/agent-routing.json`.
The registry holds 49 roles: 40 active, six paused and three retired.
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
| LETOPIS | canonical Tehdejší svět brief and Czech family-history feature | cannot use facts outside the verified snapshot or dossier, or publish |
| VERBA | independent native Ukrainian adaptation of the canonical brief | cannot mirror Czech sentences, omit required context or publish |
| TRIBUN | original Czech political recommendations from corroborated clusters | cannot fetch, cite Štít as evidence, endorse a party or touch a channel |

## Content, social and the Design Lab's flow

Caught Up and MMA Files spend on article language work only after source gates pass.
Both publish in Czech only; both use one licensed hero/fallback; both are delivered
through a repository-scoped App and verified after deployment. Social payload
generation is separately gated, so locked social projects make no caption/model calls.

Door Money never enters an article publisher. Its Design Lab edge accepts only a bounded
approved English summary, and its Social Distribution edge accepts only immutable package
and asset references after that service's independent authority gates pass. Neither edge
owns strategy or external action. The shared renderer remains deterministic and `$0`, and
no manuscript, full chunk, embedding, private annotation or style exemplar crosses it.

When enabled, every social producer returns a live `template_id`, semantic `version`
and bounded `content` payload. FRAME resolves the version through the Design Lab,
binds the project's tokens, renders PNGs, validates accessibility/provenance and saves
the renderer version on the queue/receipt. Schema validation rejects missing or
non-live references. There is no freeform social image path.

Kvórum is narrower still: an approved recommendation creates only a Design Lab summary
and draft-ready deck. The owner records any later manual post; no publisher mapping,
credential lookup, image-model fallback or automated channel action exists for it.

Social Distribution validates its queue without an LLM, uses an idempotency key, records a
platform receipt, and checks the live post at `$0`. One retry is allowed; a second
failure pauses that project. It never follows, likes, comments, messages or downloads
engagement data.

BOOKSOFHISTORY does not enter that publisher. Its approved lane becomes a Design Lab
handoff for the owner, never a platform job; an owner may later record the posted URL
and result in the protected admin, but no crawler or channel integration measures it.

Tehdejší svět also stops at an owner-ready Design Lab package. Approval records the
owner's decision and later posted URLs; manual per-platform results and pasted comments
are its only signals. No code reaches the adopted product repository, social accounts,
platform analytics or a publishing API.

## KPI and quarter protocol

Q1 is a 90-day quarter beginning 2026-08-03. Content and social pace have a 14-day
spin-up. The daily evaluator reads saved state and labels targets on-track, at-risk,
off-track or unavailable; missing Phase 3 measurement is never converted to zero.
Company targets cover valid windows, all-in/API cost, content volume, delivery proof,
founding/rated proposals and agenda review. Each project has targets appropriate to
its promise. The Design Lab requires ten live templates, six passing new proposals,
100% engine-rendered published carousels after unlock, green determinism and one cited
iteration per brand.
Kvórum's seeded targets cover honest desk outcomes, approved drafts, referenced claims,
corrections, its `$2` Apify share and model spend; held or unavailable evidence is not
silently counted as performance.

BOOKSOFHISTORY targets at least 90% completed-or-honestly-stretched cycles, at least
eight features in its lowest full month, at least 70% reuse of paid dossiers after a
30-day ramp, 100% verification-state coverage and zero legends stated as fact. Its
model-spend KPI is at most `$8` monthly; the stricter research ceiling remains `$5`.

Tehdejší svět targets completed-or-honestly-paused two-day cycles, evidence coverage in
both languages, zero sensitivity/licence escapes and owner-entered results only. Its
model-spend target is at most `$4` monthly; research remains separately capped at
`$0.30` per brief and `$2` monthly.

At quarter end, fewer than 70% passing targets or any missed critical target creates a
mandatory `continue / pivot / stop` reassessment. A company miss also reviews the
operating pattern. The protocol can create an owner packet; it cannot change stage or
lower a past target. The owner may edit future seed values in
`config/kpis/2026-Q1.json`.

## Money model

The public `/money` projection combines API ledger entries, owner-entered fixed costs,
verified revenue and KPI readiness. Recognized revenue remains `$0` until the owner
accepts a real event. Empty fixed-cost state means not entered, not free.

Caught Up sponsorship, MMA Files sponsorship/affiliate and Titty Tuesdays commerce are
information-only future references with observed readiness and known constraints.
Readiness cannot prepare a proposal, create work, request owner attention or activate an
earning method. FightAIQ has no monetization-execution capability. The Design Lab remains
an internal renderer; design-template sales are absent and not replaced by another design
product.
BOOKSOFHISTORY has no website, newsletter, database, store or other earning surface in
this program; building one would require a separate owner decision.
Door Money is likewise drafts-only: it has no earning activation, publisher, channel or
account, and its owner action packets cannot send the outreach they describe.
Tehdejší svět is an adoption-marketing workspace, not a product or earning integration.
It has no account, channel, publisher, analytics reader or authority to alter the
existing product.
Kvórum is a held editorial workspace, not an active channel or earning method. Its
founding, capacity, source, account and editorial approvals cannot be inferred from
implementation readiness.

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
- Tehdejší svět reads only its hand-committed, hash-verified facts file. It never reads
  or writes the product repository; tier-2, licence, bilingual and owner-review gates
  fail closed, and every external post remains manual.
- Kvórum remains fixture-only until its founding and capacity records are countersigned.
  Later source, account and editorial approvals remain independent; the desk cannot
  endorse a party, cite its monitored competitor as evidence or post.
- Payments, new spend, budget raises, account creation, legal posture and personal
  data remain human-only regardless of a model vote.

## Decision map: D1–D14, venture foundings and autonomy-first isolation

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
| D10 Money and quarterly KPIs | public cost/revenue truth and the 90-day protocol; its activation path is superseded by the information-only posture below |
| D11 Design Lab | sixth project, monorepo engine, 23 live template families, deterministic service and public showcase |
| D12 Original presentation | approved agent photographs and plain interface labels; no workplace-show framing |
| D13 marketingShark founding | seventh project, `ms-daily` at 07:00, MAKO and CHUM, devShark folded in as a portfolio product, geoShark present and disabled, drafts only |
| D14 BOOKSOFHISTORY founding | countersigned 2026-08-29; paused; eighth project, `bh-desk` at 12:00, FOLIO and PLOT, reusable dossiers, independent Czech/English drafts, manual posting and no public surface |
| Door Money founding | countersigned 2026-08-30; paused; ninth project, `dm-desk` at 15:00 and Thursday-only `dm-growth` at 16:00, private manuscript boundary, Design Lab-only rendering and drafts/actions only |
| Tehdejší svět founding | countersigned 2026-08-29; paused; tenth project and first adoption, `ts-desk` at 18:00, hand-committed facts, independent Czech/Ukrainian drafts, no product-repository link, Design Lab-only rendering and manual posting/results |
| Kvórum founding | countersigned with its capacity record 2026-08-29; paused; eleventh project, `kv-desk` at 21:00, TRIBUN over corroborated political clusters, Design Lab-only rendering and manual approval/post/result records |
| Autonomy-first capabilities (`operations-2026-08a`) | correctness/privacy/evidence first; versioned deny-by-default directional capability map; no monetization execution before a new owner decision |

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

1. Which owner-facing view would make eleven projects feel simpler without hiding gates
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
7. What evidence would justify creating a 50th registered role rather than tightening a
   packet or sharing an existing role?
8. Which earning hypothesis can be tested without weakening editorial trust or opening
   an account prematurely?
9. How should the system explain its rare failures so the owner can intervene once,
   not babysit recurring workflows?
10. What parts of the Design Lab would need isolation, documentation and demand proof
    before standalone extraction becomes rational?
