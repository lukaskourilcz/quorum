# Phase 2 — GoVIRAL, trending signals, marketing skills, and the end of the Magazine Incubator

You are continuing work on the BoardlessAI system in `quorum` (orchestrator + config + state + site), with the two magazine repos `aifirst` (DNESKAi) and `mma-files` downstream. **Phase 1 (`docs/ORCHESTRATION-OVERHAUL-PROMPT.md`) is assumed complete** — verify it landed (the §0.4 decision records exist, the studio meeting and article-pm are gone, the incubator is paused, the roster is ~30) before starting; if a Phase-1 item this document depends on is missing, do that item first.

Everything below is decided and owner-approved. All external prices and endpoints in §1 were verified live on 2026-08-06 — re-verify any price before wiring it, but do not re-litigate the choices.

---

## 0. Authority and boundaries

Same as Phase 1 §0, unchanged: the $30/mo all-in cap, $25 model share, $1.00/day pace are untouchable; truth gates, the social triple-lock (no posting, no channel enablement), treasury/human-payment rules, Czech single-call article writing, and append-only decision records all stand. Two additions:

- **Apify account**: the owner must create it and add `APIFY_TOKEN` — write the `HUMAN_APPROVAL` item (§9); build everything token-gated so the pipeline degrades to a $0 no-op until the token exists. Never upgrade the plan in code or docs: the Free plan's hard stop at $5 credit **is** the budget guard.
- **Scraped content is untrusted data**: everything fetched from Apify/RSS enters rooms only inside the existing untrusted-data wrapping, is never fed to the magazine writers as instructions, and raw scraped items are retained ≤30 days (aggregate trend summaries may persist). Never republish a scraped post, handle, or image in either magazine.

Verification gates and commit discipline: identical to Phase 1 §0.3/§0.5. The clock-pinning tests (`ci-policy.test.ts` — pins the exact cron count, `vercel-cron.test.ts`, `portfolio-schedule.test.ts` — pins `cronPayloads` length, `cron-slots` tests, `meetings.test.ts`, `scheduled-run-leaves-a-record.test.ts`) must move in the same commit as every clock change in this document.

---

## 1. Verified facts — build on these, do not re-research

**Apify (verified 2026-08-06):**
- Free plan: $0, **$5 platform credit/month**, no credit card, credits don't roll over, and when the credit is exhausted actors simply stop — overspend is impossible. Pay-per-event actor charges draw from this credit. Starter is $29/mo — with ~$15.7/mo model spend that busts the $30 cap; it is not an option.
- Full REST API on Free (token auth; `run-sync-get-dataset-items` waits up to 300s and returns the dataset). Schedules/tasks included.
- Actor prices (Free-plan tier): `apify/instagram-search-scraper` $1.50/1k (its "Popular Reels" mode is the most direct scrapeable trending surface); `scrapesmith/instagram-hashtag-scraper` $0.50/1k (4.17★, 99.9% success — 4× cheaper than the official hashtag actor, which returns recent-not-top anyway); `themineworks/threads-scraper` $1.00/1k (top/recent sorting, tag mode, monitorMode for deltas, no start fee, 100% success since its 2026-07-25 rebuild — young actor, 104 users); fallback `magicfingers/threads-scraper` $0.60/1k; `agentx/instagram-trending-scraper` (live Instagram **Explore** feed with section labels — the closest thing to a real trending API) $0.01 start + $0.0039/result; `apify/instagram-scraper` $2.70/1k for ad-hoc deep dives. Rejected: `curious_coder/threads-scraper` ($30/mo rental = the whole cap), `automation-lab/threads-scraper` ($5/1k = 5× themineworks), all X/Twitter actors (usable only with the $29 Starter plan).
- Legal posture: Meta v. Bright Data (N.D. Cal. 2024) — Meta's ToS do not bar logged-out scraping of public data; none of the chosen actors takes a login or cookie, so the owner's future IG/Threads accounts are never involved and carry zero ban risk from scouting. GDPR: aggregate internally, purge raws, never republish.
- **The $5 credit is one shared pool.** The GoVIRAL weekly recipe (§2.4, ~$4.60/mo) owns it. Nothing else may draw on Apify credit — the magazines' trending signals use the free endpoints below instead.

**Free trending endpoints (all live-verified 2026-08-06 from this runner):**
- HN Algolia (`hn.algolia.com/api/v1/search`) — free, no key, returns points/num_comments/created_at → velocity is computable. The HN front page is already one of DNESKAi's 32 sources; velocity is not yet exploited.
- Google Trends "Trending Now" RSS — `trends.google.com/trending/rss?geo=CZ` and `?geo=US`, free, includes `ht:approx_traffic`. The only free "the general public is searching this NOW" signal, and geo=CZ is Czech-audience data none of the English sources provide.
- Google News RSS query feeds — `news.google.com/rss/search?q=<query>+when:1d` works in EN and CS (`hl=cs&gl=CZ&ceid=CZ:cs`); article-count velocity per entity is real cross-outlet press volume.
- Reddit: anonymous JSON is **dead** (403 since 2026-05-28, verified), but subreddit **RSS still works** (`reddit.com/r/MMA/hot.rss` returned 200) — rank-only, no vote counts, and Reddit has flagged RSS as next to close, so build it to degrade gracefully to zero. Reddit's free OAuth tier is non-commercial-only (ToS-grey for a monetized magazine — do not build on it). Do NOT pre-build the Apify Reddit fallback (`trudax/reddit-scraper-lite`, $3.40/1k) — it would eat most of GoVIRAL's credit; leave it documented as a future owner decision.
- Not worth it (decided): X/Twitter in any form; Apify Google News actor ($20/mo rental wrapping the free RSS); Apify Google Trends actors (emastra 3.22★ / resounding_diplomacy 0% success — the free RSS covers the need); pytrends (archived 2025-04, unmaintained); Google's official Trends API (application-gated alpha — the owner may apply, nothing may depend on it).

**marketingskills repo:** `github.com/coreyhaines31/marketingskills`, MIT (© 2025 Corey Haines), 49 standard Claude Code skills, pinned commit `7868cb9251fad80a73d26e488a5ad5f6c4a9f335` (v2.10.0). Vendoring verbatim with the license notice is fully allowed.

**Quorum wiring facts:** venture cadences are `daily@HH:00` only — no weekly form exists and adding one breaks ~8 consumers (schema superRefine, founding hour math, `parseCadenceHour` which throws at module load, cronPayloads, site cron-slots, 5+ pinned tests). The house pattern for weekday behavior is a deterministic gate/wheel in code (TT weekday wheel, mma-intake weekday casts, $0 `RoomStayedShut` records). Deterministic ingestion pre-steps before seats exist twice (`refreshFightAiQEvidence`, `refreshIncubatorEvidence`) with content-hash change triggers and $0 closes. The Cito quota-guard pattern (`orchestrator/src/portfolio/evidence.ts:96-232` + `state/mma/source-quota/cito.json`) is the template for metered external APIs. Network gating is double: `config/network-allowlist.json` runtimeHosts AND the per-call `allowHosts` of `safeFetch` (`orchestrator/src/security/url.ts` — HTTPS-only, 1MB cap, 8s timeout, POST supported). Non-LLM tool money cannot enter `state/budget/ledger.json` (schema is text|image only); it enters via `config/fixed-costs.json` → all-in KPI, and purchases via the treasury. After Phase 1 the clock hours 07, 13, 18, 21 are free.

---

## 2. Apify integration (GoVIRAL's data supply)

### 2.1 Registration and gating
- Add `config/goviral-sources.json` modeled on `config/mma-sources.json`: one entry per pinned actor (`id`, `actorSlug`, `credentialEnv: "APIFY_TOKEN"`, `freeLimit: "$5 Apify platform credit per month, shared account-wide"`, `termsVerdict`, `termsNote` citing the Meta v. Bright Data logged-out-public-data posture and the no-login rule, `evidenceUrl`). Pin exactly: `apify/instagram-search-scraper`, `scrapesmith/instagram-hashtag-scraper`, `themineworks/threads-scraper`, `magicfingers/threads-scraper` (fallback), `agentx/instagram-trending-scraper`, `apify/instagram-scraper` (reserve, not scheduled).
- Add `api.apify.com` to `config/network-allowlist.json` runtimeHosts and to the fetch adapter's `allowHosts`. Add `APIFY_TOKEN` to `cycle.yml` job env and `.env.example`.
- Topic inputs live in the same config file as three named topic sets: `writer` (seeded from the owner profile file, §4.4), `dneskai` (AI/tech: e.g. #AI, #umelainteligence, "artificial intelligence", model names), `mma` (#MMA, #UFC, #oktagonmma, fight-week entities). Keep every set owner-editable JSON, not prompt text.

### 2.2 Quota guard (hard, before any request)
Copy the Cito pattern into a `goviral` guard: constants `APIFY_MONTHLY_CREDIT_USD = 5.0` and `APIFY_RUN_RESERVATION_USD = 1.40` (one weekly recipe's worst case); counter file `state/goviral/source-quota/apify.json` (`goviral-apify-quota/1`: month, estimatedUsedUsd, reservedPerRun, updatedAt, perActorCounts). Refuse the run when reservation would cross the credit; after each actor call, add its per-result price × items to the counter. Where Apify's usage API offers the real monthly figure, prefer it (the Odds-API-headers precedent). A refused or failed scout is a **$0 stale-data outcome, never an error** (§3.4).

### 2.3 The fetch pre-step
`refreshGoViralTrends({root, date, now})` in `orchestrator/src/portfolio/evidence.ts`, called from the `gv-brief` branch of `run.ts` before any seat, only on scout day (§3.3):
- Runs the recipe (§2.4) via `run-sync-get-dataset-items` POST calls; every call token-gated and quota-guarded.
- Writes `state/goviral/trends/<date>.json` (`goviral-trends/1`): `generatedAt`, `sourceResults` (per-actor status/count/estimatedUsd), aggregated `items` (per item: platform, kind [reel|post|thread], topicSet, text ≤280 chars, engagement counts, timestamp, url, hashtags, audio fields when present), and computed `signals`: top hashtags by engagement velocity (likes-per-hour-since-posted, week-over-week delta vs the previous snapshot), top formats, top audio (aggregated repeated song/artist across popular reels), Explore section labels, per-topic-set top-5 summaries.
- Evidence refs: `source:apify:instagram:<date>`, `source:apify:threads:<date>` — added to the room's `evidenceRefs` so seats can cite them (out-of-packet refs are dropped by design; keep that).
- Content-hash change trigger: if the fetch fails entirely or returns nothing new, the room opens on the newest prior snapshot if it is ≤14 days old (with the honest packet line "No fresh scout this week — working from the <date> snapshot"), else records a $0 pause "Trend scouting produced no data this week, so the meeting was not held."

### 2.4 The weekly recipe (fits the $5 credit with margin; cash cost $0)
1. IG Popular Reels — `apify/instagram-search-scraper`, 3 keywords (one per topic set), ~64 reels each ≈ 190 results → ~$0.29/wk.
2. IG hashtag pulse — `scrapesmith/instagram-hashtag-scraper`, 12 hashtags × 25 posts = 300 → ~$0.15/wk.
3. Threads top search — `themineworks/threads-scraper`, 8 keywords × 30 top posts = 240 → ~$0.24/wk.
4. Threads tracked accounts — `themineworks` profile mode + monitorMode, 15 accounts × 15 posts = 225 → ~$0.23/wk.
5. IG Explore snapshot — `agentx/instagram-trending-scraper`, 120 results, **monthly** (first scout of the month) → ~$0.12/wk averaged.
Weekly ≈ $1.03; monthly ≈ **$4.40–4.60 of the $5 credit**. Hard-cap every actor input (`maxResults`) at these numbers in config. If the quota file shows the month running hot, the guard drops steps in reverse order (5 first, then 4). Log per-run actual usage into `sourceResults`.

### 2.5 Hygiene
- Raw `items` older than 30 days are pruned by the pre-step (aggregated `signals` persist).
- A monthly self-check inside the pre-step re-reads each actor's store page price is NOT possible at runtime — instead write the pinned prices into `goviral-sources.json` and surface a NEEDED `[owner:me]` reminder every quarter to re-verify prices/success rates (§9).
- The scraped text enters seat packets only via the existing untrusted-data wrapper.

---

## 3. The GoVIRAL venture

### 3.1 Registry entry
Add to `config/ventures.json`:
- `id: "goviral"`, `name: "GoVIRAL"`, `status: "operating"`, `taste: true`, `ledgerNamespace: "goviral"`.
- `growth_objective`: label "Deliver a weekly trend brief and keep a rated inventory of marketing plays for every venture", components: reuse `campaign-inventory` (closed enum — do not extend it for this).
- `adminTabs: ["plans", "ideas"]`.
- One meeting: `kind: "gv-brief"`, label "GoVIRAL trend and marketing room", `cadence: "daily@13:00"` (the hour the studio freed), cast `[PULSE, SCOUT, ANGLE, AUDIT]`, `envelopeUsd: 0.06`, packet `{topicType: "growth", decisionNeeded: "PLAN", preset: "gv-brief-room"}`, objectives (dry/live) written per §3.5.

### 3.2 Phase fan-out (mechanical, complete list)
Add `gv-brief` to: `ScheduledPhaseSchema` (`orchestrator/src/types.ts`), `AgendaPhaseSchema` (`contracts/meeting-agenda.ts`), `MeetingRecordSchema` phase+kind (`contracts/meeting-record.ts`), the calendar contract + mapping (`contracts/calendar.ts`, `meetings/calendar.ts`), `isPortfolioPhase` (`meetings/clock.ts`), `PortfolioPhase` union + all switch branches (`portfolio/run.ts` — context, chair=PULSE, promptName→`prompts/goviral.md`, buildRecord), the effective budget shape phase list **and** the degradation ladder in `portfolio/schedule.ts` (take the rungs the incubator vacates: gv-brief drops first under budget pressure), `config/meeting-policy.json` (`standingAgendaPhases` + transitions: `morning→[...existing, gv-brief]`, `"gv-brief": ["gv-brief", "mag-desk", "cu-product", "tt-marketing"]`), `config/agent-routing.json` new `gv-brief-room` preset (required: PULSE, SCOUT, ANGLE, AUDIT), cycle.yml crons (2 entries via `cronPayloads`) + workflow_dispatch enum, `site/vercel.json` (2 entries), `site/src/lib/cron-slots.ts`. Update every pinned clock test in the same commit.

### 3.3 Weekly rhythm without a weekly cadence (decided)
Do **not** add a `weekly@` cadence form. In the `gv-brief` branch of `run.ts`, before anything else: the room opens when `date` is a **Monday** (Europe/Prague) **or** a pending agenda targets `gv-brief`; otherwise it writes a $0 `RoomStayedShut` record with the plain sentence "This room meets on Mondays. Nothing was spent." (new `shutByNotScoutDay` builder following the three existing `shutBy*` patterns). The Apify pre-step (§2.3) runs only on Mondays; an agenda-triggered mid-week opening works from the stored snapshot. The two daily cron firings on off-days are $0 no-ops — accepted.

### 3.4 Cast and repurposing SCOUT (headcount stays flat)
- **SCOUT is repurposed, not retired.** Phase 1 paused it (incubator-only agent). Reactivate with a rewritten profile in `config/agents.json`: title "Trend Scout", mission "Reads the weekly Threads/Instagram scout data and names what is genuinely rising, with the numbers that show it — never inventing a trend the data cannot support." Rewrite `prompts/scout.md` accordingly. Record the change in the org-change record (§9). Its old incubator KPI registry entries: delete; ownership entries for trend duties may be added as `measurement kind: none` ownership records only.
- PULSE chairs (marketing lead), ANGLE positions (which trend fits which venture and the owner's voice), AUDIT vetoes (no posting, no spend, no fabricated metrics, adult/brand-safety on trend picks).
- No new agents. `venture-agent-controls.json` gets a `goviral` entry: lockedOn `[PULSE, AUDIT]`, switchable `[SCOUT, ANGLE, COHORT, SCENE, FUNNEL]`, disabled `[]` — COHORT/SCENE/FUNNEL are optional future guests, not seated by default.

### 3.5 Room objective and prompt
Write `prompts/goviral.md` (English, like every room prompt). It must carry the working method itself (runtime prompts do not load skill files — distill, don't reference):
- The room's three jobs, in priority order: (1) the owner's weekly content brief; (2) marketing ideas/strategy/analysis for DNESKAi and MMA Files (and Titty Tuesdays when relevant); (3) trend signals worth handing to the magazine desks as agendas.
- Distilled craft rules from the vendored skills (§6): content-pillar thinking; the five hook families (curiosity / story / value / contrarian / social-proof); Threads platform facts (500-char max, 1 topic tag, first 1–2 lines decide, algorithm favors followed accounts + recommendations over hashtags); Instagram facts (1–2 feed posts/day max, fewer hashtags outperform stuffing, Reels + value-carousels + interactive Stories lead); the newsjacking discipline (score trend-fit before proposing; veto tragedies/politics; "most weeks some trends are skipped — that is correct"); searchable-vs-shareable content split; velocity beats volume (a rising small trend beats a peaked big one).
- Hard rules: cite only packet evidence refs; every claimed number must come from the scout data; no posting, no spend, no follower promises; drafts and plans only.
- Objectives in ventures.json — dry: "Review the fixture scout data and record one plan without external work or spend." live: "Turn this week's scout data into the owner's weekly content brief and record marketing ideas for the magazines; hand at most one trend-driven agenda to another venture's room."

### 3.6 Site and reporting surfaces (complete list)
Add `goviral` to: week-board `ProjectKey`/labels/`projectForKind` (`site/src/components/week-board.tsx`), decision-feed kind label ("GoVIRAL trend room" — and this is the same edit that fixes the five-kind fall-through bug from Phase 1 §10.7), the money page venture map, `orchestrator/src/money/monetization.ts` venture enum, `notify/digest.ts` + `notify/operations.ts` venture lists, `/ventures` page card + a section in `ventures/[slug]/page.tsx` (a simple generic panel: what the venture does, latest brief date, idea count — no bespoke component needed), and the admin venture list (tabs render automatically from `adminTabs`; idea cards and plan cards already read `state/ideas/goviral/` and `state/ventures/goviral/plans/`).

### 3.7 KPIs (measurable from day one, `critical: false`)
Add to `config/kpis/2026-Q1.json` + collector: `goviral.weekly-briefs` (count of brief plans in `state/ventures/goviral/plans/` per period; target ≥1/week pace), `goviral.trend-snapshots` (files in `state/goviral/trends/`; target ≥1/week), `goviral.ideas-recorded` (ledger entries per week — reuse the existing idea-ledger parsing), `goviral.cross-venture-agendas` (agendas in the queue with sourcePhase `gv-brief`; target ≥2/quarter). The taste loop comes free (`taste: true` → palate pre-step + `state/ratings/goviral/` + `state/taste/goviral/TASTE.md`).

---

## 4. GoVIRAL outputs

### 4.1 The weekly content brief (the owner-facing product)
The room's chair contribution produces the brief; the run writes it as **marketing-plan/1** JSON + rendered markdown to `state/ventures/goviral/plans/plan-<date>-weekly-brief.{json,md}` (reuse `renderMarketingPlanMarkdown`). Contents: this week's 3–5 trend calls (each: what is rising, the evidence numbers, why it fits the owner's niches), 5–10 concrete content ideas for the owner (per idea: platform, format [thread/carousel/reel-script/post], a written hook using one of the five hook families, and which trend it rides), one "skip this" note (a trend deliberately not chased, with the reason), and a 7-day posting calendar skeleton. `postable_assets`: one stub referencing a live CarouselEngine template id (the schema requires ≥1 — the TT fallback pattern). KPI fields must reference stored measurements only. It renders on `/admin?venture=goviral&tab=plans` with rating widgets — no new UI. On brief days, add one line with the brief's title to the night digest email.

### 4.2 Marketing for DNESKAi and MMA Files
- Seat ideas are auto-recorded to `state/ideas/goviral/` (existing machinery) — instruct seats that magazine-marketing ideas name the venture in the title ("DNESKAi: …", "MMA Files: …").
- The chair may file one `followUpRequest` per room; transitions (§3.2) let it target `mag-desk`, `cu-product`, or `tt-marketing` — this is how "GoVIRAL decided X is trending, the magazine desk should act on it" formally reaches the other rooms as tomorrow's decision-shaped agenda.
- Do not build new asset renderers or social queues: the CarouselEngine decks per article and the (channel-gated) social pack composers already exist. GoVIRAL plans reference them.

### 4.3 Trend injection into the magazines' daily article selection
Extend the trends artifact with a compact `forMagazines` block (top AI topics and top MMA topics with velocity numbers and refs, from the shared scout data plus §5 free signals). Inject it into: the mag-editorial/mag-desk context branch (`run.ts` — alongside the MMA bridge) and the cu-edition curation context (`edition/curate.ts` packet), with its refs added to allowed evidence. Instruction line in both: trending status is a **tiebreaker between equally sourced candidates, never a substitute for sourcing** — truth gates unchanged.

### 4.4 The owner profile
Create `state/ventures/goviral/profile.md` with placeholder sections (niches/topics the owner writes about, voice notes, audiences, "never write about") and a NEEDED `[owner:me]` item to fill it (§9). The gv-brief packet includes it; until filled, the writer-brief sections lean on the two magazine niches and say so honestly.

---

## 5. Free trending signals for both magazines (no Apify credit)

New module `orchestrator/src/sources/trending.ts`, run as part of the existing daily source scrape (cu-edition) and as a cheap deterministic step before mag-editorial:
- **Allowlist additions** (`config/network-allowlist.json`): `hn.algolia.com`, `trends.google.com`, `news.google.com`, `www.reddit.com` (RSS paths only).
- **AI (DNESKAi):** (1) HN velocity — for digest candidate stories, query HN Algolia and score points-per-hour + comments-per-hour; (2) Google Trends RSS geo=CZ + geo=US matched against an AI/tech vocabulary, weighted by `ht:approx_traffic`; (3) r/artificial + r/LocalLLaMA hot RSS as rank-only boosts (top-10 presence).
- **MMA:** (1) r/MMA + r/ufc hot RSS rank matching against the fighter/event dictionary (`orchestrator/src/fightaiq/wikipedia-events.ts` entities); (2) Google News RSS count velocity — 2–6 daily queries (EN + CS) per active event/fighter, score = 24h article count and day-over-day delta; (3) the same Google Trends RSS fetch matched against the fighter/event dictionary (one fetch, two consumers).
- **Scoring rules:** a silent signal is never negative evidence; Reddit signals must degrade to zero gracefully (Reddit may close RSS — treat fetch failure as absence, log source health like any other source); rank-only data is labeled rank, never "engagement". Output lands in the same daily trends artifact (§4.3) with `source:trending:<provider>:<date>` refs.
- **Explicitly rejected (record in the decision file so it stays decided):** X/Twitter scraping in any form; the Apify Google News rental actor; Apify Google Trends actors; pytrends and forks; Reddit OAuth free tier as a dependency. Optional NEEDED item: apply to Google's official Trends API alpha (free; if granted, it replaces the RSS fetch).

---

## 6. Vendor the marketing skills (MIT, pinned commit `7868cb9`)

Vendor **verbatim** into `.claude/skills/`, each with `UPSTREAM.md` (source URL, pinned commit, MIT notice), and mirror byte-for-byte into `.agents/skills/` (the architecture drift test enforces the mirror — update both in one commit). Register in `config/agents.json` `skillRefs` for the relevant agents (PULSE, SCOUT, ANGLE at minimum). These load in interactive sessions only; their runtime value is the distilled guidance already written into `prompts/goviral.md` (§3.5).

**Vendor exactly these eight:**
1. `social` (all 10 files) — the core: hooks, pillars, weekly calendar template, platform limits (incl. current Threads/IG facts), listening triage loop, `carousel-frameworks.md` (5 slide-by-slide carousel architectures — also store as design input for future CarouselEngine templates), `reverse-engineering.md` (pin a note in UPSTREAM.md: its SCRAPE step's Apify/PhantomBuster suggestion is superseded by §2's owned pipeline; use manual collection paths in interactive sessions).
2. `marketing-loops` — loop templates, loop state/idempotency, guardrails (its Tier-1 autonomous / Tier-2 human-gated split mirrors golden rule 5), and the newsjacking + social-listening loop designs GoVIRAL implements.
3. `marketing-ideas` — 139 ideas indexed by budget (use the low/no-budget tier), stage, and use case; raw material for the magazine marketing batches.
4. `content-strategy` — searchable-vs-shareable split, pillar criteria, ideation sources.
5. `ai-seo` — DNESKAi-relevant: how to get cited by AI answers; the workflow is manual/free (ignore its optional paid-tool mentions).
6. `marketing-psychology` — ~40 mental models/biases; raises brief and analysis quality at zero cost.
7. `copywriting` (with `copy-frameworks.md`) — AIDA/PAS etc. for slide sequences and Threads posts. Do **not** vendor `copy-editing` (conflicts with the existing stop-slop contract).
8. `product-marketing` — then generate one context doc per venture (`.agents/product-marketing-goviral.md`, `-dneskai.md`, `-mma-files.md`) drafted from existing `state/` (BUSINESS, BRAND, venture configs) so every vendored skill stops re-asking foundations.

**Do not vendor** (and record why in the vendoring commit message): `ads`, `ad-creative`, `cold-email`, `prospecting`, `sms`, `influencer-marketing`, `referrals`, `directory-submissions` (paid/outbound tactics that violate the $30 no-ads honest operation), `competitor-profiling` (hard-depends on Firecrawl $16/mo + DataForSEO $50 minimum — both bust the cap), `marketing-plan` (assumes funded-SaaS budget scaling), `marketing-council` (duplicates the real council), `image`/`video` (conflicting media doctrine — quorum has its own provenance rules), and the SaaS-funnel set (signup/pricing/churn/onboarding/revops/paywalls/popups/cro/etc.). If a vendored skill's trigger description collides with an existing quorum skill in practice, tighten the vendored description and note the divergence in its UPSTREAM.md.

---

## 7. Remove the Magazine Incubator completely

Phase 1 paused it (meetings off the clock, venture `paused`, SCOUT paused). Now delete it. The owner's direction: no more new-magazine ideation, ever — a future venture would be founded the way GoVIRAL is founded here, by direct config.

### 7.1 Code excision (orchestrator)
- Delete `orchestrator/src/incubator/` (packet.ts, process.ts) and every incubator branch in `portfolio/run.ts`: the packet imports (~83-95), context fall-through (~824-849), scan pre-step + trigger (~1007-1030), scan read-log (~1531-1533), synthesis proposal parse/write (~1298-1303, 1507-1524), template-founding call (~1600-1609), buildRecord branches (~359-385), promptName branch (~1134).
- Delete `prompts/incubator.md`; delete the `incubator-scan-room` / `incubator-synthesis-room` presets (`config/agent-routing.json`), the incubator entry in `config/venture-agent-controls.json`, and the venture entry in `config/ventures.json`.
- Delete `orchestrator/src/ventures/founding.ts`, `config/venture-template.json`, the `templateOperation` schema block in `contracts/venture-registry.ts`, and `contracts/niche-proposal.ts` (NicheProposalSchema) with their fixtures — verified: their only producer was the synthesis room; GoVIRAL and any future venture are founded by direct registry edit.
- `autonomy/signals.ts`: remove the `evidence-backed-proposals` growth signal (reads incubator state) and the enum value from `growth_objective.components`.
- `portfolio/schedule.ts`: remove the incubator degradation-ladder rungs (gv-brief takes the drop-first position, §3.2); `finance/budget-alert.ts`: rewrite the "reduced: incubator first" wording; `money/monetization.ts`, `notify/digest.ts`, `notify/operations.ts`: remove the incubator venture id; `proof/portfolio-proof.ts`: drop incubator fixtures.

### 7.2 Keep history readable (same split as the studio precedent)
**Retain** `incubator-scan`/`incubator-synthesis` in `MeetingRecordSchema` kind/phase enums and the calendar contract — committed records from Aug 1–6 must still parse and render. **Remove** them from `AgendaPhaseSchema`, `ScheduledPhaseSchema`'s live clock expectations, `PortfolioPhase`, meeting-policy phases/transitions, cron surfaces, and site cron-slots.

### 7.3 KPIs and state
- Delete `incubator.complete-proposals` and `incubator.owner-rated-proposals` from `config/kpis/2026-Q1.json` and their collector reads; **delete** `company.founding-or-rated-proposals` too (its only inputs were incubator artifacts). Delete the incubator-scoped entries in the `config/kpis.json` ownership registry.
- Archive, do not delete, `state/{ideas,ventures,ratings,taste}/incubator/` — move under `state/archive/incubator/` with a one-line README (git history is the real archive; the move keeps live state honest).

### 7.4 Site sweep
Delete `/incubator` (redirect to `/ventures`), `site/src/lib/incubator-records.ts` (+test), the nav "New ideas" entry if Phase 1 left it anywhere, the week-board incubator `ProjectKey`/labels/rows, the decision-feed incubator label, the money-page label, the `/ventures` page incubator card and slug branch, the admin `niche-proposals` tab enum value + `proposalCards` + the shortlist branch in `admin/page.tsx`. Update the affected tests (the wiring audit lists: incubator.test, incubator-room.test, architecture, cycle, ideas, meeting-agenda, meetings, portfolio-schedule, priority-queue, quarterly-collector, council-commission, budget-quiet-day, ci-policy cron count, vercel-cron, cron-slots, scheduled-run-leaves-a-record).

### 7.5 SCOUT
Handled by §3.4 (repurposed to GoVIRAL). Delete/replace its two remaining incubator-external routing references if they conflict: the `evidence-room` preset (VIZE+SCOUT) may stay (SCOUT remains active), and the `source_coverage_low → SCOUT` mandatoryWhen rule stays (dead code — every call site passes empty riskTags — but harmless with an active SCOUT).

---

## 8. Records, budget, and cost truth

- **Decision record** (append-only, one file): GoVIRAL founding (registry entry, 13:00 slot, Monday rhythm, Apify free-plan-only posture with the §2.4 recipe and its prices, the §5 free-signal adoptions, the §5 rejected list) + incubator termination (supersedes its founding decisions; names Phase-1 8.5 as the pause it completes).
- **Org-change record**: SCOUT reprofile (paused incubator researcher → active GoVIRAL trend scout).
- **INBOX `HUMAN_APPROVAL` item**: "Create an Apify account (Free plan, no card) and add `APIFY_TOKEN` to Actions secrets. The pipeline stays a $0 no-op until then. Never upgrade the plan without a new approval — Starter ($29/mo) does not fit the $30 cap."
- **Treasury/fixed costs**: nothing to enter — $0 cash. Do not touch the budget ledger schema; Apify usage is tracked in the §2.2 quota file and surfaced in the room record's sourceResults.
- Expected marginal cost of everything in this document: **~$0.05–0.06/week model spend** (one 4-seat room, Mondays) + **$0 cash** (Apify credit + free endpoints). The all-in trajectory stays ≈ $16/mo of $30.

---

## 9. Owner checklist updates (`NEEDS_YOUR_HELP_NOW.md`)

Add: (1) the Apify account + `APIFY_TOKEN` item (blocking GoVIRAL's live scouting; everything else runs and pauses politely without it); (2) fill `state/ventures/goviral/profile.md` (niches, voice, audiences — until then briefs lean on the magazine niches); (3) optional: apply for Google's official Trends API alpha; (4) quarterly reminder: re-verify the pinned Apify actor prices and 30-day success rates (community actors are young; fail over `themineworks` → `magicfingers` if success drops below ~95%); (5) the Actions unblock decision: after the §10.7 secrets audit comes back clean, make `quorum` public (unlimited free Actions minutes on standard runners — the structural fix), otherwise GitHub Pro at $4/mo (needs a `HUMAN_APPROVAL` + `fixed-costs.json` entry) or a temporary Actions spending limit as the stopgap; (6) re-enable the social publisher's schedule trigger when social channels connect (§10.2). Remove any incubator-related items. Keep the Phase-1 items that still stand (Odds API key, Pexels/Pixabay, TT ratings, season-002, admin credentials, Vercel rename).

---

## 10. GitHub Actions minute diet — the 2,000-minute free tier died on Aug 6

Measured from the live API (150 runs, Aug 5–6 window): the repos burn **~342 runner-minutes/day ≈ 10,250/month** against the 2,000-minute free tier. Your target after this section: **≤ ~100 min/day**. All numbers below come from that measurement; the owner handles the current month's unblock (see §9 item 5) — you cut the burn.

### 10.1 Delete the OwnDashboard reporters (~1,700 min/mo)
`.github/workflows/owndashboard-cron-report.yml` exists in BOTH `quorum` and `aifirst` and fires after **every** workflow run (`workflow_run` trigger), billing the 1-minute minimum for ~6 seconds of work (~56 runs/day measured). Delete both files. If OwnDashboard reporting is wanted later, fold it into the daily health workflow as one batched report.

### 10.2 Stop the hourly social publisher (~1,600 min/mo)
`social-publisher.yml` runs hourly, pays ~4.3 min of checkout+install per run, and can never post — channels are triple-locked for ~a month. Remove the `schedule` trigger (keep `workflow_dispatch`), leave a comment plus the §9 NEEDED item to restore it when channels connect. When restoring, gate the job at **job level** (`if:` on the kill-switch repository variable) so a locked hour costs 0 minutes instead of 4. Update the ci-policy assertions that pin this file's contents.

### 10.3 Kill the cron double-fire (~600 min/mo)
The 18 GitHub `on.schedule` crons in `cycle.yml` are the unreliable backup; the Vercel-cron `workflow_dispatch` path is the punctual primary doing the real work (measured: schedule runs average 0.9 min guard-exits, dispatch runs 5.8 min). Replace the 18 crons with **3 backstop sweeps** (e.g. `55 3,11,19 * * *` UTC) whose only job is rescuing slots the Vercel path missed — the existing clock/guard logic already makes a no-op sweep exit cheaply. Update `cronPayloads`' GitHub-cron half and the pinned tests (`ci-policy.test.ts` cron count, `portfolio-schedule.test.ts` payload length); the Vercel side stays two entries per slot.

### 10.4 Early exit before dependency install (~1,000–1,500 min/mo)
Many dispatch runs are $0 gated/PAUSED slots that still pay ~4–5 min of checkout + pnpm install before the guard says no. Add a dependency-free early guard: a plain-Node script (`scripts/slot-guard.mjs`, fs-only, importing nothing from the workspace) that reads the fired slot, the live-enable repository variables and the committed slot records, and emits a step output `proceed=true|false`; every heavy step (pnpm setup, install, cycle, delivery) gets `if: steps.guard.outputs.proceed == 'true'`. A gated slot's run must end within ~1 billable minute. The committed-record double-fire semantics stay identical — the script is a cheap pre-check, not a replacement for the in-process guards.

### 10.5 CI path filters (~700 min/mo)
- quorum `ci.yml`: extend `paths-ignore` with `docs/**`, root-level `*.md`, `.claude/**`, `.agents/**` (`orchestrator/prompts/**` must KEEP triggering CI). Pull requests stay unfiltered.
- aifirst `ci.yml`: add `paths-ignore` for delivery-written paths (`content/**`, `public/data/**`, `public/images/editions/**`) — every delivery commit was already built and gated by the quorum delivery step minutes earlier; re-verifying it pays twice.
- mma-files `ci.yml`: the same for `data/boardless/**` and `public/images/articles/**`.

### 10.6 Small stops
- Verify Phase 1 §3.9 landed (aifirst `daily.yml` was failing daily — a billed run plus a junk issue every day).
- Cache the delivery builds: `actions/cache` on the target repo's `.next/cache`, keyed on its lockfile, inside the delivery steps — shaves the ~9-minute delivery runs.
- Rule going forward: no new scheduled workflow without its monthly minute cost stated in the commit message. GoVIRAL's §3 slot adds two Vercel entries and rides the 3 backstop sweeps — **no new GitHub crons**.

### 10.7 Secrets audit before the repo goes public (owner precondition)
The owner intends to make `quorum` public once it is proven clean — public repos get unlimited free Actions minutes, which is the structural fix. Run a complete audit and put the result in your final report:
- Scan the **full git history**, not just the working tree: prefer `gitleaks detect --source . --log-opts="--all"` (pinned binary or npx; if unavailable, a thorough regex sweep over `git log -p`) for API keys (`sk-`, `sk-ant-`, `ghp_`, `github_pat_`, `apify_api_`), private keys (`BEGIN … PRIVATE KEY` — the delivery App key must exist ONLY in Actions secrets), OAuth/bearer tokens, committed `.env` files, and connection strings.
- Sweep the non-code surfaces: `state/**` (INBOX, meeting records, ledgers — no tokens, no third-party personal data, no personal emails beyond the owner's public identity), `docs/**`, `media/**` (EXIF), and any committed artifacts.
- Cross-repo leakage: quorum must not embed tokens or private URLs for `aifirst`/`mma-files` in tracked files.
- Output: a short report (finding → file/commit → severity → remedy). If history holds a real secret, the remedy is rotate-then-rewrite (BFG/filter-repo) — **report it and stop; do not rewrite history yourself**. If clean, state explicitly: "No secret found in working tree or history; safe to publish." The OWNER flips visibility — never change repo visibility, billing, or plans yourself.

---

## 11. Groundwork for the homepage redesign (data only — do not restyle the site)

An approved design direction exists for a new homepage: a full-viewport "walk through the office" (sections Calendar · Meetings · Projects · Team · Results · Company) whose Meetings section is a Slack-like, **read-only** "BoardlessAI Workspace" viewer — 7 channels (one per meeting room), day dividers inside each channel (no sub-channels), message-by-message replay, a pinned "Decision" card, the collapsible article-JSON attachment, no composer, and one quiet system line for days a room did not meet. The visual design arrives separately from a design tool; your job now is only the data layer that makes it implementable:

- `site/src/lib/meeting-feed.ts` (+tests): transform meeting/standup records into a chat-feed model — per channel, per date: `messages[] {id, at, author{id, title}, kind: "system"|"message"|"decision"|"delivery", text, attachment?: {label, ref}}`. Text uses the post-Phase-1 plain-language fields; no raw refs/hashes anywhere except inside the delivery attachment ref.
- Fixed channel mapping (7 channels): `cu-edition → vydani-dneskai`; `morning|afternoon|night → ranni-porada` (one day may hold up to three blocks); `mma-intake|mma-analysis → kontrola-mma-dat`; `mag-editorial` + article-slot events `→ redakcni-porada-mma`; `mag-desk → vecerni-redakce`; `tt-marketing → titty-tuesdays-marketing`; `gv-brief → goviral-trend-room`.
- A no-meeting day emits exactly one `system` message carrying the recorded plain reason. A delivery message carries the package ref that powers the JSON disclosure (Phase 1 §10.6 archive).
- Keep the model language-neutral: store the recorded text as-is; the Czech-vs-English rendering decision belongs to the design implementation, not this layer.
- Export three representative days as standalone JSON fixtures into `docs/design/workspace-fixtures/` (one held meeting with a decision + delivery, one multi-block board day, one no-meeting day) so the owner can hand them straight to the designer.
- Rename the nav label "AI team" → "Team" (route unchanged; aligns with the approved design direction).

---

## 12. Acceptance — definition of done

1. Monday's calendar shows the GoVIRAL room held (or an honest stale-data/no-data sentence); Tuesday–Sunday show "This room meets on Mondays. Nothing was spent." — $0, one line, not clickable as a fake meeting.
2. With `APIFY_TOKEN` present, one live scout run stays under $1.40 estimated credit and writes a trends snapshot with per-actor sourceResults; with the token absent, everything still passes at $0.
3. A weekly brief exists in `/admin?venture=goviral&tab=plans` with rating widgets: trend calls with numbers, 5–10 content ideas with written hooks, one skip-note, a calendar skeleton.
4. GoVIRAL ideas land in the ideas tab; at least the mechanism for a `gv-brief → mag-desk` agenda handoff is wired and tested; the magazines' room packets carry the trends block, with trending framed as a tiebreaker only.
5. The free trend signals fetch, score, and degrade gracefully (a killed Reddit RSS produces absence, not failure) and appear in source-health reporting.
6. Eight vendored skills exist in both `.claude/skills/` and `.agents/skills/` byte-identically, each with UPSTREAM.md + MIT notice; the architecture test passes; none of the excluded skills is present.
7. `grep -ri incubator` across `orchestrator/src`, `site/src`, `config` returns only: historical enum values, the state archive, decision records, and docs. The site has no incubator page, tab, nav item, or calendar row; all tests green.
8. SCOUT is active with the trend-scout profile; roster count and `_shared.md` specialist sentence updated; no router crash on any room.
9. All repo gates green (quorum orchestrator + site; magazines untouched by this phase except doc references, unless §4.3 touched shared code — then their gates too).
10. Decision, org-change, INBOX, and NEEDED records exist per §8–9.
11. Actions diet holds: OwnDashboard reporters deleted in both repos; `social-publisher.yml` has no `schedule` trigger; `cycle.yml` carries exactly 3 backstop crons; a gated slot's run ends within ~1 billable minute (verify on a live gated run); CI path filters in all three repos as specified; a full day's runs bill ≤ ~100 minutes.
12. The §10.7 secrets-audit report exists with an explicit clean/not-clean verdict and, if not clean, the rotate-then-rewrite remedy list; repo visibility, billing, and plans are unchanged (owner's move).
13. `meeting-feed.ts` + tests + the three workspace fixtures in `docs/design/workspace-fixtures/` exist; the channel mapping matches §11 exactly; the nav label reads "Team".

Work order: §10 (Actions diet first — it stops the bleeding and includes the audit the owner is waiting for) → §7 (incubator out) → §2–3 (Apify + venture founding) → §4 (outputs) → §5 (free signals) → §6 (skills) → §11 (design groundwork) → §8–9 (records). §7 before §2–3 because its freed enum/ladder/clock space is reused by GoVIRAL, and its removal must not be entangled with new-feature commits.
