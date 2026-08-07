# Hook Metrics, Cooldowns & Testing

## Metrics

- **Primary: swipe-through rate (STR)** — swipe from the hook+question card to the
  answer/explanation card.
- **Guardrails (must not degrade):**
  - **Question-completion rate** — catches hooks that drive swiping past the question
    instead of through it (over-promising the reveal).
  - **Next-day return rate** — catches hooks that win the swipe but sour the habit
    (anxiety-inducing loss frames are the usual suspect).

A hook that lifts STR while denting a guardrail is a **net-negative hook**. The guardrails
are not tie-breakers; they're veto players.

## Falsifiability lifecycle

Every hook ships with a prediction + `falsifiedIf`. Lifecycle:
1. **Ship** with cooldown and gate.
2. **Watch** — no directional reads before ~2,000 impressions per hook per vertical.
3. **Judge** — kill rules below.
4. **Log** — write the outcome into `hookResearch` (tag → `[measured]`) and into the
   Results log at the bottom of this file.

**Kill rules** (vs matched control):
- Completion −2pp → stop/cut (over-promising).
- Next-day return −1pp → stop/cut (habit damage).
- STR ≤ control after full sample → retire or rewrite.

## Cooldowns & wear-out

Repeated messages decay; humor, personification and loss-frames decay fastest
(Pechmann & Stewart 1988 [recalled]). Assignment heuristics:

| Hook type | Cooldown |
|---|---|
| Neutral utility / reassurance ("guess first", payoff promises) | 6–8 d |
| Standard curiosity-gap lines | 10 d |
| Jokes, personification ("written with love", "follows you to lunch") | 12–14 d |
| Loss-frames, streak lines, precision stats | 12–20 d |

Monitor **STR by nth exposure** per hook. Visible decay → lengthen cooldown or retire.
Cooldowns are per-user per-hook.

## Pool arithmetic (why the library is 49 hooks, not 16)

- Servable pool per question = always-pool + all hooks whose gates the question satisfies.
- Coverage needed ≈ questions/day × cooldown days. A daily 5-question user over a 10-day
  cooldown window needs ~50 servable hook impressions; a 5-hook always pool collapses.
- Keep **≥5 hooks on every gate you rely on**; the always pool must survive a run of
  gateless questions on its own.
- **Fallback policy**: when every eligible hook is cooling, serve the least-recently-shown
  eligible hook (LRU). Never error, never repeat within a session, never show no hook.

## A/B methodology

- **One variable per pair.** If two arms differ in two ways, the result is unreadable.
- **Control** = rotating always-pool average STR on matched questions.
- **Stratify** by difficulty × vertical × language. Never pool CS + EN — effects are
  per-language.
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

If the library must shrink (e.g. to 12), preserve **gate coverage and archetype variety**
over individual favorites, shorten always-pool cooldowns (~5 d), and keep the LRU fallback
on — at 12 hooks, gated pools collapse to 1–2 per gate and the always pool carries the load.

## Results log

*(append dated A/B readouts here — pair, verticals, impressions, STR delta, guardrail
deltas, decision)*
