# GoVIRAL play library

A **play** is a marketing move that can be run again — a hook shape, a posting rhythm, a
distribution step. It is not a post, and it is not an idea. A play belongs here once it has run.

`library.json` is `goviral-play-library/1` (`contracts/goviral-play-library.schema.json`). It is
written by the owner. No room writes it: this repository cannot observe a marketing result — there
is no analytics integration, no follower count, no click figure — so a play recorded by an agent
would be a number nobody measured.

The library is read once a week, by GoVIRAL's brief. Its two highest-rated plays fill the brief's
**Key Lessons** section. An empty library costs that section a line saying it is empty, and nothing
else; it is not an error and it does not stop the room.

## Rating: RICE, with reach as a band

`score = (reach band × impact × confidence) ÷ effort in person-weeks`, rounded to one decimal.

**Reach** is the one departure from [Intercom's
RICE](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/). Intercom
counts people per period. Nothing here can: DNESKAi has readers it does not measure and WebDev
Signal's accounts do not exist yet, so a headcount typed into this file would be an invented number
wearing a unit. Reach is instead a band of *this venture's own* reachable audience per month, which
is what makes a play for a magazine comparable with a play for an account that has nobody in it.

| Band | Means |
| --- | --- |
| 1 | a handful — one thread, one reply, one person |
| 2 | a named few — a small list, a single community post |
| 3 | a tenth or less of the audience, one surface, once |
| 4 | roughly a fifth |
| 5 | roughly a third |
| 6 | about half |
| 7 | most of the audience, one surface |
| 8 | most of the audience, repeated across the month |
| 9 | effectively the whole audience |
| 10 | the whole audience and beyond it — the play is how new readers arrive |

`reach.basis` is `estimate` unless you have a reading to point at. `measured` requires at least one
`evidenceRefs` entry, and the contract refuses the record without one.

**Impact** is Intercom's ladder exactly: `3` massive, `2` high, `1` medium, `0.5` low, `0.25`
minimal. **Confidence** is Intercom's three steps and nothing between them: `1` (100%), `0.8` (80%),
`0.5` (50%). **A play with no benchmark may not exceed `0.5`** — without a number behind it the
rating is an opinion, and Intercom's scale already has a value for an opinion.

**Effort** is person-weeks, not Intercom's person-months. One person runs this portfolio and no
play here takes a month.

## What a stored play carries

- `benchmark` — what it beat: the metric, the unit, the baseline, what it achieved, the period it
  was measured over, which direction is better, and the ref the numbers came from. The contract
  refuses a benchmark whose `achieved` did not beat its `baseline` in the stated direction; a play
  that lost is a note, not a benchmark. `null` is allowed and honest.
- `screenshot` — a file under `screenshots/`, `png`, `jpg` or `webp`, with alt text, the date it
  was captured and whether it is `own-surface` or `owner-supplied`. It is `admin-only`: a capture
  of somebody else's surface is theirs, and the founding decision forbids republishing it. A play
  whose screenshot file is missing keeps its rating and the brief says the file is missing.
- `readTimeMinutes` — how long the play takes to read, printed beside the title.
- `category` — one of `hook`, `format`, `distribution`, `search`, `community`, `cadence`,
  `conversion`.

## Adding one

Edit `library.json`, move `updatedAt` forward, put the screenshot in `screenshots/`, and run
`pnpm vitest run orchestrator/tests/goviral-plays.test.ts` to check the file still parses. A play
that does not parse is dropped on its own and counted in the brief; the rest of the library
survives.
