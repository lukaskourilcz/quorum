# Orchestration overhaul

Date: 2026-08-06

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `orchestration-2026-08f`

Supersedes: the meeting clause of `D11` only

Owner-directed batch, 2026-08-06. One audit of all four repositories produced every
decision below. The money ceilings from `budget-2026-08e` — $30 all-in a month, a $25
model share, a $1.00 daily pace — are untouched by all of it, as are every truth gate,
the social triple-lock, the treasury rules and the Czech single-call article design.

## Deliberation stays in English

This is settled, so it stops being reopened.

All deliberation together costs $0.08–0.15 a day. Czech deliberation would raise that:
about 25–35% more on output tokens, and 20–30% more on input if packets and prompts were
translated too — input is over 90% of seat tokens, with mma-intake reading 114,874 in
against 8,381 out. That is roughly $0.05–0.09 a day for no reader benefit, because
meeting output reaches the magazines as language-neutral data — subject refs, slates,
evidence ids — and the Czech a reader sees is written natively, once, per article.

Three further reasons. Seats run the cheapest models under a strict English JSON
contract, and Czech instruction-following on small models raises parse-failure waste,
which is paid for. The cost estimator is calibrated for English at 3.5 characters per
token; Czech runs nearer 2.5–3. And the public transcript site is the English corporate
site by locked brand decision. If Czech meeting pages are ever wanted, the path is
translating record-time template strings and the site dictionary — never Czech seats.

The one real reader-facing language gap is closed instead: the Czech "why this story"
note is now written by the Czech write call rather than rendered from an English
template, and article tags are pinned to Czech.

## Meetings

- The morning board may commission two rooms, at most one per project, instead of one
  room in total. Four rooms need an agenda every day and the board could supply one;
  thirteen of August's forty-four meeting records are $0 pauses reading "no bounded
  agenda was due". The AUDIT-plus-three vote gate still applies to the meeting, and the
  agenda queue's pending caps are unchanged.
- A question the board declined stays selectable. `why-not → selected` is now a legal
  transition; refusing it is what left the queue nine-tenths full of items that could be
  offered and never taken.
- Portfolio rooms are idempotent per Prague date. tt-marketing was billed six times in
  sixty-three minutes on 2026-08-05. A PAUSED record still does not block a later sitting.
- Every agenda names the decision its room must take, and the room's objective leads with
  it.
- mma-analysis waits for a model run to exist before it sits. Until the odds data key
  lands it records a $0 pause naming what it is waiting for.
- Every closed slot publishes one plain sentence and no machine text.

## Edition production

- The cu-edition record attributes turns only to stages that ran. SPARK and AUDIT leave
  the cast; it is a production pipeline, not a five-agent deliberation, and is labelled
  "Edition production" on the site.
- One same-day retry slot at 09:00 Prague. It is a $0 no-op when 05:00 published.
- Every terminal day ends with a delivered edition or a delivered plain-language
  explanation. A stale package in the outbox gets a terminal receipt instead of being
  skipped forever in silence.
- Per-run edition cap 0.35 → 0.50, inside unchanged daily and monthly ceilings, because
  source-body fetching made write and rewrite calls $0.10–0.12 and the promised second
  rewrite was no longer affordable. `EDITORIAL_REVIEW_BLOCKS_PUBLICATION` stays false
  permanently: truth gates still kill, style and freshness verdicts publish with their
  unresolved findings recorded.
- A single bare-domain homepage citation is repaired by dropping the link rather than
  discarding the whole billed call. Two or more unsupplied links, or any fabricated deep
  link, still kill it.

## One article a day

MMA Files moves to a single daily slot at 10:00. The pm slot has been killed every day
since launch. The slate keeps both am and pm structurally; pm is killed with the reason
"single-slot cadence". A fighter becomes eligible for coverage again six weeks after last
coverage, or immediately after a new bout, so a single slot cannot starve against a
92-fighter roster.

## Carousel Studio stops holding meetings

This supersedes the meeting clause of `D11` and nothing else in it. The studio room has
never held a live session and has produced no template proposal any consumer reads; the
production pipeline selects only the five code-generated deck styles. Everything of value
is deterministic code that renders at $0, and it keeps running. D11's core rule — no
model call and no image-provider call in the renderer — stays binding.

Decks are capped at 5–8 slides. Slide 1 carries the article's photo behind a Czech
clickbait headline in production, not only in preview, and the /admin style switcher is
binding on what ships.

## Magazine Incubator pauses

No owner goal needs new venture proposals now, the two rooms cost up to about $0.13 a day
when they convene, and nobody is acting on the proposals. Both meetings are removed and
the venture is paused. All incubator state and admin tabs are kept for revival.

## Roster

Three agents retire — SPLIT, EASEL, MOTIF — and seven pause: THREADS, INSTAGRAM, RADAR,
LENS, SCRIBE, SCOUT, FUNNEL. Thirty stay active, each with a real seat, a pipeline stage
or a genuinely pending function. Pausing is now safe: the boardroom router skips a
non-active required seat and records it, instead of throwing and taking the room down.
That slightly relaxes the "a required seat cannot vanish" guarantee, in exchange for a
roster that can be paused without crashing rooms. The org-change record for this is
`state/org/changes/2026-08-06-roster.md`.

## Titty Tuesdays

The marketing room reads its own idea index before proposing, so it stops re-proposing
one concept. Its focus rotates deterministically through the season's products, and the
chair files tomorrow's narrowed question. The weekday cast becomes Mon COHORT, Tue STUNT,
Wed COHORT, Thu SCENE, with PULSE, ANGLE and AUDIT daily; SPARK, PALATE, VAULT and FUNNEL
leave it. Nothing is delivered to the titty-tuesdays repository — the flow ends at
`/admin`, and it stays that way.

## What this does not touch

The $30 / $25 / $1.00 ceilings. Every truth gate: cited and supplied sources, source
diversity, signal strength, single-source share, primary sourcing, watchlist support,
prompt-injection leak checks, and the never-fabricate rules in both magazines. The social
triple-lock — nothing here enables posting. Treasury and payment rules: only the owner
pays and only the owner resolves a SPEND item. The Czech single-call article design; the
retired translate stage is not coming back. Append-only decisions. The agenda-gating
principle itself: a room with no reason to meet still costs $0. Supply was the problem,
never the gate.
