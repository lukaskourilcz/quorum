# One $30 monthly limit

Date: 2026-08-02

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `budget-2026-08e`

Supersedes: `budget-2026-08d`

Signature / explicit approval reference: owner direction in session 2026-08-02, confirming $25 model share and a $1.00 daily pace

## Owner direction to record

- Lower the all-in monthly limit from $50 to $30.
- Keep counting every model call, avatar, generated or composed image, paid source,
  service, subscription and other outside cost inside that one limit.
- Lower the model-API monthly share from $42 to $25, and its daily pace from $2.20 to
  $1.00.
- Keep about $5 for non-model costs within the same $30 limit.
- Apply this approval reference to every project in the portfolio.

## Why these numbers

Recorded costs, not forecasts. `state/budget/ledger.json` holds 16 entries totalling
$0.5162, and they price the work directly:

- A four-seat board meeting costs $0.0073. Individual council calls run $0.0009 to
  $0.0029.
- A clean Caught Up edition costs $0.050. An edition that exhausts its rewrites costs
  $0.196 to $0.200.

A day with the whole schedule live is one board meeting, one edition, two MMA Files
articles at about $0.16 each, and up to eight portfolio rooms against $0.05 to $0.08
envelopes. That is roughly $1.17 at the worst and $0.40 to $0.60 typically. The previous
$2.20 daily pace was about double the worst case, so it never bound on any real day.

$1.00 still clears a worst-case day, so a busy day is not cut off part-way, while the
$25 monthly share becomes the ceiling that actually binds. At a typical $0.50 per day
the portfolio lands near $15 per month, inside the share with room for a bad week.

## When the limit gets close

Unchanged from `budget-2026-08d`. At 80%, the daily summary must warn the owner and show
spend by project. At 100%, or after three straight days that exhaust the daily pace, all
further spend stops. The system opens one approval item showing the breakdown, the work
already reduced and the saving from each further option.

Only the owner can raise or redistribute the limit. The system cannot borrow from next
month, silently move money between categories or keep spending while it waits.

## What this decision does not change

The full scheduled clock stays unlocked. `budget-2026-08d` is what unlocks it, and the
runtime still reads `2026-08-04-budget-fifty.md` for that signal, so that record stays
in place and countersigned. This decision lowers what the unlocked schedule may spend;
it does not re-gate which phases run.

Email delivery of the daily summary is dropped in the same session. The digest is still
computed and written to `state/notify/digest/<date>.json`; it is read from the site
rather than sent.
