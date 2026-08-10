# TOKENS — type, spacing, and what the engine still needs

## Type

One headline face and one body face per brand; mono is shared, as the brief allows. Every family
is openly licensed (SIL OFL 1.1) and carries Latin Extended-A, so ř, ě, ů, ň, ť and ď are real
glyphs and not composed accents.

| Brand | Headline | Weights | Body | Weights | Mono | Weights |
|---|---|---|---|---|---|---|
| **DNESKAi** `caught-up` | Archivo | 600 · 700 · 800 · 900 | IBM Plex Sans | 400 | IBM Plex Mono | 400 |
| **MMA Files** `mma-files` | Anton | 400 | Archivo | 600 · 700 · 800 · 900 | IBM Plex Mono | 400 |
| **Titty Tuesdays** `titty-tuesdays` | Petrona | 600 · 700 · 800 · 900 | Karla | 400 | IBM Plex Mono | 400 |
| **devShark** `devshark` | Figtree | 600 · 700 · 800 · 900 | Public Sans | 400 | IBM Plex Mono | 400 |
| **geoShark** `geoshark` | Outfit | 600 · 700 · 800 · 900 | Public Sans | 400 | IBM Plex Mono | 400 |

**DNESKAi — Archivo + IBM Plex Sans.** A grotesque with a wide, flat-sided lowercase that holds up at 44 px and at 160 px. Czech diacritics sit tight to the x-height rather than floating, which matters on a five-line headline.

**MMA Files — Anton + Archivo.** The owner amendment keeps the same compact poster face as the public magazine. Anton has one real weight; hierarchy comes from scale, and requested heavier weights resolve to the committed 400 face without synthetic bold.

**Titty Tuesdays — Petrona + Karla.** Warmth without prettiness: a text serif with a slight flare, set against a grotesque body. Petrona carries a full Czech set including ů and ř at every weight.

**devShark — Figtree + Public Sans.** Geometric clarity that still has a 900. Space Grotesk was the obvious pick and was rejected: it stops at 700, and Figure and Slab both set 800–900.

**geoShark — Outfit + Public Sans.** The same geometric register as devShark, distinguished by a rounder, more circular o — the two sharks share a body face and part company at the headline.

### Weights this set actually uses

Across the set, templates request **headline 600, 700, 800, 900**, **body 400**, and **mono
400**. Anton is the deliberate exception: it ships only at 400 and the resolver maps every MMA
Files headline request to that real face. The `logo` layer still asks for 800, but the font map
prevents synthetic weight from entering the deterministic render.

### Files the repository has to carry

Thirty-one static font files:

- Anton regular for MMA Files — 1 file
- Archivo, Petrona, Figtree and Outfit headline families — 16 files
- The retained generic Barlow family fixtures — 6 files
- IBM Plex Sans, Karla and Public Sans body faces — 6 files
- IBM Plex Mono regular and bold — 2 files

**Static instances, not variable fonts.** The renderer hands `font-family` and a numeric
`font-weight` to librsvg through sharp, and librsvg resolves faces through fontconfig. Fontconfig
matches a static `Archivo-Bold.ttf` at weight 700 reliably; it interpolates a variable axis
inconsistently across versions, and the failure is silent — the wrong weight renders and the hash
still validates. Ship `.ttf` static instances, install them into the render image's font path, and
name them exactly as the `fonts` block in each brand's `carousel-brand/1` document does.

Until the files land, every brand renders in Arial and every specimen in this folder is a lie
about the type. The compositions are not: frames, sizes and line counts come from `fitText`,
which measures at a fixed 0.56 em advance and does not know what face it is measuring.

## Spacing

Frames are fractions of the canvas, so the scale is a set of steps rather than pixels. Vertical
positions inside the safe box use these and nothing else:

| Step | Value | Used for |
|---|---|---|
| hairline | 0.010 | rule to the edge it hangs from; band inset |
| tight | 0.020–0.030 | mono label to its rule; chip padding |
| gap | 0.045 | rule to the text it introduces |
| block | 0.070–0.090 | one text block to the next |
| band | 0.11–0.16 | major zone change (photo band to type block) |

Fixed frame heights, so the same element is the same size in every family:

| Element | Height | Notes |
|---|---|---|
| kicker | 0.028 | one line, mono, uppercase, `tracking` 0.14 |
| logo lockup | 0.026–0.030 × 0.22–0.26 wide | bottom-left at `B − 0.030` |
| credit | 0.058 | two lines, mono, `muted` |
| sources | 0.036 | one line, mono, `muted` |
| accent rule | `thickness` 6–10 | 4 on hairlines, 2 on Dossier's |

**Body passages start 0.14–0.26 of the safe height in, never at the top.** The engine top-anchors
text and has no vertical centring, so a 24-character passage in a frame sized for 240 characters
leaves the bottom two-thirds empty. Starting the frame lower puts a short passage near the optical
centre and lets a long one grow down into space that exists. This is the single most load-bearing
rule in the set; ignore it and every body slide reads as a mistake.

## Colour

No new colour tokens. The seven per brand are enough, and adding an eighth would mean five more
values to keep honest for two brands that do not publish yet.

### Contrast receipts

Every text and logo pair used anywhere in the library, at its worst across the five palettes. The
engine refuses below 4.5:1, and it refuses on the *rendering*, not the token pair: a variant may
swap the accent for the secondary and invert the ground, so a pair that clears the floor in A and
not in B is a template that fails.

| Foreground | Ground | Worst | In | Best |
|---|---|---|---|---|
| `accent` | `background` | 6.17:1 | mma-files | 8.21:1 |
| `foreground` | `background` | 15.86:1 | devshark | 18.36:1 |
| `muted` | `background` | 8.50:1 | devshark | 13.58:1 |
| `foreground` | `surface` | 14.77:1 | devshark | 16.61:1 |
| `muted` | `surface` | 7.92:1 | devshark | 12.29:1 |
| `background` | `accent` | 6.17:1 | mma-files | 8.21:1 |
| `accent` | `surface` | 5.49:1 | mma-files | 7.65:1 |
| `accent` | `surface-strong` | 4.73:1 | mma-files | 7.01:1 |
| `secondary` | `background` | 6.36:1 | caught-up | 12.82:1 |
| `secondary` | `surface` | 5.66:1 | caught-up | 11.94:1 |
| `secondary` | `surface-strong` | 4.76:1 | caught-up | 10.94:1 |
| `background` | `secondary` | 6.36:1 | caught-up | 12.82:1 |
| `foreground` | `surface-strong` | 12.83:1 | mma-files | 14.02:1 |
| `muted` | `surface-strong` | 7.25:1 | devshark | 10.37:1 |

The four rows below `accent` on `surface` were added by the 2026-08-10 expansion, and the reason
they were needed is the reason to read this table as renderings rather than pairs. Variant B swaps
`accent` for `secondary`, so every accent pair has a secondary twin that ships just as often; and a
family that sets words on its own field — `versus`, `marginalia`, `concrete` — puts a ground token
behind the type that the founding ten never did.

## What the engine still needs

**E1 — the contrast check cannot see shapes.** `contrastCheck` measures a text layer against the
slide's `backgroundToken` plus any mesh over it. An opaque `shape` drawn beneath the text is
invisible to it, so `background`-coloured type on an `accent` panel — legible at 6.17:1 — is
refused as 1.00:1. Fix: walk the layer list, take the topmost `shape` whose frame contains the
text frame, and measure against its `fillToken`. Twelve lines. Until it lands, an inverted beat
has to invert the whole slide (as Slab does) rather than a panel.

**E2 — one image *slot*, not one image layer.** The schema counts `image` layers and rejects a
second. A photo reprise — the same photograph returning small on the outro — is one slot used
twice and is currently impossible. Fix: count distinct `layer.slot` values on image layers.
Masthead is the only family here that wants it, and it is marked `"reprise": true, "v2": true`.

**E3 — `tracking`, `clip`, `linear-gradient`.** The three v2 fields this set uses; each is
specified in `SPEC.md`. `tracking` is the one that changes everything: uppercase Czech mono at
20 px with no letter-spacing is a smear at thumbnail size, and it is on every family's kicker.

**E4 — the text fitter measures every string as if it were lowercase, and chops words silently.**
Two bugs in one function, and the second is the one the brief names. `fitText` computes characters
per line as `widthPx ÷ (fontSize × 0.56)`. That constant is about right for Czech sentence case
and about 22% short for all-caps, so an uppercase headline is measured as fitting and then drawn
wider than the canvas — SVG text does not wrap, so it simply runs off the edge. Then
`breakLongWord` chops any word longer than the line into fixed-size fragments, with no hyphen and
no signal, and the fitter treats a chopped word as a successful fit and stops stepping down. Put
together: `NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ` renders at full size as `NEJNEOBHOSPODAŘ` and
`ÁVATELNĚJŠÍ`, both overflowing.

Fix, in `studio/src/text.ts`:

1. Derive the advance from the string — `0.56 + 0.16 × (share of the letters that are uppercase)`.
   A per-face metrics table would be better still, but this needs no font loading and is right
   within a few percent for every face in the table above.
2. Compute the longest word once, and accept a candidate size only when `longestWord ≤ maximum`.
   Fall through to `minFontSize` as today, and return the chop as a flag so the review surfaces
   it the way truncation already is.

Nine lines. Every size in `SPEC.md` is measured against the fixed behaviour, and the brief's
requirement — that the stress word survive as a single word — is only satisfiable with it. Some
frames still cannot hold that word whole: Gutter's column caps the measure near 24 characters and
says so in its own spec. The difference is that after E4 it shrinks to its minimum and reports,
instead of chopping and staying silent.

**Not used, deliberately.** `glow` (reserved, as the brief says — it cannot read neutral, and
nothing here is a result or a final), `textPanel`, dashed rules, `backdropPhase` as a stored
number. Phase is expressed as a variant axis per family instead, so the packer walks a seed
without the schema growing a field.
