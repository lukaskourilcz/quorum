# NEEDED — owner setup index

The complete, deduplicated checklist is [`NEEDS_YOUR_HELP_NOW.md`](NEEDS_YOUR_HELP_NOW.md).
Use that file as the source of truth; this one exists because older runbooks and admin links
still point at `NEEDED.md`, and it carries the reference tables and the record of what
changed.

## Repository variables — everything is inert until these are set

GitHub **repository variables** (Settings → Secrets and variables → Actions → Variables),
not secrets, read by `.github/workflows/cycle.yml`. A missing variable is not an error: the
run records a skip and costs $0, which is why a misconfigured repository looks healthy and
produces nothing. Since 2 August a skipped slot is written to `state/meetings/skips/` and
shown on the calendar as **Skipped** with its reason, so this no longer looks like silence.

| Variable | Set to | Unlocks |
| --- | --- | --- |
| `AUTONOMY_KILL_SWITCH` | anything except `true` | every scheduled cycle; `true` halts all |
| `PORTFOLIO_LIVE_ENABLED` | `true` | the global board and every venture room |
| `CAUGHT_UP_LIVE_ENABLED` | `true` | `cu-edition`, `morning`, `cu-product` |
| `MMA_FILES_LIVE_ENABLED` | `true` | `mag-editorial`, `mag-desk`, `article-am`, `article-pm`, MMA delivery |
| `FIGHTAIQ_LIVE_ENABLED` | `true` | FightAIQ intake |
| `FIGHTAIQ_ANALYSIS_ENABLED` | `true` | FightAIQ D8 analysis |

MMA Files needs **both** `PORTFOLIO_LIVE_ENABLED` and `MMA_FILES_LIVE_ENABLED`; either alone
still skips. Leave `SOCIAL_KILL_SWITCH` as it is — it beats every per-channel unlock.

Secrets for any model call: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Publishing additionally
needs `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`. All eight are set as of 2026-08-02.

## Diagnosing an empty day

| Symptom | Where to look |
| --- | --- |
| A calendar slot is **Skipped** | its tooltip names the gate; `state/meetings/skips/<date>-<phase>.json` |
| A calendar slot is **Did not happen** | no run reached it at all — check the Actions run for that hour |
| Delivery reverted a published article | Actions → **Delivery doctor**, about one minute, read-only |
| An article was written but not published | `state/ventures/mma-files/runs/<date>-<slot>.json` lists the gate violations |
| Caught Up produced no edition | `state/edition/runs/` — the newest file names the stage that stopped |

## Why the meetings did not run on 2 August

Fourteen crons fired and three meetings happened. Two separate causes, both now fixed:

- The meeting was resolved from the wall clock at the moment the job started, inside a grace
  window capped at twenty minutes, and GitHub queued the crons 13 to 54 minutes late. Seven
  runs found no slot and skipped; one ran the *neighbouring* meeting. The fired cron now
  names the meeting outright, so lateness no longer matters.
- `PORTFOLIO_LIVE_ENABLED` was set at 12:26 UTC that day, so the morning portfolio phases
  correctly skipped before it existed.

## Standing constraints

- Six phases need a due agenda, an agenda needs an open priority item, and the only
  automatic producer is the quarter-end protocol which does not run until 2026-10-31. Add
  one through `/admin` — see the checklist.
- The DISCOVERY gate reads `state/OPPORTUNITIES.json` and no task type may write it. That
  narrow write scope is a guard; seed the file by hand rather than widening the allowlist.
- Optional Pexels/Pixabay keys are not blockers. GNews, Guardian and NYTimes keys are not
  used. Carousel Studio needs no credential, account or separate deployment — only links.

Exact workflow order and proof locations are in [`MANUAL STEPS.md`](MANUAL%20STEPS.md).

## Recently finished

- **MMA Files publishes.** The first council-produced article is live in both languages and
  survived all nine release checks. Seven defects stood between the desk and that page: no
  subject when FightAIQ had no events, a blocked article that would not say why, 69 required
  fighter links on a two-fighter piece, a slot that refused retries, Czech name declension,
  the Czech thousands separator, and a GitHub App permission the installations had never
  accepted.
- **A queued cron still runs its own meeting.** Plus one entry per firing hour instead of the
  ambiguous `0 11,12`, and a cron that resolves to no meeting is final rather than falling
  back to the clock.
- **A skipped slot says why**, on the calendar and in `state/meetings/skips/`.
- **The record stopped misreporting itself.** The site published "$0.00 of $50" while the
  ledger held $1.18 against a $30 cap; a cycle that paid for calls and then failed discarded
  its own ledger; the calendar marked an article slot "missed" on the day it published.
- **Roster integrity.** The intake resolves the 92 listed fighters by name rather than
  crawling a category that truncates at 500, and the Wikipedia backfill no longer mints a
  card for every opponent it reads out of a record table.
- **Article prose is clean.** Grounding markers are checked by the gate and then stripped, so
  repository paths never reach a reader, and a hero photo is used only when its own metadata
  names the article's subject.
- **A failing delivery run costs about 9 minutes instead of 38**, and `Delivery doctor`
  answers the permission question in one.
