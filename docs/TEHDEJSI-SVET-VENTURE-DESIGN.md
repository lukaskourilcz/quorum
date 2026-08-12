# Tehdejší svět: the adoption venture — strategy and design

Status: proposed, pre-founding. This is the master plan for BoardlessAI adopting the
existing product **Tehdejší svět** (`lukaskourilcz/dontwannaknow`, live at
dontwannaknow.vercel.app) as a marketed social venture. Nothing runs until the owner
countersigns `state/decisions/<date>-tehdejsi-svet-founding.md`. The implementation
contract is `docs/tehdejsi-svet-venture-implementation.md`; the product's own repository
is **never modified by this venture** — BoardlessAI adopts the marketing, not the code.

The shape in one line: **the product already knows its moment of value — "a concrete,
honestly framed fact the user wants to ask a loved one about" — and the social venture
industrializes exactly that moment, in Czech and Ukrainian on every slide, from data the
product has already curated, scored and sensitivity-checked.**

This plan is grounded in a full inspection of both repositories and the live app. Where
it cites numbers (record counts, scores, tokens, licences), they were read from the
product repo at commit `37446ee`.

---

## Part I — The product as it actually is

### 1. Current-product analysis

Tehdejší svět is a client-only React SPA: no backend, no runtime AI, strict self-only
CSP, share state in a URL fragment that never reaches a server, names opt-in. Its report
composes eight chapters (birth → early childhood → everyday day → teenage years → then
vs now → changing world → generation context → life in numbers) through age gates,
sensitivity floors and a six-axis editorial relevance score. Its stated audience (from
`docs/experience-overhaul.md`) is people who want to better understand parents,
grandparents, partners, friends or their own childhood — with Czech-Ukrainian families
named as especially important. Its stated moment of value is the sentence this whole
venture stands on:

> "Hlavní okamžik hodnoty nastává, když zpráva nabídne konkrétní, poctivě formulovanou
> souvislost, na kterou se uživatel chce blízkého člověka zeptat nebo ji s ním sdílet."

The product already ships a share system: 6 content kinds × 3 formats (1200×630,
1080×1350, 1080×1920) drawn by `src/lib/shareImage.ts` with a complete ratio-based
composition law, a PDF keepsake edition, native share sheet, and a static OG card. It
already carries the brand copy the social venture should inherit, not reinvent:
"Čí svět chcete poznat?", "Poznejte svět, ve kterém vyrůstal člověk, na kterém vám
záleží.", eyebrow "OSOBNÍ PORTRÉT JEDNÉ DOBY".

What it does not have: any marketing or social presence, robots/sitemap, absolute OG
URLs (blocked on the production domain, an open owner task), custom analytics events
(only sanitized Vercel pageviews), or an outbound licence statement.

### 2. Dataset opportunity analysis

Public runtime data at the pinned commit (~4,800 records + 6,161 weather files):

| Asset | Size | Social value |
| --- | --- | --- |
| cityFacts | 2,173 records, 70 cities, 1919–2025, CZ 1,096 / UA 1,077 | The backbone. Deepest: Kyiv 126, Praha 108, Odesa 92, Lviv 91, Charkiv 88, Brno 61, Mariupol 59 |
| birthWeather | 70 cities × 1940–2026, per-day (49 MB) | Massively underused in-product (one sentence); the strongest "only the product can do *your* day" tease |
| filmPremieres | CZ 744 / **UA 36** | CZ culture pillar is rich; the 20× UA gap is the venture's first research target |
| countryDecades | 509 across 8 decade buckets × 2 countries | Everyday-life features (government, clothes, illness, dailyLife, food, money, bizarre, beautiful) |
| countryEvents | 529 | Context spine |
| leaders | 26, dated reception quotes, **all `shareSafe:false`** | Context only — never post subjects, by the product's own contract |
| cityImages | 19 licensed photos (CC BY-SA, Wikimedia), 20-city scope, one per city | The scarcest, most emotional asset; one explicit exclusion (Lviv war rubble) to honor |
| slang | CZ 13 / UA 5 (UA starts 1990) | Seeds for participation formats; thin |
| babyNames | **CZ only, 2010–2023, 11 records** | Cannot power a names pillar for core cohorts — research-dependent |
| pricesWages, vitals, inventions, mediaMilestones, famousPeople | small but cited | Texture |

Already-paid editorial signal the venture inherits free: **4,316 records carry six-axis
relevance scores** (livedProximity ×1.2, everydayConsequence ×1.3, recognition ×1.0,
discovery ×1.0, consequenceHorizon ×0.7, explanatoryPayload ×1.1), per-record `tone`,
`sensitivity`, `shareSafe`, chapter mapping, and provenance sidecars for 1,400+ records.
The social miner starts from a scored, sensitivity-labeled corpus — no other history
account on Czech or Ukrainian social media has that.

Known gaps that shape strategy: **music is absent entirely** (archive `songs.json` is
US-centric and unused — and chapter 04's intro promises "Hudba…" the data cannot
deliver: a live product bug this venture surfaces to the owner); UA films/slang/prices
are thin; names data cannot serve pre-2010 cohorts; `cityFacts` (the backbone) still
lacks a provenance sidecar and is `review-needed` — so social gates treat its items as
single-source until verified.

### 3. Visual-identity analysis

The design language is real and specific: warm paper, dark green ink, restrained coral;
Fraunces (display), Newsreader (editorial body), Instrument Sans (metadata); hairline
rules, uppercase eyebrows at 0.66rem/700/0.1em; the brand mark (green rounded square,
paper T, coral accent); the share-image composition law (7.5%-of-width margins, a
full-canvas 1px registration crosshair, green top bar, coral tick, ratio-scaled type,
footer line "Poznejte svět, ve kterém vyrůstali vaši blízcí."). The design thesis from
the product's own docs: intimacy from the family album without scrapbook decoration,
rhythm from magazines without front-page sensation, caption precision from archives
without institutional cold.

Two facts the social system must resolve:

- **Token drift.** The web app and the export/brand layer disagree on five values —
  most visibly coral `#b0492f` (web) vs `#d9684f` (exports, favicon, OG). The social
  brand adopts the **export palette** (it is what every downloadable card and the OG
  image already use) and the drift is reported to the owner as a product fix.
- **No Cyrillic.** Fraunces, Newsreader and Instrument Sans all lack Cyrillic — the
  bilingual mandate cannot render Ukrainian (Її Єє Ґґ Іі) in the product's faces at
  all. The social type system therefore uses one harmonized OFL pair covering both
  scripts — **Literata** (bookish warm serif, variable, full Ukrainian support) for
  display and body, **Inter** for metadata — chosen to sit as close as possible to the
  Fraunces/Newsreader feeling. A deliberate, explained divergence, not an accident.

---

## Part II — The brand

### 4. Brand positioning

**Tehdejší svět is not a history account. It is a conversation account.** Its subject
is people — the specific mother, grandfather, colleague from Kharkiv — seen through the
world that surrounded them. Every post exists to be *sent to someone*, and its success
is a conversation started, not a fact delivered.

Positioning statement: *Tehdejší svět dělá z historie rodinný rozhovor. Ukazujeme svět,
ve kterém vyrůstali lidé, na kterých vám záleží — poctivě, z ověřených dobových dat, ve
dvou jazycích.* Supporting UA: *Тодішній світ перетворює історію на родинну розмову.*

The editorial filter (replaces "what fact should we post today?"): **"Would a reader
send this to one specific person — and what would they ask them?"** A candidate with no
clear send-target and no askable question fails, however interesting.

This sharpens the owner's hypothesis rather than replacing it: "understanding people
through the world that surrounded them" is the product's truth; the *social* moat is
the act it triggers — asking, while there is still someone to ask. That urgency
("zeptejte se, dokud je koho") is the deepest emotional layer; it is used sparingly, in
campaigns, never as everyday copy.

### 5. Emotional positioning

Primary emotions, in order: tenderness toward one's people; recognition ("that was our
kitchen"); curiosity across generations; the small shock of parallax (how different a
childhood 30 years away is). Explicitly not: outrage, national pride contests, "things
were better then," or tragedy-as-content. Nostalgia is welcomed for everyday life and
rationed by the sensitivity system for everything political (Part IV, §26).

### 6. Czech audience strategy

Core: 30–55-year-olds who have living parents born 1940–1975 and children of their own
— the generation-in-the-middle that mediates family memory. They are the senders. The
55+ generation are the receivers and commenters (their memories are the community
fuel), reached mostly through shares and Facebook. Entry content leans 1960s–1990s
childhood (highest recognition density: Gottwaldov-era everyday life, normalization-era
school routines, 90s transformation childhoods — each handled per the sensitivity
tiers).

### 7. Ukrainian audience strategy

The launch audience is not "Ukraine" in the abstract: it is the **~613,000 Ukrainians
living in Czechia** (54% of all foreigners; ~397k under temporary protection as of
January 2026 — MV ČR data), the EU's largest per-capita community. They live inside the
Czech information space, follow Czech and Ukrainian accounts, and are structurally
underserved: nobody speaks to them about their own family history in their own language
from inside Czechia. Diaspora dynamics favor exactly this content (memory, cities,
grandparents' worlds) — with wartime care rules (§26): many hometowns in the product's
city list (Mariupol, Kharkiv, Kherson…) are under attack or occupied; memory content
about them is handled as remembrance, never as engagement bait, and never with
then-vs-now rubble contrasts.

Second ring: Ukraine itself and the wider diaspora, reached organically through shares
— IG/TikTok penetration in Ukraine is high and the UA half of every slide travels
without modification.

### 8. Czech-Ukrainian positioning

The bridge is the brand's quiet spine, not its slogan. Mechanics: every feature is
bilingual by format (no "Ukrainian edition" ghetto); city features alternate CZ and UA
cities on a planned rhythm; parallel-worlds features ("Praha 1985 / Київ 1985") run at
most twice a month, only where honest comparison exists, and never score "who had it
better." The account never adjudicates history between nations; it lets two childhoods
sit side by side. National flags are not brand elements; the flag-free rule is written
into the visual system.

---

## Part III — Platforms and formats

### 9. Platform strategy

| Platform | Role | Launch | Why |
| --- | --- | --- | --- |
| **Instagram** | Brand home; carousels + Stories | Day 1 | Carousel-native, saves/sends are the currency, UA diaspora strong, the product already exports 1080×1350 and 1080×1920 |
| **Facebook** | Reach and family sharing | Day 1 | The 45+ audience lives here; Czech city-nostalgia groups are huge and exactly on-topic; family tagging behavior is native |
| **Threads** | Conversation lab | Day 1, light | Zero-cost text variants; memory questions thrive; feeds the community-signal engine |
| Reels/TikTok | Motion | Day 60 decision | Only after carousel save-rates prove which stories deserve motion; the story-format card is a ready-made Reels cover |

One account per platform, bilingual — not separate CS/UA accounts. The bilingual slide
IS the brand.

### 10.–11. Content pillars and recurring formats

Seven pillars, each mapped to data that actually exists (gaps named honestly):

1. **Když se narodila vaše máma… / Коли народилася ваша мама…** — the flagship. A
   birth-year world reconstruction framed on a relationship, not a year.
   Data: countryDecades + countryEvents + filmPremieres + weather summary. Rich today.
2. **Město tehdy / Місто тоді** — one city, one decade, anchored on the licensed photo
   where one exists (19 cities), cityFacts around it. Posted into that city's orbit.
3. **Když vám bylo deset / Коли вам було десять** — cohort self-nostalgia; age-gated
   data reused exactly as the product's age windows define (slang 8–25, children's
   broadcast 3–10, fairy-tale films 3–9, films 10–17).
4. **Dětství tehdy / Дитинство тоді** — everyday material culture: shops, school,
   clothes, food, money. countryDecades categories carry this today.
5. **Co tehdy letělo / Що тоді гриміло** — culture of a year: films (CZ rich), TV
   milestones; music **only after research** (§23) and meanwhile as community memory.
6. **Pamatujete? / Пам'ятаєте?** — the participation engine: one concrete memory
   prompt, light card, comment-first design.
7. **Dva tehdejší světy / Два тодішні світи** — the comparison format (the product's
   own `comparison` share kind): two years, two cities, or parent-vs-child worlds.

Interstitials between features: weather-day teasers ("the product knows your exact
day"), hundred-year-art cards (the product's honest fallback is itself a charming
format: "Umění, které už tehdy mělo svůj příběh"), birthday-cohort cards.

### 12. Generational content strategy

The generational matrix (year × age-lens × country) is an opportunity *catalogue*, not
a generation plan: ~90 birth-years × 3 lenses × 2 countries ≈ 540 cells, ranked by the
scorer (§30), never exhausted mechanically. Decade tentpoles (born-in-1960s features)
anchor; exact-year features personalize; birthday mechanics (§50) recur annually. Cohort
diversity pressure prevents the feed collapsing into the 1980s.

### 13. City-based content strategy

70 supported cities, 20 with photo scope. Rhythm: one city feature weekly, alternating
CZ/UA; deepest-data cities first (Praha, Kyiv, Brno, Lviv, Odesa, Ostrava, Charkiv);
distribution piggybacks city-specific Facebook nostalgia groups (the single cheapest
cold-start channel in CZ). Wartime UA cities follow remembrance rules (§26). The
product's period-rename resolver (Gottwaldov, Ždanov, Vorošilovgrad…) is itself a
recurring hook format: "Vaše město se tehdy jmenovalo jinak."

### 14. Family-oriented growth strategy

Every feature ends addressed to a person, not an audience: send-target CTAs (§42), a
tag-a-family-member prompt at most once per week (guarded against bait), the Sunday
ritual (§50), and the gift mechanic: the product's PDF keepsake reframed as a birthday
present — "Vytvořte mámě k narozeninám její Tehdejší svět" — the venture's strongest
conversion hypothesis, tested from week 3.

### 15. Carousel architecture

6–10 slides, thesis-first (a story, not a fact dump):

1. Hook — the relationship question, CS over UA.
2. Scene — the year/city in one breath (place chip uses the product's historical-name
   resolver: "Gottwaldov, Československo").
3.–6. The world — everyday, culture, city, one surprising verified fact; each slide one
   idea, CS+UA.
7. The human turn — "Tohle byl svět, do kterého se narodila dnešní šedesátnice."
8. Conversation close — the askable question + soft product line.

Photo features insert the licensed image as a full-bleed slide with on-slide
attribution. Difficult-context slides (when a story requires naming the regime) use the
product's `difficult` styling register — muted, never dramatized.

### 16. Bilingual slide design

The hierarchy (validated against the product's composition law, extended for two
languages):

```
[eyebrow — pillar name, both languages, 0.6× scale, letterspaced]
[CS text — Literata, scale 1.0, ink]
[hairline rule — 40% width, --rule]
[UA text — Literata, scale 0.85, ink at 88% opacity]
[footer — year · place chip (coral) · attribution when required]
```

Rules: CS ≤ 20 words per slide, UA ≤ 20 (tighter than the product's 30-word mono
budget — density is the enemy); UA is smaller but same face, same ink — never gray,
never italic-as-foreign; reading order constant on every slide; no flags, no
tricolors; the crosshair and top-bar-plus-coral-tick from the share-image law carry
over as the recognition devices. Hooks: CS large, UA directly under at 0.8× — both
languages complete, neither a caption of the other.

### 17. Caption strategy

Captions do the platform work the slides refuse: CS paragraph first, then UA paragraph
(full value in both, not summaries), then the question line in both, minimal hashtags
(3–6, mixed CS/UA, city-tagged when local), attribution lines for licensed media, and
the product link only when the CTA is product-shaped (≤ half of posts).

### 18. Threads strategy

Text-native, not carousel reposts: single strongest fact + question; memory prompts;
"quiet polls" (which year should we do next?); UA-led threads at least weekly (Threads
is the cheapest place to test UA-first framing). Feeds the signals queue.

### 19. Facebook strategy

Same features, native re-packaging: first slide + full bilingual text post (FB rewards
text+image over link posts), share-into-groups tactics owner-executed with a per-city
group map maintained in venture state, memory questions pinned in comments. Expect the
oldest audience and the richest memory comments; harvest them (§39).

### 20. Instagram strategy

Carousels as above; Stories: weather-day teasers, this-or-that year polls, memory
sticker prompts; Highlights as the evergreen shelf (Města, Ročníky, Pamatujete,
O projektu). Grid opens with a curated 3×3 launch set.

### 21. Reels/short-video strategy (phase 2)

Decision at day 60 from save/send data. First formats when it opens: slow pan over the
licensed city photo with two caption lines (CS/UA) and period-true ambient sound; the
"world of your mother" narrated 30-seconds using the story-format card as cover. No
AI-generated historical imagery, ever (§26, §48).

---

## Part IV — The content engine

### 22. Existing-data mining strategy

A read-only **snapshot index** of the product's public runtime data, pinned to a source
commit (the devShark snapshot precedent): per record — dataset, id, country, city,
year/decade, category, chapter, tone, sensitivity, `shareSafe`, the six `rel` scores,
licence, source presence, text hash. Bodies are fetched at need from the pinned commit;
nothing is duplicated wholesale, nothing ever diverges silently (index carries the
source commit; refresh is an explicit owner-triggered sync). Mining rules inherited
from the product: `shareSafe:false` records never enter the candidate pool (leaders
included); `difficult` records enter only as context for tier-2 features; the six
relevance axes seed the social score (§30) so 4,316 records arrive pre-ranked.

### 23. Selective deep-research strategy

Product data first; research only when it materially improves a chosen story. The
venture reuses the BOOKSOFHISTORY research provider module and dossier/ledger
contracts wholesale — same brief discipline, same idempotency, same used-flag
economics. Standing research priorities (from the gap analysis, in order):

1. **Ukrainian gaps** — everyday life detail for UA cities/decades, UA film/TV culture
   (the 36-record gap), UA-era music. UA-audience parity is a strategy goal, so the
   research budget leans UA even though CZ data is richer.
2. **The names dataset** — pre-2010 Czech and Ukrainian name-popularity by birth year
   (product data cannot serve the pillar; sources: ČSÚ/MV name statistics, UA
   registries). Built as *marketing research data*, never silently promoted to product
   data (§SEPARATION below).
3. **Music by era** — the product's biggest gap; community memories (§39) generate the
   questions, research verifies the answers.
4. Story-specific briefs when a candidate cluster is strong but thin.

Ceiling: **≤ $2.00/month**, ≤ $0.30 per brief, everything ledgered with used-flags.

**Separation of product data from marketing research (the architectural boundary):**
research dossiers live in `state/ventures/tehdejsi-svet/` on the quorum side and are
venture assets. Nothing this venture produces writes to `dontwannaknow`. When research
produces something the *product* should have (a names dataset, UA films), it becomes a
**product-insight queue item** for the owner, who may carry it through the product's
own `/dev` editorial process, provenance rules and review gates. The venture may
prepare material to product standards; only the owner moves it across.

### 24. Research-provider recommendation

The shared `orchestrator/src/research/provider.ts` (anthropic-web-search adapter over
the existing guarded funnel) — no new vendor, no new credential. Briefs instruct
CS/UA-language source preference where appropriate; VERBA reviews UA-source citations.

### 25. Fact-checking system

Claims normalize exactly as in the sibling ventures (typed states, sources,
corroboration). Additional rules here: product-derived claims inherit the product's
`sourceConfidence` — a `review-needed` record (all of cityFacts today) publishes only
as "single-source" framing or gets a verification pass; sensational-number triage
escalates; dates and name-forms verified against the product's historical resolver
(city renames, state boundaries) so social copy never contradicts the product.

### 26. Historical sensitivity rules

The venture adopts the product's machinery and extends it for feeds:

- **Tier 0** (everyday culture, weather, names, films): normal gates.
- **Tier 1** (political context present — regime names, 1948–89, USSR framing):
  sensitivity lint (the product's `editorialRules` regexes ported), sourcing++,
  HACEK+VERBA terminology check, no humor about the regime, nostalgia allowed only for
  everyday detail, never for the system. The product's own rule distinction — lived
  everyday vs. evaluation of political systems — becomes a hard gate: a Tier-1 feature
  must carry one honest context line (the product's `difficult` register) when the
  everyday content sits inside a repressive period.
- **Tier 2** (1968, WWII, Holodomor, deportations, Chornobyl, collaboration, the
  current war): mandatory human-review flag, no participation CTAs, no tag-a-friend,
  no light formats, minimum two independent sources per claim, VERBA sign-off on UA
  framing, published only on the feature cadence (never interstitials).
- **Excluded from social entirely**: atrocity imagery; then-vs-now destruction
  contrasts of UA cities; any "who suffered more" framing; AI-generated historical
  imagery presented as period material; leader-profile content as post subjects
  (`shareSafe:false` is contractual).
- **Wartime UA rule**: city features for cities under attack/occupation are
  remembrance-framed, timed with awareness of the news cycle (GoVIRAL brief provides
  the awareness input), and never optimized for engagement.
- **Terminology table**: a growing CS/UA pairs file (Kyjev/Київ; sovětská okupace
  1968; Druhá světová válka never "Great Patriotic War"; UA place-name transliteration
  following current ČTK/Deník N usage) maintained by VERBA+HACEK as recorded state.

### 27. Media/licensing strategy

Allowlist identical to the product's (PD, CC0, CC BY, CC BY-SA; NC/ND/fair-use
banned). The 19 licensed city photographs may appear in social **with on-slide
attribution and licence-respecting captions** — a deliberate, owner-approved divergence
from the product's internal "photos never enter share images" rule, filed as its own
approval item. The Lviv exclusion and any future `excluded` records are honored
unconditionally. CC BY-SA text (leader receptions, slang, Wikipedia-derived) carries
attribution in caption when quoted. The hundred-year-art set (Met/AIC, PD) is free
material. Everything else renders typographically in the Design Lab. No scraping, no
stock, no generated "historical" imagery.

---

## Part V — The BoardlessAI machinery

### 28. Agent structure

Two new agents; everything else reused:

- **LETOPIS** — venture lead and story editor. Mines the index, ranks candidates,
  writes canonical story briefs and the Czech feature copy. Cannot fetch beyond the
  read layer, cannot bypass sensitivity tiers, cannot post. Sonnet.
- **VERBA** — Ukrainian editor. Native UA adaptation of every feature (editorial
  adaptation, not translation), UA terminology and source review, UA cultural
  sensitivity seat, co-owner of the terminology table. Sonnet — the venture's UA
  quality is a brand promise, not a nice-to-have.

Reused: **HACEK** (Czech register floor — fifth venture), **QUILL** (claim clarity —
verification seat), **AUDIT** (veto), **PALATE** (taste from owner ratings,
`taste: true`), **KEEPER** (compliance lens inside gates). The conceptual roles from
the commission (scout, fact checker, sensitivity editor, visual director, analysts)
map onto these seats plus deterministic code — no one-agent-per-noun inflation.

### 29. Meetings and agendas

One room, `ts-desk`, daily@18:00 Prague (free slot, exactly 60 minutes from
`cu-product` 17:00 and `mma-analysis` 19:00), envelope $0.25, walking a two-day cycle
state machine (the BOOKSOFHISTORY pattern):

- **Day A — editorial planning**: deterministic shortlist from the index scorer;
  LETOPIS ranks, picks 1–2 features, decides research (usually none), writes briefs.
  The commission's meeting-output example is exactly this record's shape.
- **Day B — production**: canonical story brief → CS copy (LETOPIS) → UA adaptation
  (VERBA) → gates → recommendation drafts → Design Lab.
- **Sunday overlay — insights**: the week's owner-entered results, community signals
  from the comment digest, product-insight queue grooming, weight proposals. $0.06
  extra call within the envelope.

Agendas flow both ways with `gv-brief` (the four-leg GoVIRAL spine every venture
carries); a Czech-book or history crossover can hand one agenda to DNESKAi's or
BOOKSOFHISTORY's room and receive one back.

### 30. Content opportunity scoring

Deterministic, explainable, recorded per shortlist entry:

```
social score = product relevance composite (the six paid axes, reweighted:
               livedProximity and recognition up)
             × send-target clarity (is there a person to send this to?)
             × participation potential (askable question quality)
             × imagery availability (licensed photo? art fallback? typographic)
             × bilingual fit (does it carry in both languages, or one — one is
               allowed, the mix is monitored)
             × audience balance pressure (CS/UA, city, decade, pillar diversity
               vs the last 21 days)
             × timing (anniversaries; GoVIRAL cultural-moment flag)
             × performance weights (owner-entered results by pillar × cohort ×
               country)
             − sensitivity friction (tier 2 costs score; excluded kills)
```

### 31. Editorial workflow (content states)

The commission's IDEA→…→ANALYZED ladder maps onto existing abstractions rather than
new ones: shortlist entry (IDEA/DATA FOUND) → optional dossier (RESEARCHING/FACT
CHECK) → cycle record story selection (STORY APPROVED) → recommendation draft with CS
and UA payloads and gate results (CZ COPY/UA COPY/DESIGN) → owner approval in admin
(EDITORIAL REVIEW → READY) → owner posts by hand, records URL (PUBLISHED) → results
entry (ANALYZED). One shared contract (`venture-recommendation/1`, evidence kind
`tehdejsi-story`), one queue surface, statuses the admin already knows how to render.

### 32. Design Lab integration

A `tehdejsi-svet` brand token set (export palette: paper `#f7f2e8`, ink `#18201d`,
green `#1e3f39`, coral `#d9684f`, muted `#4d5f59`, rule `#d5cdbf`); Cyrillic-complete
committed fonts (Literata + Inter, OFL, added to the font-metrics pipeline with a
glyph-coverage test for the UA alphabet); a **bilingual family kit** implementing the
§16 slide law inside the studio (two stacked text slots with per-slot fit rules, the
crosshair/top-bar/coral-tick devices, photo slide with attribution slot); the venture's
copy pack carries CS+UA per slide. Rendering happens only in the Design Lab — the
four-leg spine's fourth leg, test-pinned. The product's own share images remain the
product's; the studio kit *echoes* the composition law so a social card and a product
export are recognizably siblings.

### 33. Admin experience

Workspace `/admin?venture=tehdejsi-svet`, three tabs answering the commission's
questions directly:

- **`features`** — what should we publish next (ranked shortlist with factor
  breakdowns), what is ready (bilingual packages side by side with gate results and
  sensitivity tier), what's waiting on the owner (tier-2 reviews, approvals), posted
  URL + results entry, RatingWidget.
- **`library`** — the snapshot index browser (by city/decade/pillar, with the
  product's scores and shareSafe/sensitivity badges), dossier shelf, research ledger
  and efficiency figure, snapshot sync status (source commit, drift warning).
- **`signals`** — community-memory digest (owner-pasted comment harvests, extracted
  themes), audience requests ranked by recurrence, and the **product-insight queue**
  (music gap, chapter-04 copy bug, token drift, names dataset, UA film gap — seeded
  from this plan's findings on day one).

### 34. Human approval boundaries

Autonomous: mining, ranking, briefs, research within ceiling, drafting, UA adaptation,
design prep, scheduling recommendations, analysis. Human-required: tier-2 sensitive
features (flagged, blocking), anything with licence ambiguity, all publication (the
triple-lock stands — this venture launches drafts-only with owner-hand posting),
spending beyond ceilings, partnerships/outreach, and every product-side change (the
venture may *recommend*, only the owner touches the product repo).

### 35. Publishing workflow

Phase 1: owner posts by hand from admin (copy buttons, PNG/ZIP export per format),
records the post URL. The venture's unlock counter toward any future autopublish:
30 consecutive owner-approved-and-posted features; even then, FB/IG channel enablement
is its own decision under the existing channel registry rules.

---

## Part VI — Learning

### 36.–37. Analytics and feedback loops

Owner-entered per-post results (the D9-compatible mechanism shared with the sibling
ventures): impressions, saves, sends/shares, comments, follows, per platform. Sends
and saves are the primary KPIs (they measure "someone sent this to their person" —
the positioning, quantified). Dimensions recorded per feature: pillar, country, city,
decade, cohort lens, hook type, CTA type, slide count, photo/art/typographic,
sensitivity tier, language balance. Product-side: Vercel Web Analytics already
reports sanitized pageviews with referrer domains — aggregate social→product traffic
is visible today with zero new tracking; the venture reads what the owner pastes from
that dashboard and never adds tracking scripts (the product's monetization.md
explicitly forbids them).

### 38. Experimentation framework

The sibling ventures' recorded-hypothesis mechanism: one experiment live at a time,
alternating variants across features (no paid tools). Launch-window tests, in order:
hook frame (self "Narodili jste se…" vs parent "Když se narodila vaše máma…"),
perspective (self/parent/grandparent), CTA class (memory question vs family tag vs
product gift), slide count (6 vs 8), UA-led vs CS-led ordering on Threads.

### 39. Community-memory strategy

Memory prompts invite recollections; the owner pastes comment harvests into admin
(no scraping, no API); the Sunday overlay extracts recurring themes, requested
cities/years, and correction claims — all stored as **personal recollections, never
facts**, usable only as research questions and prompt seeds. The flagship
demonstration: the music campaign — "Jaká písnička hrála u vás doma, když vám bylo
patnáct? / Яка пісня грала у вас вдома, коли вам було п'ятнадцять?" — community
memories map the terrain, research verifies, and the verified result becomes both
social content and a product-insight queue entry for a future music dataset.

### 40. Audience request system

Requests (city, year, topic) counted by recurrence in the signals queue; a request
reaching threshold (e.g., 10 mentions) auto-enters the shortlist with a
"requested by the audience" boost and a receipt (the post can honestly say "ptali
jste se").

### 41. Product-feedback loop

The insight queue is the formal channel: each entry carries evidence (counts, links,
examples), a proposed product action, and a status the owner controls. Seeded day one
with the five findings from this plan (§33). Monthly, the Sunday overlay rolls the
queue into one owner-readable digest.

---

## Part VII — Conversion, calendar, launch

### 42. Social-to-product conversion strategy

CTA taxonomy, rotated and measured: **curiosity** ("Zjistěte, jak vypadal svět, ve
kterém vyrůstala vaše máma"), **gift** ("Vytvořte jim jejich Tehdejší svět k
narozeninám" — the PDF keepsake as a present; the strongest hypothesis),
**comparison** ("Porovnejte svůj svět se světem svých rodičů" — the product's
two-person mode), **city** ("Podívejte se, jak vypadal svět člověka narozeného tehdy
u vás"), **conversation** ("Vytvořte jejich svět a zeptejte se, co si pamatují").
Product links in ≤ half of posts; the bio link is permanent. Precondition: the
production domain lands first (open owner task in the product repo — `dontwannaknow.
vercel.app` must never appear in a bio).

### 43. Editorial calendar

Anniversary radar from the index (city milestones, cultural dates), seasonal
tentpoles (September school-start memories CS+UA, Christmas "Vánoce 1975", New Year
cohort birthdays), monthly rhythm: 4 flagship year/family features, 4 city features
(2 CZ / 2 UA), 2 culture features, 2 participation weeks, ≤ 2 parallel-worlds. Tier-2
anniversaries (August 21, Holodomor remembrance in November) are handled as
remembrance with the full sensitivity apparatus — present, dignified, never grown
from.

### 44.–45. Launch strategy and the first 30 days

Preconditions (owner): production domain + absolute OG URLs (already an `[imp:5]`
product task); handles cleared (@tehdejsisvet); accounts created per approval;
12-feature content bank produced and approved before day 1.

- **Week 0**: profiles up (bios below), 3×3 IG grid opener (three pillars × three
  formats), pinned explainer carousel "Co je Tehdejší svět / Що таке Тодішній світ"
  (product QA screenshots exist as real product shots), first Threads posts.
- **Weeks 1–2**: 3 features/week + 2 interstitials; every comment answered (owner,
  with drafted reply suggestions in admin); first memory prompt.
- **Weeks 3–4**: first gift-CTA test; first city features posted into matching
  Facebook groups (owner-executed, group map in venture state; UA community groups in
  CZ approached with UA-led features); first parallel-worlds feature; Vercel referrer
  baseline recorded.

Distribution honesty: zero-audience cold start means FB groups and the UA-diaspora
community are the only free reach levers that work in week one; the plan leans on
them deliberately. No ads (standing rule), no follow-for-follow, no engagement pods.

Bios (draft): IG/Threads — "Svět, ve kterém vyrůstali lidé, na kterých vám záleží.
Світ, у якому виростали ваші близькі. 🇨— žádné vlajky: bez symbolů —
CZ · UA · zdroje u každého příběhu." (final wording at build; no flag emoji — the
rule applies to bios too). FB description adds the methodology sentence from
`src/copy.ts` verbatim.

### 46. First 90 days

- **Day 30 review**: pillar performance (kill or double), CS/UA engagement balance
  (if UA underperforms, shift UA-led ordering and UA research budget), hook-frame
  winner adopted, group-distribution yield, cadence check.
- **Day 60 review**: Reels go/no-go from save/send data; second-platform emphasis
  decision (FB vs IG as growth engine); gift-CTA verdict; community-memory volume →
  whether the music campaign gets its research brief.
- **Day 90 review**: follower and sends trendlines vs KPI seeds; product referral
  readout (aggregate referrers); research-efficiency figure; decide phase 2 (Reels,
  autopublish counter progress, possible UA website localization recommendation —
  kept strictly separate from this venture's scope, surfaced as a product insight
  with evidence).

### 47. KPIs

Cycle kept or honestly stretched ≥ 90%; 12+ features/month; sends+saves per feature
(primary, owner-entered, trend not absolute); memory-comments per prompt; approval
rate trending up; CS/UA engagement ratio inside 40–60% band by day 60; research ≤
$2/month with efficiency ≥ 0.7; model spend ≤ $4/month; `null` stays `null` — no KPI
invents a zero from a missing owner entry.

---

## Part VIII — Governance

### 48. Risks

War and grief (UA city content while the war continues — remembrance rules, timing
awareness, VERBA sign-off); nostalgia-washing of regimes (tier system, everyday-vs-
system gate, the product's own editorial DNA); troll dynamics on CS-UA topics
(no-engagement policy on bait, moderation guide, comments never quoted into content
without consent); licence discipline (ShareAlike attribution travels onto cards —
the product's own share images currently have this gap; the venture does it right);
Cyrillic typography (solved by design, §3); data imbalance drifting the brand
CS-heavy (balance pressure in scoring + UA-first research budget); Vercel Hobby
licensing if the venture is read as commercial operation of the product (surface to
owner: the boardless team is already on Pro — moving the project under it is likely
$0 marginal; owner decides); the repo has **no outbound licence** (owner owns both
sides, so internal reuse is fine; a licence statement is still filed as a product
insight); brand dilution into generic history (the send-target filter is the gate).

### 49. Safeguards

Everything in §26 plus: the product repo is read-only to this venture (test-pinned:
the venture's modules never import from or write to a dontwannaknow checkout beyond
the snapshot builder's explicit read); `shareSafe` and exclusions honored at index
build so banned records structurally cannot surface; sensational-claim triage; the
tier-2 human gate; stop-slop lint on both languages; the standing no-AI-imagery rule;
the triple-lock untouched.

### 50. Ideas the commission did not name

1. **The gift engine** (§42) — the PDF keepsake as birthday/Mother's Day/anniversary
   present is plausibly the strongest conversion mechanic the product owns; nobody
   markets "a report" but everyone needs a present for a 70-year-old.
2. **Otázky k nedělnímu obědu / Питання до недільного обіду** — a weekly three-
   question card generated from the week's feature: questions to ask your parents at
   Sunday lunch. Ownable ritual, zero data cost, pure positioning.
3. **Birthday cohort mechanics** — "Dnes slaví šedesátiny ročník 1966" recurring
   cards; people tag celebrants; the gift CTA is native here.
4. **The hundred-year-art format** — the product's honest fallback ("Umění, které už
   tehdy mělo svůj příběh") is a ready-made, PD-licensed, quietly beautiful series.
5. **"Vaše město se jmenovalo jinak"** — the rename resolver as a hook franchise
   (Gottwaldov/Zlín, Ždanov/Mariupol) — high surprise, low sensitivity when handled
   as everyday history.
6. **Weather-extremes almanac** — the 49 MB weather asset condensed into "nejteplejší
   léto vašeho dětství" cards; only the product can answer for *your exact day* — the
   cleanest tease-to-product format that exists.
7. **Paměť národa / Memory of Nations adjacency** — outreach idea for the owner
   (interview-based memory institutions share the audience; a respectful mention
   partnership, never data scraping).
8. **Teacher kits** (phase 3) — cohort features repackaged for history classes.

---

## Part IX — Concrete demonstrations

### Ten content concepts (pillar · data · why it stops the scroll)

1. Svět, do kterého se narodila vaše máma (1965) — flagship; countryDecades+films+
   weather; the parent frame beats the year frame.
2. Praha, 1950: děti hrají kuličky u Rudolfina — the licensed Bučina photograph,
   full-bleed, attribution on slide; everyday tenderness.
3. Když vám bylo deset v Gottwaldově — cohort × rename hook; everyday school detail.
4. Київ, 126 доріг у минуле — Kyiv city feature from its 126 cityFacts records,
   UA-led ordering.
5. Kolik stál chleba, když váš táta nosil aktovku — pricesWages + everyday; concrete
   number hook (verified, with the pre-1953 comparability warning respected).
6. První televize v česk(oslovensk)ých obývácích — mediaMilestones; "kdo z vaší
   rodiny ji viděl první?"
7. Dva tehdejší světy: Praha 1985 / Київ 1985 — parallel everyday, no scoring.
8. Pohádky, které znala celá generace — fairy-tale film records (age gate 3–9),
   participation close.
9. Jaké bylo počasí v den, kdy jste se narodili? — weather tease, product CTA.
10. Umění, které už tehdy mělo svůj příběh — the fallback-as-format card.

### Five bilingual hooks

1. "Narodili jste se v roce 1965? Tohle byl váš první svět." /
   "Народилися 1965-го? Це був ваш перший світ."
2. "Když se narodila vaše máma, vypadal svět takhle." /
   "Коли народилася ваша мама, світ виглядав ось так."
3. "Vaše město se tehdy jmenovalo jinak." / "Ваше місто тоді називалося інакше."
4. "Kolik stál rohlík, když bylo vašemu tátovi deset?" /
   "Скільки коштувала булочка, коли вашому татові було десять?"
5. "Zeptejte se babičky na rok 1958. Tady je nápověda." /
   "Запитайте бабусю про 1958-й. Ось підказка."

### Three carousel outlines (compressed)

**A. "Svět vaší mámy, 1965" (8 slides, Tier 0/1):** hook (parent frame) → scene
(Československo 1965, place chip) → everyday (shops/money detail, countryDecades) →
culture (a 1965 premiere, Wikidata-cited) → city texture (one cityFact, single-source
framing) → the world was changing (one countryEvent, honest context line) → the human
turn ("do tohohle světa se narodila dnešní šedesátnice") → close: "Zeptejte se jí, co
si pamatuje. / Запитайте її, що вона пам'ятає." + gift CTA.

**B. "Praha 1950: kuličky u Rudolfina" (6 slides, Tier 1):** photo full-bleed with
attribution (Ferdinand Bučina, Wikimedia Commons, CC BY-SA 3.0) → what the photo
shows (caption expanded) → the everyday around it (two cityFacts) → the context line
(early-50s reality, `difficult` register, one sentence, no drama) → "kdo z vaší
rodiny byl tehdy dítě v Praze?" → product city CTA.

**C. "Коли вам було десять у Києві" (7 slides, Tier 0, UA-led):** UA hook first,
CS under → Kyiv scene (rename-aware) → school/everyday (cityFacts) → culture (UA
premiere if data; else researched, else community-sourced question) → city photo or
art fallback → the turn → memory question close.

### Sample bilingual slide (hierarchy demonstration)

```
MĚSTO TEHDY · МІСТО ТОДІ                              [eyebrow]
V roce 1975 jezdila Prahou poslední pravidelná
tramvaj přes Václavské náměstí.                       [CS, scale 1.0]
――――――――                                              [hairline, 40%]
1975 року Прагою востаннє курсував регулярний
трамвай через Вацлавську площу.                       [UA, scale 0.85]
1975 · Praha, Československo        zdroj: archiv     [footer chip + source]
```

### Five captions (CS first, UA second, abbreviated here to the CS half)

1. "Rok 1965 nebyl jen letopočet. Byl to něčí první svět. …celý kontext v karuselu.
   Komu ho pošlete?" + UA + #tehdejšísvět #1965 #rodina
2. "Tahle fotka má 75 let a pořád je na ní slyšet smích. Ferdinand Bučina, Praha,
   padesátá léta. (Foto: Wikimedia Commons, CC BY-SA 3.0)" + UA
3. "Kolik stál chleba v roce 1972? A kdo vám to doma ještě umí říct z hlavy?" + UA
4. "Zeptali jsme se dat, jaké bylo počasí v den vašeho narození. Odpověď zná
   tehdejšísvět.cz — na den přesně." + UA
5. "Nas nazývaly celé třídy stejně. Jména mají generace. Jak se jmenovala ta vaše?"
   + UA (runs only after the names research lands)

### Five Threads concepts

1. "Rok, který si nikdo nepamatuje sám za sebe: 1965. Ptejte se rodičů, my dodáme
   kontext. Dnes: co stálo kino."
2. UA-led: "Який спогад з дитинства у Києві ви б зберегли назавжди? Ми збираємо
   контекст епохи — ваші спогади залишаються вашими."
3. "Malý kvíz: jak se jmenoval Zlín v roce 1955? (Nápověda: po jednom prezidentovi.)"
4. "Které město máme zpracovat příště? Počítáme hlasy každou neděli."
5. "Pamatujete si první televizi u vás doma? Čí byla — vaše, sousedů, babiččina?"

### Five Facebook concepts

1. The 1965 flagship as photo+full bilingual text post, question pinned in comments.
2. City feature posted natively + owner-shared into "Stará Praha"-type groups.
3. "Poznáte, který rok je na téhle fotce?" (licensed photo, answer in comments after
   a day).
4. Birthday cohort card: "Ročník 1956 letos slaví sedmdesátiny. Tohle byl jejich
   první svět." (gift CTA native here).
5. Sunday-lunch questions card, shared Saturday evening.

### Ten family/generation CTAs

1. Pošlete to někomu, kdo vyrůstal v osmdesátkách. / Надішліть тому, хто ріс у 80-х.
2. Kdo z vaší rodiny se narodil v roce 1965? / Хто у вашій родині народився 1965-го?
3. Zeptejte se mámy, co si z toho pamatuje. / Запитайте маму, що вона з цього
   пам'ятає.
4. Vytvořte jim jejich Tehdejší svět k narozeninám. / Створіть їм їхній Тодішній
   світ на день народження.
5. Porovnejte svůj svět se světem svých rodičů. / Порівняйте свій світ зі світом
   батьків.
6. Označte spolužáka, který u toho byl. / Позначте однокласника, який це пам'ятає.
7. Jaká vzpomínka vám z toho roku zůstala? / Який спогад з того року у вас лишився?
8. Přepošlete to do rodinné skupiny. / Перешліть у родинний чат.
9. Kdo vám o tomhle vyprávěl jako první? / Хто вам розповів про це першим?
10. Uložte si to na nedělní oběd. / Збережіть до недільного обіду.

### Sample week (editorial calendar excerpt)

Mon: flagship year feature (IG+FB) · Tue: Threads memory prompt · Wed: city feature
(IG+FB, group distribution) · Thu: Stories weather tease + poll · Fri: culture card ·
Sat: Sunday-lunch questions card (FB evening) · Sun: insights overlay (internal, $0
public).

### Database-derived vs research-justified (the boundary, demonstrated)

Straight from the snapshot (no research): every example above except names and UA
music. Research-justified: "Nejoblíbenější jména roku 1965" (product has 2010–2023
CZ only → venture research dataset, ČSÚ/MV sources, marketing-side only);
"Co hrálo z rádií v Kyjevě 1975" (no music data exists → community memories map it,
research verifies); "Ostrava 1958 každodennost" if its cityFacts slice is thin for a
requested feature (supplemental brief, ≤ $0.30, dossier kept).

### Example meeting output (Day A record, abbreviated)

```
ts-desk 2026-09-02 · cycle 07 · day A
Shortlist (top 4 of 31 scored):
1. 87 — "Svět vaší mámy, 1966" (cohort-60th-birthday timing ×1.3, parent frame,
        rich data, no research needed)
2. 84 — "Київ, коли вашій бабусі було десять" (UA-led, 126 city records, photo
        available, UA balance pressure ×1.2)
3. 79 — "První televize" (mediaMilestones cited, participation potential high)
4. 71 — "Praha 1968 v každodennosti" (tier 2 — human review required, two-source
        rule; deferred: August window passed, held for research)
Decisions: produce 1 and 2 this cycle; no research call (both fully covered);
experiment: hook frame parent-vs-self on feature 1; agenda filed: none.
```

---

## What this does not touch

The `dontwannaknow` repository — no writes, ever; adoption is marketing-side only.
The product's privacy architecture, its no-runtime-AI rule, its monetization limits
(no ads, no tracking scripts) and its editorial gates. The $30 / $25 / $1.00
ceilings ($4/month model + $2/month research fits under them). The social
triple-lock — drafts-only, owner-hand posting, publisher refuses the venture by
name. Treasury, metrics-ingestion hold, the magazines, the sibling venture designs.
The Design Lab's determinism. The GoVIRAL recipe (the venture adds a topicSet on
free signals only).

## Open questions for the owner

1. The production domain is the launch precondition — when does it land? (It is
   already `[imp:5]` in the product's own NEEDED.md.)
2. May the 19 licensed city photographs appear in social cards with on-slide
   attribution (the deliberate divergence from the product's internal share-image
   rule)?
3. Handle preference: @tehdejsisvet everywhere, or country variants?
4. Is the Vercel Hobby → Pro-team question worth resolving now (likely $0 marginal
   on the existing Pro team) or deferred until the venture demonstrably drives
   traffic?
