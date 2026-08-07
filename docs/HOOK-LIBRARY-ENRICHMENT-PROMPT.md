# Prompt — enrich the quiz hook library (evidence-backed)

> Paste everything from **§0 onward** into Fable as a single message. §A–§C below are
> author's notes for the owner and are *not* part of the prompt.

---

## §A. What this prompt is for

The quiz app shows a one-line **hook** attached to a question. The hook's only job is to
make the reader **swipe right to the next slide**. The current library has 16 hooks; they
are vague, several are byte-identical across the two verticals, and none of them is
grounded in anything except taste. This prompt asks Fable to rebuild the library so that
every line carries a named mechanism, a citation, and a falsifiable prediction — and to
return it in the exact schema so it can be pasted straight back into the config.

## §B. Slots the owner must check before sending

The prompt contains a **`PRODUCT FACTS`** block in §1. I inferred those values from the
schema (`questionStartsWith`, `hasCode`, `{topic}`, `optionsAtLeast`) — they are my best
reading, not confirmed truth. Fix any that are wrong before sending; the copy changes
materially depending on the answers, especially **slide order** (does the swipe reveal the
question, or the answer?) and **whether per-question accuracy stats exist**.

## §C. What comes back

Four blocks: the drop-in `hookLibrary` array, a parallel `hookResearch` array (mechanism +
citation + prediction, keyed by the same ids), a `proposedGates` spec for hooks that need
engineering work, and a short verdict table on the existing 16. Only the first block goes
into the config.

---
---

# §0. Role

You are a behavioural-science-literate copy strategist working on a mobile quiz product.
You write in **English and Czech at native level in both**. You are being asked to rebuild
a library of one-line hooks. You optimise for one measured behaviour, you justify every
line with a named mechanism, and you never ship a claim the product cannot verify.

Think hard before writing. Diagnosis first, copy second.

# §1. Product facts — do not contradict these

```
PRODUCT FACTS
  Product      A daily quiz app. Two independent verticals:
                 dev — programming / software engineering questions
                 geo — geography / world-knowledge questions
  Languages    en, cs. Both are first-class. Czech is NOT a translation target.
  Surface      Slides in a horizontal swipe deck, one question per card.
  Hook render  The hook is a single line of text displayed WITH the question,
               above it, before the reader has answered.
  The swipe    Swiping right advances to the next slide. Nothing else advances it.
  Slide order  hook + question  →  [reader answers]  →  answer/explanation slide
  Question fmt Multiple choice, 2–6 options. Some questions carry a code snippet.
  Difficulty   Integer 1–5.
  Categories   include at least: core, commonUse, interview
  Tokens       {topic} is interpolated at render time with the question's topic
               (e.g. "closures", "the Sahel"). It is the ONLY token that exists.
  Session      Reader does a small number of questions per day. Streaks are tracked
               and shown to the reader.
  Stats        Per-question global accuracy: NOT AVAILABLE TODAY.
               Assume it can be built if the payoff justifies it.
```

**The metric.** Hook success = **swipe-through rate (STR)** — swipes to the next slide
divided by hook impressions. Two guardrail metrics must not degrade: **question-completion
rate** (reader actually answers rather than skimming past) and **next-day return rate**.

Treat this as the central tension of the brief: a hook can win STR and lose the guardrails.
A shock line or an unpaid-off tease buys one swipe and costs a return visit. Say so
explicitly whenever a line you propose carries that risk.

# §2. The schema — return exactly this shape

```json
{ "id": "kebab-case-id",
  "cooldownDays": 10,
  "truthRequires": ["always"],
  "variants": {
    "dev": { "en": "...", "cs": "..." },
    "geo": { "en": "...", "cs": "..." } } }
```

Every field is mandatory. No extra keys in the library array — research metadata goes in a
separate array (§8).

**`truthRequires`** is the credibility system, and it is the most important thing in this
schema. A hook is only rendered when **every** predicate in its array holds for that
question. It exists so a hook can make a *specific, checkable claim* and never be caught
lying. Predicates in the current grammar:

| Predicate | Meaning |
| --- | --- |
| `always` | no condition |
| `optionsAtLeast:N` | question has ≥ N options |
| `difficultyAtLeast:N` | difficulty ≥ N |
| `categoryIn:X` | question category is X |
| `questionStartsWith:X` | question text begins with X |
| `hasCode` | question includes a code snippet |

You may propose new predicates, but only in the separate tier described in §7.

# §3. The current library — your input

```json
"hookLibrary": [
  { "id": "speed-run", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
    "dev": { "en": "You have 10 seconds. Go.", "cs": "Máš 10 vteřin. Teď." },
    "geo": { "en": "You have 10 seconds. Go.", "cs": "Máš 10 vteřin. Teď." } } },
  { "id": "no-google", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
    "dev": { "en": "No googling. That is the whole point.", "cs": "Negoogli. O tom to celé je." },
    "geo": { "en": "No maps, no googling.", "cs": "Bez mapy, bez googlení." } } },
  { "id": "bet-on-it", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
    "dev": { "en": "Would you bet a code review on this?", "cs": "Vsadil bys na to code review?" },
    "geo": { "en": "Would you bet your passport on this?", "cs": "Vsadil bys na to svůj pas?" } } },
  { "id": "two-look-right", "cooldownDays": 10, "truthRequires": ["optionsAtLeast:4", "difficultyAtLeast:2"], "variants": {
    "dev": { "en": "Two answers look right. One is.", "cs": "Dvě odpovědi vypadají správně. Jedna je." },
    "geo": { "en": "Two answers look right. One is.", "cs": "Dvě odpovědi vypadají správně. Jedna je." } } },
  { "id": "seniors-know", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:3"], "variants": {
    "dev": { "en": "Juniors know the rule. Seniors know the exception.", "cs": "Junioři znají pravidlo. Senioři znají výjimku." },
    "geo": { "en": "Tourists know the name. Travelers know the reason.", "cs": "Turisté znají jméno. Cestovatelé znají důvod." } } },
  { "id": "everyday-blindspot", "cooldownDays": 10, "truthRequires": ["categoryIn:commonUse"], "variants": {
    "dev": { "en": "You use {topic} every day. Can you explain it?", "cs": "Používáš {topic} každý den. Umíš to vysvětlit?" },
    "geo": { "en": "It is on every map. Have you ever noticed it?", "cs": "Je to na každé mapě. Všiml sis toho někdy?" } } },
  { "id": "interview-favorite", "cooldownDays": 10, "truthRequires": ["categoryIn:interview"], "variants": {
    "dev": { "en": "This one shows up in interviews.", "cs": "Tahle se objevuje na pohovorech." },
    "geo": { "en": "This one shows up in every quiz night.", "cs": "Tahle padá na každém kvízu." } } },
  { "id": "looks-easy", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:3"], "variants": {
    "dev": { "en": "Looks easy. Take the bait.", "cs": "Vypadá to jednoduše. Chyť se." },
    "geo": { "en": "Looks easy. Take the bait.", "cs": "Vypadá to jednoduše. Chyť se." } } },
  { "id": "one-detail", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:2"], "variants": {
    "dev": { "en": "One detail changes the whole answer.", "cs": "Jeden detail mění celou odpověď." },
    "geo": { "en": "One detail changes the whole answer.", "cs": "Jeden detail mění celou odpověď." } } },
  { "id": "streak-breaker", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:4"], "variants": {
    "dev": { "en": "Questions like this end streaks.", "cs": "Otázky jako tahle ukončují streaky." },
    "geo": { "en": "Questions like this end streaks.", "cs": "Otázky jako tahle ukončují streaky." } } },
  { "id": "explain-it", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
    "dev": { "en": "Could you explain this to a junior?", "cs": "Vysvětlil bys to juniorovi?" },
    "geo": { "en": "Could you explain this to a tourist?", "cs": "Vysvětlil bys to turistovi?" } } },
  { "id": "hard-mode", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:4"], "variants": {
    "dev": { "en": "Hard mode: no hints, no docs.", "cs": "Hard mode: bez nápovědy, bez dokumentace." },
    "geo": { "en": "Hard mode: no atlas.", "cs": "Hard mode: bez atlasu." } } },
  { "id": "depends-on-it", "cooldownDays": 10, "truthRequires": ["categoryIn:core"], "variants": {
    "dev": { "en": "You have shipped code that depends on this.", "cs": "Už jsi nasadil kód, který na tomhle stojí." },
    "geo": { "en": "Every map you have read leans on this.", "cs": "Každá mapa, kterou jsi kdy četl, na tomhle stojí." } } },
  { "id": "know-why", "cooldownDays": 10, "truthRequires": ["questionStartsWith:Why"], "variants": {
    "dev": { "en": "You know the what. This asks the why.", "cs": "Víš co. Tohle se ptá proč." },
    "geo": { "en": "You know the what. This asks the why.", "cs": "Víš co. Tohle se ptá proč." } } },
  { "id": "spot-it", "cooldownDays": 10, "truthRequires": ["hasCode"], "variants": {
    "dev": { "en": "Spot it before the compiler does.", "cs": "Najdi to dřív než kompilátor." },
    "geo": { "en": "Spot the odd one out.", "cs": "Najdi, co sem nepatří." } } },
  { "id": "daily-rep", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
    "dev": { "en": "One question a day keeps the rust away.", "cs": "Jedna otázka denně a nezreziviš." },
    "geo": { "en": "One question a day keeps the world close.", "cs": "Jedna otázka denně a svět zůstane blízko." } } }
]
```

# §4. Diagnosis you must confirm or overturn before writing a single line

I have already analysed the library. Start your reply by stating, for each numbered point,
whether you **agree, partly agree, or disagree**, with a one-sentence reason. Where you
disagree, your library must reflect your position, not mine. Add anything I missed.

**4.1 — Gate starvation.** Distribution of the 16: `always` 5; `difficultyAtLeast:2` 1;
`difficultyAtLeast:3` 2; `difficultyAtLeast:4` 2; `optionsAtLeast:4`+`difficultyAtLeast:2` 1;
`categoryIn:commonUse` 1; `categoryIn:interview` 1; `categoryIn:core` 1;
`questionStartsWith:Why` 1; `hasCode` 1. With a flat 10-day cooldown, any gate holding one
hook can fire at most once per 10 days — every other matching question falls through to the
five `always` hooks. The library therefore behaves like a 5-hook library most of the time,
and a daily user sees the same five lines on repeat. **Any gate you use must hold enough
hooks to survive its own cooldown.**

**4.2 — Six of sixteen waste the vertical split.** `speed-run`, `two-look-right`,
`looks-easy`, `one-detail`, `streak-breaker` and `know-why` are byte-identical across `dev`
and `geo`. The schema pays for two voices and uses one. The good counter-examples —
`seniors-know` (juniors/seniors vs tourists/travelers), `spot-it` (compiler vs odd-one-out)
— show what the split is for.

**4.3 — They describe the question instead of opening a gap.** "One detail changes the
whole answer" and "Looks easy. Take the bait." are *statements about difficulty*. Difficulty
is not curiosity. An information gap needs the reader to feel a **specific** missing piece
and to believe the next slide closes it.

**4.4 — Closed questions close the loop.** `bet-on-it` ("Would you bet a code review on
this?") and `explain-it` ("Could you explain this to a junior?") invite an internal yes/no.
A reader who thinks *yes* has resolved the tension and has less reason to swipe, not more.
Interrogative hooks must be ones the reader **cannot answer from the hook alone**.

**4.5 — Constraint hooks fight the metric.** `no-google`, `hard-mode` and `speed-run` are
rules and prohibitions. They raise stakes, but they also announce that the next slide is
*work* and impose a cost before any reward is on the table. Suspect on an STR metric.
Keep at most a token few, and say why.

**4.6 — Nothing is about the reader.** No hook references the reader's own state — streak
length, a topic they missed before, their accuracy, their rank. `streak-breaker` gestures at
streaks but generically ("Questions like this…"), which is exactly the version that carries
no personal stake.

**4.7 — No normative/social data anywhere.** "X% get this wrong" is the most-tested
curiosity device in quiz products and the library has none of it. It needs a stat the product
does not yet compute — which is a §7 proposal, not a reason to skip it.

**4.8 — Flat cooldown ignores wear-out.** Every hook is `cooldownDays: 10`. High-intensity
lines habituate faster than neutral ones. Cooldown should be a **function of intensity**:
propose a real number per hook and justify the ones that deviate from 10.

**4.9 — `{topic}` is used exactly once.** Interpolation is the cheapest specificity in the
system and only `everyday-blindspot` uses it. Specific beats generic; a hook that names the
thing feels written for this question.

**4.10 — Czech lines to re-examine.** Several read as calques rather than native copy.
`"Chyť se."` for "Take the bait" loses the idiom (Czech would reach for *naletět* /
*skočit po tom*). `"Negoogli."` is a formed but awkward coinage. `"Máš 10 vteřin. Teď."` —
`Teď.` is a weak rendering of "Go." Judge these yourself; the standard is that a Czech
reader must not be able to tell which language the line was written in first.

# §5. Ground every hook in evidence — this is the core requirement

The existing library was written on instinct. The replacement must not be. **Every hook you
return carries a named mechanism and a source.** A hook you cannot justify is a hook you
delete.

**5.1 Research first.** If you have web search, use it: look for empirical work on curiosity
gaps, headline/teaser effects on click-through, quiz and trivia engagement, streak and
loss-framing mechanics in learning apps, and the measured **costs** of unpaid-off curiosity
teases. Prefer primary sources and replications over blog summaries. If you do not have web
search, work from established literature you can recall — and follow 5.2 strictly.

**5.2 Citation honesty is non-negotiable.** Every citation is tagged `verified` (you checked
it this session), `recalled` (from memory, not checked) or `practitioner` (industry claim,
not peer-reviewed). **Never invent an author, year, title, DOI, page number or effect size.**
If you are unsure of a year, write `n.d.` rather than guess. A `recalled` citation with an
honest tag is worth more than a fabricated `verified` one, and a mechanism you can describe
but not attribute should say `mechanism only, no attribution`.

**5.3 Mechanisms worth grounding in** — a starting set, not a limit. Verify what you use.

- **Information-gap theory** (Loewenstein 1994) — curiosity peaks at *moderate* gaps. A
  reader who knows nothing feels no gap; a reader who knows everything feels no gap. This
  predicts hooks should target **partial** knowledge, and is the single most load-bearing
  idea for this library.
- **Curiosity and intermediate confidence** (Kang et al. 2009, *Psych. Science*) — curiosity
  and willingness to spend to resolve it peak when the reader half-knows.
- **Zeigarnik effect** (Zeigarnik 1927) — unresolved tasks stay active in mind. Open loops.
- **Collative variables and the inverted-U** (Berlyne 1954, 1960) — novelty, surprise,
  incongruity, complexity; too much arousal repels as reliably as too little.
- **Loss aversion / prospect theory** (Kahneman & Tversky 1979) — losing a streak looks
  larger than gaining one. Relevant, and easy to overdose into anxiety.
- **Goal-gradient and endowed progress** (Kivetz et al. 2006; Nunes & Drèze 2006) — effort
  accelerates near a visible goal.
- **Self-reference effect** (Rogers, Kuiper & Kirker 1977) — self-relevant material is
  encoded and attended to better. Argues for 4.6.
- **Social proof / normative feedback** (Cialdini; Schultz et al. 2007) — argues for 4.7.
- **Precision effect in numbers** (Janiszewski & Uy 2008) — precise figures read as more
  credible than round ones. "83% miss this" ≠ "most people miss this".
- **Processing disfluency** (Alter & Oppenheimer 2009) — mild difficulty can deepen
  engagement. Contested; treat carefully and flag the contestation.
- **Isolation / von Restorff effect** (von Restorff 1933) — the distinctive item stands out.
  In a rotating library, this is an argument *for* tonal variety across hooks.
- **The clickbait tax** — teases that do not pay off degrade trust and future click-through.
  Find real evidence for this; it is the constraint that keeps the whole library honest.

**5.4 Falsifiable prediction per hook.** Each hook states what you expect to happen and how
you would know you were wrong — e.g. *"expect +STR vs the `always` pool on difficulty ≥ 3;
if completion rate drops more than 2pp, the line is over-promising and should be cut."*

# §6. Craft rules

- **Length.** English ≤ 58 characters, Czech ≤ 66. Aim under 45 in both. Czech must not run
  more than ~25% longer than its English sibling — if it does, rewrite the Czech, don't
  stretch the box.
- **Two voices, always.** `dev` and `geo` must differ in imagery unless a line is genuinely
  universal — and you must justify each identical pair. Target: **at most 2** identical pairs
  in the whole library.
- **Czech is written, not translated.** Idiomatic, contemporary, informal — the register the
  existing library uses (`tykání` throughout: *máš*, *vsadil bys*, *víš*). No calques.
  Where the natural Czech line diverges from the English, let it diverge; sibling variants
  must share the *mechanism*, not the words.
- **The gate must license the claim.** If a hook says two answers look plausible, it needs
  `optionsAtLeast:4`. If it says the reader has shipped code depending on this, it needs
  `categoryIn:core`. Loose gate + specific claim = the hook eventually lies. That failure is
  expensive and permanent; be strict here.
- **Never spoil.** The hook precedes the answer. It may not narrow the option set, hint at
  which answer is correct, or imply the answer is counterintuitive in a way that gives it
  away.
- **No fake urgency, no fake stats, no manipulation the product cannot honour.** A "10
  seconds" hook is a lie unless a timer actually runs. Flag any existing hook that already
  breaks this.
- **Sound like a sharp friend, not a growth team.** No emoji. No exclamation marks. No
  "You won't believe". The existing voice is clipped, dry and confident — keep it.

# §7. Two tiers of output

**Tier A — ships today.** Uses only the §2 predicates. **Target 42–52 hooks.** This is the
main deliverable. Respect 4.1: every gate you use must hold enough hooks to outlast its
cooldown — as a rule of thumb, **≥ 5 hooks per gate you rely on**, more for `always`.

**Tier B — needs engineering.** Hooks that require new predicates. **Up to 12.** Only propose
a predicate if the copy it unlocks is clearly stronger than anything Tier A can do —
normative stats (4.7) and reader-state hooks (4.6) are the obvious candidates. For each new
predicate give: name, type, meaning, what the app must compute, and the hooks it unlocks.
Put Tier B hooks in a **separate array** so Tier A stays pasteable.

**Archetype coverage.** Tag every hook with an archetype and **cap any single archetype at
20%** of the library. A starting taxonomy — extend it if you find better shapes:

`stat-gap` · `partial-knowledge` · `trap-exists` · `consequence-in-the-wild` ·
`self-state` · `peer-comparison` · `counterintuitive-promise` · `identity-claim` ·
`progress` · `omission` (*one of these four is a lie*) · `rarity` · `time-pressure`

Anti-archetypes — do not produce these: closed yes/no questions the reader can answer from
the hook; unverifiable claims; bare difficulty statements; prohibitions that add friction
without adding a gap.

# §8. Output format

Reply in exactly this order.

**1. Diagnosis** — your agree/partly/disagree verdict on each of 4.1–4.10, one sentence
each, plus anything I missed. Prose, brief.

**2. Verdict on the existing 16** — a table: `id` | `keep` / `revise` / `cut` | one-line
reason. Kept and revised ids **retain their id** so history stays comparable.

**3. `hookLibrary`** — one fenced ```json block, the Tier A array only, exactly the §2
schema, no extra keys, valid JSON, ready to paste. Return the array value alone.

**4. `hookResearch`** — one fenced ```json block, same ids, same order:

```json
{ "id": "…",
  "archetype": "stat-gap",
  "mechanism": "Information gap — names a specific missing piece the next slide closes",
  "citation": "Loewenstein, G. (1994). The Psychology of Curiosity. Psych. Bulletin 116(1).",
  "citationConfidence": "verified | recalled | practitioner | mechanism only, no attribution",
  "whyItEarnsTheSwipe": "…",
  "prediction": "…",
  "falsifiedIf": "…",
  "cooldownRationale": "…",
  "risk": "…",
  "gateJustification": "why truthRequires makes this claim always true" }
```

**5. `proposedGates` + Tier B** — the new predicate specs, then the Tier B hook array in the
same §2 schema.

**6. Test plan** — 6 head-to-head pairs isolating one variable each (e.g. precise stat vs
vague stat; self-state vs generic; question vs statement), the control to test against, the
guardrail thresholds that should stop a rollout, and roughly how many impressions per arm
before the result means anything.

**7. What you would cut if forced to 12 hooks** — just the ids, ranked.

# §9. Before you answer

Do the diagnosis before the copy. Do the research before the diagnosis. If any §1 product
fact is ambiguous in a way that changes your recommendation, **state the assumption you
made and carry on** — do not stop to ask. Write the whole library in one pass; do not
sample and offer to continue.
