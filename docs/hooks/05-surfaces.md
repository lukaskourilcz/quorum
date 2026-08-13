# Surfaces — one engine, many libraries

The hook system is shared across BoardlessAI ventures. **The engine, the docs and the lint
are central. The hook strings are not.** A hook is only honest if its gates can evaluate
against the content it sits on, and different ventures have different content.

## Surface map

| Surface | Library | Content shape | Gate vocabulary |
|---|---|---|---|
| devShark/geoShark carousels | `quiz.hooks.json` (50 hooks) | slide 1 hook, slide 2 question, 3–4 reveal | options, difficulty, category, hasCode, canonical English opening |
| DNESKAi / Caught Up | `news.hooks.json` (12 hooks) | daily AI briefing item | source count, primary-source count, signal strength, topic, numbers present |
| MMA Files | `mma.hooks.json` (16 hooks) | sourced Czech magazine article | format, fighter count, event reference, source count |

Every library uses the same schema, the same craft rules (`02`), the same honesty
discipline, the same lint. Only `truthRequires` vocabulary and the strings differ.

## Why quiz hooks don't port to news or magazine content

A quiz hook's power comes from a gap the reader can close *in ten seconds by swiping*, and
its honesty comes from gates that describe a question. Neither holds elsewhere:

- No question means no options, no difficulty, no correct answer. `optionsAtLeast:4`,
  `difficultyAtLeast:N` and `categoryIn:X` cannot evaluate — a hook gated on them is
  dead, and a hook that makes those claims ungated is a lie.
- The payoff differs. In the quiz the payoff is *the answer*; in a briefing it's
  *understanding what happened*; in the magazine it's *the read*. Payoff-promise hooks
  must be rewritten around the actual payoff.
- The honesty bar is higher for news. A quiz hook that overpromises costs a swipe. A
  briefing hook that overpromises costs the reader's trust in the briefing, which is the
  entire product. See the news rules below.

## Writing a new surface library

1. **Enumerate the metadata the content actually carries.** Not what you wish it carried —
   what's in the JSON at render time. That list *is* your predicate vocabulary.
2. **Write predicates that license claims.** For each predicate, write down the sentence
   it makes true. If you can't, it's a filter, not a gate.
3. **Port the mechanisms, not the lines.** Work from `01-hook-psychology.md`. Information
   gap, IoED, precision, self-reference and payoff-promise all port. The *imagery* doesn't.
4. **Keep the always-pool honest.** Ungated hooks may only claim things true of every item
   on that surface.
5. **Meet the same shipping bar** (`02`): mechanism, tagged citation, prediction,
   `falsifiedIf`, cooldown rationale, gate justification. Run the lint.
6. **Size it by the pool arithmetic** (`03`): items/day × cooldown days.

## Predicate vocabularies — confirmed 2026-08-08

The sketches below were checked against the real schemas, and most of them did not survive.
This is what step one is for, and it is worth reading before writing a line: **seven of the
eleven proposed predicates read fields that do not exist.**

**DNESKAi / Caught Up (`news.hooks.json`)** — from `orchestrator/src/contracts/article-frontmatter.ts`

| Predicate | Reads |
|---|---|
| `always` | — |
| `sourceCount:N` | `sources.length` |
| `primarySources:N` | `sources` with `classification: "primary"` |
| `signalStrengthAtLeast:N` | `signal_strength` (0–100, the desk's own score) |
| `topicIn:X` | `tags` |
| `hasNumber` | a figure in the title or `what_changed` |

Dropped, and why: **`articleAgeHours`** — an edition is built for its own day, so there is no
per-item age to compare against. **`isFirstReport`** and **`followsPriorStory`** — nothing in the
frontmatter records either, and `followsPriorStory` would need a comparison against previous
editions rather than a field. The two the sketch missed are the two best ones: the desk already
scores every item, and it already marks which sources are primary.

**MMA Files (`mma.hooks.json`)** — from `orchestrator/src/contracts/mma-files.ts`

| Predicate | Reads |
|---|---|
| `always` | — |
| `formatIs:X` | `format` — one of `fight-week-preview`, `post-event-recap`, `fighter-profile`, `data-story`, `weigh-in-report`, `desk-notes` |
| `fighterCount:N` | `fighterRefs.length` — 1 is a profile, 2 is a matchup |
| `hasEvent` | `eventRef` is present |
| `sourceCount:N` | `sources.length` |

Dropped, and why: **`eventWithinDays`** — `eventRef` is an id with no date attached.
**`isTitleFight`**, **`fighterRanked`**, **`hasStatEdge`** — none is in the article package, and
reading them would mean resolving other records at pack-build time and trusting the join.
`hasStatEdge` is the one to be most careful about: it sits one careless line away from the
betting claim this surface may never make.

**`formatIs` replaces `resultKnown` and does the job better.** The tense trap this doc warns
about is already encoded in a field the desk fills: `fight-week-preview` and `post-event-recap`
are two of the six formats, so a preview hook and a recap hook are gated apart by something that
exists rather than something that would have to be inferred.

## Extra honesty rules for news and MMA

These sit **on top of** the rules in `02`, they don't replace them.

- **News: never tease what the item doesn't deliver.** The briefing's value is that it can
  be trusted at a glance. A hook that dramatises a minor item is a withdrawal from the only
  account the product has.
- **News: no false novelty.** "First", "breaking" and item-age claims are forbidden because the
  recorded item has no predicate that can license them.
- **News: attribute uncertainty.** If the underlying item is a rumour or single-sourced,
  the hook may not state it as fact. Gate on `sourceCount`.
- **MMA: no betting claims in hooks, ever.** FightAIQ's analysis may inform an article's
  content, but a hook must never imply a prediction, an edge or a recommended wager.
  Copy that sells certainty about a fight outcome is both dishonest and a regulatory
  problem in several markets.
- **MMA: real people.** Hooks reference fighters as competitors, never with invented
  quotes, invented motives or disparagement. Records and rankings must come from the data,
  not from the copy agent's memory.
- **MMA: the result-known tense trap.** A preview hook and a recap hook make opposite promises.
  Gate them apart with `formatIs:fight-week-preview` and `formatIs:post-event-recap`.

## Cross-surface measurement

STR is a quiz-app metric. Each surface needs its own primary metric and its own guardrails
before its hooks mean anything:

- Carousels: slide-1 → slide-2 advance rate; guardrail = completion to the reveal slide.
- News: item open rate; guardrails = time-on-item (catches teasing), next-day return.
- Magazine: article open rate; guardrails = scroll depth, next-day return.

Do not compare STR across surfaces. Compare each hook to its own surface's control.
