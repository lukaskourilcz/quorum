# SPEC — the template language, and the founding ten families

The binding artifact **for the template language**: what a layer is, what each field means, what
the checks are, and the ten compositions the library was founded on.

## What this file is no longer the authority on

Written as a delivery for an engineering agent to build from, before the engine existed. The
engine exists, so three of its claims have to be read with that in mind, and are corrected here
rather than silently left standing:

- **A composition's authority is its composer.** `studio/src/families.ts` and the three sibling
  modules beside it are what renders. Where a description below and a composer disagree, the
  composer ships and this file is stale. `figure` is the standing example: it draws the reader's
  position as blocks, because a deck payload carries the article's sentences and no figures, and
  the alternative was a family that invented a statistic.
- **The specimen pages are generated, not ported.** `pnpm -C studio specimens` inlines the SVG
  `renderCarouselSvg` produced. A page cannot disagree with the engine because it *is* the
  engine's output — which is the opposite of the arrangement this file assumed.
- **The library is twenty-eight families, not ten.** The founding ten are specified below.
  Thirteen more landed on 2026-08-10 from that year's typography-led trends — `billboard`,
  `broadsheet`, `zurich`, `concrete`, `terminal`, `marginalia`, `memo`, `versus`, `tally`,
  `counterweight`, `throughline`, `quiet`, `offset` — and are specified by their composers and
  documented by their specimen pages. They introduced no schema field, no colour token, no font
  and no new check; they are compositions in the language this file defines, which is the strongest
  statement available that the language was enough. The five launch families of 2026-08-29 —
  `apex`, `rail`, `vista`, `fault`, `halo` — are the same kind of composition, and they are the
  only families `chooseFamily` deals unprompted; the rest of the library renders stored work.

The engine gaps this file originally wrote against are fixed. **E1**: `contrastCheck` now walks
the layer list and measures a text layer against the topmost opaque `shape`, gradient or duotone
image whose frame contains it, so an inverted panel is a legible design rather than a refused one
— half the expansion's families depend on it. **E4**: the fitter measures against committed
per-face advance widths and refuses a size at which the longest word would be chopped. **E2**
counts distinct image slots so a photograph may reprise later in the deck. **E3** renders
tracking, clipping and linear gradients. The size tables below were stated against the corrected
fitter and remain historical fixtures; the generated specimens are the current receipt.

## How the founding ten were specified to ship

`carousel-template/1` holds one `slides` array and one complete four-format canvas block. The
current composers deliberately place meaningful layers inside the union of the four safe areas,
so one generated family template is valid on square, portrait, story and Threads. A resolvable
template is named `deck-<family>-<slideCount>`; non-canonical type scale and phase axes are encoded
in the id and rebuilt on lookup rather than expanding the eager library into a lookup table.

The JSON documents below are the founding delivery's per-format design notation, not the objects
the current composer emits. Real decks contain 5–8 selected passages (older stored references up
to 10 still resolve), and `familyDeckTemplate` builds the cover, alternating/rotated body rhythm,
and outro for that exact count.

## Checks

All twenty-eight families pass, at every resolvable deck length, in all four formats and all nine
brand skins. Separate regression assertions prove that A/B, type scale 0.9/1/1.1 and phase seeds
0–3 materially change the rendering:

- **safe area** — every `text` and `logo` frame inside the format's safe box (`fitsSafeArea`)
- **overflow** — the resolved face's committed average advance plus tracking proves the declared
  character limit can fit at minimum size
- **contrast** — every text and logo colour ≥ 4.5:1 on every ground the rendering can place under it
- **frames** — every layer stays inside the canvas, no slide exceeds 24 layers, and there is at
  most one distinct optional image slot

Contrast reads what is actually behind the words: the slide's ground, any mesh over it, and the
topmost opaque `shape`, gradient or duotone image whose frame contains the text. Containment is
the operative word and it is a composition rule, not a technicality — a panel that only half
covers its passage is measured against the ground, so it passes the check while the reader sees
illegible type on colour. Every family that sets words on a field draws that field so it contains
the frame.

One limit is real and stated rather than papered over: an untreated photograph cannot be checked,
because its pixels are the article's and not the template's. A slide carrying one relies on the
scrim its image layer draws.

## Additive fields now shipped

| Field | Layer | What it does | Families |
|---|---|---|---|
| `tracking` (em) | `text` | Letter-spacing. The engine draws mono micro-labels untracked, and uppercase Czech mono at 20 px needs 0.10–0.14 em to survive thumbnail size. | all ten |
| `clip` | `image` | `"circle"`, or a polygon in frame fractions. | bevel, porthole, pull |
| `linear-gradient` | layer | Two token stops and an angle. Both stops at the same offset give a hard diagonal edge, which is how Bevel cuts a slope without a bitmap. | bevel |
| `reprise` | `image` | Marks a later `image` layer bound to the same single slot; validation counts slots rather than appearances. | masthead |

Anything marked `"v2": true` in the founding JSON is one of these additions. The current schema
accepts them directly with backward-compatible defaults where applicable.

## When there is no photograph

Every family says what replaces its `image` layer, and every family ships the replacement as
layer objects — a **Fallback layers** block under each family below, keyed by format and slide id.
The layers go in at the image layer's own index, so draw order is unchanged. None of the answers
is a stock image and none is a face; they are meshes, discs and ruled boxes built from the same
seven tokens. The three type-only families need no block, which is the point of having them.

## Photo treatments

`mono` and `duotone` are a variant axis, not a family — the earlier set turned a treatment into a
whole template and that is part of why five templates read as one design. Every family with an
`image` layer accepts `treatment: "none" | "mono" | "duotone"`, applied before embedding;
`duotone` multiplies the greyscale by `accent`. Families without an image layer ignore the axis.

---

## 01 · Masthead — `masthead`

**Thesis.** A front page: the licensed photograph runs full-bleed to a hard accent rule, and the headline sits in the type block beneath it, never on the picture.

**Do not use.** An article with no usable photograph — the rule then divides two empty halves. Use Slab or Terrace instead.

**Rhythm.** cover → open → slab → open → slab → outro. Two body beats alternate: an open column on the plain background, then a full-width slab of surface-strong with the passage set inside it. The reader feels the deck breathe in and out rather than scroll one wallpaper.

**Without a photograph.** The image layer is replaced by a two-blob mesh (accent at 0.22, secondary at 0.16, softness 0.14) filling the same band, and the accent rule stays. The composition is unchanged; only the field behind the rule is.

**Serves.** photo-forward · builds against the shipped schema

**Variant axes.** accent↔secondary · backdrop phase (rule thickness 6/10/14) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “open” · beat B “slab” · outro. Specimen: [`families/masthead.html`](families/masthead.html)

### Masthead · 4:5 — `masthead-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "masthead-portrait",
  "name": "Masthead · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "A front page: the licensed photograph runs full-bleed to a hard accent rule, and the headline sits in the type block beneath it, never on the picture.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.6,"fit":"cover","scrim":"bottom"},
        {"type":"rule","x":0,"y":0.6,"width":1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"kicker","x":0.06,"y":0.635,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.682,"width":0.88,"height":0.168,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":46,"maxFontSize":96,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.884,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-open",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.076,"width":0.88,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2836,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-slab",
      "backgroundToken": "surface",
      "layers": [
        {"type":"shape","x":0,"y":0.08,"width":1,"height":0.602,"fillToken":"surface-strong","radius":0},
        {"type":"rule","x":0,"y":0.08,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.2492,"width":0.88,"height":0.3956,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.22,"fit":"cover","scrim":"bottom","reprise":true,"v2":true},
        {"type":"rule","x":0,"y":0.22,"width":1,"height":0.004,"colorToken":"secondary","thickness":8},
        {"type":"text","slot":"outro","x":0.06,"y":0.29,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Masthead · 1:1 — `masthead-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "masthead-square",
  "name": "Masthead · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "A front page: the licensed photograph runs full-bleed to a hard accent rule, and the headline sits in the type block beneath it, never on the picture.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.56,"fit":"cover","scrim":"bottom"},
        {"type":"rule","x":0,"y":0.56,"width":1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"kicker","x":0.06,"y":0.595,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.642,"width":0.88,"height":0.208,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":46,"maxFontSize":96,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.884,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-open",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.076,"width":0.88,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2836,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-slab",
      "backgroundToken": "surface",
      "layers": [
        {"type":"shape","x":0,"y":0.08,"width":1,"height":0.602,"fillToken":"surface-strong","radius":0},
        {"type":"rule","x":0,"y":0.08,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.2492,"width":0.88,"height":0.3956,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.22,"fit":"cover","scrim":"bottom","reprise":true,"v2":true},
        {"type":"rule","x":0,"y":0.22,"width":1,"height":0.004,"colorToken":"secondary","thickness":8},
        {"type":"text","slot":"outro","x":0.06,"y":0.29,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Masthead · 9:16 — `masthead-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "masthead-story",
  "name": "Masthead · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "A front page: the licensed photograph runs full-bleed to a hard accent rule, and the headline sits in the type block beneath it, never on the picture.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.52,"fit":"cover","scrim":"bottom"},
        {"type":"rule","x":0,"y":0.52,"width":1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"kicker","x":0.07,"y":0.555,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.602,"width":0.86,"height":0.168,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":46,"maxFontSize":96,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.804,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-open",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.156,"width":0.86,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.322,"width":0.86,"height":0.42,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-slab",
      "backgroundToken": "surface",
      "layers": [
        {"type":"shape","x":0,"y":0.16,"width":1,"height":0.49,"fillToken":"surface-strong","radius":0},
        {"type":"rule","x":0,"y":0.16,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.294,"width":0.86,"height":0.322,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.3,"fit":"cover","scrim":"bottom","reprise":true,"v2":true},
        {"type":"rule","x":0,"y":0.3,"width":1,"height":0.004,"colorToken":"secondary","thickness":8},
        {"type":"text","slot":"outro","x":0.07,"y":0.37,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Masthead · Threads — `masthead-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "masthead-threads",
  "name": "Masthead · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "A front page: the licensed photograph runs full-bleed to a hard accent rule, and the headline sits in the type block beneath it, never on the picture.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.56,"fit":"cover","scrim":"bottom"},
        {"type":"rule","x":0,"y":0.56,"width":1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"kicker","x":0.07,"y":0.595,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.642,"width":0.86,"height":0.198,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":46,"maxFontSize":96,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.874,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-open",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.086,"width":0.86,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.2884,"width":0.86,"height":0.504,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-slab",
      "backgroundToken": "surface",
      "layers": [
        {"type":"shape","x":0,"y":0.09,"width":1,"height":0.588,"fillToken":"surface-strong","radius":0},
        {"type":"rule","x":0,"y":0.09,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.2548,"width":0.86,"height":0.3864,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.22,"fit":"cover","scrim":"bottom","reprise":true,"v2":true},
        {"type":"rule","x":0,"y":0.22,"width":1,"height":0.004,"colorToken":"secondary","thickness":8},
        {"type":"text","slot":"outro","x":0.07,"y":0.29,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The image layer is replaced by a two-blob mesh (accent at 0.22, secondary at 0.16, softness 0.14) filling the same band, and the accent rule stays. The composition is unchanged; only the field behind the rule is. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.6,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ],
    "slide-outro": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.22,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.56,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ],
    "slide-outro": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.22,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.52,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ],
    "slide-outro": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.3,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.56,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ],
    "slide-outro": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.22,"blobs":[{"colorToken":"accent","cx":0.28,"cy":0.34,"radius":0.55,"opacity":0.22},{"colorToken":"secondary","cx":0.8,"cy":0.7,"radius":0.5,"opacity":0.16}],"softness":0.14}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 46–96 | 5 | 148 | 96px / 2L | 50px / 4L | 46px / 5L ✂ | 47px / 1L |
| slide-body-open | `passage-a` | 34–72 | 6 | 200 | 72px / 2L | 72px / 5L | 48px / 6L ✂ | 47px / 1L |
| slide-body-slab | `passage-b` | 30–56 | 7 | 240 | 56px / 1L | 56px / 4L | 52px / 7L | 47px / 1L |
| slide-outro | `outro` | 34–64 | 4 | 120 | 64px / 1L | 64px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 02 · Gutter — `gutter`

**Thesis.** A hard vertical split that changes sides as the reader swipes: photograph in one column, a stable measure of type in the other.

**Do not use.** A headline that must be read at poster size, and any deck whose subject is a long Czech compound — the column caps the measure near 24 characters, so “NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ” breaks across two lines even at the minimum size. Slab holds it whole; Gutter does not.

**Rhythm.** cover → left → right → left → right → outro. The accent column jumps side to side each body slide, so two adjacent slides are mirror images rather than repeats. In 9:16 the split turns horizontal (photo band on top) because a 40% column cannot hold a Czech compound.

**Without a photograph.** The photo column becomes a solid surface-strong column carrying a two-blob mesh of accent and secondary at low opacity. The split, and therefore the family, survives intact.

**Serves.** photo-forward · builds against the shipped schema

**Variant axes.** accent↔secondary · backdrop phase (column width 0.24 / 0.28 / 0.32) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “text left” · beat B “text right” · outro. Specimen: [`families/gutter.html`](families/gutter.html)

### Gutter · 4:5 — `gutter-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "gutter-portrait",
  "name": "Gutter · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "A hard vertical split that changes sides as the reader swipes: photograph in one column, a stable measure of type in the other.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":0.46,"height":1,"fit":"cover","scrim":"none"},
        {"type":"shape","x":0.46,"y":0,"width":0.54,"height":1,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.51,"y":0.08,"width":0.43,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.51,"y":0.135,"width":0.43,"height":0.7,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":72,"maxChars":138,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.51,"y":0.888,"width":0.24,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-left",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.72,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.72,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.06,"y":0.076,"width":0.62,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2664,"width":0.6,"height":0.4988,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-right",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.274,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.32,"y":0.076,"width":0.62,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.32,"y":0.2664,"width":0.62,"height":0.4988,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.32,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.62,"width":1,"height":0.38,"fillToken":"surface","radius":0},
        {"type":"rule","x":0,"y":0.62,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"outro","x":0.06,"y":0.11,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":36,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.7,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.768,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.83,"width":0.26,"height":0.03,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Gutter · 1:1 — `gutter-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "gutter-square",
  "name": "Gutter · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "A hard vertical split that changes sides as the reader swipes: photograph in one column, a stable measure of type in the other.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":0.46,"height":1,"fit":"cover","scrim":"none"},
        {"type":"shape","x":0.46,"y":0,"width":0.54,"height":1,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.51,"y":0.08,"width":0.43,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.51,"y":0.135,"width":0.43,"height":0.7,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":72,"maxChars":138,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.51,"y":0.888,"width":0.24,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-left",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.72,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.72,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.06,"y":0.076,"width":0.62,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2664,"width":0.6,"height":0.4988,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-right",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.274,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.32,"y":0.076,"width":0.62,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.32,"y":0.2664,"width":0.62,"height":0.4988,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.32,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.62,"width":1,"height":0.38,"fillToken":"surface","radius":0},
        {"type":"rule","x":0,"y":0.62,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"outro","x":0.06,"y":0.11,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":36,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.7,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.768,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.83,"width":0.26,"height":0.03,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Gutter · 9:16 — `gutter-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "gutter-story",
  "name": "Gutter · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "A hard vertical split that changes sides as the reader swipes: photograph in one column, a stable measure of type in the other.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.44,"fit":"cover","scrim":"none"},
        {"type":"shape","x":0,"y":0.44,"width":1,"height":0.56,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.5,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.555,"width":0.86,"height":0.225,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":72,"maxChars":138,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-left",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.72,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.72,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.07,"y":0.156,"width":0.61,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.308,"width":0.59,"height":0.406,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-right",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.274,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.32,"y":0.156,"width":0.61,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.32,"y":0.308,"width":0.61,"height":0.406,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.32,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.54,"width":1,"height":0.46,"fillToken":"surface","radius":0},
        {"type":"rule","x":0,"y":0.54,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"outro","x":0.07,"y":0.19,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":36,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.62,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.688,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.75,"width":0.26,"height":0.03,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Gutter · Threads — `gutter-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "gutter-threads",
  "name": "Gutter · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "A hard vertical split that changes sides as the reader swipes: photograph in one column, a stable measure of type in the other.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":0.46,"height":1,"fit":"cover","scrim":"none"},
        {"type":"shape","x":0.46,"y":0,"width":0.54,"height":1,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.51,"y":0.09,"width":0.42,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.51,"y":0.145,"width":0.42,"height":0.68,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":72,"maxChars":138,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.51,"y":0.878,"width":0.24,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-left",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.72,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.72,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.07,"y":0.086,"width":0.61,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.2716,"width":0.59,"height":0.4872,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-right",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":0.28,"height":1,"fillToken":"surface","radius":0},
        {"type":"shape","x":0.274,"y":0,"width":0.006,"height":1,"fillToken":"accent","radius":0},
        {"type":"rule","x":0.32,"y":0.086,"width":0.61,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.32,"y":0.2716,"width":0.61,"height":0.4872,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.32,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.61,"width":1,"height":0.39,"fillToken":"surface","radius":0},
        {"type":"rule","x":0,"y":0.61,"width":1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"outro","x":0.07,"y":0.12,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":36,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.69,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.758,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.82,"width":0.26,"height":0.03,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The photo column becomes a solid surface-strong column carrying a two-blob mesh of accent and secondary at low opacity. The split, and therefore the family, survives intact. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"shape","x":0,"y":0,"width":0.46,"height":1,"fillToken":"surface-strong","radius":0},
        {"type":"mesh","x":0,"y":0,"width":0.46,"height":1,"blobs":[{"colorToken":"accent","cx":0.35,"cy":0.28,"radius":0.6,"opacity":0.2},{"colorToken":"secondary","cx":0.7,"cy":0.78,"radius":0.55,"opacity":0.14}],"softness":0.16}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"shape","x":0,"y":0,"width":0.46,"height":1,"fillToken":"surface-strong","radius":0},
        {"type":"mesh","x":0,"y":0,"width":0.46,"height":1,"blobs":[{"colorToken":"accent","cx":0.35,"cy":0.28,"radius":0.6,"opacity":0.2},{"colorToken":"secondary","cx":0.7,"cy":0.78,"radius":0.55,"opacity":0.14}],"softness":0.16}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"shape","x":0,"y":0,"width":1,"height":0.44,"fillToken":"surface-strong","radius":0},
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.44,"blobs":[{"colorToken":"accent","cx":0.35,"cy":0.28,"radius":0.6,"opacity":0.2},{"colorToken":"secondary","cx":0.7,"cy":0.78,"radius":0.55,"opacity":0.14}],"softness":0.16}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"shape","x":0,"y":0,"width":0.46,"height":1,"fillToken":"surface-strong","radius":0},
        {"type":"mesh","x":0,"y":0,"width":0.46,"height":1,"blobs":[{"colorToken":"accent","cx":0.35,"cy":0.28,"radius":0.6,"opacity":0.2},{"colorToken":"secondary","cx":0.7,"cy":0.78,"radius":0.55,"opacity":0.14}],"softness":0.16}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 20px / 1L ✂ | 20px / 1L ✂ | 20px / 1L ✂ |
| slide-cover | `headline` | 40–72 | 7 | 138 | 72px / 3L | 51px / 7L | 40px / 7L ✂ | 40px / 2L |
| slide-body-left | `passage-a` | 30–56 | 8 | 240 | 56px / 2L | 56px / 6L | 39px / 8L | 32px / 1L |
| slide-body-right | `passage-b` | 30–56 | 8 | 240 | 56px / 2L | 56px / 5L | 41px / 8L | 33px / 1L |
| slide-outro | `outro` | 36–68 | 4 | 120 | 68px / 1L | 65px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 03 · Bevel — `bevel`

**Thesis.** The photograph is cut on a slope, and the slope keeps cutting: every body slide is a hard diagonal edge between surface and background, tilting the other way each beat.

**Do not use.** A record or a result you want to read as neutral — the diagonal is movement, and movement reads as opinion.

**Rhythm.** cover → wedge down → wedge up → wedge down → outro. The cut angle flips 168°/12° between beats, so the deck reads as one continuous cut travelling down the carousel.

**Without a photograph.** The cut stays: the photo band is filled by the same hard-edge gradient in surface-strong → background at the cover's own angle, with an accent mesh blob under the slope's high corner.

**Serves.** photo-forward · uses shipped clipping/gradient fields

**Variant axes.** accent↔secondary · backdrop phase (cut depth 0.74 / 0.82 / 0.90) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “wedge down” · beat B “wedge up” · outro. Specimen: [`families/bevel.html`](families/bevel.html)

### Bevel · 4:5 — `bevel-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "bevel-portrait",
  "name": "Bevel · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "The photograph is cut on a slope, and the slope keeps cutting: every body slide is a hard diagonal edge between surface and background, tilting the other way each beat.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.64,"fit":"cover","scrim":"bottom","clip":[[0,0],[1,0],[1,0.82],[0,1]],"v2":true},
        {"type":"text","slot":"kicker","x":0.06,"y":0.65,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.698,"width":0.88,"height":0.154,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":84,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.14,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-down",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.36,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.3,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-up",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":12,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.09,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.8,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.3},{"colorToken":"background","offset":0.3}]},
        {"type":"text","slot":"outro","x":0.06,"y":0.1,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.72,"width":0.14,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Bevel · 1:1 — `bevel-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "bevel-square",
  "name": "Bevel · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "The photograph is cut on a slope, and the slope keeps cutting: every body slide is a hard diagonal edge between surface and background, tilting the other way each beat.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.64,"fit":"cover","scrim":"bottom","clip":[[0,0],[1,0],[1,0.82],[0,1]],"v2":true},
        {"type":"text","slot":"kicker","x":0.06,"y":0.65,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.698,"width":0.88,"height":0.154,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":84,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.14,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-down",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.36,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.3,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-up",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":12,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.09,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.8,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.3},{"colorToken":"background","offset":0.3}]},
        {"type":"text","slot":"outro","x":0.06,"y":0.1,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.72,"width":0.14,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Bevel · 9:16 — `bevel-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "bevel-story",
  "name": "Bevel · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "The photograph is cut on a slope, and the slope keeps cutting: every body slide is a hard diagonal edge between surface and background, tilting the other way each beat.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.58,"fit":"cover","scrim":"bottom","clip":[[0,0],[1,0],[1,0.82],[0,1]],"v2":true},
        {"type":"text","slot":"kicker","x":0.07,"y":0.59,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.638,"width":0.86,"height":0.134,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":84,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.788,"width":0.14,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-down",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.44,"width":0.86,"height":0.336,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.38,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-up",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":12,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.17,"width":0.86,"height":0.336,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.72,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.3},{"colorToken":"background","offset":0.3}]},
        {"type":"text","slot":"outro","x":0.07,"y":0.18,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.64,"width":0.14,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Bevel · Threads — `bevel-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "bevel-threads",
  "name": "Bevel · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "The photograph is cut on a slope, and the slope keeps cutting: every body slide is a hard diagonal edge between surface and background, tilting the other way each beat.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":0.64,"fit":"cover","scrim":"bottom","clip":[[0,0],[1,0],[1,0.82],[0,1]],"v2":true},
        {"type":"text","slot":"kicker","x":0.07,"y":0.65,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.698,"width":0.86,"height":0.144,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":84,"maxChars":148,"maxLines":5,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.858,"width":0.14,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.878,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-down",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.37,"width":0.86,"height":0.4032,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.31,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-up",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":12,"stops":[{"colorToken":"surface-strong","offset":0.42},{"colorToken":"background","offset":0.42}]},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.1,"width":0.86,"height":0.4032,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.79,"width":0.1,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":1,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.3},{"colorToken":"background","offset":0.3}]},
        {"type":"text","slot":"outro","x":0.07,"y":0.11,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.71,"width":0.14,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The cut stays: the photo band is filled by the same hard-edge gradient in surface-strong → background at the cover's own angle, with an accent mesh blob under the slope's high corner. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":0.64,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.62},{"colorToken":"background","offset":0.62}]},
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.64,"blobs":[{"colorToken":"accent","cx":0.24,"cy":0.3,"radius":0.48,"opacity":0.22},{"colorToken":"secondary","cx":0.62,"cy":0.2,"radius":0.4,"opacity":0.14}],"softness":0.16}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":0.64,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.62},{"colorToken":"background","offset":0.62}]},
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.64,"blobs":[{"colorToken":"accent","cx":0.24,"cy":0.3,"radius":0.48,"opacity":0.22},{"colorToken":"secondary","cx":0.62,"cy":0.2,"radius":0.4,"opacity":0.14}],"softness":0.16}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":0.58,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.62},{"colorToken":"background","offset":0.62}]},
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.58,"blobs":[{"colorToken":"accent","cx":0.24,"cy":0.3,"radius":0.48,"opacity":0.22},{"colorToken":"secondary","cx":0.62,"cy":0.2,"radius":0.4,"opacity":0.14}],"softness":0.16}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"linear-gradient","v2":true,"x":0,"y":0,"width":1,"height":0.64,"angle":168,"stops":[{"colorToken":"surface-strong","offset":0.62},{"colorToken":"background","offset":0.62}]},
        {"type":"mesh","x":0,"y":0,"width":1,"height":0.64,"blobs":[{"colorToken":"accent","cx":0.24,"cy":0.3,"radius":0.48,"opacity":0.22},{"colorToken":"secondary","cx":0.62,"cy":0.2,"radius":0.4,"opacity":0.14}],"softness":0.16}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 40–84 | 5 | 148 | 84px / 2L | 48px / 3L | 44px / 4L ✂ | 47px / 1L |
| slide-body-down | `passage-a` | 32–64 | 6 | 220 | 64px / 1L | 64px / 4L | 46px / 6L | 47px / 1L |
| slide-body-up | `passage-b` | 32–64 | 6 | 220 | 64px / 1L | 64px / 4L | 46px / 6L | 47px / 1L |
| slide-outro | `outro` | 34–64 | 4 | 120 | 64px / 1L | 64px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 04 · Porthole — `porthole`

**Thesis.** One circular window on the cover, and the same window travelling the deck as an empty accent ring — the photograph becomes a shape the reader keeps recognising.

**Do not use.** A wide scene. A circle crops landscape to its middle third; use Masthead when the picture is the story.

**Rhythm.** cover (filled porthole) → ring top-left → ring bottom-right → ring top-left → outro (ring around the wordmark). The ring is the same diameter throughout; only its position walks, which is what makes the swipe feel like one object moving.

**Without a photograph.** The porthole is drawn as a filled surface-strong disc inside the accent ring that is already there. Empty and deliberate rather than a missing-image hole.

**Serves.** photo-forward · quote-capable · uses shipped clipping fields

**Variant axes.** accent↔secondary · backdrop phase (ring walk 3 positions) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “ring top-left” · beat B “ring bottom-right” · outro. Specimen: [`families/porthole.html`](families/porthole.html)

### Porthole · 4:5 — `porthole-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "porthole-portrait",
  "name": "Porthole · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "One circular window on the cover, and the same window travelling the deck as an empty accent ring — the photograph becomes a shape the reader keeps recognising.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.21,"y":0.1,"width":0.58,"height":0.464,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.222,"y":0.1096,"width":0.556,"height":0.4448,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.06,"y":0.609,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"middle","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.659,"width":0.88,"height":0.199,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":38,"maxFontSize":72,"maxChars":148,"maxLines":5,"align":"middle","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.88,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-tl",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.2,"height":0.16,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.072,"y":0.0796,"width":0.176,"height":0.1408,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.35,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-br",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.74,"y":0.75,"width":0.2,"height":0.16,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.752,"y":0.7596,"width":0.176,"height":0.1408,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.1804,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.4,"y":0.08,"width":0.2,"height":0.16,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.412,"y":0.0896,"width":0.176,"height":0.1408,"fillToken":"background","radius":0.5},
        {"type":"logo","x":0.43,"y":0.146,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"headline"},
        {"type":"text","slot":"outro","x":0.06,"y":0.31,"width":0.88,"height":0.22,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":60,"maxChars":120,"maxLines":4,"align":"middle","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.785,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"middle","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.852,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"middle","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Porthole · 1:1 — `porthole-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "porthole-square",
  "name": "Porthole · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "One circular window on the cover, and the same window travelling the deck as an empty accent ring — the photograph becomes a shape the reader keeps recognising.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.21,"y":0.1,"width":0.58,"height":0.58,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.222,"y":0.112,"width":0.556,"height":0.556,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.06,"y":0.725,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"middle","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.775,"width":0.88,"height":0.083,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":38,"maxFontSize":72,"maxChars":148,"maxLines":5,"align":"middle","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.88,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-tl",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.072,"y":0.082,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.39,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-br",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.74,"y":0.71,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.752,"y":0.722,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.1804,"width":0.88,"height":0.4128,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.4,"y":0.08,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.412,"y":0.092,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"logo","x":0.43,"y":0.166,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"headline"},
        {"type":"text","slot":"outro","x":0.06,"y":0.35,"width":0.88,"height":0.22,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":60,"maxChars":120,"maxLines":4,"align":"middle","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.785,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"middle","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.852,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"middle","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Porthole · 9:16 — `porthole-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "porthole-story",
  "name": "Porthole · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "One circular window on the cover, and the same window travelling the deck as an empty accent ring — the photograph becomes a shape the reader keeps recognising.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.19,"y":0.17,"width":0.62,"height":0.3488,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.202,"y":0.1768,"width":0.596,"height":0.3353,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.07,"y":0.5638,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"middle","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.6138,"width":0.86,"height":0.1642,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":38,"maxFontSize":72,"maxChars":148,"maxLines":5,"align":"middle","uppercase":false},
        {"type":"logo","x":0.07,"y":0.808,"width":0.86,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-tl",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.22,"height":0.1238,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.082,"y":0.1568,"width":0.196,"height":0.1103,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.3938,"width":0.86,"height":0.336,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-br",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.71,"y":0.7062,"width":0.22,"height":0.1238,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.722,"y":0.713,"width":0.196,"height":0.1103,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.238,"width":0.86,"height":0.336,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.39,"y":0.16,"width":0.22,"height":0.1238,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.402,"y":0.1668,"width":0.196,"height":0.1103,"fillToken":"background","radius":0.5},
        {"type":"logo","x":0.42,"y":0.2079,"width":0.16,"height":0.026,"colorToken":"accent","fontToken":"headline"},
        {"type":"text","slot":"outro","x":0.07,"y":0.3538,"width":0.86,"height":0.22,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":60,"maxChars":120,"maxLines":4,"align":"middle","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.705,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"middle","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.772,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"middle","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Porthole · Threads — `porthole-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "porthole-threads",
  "name": "Porthole · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "One circular window on the cover, and the same window travelling the deck as an empty accent ring — the photograph becomes a shape the reader keeps recognising.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.21,"y":0.1,"width":0.58,"height":0.58,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.222,"y":0.112,"width":0.556,"height":0.556,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.07,"y":0.725,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"middle","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.775,"width":0.86,"height":0.073,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":38,"maxFontSize":72,"maxChars":148,"maxLines":5,"align":"middle","uppercase":false},
        {"type":"logo","x":0.07,"y":0.878,"width":0.86,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-tl",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.082,"y":0.092,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.4,"width":0.86,"height":0.4032,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-br",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.73,"y":0.7,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.742,"y":0.712,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.1876,"width":0.86,"height":0.4032,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":60,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.4,"y":0.09,"width":0.2,"height":0.2,"fillToken":"accent","radius":0.5},
        {"type":"shape","x":0.412,"y":0.102,"width":0.176,"height":0.176,"fillToken":"background","radius":0.5},
        {"type":"logo","x":0.43,"y":0.176,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"headline"},
        {"type":"text","slot":"outro","x":0.07,"y":0.36,"width":0.86,"height":0.22,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":60,"maxChars":120,"maxLines":4,"align":"middle","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.775,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"middle","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.842,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"middle","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The porthole is drawn as a filled surface-strong disc inside the accent ring that is already there. Empty and deliberate rather than a missing-image hole. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"shape","x":0.222,"y":0.1096,"width":0.556,"height":0.4448,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"shape","x":0.222,"y":0.112,"width":0.556,"height":0.556,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"shape","x":0.202,"y":0.1768,"width":0.596,"height":0.3353,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"shape","x":0.222,"y":0.112,"width":0.556,"height":0.556,"fillToken":"surface-strong","radius":0.5}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 38–72 | 5 | 148 | 72px / 2L | 59px / 4L | 47px / 5L ✂ | 47px / 1L |
| slide-body-tl | `passage-a` | 32–60 | 6 | 220 | 60px / 1L | 60px / 4L | 46px / 6L | 47px / 1L |
| slide-body-br | `passage-b` | 32–60 | 6 | 220 | 60px / 1L | 60px / 4L | 46px / 6L | 47px / 1L |
| slide-outro | `outro` | 32–60 | 4 | 120 | 60px / 1L | 60px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 05 · Slab — `slab`

**Thesis.** A type poster: one sentence per slide at the largest size the frame allows, with every second slide inverted onto the accent.

**Do not use.** An article whose photograph is the news. Slab has no image slot at all.

**Rhythm.** cover (dark, flush-left) → inverted (accent ground, background-coloured type, flush-right) → dark → inverted → outro. The alternation is the whole design: the feed flashes light and dark as the reader swipes.

**Without a photograph.** Not applicable — Slab never carries a photograph, which is why it is the default for articles that arrive without one.

**Serves.** type-only · builds against the shipped schema

**Variant axes.** accent↔secondary (the inverted ground) · inverted beat on/off · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “inverted” · beat B “dark” · outro. Specimen: [`families/slab.html`](families/slab.html)

### Slab · 4:5 — `slab-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "slab-portrait",
  "name": "Slab · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "A type poster: one sentence per slide at the largest size the frame allows, with every second slide inverted onto the accent.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.066,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.06,"y":0.112,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"headline","x":0.06,"y":0.16,"width":0.88,"height":0.602,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":160,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-invert",
      "backgroundToken": "accent",
      "layers": [
        {"type":"text","slot":"passage-a","x":0.06,"y":0.08,"width":0.88,"height":0.6536,"colorToken":"background","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"end","uppercase":false},
        {"type":"rule","x":0.78,"y":0.868,"width":0.16,"height":0.005,"colorToken":"background","thickness":10},
        {"type":"logo","x":0.68,"y":0.888,"width":0.26,"height":0.028,"colorToken":"background","fontToken":"mono"}
      ],
      "variants": [{"id":"A"}, {"id":"B","backgroundToken":"secondary"}]
    },
    {
      "id": "slide-body-dark",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.08,"width":0.88,"height":0.6536,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"outro","x":0.06,"y":0.09,"width":0.88,"height":0.3612,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":36,"maxFontSize":92,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.72,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Slab · 1:1 — `slab-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "slab-square",
  "name": "Slab · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "A type poster: one sentence per slide at the largest size the frame allows, with every second slide inverted onto the accent.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.066,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.06,"y":0.112,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"headline","x":0.06,"y":0.16,"width":0.88,"height":0.602,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":160,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-invert",
      "backgroundToken": "accent",
      "layers": [
        {"type":"text","slot":"passage-a","x":0.06,"y":0.08,"width":0.88,"height":0.6536,"colorToken":"background","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"end","uppercase":false},
        {"type":"rule","x":0.78,"y":0.868,"width":0.16,"height":0.005,"colorToken":"background","thickness":10},
        {"type":"logo","x":0.68,"y":0.888,"width":0.26,"height":0.028,"colorToken":"background","fontToken":"mono"}
      ],
      "variants": [{"id":"A"}, {"id":"B","backgroundToken":"secondary"}]
    },
    {
      "id": "slide-body-dark",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.08,"width":0.88,"height":0.6536,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"outro","x":0.06,"y":0.09,"width":0.88,"height":0.3612,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":36,"maxFontSize":92,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.72,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Slab · 9:16 — `slab-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "slab-story",
  "name": "Slab · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "A type poster: one sentence per slide at the largest size the frame allows, with every second slide inverted onto the accent.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.146,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.07,"y":0.192,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"headline","x":0.07,"y":0.24,"width":0.86,"height":0.49,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":160,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-invert",
      "backgroundToken": "accent",
      "layers": [
        {"type":"text","slot":"passage-a","x":0.07,"y":0.16,"width":0.86,"height":0.532,"colorToken":"background","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"end","uppercase":false},
        {"type":"rule","x":0.77,"y":0.788,"width":0.16,"height":0.005,"colorToken":"background","thickness":10},
        {"type":"logo","x":0.67,"y":0.808,"width":0.26,"height":0.028,"colorToken":"background","fontToken":"mono"}
      ],
      "variants": [{"id":"A"}, {"id":"B","backgroundToken":"secondary"}]
    },
    {
      "id": "slide-body-dark",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.16,"width":0.86,"height":0.532,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.788,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"outro","x":0.07,"y":0.17,"width":0.86,"height":0.294,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":36,"maxFontSize":92,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.64,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Slab · Threads — `slab-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "slab-threads",
  "name": "Slab · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "A type poster: one sentence per slide at the largest size the frame allows, with every second slide inverted onto the accent.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.076,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.07,"y":0.122,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"headline","x":0.07,"y":0.17,"width":0.86,"height":0.588,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":160,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.878,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-invert",
      "backgroundToken": "accent",
      "layers": [
        {"type":"text","slot":"passage-a","x":0.07,"y":0.09,"width":0.86,"height":0.6384,"colorToken":"background","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"end","uppercase":false},
        {"type":"rule","x":0.77,"y":0.858,"width":0.16,"height":0.005,"colorToken":"background","thickness":10},
        {"type":"logo","x":0.67,"y":0.878,"width":0.26,"height":0.028,"colorToken":"background","fontToken":"mono"}
      ],
      "variants": [{"id":"A"}, {"id":"B","backgroundToken":"secondary"}]
    },
    {
      "id": "slide-body-dark",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.09,"width":0.86,"height":0.6384,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":40,"maxFontSize":120,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.858,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.878,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"outro","x":0.07,"y":0.1,"width":0.86,"height":0.3528,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":36,"maxFontSize":92,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.71,"width":0.16,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

None needed — Slab has no `image` layer in any format. Not applicable — Slab never carries a photograph, which is why it is the default for articles that arrive without one.

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 44–160 | 6 | 150 | 160px / 3L | 99px / 6L | 60px / 6L ✂ | 47px / 1L |
| slide-body-invert | `passage-a` | 40–120 | 6 | 200 | 120px / 2L | 99px / 6L | 48px / 6L ✂ | 47px / 1L |
| slide-body-dark | `passage-b` | 40–120 | 6 | 200 | 120px / 2L | 99px / 6L | 48px / 6L ✂ | 47px / 1L |
| slide-outro | `outro` | 36–92 | 4 | 120 | 92px / 2L | 65px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 06 · Terrace — `terrace`

**Thesis.** Three offset bands step across the frame and the type sits in the space they leave; no photograph is ever needed, and none is missed.

**Do not use.** A profile or anything where a face or a scene carries the meaning.

**Rhythm.** cover (bands top) → bands bottom → bands top, indented one step → bands bottom → outro (a single band). The indent walks with the backdrop phase, so slide five is not slide one.

**Without a photograph.** Not applicable — Terrace is one of the two families built for photograph-less articles.

**Serves.** type-only · builds against the shipped schema

**Variant axes.** accent↔secondary · backdrop phase (indent step 0.03 / 0.05 / 0.07) · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “bands low” · beat B “bands high, indented” · outro. Specimen: [`families/terrace.html`](families/terrace.html)

### Terrace · 4:5 — `terrace-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "terrace-portrait",
  "name": "Terrace · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "Three offset bands step across the frame and the type sits in the space they leave; no photograph is ever needed, and none is missed.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.11,"y":0.138,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.16,"y":0.206,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"kicker","x":0.06,"y":0.299,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.349,"width":0.88,"height":0.509,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":42,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.726,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.11,"y":0.794,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.16,"y":0.862,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2492,"width":0.88,"height":0.3868,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.01,"y":0.138,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.01,"y":0.206,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.314,"width":0.88,"height":0.566,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"text","slot":"outro","x":0.06,"y":0.163,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Terrace · 1:1 — `terrace-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "terrace-square",
  "name": "Terrace · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "Three offset bands step across the frame and the type sits in the space they leave; no photograph is ever needed, and none is missed.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.11,"y":0.138,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.16,"y":0.206,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"kicker","x":0.06,"y":0.299,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.349,"width":0.88,"height":0.509,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":42,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.726,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.11,"y":0.794,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.16,"y":0.862,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2492,"width":0.88,"height":0.3868,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.01,"y":0.138,"width":0.704,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.01,"y":0.206,"width":0.5808,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.314,"width":0.88,"height":0.566,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.8096,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"text","slot":"outro","x":0.06,"y":0.163,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Terrace · 9:16 — `terrace-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "terrace-story",
  "name": "Terrace · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "Three offset bands step across the frame and the type sits in the space they leave; no photograph is ever needed, and none is missed.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.7912,"height":0.038,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.12,"y":0.204,"width":0.688,"height":0.038,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.17,"y":0.258,"width":0.5676,"height":0.038,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"kicker","x":0.07,"y":0.341,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.391,"width":0.86,"height":0.387,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":42,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.684,"width":0.7912,"height":0.038,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.12,"y":0.738,"width":0.688,"height":0.038,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.17,"y":0.792,"width":0.5676,"height":0.038,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.294,"width":0.86,"height":0.3,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.7912,"height":0.038,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.02,"y":0.204,"width":0.688,"height":0.038,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.01,"y":0.258,"width":0.5676,"height":0.038,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.356,"width":0.86,"height":0.444,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.7912,"height":0.038,"fillToken":"accent","radius":0.04},
        {"type":"text","slot":"outro","x":0.07,"y":0.233,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Terrace · Threads — `terrace-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "terrace-threads",
  "name": "Terrace · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "Three offset bands step across the frame and the type sits in the space they leave; no photograph is ever needed, and none is missed.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.7912,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.12,"y":0.148,"width":0.688,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.17,"y":0.216,"width":0.5676,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"kicker","x":0.07,"y":0.309,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.359,"width":0.86,"height":0.489,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":42,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.878,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.716,"width":0.7912,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.12,"y":0.784,"width":0.688,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.17,"y":0.852,"width":0.5676,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.2548,"width":0.86,"height":0.3712,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.7912,"height":0.048,"fillToken":"surface-strong","radius":0.04},
        {"type":"shape","x":0.02,"y":0.148,"width":0.688,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"shape","x":0.01,"y":0.216,"width":0.5676,"height":0.048,"fillToken":"secondary","radius":0.04},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.324,"width":0.86,"height":0.546,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.7912,"height":0.048,"fillToken":"accent","radius":0.04},
        {"type":"text","slot":"outro","x":0.07,"y":0.173,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

None needed — Terrace has no `image` layer in any format. Not applicable — Terrace is one of the two families built for photograph-less articles.

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 42–96 | 6 | 150 | 96px / 2L | 96px / 6L | 60px / 6L ✂ | 47px / 1L |
| slide-body-low | `passage-a` | 34–72 | 6 | 220 | 72px / 2L | 72px / 5L | 46px / 6L | 47px / 1L |
| slide-body-high | `passage-b` | 34–72 | 6 | 220 | 72px / 2L | 72px / 5L | 46px / 6L | 47px / 1L |
| slide-outro | `outro` | 34–68 | 4 | 120 | 68px / 1L | 65px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 07 · Figure — `figure`

**Thesis.** One number is the image. The figure fills the top of the cover, then returns as a small chip in the corner of every other body slide so the deck keeps its subject in view.

**Do not use.** An article with no honest figure in it. Never set a rounded or invented number in this slot.

**Rhythm.** cover (figure large) → chip top-right → no chip, accent underline → chip top-right → outro. The chip is the memory of the cover; dropping it every other slide is what stops the deck reading as a template.

**Without a photograph.** Not applicable — Figure has no image slot. The figure itself is the picture.

**Serves.** type-only · number-led · builds against the shipped schema

**Variant axes.** accent↔secondary · backdrop phase (chip corner walks TR → TL → TR) · type-scale 0.9/1/1.1

**Slots.** `figure`, `unit`, `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “chip” · beat B “underline” · outro. Specimen: [`families/figure.html`](families/figure.html)

### Figure · 4:5 — `figure-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "figure-portrait",
  "name": "Figure · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "One number is the image. The figure fills the top of the cover, then returns as a small chip in the corner of every other body slide so the deck keeps its subject in view.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["figure","unit","kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.066,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"figure","x":0.06,"y":0.118,"width":0.88,"height":0.3,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":90,"maxFontSize":200,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.06,"y":0.43,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":30,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"rule","x":0.06,"y":0.493,"width":0.88,"height":0.002,"colorToken":"surface-strong","thickness":4},
        {"type":"text","slot":"headline","x":0.06,"y":0.528,"width":0.88,"height":0.33,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":64,"maxChars":150,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-chip",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.74,"y":0.07,"width":0.2,"height":0.075,"fillToken":"surface-strong","radius":0.1},
        {"type":"text","slot":"figure","x":0.74,"y":0.0865,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"middle","uppercase":false},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2836,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-plain",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.2664,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.22,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.88,"height":0.0825,"fillToken":"surface-strong","radius":0.06},
        {"type":"text","slot":"figure","x":0.09,"y":0.0888,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.29,"y":0.1015,"width":0.62,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"outro","x":0.06,"y":0.2175,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Figure · 1:1 — `figure-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "figure-square",
  "name": "Figure · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "One number is the image. The figure fills the top of the cover, then returns as a small chip in the corner of every other body slide so the deck keeps its subject in view.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["figure","unit","kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.066,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"figure","x":0.06,"y":0.118,"width":0.88,"height":0.3,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":90,"maxFontSize":200,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.06,"y":0.43,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":30,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"rule","x":0.06,"y":0.493,"width":0.88,"height":0.002,"colorToken":"surface-strong","thickness":4},
        {"type":"text","slot":"headline","x":0.06,"y":0.528,"width":0.88,"height":0.33,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":64,"maxChars":150,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.888,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-chip",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.74,"y":0.07,"width":0.2,"height":0.075,"fillToken":"surface-strong","radius":0.1},
        {"type":"text","slot":"figure","x":0.74,"y":0.0865,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"middle","uppercase":false},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.2836,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-plain",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.2664,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.868,"width":0.22,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.88,"height":0.0825,"fillToken":"surface-strong","radius":0.06},
        {"type":"text","slot":"figure","x":0.09,"y":0.0888,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.29,"y":0.1015,"width":0.62,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"outro","x":0.06,"y":0.2175,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Figure · 9:16 — `figure-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "figure-story",
  "name": "Figure · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "One number is the image. The figure fills the top of the cover, then returns as a small chip in the corner of every other body slide so the deck keeps its subject in view.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["figure","unit","kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.146,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"figure","x":0.07,"y":0.198,"width":0.86,"height":0.26,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":90,"maxFontSize":200,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.07,"y":0.47,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":30,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"rule","x":0.07,"y":0.533,"width":0.86,"height":0.002,"colorToken":"surface-strong","thickness":4},
        {"type":"text","slot":"headline","x":0.07,"y":0.568,"width":0.86,"height":0.21,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":64,"maxChars":150,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.808,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-chip",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.73,"y":0.15,"width":0.2,"height":0.055,"fillToken":"surface-strong","radius":0.1},
        {"type":"text","slot":"figure","x":0.73,"y":0.1621,"width":0.2,"height":0.033,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"middle","uppercase":false},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.322,"width":0.86,"height":0.364,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-plain",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.308,"width":0.86,"height":0.364,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.788,"width":0.22,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.86,"height":0.0605,"fillToken":"surface-strong","radius":0.06},
        {"type":"text","slot":"figure","x":0.1,"y":0.1638,"width":0.2,"height":0.033,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.3,"y":0.1731,"width":0.6,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"outro","x":0.07,"y":0.2755,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Figure · Threads — `figure-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "figure-threads",
  "name": "Figure · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "One number is the image. The figure fills the top of the cover, then returns as a small chip in the corner of every other body slide so the deck keeps its subject in view.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["figure","unit","kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.076,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"figure","x":0.07,"y":0.128,"width":0.86,"height":0.3,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":90,"maxFontSize":200,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.07,"y":0.44,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":30,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"rule","x":0.07,"y":0.503,"width":0.86,"height":0.002,"colorToken":"surface-strong","thickness":4},
        {"type":"text","slot":"headline","x":0.07,"y":0.538,"width":0.86,"height":0.31,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":32,"maxFontSize":64,"maxChars":150,"maxLines":5,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.878,"width":0.26,"height":0.028,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-chip",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.73,"y":0.08,"width":0.2,"height":0.075,"fillToken":"surface-strong","radius":0.1},
        {"type":"text","slot":"figure","x":0.73,"y":0.0965,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"middle","uppercase":false},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.2884,"width":0.86,"height":0.4368,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":32,"maxFontSize":64,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-plain",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.2716,"width":0.86,"height":0.4368,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.858,"width":0.22,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.86,"height":0.0825,"fillToken":"surface-strong","radius":0.06},
        {"type":"text","slot":"figure","x":0.1,"y":0.0988,"width":0.2,"height":0.045,"colorToken":"accent","fontToken":"headline","fontWeight":900,"minFontSize":30,"maxFontSize":56,"maxChars":6,"maxLines":1,"align":"start","uppercase":false},
        {"type":"text","slot":"unit","x":0.3,"y":0.1115,"width":0.6,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":30,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"outro","x":0.07,"y":0.2275,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":64,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

None needed — Figure has no `image` layer in any format. Not applicable — Figure has no image slot. The figure itself is the picture.

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `figure` | 90–200 | 1 | 6 | 200px / 1L ✂ | 200px / 1L ✂ | 200px / 1L ✂ | 200px / 1L ✂ |
| slide-cover | `unit` | 20–30 | 1 | 30 | 30px / 1L | 30px / 1L ✂ | 30px / 1L ✂ | 30px / 1L |
| slide-cover | `headline` | 32–64 | 5 | 150 | 64px / 1L | 64px / 4L | 52px / 5L ✂ | 47px / 1L |
| slide-body-chip | `figure` | 30–56 | 1 | 6 | 54px / 1L ✂ | 54px / 1L ✂ | 54px / 1L ✂ | 49px / 1L ✂ |
| slide-body-chip | `passage-a` | 32–64 | 6 | 220 | 64px / 1L | 64px / 4L | 46px / 6L | 47px / 1L |
| slide-body-plain | `passage-b` | 30–56 | 7 | 240 | 56px / 1L | 56px / 4L | 52px / 7L | 47px / 1L |
| slide-outro | `figure` | 30–56 | 1 | 6 | 54px / 1L ✂ | 54px / 1L ✂ | 54px / 1L ✂ | 49px / 1L ✂ |
| slide-outro | `unit` | 18–24 | 1 | 30 | 24px / 1L | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L |
| slide-outro | `outro` | 34–64 | 4 | 120 | 64px / 1L | 64px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 08 · Pull — `pull`

**Thesis.** Something a named person said, set at the size it was said with: an oversized quotation, a small circular photograph, and an attribution line that is always present.

**Do not use.** A summary in the desk's own voice. If nobody said it, the quotation marks are a lie.

**Rhythm.** cover (quote + portrait circle) → bar left → panel centred → bar left → outro. The accent bar and the centred panel trade places so the argument alternates between spoken and written.

**Without a photograph.** The circle becomes a filled surface-strong disc inside the accent ring. No face, no stock image, and the attribution line still names who spoke.

**Serves.** quote-capable · photo-forward · uses shipped text/shape fields

**Variant axes.** accent↔secondary · backdrop phase (bar length 0.06 / 0.10 / 0.14) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `quote`, `attribution`, `kicker`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “bar” · beat B “panel” · outro. Specimen: [`families/pull.html`](families/pull.html)

### Pull · 4:5 — `pull-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "pull-portrait",
  "name": "Pull · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "Something a named person said, set at the size it was said with: an oversized quotation, a small circular photograph, and an attribution line that is always present.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["quote","attribution","kicker","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.22,"height":0.176,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.07,"y":0.078,"width":0.2,"height":0.16,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.32,"y":0.144,"width":0.62,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"quote","x":0.06,"y":0.301,"width":0.88,"height":0.4988,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":112,"maxChars":180,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.832,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"attribution","x":0.06,"y":0.858,"width":0.88,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-bar",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.1976,"width":0.008,"height":0.43,"fillToken":"accent","radius":0},
        {"type":"text","slot":"passage-a","x":0.105,"y":0.1976,"width":0.835,"height":0.43,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-panel",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.04,"y":0.18,"width":0.92,"height":0.4816,"fillToken":"surface","radius":0.03},
        {"type":"rule","x":0.06,"y":0.215,"width":0.1,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.08,"y":0.26,"width":0.84,"height":0.344,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":220,"maxLines":6,"align":"middle","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.88,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.08,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"outro","x":0.06,"y":0.122,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"attribution","x":0.06,"y":0.705,"width":0.88,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Pull · 1:1 — `pull-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "pull-square",
  "name": "Pull · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "Something a named person said, set at the size it was said with: an oversized quotation, a small circular photograph, and an attribution line that is always present.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["quote","attribution","kicker","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.07,"width":0.22,"height":0.22,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.07,"y":0.08,"width":0.2,"height":0.2,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.32,"y":0.166,"width":0.62,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"quote","x":0.06,"y":0.345,"width":0.88,"height":0.4988,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":112,"maxChars":180,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.832,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"attribution","x":0.06,"y":0.858,"width":0.88,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-bar",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.06,"y":0.1976,"width":0.008,"height":0.43,"fillToken":"accent","radius":0},
        {"type":"text","slot":"passage-a","x":0.105,"y":0.1976,"width":0.835,"height":0.43,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-panel",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.04,"y":0.18,"width":0.92,"height":0.4816,"fillToken":"surface","radius":0.03},
        {"type":"rule","x":0.06,"y":0.215,"width":0.1,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.08,"y":0.26,"width":0.84,"height":0.344,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":220,"maxLines":6,"align":"middle","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.88,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.08,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"outro","x":0.06,"y":0.122,"width":0.88,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"attribution","x":0.06,"y":0.705,"width":0.88,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"credit","x":0.06,"y":0.765,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.832,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.886,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Pull · 9:16 — `pull-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "pull-story",
  "name": "Pull · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "Something a named person said, set at the size it was said with: an oversized quotation, a small circular photograph, and an attribution line that is always present.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["quote","attribution","kicker","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.15,"width":0.2,"height":0.1125,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.08,"y":0.1556,"width":0.18,"height":0.1013,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.31,"y":0.1923,"width":0.62,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"quote","x":0.07,"y":0.3175,"width":0.86,"height":0.406,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":112,"maxChars":180,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.752,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"attribution","x":0.07,"y":0.778,"width":0.86,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"logo","x":0.07,"y":0.81,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-bar",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.252,"width":0.008,"height":0.35,"fillToken":"accent","radius":0},
        {"type":"text","slot":"passage-a","x":0.115,"y":0.252,"width":0.815,"height":0.35,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-panel",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.05,"y":0.26,"width":0.9,"height":0.392,"fillToken":"surface","radius":0.03},
        {"type":"rule","x":0.07,"y":0.295,"width":0.1,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.09,"y":0.34,"width":0.82,"height":0.28,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":220,"maxLines":6,"align":"middle","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.86,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.16,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"outro","x":0.07,"y":0.202,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"attribution","x":0.07,"y":0.625,"width":0.86,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"credit","x":0.07,"y":0.685,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.752,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.806,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Pull · Threads — `pull-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "pull-threads",
  "name": "Pull · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "Something a named person said, set at the size it was said with: an oversized quotation, a small circular photograph, and an attribution line that is always present.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["quote","attribution","kicker","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.22,"height":0.22,"fillToken":"accent","radius":0.5},
        {"type":"image","slot":"image","optional":true,"x":0.08,"y":0.09,"width":0.2,"height":0.2,"fit":"cover","scrim":"none","clip":"circle","v2":true},
        {"type":"text","slot":"kicker","x":0.33,"y":0.176,"width":0.6,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"quote","x":0.07,"y":0.355,"width":0.86,"height":0.4872,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":40,"maxFontSize":112,"maxChars":180,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.822,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"attribution","x":0.07,"y":0.848,"width":0.86,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"logo","x":0.07,"y":0.88,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-bar",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.07,"y":0.2044,"width":0.008,"height":0.42,"fillToken":"accent","radius":0},
        {"type":"text","slot":"passage-a","x":0.115,"y":0.2044,"width":0.815,"height":0.42,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":240,"maxLines":7,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.22,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-panel",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0.05,"y":0.19,"width":0.9,"height":0.4704,"fillToken":"surface","radius":0.03},
        {"type":"rule","x":0.07,"y":0.225,"width":0.1,"height":0.003,"colorToken":"accent","thickness":6},
        {"type":"text","slot":"passage-b","x":0.09,"y":0.27,"width":0.82,"height":0.336,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":30,"maxFontSize":56,"maxChars":220,"maxLines":6,"align":"middle","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.86,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.09,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"text","slot":"outro","x":0.07,"y":0.132,"width":0.86,"height":0.26,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"attribution","x":0.07,"y":0.695,"width":0.86,"height":0.03,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":40,"maxLines":1,"align":"start","uppercase":true,"tracking":0.12,"v2":true},
        {"type":"text","slot":"credit","x":0.07,"y":0.755,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.822,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.876,"width":0.26,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The circle becomes a filled surface-strong disc inside the accent ring. No face, no stock image, and the attribution line still names who spoke. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"shape","x":0.07,"y":0.078,"width":0.2,"height":0.16,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"shape","x":0.07,"y":0.08,"width":0.2,"height":0.2,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"shape","x":0.08,"y":0.1556,"width":0.18,"height":0.1013,"fillToken":"surface-strong","radius":0.5}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"shape","x":0.08,"y":0.09,"width":0.2,"height":0.2,"fillToken":"surface-strong","radius":0.5}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `quote` | 40–112 | 6 | 180 | 112px / 2L | 99px / 6L | 52px / 6L ✂ | 47px / 1L |
| slide-cover | `attribution` | 18–24 | 1 | 40 | 24px / 1L | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L |
| slide-body-bar | `passage-a` | 30–56 | 7 | 240 | 56px / 1L | 56px / 4L | 50px / 7L | 44px / 1L |
| slide-body-panel | `passage-b` | 30–56 | 6 | 220 | 56px / 1L | 56px / 4L | 44px / 6L | 44px / 1L |
| slide-outro | `outro` | 34–68 | 4 | 120 | 68px / 1L | 65px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `attribution` | 18–24 | 1 | 40 | 24px / 1L | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 09 · Tower — `tower`

**Thesis.** Built for 9:16 first: a chapter bar under the platform chrome, a tall type stage in the middle, and a sticker line sitting above the bottom band where a thumb lands.

**Do not use.** A carousel where slide one must survive as a square thumbnail — Tower's stage is deliberately tall and empties out at 1:1.

**Rhythm.** cover (stage high, sticker accent) → stage high → stage low, chapter bar filled → stage high → outro. The type stage slides up and down inside the safe window while the bars stay put, so the frame is stable and the content moves.

**Without a photograph.** The full-bleed image is replaced by a three-blob mesh (surface-strong at 0.50, accent at 0.24, secondary at 0.18) at softness 0.18 filling the same frame; the type block is unchanged.

**Serves.** story-first · photo-forward · builds against the shipped schema

**Variant axes.** accent↔secondary · backdrop phase (mesh blob walk) · photo treatment none/mono/duotone · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `passage-a`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “stage high” · beat B “stage low, bar filled” · outro. Specimen: [`families/tower.html`](families/tower.html)

### Tower · 4:5 — `tower-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "tower-portrait",
  "name": "Tower · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "Built for 9:16 first: a chapter bar under the platform chrome, a tall type stage in the middle, and a sticker line sitting above the bottom band where a thumb lands.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":1,"fit":"cover","scrim":"full"},
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.163,"width":0.88,"height":0.597,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"shape","x":0.06,"y":0.845,"width":0.88,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"rule","x":0.06,"y":0.845,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.09,"y":0.866,"width":0.82,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.232,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.815,"width":0.12,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":1,"height":0.096,"fillToken":"accent","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.138,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.4744,"width":0.88,"height":0.3784,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"outro","x":0.06,"y":0.163,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.73,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.797,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"shape","x":0.06,"y":0.845,"width":0.88,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"logo","x":0.09,"y":0.866,"width":0.82,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Tower · 1:1 — `tower-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "tower-square",
  "name": "Tower · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "Built for 9:16 first: a chapter bar under the platform chrome, a tall type stage in the middle, and a sticker line sitting above the bottom band where a thumb lands.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":1,"fit":"cover","scrim":"full"},
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.06,"y":0.163,"width":0.88,"height":0.597,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"shape","x":0.06,"y":0.845,"width":0.88,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"rule","x":0.06,"y":0.845,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.09,"y":0.866,"width":0.82,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.232,"width":0.88,"height":0.4472,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.815,"width":0.12,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":1,"height":0.096,"fillToken":"accent","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.138,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-b","x":0.06,"y":0.4744,"width":0.88,"height":0.3784,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.048,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.06,"y":0.06,"width":0.88,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"outro","x":0.06,"y":0.163,"width":0.88,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.06,"y":0.73,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.797,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"shape","x":0.06,"y":0.845,"width":0.88,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"logo","x":0.09,"y":0.866,"width":0.82,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Tower · 9:16 — `tower-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "tower-story",
  "name": "Tower · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "Built for 9:16 first: a chapter bar under the platform chrome, a tall type stage in the middle, and a sticker line sitting above the bottom band where a thumb lands.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":1,"fit":"cover","scrim":"full"},
        {"type":"shape","x":0,"y":0.128,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.14,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.243,"width":0.86,"height":0.45,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"shape","x":0.07,"y":0.778,"width":0.86,"height":0.062,"fillToken":"surface-strong","radius":0.16},
        {"type":"rule","x":0.07,"y":0.778,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.1,"y":0.7954,"width":0.8,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.128,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.14,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.28,"width":0.86,"height":0.364,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.748,"width":0.12,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.81,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":1,"height":0.176,"fillToken":"accent","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.218,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.468,"width":0.86,"height":0.308,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.128,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.14,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"outro","x":0.07,"y":0.243,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.663,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.73,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"shape","x":0.07,"y":0.778,"width":0.86,"height":0.062,"fillToken":"surface-strong","radius":0.16},
        {"type":"logo","x":0.1,"y":0.7954,"width":0.8,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Tower · Threads — `tower-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "tower-threads",
  "name": "Tower · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "Built for 9:16 first: a chapter bar under the platform chrome, a tall type stage in the middle, and a sticker line sitting above the bottom band where a thumb lands.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","passage-a","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"image","slot":"image","optional":true,"x":0,"y":0,"width":1,"height":1,"fit":"cover","scrim":"full"},
        {"type":"shape","x":0,"y":0.058,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.07,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"headline","x":0.07,"y":0.173,"width":0.86,"height":0.577,"colorToken":"foreground","fontToken":"headline","fontWeight":800,"minFontSize":44,"maxFontSize":96,"maxChars":150,"maxLines":6,"align":"start","uppercase":false},
        {"type":"shape","x":0.07,"y":0.835,"width":0.86,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"rule","x":0.07,"y":0.835,"width":0.1,"height":0.005,"colorToken":"accent","thickness":10},
        {"type":"logo","x":0.1,"y":0.856,"width":0.8,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-high",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.058,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.07,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.238,"width":0.86,"height":0.4368,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.805,"width":0.12,"height":0.004,"colorToken":"accent","thickness":8},
        {"type":"logo","x":0.07,"y":0.88,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-low",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0,"width":1,"height":0.106,"fillToken":"accent","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.148,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"passage-b","x":0.07,"y":0.4736,"width":0.86,"height":0.3696,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":34,"maxFontSize":72,"maxChars":220,"maxLines":6,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"shape","x":0,"y":0.058,"width":1,"height":0.048,"fillToken":"surface","radius":0},
        {"type":"text","slot":"kicker","x":0.07,"y":0.07,"width":0.86,"height":0.028,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"text","slot":"outro","x":0.07,"y":0.173,"width":0.86,"height":0.24,"colorToken":"foreground","fontToken":"headline","fontWeight":700,"minFontSize":34,"maxFontSize":68,"maxChars":120,"maxLines":4,"align":"start","uppercase":false},
        {"type":"text","slot":"credit","x":0.07,"y":0.72,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.787,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"shape","x":0.07,"y":0.835,"width":0.86,"height":0.075,"fillToken":"surface-strong","radius":0.16},
        {"type":"logo","x":0.1,"y":0.856,"width":0.8,"height":0.028,"colorToken":"accent","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The full-bleed image is replaced by a three-blob mesh (surface-strong at 0.50, accent at 0.24, secondary at 0.18) at softness 0.18 filling the same frame; the type block is unchanged. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":1,"blobs":[{"colorToken":"surface-strong","cx":0.5,"cy":0.4,"radius":0.7,"opacity":0.5},{"colorToken":"accent","cx":0.22,"cy":0.18,"radius":0.45,"opacity":0.24},{"colorToken":"secondary","cx":0.82,"cy":0.74,"radius":0.42,"opacity":0.18}],"softness":0.18}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":1,"blobs":[{"colorToken":"surface-strong","cx":0.5,"cy":0.4,"radius":0.7,"opacity":0.5},{"colorToken":"accent","cx":0.22,"cy":0.18,"radius":0.45,"opacity":0.24},{"colorToken":"secondary","cx":0.82,"cy":0.74,"radius":0.42,"opacity":0.18}],"softness":0.18}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":1,"blobs":[{"colorToken":"surface-strong","cx":0.5,"cy":0.4,"radius":0.7,"opacity":0.5},{"colorToken":"accent","cx":0.22,"cy":0.18,"radius":0.45,"opacity":0.24},{"colorToken":"secondary","cx":0.82,"cy":0.74,"radius":0.42,"opacity":0.18}],"softness":0.18}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"mesh","x":0,"y":0,"width":1,"height":1,"blobs":[{"colorToken":"surface-strong","cx":0.5,"cy":0.4,"radius":0.7,"opacity":0.5},{"colorToken":"accent","cx":0.22,"cy":0.18,"radius":0.45,"opacity":0.24},{"colorToken":"secondary","cx":0.82,"cy":0.74,"radius":0.42,"opacity":0.18}],"softness":0.18}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 44–96 | 6 | 150 | 96px / 2L | 96px / 6L | 60px / 6L ✂ | 47px / 1L |
| slide-body-high | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-body-high | `passage-a` | 34–72 | 6 | 220 | 72px / 2L | 72px / 5L | 46px / 6L | 47px / 1L |
| slide-body-low | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-body-low | `passage-b` | 34–72 | 6 | 220 | 72px / 2L | 72px / 5L | 46px / 6L | 47px / 1L |
| slide-outro | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-outro | `outro` | 34–68 | 4 | 120 | 68px / 1L | 65px / 4L | 52px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---

## 10 · Dossier — `dossier`

**Thesis.** A record, not a poster: hairlines, mono labels, numbered entries and a small contained photograph. The quietest family in the set, and the one to reach for when the deck is documenting rather than arguing.

**Do not use.** A result or a final. Dossier makes everything look equally weighted, which is exactly wrong for news that is not.

**Rhythm.** cover → entry with the rule above → entry with the rule below → entry with the rule above → colophon. The single hairline changing ends is the whole rhythm; anything louder would stop it being a record.

**Without a photograph.** The contained thumbnail becomes an empty hairline rectangle of the same frame: a 3 px surface-strong rule around the background. A record shows its gaps rather than filling them.

**Serves.** quiet · record-keeping · builds against the shipped schema

**Variant axes.** accent↔secondary (hairline colour only) · backdrop phase (rule position 3 steps) · photo treatment none/mono · type-scale 0.9/1/1.1

**Slots.** `kicker`, `headline`, `index-a`, `passage-a`, `index-b`, `passage-b`, `outro`, `credit`, `sources`

Slides: cover · beat A “rule above” · beat B “rule below” · outro. Specimen: [`families/dossier.html`](families/dossier.html)

### Dossier · 4:5 — `dossier-portrait`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "dossier-portrait",
  "name": "Dossier · 4:5",
  "version": "1.0.0",
  "status": "draft",
  "description": "A record, not a poster: hairlines, mono labels, numbered entries and a small contained photograph. The quietest family in the set, and the one to reach for when the deck is documenting rather than arguing.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","index-a","passage-a","index-b","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.064,"width":0.88,"height":0.026,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.06,"y":0.104,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"headline","x":0.06,"y":0.135,"width":0.88,"height":0.344,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":56,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.4962,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"image","slot":"image","optional":true,"x":0.06,"y":0.5306,"width":0.22,"height":0.132,"fit":"contain","scrim":"none"},
        {"type":"rule","x":0.06,"y":0.858,"width":0.88,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-above",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"index-a","x":0.06,"y":0.064,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"start","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"rule","x":0.06,"y":0.102,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.135,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-below",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.08,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.862,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"index-b","x":0.8,"y":0.888,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"end","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"logo","x":0.06,"y":0.888,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.08,"width":0.88,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"text","slot":"outro","x":0.06,"y":0.11,"width":0.88,"height":0.2,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":52,"maxChars":140,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.705,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"credit","x":0.06,"y":0.73,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.8,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.85,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"logo","x":0.06,"y":0.882,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Dossier · 1:1 — `dossier-square`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "dossier-square",
  "name": "Dossier · 1:1",
  "version": "1.0.0",
  "status": "draft",
  "description": "A record, not a poster: hairlines, mono labels, numbered entries and a small contained photograph. The quietest family in the set, and the one to reach for when the deck is documenting rather than arguing.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","index-a","passage-a","index-b","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.06,"y":0.064,"width":0.88,"height":0.026,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.06,"y":0.104,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"headline","x":0.06,"y":0.135,"width":0.88,"height":0.344,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":56,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.4962,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"image","slot":"image","optional":true,"x":0.06,"y":0.5306,"width":0.22,"height":0.165,"fit":"contain","scrim":"none"},
        {"type":"rule","x":0.06,"y":0.858,"width":0.88,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-above",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"index-a","x":0.06,"y":0.064,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"start","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"rule","x":0.06,"y":0.102,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"passage-a","x":0.06,"y":0.135,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.06,"y":0.89,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-below",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.06,"y":0.08,"width":0.88,"height":0.516,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.862,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"index-b","x":0.8,"y":0.888,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"end","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"logo","x":0.06,"y":0.888,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.06,"y":0.08,"width":0.88,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"text","slot":"outro","x":0.06,"y":0.11,"width":0.88,"height":0.2,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":52,"maxChars":140,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.705,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"credit","x":0.06,"y":0.73,"width":0.88,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.06,"y":0.8,"width":0.88,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"rule","x":0.06,"y":0.85,"width":0.88,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"logo","x":0.06,"y":0.882,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Dossier · 9:16 — `dossier-story`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "dossier-story",
  "name": "Dossier · 9:16",
  "version": "1.0.0",
  "status": "draft",
  "description": "A record, not a poster: hairlines, mono labels, numbered entries and a small contained photograph. The quietest family in the set, and the one to reach for when the deck is documenting rather than arguing.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","index-a","passage-a","index-b","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.144,"width":0.86,"height":0.026,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.07,"y":0.184,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"headline","x":0.07,"y":0.215,"width":0.86,"height":0.28,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":56,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.509,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"image","slot":"image","optional":true,"x":0.07,"y":0.537,"width":0.17,"height":0.0717,"fit":"contain","scrim":"none"},
        {"type":"rule","x":0.07,"y":0.778,"width":0.86,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"logo","x":0.07,"y":0.81,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-above",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"index-a","x":0.07,"y":0.144,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"start","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"rule","x":0.07,"y":0.182,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.215,"width":0.86,"height":0.42,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.81,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-below",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.16,"width":0.86,"height":0.42,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.782,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"index-b","x":0.79,"y":0.808,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"end","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"logo","x":0.07,"y":0.808,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.16,"width":0.86,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"text","slot":"outro","x":0.07,"y":0.19,"width":0.86,"height":0.2,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":52,"maxChars":140,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.625,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"credit","x":0.07,"y":0.65,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.72,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.77,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"logo","x":0.07,"y":0.802,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

### Dossier · Threads — `dossier-threads`

```json
{
  "schemaVersion": "carousel-template/1",
  "id": "dossier-threads",
  "name": "Dossier · Threads",
  "version": "1.0.0",
  "status": "draft",
  "description": "A record, not a poster: hairlines, mono labels, numbered entries and a small contained photograph. The quietest family in the set, and the one to reach for when the deck is documenting rather than arguing.",
  "citedObservationRefs": [],
  "formats": {
      "instagram-portrait": { "width": 1080, "height": 1350, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-square": { "width": 1080, "height": 1080, "safeArea": { "top": 0.06, "right": 0.06, "bottom": 0.08, "left": 0.06 } },
      "instagram-story": { "width": 1080, "height": 1920, "safeArea": { "top": 0.14, "right": 0.07, "bottom": 0.16, "left": 0.07 } },
      "threads": { "width": 1200, "height": 1200, "safeArea": { "top": 0.07, "right": 0.07, "bottom": 0.09, "left": 0.07 } }
  },
  "requiredSlots": ["kicker","headline","index-a","passage-a","index-b","passage-b","outro","credit","sources"],
  "slides": [
    {
      "id": "slide-cover",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"kicker","x":0.07,"y":0.074,"width":0.86,"height":0.026,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":20,"maxFontSize":26,"maxChars":34,"maxLines":1,"align":"start","uppercase":true,"tracking":0.14,"v2":true},
        {"type":"rule","x":0.07,"y":0.114,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"headline","x":0.07,"y":0.145,"width":0.86,"height":0.336,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":56,"maxChars":200,"maxLines":6,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.4978,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"image","slot":"image","optional":true,"x":0.07,"y":0.5314,"width":0.22,"height":0.165,"fit":"contain","scrim":"none"},
        {"type":"rule","x":0.07,"y":0.848,"width":0.86,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"logo","x":0.07,"y":0.88,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-above",
      "backgroundToken": "background",
      "layers": [
        {"type":"text","slot":"index-a","x":0.07,"y":0.074,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"start","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"rule","x":0.07,"y":0.112,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"passage-a","x":0.07,"y":0.145,"width":0.86,"height":0.504,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"logo","x":0.07,"y":0.88,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-body-below",
      "backgroundToken": "surface",
      "layers": [
        {"type":"text","slot":"passage-b","x":0.07,"y":0.09,"width":0.86,"height":0.504,"colorToken":"foreground","fontToken":"body","fontWeight":400,"minFontSize":26,"maxFontSize":44,"maxChars":300,"maxLines":8,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.852,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"index-b","x":0.79,"y":0.878,"width":0.14,"height":0.026,"colorToken":"accent","fontToken":"mono","fontWeight":400,"minFontSize":18,"maxFontSize":24,"maxChars":6,"maxLines":1,"align":"end","uppercase":false,"tracking":0.1,"v2":true},
        {"type":"logo","x":0.07,"y":0.878,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    },
    {
      "id": "slide-outro",
      "backgroundToken": "background",
      "layers": [
        {"type":"rule","x":0.07,"y":0.09,"width":0.86,"height":0.002,"colorToken":"accent","thickness":4},
        {"type":"text","slot":"outro","x":0.07,"y":0.12,"width":0.86,"height":0.2,"colorToken":"foreground","fontToken":"headline","fontWeight":600,"minFontSize":28,"maxFontSize":52,"maxChars":140,"maxLines":4,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.695,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"text","slot":"credit","x":0.07,"y":0.72,"width":0.86,"height":0.058,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":76,"maxLines":2,"align":"start","uppercase":false},
        {"type":"text","slot":"sources","x":0.07,"y":0.79,"width":0.86,"height":0.036,"colorToken":"muted","fontToken":"mono","fontWeight":400,"minFontSize":16,"maxFontSize":19,"maxChars":44,"maxLines":1,"align":"start","uppercase":false},
        {"type":"rule","x":0.07,"y":0.84,"width":0.86,"height":0.0015,"colorToken":"surface-strong","thickness":2},
        {"type":"logo","x":0.07,"y":0.872,"width":0.24,"height":0.026,"colorToken":"muted","fontToken":"headline"}
      ],
      "variants": [{"id":"A"}, {"id":"B","accentToken":"secondary"}]
    }
  ]
}
```

#### Fallback layers — no photograph

The contained thumbnail becomes an empty hairline rectangle of the same frame: a 3 px surface-strong rule around the background. A record shows its gaps rather than filling them. These layers replace the `image` layer **in place**, at the same index in the
slide's draw order, keyed by format and slide id. Everything else on the slide is unchanged.

```json
{
  "instagram-portrait": {
    "slide-cover": [
        {"type":"shape","x":0.06,"y":0.5306,"width":0.22,"height":0.132,"fillToken":"background","radius":0,"strokeToken":"surface-strong","strokeWidth":3}
    ]
  },
  "instagram-square": {
    "slide-cover": [
        {"type":"shape","x":0.06,"y":0.5306,"width":0.22,"height":0.165,"fillToken":"background","radius":0,"strokeToken":"surface-strong","strokeWidth":3}
    ]
  },
  "instagram-story": {
    "slide-cover": [
        {"type":"shape","x":0.07,"y":0.537,"width":0.17,"height":0.0717,"fillToken":"background","radius":0,"strokeToken":"surface-strong","strokeWidth":3}
    ]
  },
  "threads": {
    "slide-cover": [
        {"type":"shape","x":0.07,"y":0.5314,"width":0.22,"height":0.165,"fillToken":"background","radius":0,"strokeToken":"surface-strong","strokeWidth":3}
    ]
  }
}
```

#### Type sizes, 4:5

Measured with the engine's own `fitText`. “48px / 2L” is the size and line count it lands on at
1080-wide design scale; ✂ marks a string the slot would clip. The long column is three fixture
sentences joined (208 characters) and exists to be survived, not read.

| slide | slot | min–max | lines | maxChars | short | medium | long 208c | one word |
|---|---|---|---|---|---|---|---|---|
| slide-cover | `kicker` | 20–26 | 1 | 34 | 26px / 1L | 26px / 1L ✂ | 26px / 1L ✂ | 26px / 1L |
| slide-cover | `headline` | 28–56 | 6 | 200 | 56px / 1L | 56px / 4L | 48px / 6L ✂ | 47px / 1L |
| slide-body-above | `index-a` | 18–24 | 1 | 6 | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L ✂ |
| slide-body-above | `passage-a` | 26–44 | 8 | 300 | 44px / 1L | 44px / 3L | 44px / 6L | 44px / 1L |
| slide-body-below | `passage-b` | 26–44 | 8 | 300 | 44px / 1L | 44px / 3L | 44px / 6L | 44px / 1L |
| slide-body-below | `index-b` | 18–24 | 1 | 6 | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L ✂ | 24px / 1L ✂ |
| slide-outro | `outro` | 28–52 | 4 | 140 | 52px / 1L | 52px / 4L | 46px / 4L ✂ | 47px / 1L |
| slide-outro | `credit` | 16–19 | 2 | 76 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |
| slide-outro | `sources` | 16–19 | 1 | 44 | 19px / 1L | 19px / 1L ✂ | 19px / 1L ✂ | 19px / 1L |

---
