# Design Lab — delivery folder

Ten template families for article decks, and the editor workspace the owner drives them from.
Committed to `docs/design/design-lab/`. An engineering agent builds from these files.

## Reading order

1. **`TOKENS.md`** — the type choices per brand, the weights each template actually names, the
   spacing scale, the contrast receipts, and the three things the engine still needs (E1–E3).
   Read this first: two of the ten families are blocked on nothing, and the rest are blocked on
   one field each.
2. **`SPEC.md`** — the ten families. Thesis, rhythm, variant axes, and the complete
   `carousel-template/1` JSON for every family in every format. **This is the binding artifact.**
   Where a specimen page and this file disagree, this file is right.
3. **`families/*.html`** — one specimen per family: cover, both body beats and the outro at true
   aspect ratio, in all four formats, in the MMA Files and DNESKAi palettes, plus the story
   canvas with its safe bands drawn, the no-photograph cover, and a measured type-size table.
   Open them in a browser; they are self-contained and make no network requests.
4. **`editor.html`** and **`editor-states.html`** — the workspace. *Not in this delivery; they
   are the next one.*

## The ten families

| # | Family | Serves | Status | Thesis |
|---|---|---|---|---|
| 01 | [`masthead`](families/masthead.html) | photo-forward | ships today | A front page |
| 02 | [`gutter`](families/gutter.html) | photo-forward | ships today | A hard vertical split that changes sides as the reader swipes |
| 03 | [`bevel`](families/bevel.html) | photo-forward | v2 | The photograph is cut on a slope, and the slope keeps cutting |
| 04 | [`porthole`](families/porthole.html) | photo-forward, quote-capable | v2 | One circular window on the cover, and the same window travelling the deck as an empty accent |
| 05 | [`slab`](families/slab.html) | type-only | ships today | A type poster |
| 06 | [`terrace`](families/terrace.html) | type-only | ships today | Three offset bands step across the frame and the type sits in the space they leave; no photo |
| 07 | [`figure`](families/figure.html) | type-only, number-led | ships today | One number is the image. The figure fills the top of the cover, then returns as a small chip |
| 08 | [`pull`](families/pull.html) | quote-capable, photo-forward | v2 | Something a named person said, set at the size it was said with |
| 09 | [`tower`](families/tower.html) | story-first, photo-forward | ships today | Built for 9 |
| 10 | [`dossier`](families/dossier.html) | quiet, record-keeping | ships today | A record, not a poster |

Coverage the brief asked for: photo-forward — masthead, gutter, bevel, porthole, pull.
Type-only, which is to say families that never need a photograph — slab, terrace, figure.
Number-led — figure. Quote-capable — pull, porthole. Hardest in 9:16 — tower. Quiet and
record-keeping — dossier.

## How the specimens were made

The layer objects in `SPEC.md` and the canvases in `families/*.html` are the same data. Each
specimen renders those objects through a port of `studio/src/renderer.ts` (frames, scrims, mesh
blobs, logo sizing) and `studio/src/text.ts` (`fitText`, unchanged, including its 0.56 em advance
and 1.12 line height), then measures every slot against the four length bands and prints the
answer. Safe area, overflow and contrast are checked with ports of `studio/src/validation.ts`
before anything is written, across all four formats and all five palettes. A family that fails
does not get a page.

What that buys: a reviewer comparing a specimen to the engine's PNG should see the same
composition, the same line breaks and the same type size. What it does not buy: the typeface.
The specimens render in a system stack because they carry no webfonts, and the render server
currently has no fonts at all — see `TOKENS.md`.

## Rules the set holds itself to

- Nothing is invented to fill a frame. A short article renders a short deck; a passage that runs
  long grows down into space the frame already had.
- Every family renders acceptably with no photograph, and each says what replaces it. None of
  the answers is a stock image, and none is a face.
- The photo credit has a frame on every outro, in every family, in every format. A composition
  with nowhere to print it would be invalid, and none of these is.
- No invented statistics, no fake interface elements, no fabricated quotes, no engagement
  ornament. The one family built around a number, Figure, says in its own spec that the slot
  takes an honest figure from the article or the family is not used.
