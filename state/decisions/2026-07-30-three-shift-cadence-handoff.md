# Three-shift cadence handoff

Date: 2026-07-30

Owner: Human

Status: Blocked on human-owned runtime files

Scope: Council cadence, shift phases and public countdown

## Owner request

Run one full-council standup every eight hours:

| Shift | Prague hours | Meeting |
|---|---:|---:|
| Morning | 06:00–14:00 | 06:00 |
| Afternoon | 14:00–22:00 | 14:00 |
| Night | 22:00–06:00 | 22:00 |

After the runtime schedule changes, the homepage must name the next shift,
show its hours and count down to its meeting.

## Why this session did not activate the shifts

The operational cadence lives outside the paths an interactive engineer may
edit. The current runtime also treats `am` and `pm` as different meeting
types: AM seats the full council, while PM seats only PULSE and AUDIT. Changing
the public counter alone would publish a schedule the agents do not follow.

## Human-owned changes required

1. Extend `orchestrator/src/types.ts` with `morning`, `afternoon` and `night`
   phases while preserving old phase values for existing records.
2. Update `orchestrator/src/index.ts` so the CLI accepts the three shift
   phases.
3. Update `orchestrator/src/cycle.ts` so every new shift seats VIZE, FORGE,
   PULSE, AUDIT and the required controls, with one shift-handoff objective.
4. Update `.github/workflows/cycle.yml` to run at `0 6`, `0 14` and `0 22`
   in `Europe/Prague`, and map each schedule to its matching phase.
5. Update the protected orchestrator and automation-policy tests for the
   three phases, full-council routing and three Prague schedules.
6. Run the full release gate and merge the runtime change.

## Follow-up site release

Once the runtime change reaches `main`, update the allowed homepage countdown
model with these slots:

- Morning shift: meeting 06:00, shift 06:00–14:00.
- Afternoon shift: meeting 14:00, shift 14:00–22:00.
- Night shift: meeting 22:00, shift 22:00–06:00.

Keep the existing live timer behavior, Prague daylight-saving handling, fixed
counter widths and `role="timer"` semantics. Add boundary tests at 06:00,
14:00 and 22:00 before publishing.

## Applied in this session

The footer no longer shows the working-title or fixture-marking notices.
