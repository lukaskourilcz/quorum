# GoVIRAL founding, and the end of the Magazine Incubator

Date: 2026-08-06

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `goviral-2026-08a`

Supersedes: the Magazine Incubator's founding decisions in full. Completes the pause
recorded at `orchestration-2026-08f` §8.5.

Owner-directed, 2026-08-06. Every ceiling from `budget-2026-08e` — $30 all-in a month, a
$25 model share, a $1.00 daily pace — is untouched. So are every truth gate, the social
triple-lock, the treasury rules and the Czech single-call article design.

## The Magazine Incubator is closed

It sat six times between 1 and 6 August and produced no proposal the owner acted on. The
direction is plain: **no new magazine is ideated again**. A future venture is founded the
way GoVIRAL is founded here — by a direct `config/ventures.json` entry the owner signs
off — not by a room that ideates one.

Deleted: `orchestrator/src/incubator/`, `ventures/founding.ts`, the niche-proposal and
venture-template contracts with their fixtures, `prompts/incubator.md`, the two routing
presets, the venture entry and its agent controls, three KPIs, the `/incubator` page and
its records module, the admin niche-proposals tab and its shortlist, the
`evidence-backed-proposals` growth signal, and the degradation-ladder rungs.

Retained on purpose: `incubator-scan` and `incubator-synthesis` stay in the meeting-record
and calendar contracts, because the eight committed records from 1–6 August still have to
parse and render. They are the only evidence the rooms ever sat, and deleting them would
make the archive lie about a week that happened.
`state/{ideas,ventures,taste}/incubator/` moved to `state/archive/incubator/` rather than
being deleted; git history is the real archive, and the move keeps live state honest about
what a live room reads.

`/incubator` redirects to `/ventures`. The URL was public and is not allowed to 404.

## GoVIRAL is founded

A fifth operating venture, and the first one that exists to make the others' publishing
better rather than to publish.

- Registry: `id: goviral`, `status: operating`, `taste: true`, ledger namespace `goviral`,
  admin tabs `plans` and `ideas`.
- One meeting, `gv-brief`, at **13:00 Prague** — the hour the retired studio room vacated.
  Cast: PULSE chairs, SCOUT reads the data, ANGLE places it against each venture's niche,
  AUDIT vetoes. Envelope `$0.06`.
- Its three jobs, in priority order: the owner's weekly content brief; marketing ideas and
  analysis for DNESKAi and MMA Files (and Titty Tuesdays when a trend genuinely touches
  it); and at most one trend worth handing to another desk as tomorrow's agenda.

### It meets on Mondays, and there is no weekly cadence

Decided, and not to be revisited by adding one. `daily@HH:00` is the registry's only
cadence form; a `weekly@` form would break the schema's `superRefine`, the founding hour
arithmetic, `parseCadenceHour` (which throws at module load), `cronPayloads`, the site's
cron slots and five pinned tests — about eight consumers for one field. The house pattern
for weekday behaviour is a deterministic gate in code, which is what the Titty Tuesdays
weekday wheel and the mma-intake weekday casts already are. So the Monday check lives in
`run.ts`, and the six off-day firings write a `$0` record reading "This room meets on
Mondays. Nothing was spent."

### It drops first under budget pressure

GoVIRAL takes the degradation-ladder rungs the incubator vacated, and takes them first on
purpose: it is the newest room, it meets once a week, and a missed Monday costs a brief.
Everything below it on that ladder is either a reader-facing promise or the company's own
decision room.

## Apify: Free plan only, and the plan is the guard

The data supply is Apify's Free plan and nothing else. Its **$5 monthly platform credit is
the budget guard** — actors stop when it is spent, no card is on file, and an overspend is
therefore not possible rather than merely unlikely. Starter is $29/mo, which alone would
consume the whole $30 all-in cap; **upgrading the plan requires a new owner approval and
may not be assumed by any code or document.**

Pinned actors, at their verified 2026-08-06 Free-plan prices:

| Actor | Price | Role |
| --- | --- | --- |
| `apify/instagram-search-scraper` | $1.50/1k | Popular Reels — the most direct scrapeable trending surface |
| `scrapesmith/instagram-hashtag-scraper` | $0.50/1k | hashtag pulse; 4× cheaper than the official actor, which returns recent rather than top |
| `themineworks/threads-scraper` | $1.00/1k | Threads top search and profile monitoring |
| `magicfingers/threads-scraper` | $0.60/1k | fallback only |
| `agentx/instagram-trending-scraper` | $0.01 + $0.0039/result | the live Explore feed with its section labels |
| `apify/instagram-scraper` | $2.70/1k | reserve for an owner-requested deep dive; never scheduled |

The weekly recipe costs about $1.03 and a month about $4.60 of the $5. A run reserves its
worst case ($1.40) before the first request; when the month runs hot the guard drops steps
from the end rather than refusing the scout, so a tight week produces a smaller brief
rather than none.

**Legal posture.** Meta v. Bright Data (N.D. Cal. 2024) held that Meta's terms do not bar
scraping public data without an account. None of the chosen actors takes a login or a
cookie, so the owner's future Instagram and Threads accounts are never involved and carry
no ban risk from scouting. GDPR: aggregate internally, purge raw items at thirty days,
never republish.

**Scraped content is untrusted data.** It enters a room only inside the existing
untrusted-data wrapping, is never handed to a magazine writer as an instruction, and no
post, handle or image is ever republished on any surface. The row mapper keeps a fixed set
of fields and drops the handle, the display name and the image URL — the three things that
would make republishing possible — and a test asserts none of them survives.

## Free trending signals, adopted

Keyless and free, so the magazines get a daily reading without touching GoVIRAL's credit,
and they work before the Apify account exists:

- **HN Algolia** — points and comments per hour. The HN front page is already a DNESKAi
  source; the counts and timestamp turn it into a speed.
- **Google Trends RSS**, `geo=CZ` and `geo=US`, weighted by `ht:approx_traffic`. The only
  free "the public is searching this now" reading, and `geo=CZ` is Czech-audience data
  none of the English sources carry.
- **Google News RSS** article counts per entity, EN and CS. Cross-outlet press volume.
- **Subreddit RSS**, rank only. Reddit's anonymous JSON has answered 403 since 2026-05-28;
  RSS still answers and has been flagged as the next thing to close, so it is built to
  degrade to absence rather than to error.

Three rules, each with a test: a silent signal is never negative evidence; rank-only data
is labelled rank and never engagement; and provider results stay separate rather than
merged, because one number cannot distinguish a quiet day from an outage.

## Rejected, and recorded so it stays decided

- **X/Twitter scraping, in any form.** Every usable actor needs the $29 Starter plan.
- **The Apify Google News rental actor.** $20/mo to wrap a feed that is free.
- **Apify Google Trends actors.** emastra rates 3.22 stars; resounding_diplomacy reports
  0% success. The free RSS covers the need.
- **pytrends and its forks.** Archived 2025-04, unmaintained.
- **Reddit's free OAuth tier as a dependency.** Non-commercial use only, which is ToS-grey
  for a publication that intends to earn.
- **`trudax/reddit-scraper-lite` as a Reddit fallback.** $3.40/1k would take most of the
  monthly credit. Documented as a future owner decision, deliberately not pre-built.

Google's official Trends API is application-gated alpha. The owner may apply; nothing
depends on it, and nothing may be built assuming it.

## What this costs

About **$0.05–0.06 of model spend a week** — one four-seat room, Mondays — and **$0 cash**.
Apify draws on its free credit and every other signal is keyless. The all-in trajectory
stays around $16/mo of the signed $30. Nothing enters `state/budget/ledger.json`, whose
schema is text and image calls only; Apify usage is tracked in
`state/goviral/source-quota/apify.json` and surfaced in each room record's `sourceResults`.

## One thing the work order asked for that is not built

`cu-product` was to be a `gv-brief` transition target. It is not, and this is a fact about
the code rather than a choice: the meeting-policy schema requires every transition target
to be an agenda phase, `cu-product` is a service phase, and `run.ts` is the only place a
due agenda is ever read — `cu-product` runs in `cycle.ts` and would never consume one. An
agenda filed for it would sit in the queue until its three-day TTL expired while
gv-brief's record claimed it had handed work onward. The other three targets — `gv-brief`,
`mag-desk` and `tt-marketing` — are wired and tested.

## What this does not touch

The $30 / $25 / $1.00 ceilings. Every truth gate in both magazines: cited and supplied
sources, source diversity, signal strength, single-source share, primary sourcing,
watchlist support, prompt-injection leak checks, and the never-fabricate rules. Trending
status is a **tiebreaker between equally sourced candidates and never a substitute for
sourcing**; a subject that fails the gates fails them whatever its velocity. The social
triple-lock — nothing here enables posting, and GoVIRAL cannot publish, schedule, buy or
open an account. Treasury and payment rules: only the owner pays and only the owner
resolves a SPEND item. The Czech single-call article design. Append-only decisions. Repo
visibility, billing and plans, which are the owner's to change.
