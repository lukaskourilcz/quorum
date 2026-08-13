# TOKENS — type, spacing, colour and validation

## Type

The engine serves nine brand skins. Every named face is committed as a static SIL OFL 1.1
`.ttf`; `studio/src/fonts.ts` resolves a requested weight to the nearest committed face in the
same family, and `studio/src/font-metrics.generated.ts` supplies its measured advances. Rendering
does not depend on a system-font fallback.

| Brand | Headline | Body | Mono |
|---|---|---|---|
| **Caught Up** `caught-up` | Archivo 600/700/800/900 | IBM Plex Sans 400/700 | IBM Plex Mono 400/700 |
| **MMA Files** `mma-files` | Anton 400 | Archivo 600/700/800/900 | IBM Plex Mono 400/700 |
| **Titty Tuesdays** `titty-tuesdays` | Petrona 600/700/800/900 | Karla 400/700 | IBM Plex Mono 400/700 |
| **devShark** `devshark` | Figtree 600/700/800/900 | Public Sans 400/700 | IBM Plex Mono 400/700 |
| **geoShark** `geoshark` | Outfit 600/700/800/900 | Public Sans 400/700 | IBM Plex Mono 400/700 |
| **Kvórum** `kvorum` | Barlow Condensed 600/700/800/900 | IBM Plex Sans 400/700 | IBM Plex Mono 400/700 |
| **BOOKSOFHISTORY** `booksofhistory` | Petrona 600/700/800/900 | Karla 400/700 | IBM Plex Mono 400/700 |
| **Door Money** `door-money` | Barlow Condensed 600/700/800/900 | Barlow 400/700 | IBM Plex Mono 400/700 |
| **Tehdejší svět** `tehdejsi-svet` | Literata 400/600/700 | Inter 400/600/700 | IBM Plex Mono 400/700 |

Archivo is Caught Up's wide grotesque. Anton preserves MMA Files' compact poster register and
has one real weight, so every requested headline weight resolves to its committed 400 face.
Petrona/Karla gives Titty Tuesdays warmth and BOOKSOFHISTORY its first-edition-card voice.
Figtree and Outfit distinguish the two shark verticals while sharing a Public Sans body.
Barlow Condensed gives Kvórum and Door Money dense display type; their body faces and palettes
keep the brands separate.

Tehdejší svět is the Cyrillic case. Literata and Inter each ship at three weights and the glyph
suite reads their font cmap tables to prove full Ukrainian coverage, including `Ї ї Є є Ґ ґ І і`,
as well as Czech diacritics. Its shared mono slot remains IBM Plex Mono because shared families
calibrate compact labels to a monospace measure. The venture also has a dedicated Ukrainian/Czech
family kit in `studio/src/families-tehdejsi.ts`.

### Committed font inventory

There are **37 static faces** across 13 families:

- Anton 1; Archivo 4; Barlow Condensed 4; Barlow 2
- Figtree 4; Outfit 4; Petrona 4
- IBM Plex Mono 2; IBM Plex Sans 2; Inter 3
- Karla 2; Literata 3; Public Sans 2

Static instances are deliberate. The renderer hands explicit files to the rasteriser and the
fitter measures the same committed face. `pnpm -C studio fonts:metrics` regenerates the width
table when a face changes; generated metrics are never edited by hand.

Templates may request weights from 300 to 900. The resolver chooses the closest committed
weight within the named family, preferring the heavier face on a tie. It never crosses into a
different family and throws when a family has no committed font.

## Spacing

Frames are fractions of the canvas, so the scale is a set of steps rather than pixels. Vertical
positions inside the safe box use these ranges:

| Step | Value | Used for |
|---|---|---|
| hairline | 0.010 | rule to the edge it hangs from; band inset |
| tight | 0.020–0.030 | mono label to its rule; chip padding |
| gap | 0.045 | rule to the text it introduces |
| block | 0.070–0.090 | one text block to the next |
| band | 0.11–0.16 | major zone change |

Common frame heights keep the same role at the same visual scale:

| Element | Height | Notes |
|---|---|---|
| kicker | 0.028 | one line, mono, uppercase, normally tracked |
| logo lockup | 0.026–0.030 × 0.22–0.26 wide | bottom-left inside the union safe area |
| credit | 0.058 | two lines, mono, `muted` |
| sources | 0.036 | one line, mono, `muted` |
| accent rule | `thickness` 6–10 | hairlines may use 2–4 |

Body passages start roughly 0.14–0.26 of the safe height in rather than being pinned to the top.
The fitter top-anchors text, so the lower start keeps a short passage optically centred while a
long one can grow into already reserved space.

## Colour

Every brand supplies the same seven semantic tokens: `background`, `surface`,
`surface-strong`, `foreground`, `muted`, `accent`, and `secondary`. A template composes against
those names and never invents a brand colour. Variant B may swap `accent` for `secondary`, so the
validator checks every declared rendering, not only variant A.

BOOKSOFHISTORY and Tehdejší svět are the two light skins. Their surface ladder moves from paper
toward darker stock while leaving every text token above the 4.5:1 floor. The other seven skins
use dark grounds.

### Validation receipt

The canonical receipt is executable rather than a hand-maintained ratio table:

- `studio/tests/families.test.ts` pins **23** families and validates every deck length the
  splitter can resolve, all **9** brands and all **4** formats.
- `validateTemplateForBrand` checks schema, safe area, contrast, brand-token binding, overflow
  and originality; `renderCarouselSvg` refuses a failing template.
- Contrast walks the actual layer order. It measures text/logo colour against the slide ground
  and the topmost containing shape, gradient or duotone image, plus composited mesh colours.
- Untreated photographs are the honest limit: their article pixels are not known at template
  validation time, so photo-bearing designs rely on the declared scrim.
- Overflow uses the resolved face's committed average advance and the layer's tracking. Runtime
  fitting measures every glyph, shrinks until whole words fit, and reports unavoidable breaking
  or contract clipping instead of hiding it.

## Shipped additive capabilities

The capabilities once described as future work are present in `carousel-template/1` with defaults
that preserve older stored documents:

- opaque `shape`, `linear-gradient` and duotone-image grounds participate in contrast checks;
- repeated image layers may reuse the single canonical `image` slot (`reprise` marks the later
  appearance), while a second distinct image slot is rejected;
- text `tracking`, image `clip`, and `linear-gradient` render deterministically;
- shapes may hug fitted text with `padText`; rules may be dashed;
- the fitter uses committed per-face metrics, respects tracking, keeps Czech and Ukrainian
  graphemes intact, and surfaces clipped/broken output.

`glow` exists in the schema and renderer but is reserved by design; the current family set does
not need it to pass. Recipe rhythm is recorded as `phaseSeed` in `carousel-recipe/1`, not as a
template-level backdrop field.
