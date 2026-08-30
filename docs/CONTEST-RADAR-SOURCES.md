# Contest Radar source audit

Audited 2026-08-30 by direct request from this repository. Every verdict below was produced by
fetching the URL named beside it on that date, not by reading the original brief. Where the brief
and reality disagree, reality wins and the disagreement is recorded.

Each source carries one of four verdicts:

| Verdict | Meaning |
| --- | --- |
| `keep` | Reachable, logged-out, structured or parseable, and permitted by its own robots policy. Eligible for the free scan path. |
| `optional` | Usable but costly, heavy or lower-value. Off by default; enabling it is a separate decision. |
| `held` | Real and wanted, but blocked on something the owner must supply — a credential, or a decision. |
| `rejected` | Not usable at all: dead, bot-walled, or behind a login the founding decision forbids. |

## What the audit changes about the brief

Four findings contradict the original plan and none of them is cosmetic.

1. **`vyhrat.sk/sutaze/` is a login wall.** The listing URL 302s to `/prihlasenie`. The founding
   decision permits public and logged-out sources only, so this one cannot be used at all — not
   with a scraper, and not with an owner account, because an owner account is exactly the
   credential that rule forbids for scraping.
2. **`challenge.gov` is gone**, as the brief suspected. `/api/` answers 404 from a bare Apache
   error page. Nothing replaces it here; the developer track relies on the platforms below.
3. **Devpost's public JSON endpoint works**, which settles the `automation-lab/devpost-scraper`
   question the brief raised: the actor would pay an Apify run to fetch a document anyone can
   fetch for nothing. Rejected as redundant.
4. **`chcemesoutezit.cz` exposes a WordPress REST API.** The brief only wondered whether a feed
   existed. `/wp-json/wp/v2/posts` returns structured JSON with real post ids and timestamps,
   which is a better source than any HTML parse and removes a parser this program would otherwise
   have had to maintain.

## Czech consumer contests

| Source | URL | Status | Shape | robots | Verdict |
| --- | --- | --- | --- | --- | --- |
| chcemesoutezit.cz | `https://www.chcemesoutezit.cz/wp-json/wp/v2/posts` | 200 | JSON (WordPress REST) | `Disallow: /wp-admin/` only | **keep** |
| souteze.cz | `https://www.souteze.cz/` | 200 | HTML, ~15 kB | `/hledat/` and `/api/` disallowed | **keep** |
| soutez.org | `https://www.soutez.org/` | 200 | HTML, ~74 kB | no restriction | **optional** |
| pr.denik.cz | `https://pr.denik.cz/probihajici-souteze/` | 200 | HTML, ~88 kB | search and login paths disallowed | **optional** |
| ceske-souteze.cz | `https://www.ceske-souteze.cz/` | 200 | HTML, ~27 kB, windows-1250 | no restriction | **optional** |

`chcemesoutezit.cz` also serves `/feed/` (RSS). The REST endpoint is preferred: it carries ids and
both local and GMT timestamps, so a candidate can be deduplicated and dated without parsing prose.

`souteze.cz` is `keep` rather than `optional` because it is small and its listing is the page
itself. The three `optional` sources are heavier HTML with no feed, so each costs a parser to
maintain; none should be enabled until the two `keep` sources prove insufficient.

`ceske-souteze.cz` is `windows-1250`, not UTF-8. Any adapter for it must decode by the declared
charset rather than assuming — a detail that silently mangles Czech diacritics otherwise.

## Slovak consumer contests

| Source | URL | Status | Shape | robots | Verdict |
| --- | --- | --- | --- | --- | --- |
| esutaze.sk | `https://www.esutaze.sk/feed/` | 200 | RSS, ~34 kB | `Disallow:` (empty — nothing barred) | **keep** |
| sutazime.sk | `https://www.sutazime.sk/feed/` | 200 | RSS, ~5 kB | named crawlers only; no `*` rule | **optional** |
| vyhrat.sk | `https://www.vyhrat.sk/sutaze/` | 302 → `/prihlasenie` | login page | — | **rejected** |

`sutazime.sk` is `optional` on a robots technicality worth stating: its `robots.txt` addresses
Googlebot, bingbot, DuckDuckBot, Slurp and YandexBot by name and never issues a `User-agent: *`
rule. Absence of a rule is not permission granted to an unnamed crawler, and its feed is the
smallest of the three at ~5 kB. Enabling it is a judgement the owner should make deliberately.

## Developer, hackathon and data challenges

| Source | URL | Status | Shape | Verdict |
| --- | --- | --- | --- | --- |
| Devpost | `https://devpost.com/api/hackathons` | 200 | JSON | **keep** |
| MLH | `https://mlh.io/seasons/2026/events` | 200 after redirect | HTML, ~368 kB | **optional** |
| HackerEarth | `https://www.hackerearth.com/challenges/` | 200 | HTML, ~143 kB | **optional** |
| DrivenData | `https://www.drivendata.org/competitions/` | 200 | HTML, ~290 kB | **optional** |
| AIcrowd | `https://www.aicrowd.com/challenges` | 200 | HTML, ~459 kB | **optional** |
| ETHGlobal | `https://ethglobal.com/events` | 200 | HTML, ~1.8 MB | **optional** |
| Kaggle | `https://www.kaggle.com/api/v1/competitions/list` | 401 | JSON error | **held** |
| DoraHacks | `https://dorahacks.io/hackathon` | 405 | HTML error | **rejected** |
| lablab.ai | `https://lablab.ai/event` | 403 | Cloudflare interstitial | **rejected** |
| Challenge.gov | `https://challenge.gov/api/` | 404 | Apache error page | **rejected** |

Devpost is the only structured source on this track and the only one worth enabling first. It
returns a clean `hackathons` array with ids, titles, locations and open state.

**MLH has moved.** `mlh.io` redirects to `www.mlh.com`. Any registry entry must name the effective
host, or the allowlist will describe a domain the fetch does not use.

**Kaggle needs an owner credential.** The founding decision permits exactly this case — "an
owner-provided read credential for a documented official API such as Kaggle" — so it is `held`
rather than `rejected`, waiting on the owner rather than on code.

**DoraHacks answers 405** to a plain GET, and **lablab.ai serves a Cloudflare challenge**. Both are
refusals by the site. Working around either would mean imitating a browser to defeat a bot check,
which this program does not do.

The four heavy `optional` platforms are all large HTML pages built by client-side frameworks. Each
needs its own parser and each will break on a redesign. None should be enabled until the free
structured path — Devpost plus the two consumer `keep` sources — proves too narrow.

## Discovery-only inputs

| Input | Posture | Verdict |
| --- | --- | --- |
| Owner-created Google Alerts RSS | Owner supplies the feed URL; nothing is registered here | **held** |
| Public Reddit RSS | No OAuth; narrow subreddits only | **optional** |
| Recorded GoVIRAL scout evidence | Read-only, already collected, zero incremental cost | **keep** |
| Owner manual import | Owner pastes a URL or a record | **keep** |

Discovery-only means what it says: an item from any of these may open an investigation and may
never establish a fact. A contest reached this way still has to be confirmed against its own rules
page before it becomes a record.

GoVIRAL is `keep` because it costs nothing incremental — it reads evidence that venture already
collected. Contest Radar schedules no Instagram or TikTok collection of its own, and adding any
would duplicate a boundary GoVIRAL owns.

## Apify candidates

Apify's pricing page was reachable (200) on the audit date. The account is on the Free plan with a
$5 monthly credit, which the whole portfolio shares; nothing below gets an allowance of its own.

| Actor | Purpose | Verdict |
| --- | --- | --- |
| `apify/google-search-scraper` | Monthly source-discovery sweep | **optional** |
| `apify/website-content-crawler` | Fallback for a proven direct-fetch gap | **optional** |
| `apify/beautifulsoup-scraper` | Same gap, cheaper shape | **optional** |
| `automation-lab/devpost-scraper` | Devpost listings | **rejected — redundant** |
| Unstop scraper | Extra dev-challenge coverage | **rejected — not needed** |
| 99designs and similar contest actors | Consumer design contests | **rejected — cost and confidence** |
| Any social actor | Instagram/TikTok discovery | **rejected — GoVIRAL owns this** |

`automation-lab/devpost-scraper` is rejected on evidence rather than on principle: Devpost's own
JSON endpoint answered 200 during this audit, so the actor would spend credit to fetch a public
document. That is the exact question #385 asked and this is the answer.

The two `optional` fallbacks exist for a gap that has not been proven yet. A direct fetch that
fails once is not a proven gap; enabling either is a decision the owner takes after the free path
has demonstrably fallen short.

## What this audit does not establish

- **Terms of service.** Reachability and robots posture are not the same as permission. Each
  `keep` source's terms are the owner's to accept before a scheduled fetch begins.
- **Stability.** One 200 on one day is not a reliability record. Every enabled source needs its
  own health tracking and a re-verification date.
- **Listing quality.** This audit confirms that the pages and endpoints respond and what shape
  they return. Whether their contests are worth the owner's time is what the ranking work decides,
  on evidence this audit cannot supply.
