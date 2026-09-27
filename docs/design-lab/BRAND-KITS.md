# Venture brand kits

A brand kit holds a venture's approved logo files and the rules for using them. Kits live in
`studio/brand-kits/<venture>/`, one directory per venture id from `config/ventures.json`. You see
them in the admin at `/admin?venture=design-lab&tab=brand`.

| Kit | Venture | Studio brand | Source | Drawn in carousels |
| --- | --- | --- | --- | --- |
| DNESKAi | `caught-up` | `caught-up` | `lukaskourilcz/aifirst` at `978cf71` (on `main`) | yes: palette, faces, logo, flat style |
| devShark | `marketingshark` | `devshark` | `lukaskourilcz/react-express-app` at `bc3a2e8` (on `main`, `client/public/brand/v9/`) | yes: palette, faces, logo, grounds, corner fin |

BoardlessAI's own identity is locked and has no kit here.

## What a kit contains

- The production files, copied byte for byte. Outlined SVGs for anything the studio draws; PNGs
  only where a platform needs raster, such as DNESKAi's 512 px avatar.
- `manifest.json`, which follows `brand-kit/1` (`contracts/brand-kit.schema.json`; the zod schema
  is `BrandKitManifestSchema` in `studio/src/brand-kit.ts`).

The manifest records:

- `venture`, `studioBrand` (the `CAROUSEL_BRANDS` key it dresses) and `displayName`.
- `source`: a repository, ref and full commit, or a dated handoff with `pinTo`, the place the files
  will land. Re-pin a handoff kit to a repository commit once the files merge there.
- `logotype`: the primary logo's viewBox and aspect ratio, clear space (as a ratio of logo height
  when the spec gives one), a minimum height in pixels, and the spec's size table.
- `palettes` for each ground the logo is approved on, and `carouselPalette` when the kit sets the
  studio's seven carousel tokens. Each token names the design-system value it came from.
- `carouselFonts`: the family for each of the studio's three type slots, from `studio/fonts/`.
- `carouselStyle`: `flat` (no mesh, glow, blur or fading scrim; gradient seams stay hard),
  `squareCorners` (zero radii), `logo` (`every-slide` or `last-slide`), named `grounds` with a full
  set of seven tokens each, a `groundSequence` from the first slide to the last, a `cornerMark`
  (mark roles in preference order, width and margin on the 1080 px canvas, top edge on a story) and
  any `neutrals` a slide may draw besides the kit's colours.
- `rules`, `doNots`, `socialRules` and `typography`, in the spec's words.
- `assets`: per file its role, kind (logotype, lockup, mark, icon, share card), label, size,
  sha256, source path, intended grounds, whether it goes on photographs, the colours it draws, its
  viewBox, its minimum size, and `logoSlot`.

## How the studio uses a kit

A brand whose tokens in `library.ts` name a `kit` is drawn from that kit and from nothing else
(`studio/src/kit-style.ts`). Per render the studio:

1. Reads and verifies the kit. A kit that is missing, fails a size or hash, sets no
   `carouselPalette` or marks no `logoSlot` file stops the render with the kit's reason. So does a
   kit that claims a studio brand whose tokens do not name it. Nothing falls back to an older
   palette or a wordmark set in a font.
2. Takes the colours from `carouselPalette` and the faces from `carouselFonts`, whatever tokens the
   caller passed.
3. Applies `carouselStyle` to the template (`kitTemplate`), and the contrast gates measure the
   result, so they check the slide that is drawn.
4. Gives each slide its ground from `groundSequence` by its place in the deck. Quiz and post decks
   are single-slide templates, so they pass the position (`deck` on the render input). A deck of
   another length keeps the first and last ground and walks the ones between. Every ground a deck
   uses is validated.
5. Draws the logo layer only where `logo` allows it, and the corner mark on every slide.

`logotypeForBrand(studioBrand)` reads the files marked `logoSlot`, in manifest order, and a logo
layer nests the chosen SVG. The file, like the corner mark's, is picked from the grounds behind its
frame (`groundsBehindLayer`, the same function the contrast gates use):

1. Over a photograph that is present, the file marked `onPhoto`.
2. When every ground behind the frame is one a file names, that file. Full colour comes first.
3. Otherwise the one-colour file with the better worst-case WCAG ratio.

Rule 2 adds no contrast pair, since the spec approved that file on that ground. Rules 1 and 3 go
through the usual 4.5:1 and APCA Lc 40 floors in their own ink. The logo sits in its frame with the
kit's clear space above and below and never drops under the kit's minimum height while the frame
is wide enough.

A kitted brand names each face by `rasterFamily`, the typographic family resvg resolves the file
by. The legacy id-1 name (`Source Serif 4 Semibold`) finds nothing and draws the fallback face.

`validateTemplateAsRendered` runs the checks the renderer runs, per ground, and the Design Lab's
Templates check column reads it. Latest renders devShark packages through the quiz functions with
their slide positions, so a preview is the frame the room posts. marketingShark's rooms and the
Design Lab deck queue ask `brandKitProblem` first and stop at $0 with the kit's reason.

`library.ts` must carry the manifest's `carouselPalette` and `carouselFonts` exactly, and
`studio/tests/brand-kits.test.ts` fails when they drift. `studio/tests/kit-rendering.test.ts`
renders every template and canvas each kitted brand is offered and reads the SVG back: kit colours
only, the kit's logo paths where a logo appears, nothing the style forbids, and devShark's ground
order, corner fin and last-slide logo.

### DNESKAi

Flat and square, per `BRAND_SYSTEM.md` ("flat surfaces, zero radii"; no gradients, glass or glow).
White, paper and blueprint blue; Space Grotesk headlines, Source Serif 4 words, IBM Plex Mono labels.
The logo appears on every slide, in the file its ground calls for.

### devShark

The base palette is the pale ground. Slides stand on Ink `#132019`, Pale `#f3f6f1`, Green `#2d7a2d`,
Pale, Ink. On pale, green text is green-800 `#236123`, because `#2d7a2d` fails 4.5:1 on the tint and
the line tone; on ink, the accent is green-100 `#e3efe1`, because the green reaches only 3.15:1
there. The clean fin sits 48 px wide, 48 px from the top-right edges of every slide (250 px from the
top of a story), white on ink and green, green on pale. The horizontal logo appears on the last slide
only, at 160 px wide or more. Code puts the name on no slide but the last. Manrope headlines, Inter
words, JetBrains Mono code.

## Adding or replacing a kit

1. Copy the approved files into `studio/brand-kits/<venture>/` unchanged.
2. Write `manifest.json`. Run `pnpm -C studio test`: the kit test checks every size, hash, fill
   colour and viewBox, and that the directory holds nothing the manifest does not list.
3. Set `logoSlot` on the files the carousels may draw only once the brand's templates are ready
   for them, and add `carouselPalette`, `carouselFonts` and `carouselStyle` together with the
   matching `library.ts` change, including `kit` on the brand's tokens.
4. Check the Brand tab in the admin.
