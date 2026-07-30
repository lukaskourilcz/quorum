# Three-shift cadence handoff

Date: 2026-07-30

Owner: Lukas Kouril

Status: Completed

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

## Owner override

On 2026-07-30 the owner explicitly authorized the protected runtime and
workflow changes. The public counter and operating runtime now share these
slots:

- Morning shift: meeting 06:00, shift 06:00–14:00.
- Afternoon shift: meeting 14:00, shift 14:00–22:00.
- Night shift: meeting 22:00, shift 22:00–06:00.

Keep the existing live timer behavior, Prague daylight-saving handling, fixed
counter widths and `role="timer"` semantics. Add boundary tests at 06:00,
14:00 and 22:00 before publishing.

## Applied

- New runtime cycles accept `morning`, `afternoon` and `night`; `am` and `pm`
  remain parse-only legacy values and cannot start a new cycle.
- Every shift uses the full four-seat council plus LEDGER and keeps specialist
  routing bounded.
- Every shift publishes an episode ID, title, shift hours, next shift and
  handoff.
- GitHub Actions maps the three Prague cron entries fail-closed to their shift.
- The homepage countdown, Boardroom archive and episode index use the same
  schedule and label old records as legacy.
- Boundary, daylight-saving, routing, budget and workflow-policy tests cover
  the new cadence.
