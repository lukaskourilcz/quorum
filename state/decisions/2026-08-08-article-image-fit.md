# Article image fit system

Date: 2026-08-08

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `article-image-fit-2026-08-08`

Source: Owner instruction in the 2026-08-08 image-pipeline review session

## Decision

Every published article image passes a vision check before it ships. The desk
that writes an article also writes its visual brief, the licensed search runs
on that brief across four providers, and a budgeted vision model looks at the
actual candidate pixels and rejects anything off-subject, dated, watermarked,
logo-bearing or face-bearing before selection. A candidate nothing has looked
at can no longer become a hero.

The certainty ladder from `autonomy-licensed-images-2026-08-01` stays intact
and this decision extends it: the Wikidata identity rung is untouched, the
curated scene rungs remain and gain a growth path fed by gate-approved photos,
and the FRAME plate remains the honest last state. The two MMA articles still
carrying heroes from the pre-ladder search (`oktagon-gustavo-lopez`,
`ufc-valentina-shevchenko`) are re-delivered with corrected images.

A generated-illustration rung is authorised between search and the plate,
implemented dark: the code ships now, and nothing generates until the owner
adds `FAL_KEY` and flips `ARTICLE_ILLUSTRATION_ENABLED`. Generation uses
FLUX.1-schnell through fal.ai (Apache-2.0 outputs, about $0.003 per image),
is capped at two images per day, ledgers every call under `kind: "image"`,
must pass the same vision gate, and is always labelled as an illustration —
never presented as photography. This paragraph revises the `config/models.json`
note that forbade image-generation call sites in article pipelines; the
prohibition on unsanctioned call sites stands, and this decision sanctions
exactly one.

Excluded by owner instruction: Google/Gemini/Vertex in any role, Higgsfield,
Unsplash, SerpAPI, OpenAI image models, any new subscription, any scraping or
hotlinking of news or agency photographs. The vision gate runs on the
Anthropic key and budget plumbing the company already pays for. All spend
stays inside `budget-2026-08e`: the gate is capped at $0.02 per article and
the whole image program at $0.10 per day, with descent to the plate — never
an overrun — when a cap is hit.

The implementation contract is `docs/ARTICLE-IMAGES-OPUS-BUILD-PROMPT.md`,
and the work is tracked as GitHub issues `IMG-01` through `IMG-12`, one per
task below, worked in title order. Where a task below and that document
disagree, this decision wins, then the document, then — being newest — the
issue.

## Tasks

- [x] T1 — DNESKAi subject query reads the picked story, not the whole digest (brief §T1)
- [x] T2 — `IMAGE_GATE` model role, vision call plumbing, ledger and caps (brief §T2)
- [x] T3 — `images/vision-gate.ts` with verdict schema, vetoes and tests (brief §T3)
- [x] T4 — Visual brief fields on both desks, with name-safety validation (brief §T4)
- [x] T5 — Selection rewired: search after write, gate picks, writer index removed (brief §T5)
- [ ] T6 — Retrieval widened: per-phrase fan-out, 12 candidates, Pixabay caching (brief §T6)
- [ ] T7 — Gate covers curated rungs; advisory-only on the identity rung (brief §T7)
- [ ] T8 — Scene-proposal flywheel files and promotion path (brief §T8)
- [ ] T9 — Recall of the two wrong MMA heroes through the delivery path (brief §T9)
- [ ] T10 — Illustration rung, dark behind `FAL_KEY`, schema and consumers checked (brief §T10)
- [ ] T11 — Documentation sweep: CLAUDE.md invariant, cost notes, NEEDED items (brief §T11)
- [ ] T12 — Full gates green, dry-run evidence recorded, contract retired, branch merged to main (brief §T12)

## Approval reference

`owner-request:2026-08-08-article-image-fit`
