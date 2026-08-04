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
| An article slot is **Skipped** | its tooltip carries the run's reason; `state/ventures/mma-files/runs/<date>-<slot>.json` |
| A calendar slot is **Did not happen** | no run reached it at all — check the Actions run for that hour |
| Delivery reverted a published article | Actions → **Delivery doctor**, about one minute, read-only |
| An article was written but not published | `state/ventures/mma-files/runs/<date>-<slot>.json` lists the gate violations |
| DNESKAi produced no edition | `state/edition/runs/` — the newest file names the stage that stopped |
| An article slot says `no_sourced_subject_on_file` | the editorial room wrote no slate *and* the desk's own fallback found no uncovered, source-backed subject; look in `state/mma/fighters/` and `state/mma/events/` |
| An article slot says `slate_derivation_failed` | the fallback threw reading the records; the run file's `detail` names what threw |

## Why the meetings did not run on 2 August

Fourteen crons fired and three meetings happened. Two separate causes, both now fixed:

- The meeting was resolved from the wall clock at the moment the job started, inside a grace
  window capped at twenty minutes, and GitHub queued the crons 13 to 54 minutes late. Seven
  runs found no slot and skipped; one ran the *neighbouring* meeting. The fired cron now
  names the meeting outright, so lateness no longer matters.
- `PORTFOLIO_LIVE_ENABLED` was set at 12:26 UTC that day, so the morning portfolio phases
  correctly skipped before it existed.

## Standing constraints

- The priority queue fills itself; you do not add items by hand. Every live 06:00 board gives
  each agenda venture one open item written from that venture's own `growth_objective` in
  `config/ventures.json`, expiring after a week. A venture that already has an open item is
  skipped, so a re-run adds nothing. `/admin` can still add one, but nothing waits for it.
- What actually rations the six agenda-gated phases is narrower: the 06:00 board commissions
  at most one specialist room a day and spends one priority item doing it, so every other open
  item that morning is recorded `why-not` with the reason. A room that does open can request a
  follow-up agenda for a different phase — that is how the 2 August editorial room queued the
  3 August intake. A phase with no due agenda records `PAUSED` at $0, which is the gate
  working.
- The opportunity gate reads `state/OPPORTUNITIES.json` and no task type may write it. That
  narrow write scope is a guard; seed the file by hand rather than widening the allowlist. The
  file is still fixture-only, so every shift scorecard records `INSUFFICIENT_EVIDENCE` with
  its reasons. This no longer gates the stage — the company left DISCOVERY for VALIDATION on
  1 August through the owner-only mechanism in `config/stages.json`.
- Optional Pexels/Pixabay keys are not blockers. GNews, Guardian and NYTimes keys are not
  used. Carousel Studio needs no credential, account or separate deployment — only links.

Exact workflow order and proof locations are in [`MANUAL STEPS.md`](MANUAL%20STEPS.md).

## Recently finished

- **A standup no longer files itself under the wrong day.** The shift record took its date
  from the UTC clock while every other record and the whole calendar use the Prague wall
  clock. Prague runs an hour or two ahead, so a night shift that GitHub queued past local
  midnight recorded the previous day: it overwrote that day's record of the same phase, and
  the calendar showed the real day's slot as missed.
- **The article desk no longer dies when the editorial room does not run.** The 09:00 room
  left no record and no slate on 3 August, and both article slots recorded
  `missing_editorial_slate` and published nothing. The desk's subject choice is deterministic
  and reads only files already on disk, so it now replays that choice itself and the run says
  the slate was derived. The slot the run is for takes the strongest subject, so a pm run no
  longer gets the runner-up on a day the am slot published nothing.
- **The priority queue fills itself** from each venture's declared `growth_objective`, so the
  agenda loop can start without a hand-added item. See *Standing constraints*.
- **Both magazines are Czech-only.** One writing call each instead of writing
  English and paying to translate it. The move ran in three steps because the
  delivery path fails closed and reverts: both sites learned to accept a
  Czech-only package while English was still being written, then the desks
  stopped writing English, then the English routes went. Nothing indexed broke —
  DNESKAi's Czech took over the URLs English held, and MMA Files was never
  indexed at all.
- **Caught Up is now DNESKAi** to readers. The venture id, the Actions
  variables, the repository name and the sealed package hashes are unchanged.
- **Three Czech gates were weaker than they read.** Six slop patterns could
  never match, because `\b` is an ASCII word boundary and cannot see the end of
  "upřímně". The MMA source marker was never resolved, so `[source:anything]`
  passed. And a package with no English half was recording an english-route
  pass, which would have made a bilingual-delivery KPI read 1 on a day nothing
  bilingual shipped.
- **MMA Files publishes.** The first council-produced article is live in Czech and survived
  all nine release checks. It shipped bilingual, before the Czech-only move above retired the
  English half. Seven defects stood between the desk and that page: no subject when FightAIQ
  had no events, a blocked article that would not say why, 69 required fighter links on a
  two-fighter piece, a slot that refused retries, Czech name declension, the Czech thousands
  separator, and a GitHub App permission the installations had never accepted.
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
- **The day's own account of itself is now true.** The digest reported $0.0693 against a
  $1.00 budget on a day the ledger held $0.6767, and called the slot that published the
  Shevchenko profile "not held"; both now read the ledger and the run files. Caught Up judges
  its draft before paying the Czech desk, so its two configured rewrites are affordable
  rather than refused instantly. A reverted release reaches the digest and the inbox.
- **The fighter-profile rescue no longer repeats a subject.** It was deterministic with no
  repeat check, so a killed slate would have published a second Shevchenko profile every day
  at the full envelope. Already-published fighters are excluded; when the eligible list runs
  out the slot stays killed.
