# Workflows efficiency review

Written 2026-08-08 against `main`, from the mechanism described in
`docs/WORKFLOWS-FABLE-BRIEF.md` Parts 1 to 12 and from the ledger as committed.
Where this review measures, it measured; where it projects, it says so.

Three currencies matter here, and they rank differently than the brief implies.
The ledger holds $3.39 cumulative since 31 July, which projects to roughly $14 to
$15 a month against the $25 model share: half the room is spoken for, and one
path takes most of it. Runner wall-clock costs nothing in cash, because
`lukaskourilcz/quorum` is public and standard GitHub runners are free on public
repositories; the brief's "600 billable minutes" framing predates that check.
Complexity is the currency the system actually overspends: 1,937 lines of
`cycle.ts`, 1,720 of `portfolio/run.ts` and 1,567 of `cycle.yml` maintain a
business that moves about fifty cents a day.

Spend by phase, measured from `state/budget/ledger.json` on 2026-08-08:

| Phase | Entries | Spend |
| --- | ---: | ---: |
| `cu-edition` | 28 | $2.152 |
| `article-production` | 12 | $0.539 |
| `morning` | 28 | $0.188 |
| `mma-intake` | 24 | $0.158 |
| `mag-editorial` | 25 | $0.133 |
| `tt-marketing` | 28 | $0.102 |
| `mag-desk` | 7 | $0.043 |
| `incubator-scan` (retired) | 10 | $0.037 |
| `mma-analysis` | 6 | $0.020 |
| everything else | 16 | $0.017 |

The edition path is 63% of all spend. Every finding below names the gate, file
or constant it would move.

## 1. The 05:00 edition slot is a paid rehearsal for the 09:00 retry

Every delivered edition except 6 August needed the second run, and every second
run that ran succeeded. The first attempt loses to a source gate, a budget
reserve refusal or a transient provider failure, and the brief itself records
that all three pass an hour later. Source-gate failures cost $0, but a first
attempt that reaches curation before failing bills the HERALD call
(`CurationGateError` records the usage on purpose), and a transient provider
failure can bill partial work. Inside the biggest ledger line, the predictable
first failure is the biggest dollar lever this system has.

Move the slot, delete the retry:

- `config/ventures.json` line 25: `daily@05:00` becomes `daily@09:00`.
- `orchestrator/src/ventures/registry.ts`: remove `EDITION_RETRY_HOUR` and the
  retry's special-case dispatch.
- `site/vercel.json`: remove the two retry cron entries (28 becomes 26).

Two things to resolve before doing it. First, 09:00 already belongs to
`mag-editorial`; confirm `cycle.yml` handles two dispatches in one hour without
the concurrency group cancelling one (or land the edition at 09:00 and move
`mag-editorial` to 08:00, since FightAIQ's intake at 08:00 is finding 4's
candidate for thinning). Second, the magazine's edition would arrive at 09:00
rather than 05:00, which is a product decision the owner makes, not this review.
If the owner wants the 05:00 promise kept, the cheaper variant is to demote
05:00 to a $0 pre-flight that runs only the source and budget gates and records
what would have blocked, then produce at 09:00.

## 2. Three backstop sweeps duplicate a punctual path; keep one

The measured pattern stands: a Vercel dispatch lands on the hour and does the
work; a GitHub `schedule` firing lands 13 minutes to 3 hours 20 late and exits a
guard. Public-repo minutes make this free in cash, so the reason to cut is
coverage and simplicity, and the current design is weak on both. Each sweep can
only rescue a slot still inside its 6-hour window, and the three fixed times
(`55 3`, `55 11`, `55 19` UTC in `cycle.yml` lines 11 to 13) leave the 06:00,
07:00, 14:00 and 22:00 slots effectively uncovered already.

Better rescue, less machinery: append the sweep's "any unopened slot still in
window?" check as a $0 post-step of every punctual run. Thirteen checks a day
replace three, coverage tracks the schedule automatically, and `on.schedule`
shrinks to a single midday dead-man's entry (`55 11` UTC) for the day Vercel
itself fails. Delete the other two.

## 3. tt-marketing: 28 sittings, two plans on file

The money is noise ($0.102 total). The waste is output: the idea index exists
because four of the first seven ideas were near-duplicates, and a daily room for
a pre-commerce venture with no channel and an idle rating loop mostly restates
itself. The schedule module already knows which days carry a guest and which do
not (`WHEEL` in `orchestrator/src/titty-tuesdays/schedule.ts` seats nobody extra
Friday through Sunday).

Gate the room on new input, in `orchestrator/src/portfolio/run.ts` beside the
`isScoutDay()` precedent: sit when the day has a guest, when a season turnover
is due, when ratings have been filed since the last TASTE distillation, or when
a due agenda item names the venture. Other days record a stated $0 skip. That
converts roughly three sittings a week into skips and removes the pressure that
produced the duplicates.

## 4. mma-intake is a data-diff job wearing a meeting

24 sittings, $0.158, maintaining fighter cards whose sources change on fight-week
rhythm, not daily. The room already computes event proximity
(`fightWeekFocus()`). Add a deterministic staleness pre-check: hash the source
snapshots, open the paid room only when a card changed or a confirmed event sits
within ten days, and keep the full room on Tuesday and Friday when SONAR sits
anyway. Quiet days record the skip. Same file and pattern as finding 3.

## 5. The morning board: audit its output, not its price

$0.188 across 28 sittings is $0.007 each; the $0.20 envelope is thirty times
the observed cost, and cutting the room saves nothing measurable. The real
question from the brief stands: what does the morning board decide that a
deterministic priority queue (`priority-queue.schema.json` already exists)
could not? Answer it with a count, not an opinion: have PEOPLE's quarterly
review tally morning decisions that changed downstream state (a commission, a
reprioritisation, a stop) against mornings that restated standing priorities.
Two consecutive weeks without a state-changing decision is the trigger to move
`morning` to Monday and Thursday plus INBOX-triggered sittings. The afternoon
board already proves the $0 checkpoint pattern works (4 entries, $0.007 total).

## 6. mag-desk sits on days with nothing to review

Gate the 20:00 room on the day having produced something: an article published,
a non-empty social queue, or owner ratings filed today. Otherwise record the
skip. Seven entries so far suggest the room is already often idle; the gate
makes the idleness free and stated. Same gate site as findings 3 and 4.

## 7. SPARK's daily idea outruns its consumer

`morning-idea` and `idea-dedupe` cost a cent so far, but ideas accumulate with
no reader: the dedupe pass exists because the backlog already collided with
itself. Run SPARK weekly, or gate it on the unreviewed backlog being shorter
than a threshold VAULT can adjudicate. Pennies either way; the point is the
record staying meaningful.

## 8. mma-analysis billed six entries with its switch off

The room requires `FIGHTAIQ_ANALYSIS_ENABLED=true`, and the roster describes it
as gated. The ledger still carries six `mma-analysis` text calls ($0.020).
Either the switch was on for those days, or a paid step runs before the gate is
read. Verify the ordering in `orchestrator/src/portfolio/run.ts`: the D8 check
and the due-agenda check must precede every provider call. One reading of one
function; if the order is wrong, that is a real leak, small today only because
the room rarely fires.

## 9. Decisions that can become checks

Two specific ones, per the brief's question 14.1.5:

- **CANVAS's kill at 09:00.** The `article-pm` slot was retired because a
  deterministic fact (no second subject clearing the repeat rule) killed it
  daily. The same fact is computable for the morning slot: bouts on file for
  upcoming events, repeat-rule distance from recent articles, evidence
  coverage per candidate. Compute the eligible set for $0 before seating the
  room; an empty set skips the sitting and records why, and `mag-editorial`
  only pays when there is something to assign. A pure function beside
  `orchestrator/src/mma-files/live.ts`, called from the run gate.
- **Gate order generally.** Every room should run its $0 gates (agenda due,
  switch on, input changed) before assembling context or touching a provider.
  Context assembly is free until a call happens, so this is ordering hygiene;
  finding 8 is the test case for whether it already holds everywhere.

## 10. The empty summary store is a silent fallback proving why silent fallbacks fail

`state/ventures/carousel-studio/summaries/` is empty, both store functions are
wired, and nothing noticed until a scout read the directory. Backfill once from
`state/edition/archive/` (the exact bytes sent) with `buildCarouselSummary()`,
so the recorded set exists and future corrections cannot re-derive over it.
Keep the derived path in `site/src/lib/carousel-summaries.ts` for one release
as a belt, then retire it to a loud unavailable state. A permanent silent
fallback is how this gap went unnoticed; do not renew it.

## 11. MAKO's weekly review: wire it to volume, not to the calendar

marketingShark has drafted zero packages, so a weekly review today reviews
nothing for money. Trigger the review at ten accumulated packages since the
last one, or at fourteen days with at least one package, whichever comes first.
Do not fold it into `mag-desk`: wrong venture, and cross-venture context in one
room is what the routing skill exists to prevent.

## What looked like waste and is not

- The DST double-fire in `vercel.json`: the inactive variant returns
  `inactive-dst-variant` for $0, and the design survives both changeover days
  with no special case. Keep it.
- GoVIRAL's six no-op firings a week: a weekly cadence form would break eight
  consumers of the registry schema; six stated $0 skips are cheaper than that
  migration. Keep it.
- The incubator's ten ledger entries: history of a closed venture, not a cost.
- The 28-entry cron table itself: entries are free; the two retry rows are the
  only ones finding 1 removes.

## Order of operations

Findings 1 and 2 move real money and real machinery and each need an owner
decision (the edition's public hour; the single-sweep fallback). Findings 3, 4
and 6 are one shared gate pattern in `portfolio/run.ts` and can land together.
Finding 8 is an hour of verification and should happen first, because if the
gate order is wrong it changes how much findings 3 through 6 are worth.
Findings 10 and 11 are independent and small. Finding 5 waits for its count.
