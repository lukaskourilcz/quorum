# Kvórum: the Czech politics venture — design

> **What actually shipped, 2026-08-13.** The complete fixture-only Kvórum system exists: registry
> and 21:00 schedule, TRIBUN/HACEK/AUDIT room, source registries and fixed-field monitor, receipts,
> clustering and ranking, recommendation and claims stores, deterministic editorial gates, owner
> approval/correction/result paths, bounded performance learning, GoVIRAL agenda exchange, and the
> Design Lab-only rendering route. The one-use build prompt was executed and deleted. The founding
> decision remains uncountersigned and no capacity-reallocation record frees the required `$0.08`;
> adding the `$0.10` room would take the worst payable day from `$0.98` to `$1.08` against the
> signed `$1.00` pace. Live source and model work therefore stops at `$0`. `APIFY-ACCOUNT-001`,
> `KV-APIFY-001`, `KV-SOURCES-002`, `KV-ACCOUNTS-003`, and `KV-EDITORIAL-004` remain pending, so no
> public identity, account, channel, external monitor or post is claimed. The actor price also
> changed during implementation: a capped run reserves `$0.151`, so the unchanged `$2.00` share
> funds at most thirteen reservations, not the daily `$1.80/month` plan below. Promise tracking,
> Sunday recaps, vote cards, broader monitoring and automated publishing remain unbuilt. Where the
> standing design below differs, `state/decisions/2026-08-12-kvorum-founding.md` and this block are
> authoritative.

The shape in one line: **Apify reads one competitor's day, free feeds corroborate it, code
clusters it, one model call picks 1–2 topics and drafts original takes with cited claims,
and the owner is the gate.** The marketingShark drafts-only pattern, pointed at Czech
politics, with GoVIRAL's Apify quota discipline and the magazines' evidence rules.

## 1. Product concept and positioning

A daily Czech political commentary brand for social platforms. It covers the same terrain
as Štít demokracie — the Babiš government, SPD and Motoristé in coalition, parliament,
the Castle, public media, disinformation, EU/NATO orientation — but from a deliberately
different posture.

What the research on Štít demokracie (August 2026) established: they are Facebook-native
(~122k likes, very high engagement velocity), personal-brand-driven (Petr Ludwig, Tony
Pášma, Roman Máca), emotionally mobilizing, news-reactive several times a day, and
institutionally thin. Their documented open flanks, named by otherwise sympathetic critics:
no methodology or transparency reporting, factual slips (their AI assistant failed basic
political facts), a moralizing register that talks *at* the other side's voters, no visual
system beyond emoji and screenshots, and a blind spot for cost-of-living substance.

Kvórum takes the opposite posture on every criticized axis and the same side of none:

- **Receipts over outrage.** Every post rests on named sources; claims are typed as
  multi-source fact, single-source report, or commentary — visibly. Štít mobilizes;
  Kvórum documents. When the record is damning, calm reads harder than a siren emoji.
- **The persuadable middle, not the convinced.** Register is plain Czech without academic
  or moral superiority — the exact critique Rychlíková and Deník Referendum land on Štít.
  Never "how can anyone believe this," always "here is what was said, here is the record."
- **Designed, not pasted.** The Design Lab gives this venture what no Czech political
  account has: a deterministic, recognizable card system. A Kvórum graphic should be
  identifiable at thumbnail size in a feed of screenshots.
- **Nonpartisan by hard rule, not by claim.** No voting recommendations, no party
  endorsements, no paid amplification — enforced by gates (§16), not by tone. Watchdog of
  whoever governs; the current government simply supplies the material.
- **Transparent about how it is made.** BoardlessAI's whole thesis is public AI
  governance; the venture discloses AI-assisted drafting with human editorial approval on
  every post, in the bio and in a pinned explainer. Against a scene where "AI content" is
  an accusation, owning it first is the only defensible position — and no competitor can
  copy it.

## 2. Name and branding direction

Recommended name: **Kvórum**. Venture id: `kvorum` (permanent even if the public name
changes — the `caught-up`/DNESKAi precedent).

Why this name: kvórum is the minimum presence that makes a decision valid — the exact
frame of the venture: is the government's action backed by the numbers, the mandate, the
record? It is a real Czech parliamentary word, so it sounds institutional rather than
activist, it is short, ownable, and free of collisions (searched: no Czech media or
political project uses it), and it does not sound like an AI product or a BoardlessAI
sub-brand. Against "Štít" (a shield, martial, defensive), "Kvórum" is procedural and cool —
the difference in one word.

Alternatives considered: **Stenograf** (the parliamentary record-keeper; receipts-first,
slightly archaic), **Mandát** (strong but claimed by common usage), **Zápis** (the
minutes; quiet, maybe too quiet). Name clearance is provisional until the owner runs the
BRAND.md checks (handles, trademark screen, confusion search — including distance from the
EU's "European Democracy Shield," which already muddies Štít's own name). Hard-conflict
policy applies: no auto-rename; alternatives plus a `HUMAN_APPROVAL`.

Voice: short declarative Czech, present tense, numbers and dates in every post, dry wit
allowed, sarcasm rationed, no emojis as argument. House register floor is HACEK's.
Visual identity direction: **the record and the highlighter** — paper-white and ink-black
editorial ground with a single marker-yellow accent used the way a highlighter marks a
stenographic record. No Czech party owns that palette (checked against ANO cyan, ODS blue,
SPD tricolor, Pirates black, STAN pink, TOP 09 magenta-purple, KDU yellow-gold is the
nearest — the build's brand flow verifies distance). A dedicated `kvorum` token set in the
Design Lab; BoardlessAI corporate tokens stay untouched and locked.

## 3. Target audience

Primary: Czech adults 25–55 who follow news but are exhausted by both the government's
communication style and the opposition scene's alarm register — the persuadable,
politically homeless middle that Štít's critics say nobody addresses. They want to know
what actually happened and why it matters, in ninety seconds, without being recruited.

Secondary: the already-engaged civic audience (Štít's own base — overlap is fine; the
formats differ enough to earn a second follow), journalists and analysts who reshare
well-sourced cards, and students. Platforms: Instagram and Facebook carry the Czech
mainstream; Threads is growing in the Czech liberal bubble; X is small in CZ (Štít has
898 followers there) but is where journalists live — worth presence, not investment.

## 4. Core workflows

1. **Daily monitor (deterministic, in the 21:00 firing, before the room).** The Apify
   Facebook Posts Scraper fetches Štít demokracie's public page posts from the last 24
   hours (no login, no cookies — public-data posture per the GoVIRAL legal precedent).
   Free allowlisted Czech feeds corroborate and widen: iROZHLAS, ČT24, Deník N, Seznam
   Zprávy RSS, the Chamber of Deputies (psp.cz) and government (vlada.cz) feeds — each
   verified before enablement, never guessed, `enabled:false` with a note otherwise (the
   caught-up-streams rule). A maintained entity lexicon (politicians, parties,
   institutions — config, owner-editable) tags every item; deterministic clustering groups
   items by entity-and-topic overlap into the day's candidate clusters. Receipt written
   to `state/ventures/kvorum/monitor/<date>.json`; raw scraped items purge at 30 days
   (GDPR posture), while clusters, attributions and everything a recommendation cites are
   kept.
2. **Daily desk (`kv-desk`, 21:00 Prague).** One TRIBUN call reads the clustered digest
   (untrusted-data wrapped) and returns 1–2 recommendation packages: what happened, why it
   matters, what Štít published about it (attributed summary + link — internal context,
   never republished), our angle and why it differs, platform and format mapping, drafted
   copy, and a typed claims table. Deterministic gates (§8) then accept or drop each
   package. Drafts land in the approval queue.
3. **Owner review → Design Lab → manual post.** Same loop as the sibling venture: approve
   (edit first if needed) → carousel/single-image renders in the studio with the `kvorum`
   tokens, thread/caption text is copy-ready → the owner posts by hand on the venture's
   accounts → records the post URL and later its numbers. While the social triple-lock
   stands, manual posting is the only path.
4. **Weekly rhythm (phase 2).** A Sunday recap format ("Týden v Kvóru" — the week counted:
   votes held, promises moved, numbers that changed) assembled mostly deterministically
   from the week's monitor receipts; and a promise-tracker ledger (§11) that turns
   one-day stories into long-running accountability threads.

## 5. Agent structure and responsibilities

One new agent:

- **TRIBUN** — the political desk editor. One call per day: clustered digest → topic
  selection + recommendation packages with typed claims. Cannot fetch (code monitors),
  cannot post, cannot make a factual claim without a digest ref, cannot recommend votes
  or endorse parties (gate-enforced), cannot cite Štít as evidence — their posts are
  topic discovery; evidence comes from the corroborating sources. Routes to
  `claude-sonnet-5`: the venture's single quality-critical call is native-register Czech
  political judgment, the CHUM precedent for paying the quality tier ~$0.05/day.

Reused seats: **AUDIT** vetoes (existing pattern), **HACEK** extends its Czech-register
floor to a third venture (`ventures: [caught-up, mma-files, kvorum]`) — its boundary
("cannot change uncertainty or intent") is exactly what political copy needs, **PALATE**
distils owner ratings (`taste: true`), **KEEPER**'s compliance lens applies through the
gates. No social production role; the publisher refuses the venture by name until a
future decision.

## 6. Meeting structure and recurring agendas

| Meeting | Hour | Cast | Envelope | Behaviour |
| --- | --- | --- | --- | --- |
| `kv-desk` | daily@21:00 | TRIBUN, HACEK, AUDIT | $0.10 | daily; a day with no cluster worth covering records an honest quiet day with the digest attached |

21:00 Prague is a vacated slot (the registry requires ≥60 minutes from every other slot,
including the 22:00 night board — 21:00 is exactly 60). The evening hour is deliberate:
the monitor has the full political day, the owner reviews at night or over morning coffee,
and posts land in the 07:30–09:00 attention window — commentary positioning, not breaking
news, which is the differentiation anyway. The desk may file at most one agenda onward
through the existing queue (a politics × AI story hands to DNESKAi's room; a trend
question hands to GoVIRAL). GoVIRAL's Monday brief feeds the desk in return. A weekly
retro seat inside the same slot (Sunday gate, recap assembly) is phase 2 and rides the
same envelope.

## 7. Data sources and integrations

- **Apify** — `apify/facebook-posts-scraper` (verified 2026-08: $2.00/1k posts, works on
  public pages without login), pinned by actor slug and build id the way
  `config/goviral-sources.json` pins its six. One page, one run per day, `maxResults` 30:
  worst case ~900 results/month ≈ **$1.80 of the $5 Free-plan credit**. The venture gets
  its own quota file (`state/kvorum/source-quota/apify.json`) with a **$2.00 monthly
  share cap** and per-run reservation, alongside GoVIRAL's (~$4.60 recipe) and FightAIQ's
  ($3.00 share) claims on the same credit. The three shares over-allocate the $5 on
  purpose — the platform credit is the hard stop and each guard degrades by dropping
  steps from the end — but the founding decision states the priority explicitly: the
  Kvórum daily fetch is a reader-facing promise and reserves first; GoVIRAL's weekly
  recipe absorbs the squeeze (its guard already produces a smaller brief rather than
  none). Instagram monitoring of Štít can reuse the already-pinned IG actors later within
  the same share; their X account (898 followers) is not worth monitoring, and X scraping
  stays rejected per `goviral-2026-08a`. **Never upgrade the Apify plan** — standing rule,
  restated.
- **Free feeds** — the corroboration layer, $0, through `safeFetch` with every host in
  `config/network-allowlist.json`: iROZHLAS RSS, ČT24 RSS, Deník N RSS, Seznam Zprávy
  RSS, psp.cz and vlada.cz feeds, Google News RSS `geo=CZ` on the entity lexicon.
  Registry file `config/kvorum-sources.json` in the caught-up-streams shape: exact
  hostnames, `enabled` flags, notes; a test fails if an enabled host is missing from the
  allowlist.
- **Entity lexicon** — `config/kvorum-entities.json`: ministers, party leaders, parties,
  institutions, standing topics (public media, Ukraine aid, Agrofert, the October 2026
  municipal/Senate elections), each with aliases for matching. Owner-editable; the desk
  proposes additions it cannot add itself.
- **Design Lab, budget ledger, GoVIRAL bridge** — as in the sibling venture, on the
  four-leg spine every venture carries (`docs/BOOKSOFHISTORY-VENTURE-DESIGN.md` §10):
  GoVIRAL scouts a `kvorum` topicSet, the desk reads the Monday brief into its cluster
  ranking, agendas flow both ways through the meeting-policy transitions, and the
  Design Lab is the only rendering path. No new cash anywhere: model spend ≈
  $2.20/month, Apify rides the free credit.

## 8. Content generation workflow

1. **Fetch** (Apify + feeds, reserve-before/record-after against the quota file; a failing
   source costs a section and a receipt line, never the run).
2. **Normalize + attribute.** Every item: source, URL, publishedAt, text, entities. Štít
   items additionally keep post URL and engagement counts (for salience ranking) but drop
   commenter data entirely; the row mapper keeps a fixed field set and a test asserts
   nothing else survives (the GoVIRAL mapper rule, adapted — the page's own identity is
   the point here, so the page handle stays; private individuals never enter state).
3. **Cluster** (deterministic entity/topic overlap). Rank clusters by: corroboration
   count, Štít engagement, entity weight, novelty against the last 14 days of
   recommendations, and standing-topic continuity.
4. **TRIBUN call** on the top clusters (untrusted-data wrapped; scraped text can never
   become instructions). Output per package: summary of what happened (with refs), why it
   matters in one paragraph, what Štít published (internal attribution block), **our
   angle and how it differs from theirs** (required field), platform/format mapping with
   reasons, drafted copy per format, claims table — each claim typed
   `fact-multi | fact-single | commentary` with digest refs.
5. **Gates ($0).** Schema; every `fact-*` claim resolves to refs (a `fact-multi` needs
   two independent domains; Štít posts are never a valid evidence ref — topic discovery
   only); trigram-overlap originality check between our copy and every Štít source text
   (threshold aligned with the social policy's 0.86 duplicate rule, and quotes must be
   exact, marked and attributed); banned-content rules — no voting recommendation, no
   party endorsement, no unattributed accusation of a crime, no claims about private
   individuals; HACEK-register lint; stop-slop lint. A failed package drops and is
   counted.
6. **Store** as `venture-recommendation/1` drafts (`evidence.kind: "monitor-cluster"`);
   admin renders them with the full context chain.

## 9. Admin experience

Workspace `/admin?venture=kvorum`, three tabs in the existing shell and patterns:

- **`recommendations`** — the daily cards. Each shows: the hook and drafted copy per
  format; *what happened* with the claims table (type badges, source links); *what Štít
  published* (their post text excerpt, link, engagement — clearly framed as internal
  context); *our angle* and the difference statement; platform/format chips; gate
  results; TRIBUN's why-this-is-worth-it line. Actions: approve → Design Lab + copy-ready;
  edit-then-approve; reject with reason. Post-hoc: record posted URL, then results.
  RatingWidget per card.
- **`monitor`** — the day's digest: clusters with their items, source health strip (which
  feeds answered, Apify quota bar: share used / credit month), entity heatmap for the
  week, and the purge clock on raw items. Read-only; source enablement is config, not a
  button.
- **`claims`** — the venture's running claims ledger: every published claim, its type,
  refs, and status (standing / corrected / retracted), with a one-click correction flow
  that drafts the correction post (corrections are content, not shame — differentiation
  in practice). Phase 2 adds the promise tracker here.

The venture tile answers the daily questions: last desk outcome, drafts waiting, what was
posted yesterday and its owner-entered numbers, quota state.

## 10. Design Lab integration

Identical mechanics to the sibling venture, one list: `kvorum` joins `BrandTokensSchema`
/ `CAROUSEL_BRANDS` (marker-yellow token set), `carousel-summary/1` gains venture
`kvorum` (locale stays `cs`), approval writes the recorded summary and the package appears
in the studio rail with all 23 families, 4 canvases, recipes, PNG/ZIP export. Quote cards
and stat cards are one-slide decks; threads/captions travel in the copy block. The card
system is the visual moat (§1) — no competitor renders deterministically.

## 11. Automation opportunities

Ranked: the **promise tracker** (a `kvorum-promise/1` ledger: promise, who, when, source,
status, next check date — turns news into recurring accountability formats and is the
venture's compounding asset); the Sunday recap assembled from monitor receipts (mostly
deterministic); vote-record cards from psp.cz open data (how each party voted, rendered as
a standard card — pure code once the feed adapter exists); entity pages ("everything we
have on X") from the lexicon + claims ledger; correction-bot discipline (auto-drafted
correction posts when a `fact-single` claim gets contradicted by a later multi-source
cluster); trend-aware timing via GoVIRAL; and — post-triple-lock — queued autopublish
through the existing publisher with a venture unlock counter (proposal: 20 consecutive
owner-approved-and-posted packages), plus FB/X channel adapters as their own decision
(`config/channels.json` is currently a two-channel registry by schema; extending it is a
recorded contract change, not a tweak).

## 12. Human approval requirements

`HUMAN_APPROVAL` items at founding:

1. **KV-APIFY-001** — extends the Apify scope (which today covers GoVIRAL and the MMA
   share, both pending/approved via `APIFY-ACCOUNT-001` / `APIFY-MMA-SOURCES-001`) to the
   Facebook Posts Scraper on the single page `facebook.com/stitdemokracie`, a $2.00/month
   venture share inside the Free plan's $5 credit, one run per day, 30-day raw purge,
   fixed-field row mapper. Explicitly restates: no plan upgrade, no login-based actors,
   no cookies, ever.
2. **KV-SOURCES-002** — the free-feed registry (`config/kvorum-sources.json`) and its
   allowlist additions, each host named.
3. **KV-ACCOUNTS-003** — creation of the venture's IG/FB/Threads/X accounts, handle
   choice, and the AI-disclosure bio line. Until resolved: drafts-only, admin says so.
4. **KV-EDITORIAL-004** — the editorial constitution (§16's hard rules) as a countersigned
   one-pager the gates implement: nonpartisanship, claim typing, correction policy,
   no-paid-amplification, election-period conduct.

Standing rules restated in the founding decision: no ads, no boosted posts (also keeps the
venture cleanly outside third-party campaign registration territory around the October
2026 elections), treasury untouched, ceilings untouched.

## 13. Metrics and KPIs

`growth_objective`: "Publish 1–2 sourced, original political recommendations a day and
build the receipts ledger" with components `package-cadence` (reused) and the new
`recommendation-approval` (approved ÷ drafted, from the queue records — the closed enum
extension is priced into the build alongside the sibling venture's `action-completion`).

KPI seeds: desk held or honestly quiet ≥ 95% of days; ≥ 8 approved packages/week after
week 2; approval rate trending up; 100% of published claims typed and referenced (a gate,
surfaced as a KPI so drift is visible); corrections published within 24h of a contradicted
claim (count, not rate — `null` is not `0`); Apify share ≤ $2.00/month; model spend ≤
$3/month. Follower and reach numbers are owner-entered context until measurement unlocks.

## 14. Feedback loops

Owner ratings → PALATE taste (what angles and formats the owner approves) → desk packet.
Owner-entered per-post results → format/topic weights (bounded, recorded proposals — the
sibling venture's mechanism, shared code). The claims ledger closes its own loop:
contradicted claims force corrections, and the correction record teaches the desk which
source patterns were unreliable. Approval-rate and quiet-day KPIs watch the loop itself.

## 15. Scaling strategy

Phase-gated: (1) drafts-only on the Štít-plus-feeds monitor, manual posting, prove
approval rate and daily rhythm before the October 2026 municipal/Senate elections — the
natural audience-building runway; (2) promise tracker + Sunday recap + vote-record cards
(the compounding, non-reactive formats no reactive account has); (3) widen monitoring
within the pinned-actor discipline (Štít's Instagram; possibly a second watched page —
each addition its own approval); (4) autopublish for text platforms behind the unlock
counter and triple-lock; (5) community formats (reader-submitted claims to check — with
KEEPER-shaped intake rules), a newsletter assembled from the week's cards, and, far out,
a public promises page — which would be a new outward surface and therefore its own
decision. Election weeks get a standing playbook: higher cluster bar, mandatory
multi-source on anything about a candidate, and the no-endorsement rule surfaced on every
card.

## 16. Risks and safeguards

- **Becoming a Štít copy** — the required our-angle-differs field, the trigram originality
  gate, Štít-is-never-evidence rule, and the structural fact that our formats (typed
  claims, trackers, designed cards) do not exist in their repertoire. If a day's only
  story is one they broke, the package must add corroboration and a distinct frame or it
  fails the gate.
- **Defamation / false claims** — claim typing with refs, two-domain rule for `fact-multi`,
  no crime accusations without on-record reporting, public-figure scope only, the
  correction flow, and the owner as final reader. Czech defamation risk concentrates in
  asserted false facts; typed commentary is protected opinion and labeled as such.
- **Election law** — no paid amplification and no vote recommendations keeps the venture
  outside registered-third-party campaign territory for October 2026; the editorial
  constitution pins it.
- **Platform risk** — organic political commentary is permitted on Meta; political *ads*
  are restricted and the venture runs none. The AI-disclosure line preempts
  authenticity-policy friction and is the honest posture anyway. Human editorial approval
  on every post keeps the EU AI Act transparency obligations satisfied on either reading
  of the public-interest-content clause.
- **Scraping posture** — public page, no login, no cookies (the Meta v. Bright Data
  posture recorded in `goviral-2026-08a`); raw purge at 30 days; nothing republished from
  the scrape; engagement numbers used for ranking, never displayed publicly.
- **Quota contention** — three shares over one $5 credit, priority stated, every guard
  degrades to smaller output rather than overspend, and the platform credit is the
  physical stop.
- **Tone drift into the outrage register** — the lint bans the alarm vocabulary list,
  PALATE learns the owner's line, and the constitution names the register as a rule, not
  a preference.

## 17. Technical architecture

`orchestrator/src/ventures/kvorum/` (the marketingShark runner shape): `run.ts`
(dispatched from `cycle.ts` for `kv-desk`; monitor pre-step inside the same firing),
`monitor.ts` (Apify + feeds fetch, normalize, attribute, purge), `cluster.ts`
(deterministic entity/topic clustering + ranking), `gates.ts` (claims, originality,
banned-content, register lint), `quota.ts` (the venture share over the shared Apify
credit, `mayRunApify`-shaped). Prompts: `orchestrator/prompts/kvorum/{tribun,craft}.md`
(craft distills the editorial constitution; runtime never loads skill files). Site:
`site/src/lib/admin-kvorum.ts`, `site/src/components/admin/kvorum-*.tsx`,
`POST /admin/api/kvorum/…` on the standard ladder. Studio: brand tokens + summary venture.
Config: `kvorum-sources.json`, `kvorum-entities.json`, allowlist additions, models role
`TRIBUN` (`claude-sonnet-5`, ~8000 in / 2500 out).

## 18. Database / data-model implications

Contracts (valid + poison fixtures each): `kvorum-monitor/1` (the day's receipt: sources
attempted, items kept with fixed fields, clusters, ranks, purge marks),
`venture-recommendation/1` (shared with the sibling venture; here `evidence.kind:
"monitor-cluster"` with claims table and the Štít attribution block),
`kvorum-claim/1` entries in the claims ledger (claim, type, refs, status, correctionRef),
`kvorum-promise/1` (phase 2). State: `state/ventures/kvorum/{monitor,recommendations,
claims,results}/…` + `performance-weights.json`; quota at
`state/kvorum/source-quota/apify.json`. The recommendation, result-entry and weights
shapes are shared code with the sibling venture — one contract, one queue surface, two
evidence kinds.

## 19. Background jobs and scheduling requirements

One slot: 21:00 Prague (free; exactly 60 minutes before the night board, which the
registry's spacing rule allows). Two DST cron entries in `site/vercel.json`; phase
`kv-desk` added to `types.ts` schemas, `meeting-record`'s enum, `cycle.yml` dispatch
choices and mode gates, `config/meeting-policy.json` (standing). Backstop sweeps cover a
missed slot. Degradation ladder position: `kv-desk` drops after `gv-brief` but before the
magazines' rooms — a daily audience promise outranks a weekly internal brief and never
outranks a reader-facing publication. Envelope arithmetic stays inside the $1.00 daily
pace with both new ventures counted, and `system-audit.test.ts` proves it.

## 20. Implementation phases

`KV-01…`-shaped tasks in the founding decision, one commit each: Phase A — contracts +
fixtures + registry + TRIBUN (agents/routing/controls/prompt/models) + phase plumbing,
dry room holds at $0. Phase B — monitor: sources registry, allowlist, fetch, mapper,
cluster, receipt, purge; runs on fixtures without a token. Phase C — the desk call +
gates + recommendation records. Phase D — admin tabs + Design Lab extension (shared with
the sibling build where it lands first). Phase E — claims ledger + owner results +
weights. Phase F — docs, NEEDED items, KPI seeds, e2e, founding checkboxes. Full gate
green before each phase commits.

---

## The venture-specific brief

**Monitoring architecture.** One scheduled Apify run per day inside the 21:00 firing —
not a poller, not a stream. The `boardless-stream/1` path is structurally closed to Apify
(`apify: z.literal(false)`) and stays untouched; this venture's monitor is its own module
with its own receipt contract, because a monitor digest (replaced daily, purged monthly)
is neither a dataset nor a reader-facing stream. Failure posture: Apify down → the feeds
still produce a thinner digest and the receipt says which section is missing; feeds down →
Štít-only digest with single-source flags everywhere; everything down → an honest quiet
record and no model call.

**Apify integration.** Pinned actor with build id, price evidence URL and terms verdict in
`config/kvorum-sources.json` (the goviral-sources shape); reserve-before/record-after
against the venture's own quota file; provider-reported monthly usage preferred over the
local estimate (the existing four-layer discipline in `sources/apify.ts` reused, not
reimplemented); `?maxTotalChargeUsd=` on every run. Verified 2026-08-12:
`apify/facebook-posts-scraper` at $2.00/1k results, public pages, no login. ~$1.80/month
at full cadence; $2.00 share cap.

**Deduplication.** Three layers: item-level — the sha1-of-canonical-URL id rule from the
streams contract, plus Facebook post ids; cluster-level — entity/topic overlap merges the
same story across sources; history-level — novelty scoring against 14 days of prior
recommendations, so a running story needs a development, not a rerun. The recommendation
carries `continuationOf` when it extends a prior package, which is how multi-day arcs
(the ČT/ČRo law, the October campaigns) stay coherent instead of repetitive.

**Topic clustering.** Deterministic and explainable: normalized entity sets (the lexicon
plus title tokens), Jaccard overlap threshold, and rank = corroboration × entity weight ×
engagement salience × novelty. A model does not cluster; the desk sees the clusters and
picks. That keeps the paid call small, the digest inspectable in admin, and a rebuild of
the day reproducible.

**Source attribution.** Internal: every recommendation records the full chain — Štít post
URL and excerpt, every corroborating item, timestamps. Public: sources named on the card
where a claim needs it ("iROZHLAS, 12. 8." in the footer slot of the template); Štít
credited publicly only when a post explicitly reacts to theirs, in which case the gate
requires the credit. Silent borrowing of their framing is what the originality gate
exists to catch.

**Originality safeguards.** The required "our angle differs" field (checked non-empty and
distinct from the source summary), trigram-overlap ceiling against every source text in
the cluster, exact-quote discipline (quotes must be substring-verified and attributed),
our own rendering for every visual (nothing of theirs is ever rescreenshotted), and the
Štít-is-never-evidence rule — which quietly guarantees every package stands on sources
that would survive Štít deleting the post that inspired it.

**Fact-checking workflow.** Claims are typed at drafting, verified structurally at the
gate (refs resolve, domains counted), reviewed by the owner with the sources one click
away, and tracked after publication in the claims ledger. A `fact-single` that matters is
allowed but wears its label on the card ("zatím jediný zdroj"); the ledger's correction
flow is the venture's public spine — the account that corrects itself fast is the account
that gets to say "receipts" about everyone else.

**Political-content quality controls.** The editorial constitution (KV-EDITORIAL-004), the
banned-content gate (no vote calls, no endorsements, no crime accusations without
on-record reporting, no private individuals, no mockery-of-voters register), HACEK's
register floor, the alarm-vocabulary lint, and AUDIT's veto seat. Every control is a
deterministic check or a recorded human judgment; none is a model asked politely.

**Not becoming a copy of Štít.** The posture difference is structural, not aspirational:
they mobilize the convinced with emotion at speed; Kvórum documents for the persuadable
with receipts at a daily cadence. Different formats (typed claims, trackers, designed
cards vs. talking-head video and screenshots), different register (procedural cool vs.
siren), different platforms of emphasis (designed IG/Threads cards vs. FB-native video),
different economics ($0 crowdfunding asks vs. their Herohero dependency), and a gate that
fails any package whose only content is what they already said.

---

## What this does not touch

The $50 / $25 / $1.00 ceilings. The social triple-lock: nothing posts, no channel, no
credentials, publisher refuses the venture by name. Treasury and payments. The magazines'
truth gates and delivery paths. GoVIRAL's pinned actors and its Monday recipe (the quota
priority note changes when its guard trims, not what it may do). The streams path's
`apify:false`. `METRICS_INGESTION_ENABLED=false` — owner-entered results only. The Design
Lab's determinism. BoardlessAI corporate brand. The mirrored skill directories.

## Open questions for the owner

1. Is "Kvórum" the name? (Handle check will decide quickly; alternatives are in §2.)
2. Which platform is the venture's primary bet — Instagram cards or Facebook (where the
   audience is but where new-page organic reach is weakest)? The design assumes IG-first
   with FB mirror.
3. Should Štít's Instagram join the monitor in phase 1 (within the $2 share) or wait?
4. The 21:00 desk means next-morning posting. If same-evening posting matters more, the
   slot moves to 12:00 (midday capture, afternoon posting) — one registry field, decided
   at founding, hard to move later without a decision.
