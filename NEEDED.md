# NEEDED — owner setup index

The complete, deduplicated checklist is [`NEEDS_YOUR_HELP_NOW.md`](NEEDS_YOUR_HELP_NOW.md).
Use that file as the source of truth; this one exists because older runbooks and admin links
still point at `NEEDED.md`, and it carries the reference tables and the record of what
changed.

## Repository variables — everything is inert until these are set

GitHub **repository variables** (Settings → Secrets and variables → Actions → Variables),
not secrets, read by `.github/workflows/cycle.yml`. A missing variable is not an error: the
run either records a skip or drops to a fixture-only dry pass, and costs $0 either way, which
is why a misconfigured repository looks healthy and produces nothing. Since 2 August a skipped
slot is written to `state/meetings/skips/` and shown on the calendar as **Skipped** with its
reason, so this no longer looks like silence. Which kind you get: `CAUGHT_UP_LIVE_ENABLED`
forces the dry pass; `PORTFOLIO_LIVE_ENABLED`, `MMA_FILES_LIVE_ENABLED`,
`FIGHTAIQ_LIVE_ENABLED` and `FIGHTAIQ_ANALYSIS_ENABLED` set `skip`. `AUTONOMY_KILL_SWITCH`
works the other way — it is a job-level `if`, so only setting it to `true` stops anything, and
GitHub skips the job before any record is written.

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
needs `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`. The six variables above and both model
keys were confirmed present on 2026-08-02. The two delivery App secrets were already working
before that: `state/edition/deliveries/2026-08-01.json` records a delivery on 1 August.

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

Fourteen crons fired that day, and at the point this was diagnosed three meetings had
happened. `state/meetings/` ends 2 August with six records — `cu-edition`, `mag-editorial`,
`mag-desk`, `mma-intake`, the afternoon council and the night council — and no morning
council. Two separate causes, both now fixed:

- The meeting was resolved from the wall clock at the moment the job started, inside a grace
  window capped at twenty minutes, and GitHub queued the crons 13 to 54 minutes late. Seven
  runs found no slot and skipped; one ran the *neighbouring* meeting. The fired cron now
  names the meeting outright — `cycle.yml` passes `github.event.schedule` to
  `src/meetings/clock-cli.ts --scheduled --cron`, so lateness no longer matters, and the
  eighteen cron entries are one per firing hour.
- `PORTFOLIO_LIVE_ENABLED` was set at 12:26 UTC that day, so the morning portfolio phases
  correctly skipped before it existed.

## Standing constraints

- The priority queue fills itself; you do not add items by hand. Every live 06:00 board gives
  each agenda venture one open item written from that venture's own `growth_objective` in
  `config/ventures.json`, expiring after a week. A venture that already holds a live item —
  open, selected, or declined and still selectable — is skipped, so a re-run adds nothing.
  `/admin` can still add one, but nothing waits for it.
- What rations the agenda-gated phases (`agendaRequiredPhases` in
  `config/meeting-policy.json`) is `maxRequestsPerMeeting` in that file: the 06:00 board may
  commission two rooms, at most one per project. An item it does not select is recorded
  `why-not` with the reason, and a `why-not` item goes back on the next morning's list — the
  board can pick up a question it declined earlier. A room that does open can request a
  follow-up agenda for a different phase; that is how the 2 August editorial room queued the
  3 August intake. A phase with no due agenda records `PAUSED` at $0, which is the gate
  working: `state/meetings/2026-08-03-tt-marketing.json` is exactly that, `PAUSED` at
  `actualCycleUsd: 0`.
- The opportunity gate reads `state/OPPORTUNITIES.json` and no task type may write it. That
  narrow write scope is a guard; seed the file by hand rather than widening the allowlist. The
  file is still fixture-only, so every shift scorecard that runs the gate records
  `INSUFFICIENT_EVIDENCE` with its reasons. This no longer gates the stage —
  `config/stages.json` reads `"current": "VALIDATION"` under `stageChangeAuthority:
  owner-only`. `state/BUSINESS.md` dates the entry 2026-08-01; the commit that flipped the
  file from DISCOVERY is dated 31 July, so the two records disagree by a day.
- Optional Pexels/Pixabay keys are not blockers. GNews, Guardian and NYTimes keys are not
  used. Carousel Studio needs no credential, account or separate deployment — only links.

Exact workflow order and proof locations are in [`MANUAL STEPS.md`](MANUAL%20STEPS.md).

## Next six, in the order that unblocks the most

A working queue to tick off one at a time. Each line names its full entry in
[`NEEDS_YOUR_HELP_NOW.md`](NEEDS_YOUR_HELP_NOW.md), which stays the source of truth —
if the two ever disagree, that file wins.

Nothing here is waiting on code. The magazines' daily datasets, the widgets, `/lekce`, the
banner slot, the `boardless-dataset/1` contract, the append verifier, the producer and the
delivery wiring are all on `main` and green.

- [ ] **Add `THE_ODDS_API_KEY` to Actions secrets** — the single unblock for every FightAIQ
  output. Without a price source the evening model check has nothing to calibrate a model
  estimate against, so it records no calibration and the readiness dossiers stay empty.
  Item 1 in the runbook. [imp:5] [owner:me] [time:10m] [kind:setup]
- [ ] **Create an Apify Free account and add `APIFY_TOKEN`** — the single unblock for
  GoVIRAL's trend scouting. Free plan only: its $5 of monthly platform credit is the budget
  guard, and Starter at $29/month would consume the entire $30 all-in cap on its own, so it
  needs a new approval rather than a click. Item 2. [imp:4] [owner:me] [time:10m] [kind:setup]
- [ ] **Set the `/admin` credentials in Vercel production** — several later items run through
  a door that will not currently open, including the idea ratings and the fixed-cost registry.
  Item 6. [imp:5] [owner:me] [time:10m] [kind:setup]
- [ ] **Fill in `state/ventures/goviral/profile.md`** — the writer half of the weekly brief:
  niches, voice, audiences, and what never to write about. Until it exists the room leans on
  the two magazine niches and says so plainly rather than inventing a voice. Item 3.
  [imp:4] [owner:me] [time:20m] [kind:content]
- [ ] **Rate the Titty Tuesdays idea cards in `/admin`** — nine sit unrated, so the taste loop
  that turns ratings into written style rules has never had an input. Item 5.
  [imp:4] [owner:me] [time:20m] [kind:decision]
- [ ] **Finish the Vercel half of the aifirst credential audit** — the retired
  `ANTHROPIC_API_KEY` Actions secret is deleted; old source, image, promotion, heartbeat and
  generation-report credentials in the aifirst Vercel project are still open, and keys pasted
  into chat still want rotating. Tracked in `aifirst/NEEDED.md`.
  [imp:4] [owner:me] [time:15m] [kind:setup]

## Owner action items

The shared marker format, for the things only the owner can supply. The full runbook is
still [`NEEDS_YOUR_HELP_NOW.md`](NEEDS_YOUR_HELP_NOW.md); these are the items the office
walkthrough and Carousel Studio are waiting on specifically.

- [ ] **Fire marketingShark's first live `ms-daily` run** — everything about the room is proved
  against a labelled fixture and CHUM has never actually written a word; the implementation
  session had no model key reachable from it. One manual `cycle.yml` dispatch with phase
  `ms-daily` costs about $0.05 and turns a proven pipeline into a working one.
  [imp:4] [owner:me] [time:5m] [kind:deploy]
- [x] **Approve or decline the devShark banner on DNESKAi** — approved 2026-08-07.
  `HUMAN_APPROVAL DEVSHARK-BANNER-001` is resolved. The payload is still staged and
  hashed under `state/ventures/marketingshark/banner/` with no receipt: the session
  that staged it cannot reach the delivery App credentials, so a later run delivers it
  within exactly the approved scope. [imp:3] [owner:me] [time:5m] [kind:decision]
- [ ] **Turn on "Automatically delete head branches" on `lukaskourilcz/quorum`** —
  Settings → General → Pull Requests. Sessions can push a branch but not delete one: the
  agent proxy answers a delete-ref push with HTTP 403, so the git-workflow rule about never
  leaving a stale branch behind is one no session can actually keep. The setting keeps it
  automatically, and the branches already merged can go from the branch list in the same
  visit. [imp:2] [owner:me] [time:2m] [kind:setup]
- [ ] **Public URLs for three projects** — FightAIQ, GoVIRAL and Titty Tuesdays have no
  public address, so their cards on the home page render nothing in the link slot rather
  than a "coming soon". Supply a URL each and the line appears. [imp:2] [owner:me] [time:10m] [kind:content]
- [ ] **Real office photography** — the six backdrops behind the seven home-page sections
  are AI-generated placeholders committed at `site/public/office/*.{avif,webp}`. The layout
  does not depend on them; replace the files at the same names and nothing else changes.
  [imp:2] [owner:me] [time:2h] [kind:content]
- [ ] **Portraits for the roles that have none** — 27 of 42 registered roles have an approved
  portrait. The rest fall back to an initials tile on the team panel and to the anonymous
  silhouette in the workspace player, which is honest but plain. [imp:1] [owner:me] [time:1h] [kind:content]
- [x] **The email in public commit history is accepted, decided 2026-08-07.**
  `kouril.lukas@gmail.com` is the author or committer address on 10 of 89 commits here, 50 of
  87 in `aifirst` and 29 of 57 in `mma-files`, and all three repositories are public. It is
  personal data rather than a credential, so nothing is at risk beyond the address itself, and
  the owner has accepted it. Do not propose rewriting history for this: on a public repository
  that means force-pushing three repos and breaking every commit link already published, which
  costs more than it fixes. Treat this as settled rather than re-raising it.
- [ ] **Confirm the wallboard's five figures are the ones you want on the wall** — the home
  page's TV shows published articles, publishing reliability, cost per article, spend against
  the $30 limit and ideas from meetings, all read from the record. Any figure the record
  cannot supply prints an em dash rather than a zero. [imp:2] [owner:me] [time:10m] [kind:decision]
- [ ] **Run the two Workflows-section sessions, in order** — give
  `docs/WORKFLOWS-CLAUDE-DESIGN-PROMPT.md` to a Claude Design session first (it writes
  `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`), then give `docs/WORKFLOWS-OPUS-BUILD-PROMPT.md` to an
  Opus session with that spec present. Both prompts carry the same decision block; neither
  needs this conversation. [imp:4] [owner:me] [time:15m] [kind:deploy]
- [ ] **Decide the two owner calls in the efficiency review** — whether the DNESKAi edition
  may arrive at 09:00 so the 05:00 rehearsal slot and the retry machinery go, and whether the
  three backstop sweeps shrink to one. Both in `docs/WORKFLOWS-EFFICIENCY-REVIEW.md`,
  findings 1 and 2. [imp:3] [owner:me] [time:15m] [kind:decision]
- [ ] **Sign or decline the six visual-loop approvals** — the Titty Tuesdays image pipeline
  in `docs/TITTY-TUESDAYS-VISUAL-LOOP.md` ends with six `HUMAN_APPROVAL` items (first image
  spend at a $2.00 monthly ceiling, the model role, public addressability of proposal bytes,
  the doctrine checklist, the batch shape, the contract). Nothing generates an image until
  all six are signed. [imp:3] [owner:me] [time:20m] [kind:decision]

## Recently finished

- **The Fable deliverables are written and on `main`.** Four documents under `docs/`: the
  Claude Design prompt and the Opus build prompt for the Workflows floor plan (one new
  home-page section, owner's top-down-plan direction, split so design and build cannot
  disagree), the efficiency review measured against the ledger, and the Titty Tuesdays
  visual-proposal loop design with its approval list.
- **Hook copy became one library with one brain.** The Carousel Studio now assigns every
  hook: gates evaluated against the item's own metadata, a channel cooldown of
  `max(2 × cooldownDays, 14)` days, no repeat of the previous post's archetype, and a seeded
  pick so a rebuild reaches the same slide 1 it reaches the same pixels. 49 hooks replace the
  16 that lived inline in `config/marketingshark.json` — that set had drifted far enough to
  still be shipping a fake timer, which the craft rules ban outright. `docs/hooks/` is the
  canonical knowledge base for hook and viral copy, `lint:hooks` runs in CI, and the news and
  MMA libraries are deliberately unwritten: those packs take a logged `no-hook`
  fallback and the template's own headline renders.

- **marketingShark was founded, and devShark came into the portfolio with it.** A seventh
  project, a thirteenth clock slot at 07:00, and two roles — MAKO directing, CHUM writing. One
  question a day out of devShark's own bank, drawn as a Czech and an English carousel and left
  as a draft. Everything except one model call per brand is deterministic and free.
- **A generated block stopped stating a cap nothing was enforcing.** The current-operating-truth
  table in `docs/ECOSYSTEM.md` printed `$50` all-in, `$42` model share and `$2.20` daily as a
  hardcoded literal — the figures of `budget-2026-08d`, superseded four days earlier while the
  runtime enforced `$30` / `$25` / `$1.00`. It reads the resolver now.
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
  its draft before paying for the expensive stage, so a first violation is no longer terminal.
  Compare the two run files: on 2 August both rewrites were refused at `durationMs: 0`, and on
  4 August the first rewrite made a full 90-second call and was judged on its merits — the
  quality gate failed it on `maximum_repeated_topic_frequency`, which is a verdict rather than
  a refusal. Only the second hit the $0.35 per-edition cap, and that day still ended
  `no_edition`. A reverted release reaches the digest and the inbox.
- **The fighter-profile rescue no longer repeats a subject.** It was deterministic with no
  repeat check, so a killed slate would have published a second Shevchenko profile every day
  at the full envelope. Already-published fighters are excluded; when the eligible list runs
  out the slot stays killed.
