# Product marketing context — MMA Files

Drafted 2026-08-06 from `state/BUSINESS.md`, `config/ventures.json`, the magazine's STYLEBOOK and
its own control document. It exists so the vendored marketing skills stop asking for foundations
this repository already holds. **Nothing here is a claim about performance.**

Document version: 1.0 · Changelog: 1.0 (2026-08-06) — first draft, generated from committed state.

## 1. Product overview

A Czech fighting magazine at `mma-files.vercel.app`. One article a day, written natively in Czech,
plus the reader-facing home for FightAIQ's checked fighter files, event cards, captured odds and
reviewed model output.

- Category: MMA magazine. The shelf is "Czech MMA coverage".
- Type: publication with a data layer.
- Business model: none active. Sponsorship and non-bookmaker affiliates are locked hypotheses.
  No affiliate link, bookmaker promotion or guaranteed-outcome claim may ever appear.

## 2. Target audience

Czech MMA followers who watch UFC and Oktagon and want more than a results post: who is fighting,
what the record actually says, and what the numbers behind a matchup look like.

The job: *tell me what is happening this fight week, and show me the evidence rather than the
opinion.*

## 3. Personas

Not B2B.

## 4. Problems and pain points

Czech MMA coverage is thin, and what exists is mostly results and social clips. Fight records and
event data live in English databases; anything statistical lives behind a bookmaker's framing,
where the number exists to sell a bet rather than to explain a fight.

## 5. Competitive landscape

- **Direct**: Czech MMA news sites and the promotions' own channels. Faster on breaking news,
  no data layer, and the promotion's own channel is never neutral about its own fighters.
- **Secondary**: English databases (Sherdog, Tapology, UFCStats). Complete and unreadable if you
  do not read English comfortably.
- **Indirect**: bookmaker previews. Free, numerate, and structurally not on the reader's side.

## 6. Differentiation

Every fighter file is two-source before it is published. Model output carries its version, its
capture time and its uncertainty, and is never presented as a tip. A missing record stays visibly
missing rather than being backfilled with a zero. No affiliate link, no bookmaker promotion, no
automated bet placement — ever, and this is a product boundary rather than a current policy.

## 7. Objections and anti-personas

- *"Machine-written."* — Said plainly on the page. Every article names its sources.
- *"Where are the picks?"* — There are none. Probabilities are published as probabilities.
- Anti-persona: someone looking for betting tips. They will be disappointed, correctly.

## 8. Switching dynamics

- **Push**: results posts with no substance behind them.
- **Pull**: fight-week coverage with the data attached, in Czech.
- **Habit**: the promotion's Instagram is already on the phone.
- **Anxiety**: "is this just an AI content farm?" — answered by the sourcing, or not at all.

## 9. Customer language

Not captured. No reader research has been done. Do not invent verbatim quotes for a magazine whose
whole position is that claims carry evidence.

Words to avoid: "lock", "guaranteed", "sure thing", "value bet", and every phrase that would read
as a tip.

## 10. Brand voice

Direct, factual, unexcitable. Czech, natively. It respects a reader who already knows the sport,
and it never claims the publication is live, established, independent or fully automated.

## 11. Proof points

None to cite. All seed content is fictional, labelled `isDemo: true`, badged as a demo and
`noindex`. There is no traffic figure, no subscriber count and no testimonial. What exists is the
data layer: two-source fighter records, event coverage, and an evaluation record for every
prediction after the fight.

## 12. Goals

Evidence-backed slot fill, and FightAIQ events and fighters actually rendered in the delivered
file. The conversion action is a returning reader on fight week, which nothing currently measures.
