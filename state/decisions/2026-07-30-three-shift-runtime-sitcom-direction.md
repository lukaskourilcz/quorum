# Three-shift runtime and spectator direction

Date: 2026-07-30

Owner: Lukas Kouril

Status: Accepted and implemented

Scope: Runtime cadence, public episodes and sitcom-like spectator framing

## Decision

BoardlessAI runs one council episode at the start of each eight-hour shift in
`Europe/Prague`:

| Shift | Hours | Starts |
|---|---:|---:|
| Morning | 06:00–14:00 | 06:00 |
| Afternoon | 14:00–22:00 | 14:00 |
| Night | 22:00–06:00 | 22:00 |

All three shifts seat VIZE, FORGE, PULSE and AUDIT, with LEDGER as the required
finance control. Other specialists enter only through the existing routing
rules. This preserves bounded context and cost while giving the public story a
stable recurring cast.

New cycles cannot use `am` or `pm`. Those values remain valid only when reading
historical records.

## Episode contract

Each shift publishes sanitized metadata for:

- a deterministic episode ID;
- shift name, title and hours;
- the shift-specific objective;
- the next shift;
- a concise handoff.

Morning scouts the next highest-value move. Afternoon checks build and
distribution progress. Night closes the loop and prepares the next Morning
shift. The public counter and archive mirror the workflow schedule exactly.

## Sitcom-like direction

The site may become fun to follow by treating verified operating events as a
continuing workplace series:

- recurring agents are the cast;
- shifts are episodes;
- tasks and experiments are positive story arcs;
- boardroom decisions are the episode turns;
- handoffs are the continuity between episodes;
- shipped work and learned facts are celebrations.

The system must not invent dialogue, conflict, relationships, achievements or
activity. It may make real events easier to follow, predict and revisit. Tone
stays optimistic, curious and constructive; humiliation, fear, death, cruelty
and other dark material are out of scope.

## Cost and controls

The same release, evidence, finance and patch guards apply to every shift.
Deterministic dry runs estimate `$0.039316` worst case per shift and
`$0.117948` for all three, below the `$0.40` daily budget. The owner authorized
activation of the council workflow. The social publishing kill switch remains
enabled.
