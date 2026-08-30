# One meeting a day, per venture and for the company

Date: 2026-08-29

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `operations-2026-08c`

Signature / explicit approval reference: Owner instruction, 2026-08-29 launch session (Claude Code)

Sources: GitHub #504 and its children #505–#509

## Decision

Each venture meets once a day, and the company meets once a day.

| Slot | Hour | Rooms it runs |
| --- | --- | --- |
| `cu-day` | 05:00 | `cu-edition`, `cu-product` |
| `mma-day` | 08:00 | `mma-intake`, `mag-editorial`, `article-am`, `mma-analysis`, `mag-desk` |
| `dm-day` | 15:00 | `dm-desk`, and `dm-growth` on Thursdays |
| `morning` | 06:00 | The company's one meeting: the live council, and the checkpoint the night used to run |

The `afternoon` and `night` shifts stop being scheduled. Every other venture already met once
and is unchanged.

## What the clock consolidates, and what it does not

The rooms do not merge. Each one still runs as itself, writes its own meeting record, reserves
its own budget, faces its own gates and is proved by its own tests. What changes is the number
of dispatches: `runVentureDay` drives a venture's rooms in order inside one slot.

That distinction is the whole design. A day's account is still the five or six records its rooms
wrote — the history, the scorecards and the replay rail stay true because the rooms' identities
survived. Only the calendar collapses.

Every retired phase stays individually runnable. `pnpm cycle -- --phase mag-desk` works, a replay
rebuilds one, and the suite exercises one. The schedule simply stops naming them.

## The company's three shifts, audited

The owner asked whether the night meeting was needed at all. The audit, room by room:

| Shift | What it uniquely did | Where it lives now |
| --- | --- | --- |
| Morning | The live council: priorities, the idea rotation, the operations packet, the seeded standing questions | Unchanged — this is the surviving meeting |
| Afternoon | Nothing of its own. `deterministicCheckpoint` was the whole of what distinguished it, and the night shared it | Nowhere to move; it was a duplicate of the night's posture |
| Night | The ecosystem operating truth, the content gate over what the day published, the operations snapshot, the implementation-program sync, the weekly and monthly reports and the retro behind them | The morning, through the `dayCheckpoint` flag |

So the morning keeps the council and takes the checkpoint. It also reconciles a day that has
actually finished: at 22:00 the political desk had been closed for an hour and the evening review
for two, but the day was still running. At 06:00 the day before it is complete.

Nothing was dropped. Every duty above has a destination in this table, and a manually dispatched
`night` still does exactly what it always did.

## Cost

No cap changes. `budget-2026-08f`'s `$50` all-in, `$25` model share and `$1.00` daily pace are
untouched in both directions, and no room's envelope moves. Two fewer council meetings a day is a
reduction in what the company can spend, not a reallocation: the afternoon and night shifts were
deterministic checkpoints that called no model, so the saving is in dispatches rather than
dollars.

Consolidation cannot raise spend either. A venture's rooms reserve exactly what they reserved
when they were dispatched separately, and a room that cannot afford to meet still stops at its
reservation for nothing and records why.

## What this does not authorize

- No change to what any room may write, cite, approve or publish.
- No change to any gate, cap, allowlist or approval.
- No deletion of a room, a prompt or a record. The retired phases stay runnable.
- No change to the Personal Growth desk, which is the owner's own and already met once.

## Reversal

Restore the retired slots to `config/ventures.json` and the calendar. The venture days can stay or
go independently of the council's shape; neither depends on the other.
