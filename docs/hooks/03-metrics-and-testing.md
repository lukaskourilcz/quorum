# Hook Metrics, Cooldowns & Testing

## Metrics by active surface

- Quiz carousels: slide-1 → slide-2 advance; guardrail = completion to the reveal slide.
- News: item open rate; guardrails = time-on-item and next-day return.
- MMA: article open rate; guardrails = scroll depth and next-day return.

A hook that lifts its surface's primary metric while denting a guardrail is a **net-negative
hook**. The guardrails
are not tie-breakers; they're veto players.

## Falsifiability lifecycle

Every hook ships with a prediction + `falsifiedIf`. Lifecycle:
1. **Ship** with cooldown and gate.
2. **Watch** — no directional reads before ~2,000 impressions per hook per surface slice.
3. **Judge** — kill rules below.
4. **Log** — write the outcome into the surface's research JSON (tag → `[measured]`) and into the
   Results log at the bottom of this file.

**Kill rules** (vs matched control):
- Completion −2pp → stop/cut (over-promising).
- Next-day return −1pp → stop/cut (habit damage).
- Primary metric ≤ control after full sample → retire or rewrite.

## Cooldowns & wear-out

Repeated messages decay; humor, personification and loss-frames decay fastest
(Pechmann & Stewart 1988 [recalled]). Assignment heuristics:

| Hook type | Cooldown |
|---|---|
| Neutral utility / reassurance ("guess first", payoff promises) | 6–8 d |
| Standard curiosity-gap lines | 10 d |
| Jokes, personification ("written with love", "follows you to lunch") | 12–14 d |
| Loss-frames, streak lines, precision stats | 12–20 d |

Monitor the surface metric by nth channel exposure. Visible decay → lengthen cooldown or
retire. The active selector enforces a per-channel cooldown of
`max(2 × cooldownDays, 14)` and rejects the previous post's archetype.

## Pool arithmetic and fallback

- Servable pool per pack = always-pool + all hooks whose gates the item satisfies.
- The committed libraries currently contain 50 quiz, 12 news and 16 MMA hooks.
- Keep enough hooks on each relied-on gate that the channel cooldown and consecutive-archetype
  rule leave a real choice. The always pool must survive a run of minimally described items.
- **Fallback policy:** if the library is empty, no gate holds, or cooldown/variety filters exhaust
  the eligible set, record `no-hook` and render the template's own headline. The selector never
  relaxes a truth gate or cooldown and has no LRU escape hatch.

## A/B methodology

- **One variable per pair.** If two arms differ in two ways, the result is unreadable.
- **Control** = rotating always-pool average on matched items.
- **Stratify** by the surface metadata that gates the hook and by language. Never pool CS + EN —
  effects are per-language.
- **Sample size**: ~5–8k impressions per arm detects a 2pp STR lift at a 75–85 % baseline
  (α = .05, power .8). No peeking before ~2k.
- **Guardrail stop rules run continuously** (after a 500-impression burn-in): completion
  −2pp or next-day return −1pp vs control stops the arm.

## Standing test pairs (v1)

| # | Pair | Variable isolated | Watch |
|---|---|---|---|
| P1 | stat-precise vs stat-majority (Tier B) | precise vs vague number | precision effect |
| P2 | rematch (Tier B) vs topic-audit | personal history vs generic {topic} | self-relevance |
| P3 | everyday-blindspot vs autopilot | interrogative vs declarative IoED | completion |
| P4 | streak-breaker vs honorable-miss (d4) | loss-frame vs reassurance | **next-day return** |
| P5 | topic-audit vs de-tokenized twin ("Quick audit." / "Rychlý audit.") | {topic} token value | does the token carry the lift |
| P6 | half-known vs polite-trap (d3) | payoff-promise vs trap-exists | archetype head-to-head |

## Cut-down principle

If a library must shrink, preserve **gate coverage and archetype variety** over individual
favorites. Do not compensate by weakening the channel cooldown or replacing `no-hook` with a
repeat; a plain truthful headline is the safer fallback.

## Results log

*(append dated A/B readouts here — pair, surface slice, impressions, primary-metric delta, guardrail
deltas, decision)*
