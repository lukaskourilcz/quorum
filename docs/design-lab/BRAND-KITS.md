# Venture brand kits

A brand kit holds a venture's approved logo files and the rules for using them. Kits live in
`studio/brand-kits/<venture>/`, one directory per venture id from `config/ventures.json`. You see
them in the admin at `/admin?venture=design-lab&tab=brand`.

| Kit | Venture | Studio brand | Source | Drawn in carousels |
| --- | --- | --- | --- | --- |
| DNESKAi | `caught-up` | `caught-up` | `lukaskourilcz/aifirst` at `978cf71` (`claude/dneskai-logo`) | yes: logo slot and palette |
| devShark | `marketingshark` | `devshark` | owner handoff of 2026-09-27 (V9 `recommended/`) | no, reference only |

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
- `rules`, `doNots`, `socialRules` and `typography`, in the spec's words.
- `assets`: per file its role, kind (logotype, lockup, mark, icon, share card), label, size,
  sha256, source path, intended grounds, whether it goes on photographs, the colours it draws, its
  viewBox, its minimum size, and `logoSlot`.

## How the studio uses a kit

`logotypeForBrand(studioBrand)` finds the kit and reads the files marked `logoSlot`, in manifest
order. A logo layer for that brand then nests the chosen SVG instead of setting the name in a font.
The renderer picks the file from the grounds behind the logo frame (`groundsBehindLayer`, the same
function the contrast gates use):

1. Over a photograph that is present, the file marked `onPhoto`.
2. When every ground behind the frame is one a file names, that file. Full colour comes first.
3. Otherwise the one-colour file with the better worst-case WCAG ratio.

Rule 2 adds no contrast pair, since the spec approved that file on that ground. Rules 1 and 3 go
through the usual 4.5:1 and APCA Lc 40 floors in their own ink. The logo sits in its frame with the
kit's clear space above and below and never drops under the kit's minimum height while the frame
is wide enough.

A kit whose files fail their hashes stops every render for its brand. A kit with no `logoSlot` file
changes nothing in carousels; the admin shows it as reference only.

`library.ts` must carry the manifest's `carouselPalette` values exactly, and
`studio/tests/brand-kits.test.ts` fails when they drift.

## Adding or replacing a kit

1. Copy the approved files into `studio/brand-kits/<venture>/` unchanged.
2. Write `manifest.json`. Run `pnpm -C studio test`: the kit test checks every size, hash, fill
   colour and viewBox, and that the directory holds nothing the manifest does not list.
3. Set `logoSlot` on the files the carousels may draw only once the brand's templates are ready
   for them, and add `carouselPalette` together with the matching `library.ts` change.
4. Check the Brand tab in the admin.
