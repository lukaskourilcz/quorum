# Hook Craft Rules — the Writing Playbook

These rules produced the current 49-hook library. They are binding for in-app hooks and,
with the adaptations at the bottom, for carousel slide-1 hooks and social copy.

## Voice

Clipped, dry, confident. The hook is a person who knows the answer and isn't showing off.
- Czech: **tykání**, written native-first — never translated English.
- No emoji. No exclamation marks. No hype adjectives ("amazing", "insane", "šílený").
- Never beg for engagement ("comment below", "don't skip").

## Hard limits

- EN ≤ **58** chars, CS ≤ **66** chars. Aim < 45. One line, always.
- CS length ≤ ~**1.25×** its EN sibling (parity of punch, not word-for-word).
- ≤ **2** byte-identical dev/geo pairs per library, and only for app-level concepts
  (streaks) where the imagery genuinely doesn't split.
- Archetype cap: no archetype > **20 %** of the library. Tag every hook.

## Structural patterns that work

- **Two-beat setup + turn**: "X. Y." — "Boss question. Stay for the postmortem."
- **Concrete noun anchor**: the footnote, the snippet, the lineup, {topic} — never "this
  thing", "what happens next".
- **Open a gap the next slide closes.** If the reveal can't cash the check, rewrite.
- **Promise the payoff, not the content**: sell the explanation ("the why stays in
  production"), never paraphrase the answer.
- **Questions must be unanswerable from the hook** — with one exception: IoED
  explain-challenges, where the reader's internal "yes" is reliably false (see 01 §5).
- **Vertical split earns its keep**: dev and geo variants use different imagery
  (compiler/customs, stack/map, junior/kid). Identical pairs waste the split.

## Honesty rules (non-negotiable)

Every claim must be licensed by something the system actually knows: a gate, tracked state,
or arithmetic.
- Gates license claims: `optionsAtLeast:4` licenses "blind guessing tops out at 25%";
  `difficultyAtLeast:4` licenses "the kind that ends streaks"; `categoryIn:interview`
  licenses "an interview favorite". No gate, no claim.
- **Banned outright**: fake timers ("10 seconds" with no timer), invented statistics
  ("9 out of 10 devs…" before it's measured), manufactured urgency/scarcity, unverifiable
  reader claims ("you've argued about this at a bar").
- **Gate-derived math is free**: anything provable from the gate alone ships today.
- **Never spoil**: no hints toward or away from specific options. "Don't take the bait" is
  a soft spoiler (it warns off the intuitive answer) — that's why the old `looks-easy` died.

## Anti-patterns (ban list)

1. Closed yes/no questions — except IoED-backed explain-challenges.
2. Bare difficulty labels ("This one's hard."). Difficulty is a fact, not a gap.
3. Prohibition-only constraints ("No googling. No hints."). Reframe as reassurance:
   "Memory only. The docs will still be there after."
4. Fake urgency, countdowns without timers, artificial scarcity.
5. Superlatives and hype; engagement begging.
6. Calqued Czech (see below).
7. Vague forward-reference ("You won't believe…", "This one trick…") — see 01 §2.

## Czech is first-class

- Write CS as original copy, not translation. Idiom over word-for-word.
- Domesticated anglicisms are legitimate in dev register: *googlit, mergnout, streak,
  boss fight, edge case*. "Negoogli" is fine contemporary Czech.
- **Declension**: {topic} values are nominative. Place the token only in
  declension-safe slots — subject position ("{topic} je na každé mapě…") or after a colon
  ("Rychlý audit: {topic}."). Never inside a case-demanding frame ("s {topic}" breaks).
- Watch gendered past-tense forms (*viděls, otevřel*). Masculine generic is current app
  convention; prefer gender-neutral phrasing when it's equally strong ("Splést se tady
  není ostuda" beats a gendered alternative).
- Typo vigilance: diacritics are part of correctness (*nezrezivíš*, not *nezreziviš*).

## Per-hook shipping requirements

A hook does not ship without:
1. A named **mechanism** (from 01).
2. A **citation + confidence tag** — never upgraded, never invented.
3. A **falsifiable prediction** (e.g. "+2pp STR vs always-pool control on its gate slice").
4. A **falsifiedIf** condition (kill rule).
5. A **cooldown + one-line rationale** (intensity-scaled, see 03).
6. A **gate justification** (which predicate licenses which claim).

## Pre-ship checklist

- [ ] One line, within char budget (EN ≤58 / CS ≤66), CS ≤1.25× EN?
- [ ] Every claim licensed by gate, tracked state, or math?
- [ ] Spoiler-free (no nudge toward/away from any option)?
- [ ] Gap is concrete (nameable noun), not a withheld referent?
- [ ] If it's a question: unanswerable from the hook, or IoED-backed?
- [ ] CS native, declension-safe, tykání, no calques?
- [ ] Archetype tagged and under the 20 % cap?
- [ ] Cooldown assigned with a reason?
- [ ] Prediction + falsifiedIf written?
- [ ] No emoji, no exclamation marks, no hype?

## Adaptation: carousel slide-1 hooks & social posts (marketingShark)

The same rules apply with these deltas:
- **No gates exist in-feed.** The only licensed claims are ones true of the carousel's own
  content ("One detail flips it") or of the world. Reader-state and difficulty claims are out.
- **Stats must be real.** The classic "9 out of 10 developers get this wrong" template is
  banned until we have recorded per-question accuracy — then it becomes our strongest
  slide-1 line (precision effect, 01 §8), written with the exact number.
- **The answer reveal is the payoff.** Slide-1 promises it; slides 2–4 must cash it. A hook
  the reveal can't cash is churn-bait and damages the account, not just the post.
- **Concreteness still wins in-feed** — the clickbait-tax meta-analysis (01 §2) is about
  headlines in feeds, so it applies here *more*, not less.
- Platform captions (IG/Threads) follow the same voice rules; hashtags are metadata, not
  copy — never let them leak into the hook line.
- The final CTA slide gets no hook mechanics. It's an ad; let it be a quiet one.
