# Design Lab template expansion — build prompt

Source: owner instruction in the 2026-08-10 trends-research session. This document is the
implementation contract for adding at least ten new template families to the Design Lab. Where this
document and a decision in `state/decisions/` disagree, the decision wins — in particular
`design-lab-2026-08-08` (deterministic, free, no model at or below the renderer) and D11
(`2026-08-02-carousel-studio-d11.md`). Like `docs/DESIGN-LAB-OPUS-BUILD-PROMPT.md` before it, this
file is deleted in the closing commit of the work it describes.

Cost note: nothing in this programme calls a model or a provider. The renderer is model-free by
decision, so the whole build sits outside the `budget-2026-08e` model share at $0.

## 0. What you are building

The Design Lab's editable set is the **template family** library: ten families composed
programmatically per deck length in `studio/src/families.ts`, listed in `DECK_FAMILIES`
(`studio/src/designs.ts`), surfaced as chips in
`site/src/components/admin/design-lab-workspace.tsx`, and driven by the recipe axes — family,
variant A/B, photo treatment, type scale 0.9/1/1.1, phase seed 0–3 — plus per-slide text and
presets. That whole surface is what "fully editable" means here. Seed layouts in
`studio/src/library.ts` are a different, gallery-only kind; do not add there.

Build **at least ten** new families from the trend digest in §2. Each one must be a genuinely
distinct composition — the old five deck styles were retired precisely because they were "one
design in five coats" — and each must ride every existing control with no new UI: a new family that
ignores `typeScale`, renders A and B identically, or looks the same on adjacent beats is not done.

## 1. Read before writing anything

1. `CLAUDE.md` and `docs/ENGINEERING.md` — the standing rules. Rule 8's ~400-line soft cap means
   the new composers go in **new modules** beside `families.ts` (already 624 lines), assembled into
   the existing `families` record; do not double the file.
2. `docs/design-lab/SPEC.md` — the binding template-language artifact — then
   `docs/design-lab/README.md` and `docs/design-lab/TOKENS.md`.
3. `studio/src/families.ts` end to end: the safe band (`TOP 0.145 / BOTTOM 0.835 / LEFT 0.075 /
   RIGHT 0.925`), `FAMILY_SERVES`, the `RHYTHM` beats, `scaled()`, and two composers in full
   (`slab` for type-only, `masthead` for photo-forward).
4. `studio/src/schema.ts` (layer kinds and their bounds), `studio/src/recipe.ts` (axes, encoding,
   receipt-seeded selection), `studio/src/validation.ts` (the six checks),
   `studio/tests/families.test.ts` (what "distinct" means in bytes).
5. The newest `state/decisions/*.md` — golden rule 1.

## 2. The trend digest, mapped to buildable families

Researched 2026-08-10 across Canva's 2026 Design Trends report ("Imperfect by Design"; pared-back
design searches up 54%), Creative Bloq / Fontfabric / Design Flea typography-trend surveys,
whaaat.ai's carousel-format census, Morphica's LinkedIn carousel work (condensed display and mono
faces displacing geometric-sans defaults; multi-image carousels the highest-engagement format in
the 2025 benchmark), the Swiss-style references, and the repo's own `ui-ux-pro-max` database.
Recurring result: **typography-led minimalism wins feeds** — one idea per slide, hierarchy over
decoration, and the human touches (annotation, imperfection, print grammar) that AI-era audiences
read as authorship.

Constraints that shape every concept below. Faces are brand-resolved through `fontToken`
(`headline | body | mono`), so a family expresses its trend through **layout, scale, weight, case,
tracking and tokens** — never by naming a font; it must look right in all five brand skins.
Layers cannot leave the canvas and meaningful content cannot leave the safe band, so "oversized"
means filling the band, not literal bleed. There is no rotation in the schema; no grain assets
(embedded image bytes in `studio/src` fail a test); `mesh` blobs and two-stop gradients are the
only soft-art primitives. Body passages start 0.14–0.26 of the safe height in — TOKENS.md calls
this the most load-bearing rule in the set. No fake UI chrome, no invented statistics, no
fabricated quotes, no engagement ornament (README rules). Photo treatments are a variant axis, not
a family premise.

Ship at least ten of these thirteen. If one proves infeasible against the validators, record why
in the commit body and substitute from the reserve pair in §2b — an honest substitution beats a
forced frame.

1. **`billboard` — oversized poster type.** Trend: type as the entire image; 5:1
   headline-to-body contrast, tight tracking, edge-to-edge presence. Cover: the headline fills the
   safe band, `maxFontSize` at or near the 200 cap, weight 900, negative tracking, kicker tucked
   in one corner in mono. Body beats: the passage's own first words at poster scale, remainder at
   reading size. Distinct from `slab`: no bands, no inversion — scale itself is the composition.
   Type-only.
2. **`broadsheet` — print page grammar.** Trend: editorial/print logic returning (mastheads,
   datelines, rules, folios). Thin rules above and below, a mono dateline row (venture wordmark ·
   date · folio "02 / 07"), passage set in a measured column with a hanging accent index numeral.
   Distinct from `masthead` (hero front page) and `dossier` (bare record): this is the inside
   page, all furniture, no photo dependency. Type-only.
3. **`zurich` — Swiss / International style.** Trend: modular grid, flush-left rag-right,
   black/white plus one functional accent, oversized index numerals. Asymmetric placement that
   walks the grid with the beat; a large muted "01" behind or beside the passage; one accent
   square as the only ornament. Distinct from `terrace` (stepped bands): zurich is grid and void,
   not bands. Type-only.
4. **`concrete` — softened neo-brutalism.** Trend: blocky ultra-bold, hard borders, offset-block
   shadows, zero radius, intentional friction. A `surface` panel with a thick stroke and a
   token-colored duplicate shape offset a few thousandths behind it, uppercase 900 headline, mono
   labels. B variant swaps which corner the shadow falls. Type-only.
5. **`terminal` — monospace technical.** Trend: mono faces and bracketed labels reading as
   data-driven competence. `fontToken: "mono"` for everything; a prompt glyph opening each
   passage; bracketed kicker `[ TÉMA ]`; a dashed baseline rule per text row; pagination as
   `03/07`. Distinct from `dossier` (body-font quiet) and `memo` (prose page): terminal is rows,
   brackets and cursor. Type-only.
6. **`marginalia` — highlighter and annotation.** Trend: clean type with a human hand over it —
   marker highlights, underlines, margin ticks, "small flaws signal authorship." The mechanic
   exists: a `shape` with `padText` hugs a text slot — use it as the highlight strip behind the
   passage's lead line, with short dashed accent rules as hand-drawn-feeling underlines and a
   margin tick walking with the beat. No randomness — strokes are fixed per beat. Type-only.
7. **`memo` — the typed note.** Trend: notes-app / typed-memo anti-aesthetic, radical plainness
   as the authenticity signal. Honest version, since fake UI chrome is banned: a typewritten page
   — body font at reading weight, short ragged measure, a mono date line at top, a single accent
   asterisk footnote marker, `surface` paper on `background`. Distinct from `dossier`: memo is a
   note somebody typed, dossier is a filed record with hairlines. Type-only.
8. **`versus` — the contrast diptych.** Trend: split-screen opposing ideas; the contrast is
   legible before the text is read. Two stacked blocks (`surface` vs `surface-strong`), the
   headline straddling them, an accent divider rule; body beats alternate which half carries the
   passage and which carries the void; B variant flips the split axis for the whole deck.
   Distinct from `gutter` (photo column) and the legacy `contrast` coat. Type-only.
9. **`tally` — the honest big number.** Trend: one oversized numeral anchoring the slide. The
   number is the deck position — never an invented statistic (`figure`'s own rule) — set as a
   giant 900-weight numeral in `muted` or `accent` behind/beside the reading-size passage.
   Distinct from `figure` (blocks and chips): tally is typographic, the numeral itself at 140px+.
   Type-only.
10. **`counterweight` — weight-contrast lockup.** Trend: ultra-bold against light in one lockup;
    variable-font-era rhythm. First line of each passage at 900, remainder at 400, sizes near
    equal, tight leading, one accent word-rule; the split point moves with the beat. Type-only.
11. **`throughline` — follow the line.** Trend: seamless carousels — an element continuing across
    slide boundaries reports ~40% higher completion; the line pulls the swipe. A rule enters
    every slide at the left edge at a deterministic height, dips to underline the passage, exits
    right at the next slide's entry height; the outro terminates it in an accent square.
    Horizontal continuity, so distinct from `tower`'s climbing chapter bar. Type-only,
    quote-capable.
12. **`quiet` — calm serif-era minimalism.** Trend: pared-back "quiet luxury" — vast negative
    space, sentence-case headline at modest scale, tiny mono footer, nothing else. The discipline
    is what reads as expensive: one text block per slide inside a generous void, placement
    breathing with the beat. Distinct from `dossier` and `memo` by having no furniture at all.
    Type-only, photo-capable on the cover as a small contained plate, never full-bleed.
13. **`offset` — misregistration print.** Trend: imperfect print artifacts — duotone
    misregistration, layers a hair out of true. The headline slot rendered twice, a `secondary`
    echo offset by a few thousandths behind the `foreground` pass. Verify the schema accepts two
    text layers naming one slot; if it refuses, build the echo from `padText` shapes instead, or
    substitute from §2b. Type-only.

### 2b. Reserve concepts

- **`aphorism`** — the giant-punctuation quote card: a quotation glyph at 200px as the
  composition's mass, passage at speaking size beneath, em-dash attribution. Must read as a
  different family from `pull` (bar-and-panel) in one glance.
- **`index`** — the contents page: the whole deck's promise as numbered rows on the cover, one
  row emphasized per body beat. A curiosity-hook surface for list-shaped articles.

### 2c. Craft rules the compositions must serve

The cover is a hook surface. GoVIRAL's five hook families (`orchestrator/prompts/goviral.md`) are
the slide-one taxonomy — curiosity needs one long line given room, social proof needs an honest
number given mass, contrarian needs a two-part beat. Value carousels are what move on Instagram;
static single images are not. One idea per slide; the 30-word slide limit and the
short/medium/long `passageLength` bands already enforce the pacing — compose for them.

## 3. The contract each family must meet

- **Registration is five edits plus docs**: `DECK_FAMILIES` (`studio/src/designs.ts`),
  `FAMILY_SERVES` and the `families` record (TS forces both), the hard-coded `FAMILIES` chip
  array in `design-lab-workspace.tsx`, and the counts in `studio/tests/families.test.ts`. The
  site's `design-lab.ts` and the orchestrator's `deck-style.ts` derive; do not touch them.
- **Every family, all four canvases** (1080×1080, 1080×1350, 1080×1920, 1200×1200) from one
  `slides` array composed inside the union safe band; nothing meaningful in the 9:16 chrome bands
  (top 0.14, bottom 0.16 — a test reads them).
- **Every family × five brands × every variant clears 4.5:1 contrast** with the seven brand
  tokens only — `caught-up`, `mma-files`, `titty-tuesdays`, `devshark`, `geoshark`. No new color
  tokens, no new fonts, no schema changes. If a truly additive schema field becomes necessary,
  it must default to old behaviour and must not disturb the pinned v1 golden hash — re-baselining
  is a deliberate act this programme should not need.
- **Distinctness in bytes**: every pair of families renders different bytes, A differs from B,
  adjacent body beats differ, and `typeScale`/`phaseSeed` visibly act. With 20+ families the
  pairwise test grows quadratically — if suite time becomes a problem, tighten the test's
  slide/format sampling rather than weakening what it proves.
- **Type-only families must earn their no-photo posture** in `FAMILY_SERVES`: they widen the
  recipe engine's pool for editions without a hero, which is most of them. Photo-capable families
  keep the credit frame on every outro in every format, and ship a fallback layers block that
  renders acceptably with no photograph.
- **Deterministic, always**: no `Date.now()`, no randomness; every varying choice comes off the
  recipe axes or the deck position. Byte-identical replay is the test.
- **The chip row must survive 20+ entries.** If it becomes a horizontal scroller, mark it
  `data-horizontal-scroll` or the containment e2e guard reads it as overflow (CLAUDE.md).
- **Docs are part of done**: a row and a specimen page per family under `docs/design-lab/`
  (README table + `families/<name>.html`), and a SPEC.md paragraph where the language is
  concerned. Run the descriptions through the stop-slop skill; consult `ui-ux-pro-max` for the
  style domain of each family before composing it.

## 4. Verification

```
pnpm -C studio build     # after every studio edit — consumers read dist/
pnpm -C studio test      # schema, checks, distinctness, hashes
pnpm test                # all workspaces
pnpm -C site typecheck && pnpm -C site test
pnpm -C site test:e2e    # operating-surfaces spec drives the Lab UI
```

Review the result the way the owner will: `/admin?venture=design-lab&tab=studio`, walk every new
chip across formats, treatments, scales and phases with a real delivered article; and
`pnpm proof:rooms` renders the fixture sets through live templates without a provider call.

## 5. Tasks

Work in order, one commit per task, phase-commit style. Tick the box in this file as each lands.

- [x] TPL-00 — Read §1; confirm the module split for new composers against the 400-line cap
- [x] TPL-01 — `billboard`
- [x] TPL-02 — `broadsheet`
- [x] TPL-03 — `zurich`
- [x] TPL-04 — `concrete`
- [x] TPL-05 — `terminal`
- [x] TPL-06 — `marginalia`
- [x] TPL-07 — `memo`
- [x] TPL-08 — `versus`
- [x] TPL-09 — `tally`
- [x] TPL-10 — `counterweight`
- [x] TPL-11 — `throughline`
- [x] TPL-12 — `quiet`
- [x] TPL-13 — `offset` (or a §2b reserve, with the reason recorded)
- [ ] TPL-14 — Chip row, recipe-pool posture, README/SPEC/specimen sweep, e2e adjustments
- [ ] TPL-15 — Full gates green; update `docs/NEEDED.md`; delete this file in the closing commit

Each family task is complete only when: composer + registration + chip + counts, the full studio
suite green, and its specimen page rendered from the committed code.

## 6. Sources

Canva 2026 Design Trends ("Imperfect by Design", businesswire.com/news/home/20251210696597);
creativebloq.com typography trends 2026; whaaat.ai Instagram carousel formats 2026;
morphica.studio LinkedIn carousel best practices 2026; versacreative.com social design trends
2026; fontfabric.com and designflea.com type trends 2026; envato Swiss-style guide;
simplified.com font trends; socialbee.com Instagram trends (Aug 2026); the repo's
`ui-ux-pro-max` database (Bold Typography poster, Editorial Grid and Bauhaus entries).
