# Hold the idea rooms for the launch period

Date: 2026-08-29

Decider: owner countersignature pending

Status: pending countersignature

Decision id: `operations-2026-08b`

Signature / explicit approval reference: ____________________

Sources: the 2026-08-28 launch review, GitHub #462 and #469

## Decision

Two rooms stop meeting for the launch period:

| Room | Cadence | Envelope | What it does today |
| --- | --- | --- | --- |
| `cu-product` | daily 17:00 | `$0.08` | Records an `IDEA_VERDICT` on one DNESKAi idea |
| `tt-marketing` | daily 11:00 | `$0.08` | Writes Titty Tuesdays campaign ideas |

Each held slot records a `$0` skip naming this decision, in the same shape `kv-desk` already uses.
Nothing else changes: the ideas ledgers stay append-only and untouched, every existing card stays
readable, and both rooms resume on the end condition below without needing a new decision.

## Why

The owner's reason, recorded plainly: the ideas are not good enough to act on. Nine Titty Tuesdays
cards have sat unrated since they were written, and the taste loop that would turn ratings into
style rules has therefore never had an input. A room that produces work nobody uses is not free —
it costs its envelope every day and it fills the admin with things the owner has to skim past.

The launch has the opposite problem. DNESKAi and MMA Files publish daily, marketingShark runs a
live learning site, and BOOKSOFHISTORY, Tehdejší svět and Kvórum are built and waiting on
signatures. There is more finished work than there is attention to promote it. Generating more
ideas while that is true is the wrong end of the problem.

So this is a pause on invention, not on operation. Nothing that publishes stops.

## What is not held

- **GoVIRAL's Monday room keeps meeting.** The launch needs its trend signals, and five ventures
  read its weekly brief. What changes is presentation, not cadence: the admin surfaces the brief
  and stops surfacing the marketing-ideas section (#468).
- Every editorial and production room: `cu-edition`, `mag-editorial`, `mag-desk`, `ms-daily`,
  `bh-desk`, `ts-desk`, `kv-desk`, `pg-desk`, the article slots and the data checks.
- The board, the checkpoints and the night.

## End condition

The hold lifts when the launch set is publicly posting — that is, when at least DNESKAi and MMA
Files have live social profiles and a first posted carousel each — or on 2026-11-30, whichever
comes first. Reaching the end condition is not automatic: it is the moment to decide whether these
rooms resume, change shape or retire, and that is a decision rather than a timer.

A hold with no end condition is a deletion nobody admitted to, which is why this one has a date.

## Capacity

`tt-marketing`'s freed `$0.08` is claimed by `state/decisions/2026-08-12-kvorum-budget-capacity.md`.
The two records are one story and should be signed together: that one funds Kvórum's desk from
capacity this one releases.

`cu-product`'s `$0.08` is not reallocated. It returns to the model share unspent, which lowers the
worst-day total rather than moving it somewhere else.

No cap changes. `budget-2026-08f`'s `$50` all-in, `$25` model share and `$1.00` daily pace are
untouched in both directions.

## What this does not authorize

- No change to what any room may write, cite or approve.
- No edit, migration or truncation of `state/ideas/**`. The ledgers are append-only and stay so.
- No account, credential, channel or publishing authority.
- No change to the Titty Tuesdays venture itself, which stays registered, or to Season 001.

## Reversal

One line. Set the status back to pending and both rooms meet on their next scheduled slot; the skip
records stay as the account of what happened while the hold was in force.
