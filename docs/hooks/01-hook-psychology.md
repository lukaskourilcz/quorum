# Hook Psychology — Mechanism Catalog

A hook is one line that opens a **specific information gap the next slide is guaranteed to
close**. Everything below is in service of that. Format per mechanism: claim → evidence →
how to use it → example from the live library → when it fails.

Tags: see `README.md`. [verified] = source checked Aug 2026.

---

## 1. Information-gap curiosity — the core engine
**Claim.** Curiosity is a felt deprivation that arises when a *specific* gap opens between
what you know and what you want to know; people act to close it.
**Evidence.** Loewenstein (1994), *Psychological Bulletin* 116(1), 75–98. [verified]
**Use.** Name the missing piece concretely; make the hook unanswerable from the hook alone;
guarantee the next slide closes the gap.
**Example.** "One detail flips it. The rest is set dressing."
**Fails when.** The gap is vague ("You won't believe what happens") — see §2 — or when the
hook itself answers the question it raises.

## 2. The clickbait tax — concreteness beats vagueness
**Claim.** Vague forward-reference / withheld-referent curiosity headlines do **not**
reliably outperform, and concrete headlines generally win. This is the single most
important modern correction to "curiosity gap" folklore.
**Evidence.** Registered-Report meta-analysis of 8,977 headline experiments (2025,
PMC11704130) [verified]; Scott (2021), *Journal of Pragmatics* 175, 53–66, on clickbait
pragmatics [verified]; Blom & Hansen (2015), *Journal of Pragmatics*, taxonomy of
forward-reference [verified].
**Use.** Open the gap with concrete nouns ("the footnote", "the one detail", "{topic}"),
never with a withheld referent ("this trick", "what happened next").
**Fails when.** Never — this is a constraint, not a lever.

## 3. Half-knowledge peak
**Claim.** Curiosity peaks at intermediate confidence: people are most curious about things
they *half* know, not things they're clueless or certain about.
**Evidence.** Kang et al. (2009), *Psychological Science* 20(8), 963–973. [verified]
**Use.** Target the audience's ~50–80 % confidence zone; say "you half know this" only where
difficulty licenses it (d3+ for our audience).
**Example.** "You half know this. The explanation ships the rest."
**Fails when.** Aimed at trivial questions (reader is certain → no gap) or at total unknowns
(no scaffold to hang curiosity on).

## 4. Pretesting / productive failure
**Claim.** Guessing before learning improves retention even when the guess is wrong; framing
error as useful is empirically honest.
**Evidence.** Brod & Breitwieser (2019), *npj Science of Learning* [verified]; Kornell, Hays
& Bjork (2009), *JEP:LMC* 35(4), 989–998 [recalled].
**Use.** "Guess first / being wrong is useful" lines. Doubles as guardrail protection: it
keeps people answering instead of skipping to the reveal.
**Example.** "Guess first. Wrong guesses stick best."
**Fails when.** Overused — it's a reassurance, and reassurance wallpaper reads as coddling.

## 5. Illusion of explanatory depth (IoED)
**Claim.** People systematically overestimate their ability to *explain* familiar things;
the confidence collapses the moment they try.
**Evidence.** Rozenblit & Keil (2002), *Cognitive Science* 26(5), 521–562. [verified]
**Use.** "Explain it" challenges on common/familiar content. This is the **one legitimate
use of a closed question** in our system: the reader's internal "yes, I can explain it" is
reliably false, and the next slide punctures it.
**Example.** "You use {topic} every day. Can you explain it?"
**Fails when.** Pointed at genuinely unfamiliar content — no illusion to puncture.

## 6. Loss aversion
**Claim.** Losses loom larger than equivalent gains.
**Evidence.** Kahneman & Tversky (1979), prospect theory. [recalled]
**Use.** Streak-at-risk framing — sparingly, with long cooldowns, always paired in the
rotation with reassurance variants. Watch next-day return like a hawk (see 03).
**Example.** "Your streak doesn't care how sure you feel."
**Fails when.** Repeated — it habituates fast and can tip into anxiety, which is a
guardrail violation waiting to happen.

## 7. Endowed progress & streaks
**Claim.** Visible progress toward a goal increases persistence; people protect accumulated
progress.
**Evidence.** Kivetz, Urminsky & Zheng (2006), *JMR*; Nunes & Drèze (2006), *JCR*
[recalled]; Duolingo streak mechanics [practitioner].
**Use.** Reference only progress **the app actually tracks and shows** (streaks). Personal
streak numbers require the `streakAtLeast` predicate (Tier B).
**Fails when.** The referenced progress isn't visible in-product — then it's an
unverifiable claim.

## 8. Precision effect
**Claim.** Precise numbers are judged more credible and are more persuasive than round ones.
**Evidence.** Janiszewski & Uy (2008), *Psychological Science* 19(2), 121–127 [verified];
Jerez-Fernandez, Angulo & Oppenheimer (2014), *Psychological Science* 25(2), 633–635
[verified].
**Use.** "{missRate}% get this wrong" beats "most get this wrong" — but **only with real
recorded data** (statsReady, Tier B). One Tier A loophole: gate-derived math is free and
honest today ("Blind guessing tops out at 25% here" is true whenever options ≥ 4).
**Fails when.** The number is invented. That's not a failure mode, it's a firing offense.

## 9. Social norms & social proof
**Claim.** Descriptive norms ("what others do") steer behavior; endorsement by relevant
others adds weight.
**Evidence.** Schultz et al. (2007), *Psychological Science* 18(5), 429–434 [recalled];
Cialdini, *Influence* [recalled].
**Use.** Peer stats once statsReady exists; "interviewers ask this for a reason" style
authority framing under the interview gate.
**Fails when.** The norm normalizes failure so hard it excuses skipping ("everyone gets
this wrong, why bother").

## 10. Self-reference effect
**Claim.** Self-relevant information is processed more deeply and is more engaging.
**Evidence.** Rogers, Kuiper & Kirker (1977), *JPSP* 35(9), 677–688. [recalled]
**Use.** {topic} personalization, "your stack", and — strongest of all — reader history:
"Rematch: {topic}. It won last time." (Tier B `missedTopicBefore`). Expected to be the
single highest-lift hook in the system.
**Fails when.** The personalization is generic enough to feel like a mail-merge.

## 11. Zeigarnik effect (use with irony)
**Claim.** Interrupted/open tasks occupy the mind more than completed ones.
**Evidence.** Zeigarnik (1927). [recalled — old, replications mixed; treat as folklore
with a kernel.]
**Use.** At most one playful open-loop line in the library, written as personality, not as
a scientific claim.
**Example.** "Skip it and it follows you to lunch."
**Fails when.** Taken seriously or repeated — it's puffery with a wink, and the wink wears.

## 12. Von Restorff isolation
**Claim.** The distinctive item in a series is the one that gets remembered.
**Evidence.** von Restorff (1933). [recalled]
**Use.** At **rotation** level, not line level: vary archetypes so no template becomes
wallpaper. This is why the archetype cap (≤20 %) exists.

## 13. Wear-out
**Claim.** Response to a repeated message decays; humor and shock decay fastest.
**Evidence.** Pechmann & Stewart (1988), advertising wear-out review. [recalled]
**Use.** Cooldowns scale with intensity: neutral utility 6–8 d, standard 10 d,
jokes/personification 12–14 d, loss-frames and precision stats 12–20 d. Details in 03.

## 14. Processing fluency (mostly a caution)
**Claim.** Easy-to-process stimuli feel truer and more likable; the once-popular
*disfluency-helps-learning* result failed replication.
**Evidence.** Alter & Oppenheimer (2009), *PSPR* 13(3) [recalled]; disfluency effect
contested (Meyer et al. failed replication) [recalled].
**Use.** Keep lines short, concrete, easy to parse. Do **not** build strategy on making
things harder to read.

---

## What to lean on, in order (for this product)

1. Concrete information gaps (1 + 2) — the workhorse.
2. IoED explain-challenges (5) — best fit for commonUse content.
3. Half-knowledge framing (3) — best fit for d3+.
4. Payoff-promise — not a lab effect but a **product truth**: the explanation slide is a
   guaranteed payoff, so promising it is the most honest hook class and is
   completion-guardrail-positive by construction. "Miss it and the explanation still pays off."
5. Precision stats (8) — once the data pipeline exists.
6. Loss/streak framing (6 + 7) — carefully, long cooldowns, reassurance counterweights.
7. Open loops (11) — one, ironic, that's it.
