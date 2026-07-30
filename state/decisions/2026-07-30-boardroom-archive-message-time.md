# Boardroom archive and message-time decision

Date: 2026-07-30

Owner: Human-invoked engineer

Scope: Boardroom navigation and public message metadata

Business mode: Hobby / non-commercial

## Request

Make every boardroom easy to find by date and show a date and time on every
agent message.

## Decision

- Add a newest-first archive table near the top of `/boardroom`.
- Give each room a stable public ID derived from its date and phase.
- Show the opening date and Prague start time, outcome, selected-seat count,
  turn count and direct replay link in every row.
- Link the replay page back to the archive.
- Show one semantic `<time>` element on the active replay turn and on every
  full-transcript message.

## Timestamp provenance

The current offline fixture stores `openedAt` and `closedAt` for the room but
does not store a send timestamp on each turn. Do not label an invented wall
clock as live telemetry.

The public projection follows this order:

1. Use a valid turn-level `sentAt` when a future transcript supplies one.
2. Otherwise place fixture turns in order at deterministic intervals between
   the recorded room opening and closing timestamps.
3. Label fallback values `Fixture timeline` beside the date and time.

The first fixture message therefore uses the room opening time and the last
uses the closing time. Tests keep every intermediate value ordered and within
those bounds.

## Interaction and design boundaries

- Keep the existing page shell, palette, typography and table primitive.
- Sort rooms newest-first and keep each replay one direct link away.
- Use unambiguous month-name dates and the explicit `Europe/Prague` timezone.
- Keep the archive table keyboard-accessible with a caption and labeled links.
- Let the existing table wrapper scroll on narrow screens instead of breaking
  the viewport.
- Do not add analytics, a database, synthetic room activity or a dependency.
