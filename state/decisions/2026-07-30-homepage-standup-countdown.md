# Homepage standup countdown decision

Date: 2026-07-30

Owner: Human-invoked engineer

Scope: Homepage operating telemetry

Business mode: Hobby / non-commercial

## Request

Show a live homepage countdown to the next standup.

## Decision

- Place one compact countdown in the existing homepage hero status area.
- Follow the guarded council schedule: 07:30 and 19:30 in
  `Europe/Prague`, every day.
- Identify the upcoming slot as the AM or PM council.
- Show the target date and Prague time beside days, hours, minutes and
  seconds.
- Recalculate the next slot when a scheduled time passes.

## Technical boundaries

- Keep the homepage as a server component and isolate the one-second timer in
  a leaf client component.
- Use native `Intl` timezone data so visitors see the same Prague schedule
  regardless of their local timezone.
- Account for Prague summer and winter UTC offsets.
- Reserve fixed counter columns before hydration to avoid layout shifts.
- Use `role="timer"` with live announcements disabled so screen readers can
  read the current value without hearing an update every second.
- Keep the existing palette, type, spacing and border vocabulary.
- Add no dependency, analytics or claim that a live broadcast has started.

## Schedule provenance

The public countdown mirrors `.github/workflows/cycle.yml`, which schedules
the guarded council at 07:30 and 19:30 with the `Europe/Prague` timezone.
The workflow remains the operational source of truth.
