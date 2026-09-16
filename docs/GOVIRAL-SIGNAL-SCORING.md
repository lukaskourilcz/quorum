# GoVIRAL signal scoring

How a reading becomes a rated signal, one status word and an expiry date. Every number below
lives in `config/goviral-signal-scoring.json` and nowhere else; this document explains the
arithmetic, not the values.

Implemented in `orchestrator/src/sources/goviral-signal-score.ts` (pure functions, no I/O) and
`orchestrator/src/sources/goviral-signal-register.ts` (the one writer of
`state/goviral/signals/register.json`). Gated by `orchestrator/tests/goviral-signal-score.test.ts`.

## What it costs

Nothing. Scoring reads signals the run already collected — the keyless free readings and, when
there is one, the paid scout's hashtag counts — and calls no model, contacts no host and touches
no Apify credit. It sits outside the `budget-2026-08f` model share exactly like the dataset
appends. Every function takes `now` as an argument and none reads a clock, so the same week scores
the same way whenever it is re-run.

## The three components

A signal's score is a weighted mean of three readings, renormalized over whichever of them exist.

| Component | What it measures | Source |
| --- | --- | --- |
| `relative-growth` | The ratio against the same reading last week | A hashtag's own `weekOverWeekDelta`, or the register's stored `lastValue` for a keyless signal |
| `absolute-volume` | Log-scaled size, normalized inside one source kind | The measured value, never a rank |
| `source-breadth` | How many independent operators named the subject | The other readings in the same run |

Three rules from `goviral-2026-08a` shape the arithmetic rather than sitting beside it.

**A silent signal is never negative evidence.** A component nothing measured is `null`, not `0`,
and the score divides by the weight that was actually measured. A brand-new signal with no prior
week is scored on volume and breadth alone rather than carrying a zero it did not earn, and a
provider that was down cannot lower anybody's score. Breadth's denominator is the operators that
*answered* this run, not the operators configured, for the same reason; and when fewer than two
operators answered, breadth is unmeasured rather than full, because breadth across one source is
not a measurement of breadth.

**Rank-only data is rank.** `absolute-volume` returns `null` for any reading whose measurement is
`rank`. A Reddit position can corroborate that a source named the subject — that is breadth — and
nothing else.

**Provider results stay separate rather than merged.** Volume is normalized against a ceiling
belonging to its own source kind, because a search-traffic estimate, an article count and a
hashtag's post count are different units. Breadth counts operators instead of adding their
incomparable figures. And every component keeps its raw value, its weight and its contribution on
the scored signal, so the composite is always decomposable back into the readings it came from.

**Operators, not providers.** `independenceGroups` maps Google Trends and Google News to one
operator and Instagram and Threads to another, so neither pair can manufacture breadth by agreeing
with itself.

The score is clamped to 0–100. A declining signal floors at zero and its *status* says peaked: the
score is a rank, not a verdict, and the growth ratio survives on the component.

## The status word

Three words, in Exploding Topics' vocabulary, resolved in this order:

1. **Breakout** growth — a ratio at or above `statusThresholds.breakoutPercent` — is `exploding`.
2. A decline at or below `statusThresholds.peakedGrowth` is `peaked`, whatever the score says. A
   large falling trend still scores well on volume and breadth, and calling that exploding is the
   exact mistake the label exists to prevent.
3. A score at or above `statusThresholds.explodingScore` **with measured positive growth** is
   `exploding`. A high score with no growth reading is not: nothing measured it rising.
4. Everything else is `regular`.

Breakout is our arithmetic reaching Google's published threshold. It is not a field Google sent —
the `trends.google.com/trending/rss` feed this repository reads carries no such marker, and neither
does it carry Active/Lasted. Those labels are derived here from the configured half-lives.

## Windows, expiry and the storm rule

Each source kind carries a half-life (how long a reading is good for) and a ceiling (how long storm
re-triggers may keep one alive since it was first flagged).

| Source kind | Fed by | Band |
| --- | --- | --- |
| `search-spike` | Google Trends RSS | search spikes |
| `viral-post` | HN Algolia, subreddit rank | viral posts |
| `news-volume` | Google News RSS | cross-outlet press volume |
| `social-tag` | the paid scout's hashtag signals | social tags |
| `format-shift` | the scout's own format counts | format shifts |

`window` is `active` for anything measured in the current run and `lasted` for a register entry
nobody re-measured. `lastedHours` reports how long the subject has run, bucketed into
`lastedBucketsHours`.

`reconcileSignalRegister` has three outcomes:

- Measured and inside its window: keeps its first-flagged date, gets a fresh expiry.
- Measured but already past its window: **retired anyway**, unless it came back at least
  `stormRule.minimumMultiplier` times its previous score. Something that keeps reappearing weakly
  past its window is noise, and letting it live would make the window mean nothing.
- Not measured and past its stored expiry: retired as `lasted`.

A storm restarts the ceiling and never the first-flagged date: how long a subject has been running
and how long this surge may last are two different facts.

Every retirement carries its reason, including the one caused by the `registerCap` — an entry that
leaves because the register is full has not been judged uninteresting, and its line says so.

## The register

`state/goviral/signals/register.json` (`goviral-signal-register/1`) is the only place a
"first flagged on" date exists, and the only place a keyless signal's previous reading survives —
unlike the paid hashtag signals, the free readings carry no week-over-week delta of their own.

A first-flagged date is written once and never rewritten. A register that will not parse yields an
empty one: a loss of history, not a failed run.

It is written on every path through `refreshGoViralTrends` that produces a snapshot to rate —
including a stale week working from a carried-forward snapshot, which is where the free readings
accumulate their baseline while the paid scout is priced out. It is deliberately **not** written on
the branch where there is no usable snapshot at all: that branch writes no artifact by contract
(`orchestrator/tests/goviral-trends-gate.test.ts`), the room does not meet, and a week the room does
not meet is not a week worth flagging signals for.

`refreshGoViralTrends` runs on Mondays only (`isScoutDay` in `orchestrator/src/portfolio/run.ts`),
so "last week's reading" in the register means exactly that.

## Where it surfaces

- **The weekly brief.** Ratings are emitted as their own tactic lines — `Signal status:`,
  `Signal vetoed:`, `Signal retired:` — and the existing `Trend call:` text is untouched.
  BOOKSOFHISTORY, Tehdejší svět and Kvórum parse those calls with anchored regexes; appending a
  status word to one would not throw, it would silently return zero trend signals and cost those
  desks their GoVIRAL crossover.
- **AUDIT's fad veto.** The whole-room veto already dropped the plan to `draft`. What it could not
  do was name one call. A signal AUDIT names in its summary while voting veto is printed with its
  score and its reason instead of being scored into the calls — and it fires only on an actual veto
  vote, so the room's verdict stays the gate.
- **The admin workspace.** `site/src/lib/goviral-trends.ts` parses the rated signals defensively
  and the GoVIRAL panel renders status, score, breadth, first-flagged date and expiry. A snapshot
  written before scoring existed renders with no rated signals and no error.

## What is not built, and why

- **Seznam search statistics** need a Seznam/Sklik account and token that does not exist, with no
  free keyless endpoint and no host in `config/network-allowlist.json`.
- **Podcast Index trending** has env vars in `.env.example` but no key pair yet (`docs/NEEDED.md`).
- **TikTok sounds and hashtags** have no source in this repository. `config/goviral-sources.json`
  closed every social actor beyond Instagram and Threads on cost grounds, and its own note says
  re-opening one needs a decision record rather than a code change. The `social-tag` band is
  configured for it; nothing feeds it.
- **`goviral-intelligence-packet/1` is untouched.** Carrying `status`, `score` and `firstFlaggedOn`
  across a venture boundary would mean a `/2` and six edge updates in
  `config/venture-capabilities.json`. That is an owner and architecture decision, not an
  implementation choice.
