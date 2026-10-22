# ADR: five DNESKAi kits as looks over the brand kit, flows in the kit, one layout engine

- Status: accepted for implementation on `fable/dneskai-kits`
- Date: 2026-10-22
- Worktree: `/Users/lukasbarsinbars/Developer/quorum-kits`, branched from `main` at `76314a3`
- Answers: requirements R1 to R10 of the engine brief; owner brief tasks D, E and G
- Changes made by this record: this file only

## 1. Two candidate records, one verdict

Two design records were written against the same brief: `adr-minimal-diff.md` (the smallest diff to
`renderer.ts` and `brand-kit.ts`, flows as a side map in the layout module) and `adr-clean-model.md`
(a self-contained kit tree, flows required and owned by each kit). I checked every claim in both
against the studio source, OwnDashboard's vendored copy and the orchestrator. The scores:

| Criterion | Minimal diff | Clean model | Notes |
| --- | --- | --- | --- |
| Byte identity for the editorial kit | 9 | 9 | Both pin `capOffset: 0.3` and return the cached `KitStyle` object for an absent look. The clean model adds two proofs that cost nothing: laid-out frame receipts and a stub-renders-the-editorial-bytes check. |
| Independence of the five kit files | 8 | 8 | Both give an author one `.ts` and one `.json`. The minimal diff derives the resolver from roles, so a kit cannot resolve a slide type differently by accident. The clean model lets each kit write its own resolver and flows table. |
| Risk to other ventures and gates | 7 | 8 | The minimal diff calls `contracts/brand-kit.schema.json` hand-maintained; it is generated (`orchestrator/src/contracts/json-schema.ts:215`) and `orchestrator/tests/contracts.test.ts` diffs it. The clean model synthesises a `default` look for devShark, which changes a shape no one asked to change. |
| OwnDashboard impact | 8 | 8 | Same exports through the same subpath. The clean model reports `kit: null` when the kit id itself was refused, which is the honest answer; it also names the limits-table key mismatch (template id against role). |
| Testability | 7 | 9 | The clean model's receipts, tampered-look copy, metric spot checks and specimen test are all cheap and all catch something the other list would miss. |
| Effort | 9 | 7 | The minimal diff keeps `dneskai-layout.test.ts` untouched and adds fewer parameters to flow descriptors. |

Winner: the minimal diff's skeleton. Grafted from the clean model: regeneration of the brand-kit
contract, the face count (46, not 47), required `flow` and `metrics` with the editorial flows table
owned by the editorial kit, frame receipts recorded before the first refactor, the stub-equals-
editorial hash check, lazy derivation of the OwnDashboard tables, `kit: null` on a refused kit id,
the tampered-look and specimen tests, and a static guard that the `dneskai-slide` import graph
never reaches `hooks/`.

Claims in the candidates that the code contradicts, so nobody carries them forward:

- There are 46 committed faces, not 47. `grep -c familyName:` counts the interface line too.
- `contracts/brand-kit.schema.json` is generated: `pnpm contracts:export` writes it from
  `ContractSchemas["brand-kit"]`, and the contracts test fails when the committed text differs.
- `studio/package.json` exports only `.`; the `./dneskai-slide` and `./fonts` subpaths exist in
  OwnDashboard's trimmed copy (`scripts/vendor-carousel-studio.sh:80-85`). Nothing here changes
  the upstream `exports`.
- `orchestrator/tests/studio-lifecycle.test.ts:33` reads `DNESKAI_PHOTO_TEMPLATES.get("dneskai-cover-photo")`
  from the barrel. The facade keeps the fourteen ids and the same objects.
- `vitest.config.ts` sets a 30 s test timeout. A test that renders every kit needs its own timeout,
  as `golden.test.ts` already sets 300 s.

## 2. Decision

A kit is three things layered on today's code, none of which touches a frozen schema:

1. **A look is an overlay on the kit style.** `brand-kits/caught-up/looks/<id>.json` holds a full
   carousel palette, three font slots and optional style flags. `KitStyle` gains `looks` and
   `defaultLook`. One function, `kitStyleWithLook(style, look?)`, returns the cached `KitStyle` object
   itself when no look is asked for and a shallow copy dressed in the look otherwise. The renderer's
   three entry points each gain one line and one optional `look` input. No synthetic look exists for
   a kit that declares none: devShark keeps `looks` empty and `defaultLook: null`.
2. **The DNESKAi registry wraps today's templates.** `studio/src/dneskai-kits/editorial.ts` composes
   the fourteen templates through the builders moved verbatim into `compose.ts`, declares their
   flows and binds the editorial look and metrics. Four stubs reuse the editorial templates under
   prefixed ids with their own look file. `defineDneskaiKit` derives the resolver from roles and the
   tables OwnDashboard keeps by hand. `dneskai-photo.ts` becomes a facade.
3. **The layout executes flows, never ids.** `layoutDneskaiSlide` requires a `flow` and a `metrics`
   record and dispatches on `flow.kind`. The flow vocabulary and the editorial metrics live in
   `dneskai-layout.ts`; the editorial flows table lives in the editorial kit. The id dispatch at
   `dneskai-layout.ts:150-160` goes away.

Cap height becomes data in `font-metrics.generated.ts`; the editorial kit pins `capOffset: 0.3`, so
its arithmetic does not move.

## 3. Constraints read from the code

- `dneskai-slide.ts` names `CAROUSEL_BRANDS["caught-up"]` at lines 359 and 417, resolves templates by
  literal id in `resolveTemplate` (178 to 202, with `image-2` presence choosing the pair) and writes
  `variant: "INK"` at 353. Fifteen problem codes exist.
- `dneskai-layout.ts` dispatches on template ids at 150 to 160 and reads module constants:
  `DNESKAI_GAPS` (thirteen gaps), `DNESKAI_AREA` 166 to 1196, `DNESKAI_OPTICAL_SHARE` 0.42,
  `DNESKAI_THUMBNAIL_GRID` 3 × 296 × 198 gap 24, `PANEL` 152/24/17/22/28/48, `CAP_OFFSET` 0.3.
  `centredTop` already takes an `area` argument; `stack` reads `DNESKAI_SPACE_UNIT` directly.
- `kit-style.ts` caches one `KitStyle` per kit in `styleCache`; `kitStyleFor` returns that object.
  `renderer.ts` calls `kitStyleFor` in exactly three places: `carouselTextFits` (352),
  `validateTemplateAsRendered` (431) and `renderSlides` (479). `TextSlotFit` carries no face;
  `FittedText` carries none either.
- `brand-kit.ts` imports only node and zod. `grounds.ts:4` states the rule: it stays a leaf.
  `CarouselPaletteSchema`, `CarouselFontSchema` and `NoteSchema` are module-private and reusable.
- `readBrandKit` returns early for a missing or unparsable manifest; every early return must carry
  the new `looks` field.
- The caught-up manifest's `carouselStyle` is `{ flat: true, squareCorners: true, logo: "every-slide" }`
  with no grounds, no sequence and no corner mark. The logotype files are approved on `#ffffff` and
  `#f7f7f5` (full colour) and `#14161a` (dark); `logo-mono-white` is the photograph file.
- `studio/tests/brand-kits.test.ts` fails on any entry in a kit directory the manifest does not
  name. `glyph-coverage.test.ts` pins sixteen bound families with Outfit unbound.
  `kit-rendering.test.ts` derives the faces it rasterises from `CAROUSEL_BRANDS` fonts only.
- `index.ts` re-exports every module with `export *`. TypeScript reports TS2308 only when two
  paths resolve to different declarations, so a symbol re-exported twice from one declaration is
  legal; this record still gives every new symbol one path.
- `portable.test.ts` compiles `src/` with `tsconfig.build.json` (`include: src/**/*.ts`) into an
  empty directory and copies `brand-kits/caught-up` recursively, so `looks/` and `dneskai-kits/`
  travel. OwnDashboard's vendor script does the same `cp -R`, and `next.config.ts` traces
  `vendor/carousel-studio/brand-kits/**/*`.
- All 46 faces carry an OS/2 table of version 3 or 4 with `sCapHeight` and `sxHeight` set, and
  every one is TrueType (`glyf`, no `CFF `). Measured on 2026-10-22 with a scratch probe; the
  values are in the appendix.
- The golden file pins eleven PNG hashes (`updatedAt` 2026-10-20) rendered through
  `renderDneskaiSlide` with no kit. `golden/manifest.json` pins thirty family decks;
  `tehdejsi-determinism.test.ts` pins one literal sha256.

## 4. R1: looks live in the brand kit

### 4.1 Manifest extension (`brand-kit/1`, additive)

```ts
// brand-kit.ts
const LookIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/).max(40);
/** The studio's three type slots, as `carouselFonts` spells them. Named so a look reuses it. */
const CarouselFontsSchema = z.strictObject({ headline: CarouselFontSchema, body: CarouselFontSchema, mono: CarouselFontSchema });

// Inside BrandKitManifestSchema, after `carouselStyle`:
  /**
   * Named looks, one file each in `looks/<id>.json`. `default` is the look a render uses when none
   * is asked for; its palette and fonts must equal `carouselPalette` and `carouselFonts` entry for
   * entry, which is what keeps every render made before looks existed byte-identical.
   */
  carouselLooks: z.strictObject({ default: LookIdSchema, ids: z.array(LookIdSchema).min(1).max(12) }).optional(),
```

`superRefine` additions: `ids` unique; `default` listed in `ids`; `carouselLooks` requires
`carouselPalette` and `carouselFonts`. The manifest keeps `carouselFonts` as the named schema; the
JSON output does not change shape for that field.

### 4.2 Look file schema

```ts
// brand-kit.ts
export const CarouselLookSchema = z.strictObject({
  schemaVersion: z.literal("brand-kit-look/1"),
  id: LookIdSchema,
  label: z.string().trim().min(2).max(80),
  /** What the look is for, for the Design Lab and the kit author. */
  purpose: NoteSchema,
  /** The seven carousel tokens, each with its value and where it came from. */
  palette: CarouselPaletteSchema,
  /** The three type slots. Families are checked against `FONT_FAMILIES` in `kit-style.ts`. */
  fonts: CarouselFontsSchema,
  /**
   * Flags the look sets over the kit's `carouselStyle`. A look may set `flat` or `squareCorners`
   * where the kit leaves them unset and may not clear one the kit sets: those are the spec's
   * do-nots and a look is not a spec change. `logo` is the look's own.
   */
  style: z.strictObject({
    flat: z.boolean().optional(),
    squareCorners: z.boolean().optional(),
    logo: z.enum(["every-slide", "last-slide"]).optional()
  }).default({})
});
export type CarouselLook = z.infer<typeof CarouselLookSchema>;

export const BRAND_KIT_LOOKS_DIRECTORY = "looks";

export interface BrandKitReading {
  directory: string;
  manifest: BrandKitManifest | null;
  /** The parsed look files in manifest order. Empty when the manifest lists none or any failed. */
  looks: CarouselLook[];
  problems: string[];
}
```

`readBrandKit(venture, root?)` keeps its signature and never throws. After the asset loop it reads
`looks/<id>.json` for every listed id and pushes one problem string per fault:

- `looks/<id>.json is missing`
- `looks/<id>.json is not JSON: <message>`
- `looks/<id>.json: <zod path>: <message>`
- `looks/<id>.json names look <other>, file is <id>`
- `looks/ holds <file> the manifest does not list`
- `the default look <id> differs from carouselPalette at <token>` and
  `the default look <id> differs from carouselFonts at <slot>`: value and source, family and source,
  entry for entry
- `look <id> clears <flag>, which the kit sets`

The family check lives in `readKitStyle`, because `brand-kit.ts` imports nothing from the studio.
`kitLogotype`, `readKitStyle` and `kitStyleFor` already throw on any problem, so a damaged look file
refuses every render of the brand, the posture a tampered logo file has today.

The look schema is a studio file format and is not registered in `ContractSchemas`. The manifest
schema is, so `contracts/brand-kit.schema.json` is regenerated in the commit that extends it.

### 4.3 The editorial look and the four stubs

`studio/brand-kits/caught-up/looks/editorial.json`, every value and source copied from the manifest:

```json
{
  "schemaVersion": "brand-kit-look/1",
  "id": "editorial",
  "label": "Editorial",
  "purpose": "DNESKAi as it posts today: white and paper grounds, ink type, blueprint blue for the rule, the spine and the statement ground. The default look; every render made before looks existed is drawn in it.",
  "palette": {
    "background": { "value": "#ffffff", "source": "--surface-reading in DESIGN_SYSTEM.md; the white ground the light logotype is approved for." },
    "surface": { "value": "#f7f7f5", "source": "--surface-page in DESIGN_SYSTEM.md; the paper ground the light logotype is approved for." },
    "surface-strong": { "value": "#efefec", "source": "--surface-subtle in DESIGN_SYSTEM.md." },
    "foreground": { "value": "#14161a", "source": "--text-primary in DESIGN_SYSTEM.md." },
    "muted": { "value": "#3c4149", "source": "--text-secondary in DESIGN_SYSTEM.md." },
    "accent": { "value": "#2f5ae6", "source": "Blueprint blue: --accent-primary and the DNESK colour of the logotype." },
    "secondary": { "value": "#1a3ab0", "source": "The Ai colour of the logotype (brandAi in lib/og-theme.ts)." }
  },
  "fonts": {
    "headline": { "family": "Space Grotesk", "source": "BRAND_SYSTEM.md: display headlines, section headings, navigation and controls." },
    "body": { "family": "Source Serif 4", "source": "BRAND_SYSTEM.md: article prose, deks, definitions and descriptive card copy." },
    "mono": { "family": "IBM Plex Mono", "source": "BRAND_SYSTEM.md: dates, issue identifiers, source ids, tags, captions and measured values." }
  },
  "style": {}
}
```

The manifest gains, after `carouselStyle`:

```json
"carouselLooks": { "default": "editorial", "ids": ["editorial", "bold", "explainer", "magazine", "ticker"] }
```

`bold.json`, `explainer.json`, `magazine.json` and `ticker.json` copy `editorial.json` with their own
`id`, `label` and a `purpose` that names the direction (bold type and statement; data and explainer;
magazine collage; minimal news ticker) and says the values are the editorial ones until the kit's
author replaces them. The kit's `flat: true` and `squareCorners: true` hold in every look.

### 4.4 Kit style

```ts
// kit-style.ts
export interface KitLook {
  id: string;
  label: string;
  purpose: string;
  palette: Palette;
  fonts: BrandTokens["fonts"];
  /** Resolved: the kit's flag or the look's, whichever is set. */
  flat: boolean;
  squareCorners: boolean;
  /** The look's placement when set, else the kit's. */
  logo: "every-slide" | "last-slide";
  /** Every colour this look's palette draws. */
  colours: ReadonlySet<string>;
}

export interface KitStyle {
  // ...every existing field unchanged...
  /** The kit's looks by id, in manifest order. Empty for a kit that declares none. */
  looks: ReadonlyMap<string, KitLook>;
  /** The look a render uses when none is asked for; null when the kit declares none. */
  defaultLook: string | null;
}

/**
 * The kit style as one of its looks dresses it. The style itself when no look is asked for, so a
 * caller that passes nothing receives the object it received before looks existed. Throws for a
 * look the kit does not declare, and for a look asked of a brand that has no kit.
 */
export function kitStyleWithLook(style: KitStyle, look?: string): KitStyle;
export function kitStyleWithLook(style: KitStyle | null, look?: string): KitStyle | null;

/** Every family any look of the kit binds, de-duplicated, for the coverage gates. */
export function kitLookFamilies(style: KitStyle): string[];
```

`readKitStyle` builds `looks` from `reading.looks`, resolves `flat` and `squareCorners` as
`style.flat || look.style.flat`, takes `logo` from the look when set, throws
`Brand kit ${venture} look ${id} names a family the studio does not ship: ${family}` for a family
outside `FONT_FAMILIES` (`kit-style.ts` may import `fonts.ts`; `fonts.ts` imports
`font-metrics.generated.ts`, `locales.ts` and schema types, none of which import `kit-style.ts`),
and folds every look's palette values into `colours`. `kitStyleFor` returns the cached style, which
exposes the looks (R2). `dressBrand`, `kitTemplate`, `groundAt`, `brandOnGround`, `logoAllowedAt`,
`forgetKitStyles` and `brandKitProblem` keep their bodies.

Precedence, written in the module header: a ground from `groundSequence` replaces the palette per
slide position, as today; a look replaces the kit's base palette, fonts and flags; the kit's base
is what a render without a look draws. DNESKAi declares no grounds, so for it a look is the whole
palette. Grounds and corner marks stay kit-level in this round.

The logotype on a look's grounds needs no code: `chooseLogotypeVariant` reads each file's approved
grounds literally and falls back to the better one-colour file, which the contrast gates measure. A
look whose `background` is none of `#ffffff`, `#f7f7f5` or `#14161a` gets the mono logotype.

## 5. R2: the renderer takes a look

```ts
// renderer.ts
export interface CarouselRenderInput {
  template: CarouselTemplate;
  payload: CarouselPayload;
  brand: BrandTokens;
  format: CarouselFormat;
  images?: Readonly<Record<string, Buffer>>;
  deck?: DeckPosition;
  /**
   * The kit look to dress the brand in (`brand-kits/<kit>/looks/<look>.json`). Absent: the kit's
   * base palette and fonts, which is what every render before looks existed was drawn in. An
   * unknown look, or a look on a brand that names no kit, throws as an unusable kit does.
   */
  look?: string;
}

export interface TextSlotFit {
  slideIndex: number;
  slideId: string;
  slot: string;
  fitted: FittedText;
  /** The committed face the slot is set in, so a layout can read its cap height. */
  face: FaceMetrics;
}

export function carouselTextFits(input: Pick<CarouselRenderInput, "template" | "payload" | "brand" | "format" | "look">): TextSlotFit[];

export function validateTemplateAsRendered(template: CarouselTemplate, brand: BrandTokens, format: CarouselFormat, look?: string): TemplateCheck[];
```

The body diff is one line in three places, plus `face` on the fit entry:

```ts
// carouselTextFits
const style = kitStyleWithLook(kitStyleFor(declared), input.look);
// renderSlides
const style = kitStyleWithLook(kitStyleFor(declared), input.look);
// validateTemplateAsRendered, inside the existing try, so an unknown look is a failing brand-tokens check
style = kitStyleWithLook(kitStyleFor(brand), look);
```

`dressBrand(declared, style)`, `kitTemplate(parsed, style)`, `logoAllowedAt(style, position)`,
`slideBrand`, `cornerMarkSvg` and the per-ground validation loop read the overlaid style unchanged.
`renderCarouselSvg`, `renderCarouselSlideSvg`, `renderCarouselPng` and `renderCarouselSlidePng` pass
`input` through, so `look` reaches `renderSlides` without a signature change. `face` is
`resolveFace(brand.fonts[layer.fontToken], layer.fontWeight)` on the dressed brand. The image cut
key (`isCutFor`) does not include the look: a crop is the same cut in every look.

`site/src/lib/carousel-studio.ts:166` keeps its three-argument call and compiles unchanged.

## 6. R3: the DNESKAi API takes a kit

### 6.1 Input and result

```ts
// dneskai-slide.ts
export interface DneskaiSlideInput {
  type: DneskaiSlideType;
  variant?: DneskaiVariant;
  headline?: string;
  body?: string;
  kicker?: string;
  credit?: string;
  sources?: readonly string[];
  images?: readonly DneskaiImageInput[];
  position: { index: number; count: number };
  locale?: "cs" | "en";
  /** The design kit, one of `DNESKAI_KIT_IDS`. Absent means `editorial`, which draws today's slides. */
  kit?: DneskaiKitId;
}

export type DneskaiProblemCode = /* the fifteen existing codes */ | "kit-invalid";

export interface DneskaiSlideResult {
  status: "rendered" | "refused";
  png: Buffer | null;
  pngHash: string | null;
  svgHash: string | null;
  truncatedSlots: string[];
  problems: DneskaiSlideProblem[];
  template: { id: string; version: string } | null;
  payload: CarouselPayload | null;
  /** The kit the slide was (or would have been) drawn in; null when the kit id itself was refused. */
  kit: DneskaiKitId | null;
}
```

`kit-invalid` is blocking with `field: "kit"`, raised in `inspect` before `resolveTemplate` when
`input.kit` is set and `dneskaiKit(input.kit)` is null. The payload schema does not change: the kit
is a render input like the brand. The template id in the result names the kit for every kit but
editorial, and `kit` names it for all five.

`renderDneskaiSlide` and `validateDneskaiSlide` keep their names and parameter shapes. Inside,
`inspect` resolves `const kit = dneskaiKit(input.kit ?? DNESKAI_DEFAULT_KIT)`, resolves the template
through `kit.resolve(type, variant, slots)`, passes `look: kit.look` to `carouselTextFits`, passes
`flow: kit.flows.get(template.id)!`, `metrics: kit.metrics` and each slot's
`capHeight: fit.face.capHeight / 1_000` to `layoutDneskaiSlide`, and `renderDneskaiSlide` passes
`look: kit.look` to `renderCarouselSlidePng`. The brand stays `CAROUSEL_BRANDS["caught-up"]`: every
kit is a look of the one DNESKAi brand kit, so the logotype files, the flat rule and the square
corners are shared by construction. The `INK` literal moves to `DNESKAI_INK_VARIANT`.

### 6.2 The contract module

```ts
// dneskai-kits/contract.ts
export const DNESKAI_KIT_IDS = ["editorial", "bold", "explainer", "magazine", "ticker"] as const;
export type DneskaiKitId = (typeof DNESKAI_KIT_IDS)[number];
export const DNESKAI_DEFAULT_KIT: DneskaiKitId = "editorial";

export const DNESKAI_SLIDE_TYPES = ["cover-photo", "figure", "split", "statement", "sources", "single"] as const;
export type DneskaiSlideType = (typeof DNESKAI_SLIDE_TYPES)[number];
export type DneskaiVariant = "accent" | "ink" | "photo" | "type";
/** The variants each slide type takes: today's table from `resolveTemplate`, shared by every kit. */
export const DNESKAI_VARIANTS: Readonly<Record<DneskaiSlideType, readonly DneskaiVariant[]>>;
/** The template variant id a statement's `ink` writes into the payload. */
export const DNESKAI_INK_VARIANT = "INK";

export const DNESKAI_MAX_SOURCES = 4;
export const DNESKAI_MAX_THUMBNAILS = 6;
export const dneskaiSourceSlot = (index: number): string => `source-${index + 1}`;

/** The compositions a kit implements. Sources is one role with seven templates, 0 to 6 thumbnails. */
export const DNESKAI_TEMPLATE_ROLES = ["cover-photo", "figure", "split", "split-pair", "statement", "sources", "single-photo", "single-type"] as const;
export type DneskaiTemplateRole = (typeof DNESKAI_TEMPLATE_ROLES)[number];

/** Which role a slide resolves to, and for sources how many thumbnails. Today's rules, kit-independent. */
export function dneskaiRoleOf(type: DneskaiSlideType, variant: DneskaiVariant | undefined, imageSlots: readonly string[]): { role: DneskaiTemplateRole; thumbnails: number };

export const DNESKAI_TEXT_FIELDS = ["headline", "body", "kicker", "credit", "sources"] as const;
export type DneskaiTextField = (typeof DNESKAI_TEXT_FIELDS)[number];
/** Slots code writes: never a field OwnDashboard gates. */
export const DNESKAI_CODE_OWNED_SLOTS = ["folio", "title", "images-label", "disclosure"] as const;

/**
 * The character limit of every text slot of every role, which every kit's templates must set
 * exactly. One deck written inside these limits sets without clipping in all five kits, because
 * each kit's frames pass the overflow gate at these limits. Today's editorial values.
 */
export const DNESKAI_TEXT_LIMITS: Readonly<Record<DneskaiTemplateRole, Readonly<Record<string, number>>>> = {
  "cover-photo": { headline: 110, kicker: 56, credit: 80 },
  figure: { folio: 9, headline: 110, body: 260, credit: 80 },
  split: { folio: 9, kicker: 28, headline: 110, body: 330, credit: 80 },
  "split-pair": { folio: 9, kicker: 28, headline: 110, body: 320, credit: 80 },
  statement: { folio: 9, headline: 170, body: 240 },
  sources: { folio: 9, title: 30, "source-1": 190, "source-2": 190, "source-3": 190, "source-4": 190, "images-label": 40, disclosure: 200 },
  "single-photo": { headline: 110, body: 100, kicker: 44, credit: 30 },
  "single-type": { kicker: 56, headline: 120, body: 280, credit: 80 }
};

/** The image slots a role carries, each with its `optional` flag; sources carries `image-1` to `image-N`, all required. */
export function dneskaiImageSlots(role: DneskaiTemplateRole, thumbnails = 0): readonly { slot: string; optional: boolean }[];
/** The slide variant ids a role's template declares: statement `["INK"]`, every other role `[]`. */
export const DNESKAI_TEMPLATE_VARIANTS: Readonly<Record<DneskaiTemplateRole, readonly string[]>>;
```

`dneskaiRoleOf` is today's `resolveTemplate` switch. `split` is `split-pair` when `imageSlots`
includes `image-2`: the slot list, not a count, keeps today's problem list for an input like
`[image-1, image-3]`, which resolves to the single split and reports one `image-unexpected`; a count
would resolve the pair and add an `image-missing`. `sources` takes
`Math.min(imageSlots.length, DNESKAI_MAX_THUMBNAILS)` thumbnails. `single` is `single-photo` unless the
variant is `type`.

The limits are keyed by role and slot rather than one number per slot because today's templates
give `headline` 110 on six roles, 170 on the statement and 120 on the type-only single, `body` from
100 to 330 and `kicker` 28 to 56. One number per slot would either raise a limit a frame cannot hold
at its minimum size (the overflow gate fails; `dneskai-layout.test.ts` fills every slot to `maxChars`)
or lower one and move bytes for a string between the two limits (`fitText` slices at `maxChars`).
Keyed by role, the table is today's values, and the shared `dneskaiRoleOf` picks the role, so a deck
meets the same limit in every kit. `sources-0` has no `images-label`; the contract test checks the
slots a template has.

### 6.3 The kit shape and the registry

```ts
// dneskai-kits/kit.ts
export interface DneskaiFieldFace { family: string; weight: number; uppercase: boolean }

export interface DneskaiKitTemplate {
  role: DneskaiTemplateRole;
  /** Sources only: how many thumbnails this template carries. */
  thumbnails?: number;
  template: CarouselTemplate;
  flow: DneskaiFlow;
}

export interface DneskaiKit {
  readonly id: DneskaiKitId;
  readonly label: string;
  readonly purpose: string;
  /** The look in `brand-kits/caught-up/looks/` the kit is drawn in. */
  readonly look: string;
  /** Every template of the kit, by template id, in registration order. */
  readonly templates: ReadonlyMap<string, CarouselTemplate>;
  readonly roles: ReadonlyMap<string, DneskaiTemplateRole>;
  readonly flows: ReadonlyMap<string, DneskaiFlow>;
  readonly metrics: DneskaiLayoutMetrics;
  /** The template a slide resolves to: `dneskaiRoleOf`, then this kit's template for the role. */
  resolve(type: DneskaiSlideType, variant: DneskaiVariant | undefined, imageSlots: readonly string[]): CarouselTemplate;
  /** Derived on first read from the templates and the look's faces: the face each written field is set in. */
  readonly fieldFaces: Readonly<Record<DneskaiTextField, DneskaiFieldFace>>;
  /** Derived from the templates at definition: the written fields each slide type draws. */
  readonly placedFields: Readonly<Record<DneskaiSlideType, readonly DneskaiTextField[]>>;
}

export function defineDneskaiKit(input: {
  id: DneskaiKitId;
  label: string;
  purpose: string;
  look: string;
  metrics: DneskaiLayoutMetrics;
  templates: readonly DneskaiKitTemplate[];
}): DneskaiKit;

// dneskai-kits/registry.ts
export const DNESKAI_KITS: ReadonlyMap<DneskaiKitId, DneskaiKit>;
/** The kit an id names, or null for an id the registry does not hold. */
export function dneskaiKit(id: string): DneskaiKit | null;
```

`defineDneskaiKit` throws at module load when a kit is structurally incomplete, so a half-authored
kit fails the test run rather than a render: every role present, sources at 0 to 6 thumbnails,
template ids unique, each template a single-slide `carousel-template/2` for the 4:5 master with a
flow. These checks read no file. It derives:

- `placedFields` at definition, as the union per slide type of the text slots that are not
  code-owned, with `source-N` folded to `sources`.
- `fieldFaces` on first access, memoised: for every non-code-owned text layer the family is the
  look's font for the layer's `fontToken` (read through `kitStyleWithLook(kitStyleFor(CAROUSEL_BRANDS["caught-up"]), kit.look)`),
  the weight is `resolveFace(family, layer.fontWeight).weight`, `uppercase` the layer's. A field set
  in two faces across the kit throws with both faces and templates named, because OwnDashboard's
  glyph gate assumes one face per field per kit and that assumption should be a contract. The
  getter is lazy so that importing the registry reads no file and a damaged kit fails at the render,
  where today's code fails, and never at `import`.

`kit.ts` imports `kit-style.ts`, `library.ts`, `fonts.ts` and `dneskai-layout.ts`, all of which sit
below it. No module under `dneskai-kits/` imports `dneskai-slide.ts` or `dneskai-photo.ts`.

Export paths: the registry and contract symbols reach the package barrel through `dneskai-slide.ts`
only, which re-exports `DNESKAI_KITS`, `DNESKAI_KIT_IDS`, `DNESKAI_DEFAULT_KIT`, `dneskaiKit`,
`DNESKAI_SLIDE_TYPES`, `DNESKAI_VARIANTS`, `DNESKAI_TEMPLATE_ROLES`, `dneskaiRoleOf`,
`DNESKAI_TEXT_FIELDS`, `DNESKAI_CODE_OWNED_SLOTS`, `DNESKAI_TEXT_LIMITS`, `dneskaiImageSlots`,
`DNESKAI_TEMPLATE_VARIANTS` and the types `DneskaiKit`, `DneskaiKitId`, `DneskaiKitTemplate`,
`DneskaiFieldFace`, `DneskaiSlideType`, `DneskaiVariant`, `DneskaiTemplateRole`, `DneskaiTextField`,
`DneskaiFlow`, `DneskaiLayoutMetrics`. `dneskai-photo.ts` re-exports `DNESKAI_MAX_SOURCES`,
`DNESKAI_MAX_THUMBNAILS` and `dneskaiSourceSlot` from the contract, as the only path for those
three. `index.ts` does not change. OwnDashboard reaches everything through `./dneskai-slide`, the
subpath it imports.

## 7. R4: the layout executes flows

```ts
// dneskai-layout.ts
export type DneskaiGapName = keyof typeof DNESKAI_GAPS;

export interface DneskaiStackItem {
  /** A text slot, an image slot, `rule` (the slide's first rule layer) or `thumbnails` (sources only). */
  key: string;
  /** Visual space above the item, ink to ink: a named gap reads the kit's table, a number is units. Ignored on the first item. */
  gap: DneskaiGapName | number;
}

export type DneskaiFlow =
  | { kind: "cover-static" }
  | { kind: "figure" }
  | { kind: "split" }
  | { kind: "split-pair" }
  | { kind: "statement" }
  | { kind: "sources" }
  | { kind: "single-type" }
  | { kind: "single-photo" }
  | { kind: "stack"; anchor: "centre" | "top"; items: readonly DneskaiStackItem[] };

export interface DneskaiLayoutMetrics {
  readonly unit: number;
  /** All thirteen gaps; a kit copies the editorial table and changes what it wants. */
  readonly gaps: Readonly<Record<DneskaiGapName, number>>;
  readonly area: { readonly top: number; readonly bottom: number };
  readonly opticalShare: number;
  readonly thumbnails: { readonly columns: number; readonly width: number; readonly height: number; readonly gap: number };
  readonly panel: { readonly top: number; readonly padding: number; readonly inset: number; readonly toBody: number; readonly toKicker: number; readonly clearance: number };
  /**
   * Where the cap line sits under the top of a line box, in em, for every face. Absent: one minus
   * the face's own cap height from the metrics table. The editorial kit pins 0.3, the constant its
   * recorded hashes were laid out with.
   */
  readonly capOffset?: number;
}

/** Today's constants stay exported under their names; `PANEL` and `CAP_OFFSET` become exports. */
export const DNESKAI_PANEL = { top: 152, padding: 24, inset: 17, toBody: 22, toKicker: 28, clearance: 48 } as const;
export const DNESKAI_CAP_OFFSET = 0.3;
export const DNESKAI_EDITORIAL_METRICS: DneskaiLayoutMetrics = {
  unit: DNESKAI_SPACE_UNIT, gaps: DNESKAI_GAPS, area: DNESKAI_AREA, opticalShare: DNESKAI_OPTICAL_SHARE,
  thumbnails: DNESKAI_THUMBNAIL_GRID, panel: DNESKAI_PANEL, capOffset: DNESKAI_CAP_OFFSET
};

/** The two named stacks, as data, so a test can hold the named kinds to their expansions. */
export const DNESKAI_STACK_PRESETS: { readonly statement: DneskaiFlow; readonly singleType: DneskaiFlow } = {
  statement: { kind: "stack", anchor: "centre", items: [{ key: "headline", gap: 0 }, { key: "body", gap: "headlineToNote" }] },
  singleType: { kind: "stack", anchor: "centre", items: [{ key: "rule", gap: 0 }, { key: "kicker", gap: "ruleToLabel" }, { key: "headline", gap: "labelToText" }, { key: "body", gap: "headlineToNote" }] }
};

export interface DneskaiMeasuredText {
  lines: number;
  fontSize: number;
  /** The face's cap height in em (`FaceMetrics.capHeight / 1000`). Read only when the metrics set no `capOffset`. */
  capHeight?: number;
}

export interface DneskaiLayoutInput {
  template: CarouselTemplate;
  text: Readonly<Record<string, DneskaiMeasuredText>>;
  pictures: Readonly<Record<string, DneskaiLaidPicture>>;
  flow: DneskaiFlow;
  metrics: DneskaiLayoutMetrics;
}

export function layoutDneskaiSlide(input: DneskaiLayoutInput): CarouselTemplate;
```

`flow` and `metrics` are required. The only production caller is `dneskai-slide.ts`; no venture,
the site or the orchestrator calls `layoutDneskaiSlide`, and the test helper changes with it. The
module keeps no table of template ids: `layoutDneskaiSlide` expands `statement` and `single-type`
through `DNESKAI_STACK_PRESETS` and switches on the kind. Every function that read a module constant
takes `metrics`: `textBlock(input, slot, metrics)`, `stack(items, metrics)`, `centredTop(height, metrics)`,
`heightsOf(input, metrics)`, `figure`, `split`, `splitPair`, `sources`, `singlePhoto`. Their statements
keep their order and their `Math.round`, `Math.floor` and `Math.ceil` calls, with today's slot names,
because R6 fixes the slot names for every kit. One `stacked(input, flow, metrics)` replaces
`statement` and `singleType` and performs the same `stack([...])` calls with the same keys and gaps.

In a `stack`: a text slot takes its `textBlock`; `rule` takes the first rule layer's declared height
as a `box`; an image slot takes `pictureHeight` at its declared width and height (a contained
picture at the rectangle it is drawn in, a covering one at its declared height); `thumbnails` is
accepted by the sources kind only. `anchor: "centre"` places the group at `centredTop`, `"top"` at
`metrics.area.top`. An item that names no layer on the template throws
`Flow item ${key} names no layer on ${template.id}`. Text frames that move stay top-anchored by
`moved`, as today.

The cap line: `textBlock` computes `inkTop = fontSize * (metrics.capOffset ?? 1 - (measured.capHeight ?? 0.7))`.
With the editorial metrics that is `fontSize * 0.3`, today's `CAP_OFFSET` as a literal; `1 - 0.7` is
`0.30000000000000004` in floating point and could flip a half-pixel rounding, which is why the pin
is a literal and not a derivation. A kit that sets no `capOffset` and a slot set in Anton gets
`fontSize * 0.141`, which is R5's point.

The editorial flows table lives in the editorial kit:

```ts
// dneskai-kits/editorial.ts
export const DNESKAI_EDITORIAL_FLOWS: Readonly<Record<string, DneskaiFlow>> = {
  "dneskai-cover-photo": { kind: "cover-static" },
  "dneskai-figure": { kind: "figure" },
  "dneskai-split": { kind: "split" },
  "dneskai-split-pair": { kind: "split-pair" },
  "dneskai-statement": { kind: "statement" },
  "dneskai-single-photo": { kind: "single-photo" },
  "dneskai-single-type": { kind: "single-type" },
  ...Object.fromEntries(Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, count) => [`dneskai-sources-${count}`, { kind: "sources" }]))
};
```

Every number of the editorial kit stays: `DNESKAI_EDITORIAL_METRICS` holds the same objects the
constants are, the flows are today's branches, and `stacked` performs today's `stack` calls.

## 8. R5: cap height in the font metrics

```ts
// font-metrics.generated.ts (interface written by the generator; existing fields unchanged)
export interface FaceMetrics {
  readonly familyName: string;
  readonly rasterFamily: string;
  readonly weight: number;
  readonly file: string;
  readonly average: number;
  readonly fallback: number;
  /** The cap height in thousandths of an em: OS/2 sCapHeight over unitsPerEm, else the H glyph's yMax from glyf, else 700 (assumed). */
  readonly capHeight: number;
  /** The x-height in thousandths of an em: OS/2 sxHeight over unitsPerEm, else the x glyph's yMax from glyf, else 500 (assumed). */
  readonly xHeight: number;
  readonly widths: Readonly<Record<string, string>>;
}
```

Thousandths, as `average` and `fallback` already are, so one record carries one unit. The layout
input takes em (`capHeight / 1_000`), converted once in `dneskai-slide.ts`.

`scripts/generate-font-metrics.ts` gains `verticalMetrics(data, found, glyphs, unitsPerEm)`:

```ts
const os2 = found.get("OS/2")!;
const version = data.readUInt16BE(os2.offset);
// OS/2 version 2 and later: sxHeight at byte 86, sCapHeight at byte 88, both FWORD.
const fromTable = (offset: number) => (version >= 2 ? data.readInt16BE(os2.offset + offset) : 0);
const fromGlyph = (character: string) => {
  const glyph = glyphs.get(character.codePointAt(0)!);
  const loca = found.get("loca"); const glyf = found.get("glyf"); const head = found.get("head")!;
  if (glyph === undefined || !loca || !glyf) return 0;
  const long = data.readInt16BE(head.offset + 50) === 1;                       // head.indexToLocFormat
  const start = long ? data.readUInt32BE(loca.offset + glyph * 4) : data.readUInt16BE(loca.offset + glyph * 2) * 2;
  const end = long ? data.readUInt32BE(loca.offset + (glyph + 1) * 4) : data.readUInt16BE(loca.offset + (glyph + 1) * 2) * 2;
  return end > start ? data.readInt16BE(glyf.offset + start + 8) : 0;           // yMax of the glyph header
};
const pick = (table: number, glyph: number, assumed: number, name: string) => {
  if (table > 0) return { value: Math.round((table / unitsPerEm) * 1_000), assumed: false };
  if (glyph > 0) return { value: Math.round((glyph / unitsPerEm) * 1_000), assumed: false };
  process.stderr.write(`${slug}/${file}: no OS/2 ${name} and no glyph bounds, assuming ${assumed}\n`);
  return { value: assumed, assumed: true };
};
return { capHeight: pick(fromTable(88), fromGlyph("H"), 700, "sCapHeight"), xHeight: pick(fromTable(86), fromGlyph("x"), 500, "sxHeight") };
```

The emitter writes `    capHeight: N,` and `    xHeight: N,` after `fallback` and before `widths`, and
above a face whose value was assumed it writes
`    // capHeight and xHeight assumed: no OS/2 v2 table and no glyf outline for H and x`, so the
assumption is visible in the diff. `Face` gains the two fields. `characterSet()`, the width
inversion and `average` are untouched, so `script-capacity.test.ts` and every `widths` entry stay
byte for byte. Measured on the committed set, every face takes the table path; the glyf and assumed
paths are written for a face that arrives later. `pnpm -C studio fonts:metrics` runs once and the
generator and the regenerated table go in one commit; `git diff --stat` on that commit shows the
table changed by additions only.

The editorial faces: Space Grotesk 700 `capHeight: 700`, IBM Plex Mono 400 `698`, Source Serif 4 400
`670`. `1 - 0.670 = 0.330` is 0.03 em from the editorial constant: at 34 px body type that is one
pixel, and one pixel moves a hash, which is the second reason the editorial kit pins `capOffset`.

## 9. R6: kit files and the shared contract

```
studio/src/dneskai-kits/
  contract.ts     ids, slide types, variants, roles, text fields, DNESKAI_TEXT_LIMITS, image slots, dneskaiRoleOf, source constants
  compose.ts      the private builders moved verbatim from dneskai-photo.ts (box, text, fill, logo, folio, credit, kicker, body,
                  plated, bleed, COVER_SHADE, DNESKAI_FORMATS, template), plus rebrandTemplate and DNESKAI_MARGINS { left: 72, measure: 936, right: 1008 }
  kit.ts          DneskaiKit, DneskaiKitTemplate, DneskaiFieldFace, defineDneskaiKit
  editorial.ts    the fourteen templates, bodies moved verbatim; DNESKAI_EDITORIAL_FLOWS; EDITORIAL_TEMPLATES; EDITORIAL_KIT
  bold.ts         stub
  explainer.ts    stub
  magazine.ts     stub
  ticker.ts       stub
  registry.ts     DNESKAI_KITS, dneskaiKit
studio/brand-kits/caught-up/looks/{editorial,bold,explainer,magazine,ticker}.json
```

A stub, in full:

```ts
// dneskai-kits/bold.ts
import { DNESKAI_EDITORIAL_METRICS } from "../dneskai-layout.js";
import { rebrandTemplate } from "./compose.js";
import { EDITORIAL_TEMPLATES } from "./editorial.js";
import { defineDneskaiKit } from "./kit.js";

/**
 * Bold type and statement. A stub: the editorial compositions under this kit's ids and its own
 * look file, so the registry is complete and the contract test holds. Replace the templates, the
 * flows and the metrics here and the look in brand-kits/caught-up/looks/bold.json; nothing outside
 * this file and that one has to change. A wider face can fail the overflow check for a frame that
 * passes in Space Grotesk: widen the frame, add a line or lower the minimum size, never the shared
 * DNESKAI_TEXT_LIMITS.
 */
export const BOLD_KIT = defineDneskaiKit({
  id: "bold",
  label: "Bold",
  purpose: "Big type and one statement per slide, for a day with one strong claim and few pictures.",
  look: "bold",
  metrics: DNESKAI_EDITORIAL_METRICS,
  templates: EDITORIAL_TEMPLATES.map((entry) => ({ ...entry, template: rebrandTemplate(entry.template, "bold") }))
});
```

`rebrandTemplate(template, kit)` re-parses the template with `id: template.id.replace(/^dneskai-/, \`dneskai-${kit}-\`)`,
the slide id `slide-<new id>` and the name `DNESKAi ${kit} · …` in place of `DNESKAi · …`; every layer
is the same object graph. `EDITORIAL_TEMPLATES` is the ordered list of `DneskaiKitTemplate` the
editorial kit is defined from, each with its role, thumbnail count and flow from
`DNESKAI_EDITORIAL_FLOWS`. `dneskai-photo.ts` keeps exporting `DNESKAI_PHOTO_TEMPLATES` as
`EDITORIAL_KIT.templates` (the same fourteen ids, the same objects, in the same order) and
`dneskaiSourcesTemplate(n)` as the editorial sources template for `n` thumbnails.

The contract test enforces R6 for every kit: all six slide types resolve for every variant and
image set the editorial kit accepts; per role the set of text slots, the image slots with their
`optional` flags (`dneskaiImageSlots`) and the slide variants (`DNESKAI_TEMPLATE_VARIANTS`) equal the
tables; every text layer's `maxChars` equals `DNESKAI_TEXT_LIMITS[role][slot]`; the editorial kit
equals the tables, so the tables are proven against the templates that defined them; every
template passes `validateTemplateAsRendered(template, brand, "instagram-portrait", kit.look)`; and
every template lays out and renders for the longest, the shortest and the required-only strings.

Per-kit golden files wait until a kit diverges: while a stub reuses the editorial compositions, the
stub-equals-editorial check in section 10 is its pin. A kit author who changes a composition adds
`golden/dneskai-<kit>.json` with the same `DneskaiGoldenSchema` in the commit that diverges.

## 10. Byte identity of the editorial kit: guarantee and proof

Guarantee, link by link:

1. Palette and fonts. A render with no `look` receives the cached `KitStyle` object
   (`kitStyleWithLook` returns its argument). A DNESKAi render names the editorial look, whose
   palette entries and font entries `readBrandKit` has verified equal to `carouselPalette` and
   `carouselFonts`; `dressBrand` of the overlaid style is deep-equal to `dressBrand` of the base
   style, and `flat`, `squareCorners` and `logo` resolve to the kit's own values because the
   editorial look sets none.
2. Templates. The editorial kit composes the same inputs through the same builders, moved without
   edit; `CarouselTemplateSchema.parse` of equal input is deep-equal output, and
   `DNESKAI_PHOTO_TEMPLATES` is the kit's own map.
3. Layout. `layoutDneskaiSlide` with the editorial flow runs the branch today's id dispatch runs,
   with the same constants from `DNESKAI_EDITORIAL_METRICS`, and `capOffset: 0.3` reproduces
   `CAP_OFFSET` as a literal.
4. Rendering. `renderSlides` with the overlaid-but-equal style builds the same SVG string, and
   resvg with the same font files rasterises the same PNG.

Proof, in tests that exist before the first production change (plan step 1) and run after every
step:

- `golden:check`: the eleven DNESKAi hashes, the thirty family decks; and the Tehdejší pin in
  `tehdejsi-determinism.test.ts`.
- `tests/fixtures/dneskai-receipts.json`, recorded from the unchanged code by a scratchpad script
  and never regenerated inside this work: the seven `pngHash` values of the acceptance deck
  (`svgHash` is not pinned; the SVG embeds sharp's PNG encoding of the crop, a property of the zlib
  build, as `dneskai-golden.ts` explains); the laid-out frames (`x`, `y`, `width`, `height` of every
  layer as unit fractions, plus the single photo's shade stops) of every flowed editorial template
  for the matrix `dneskai-layout.test.ts` uses, shortest, longest and required-only strings times
  no picture, a contained picture and a covering picture with a low given focal point; and the
  sha256 of `JSON.stringify([...DNESKAI_PHOTO_TEMPLATES.values()])`. `tests/dneskai-baseline.test.ts`
  asserts all three, with no `kit` and, once the field exists, with `kit: "editorial"`.
- The stubs add a fifth check that costs nothing: a stub renders the editorial look through
  re-keyed templates, so for every golden case `renderDneskaiSlide({ ...input, kit: "bold" }).pngHash`
  equals the editorial hash while `template.id` differs. That proves the kit plumbing lossless before
  any author changes a line.
- `tests/brand-kit-looks.test.ts`: `dressBrand(brand, style)` deep-equals
  `dressBrand(brand, kitStyleWithLook(style, "editorial"))`, and `kitStyleWithLook(style)` is `style`
  by identity.
- Other ventures: `kitStyleWithLook(kitStyleFor(brand), undefined)` is `kitStyleFor(brand)`;
  `kit-rendering.test.ts` (devShark grounds, corner fin, last-slide logo) and `golden.test.ts` are
  the receipts.

## 11. OwnDashboard

Nothing OwnDashboard imports is renamed or removed: `renderDneskaiSlide`, `validateDneskaiSlide`,
`DneskaiSlideInput`, `DneskaiImageInput`, `DneskaiSlideProblem`, the `DNESKAI_*` constants,
`resolveFace` and `missingCommittedGlyphs` keep their names. Its vendor test still finds exactly
fourteen `DNESKAI_PHOTO_TEMPLATES` ids, `kitStyleFor`, `dressBrand`, `kitTemplate`,
`DNESKAI_MAX_THUMBNAILS`, `fontFiles()` of at least 40 files, `readBrandKit("caught-up")` clean and
the eleven golden hashes unchanged. `dressBrand` still returns the base palette, which equals the
editorial look, so its derivation of the field faces keeps working.

After a re-vendor, `dist/` gains `dneskai-kits/*`, `brand-kits/caught-up/` gains `looks/` (the
script's `cp -R` carries it and `next.config.ts` already traces `brand-kits/**/*`), and the
`./dneskai-slide` subpath additionally exports the registry and the contract. OwnDashboard can then
replace `DNESKAI_FIELD_FACES` and `DNESKAI_PLACED_FIELDS` with `DNESKAI_KITS.get(kit).fieldFaces`
and `.placedFields` and run its text gate per kit; its `DNESKAI_TEXT_LIMITS` in
`dneskai-generation.ts` is keyed by editorial template id, and the shared table keys by role
(the id without `dneskai-`, with `split` and `split-pair` as separate roles), a one-line adapter.

Its render key (`dneskai-render-key/2`) must gain the kit id, because the kit changes bytes without
changing the payload; its stored asset metadata `templateId` already differs per kit for all but
editorial, and `DneskaiSlideResult.kit` names it for all five. Carrying `kit` in `dneskai-slides/1`,
the render key, the tracer and the edit schemas is owner-brief task G and outside this record.
`DneskaiProblemCode` gains `kit-invalid`, mapped as any other code. The vendored `package.json`'s
trimmed exports and the `UPSTREAM.md` pin are OwnDashboard's own update.

The subpath's import graph stays clear of `hooks/`: `dneskai-slide.ts` already imports `library.ts`,
`renderer.ts` and `kit-style.ts`, and the new modules import nothing beyond those, `fonts.ts` and
`dneskai-layout.ts`. A static test walks the import statements under `src/` from `dneskai-slide.ts`
and fails if the closure reaches `hooks/`, so a later import cannot pull the hook-library reader
into OwnDashboard's route bundle.

## 12. R8: the specimen script

`studio/scripts/dneskai-specimens.ts`, run as
`pnpm -C studio specimens:dneskai [--kits editorial,bold] [--photos <dir>] [--out <dir>]`, with the
copy and deck data in `studio/scripts/dneskai-specimen-decks.ts`.

Inputs:

- Fixture photographs drawn by `syntheticAbstractPhoto(width, height, seed)`: an SVG of a two-stop
  diagonal gradient and fourteen soft discs from a seeded LCG, rasterised and blurred by sharp,
  encoded as JPEG quality 88. That is the approach of OwnDashboard's
  `scripts/dneskai-preview-fixtures.mjs` (read-only reference; the arithmetic is copied, not
  imported). Not `syntheticPhoto` from `dneskai-golden.ts`, whose block grid is a golden stand-in.
  Five sizes with fixed seeds: `p1` 1600 × 1200, `p2` 1200 × 1500, `p3` 1000 × 700, `p4` 1200 × 630,
  `p5` 800 × 800.
- `--photos <dir>`: the JPEG files in the directory, sorted by name, replace `p1` to `p5` in order,
  cycling when fewer; the receipt names which file fed which slot. Nothing else is read from
  outside the repository.
- Copy: Czech, invented, plausible AI news with `Model X`, `firma Y` and `laboratoř Z` for names and
  `(příklad)` after every figure; the file header says every sentence is invented. Headlines,
  bodies and sources written to within ten characters of their `DNESKAI_TEXT_LIMITS` on at least
  one slide per deck, and one slide per deck with short copy, so a sheet shows the fitter at both
  ends.

The six fixture decks, kit-independent:

| Deck | Slides | Pictures |
| --- | --- | --- |
| `photo-rich` (7) | cover-photo, figure (contain), split, figure (cover crop, zoom 1.3), statement, split pair, sources | p1, p3, p2, p5, p3 + p5, three thumbnails |
| `single-photo` (5) | cover-photo, figure (same asset, cover, focal 0.3/0.6), statement ink, split (same asset, contain), sources | p2 throughout, one thumbnail |
| `text-only` (5) | statement accent, statement ink, statement accent, statement ink, sources-0 | none |
| `low-res` (5) | cover-photo, figure, split, statement, sources | p4 (1200 × 630) throughout, one thumbnail |
| `single-photo-post` (1) | single, photo, focal 0.5/0.8 | p2 |
| `single-type-post` (1) | single, type | none |

Two findings the decks surface for the kit authors, recorded in the script header rather than fixed
by it: no composition today opens a text-only carousel, so `text-only` starts on a statement; and
the low-res cover is refused by `image-low-resolution` (630 px short side under 900) in every kit.

Output, under `docs/design-lab/dneskai-kits/` or `--out`:

- `<kit>/<deck>-<nn>-<role>.png`, the full 1080 × 1350 PNG per slide from
  `renderDneskaiSlide({ ...slide, kit })`. A refused slide writes a placeholder tile of the same
  size: hatched `surface-strong` on `background`, the kit label, deck, slide index and each blocking
  problem code set in IBM Plex Mono in `accent`, drawn as SVG and rasterised by resvg with
  `fontFiles()`, so a refusal is a visible tile named by its code and never a gap in the sheet.
- `<kit>.json`, the receipt beside the sheet: per slide the template id and version, `pngHash`,
  `truncatedSlots`, problems with codes and fields, which photograph fed which slot, and the look id.
- `<kit>.png`, the contact sheet: sharp `composite` of the slides scaled to 360 × 450 (`lanczos3`),
  five columns, 24 px gutters, a 36 px label strip under each tile (deck, slide number, role, and
  `clipped` or the problem code when there is one) rendered through resvg the same way, on `#d9d9d6`
  so a light and a dark look both read. 26 tiles make six rows, about 1 944 × 3 000 px.
  Deterministic for one sharp and resvg: fixed seeds, fixed order, no clock; nothing is hash-pinned.

`.gitignore` gains `docs/design-lab/dneskai-kits/*/`: the per-slide directories run to tens of
megabytes per kit and are regenerable. The five sheets and five receipts are committed, because the
sheet is what the owner opens. While the stubs copy the editorial kit the five sheets are the same
picture; the first diverging kit makes them differ. If the owner wants the slides in git, the ignore
line goes.

## 13. R7: tests

New:

1. `tests/dneskai-baseline.test.ts` with `tests/fixtures/dneskai-receipts.json` (step 1): the three
   receipts of section 10, asserted with no `kit` and with `kit: "editorial"`.
2. `tests/font-metrics-capheight.test.ts`: every face has `capHeight` in 550..900 and `xHeight` in
   300..800 and below it; pins Space Grotesk 700, IBM Plex Mono 698, Source Serif 4 670, Anton 859;
   `1 - capHeight / 1000` of the three editorial faces lies within 0.035 of 0.3, the written reason
   the editorial kit pins `capOffset`; `average` and three `widths` entries of three faces equal the
   literals of the previous table, which pins the "existing fields unchanged" promise.
3. `tests/brand-kit-looks.test.ts`: the caught-up manifest lists five looks; every file parses and
   its `id` matches its name; the default equals `carouselPalette` and `carouselFonts`; every look's
   families are in `FONT_FAMILIES` and `missingCommittedGlyphs(resolveFace(family, w), requiredCharacters(["cs"]))`
   is empty for every committed weight; a copied kit in a temp directory with one token changed in
   `looks/editorial.json` reads with the equality problem named, a missing look file with the
   missing problem, a look that clears `flat` with the clearing problem, and `readKitStyle` throws
   on an unknown family; `kitStyleFor(brand).looks` has five entries and `defaultLook` is
   `editorial`; `kitStyleWithLook(style)` is `style`; `kitStyleWithLook(style, "no-such")` throws;
   `dressBrand` identity for the default look; `colours` contains every look value; for every kit
   and template `validateTemplateAsRendered(template, brand, "instagram-portrait", kit.look)` has no
   failing check (contrast, APCA, overflow, brand-tokens, safe-area, canvas).
4. `tests/dneskai-kits.test.ts`: registry invariants (`DNESKAI_KIT_IDS` in order equal the map's
   keys, each kit's look declared by the manifest, template ids unique and prefixed, every role
   present, sources 0..6); the R6 contract per role against the tables and the editorial kit; the
   editorial `fieldFaces` and `placedFields` deep-equal the literal tables OwnDashboard holds today
   (copied into the test as expected values); `resolve` maps the acceptance deck to
   `ACCEPTANCE_TEMPLATES` for editorial and to the prefixed ids for the stubs; every kit renders the
   acceptance deck and the golden cases at 1080 × 1350 with no blocking problem, twice with equal
   hashes; every stub's `pngHash` equals the editorial `pngHash` for every golden case;
   `kit-invalid` with `kit: null` for an unknown id; the static import-graph guard. Explicit
   timeouts on the render cases.
5. `tests/dneskai-flows.test.ts`: flow determinism (same input, same frames, three runs, every kit
   and template); the receipts' frames equal with the editorial kit's flow and metrics; the `stack`
   expansions equal the named kinds; a `stack` with an empty item takes no room and no gap;
   `anchor: "top"` starts at `area.top`; `capOffset` absent with `capHeight` 0.7 equals the editorial
   frames and with 0.859 lifts `inkTop`; an item the template cannot serve throws with the key named.
6. `tests/dneskai-specimens.test.ts`: the fixture decks validate in every kit with no blocking
   problem except the low-res cover, whose problem is `image-low-resolution`; the placeholder tile
   renders 1080 × 1350 and names the code; the sheet layout function places 26 tiles in six rows of
   five.

Updated:

- `tests/brand-kits.test.ts`: "holds no file the manifest does not name" admits `looks/` when
  `carouselLooks` is set and asserts it holds exactly `<id>.json` for the declared ids.
- `tests/glyph-coverage.test.ts`: `FAMILY_LOCALES` folds every look's families in as bindings of the
  kit's `studioBrand` locales (`kitLookFamilies(readKitStyle(venture))` for every kit with a
  manifest). The `unbound` and `toHaveLength(16)` literals change only if a look binds a family no
  brand binds, in the same commit as that look.
- `tests/kit-rendering.test.ts`: two refusal cases (an undeclared look; a look on an unkitted brand);
  the "kitted brands' faces" set folds look families in, so a face a look binds is rasterised by
  name like the brand faces.
- `tests/dneskai-layout.test.ts`: `laidOut` passes `flow: EDITORIAL_KIT.flows.get(template.id)!` and
  `metrics: DNESKAI_EDITORIAL_METRICS`; every literal placement (152, 169, the thumbnail grid) stays.
- `tests/dneskai-photo.test.ts`: "passes every check as the kit draws it" and the colour, flatness
  and face assertions run for every kit with its look; the fourteen editorial ids in order stay.
- `tests/dneskai-slide.test.ts`: `kit: "no-such-kit"` is refused with `kit-invalid` and `kit: null`;
  `result.kit` is `editorial` by default and the named kit otherwise.

Unchanged and load-bearing: `golden.test.ts`, `tehdejsi-determinism.test.ts`,
`brand-kit-render.test.ts`, `script-capacity.test.ts`, `portable.test.ts`, `czech-ties.test.ts`,
`hooks.test.ts`.

Gates: `pnpm -C studio test`, `pnpm -C studio typecheck`, `pnpm -C studio golden:check` (eleven
DNESKAi entries `ok`, thirty families `ok`), `pnpm -C studio build`, then `pnpm typecheck` at the
root (its `pre*` scripts rebuild the studio first). `pnpm -C orchestrator test` and `pnpm -C site test`
are timed; past ten minutes, run `orchestrator/tests/contracts.test.ts`,
`orchestrator/tests/architecture.test.ts`, `orchestrator/tests/studio-lifecycle.test.ts`,
`site/src/lib/carousel-studio*.test.ts`, `site/src/lib/admin-design-lab-brand.test.ts`,
`site/src/lib/design-lab-ventures.test.ts` and
`site/src/app/api/carousel-studio/preview/**/route.test.ts`. Every step that touches `src/` ends
with `pnpm -C studio build` before any orchestrator or site command, as `CLAUDE.md` warns.

## 14. R9: documentation

- This file.
- `docs/design-lab/README.md`, "DNESKAi photo kit": the `renderDneskaiSlide` signature block gains
  `kit?: DneskaiKitId` and the result gains `kit`; a paragraph on the five kits, the registry, the
  shared limits and the looks; the receipts paragraph names `dneskai-receipts.json`; "How the
  specimens are made" gains the `specimens:dneskai` command and the sheet location.
- `docs/design-lab/BRAND-KITS.md`: `carouselLooks` and the look file under "What a kit contains"; a
  step between 2 and 3 under "How the studio uses a kit" (the look overlay and its precedence against
  grounds); the five looks under "DNESKAi".
- `docs/design-lab/TOKENS.md`, "DNESKAi photo kit": a sentence that the table is the editorial kit's
  metrics (`DNESKAI_EDITORIAL_METRICS`) and other kits carry their own; the cap-offset sentence
  rewritten: 0.3 is pinned for the editorial faces, other kits read the face's cap height from the
  metrics table; the three editorial cap heights.
- `CLAUDE.md`, "The studio's fonts are build inputs": one clause that the metrics table also carries
  cap and x heights.
- The grep for `renderDneskaiSlide` over `docs/` and `studio/` finds `docs/design-lab/README.md:183`
  only; `studio/` holds no markdown.

## 15. R10: schema versions

`CarouselTemplateSchema`, `CarouselPayloadSchema`, `BrandTokensSchema` and `ImageCropSchema` are not
touched. `look` is a render input, so a stored payload and its hash mean what they meant. `kit` is a
DNESKAi API input and a result field. `brand-kit/1` gains one optional field; the look file carries
its own `brand-kit-look/1`. No exported symbol OwnDashboard imports is renamed.

## 16. Risks, with the ten the implementer verifies first

1. **The brand-kit contract is generated.** Run `pnpm contracts:export` in the commit that extends
   `BrandKitManifestSchema` and commit `contracts/brand-kit.schema.json` with it, or
   `orchestrator/tests/contracts.test.ts` fails on "keeps the committed brand-kit JSON Schema
   current". Run `pnpm docs:check` as well.
2. **The kit directory rule.** `brand-kits.test.ts` fails on `looks/` until the test change lands in
   the same commit as the manifest field and the first look file.
3. **The cap line is a literal.** `inkTop` must read `metrics.capOffset` as `0.3`, never
   `1 - capHeight`, for the editorial kit; the receipts' frames fail before `golden:check` would, with
   the frame named.
4. **Identity for an absent look.** `kitStyleWithLook(style, undefined) === style` by reference, and
   `readBrandKit` must refuse a default look that differs from `carouselPalette` or `carouselFonts`
   entry for entry; otherwise the editorial render drifts by a token nobody notices.
5. **Forty-six faces.** Any literal count in a test is 46; the OS/2 path answers for all of them.
6. **The coverage literals.** `toHaveLength(16)` and `["Outfit"]` in `glyph-coverage.test.ts`, and the
   `bound` set in `kit-rendering.test.ts`, must fold look families in; both go stale the day a look
   binds Outfit, and the author updates them in that commit.
7. **Downstream callers.** `site/src/lib/carousel-studio.ts:166` compiles against the optional fourth
   parameter; `orchestrator/tests/studio-lifecycle.test.ts:33` reads
   `DNESKAI_PHOTO_TEMPLATES.get("dneskai-cover-photo")`, so the facade keeps the fourteen ids and the
   same objects; root `pnpm typecheck` must see a rebuilt `studio/dist`.
8. **The resolver keeps slot semantics.** `dneskaiRoleOf` reads the slot list and chooses the pair on
   `image-2` presence, as `resolveTemplate` does today; a count changes the problem list the slide
   tests pin for odd slot sets.
9. **Imports read no files.** `fieldFaces` is a lazy getter; importing `dneskai-slide` in
   OwnDashboard's route bundle must not read `brand-kits/`, and the static guard must show no path
   from `dneskai-slide.ts` to `hooks/`.
10. **Timeouts and the eleven hashes.** Per-kit render tests set explicit timeouts (the default is
    30 s); `golden:check` runs on the same commit as steps 5, 7, 8 and 9, and the eleven DNESKAi
    hashes and `updatedAt` do not move.

Further risks:

- Design Lab admin: `site/src/lib/admin-design-lab-brand.ts` reads named manifest fields through
  `readBrandKit`; `carouselLooks` stays invisible until the view is extended, and a damaged look
  file makes the kit "unusable" there, the posture it has for a tampered asset. Listing looks in the
  admin is a follow-up.
- Tehdejší svět Cyrillic gate: looks belong to `caught-up`, which publishes `cs` only, so folding
  them in adds Czech requirements and changes nothing for `uk`. The pinned Tehdejší sha256 is on a
  path no look touches.
- Hooks tests: nothing here writes under `studio/hooks/`; the only indirect risk is a duplicate
  name through two `export *` paths in `index.ts`, guarded by the single re-export path.
- `summary.ts`: untouched; the orchestrator delivery and the site read `studio/dist`, so a stale
  dist after a studio edit reproduces the failure `CLAUDE.md` warns about.
- Text limits as a hard contract: a kit whose composition cannot hold `DNESKAI_TEXT_LIMITS` at
  `minFontSize` over `maxLines` fails the overflow gate and must widen the frame, add lines or lower
  the minimum (floor 16 px). That pressure is the design; validating every deck in five kits at
  generation time would cost five validations per edit and still let one kit refuse copy another
  accepted.
- A look background outside `#ffffff`, `#f7f7f5` and `#14161a` gets the mono logotype by the kit's
  own rule, measured by the contrast gates and not exempt.
- Specimen size: five sheets of a few megabytes each enter git; the per-slide directories do not.
- Brand drift: aifirst moved to a refresh on 12 October while the kit is pinned at `978cf71`. Looks
  make a re-pin a look-file edit plus a manifest `source` update; this record re-pins nothing.
- OwnDashboard: the render key must gain the kit (task G); the vendored copy changes only through
  `scripts/vendor-carousel-studio.sh`.

## 17. Implementation plan, ordered, one commit each

Every commit message is imperative English and ends with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nothing is pushed.

1. **Pin the receipts.** A scratchpad script renders the acceptance deck, lays out the frame matrix
   and hashes the editorial templates from the unchanged code into
   `tests/fixtures/dneskai-receipts.json`; `tests/dneskai-baseline.test.ts` asserts them. Green on
   unchanged code. `Pin the DNESKAi acceptance deck, laid-out frames and editorial template bytes`.
2. **Cap height in the metrics.** `verticalMetrics` in the generator, `pnpm -C studio fonts:metrics`,
   `tests/font-metrics-capheight.test.ts`; `git diff --stat` shows the table changed by additions.
   `Record cap and x heights in the font metrics`.
3. **Looks in the manifest.** `brand-kit.ts` schemas and reader, `carouselLooks` with
   `looks/editorial.json` only, `brand-kits.test.ts` update, the parse half of
   `tests/brand-kit-looks.test.ts`, `pnpm contracts:export`. `Declare brand kit looks and read the editorial look`.
4. **Looks in the kit style.** `KitLook`, `looks`, `defaultLook`, `kitStyleWithLook`,
   `kitLookFamilies`, the family check, `colours`; the style half of the looks test.
   `Resolve a brand kit look into the kit style`.
5. **The renderer takes a look.** `look` on the input, three overlay lines, `face` on `TextSlotFit`,
   `validateTemplateAsRendered(..., look)`; the refusal cases in `kit-rendering.test.ts`; the renderer
   half of the looks test; `golden:check` green. `Dress a kitted brand in a named look`.
6. **The contract and the editorial kit.** `dneskai-kits/contract.ts`, `compose.ts`, `kit.ts`,
   `editorial.ts` with `DNESKAI_EDITORIAL_FLOWS`; the flow and metrics types, `DNESKAI_PANEL`,
   `DNESKAI_CAP_OFFSET`, `DNESKAI_EDITORIAL_METRICS` and `DNESKAI_STACK_PRESETS` declared in
   `dneskai-layout.ts` with the engine still dispatching on ids; `dneskai-photo.ts` as facade;
   `tests/dneskai-kits.test.ts` for the editorial kit (template sha256 unchanged, derived tables equal
   OwnDashboard's literals, import-graph guard). `Move the DNESKAi photo kit into an editorial kit module`.
7. **Flows in the layout.** `layoutDneskaiSlide` requires `flow` and `metrics` and switches on the
   kind; `stacked`; `capHeight` in `textBlock`; the id dispatch removed; `dneskai-slide.ts` passes
   the editorial kit's flow and metrics; the layout test helper updated; receipts and `golden:check`
   green; `tests/dneskai-flows.test.ts`. `Lay out DNESKAi slides by flow and kit metrics`.
8. **The API takes a kit.** `kit` on input and result, `kit-invalid`, `resolveTemplate` through the
   kit, `look` to fits and render, `capHeight` to the layout, re-exports through `dneskai-slide.ts`,
   `registry.ts` with the editorial kit; `golden:check` green; the receipts equal with
   `kit: "editorial"`. `Render a DNESKAi slide in a named kit`.
9. **Four stubs and five looks.** The four kit modules, the registry's five entries, the four look
   files, the manifest's five ids; the cross-kit contract test, the per-kit render test and the
   stub-equals-editorial check. `Register four stub DNESKAi kits with their own looks`.
10. **Fold looks into the coverage gates.** `glyph-coverage.test.ts` and the faces block of
    `kit-rendering.test.ts` read look families; `brand-kit-looks.test.ts` gains the Czech coverage
    assertion per look. `Gate look fonts for the alphabet their kit publishes`.
11. **Specimens.** `scripts/dneskai-specimen-decks.ts`, `scripts/dneskai-specimens.ts`, the package
    script, the `.gitignore` line, `tests/dneskai-specimens.test.ts`, the five sheets and five
    receipts. `Render DNESKAi kit specimen sheets from fixture decks`.
12. **Docs.** `README.md`, `BRAND-KITS.md`, `TOKENS.md`, the `CLAUDE.md` clause; this record gains a
    changelog line per step. `Describe DNESKAi kits, looks and flows in the design lab docs`.
13. **Gates.** `pnpm -C studio test`, `typecheck`, `golden:check`, `build`; root `pnpm typecheck`;
    the orchestrator and site suites in full if under ten minutes, else the named subsets; any fix
    in its own commit naming the gate. No push.

## 18. Appendix

### 18.1 The editorial numbers the kit carries

Metrics (`DNESKAI_EDITORIAL_METRICS`): unit 8; gaps labelToText 4, headlineToPicture 5,
pictureToText 4, rowToBody 6, headlineToBody 5, headlineToNote 8, pictureToPicture 3, ruleToLabel 3,
titleToSources 5, sourceToSource 3, sourcesToColophon 6, labelToPictures 2, picturesToDisclosure 4;
area 166 to 1196; optical share 0.42; thumbnails 3 columns, 296 × 198, gap 24; panel top 152,
padding 24, inset 17, toBody 22, toKicker 28, clearance 48; capOffset 0.3.

Flows by template: `dneskai-cover-photo` cover-static; `dneskai-figure` figure; `dneskai-split`
split; `dneskai-split-pair` split-pair; `dneskai-statement` statement; `dneskai-sources-0..6` sources;
`dneskai-single-type` single-type; `dneskai-single-photo` single-photo.

Derived tables of the editorial kit, which must equal OwnDashboard's constants: headline Space
Grotesk 700, body Source Serif 4 400, kicker IBM Plex Mono 400 uppercase, credit IBM Plex Mono 400,
sources Source Serif 4 400; placed fields cover-photo [headline, kicker, credit], figure
[headline, body, credit], split [headline, body, kicker, credit], statement [headline, body], sources
[sources], single [headline, body, kicker, credit].

### 18.2 Cap and x heights of the 46 committed faces, in thousandths of an em

Read from OS/2 `sCapHeight` and `sxHeight` on 2026-10-22; every face has OS/2 version 4 except
Source Serif 4 (version 3), and every face is TrueType.

| Family | Weights | capHeight | xHeight |
| --- | --- | --- | --- |
| Anton | 400 | 859 | 732 |
| Archivo | 600, 700, 800, 900 | 686 | 526 |
| Barlow | 400, 700 | 700 | 506, 514 |
| Barlow Condensed | 600, 700, 800, 900 | 700 | 511, 514, 517, 520 |
| Figtree | 600, 700, 800, 900 | 700 | 500 |
| IBM Plex Mono | 400, 700 | 698 | 516 |
| IBM Plex Sans | 400, 700 | 698 | 516, 525 |
| Inter | 400, 600, 700 | 728 | 546 |
| JetBrains Mono | 400 | 730 | 550 |
| Karla | 400, 700 | 628, 649 | 478, 486 |
| Literata | 400, 600, 700 | 701 | 507, 510, 512 |
| Manrope | 700, 800 | 720 | 540 |
| Outfit | 600, 700, 800, 900 | 703, 706, 709, 712 | 483, 486, 489, 492 |
| Petrona | 600, 700, 800, 900 | 641 | 443 |
| Public Sans | 400, 700 | 723 | 517 |
| Source Serif 4 | 400, 600, 700 | 670 | 475, 479, 483 |
| Space Grotesk | 400, 500, 700 | 700 | 489, 493, 496 |

## Implementation progress (22 October 2026)

Steps 1–4 are committed: baseline receipts, cap/x heights, editorial look manifest and look style resolution. Step 5 now passes the named look through fitting, template validation and SVG/PNG rendering. Text fits expose their committed face. Absent-look output and the editorial look remain byte-identical. Four future kit designs and their naming remain owner decisions.
