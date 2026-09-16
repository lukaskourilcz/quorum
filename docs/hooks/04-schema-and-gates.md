# Hook Schema, Gates & Tier B Build Specs

## Schema

```json
{
  "id": "kebab-case-id",
  "cooldownDays": 10,
  "truthRequires": ["difficultyAtLeast:3"],
  "variants": {
    "dev": { "en": "…", "cs": "…" },
    "geo": { "en": "…", "cs": "…" }
  }
}
```

- `truthRequires` is a conjunction: **every** predicate must hold for the hook to be
  eligible. The gates exist to *license claims* (see 02) — a hook may only assert what its
  gates guarantee.
- `{topic}` is the only render token in Tier A. Values are nominative; CS frames must be
  declension-safe (subject slot or after a colon).
- `cooldownDays` is authored intensity metadata. Social assignment enforces it per channel as
  `max(2 × cooldownDays, 14)`; exhaustion records `no-hook` rather than relaxing the rule.

### Research entry: `archetype` and `family`

Every hook has a parallel entry in `<surface>.research.json`. Its `archetype` names the
mechanism the line runs on (one of the thirty below); its optional `family` names which of the
ten cover-hook families the line belongs to — the coarse vocabulary a slide-one line is planned
and rotated in. `HOOK_FAMILIES` in `studio/src/hooks/schema.ts` is the enum and this table is the
mapping. Every archetype maps to exactly one family; a new archetype is placed here before its
first hook ships, so nothing is left unclassified.

| Family | Archetypes | Why |
|---|---|---|
| `curiosity` | `anticipation`, `open-loop`, `omission`, `partial-knowledge` | An open loop, a named unknown, an unresolved event or a gap the reader half-knows they have. |
| `contrarian` | `contrast`, `plain-speech` | A named opposition, or the desk set against the commentary and the timeline the reader already avoids. |
| `listicle` | `strategy` | A counted, stepwise move: kill three options, four branches and one merges. |
| `data` | `precision`, `scale`, `stat-gap` | A specific figure, a score the desk assigns, or an honest gate-derived number. |
| `story` | `resolution`, `orientation` | A settled past — what happened, one career from the record up. |
| `question` | `self-test`, `stakes-probe`, `explain-gap`, `look-here` | A wager, an intuition to commit, an "explain it", a direct challenge. |
| `problem` | `time-cost`, `consequence` | The price the reader pays for the alternative, or what real work relies on. |
| `promise` | `payoff-promise`, `filter`, `habit`, `reassurance`, `progress`, `durability` | A certain payoff: the fact without the noise, the cadence, the durable why, the practice that pays. |
| `negative` | `honesty`, `loss-frame`, `trap-exists` | A stated no — no tips, what is not known, what you lose, the trap in the lineup. |
| `authority` | `verifiable`, `identity`, `social-proof` | Standing: a checkable record, what seniors just know, written in Czech not translated, a third party's endorsement. |

## Tier A predicate semantics

| Predicate | Meaning | Licenses e.g. |
|---|---|---|
| `always` | no condition | payoff promises, {topic}, streak-concept lines |
| `optionsAtLeast:N` | question has ≥N options | "blind guessing tops out at 25 %" (N=4), lineup/elimination imagery |
| `optionsExactly:N` | question has exactly N options | counted imagery ("Four branches. One merges.") |
| `difficultyAtLeast:N` | difficulty ≥N (1–5 scale) | trap talk (N=2), half-knowledge (N=3), streak-ender talk (N=4) |
| `categoryIn:X` | question category is X (core, commonUse, interview) | "load-bearing", IoED everyday lines, "interview favorite" |
| `questionStartsWith:X` | question text starts with X | "this asks why" |
| `hasCode` | question contains a code snippet | "read the snippet" |

## Known bug classes (lint for these)

1. **Gate–variant mismatch / unreachable variants.** A gate can make one vertical's
   variant effectively dead: `hasCode` ⇒ the geo variant almost never renders. Rule: every
   variant of a gated hook must still be *honest if it ever fires* (the shipped geo line
   under `hasCode` is self-aware: "There's code on a geography card. Start there."), and a
   lint should flag variants whose gate makes them unreachable in their vertical.
2. **Language-blind predicates.** `questionStartsWith:"Why"` matches EN only — Czech
   questions start with "Proč". Current assumption: it evaluates the canonical EN text.
   Fix: make it language-aware (`{en: "Why", cs: "Proč"}`) or document the canonical-EN
   binding explicitly. Until fixed, treat `questionStartsWith` gates as supplementary
   (their questions must also be well served by the always pool).
3. **Tokens in declension-hostile slots** (CS). Lint: `{topic}` may only appear as
   sentence subject or after a colon in `cs` strings.
4. **Pool starvation.** Keep ≥5 hooks per relied-on gate; always-pool coverage ≥
   questions/day × cooldown for a typical daily user (see 03).
5. **Identical-pair budget.** Lint: ≤2 byte-identical dev/geo pairs per library.
6. **Char budget.** Lint: EN ≤58, CS ≤66, CS ≤ ~1.25× EN.

## Tier B — proposed predicates & tokens (build specs)

| Predicate / token | Spec |
|---|---|
| `statsReady` | true when the question has ≥300 recorded answers **per vertical**; computed from logged correct/incorrect events, rolled up nightly |
| `accuracyBelow:N` / `accuracyAtLeast:N` | per-question global accuracy vs N %, per vertical; both imply `statsReady` |
| `{missRate}` (token) | `round(100 − accuracy)` for the current vertical; only renderable under `statsReady` |
| `streakAtLeast:N` | reader's current streak ≥N; exposes `{streak}` token to the renderer |
| `missedTopicBefore` | this reader previously answered a question with the same topic incorrectly; requires a per-user topic-answer log |
| `timerEnabled` | an actual countdown is active on this card — the only honest license for time-pressure copy |

**Rollout priority** (value ÷ build cost):
1. `missedTopicBefore` → the *rematch* hook — highest expected lift in the system
   (self-relevance + unfinished business), smallest build (per-user topic log).
2. `statsReady` + accuracy predicates + `{missRate}` → precision-stat hooks; also unlocks
   the strongest carousel slide-1 line with real numbers.
3. `streakAtLeast` + `{streak}` → personal streak stakes/armor (cooldown 20 d, d4-gated).
4. `timerEnabled` → resurrects speed-run honestly.

## Stats honesty rules

- Accuracy is computed and displayed **per vertical**: "{missRate}% of devs…" must be dev
  players' data; geo copy says "players".
- Never render a stat below the sample threshold; never cache a stat across the nightly
  rollup boundary in copy that claims precision.
- Miss-rate before answering is difficulty signaling, not a spoiler (it points at no
  option) — allowed. Anything pointing at options is a spoiler — banned.
