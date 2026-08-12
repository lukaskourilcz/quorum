# Door Money: the Rapovej deník marketing venture — design

Status: proposed, pre-founding. Nothing in this document runs until the owner countersigns
`state/decisions/<date>-door-money-founding.md` and the items in §12 are resolved in
`state/INBOX.md`. The implementation contract is `docs/DOOR-MONEY-CODEX-BUILD-PROMPT.md`,
which per house convention is scaffolding deleted when executed; the decision record and
this document are what outlive it.

The shape in one line: **a private knowledge base reads the whole book once, code picks the
passage, one model call writes in the author's recorded voice, and the owner is the gate.**
That is the marketingShark pattern with two additions: a retrieval layer over a manuscript
that must never be committed to this public repository, and a weekly research room whose
output is a checklist for the owner rather than content.

## 1. Product concept and positioning

Rapovej deník (Lukáš Kouřil, Klika, 2023) is sixteen years of Czech hip-hop promotion in
diary form — from the "Prosaď svůj rap" internet contest and a first show in Hodonín to
leaving for Colombia in 2023, with the door-money arithmetic, the no-shows, the riders and
the losses written down as they happened. The English edition is the product this venture
markets.

The venture is not an ad account for a book. It is a storytelling brand about the side of
music nobody follows on purpose: the person who rents the room, fronts the cash and counts
the door. Every post is a true story, a number, or a lesson from the manuscript, told in the
author's own voice, and the book is the place the stories come from — mentioned the way a
band mentions the album, not the way a banner mentions a sale.

Positioning against the obvious alternatives:

- **Author-brand accounts** ("buy my book" energy) burn out their audience; this brand leads
  with the stories and lets curiosity carry people to the product.
- **Music-industry-advice accounts** teach from authority; this one teaches from receipts —
  what a specific show cost, what went wrong, what the promoter did at 2 a.m.
- **US promoter content** is saturated; a Czech scene the audience has never heard of is a
  differentiator, not a handicap. "The rap economy you know, in a country you don't" is a
  hook no American account can copy.

## 2. Name and branding direction

Recommended name: **Door Money**. Venture id: `door-money` (ids are permanent even if the
public name changes — the `caught-up`/DNESKAi split is the precedent).

Why this name: door money is what a promoter actually lives on, it is insider vocabulary
that signals the account knows the trade, it is two short English words that fit a handle,
and it frames every story as economics as well as anecdote — which is what makes the book
different from rapper memoirs. It does not sound like an AI project or a BoardlessAI
sub-product, and it is not the book's title, which keeps the account useful even to people
who will never buy anything.

Alternatives considered: **The Rap Diary** (direct translation; cleanest funnel to the book,
but generic and collision-prone), **Load-In** (insider, but reads as logistics), **Green
Room Stories** (warm, but crowded phrase). "Rapovej deník" itself is unpronounceable for
the target audience and stays the product name, not the account name; the bio carries
"stories from the book RAPOVEJ DENÍK" so the bridge is explicit.

Name clearance is provisional until the owner runs the same checks BRAND.md requires for
the company name (handles on IG/TikTok/X/Threads, trademark screen, collision search).
Hard-conflict policy applies: do not auto-rename; produce alternatives and a
`HUMAN_APPROVAL`.

Voice: the author's, not a house voice — that is the whole point of §"Voice preservation"
below. Visual identity: a dedicated `door-money` brand token set in the Design Lab
(carousel-brand/1): night-club dark ground, one hot accent (poster-red or cash-green),
grotesque headline face from the committed OFL set, torn-ticket and hand-stamp motifs.
Distinct from every existing brand set; never touches BoardlessAI corporate tokens, which
are locked.

## 3. Target audience

Primary: English-speaking hip-hop fans 18–35 who follow behind-the-scenes music content —
the audience of promoter/tour-manager TikToks, r/hiphopheads and r/WeAreTheMusicMakers
threads, "how the industry actually works" YouTube essays. They read for the stories.

Secondary: aspiring promoters, event organizers and music-business students, who read for
the lessons and are the most likely to buy a book. Tertiary: BookTok/Bookstagram readers of
music memoirs, reachable through book-side channels rather than music-side ones.

The audience is global-English; posting windows should favor US evening / EU night, which
conveniently matches an afternoon Prague production slot with next-morning owner review.

## 4. Core workflows

Four loops, three of them daily-capable, one weekly:

1. **Ingestion (one-time, owner-triggered, resumable).** `pnpm book:ingest` reads the
   manuscript from the owner's local gitignored file (§7), chunks it deterministically,
   annotates and scores every chunk with a budget-capped model pass, builds the style
   profile and the retrieval index, and writes the split outputs: full text and
   embeddings to the owner-created book database, derived scores/summaries/profile (with
   capped excerpts) to `state/` here. Re-runs resume from a cursor and are idempotent per
   manuscript hash.
2. **Daily content desk (`dm-desk`, 15:00 Prague).** Code selects 1–2 passages by score,
   cooldown and rotation; one GHOST call turns them into recommendation packages in the
   author's voice; deterministic gates check voice, claims, excerpt caps and duplication;
   packages land in the approval queue as drafts.
3. **Owner review → Design Lab → manual post.** In `/admin` the owner reads the
   recommendation with its linked source passage, edits or rejects, approves into the
   Design Lab (carousel/single-image formats render immediately; thread/caption text is
   copy-ready), posts by hand on the venture's accounts, and records the post URL. While the
   social triple-lock stands, manual posting is the only path — by design, not as a gap.
4. **Weekly growth room (`dm-growth`, 16:00 Prague, Thursdays; other days are $0 no-ops).**
   BOOKER works a rotating research agenda (§6), maintains per-channel playbooks as recorded
   state, and produces an action packet: concrete owner tasks with prepared templates —
   "find these ten podcasts, use this pitch, record this 30-second script." The owner's
   results and completions feed the next week's agenda.

## 5. Agent structure and responsibilities

Two new agents (registry grows 42 → 44 with the sibling venture's TRIBUN; each agent
addition touches `config/agents.json`, `config/agent-routing.json`,
`config/venture-agent-controls.json`, the `cast` enum in the venture-registry contract, and
`orchestrator/prompts/`):

- **GHOST** — voice writer. One call per day: selected passages → recommendation packages
  in the author's recorded voice. Cannot select the passage (code does), cannot invent
  facts about the book (KB refs required), cannot post, cannot touch the style profile
  (recorded, not re-derived). Routes to `claude-sonnet-5` — the CHUM precedent: the
  venture's single quality-critical creative call is exactly where the quality tier is
  worth ~$0.05.
- **BOOKER** — growth lead. Weekly call: playbook maintenance, action packets, channel
  research synthesis, outreach templates. Cannot contact anyone (owner executes), cannot
  spend, cannot claim results that were not entered. Routes through the existing
  `OPENAI_SPECIALIST` role.

Reused seats: **AUDIT** holds the veto in both rooms (existing pattern), **PALATE** distils
owner ratings into taste (existing pre-step machinery; `taste: true`), **STET**'s
generated-text-tell standards apply through the voice lint rather than a second paid seat.
No social production role exists for this venture; like marketingShark, the publisher
refuses it by name until a future decision.

## 6. Meeting structure and recurring agendas

Registry entries (cadence is `daily@HH:00` only; weekly behaviour is a code gate, the
GoVIRAL-Monday pattern):

| Meeting | Hour | Cast | Envelope | Behaviour |
| --- | --- | --- | --- | --- |
| `dm-desk` | daily@15:00 | GHOST, AUDIT | $0.08 | daily; skips with a reason record when the KB is missing or every eligible passage is cooling down |
| `dm-growth` | daily@16:00 | BOOKER, PULSE, AUDIT | $0.06 | Thursdays; the six off-days write "$0 — this room meets on Thursdays" |

The growth room's rotating agenda wheel (deterministic, seeded by ISO week, so the schedule
is inspectable in advance): launch mechanics → BookTok/Bookstagram → podcast and press
outreach → Reddit and communities → short-form video → newsletter and owned audience →
Amazon/Goodreads/reviews → partnerships and collabs — then repeats with the accumulated
playbooks as context. Every sitting must end in an action packet or an honest
`NO_ACTION` with a reason; research that produces no owner-executable step is recorded as
not yet actionable, never padded into fake tasks.

Both rooms may file at most one agenda to another venture's room through the existing
`meeting-agenda/1` queue (e.g. handing GoVIRAL a trend question); GoVIRAL's Monday brief
feeds `dm-growth` when a trend touches books or music.

## 7. Data sources and integrations

- **The manuscript and the book database** — the manuscript source stays as the owner's
  local gitignored file (`state/ventures/door-money/manuscript/`); ingestion writes the
  knowledge base (chunks, annotations, embeddings) to an **owner-created managed
  database with an HTTPS API**. Recommended: Supabase free tier (Postgres with a REST
  API over plain HTTPS — fits `safeFetch` and the host allowlist exactly, no card, 500
  MB against ~3 MB of need); Neon or Turso equivalent. Credentials (`BOOK_DB_URL`,
  `BOOK_DB_KEY`) live as Actions secrets and local env; runtime reads go through
  `safeFetch` with the host allowlisted. **This public repository never carries the
  manuscript or full-text chunks**; it carries scores, summaries, the style profile and
  excerpts capped at 600 characters. `quorum` is public — that is the load-bearing
  reason for the split, and a test enforces the cap.
- **Owner-entered results** — per-post outcomes typed into admin (views, likes, saves,
  follows, link taps — whatever the platform shows the owner). Owner-entered operational
  data is the house pattern for measurement while `METRICS_INGESTION_ENABLED=false` (manual
  odds capture is the precedent); no automated analytics are collected, and the founding
  decision says so explicitly so the D9 hold is honored rather than skirted.
- **GoVIRAL bridge** — the four-leg spine every venture carries
  (`docs/BOOKSOFHISTORY-VENTURE-DESIGN.md` §10): GoVIRAL scouts a `door-money` topicSet
  (BookTok, author-marketing, hip-hop-culture terms), the growth room and the passage
  selector read the Monday brief, agendas flow both ways, and the Design Lab is the only
  rendering path. No new scraping, no new Apify scope for this venture. Zero paid data
  sources.
- **Design Lab** — rendering, recipes, exports (§10). **Treasury/ledger** — model calls ride
  the budget ledger under `ledgerNamespace: door-money`; there is no cash spend anywhere in
  the design.

## 8. Content generation workflow

Daily, in order, everything but step 3 deterministic:

1. **Select.** Code filters chunks: score threshold per format, per-theme and per-chapter
   cooldowns (`max(2× last-use interval, 21 days)`), no repeat of last week's story arc,
   seeded rotation over survivors (seeded by date + venture, so a rebuild reaches the same
   pick). Two passages maximum; a day with nothing eligible is a recorded quiet day.
2. **Assemble the packet.** The selected chunks' full text fetched from the private KB,
   ±1 neighboring chunk for continuity, the style profile, 3–5 voice exemplars matched to
   the target format by embedding similarity, the last 14 days of recommendations (repeat
   guard), current performance weights, and the format menu with each format's constraints.
3. **GHOST call (the paid step).** Returns 1–2 recommendation packages: chosen format(s) and
   platform(s) with a stated reason, the adapted copy (carousel slides / thread / caption /
   script), a hook line, the why-this-works rationale, the curiosity bridge to the book
   (soft by default; explicit CTA at most once per week by rule), and the source refs.
4. **Gates ($0).** Schema validation; every factual claim about the book resolves to a
   chunk ref; verbatim quotes must be exact substrings of the source chunk; excerpt caps;
   voice lint (banned generic-AI phrasing list distilled from the style profile, the
   stop-slop standards applied mechanically); duplicate check against prior packages
   (`duplicateThreshold` from social policy); CTA-frequency rule. A failed package is
   dropped and counted, never repaired by a second model call.
5. **Store.** `venture-recommendation/1` records with `status: "draft"`, shown in admin;
   approval writes the Design Lab summary and marks the package ready for manual posting.

## 9. Admin experience

One workspace (`/admin?venture=door-money`), three tabs, all inside the existing shell,
loaders and write-ladder patterns:

- **`recommendations`** — the daily queue. One card per package: hook, format chips,
  platform chips, the adapted copy, the *source passage* (capped excerpt inline with its
  database chunk id; the full passage stays in the book database), GHOST's rationale,
  gate results. Actions: approve
  (→ Design Lab + ready-to-post), edit-then-approve, reject with reason. After posting by
  hand the owner records the post URL and, later, its numbers; the same card then shows
  outcome beside intent. RatingWidget on every card feeds PALATE.
- **`actions`** — the standing owner to-do list from `dm-growth`: today's actions with
  their templates (pitch email, video script, comment strategy), each checkable with an
  outcome field ("sent 5, 2 replies"), plus the per-channel playbook files rendered
  read-only. This is the "tutorial-like tasks" surface; completions are recorded state the
  next weekly room reads.
- **`knowledge`** — the book KB browser: chapters, scored passages (score bars per axis),
  style profile, usage history per passage (used-in links), and the ingestion status line
  (manuscript hash, chunk count, model versions, cost). Read-only; re-ingestion is a CLI
  act, not a button.

The venture's tile on the admin home answers "what happened since yesterday" the way other
ventures' tiles do: last desk outcome, drafts waiting, actions open, last owner result
entered.

## 10. Design Lab integration

The integration point is the recorded carousel summary, which is how both magazines already
reach the studio rail:

- `door-money` joins `BrandTokensSchema.id` and `CAROUSEL_BRANDS` with its own token set —
  which alone buys all 23 families, the 4 canvases, recipes, presets, slide editing, PNG
  and ZIP export, with zero new renderer code.
- `carousel-summary/1` gains venture `door-money` and a per-venture `locale` (this venture
  is the first English one; the schema currently pins `cs`). Existing ventures' bytes stay
  identical — the determinism tests hold.
- Approving a recommendation with a carousel or single-image format writes a recorded
  summary under `state/ventures/carousel-studio/summaries/door-money/…`; the package then
  appears in the Design Lab studio tab beside the magazines' articles. Single-image posts
  are one-slide decks (the poster family); threads and captions travel in the package's
  copy block with the existing copy buttons.

## 11. Automation opportunities

In build order of value per effort: format-performance weighting folded into selection
(§14); exemplar retrieval quality (embedding-matched few-shots per format); a "series"
planner that turns one long chapter into a numbered multi-week arc; caption/hashtag variant
generation inside the same GHOST call (no second call); newsletter issue assembly from the
month's approved packages; short-video script format with shot lists; auto-drafted replies
for common comment patterns (drafts only, `replyPolicy` stays
`draft_only_until_separately_approved`); and — after the triple-lock opens per §12 — queued
autopublish through the existing publisher with the venture's own unlock counter.

## 12. Human approval requirements

`HUMAN_APPROVAL` items filed at founding, all-or-nothing like the TT visuals set:

1. **BOOK-SOURCE-001** — the owner-created book database (Supabase free tier
   recommended), its HTTPS host in the runtime allowlist, the `BOOK_DB_URL` +
   `BOOK_DB_KEY` secrets (Actions + local dev), the local gitignored manuscript path,
   and the rule that full text and embeddings live only there. $0 cash on the free
   tier; any paid tier is a new approval.
2. **BOOK-INGEST-002** — the one-time ingestion spend envelope (≤ $3.00 total, resumable
   runs ≤ $0.80/day inside the $1.00 pace), the model roles it uses, and the public/private
   output split with the 600-character excerpt cap.
3. **DM-ACCOUNTS-003** — creation of the venture's social accounts (IG, TikTok, X, Threads,
   YouTube as the owner chooses). Accounts are the owner's act; until then the venture is
   drafts-only and admin says so. Manual posting needs no further approval; autopublish
   would need its own future decision plus the triple-lock, unchanged.
4. **DM-RESULTS-004** — owner-entered per-post results as the venture's only measurement,
   explicitly inside the D9 hold (no automated ingestion, no new analytics surface).

Standing rules that need no new approval, restated in the founding decision: no paid ads,
no giveaways involving payment, no outreach sent by the system (BOOKER drafts, the owner
sends), treasury untouched, $30/$25/$1.00 ceilings untouched.

## 13. Metrics and KPIs

`growth_objective`: "Turn the book into a daily storytelling channel and a weekly owner
action plan" with components `package-cadence` (reused — daily draft packages, the
marketingShark evaluator semantics fit) and one new component `action-completion` (actions
completed ÷ actions issued, from owner-entered completions; extending the closed enum means
touching the contract, its fixtures and the evaluator — priced into the build).

KPI seeds for the quarter: desk held or honestly skipped ≥ 90% of days; ≥ 5 approved
packages/week after week 2; approval rate (approved ÷ drafted) trending up; ≥ 3 owner
actions completed/week; passage coverage (% of high-scoring chunks used at least once) as a
depletion watch; $0 cash and model spend ≤ $3/month for the venture. Follower counts and
sales are owner-entered context, not system KPIs, until measurement unlocks — `null` stays
`null`, never zero.

## 14. Feedback loops

Three, all recorded:

- **Owner ratings** → PALATE taste memory (existing machinery) → the desk's packet carries
  taste the way TT rooms already do.
- **Owner-entered results** → `state/ventures/door-money/results/` → the weekly room
  adjusts `performance-weights.json` (format × theme × hook-style priors) through a recorded
  proposal with its evidence line; the desk's selection step reads the weights
  deterministically. Weights are bounded (no format may fall below a floor or the venture
  self-narrows on noise from tiny samples).
- **Action outcomes** → playbook revisions ("cold email pitch B outperformed A 2:1 on
  replies") → next packet's templates. BOOKER cites result ids the way PALATE cites rating
  ids; an uncited playbook change fails review.

## 15. Scaling strategy

Phase-gated, each phase behind evidence from the last: (1) drafts-only single-brand run,
manual posting, weekly actions — prove approval rate and owner throughput; (2) short-form
video scripts + recorded-by-owner Reels/TikTok/Shorts, newsletter assembly, podcast
outreach at volume through action packets; (3) autopublish for the text platforms once the
venture's unlock counter, credentials and the global switch all pass, with the existing
publisher and its idempotency/receipt discipline; (4) audience expansion — a second content
lane from reader reactions and owner's new stories (post-book material), localized
crossover back into Czech (the book's home market already knows the name), launch-team and
review-drive mechanics around the English edition's release moments. Chapter depletion is
the natural horizon: ~160 chunks at 1–2/day with cooldowns is 6–12 months of primary
material, extended by re-angling (same story, new format) which the recommendation history
makes safe.

## 16. Risks and safeguards

- **Manuscript leakage** — the public/private split, the excerpt cap with its test, and
  embeddings kept private. The style profile quotes ≤ 40 exemplars ≤ 280 chars each.
- **Voice drift / generic-AI smell** — recorded style profile, per-format exemplars, the
  deterministic voice lint, STET standards, owner rating loop. The style profile is never
  re-derived silently; refreshing it is a versioned act.
- **Fact drift about the book** — chunk-ref requirement plus exact-substring quote checks.
- **Platform risk** — music-industry stories involve real named people; the gate rejects
  packages making factual claims about living persons that the manuscript itself does not
  make, and the owner is the last reader of every post. Controversial passages score high
  on shareability by design; the shock-value axis is capped in selection so the account
  does not drift into pure controversy.
- **Cost** — every call through `guardedJsonCall` with reserve-before/record-after; the
  ingestion has its own envelope and cursor; the venture sits on the degradation ladder
  (§19) so budget pressure drops it before it touches any reader-facing promise.
- **Depletion/repetition** — cooldowns, usage history, the coverage KPI.

## 17. Technical architecture

New code lives in `orchestrator/src/ventures/door-money/` (the marketingShark shape):
`run.ts` (dispatched from `cycle.ts` for `dm-desk`/`dm-growth`), `select.ts` (deterministic
passage selection), `kb.ts` (book-database client: chunk fetch and embedding load over
the database's HTTPS API — behind `safeFetch` with the database host in the runtime
allowlist), `gates.ts`
(voice lint, claim refs, quote substrings, caps, duplicates), `ingest/` (chunker, annotate,
score, style, embed, cursor), plus `prompts/door-money/{ghost,booker}.md` and
`prompts/door-money/craft.md` distilling the voice rules — runtime prompts never load skill
files. Site side: `site/src/lib/admin-door-money.ts` (server-only loader),
`site/src/components/admin/door-money-*.tsx` panels, `POST /admin/api/door-money/…` routes
on the standard verify/origin/persist ladder. Studio side: brand tokens + summary venture +
locale. Ingestion CLI: `pnpm book:ingest` in `orchestrator/package.json`.

Model roles added to `config/models.json`: `GHOST` (`claude-sonnet-5`, ~8000 in / 2500
out), `BOOK_INGEST` (`claude-haiku-4-5`, ~12000 / 3000), `BOOK_STYLE` (`claude-sonnet-5`,
map-reduce so every call stays under the $0.10 per-call cap); BOOKER rides
`OPENAI_SPECIALIST`. Embeddings: `text-embedding-3-small` on the existing OpenAI key
through a small guarded wrapper that reserves and records like every other paid call
(ledger `kind` extended or recorded under the embedding model id — the build prompt states
the choice to make and the recommendation).

## 18. Database / data-model implications

New contracts, each with valid + poison fixtures: `book-kb-index/1` (public derivative:
chunk ids, offsets, summaries, entities, themes, per-axis scores, usage history, manuscript
hash, model versions), `style-profile/1` (versioned voice fingerprint + capped exemplars),
`venture-recommendation/1` (shared with the Kvórum venture: id, ventureId, date, status
draft→approved→posted→archived / rejected, formats, platforms, copy blocks, rationale,
evidence as a discriminated union — `book-passage` refs here — gate results, designLab
block, owner fields: postedUrl, resultIds, rating link), `action-packet/1` (weekly tasks
with templates, effort, expected impact, completion + outcome fields),
`owner-result-entry/1` (per-post numbers as typed by the owner, platform, capturedAt).
State layout: `state/ventures/door-money/{recommendations,actions,results,playbooks,
knowledge}/…` plus `performance-weights.json`; the book database holds the chunks,
annotations and embeddings, and the manuscript itself stays as the owner's local
gitignored file.

## 19. Background jobs and scheduling requirements

Two slots on the Prague clock (15:00, 16:00 — both free today; the registry's superRefine
requires ≥ 60 minutes between all slots including the board's 06/14/22). Each slot needs
its two DST cron variants in `site/vercel.json` (28 → 32 entries with this venture alone,
inside Vercel's 40 limit even with the sibling venture's slot), the phase added to
`types.ts` phase schemas, `meeting-record`'s phase enum, `cycle.yml`'s dispatch choices and
mode gates, and `config/meeting-policy.json` (both standing; `dm-growth`'s Thursday check
lives in the runner). Backstop sweeps cover missed slots automatically once the phases are
registered. Degradation ladder: `dm-growth` drops first of all rooms, `dm-desk` next —
both before `gv-brief` — because a missed desk costs a draft nobody was promised.
Envelope arithmetic stays inside the signed $1.00 daily pace and `system-audit.test.ts`
proves it.

## 20. Implementation phases

`DM-01…DM-20`-shaped tasks in the founding decision, one commit each (the DL/IMG pattern):
Phase A — contracts + fixtures + state scaffold + registry entry + agents/prompts/routing
(dry rooms hold, $0). Phase B — ingestion pipeline against a fixture manuscript, then the
real one after BOOK-SOURCE-001/BOOK-INGEST-002. Phase C — the desk: selection, packet,
GHOST call, gates, records. Phase D — admin tabs + Design Lab extension. Phase E — the
growth room + action packets + owner results + weights. Phase F — docs, NEEDED items, KPI
seeds, e2e, founding decision checkboxes ticked. Full gate (`pnpm agents:validate`, `lint`,
`typecheck`, `test`, `build`, site e2e) green before each phase's commit lands.

---

## The book pipeline in detail (the venture-specific brief)

**Model architecture.** Fable-class models are the wrong tool for bulk manuscript work by
two orders of magnitude of cost. The split: `claude-haiku-4-5` for every per-chunk pass
(annotation + scoring in one call), map-reduce rollups, and entity/theme indexing;
`claude-sonnet-5` only where quality is the product — the style-profile synthesis (once)
and GHOST's daily creative call; `text-embedding-3-small` for retrieval vectors. Nothing
in the daily path ever re-reads the book.

**Cost control.** ~300 pages ≈ 150–180k tokens. One annotation+scoring pass ≈ 224k in /
64k out on Haiku ≈ $0.55; rollups ≈ $0.30; style map-reduce ≈ $0.25; embeddings < $0.01.
One-time total **≈ $1.10–1.50**, envelope $3.00 with retries. Daily: one GHOST call ≈
$0.05–0.07 → **≈ $1.80–2.10/month**; weekly BOOKER ≈ $0.35/month. Venture total ≈
**$2.50/month** against the $25 model share, all through `guardedJsonCall`'s
reserve-before/record-after funnel, every call under the $0.10 per-call cap, ingestion
runs under a $0.80/day sub-envelope so the $1.00 pace holds.

**Ingestion strategy.** Deterministic structural parse first (chapters, scenes, paragraph
boundaries); the model never decides where a chunk starts. Manuscript hash pins the run;
a changed manuscript is a new ingestion version, never an in-place mutation (recorded, not
re-derived). The cursor makes every pass resumable after a budget stop.

**Chunking.** Scene-aware: target 900–1200 tokens, hard paragraph boundaries, ~15% overlap
carried as explicit `context` fields rather than duplicated text; stable ids
`ch07-s02-c041` with byte offsets into the manuscript file. ~160–200 chunks expected.

**Embeddings/retrieval.** One vector per chunk (summary + text), stored in the private
the book database and fetched once per cycle (~1–2 MB); retrieval is in-process cosine over a few hundred vectors —
no vector database, no service, no new infrastructure. Used for exemplar matching, related-
passage context, novelty checks and admin search; the primary daily selector stays
score-and-cooldown driven so the day's pick is explainable.

**Metadata strategy.** Every chunk carries: position (chapter/scene/arc), entities (people,
venues, events — with a person-sensitivity flag), themes, era, story-type (win/loss/absurd/
lesson/travel), quotables (exact substrings ≤ 200 chars), and the 15 score axes below.
Indexes roll up per chapter and per entity so "everything about booking X" is one lookup.

**Writing-style profile.** `style-profile/1`, versioned: sentence-rhythm stats, vocabulary
signature (recurring words/phrases, profanity register kept honestly), humor mechanics,
storytelling patterns (how stories open, turn and land), first-person habits, tense usage,
what the author never does (the negative space matters most for a lint), plus per-format
adaptation notes and the exemplar bank (embedding-tagged, capped). Synthesized bottom-up
from per-chapter style notes so no single call needs the whole book.

**Voice preservation.** Three layers: the profile + matched exemplars in every GHOST packet
(few-shot, not fine-tuning); the deterministic voice lint (banned generic-AI constructions,
stop-slop patterns, profile-derived checks like sentence-length distribution bounds); the
owner rating loop through PALATE. Fine-tuning is explicitly out: cost, opacity, and the
manuscript would have to leave the private boundary.

**Passage scoring.** 15 axes, 0–5 with a one-line justification each, produced in the same
per-chunk Haiku call: entertainment, emotional impact, shock, humor, relatability, hip-hop
relevance, storytelling strength, controversy, shareability, educational value, quote
potential, carousel potential, short-video potential, thread potential, book-curiosity
potential. Format fitness = weighted blend per format (weights in
`performance-weights.json`, adjusted only through the recorded weekly proposal). Scores are
recorded once; re-scoring is a versioned re-ingestion, so admin always shows the numbers a
decision was actually made on.

**Content extraction.** The desk's recommendation is exactly the user-story shape: "this
story from chapter X could work as a 7-slide carousel because…" — with the source passage
linked, the adaptation drafted, and the format reasoning stated. The `knowledge` tab is the
standing map of what the manuscript still holds.

**Continuous improvement.** Owner results → weights → selection; ratings → taste → GHOST's
packet; action outcomes → playbooks → next actions; approval-rate and coverage KPIs watch
the loop itself. Every adjustment cites the record it learned from, because an uncited
lesson is indistinguishable from drift.

---

## What this does not touch

The $30 / $25 / $1.00 ceilings. The social triple-lock — nothing here posts, and the
venture has no channel, no credentials and no publisher path until separate future
decisions. The treasury and payment rules. `METRICS_INGESTION_ENABLED=false` and the D9
measurement hold — owner-entered results are typed by a human into a protected surface,
and no automated collection is added. Both magazines' truth gates and delivery paths. The
Design Lab's determinism guarantees. BoardlessAI corporate brand tokens. The mirrored
skill directories — venture craft rules are distilled into `orchestrator/prompts/door-money/`.

## Open questions for the owner

1. Is "Door Money" the brand, or should the account carry the book's English title
   directly? (Handle availability will likely decide.)
2. Which platforms first? The design assumes IG + Threads + X drafts from day one, with
   TikTok/Reels scripts as owner-recorded video in phase 2.
3. Does an English manuscript file exist ready for ingestion, and which database
   provider do you pick? (Supabase free tier is the recommendation; Neon/Turso are
   equivalents. BOOK-SOURCE-001 blocks on this.)
4. Release timing: is there an English-edition launch date the weekly room should plan
   backwards from?
