import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * A venture's approved brand kit: the logo files and the rules that come with them.
 *
 * One directory per venture under `studio/brand-kits/<venture>/`, holding the production files
 * exactly as the venture's own repository ships them and a `manifest.json` that says what each
 * file is for. The files are copied byte for byte and the manifest pins each one by sha256, so a
 * kit here is a receipt for a specific approved commit rather than a redrawing of it.
 *
 * The renderer reads a kit only for its logotype: a kit's `logo-*` files replace the wordmark the
 * studio used to set in a font. Everything else in the manifest (square mark, Open Graph cards,
 * clear space, do-nots) is for the people and agents making posts, and the admin Design Lab shows
 * it. Adding a venture's kit is dropping in its files and one manifest; no code names a venture.
 */

/** Where the kits live, resolved from this module so `dist/` and `src/` both find them. */
export const BRAND_KITS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "brand-kits");

const HexSchema = z.string().regex(/^#[0-9a-f]{6}$/, "lowercase #rrggbb");
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const VentureIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const FileNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(svg|png)$/, "a flat .svg or .png file name");
const NoteSchema = z.string().trim().min(3).max(400);

/**
 * What an asset is for. The four `logo-*` roles are the logotype in the colourings the brand
 * approves, and they are the only roles the renderer draws.
 */
export const BRAND_KIT_ROLES = [
  "logo-on-light",
  "logo-on-dark",
  "logo-mono-black",
  "logo-mono-white",
  "square",
  "square-animated",
  "square-png",
  "og-light",
  "og-dark"
] as const;

export const BrandKitRoleSchema = z.enum(BRAND_KIT_ROLES);
export type BrandKitRole = z.infer<typeof BrandKitRoleSchema>;

const LOGO_ROLES: ReadonlySet<BrandKitRole> = new Set(["logo-on-light", "logo-on-dark", "logo-mono-black", "logo-mono-white"]);

const BrandKitAssetSchema = z.strictObject({
  role: BrandKitRoleSchema,
  file: FileNameSchema,
  mediaType: z.enum(["image/svg+xml", "image/png"]),
  sha256: Sha256Schema,
  bytes: z.number().int().positive().max(2_000_000),
  /** Where the file lives in the source repository at `source.commit`. */
  sourcePath: z.string().trim().min(3).max(200),
  /** What the brand spec says this file is for, in its own words. */
  use: NoteSchema,
  /** The exact ground colours the spec names for this file. Empty means none is named. */
  grounds: z.array(HexSchema).max(6).default([]),
  /** Whether the spec names a photograph or a solid brand colour as this file's ground. */
  onPhoto: z.boolean().default(false),
  /** Every fill colour the file draws, lowercase. What a contrast check has to measure. */
  inks: z.array(HexSchema).min(1).max(8),
  /** Pixel size, for raster files. */
  pixels: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional()
});

const PaletteSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().trim().min(2).max(80),
  /** The grounds this palette is drawn on. */
  grounds: z.array(HexSchema).max(6),
  colors: z.array(z.strictObject({ role: z.string().trim().min(1).max(60), value: HexSchema })).min(1).max(12)
});

/** One carousel token and where its value comes from in the venture's own design system. */
const CarouselTokenSchema = z.strictObject({ value: HexSchema, source: NoteSchema });

export const BrandKitManifestSchema = z.strictObject({
  schemaVersion: z.literal("brand-kit/1"),
  /** The venture id in `config/ventures.json`; the kit's directory has the same name. */
  venture: VentureIdSchema,
  /** The studio brand this kit dresses (`CAROUSEL_BRANDS` key). A venture may market another name. */
  studioBrand: VentureIdSchema,
  displayName: z.string().trim().min(2).max(60),
  status: z.literal("approved"),
  approvedOn: z.iso.date(),
  source: z.strictObject({
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    ref: z.string().trim().min(1).max(120),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    /** The documents the rules below were taken from, as paths in that repository. */
    documents: z.array(z.string().trim().min(3).max(200)).min(1).max(8)
  }),
  logotype: z.strictObject({
    /** The logo files' own viewBox: min-x, min-y, width, height. */
    viewBox: z.tuple([z.number().finite(), z.number().finite(), z.number().positive(), z.number().positive()]),
    /** Width over height, rounded to two places. */
    aspectRatio: z.number().positive(),
    /** Always true: the name is drawn as paths, never set in a font. */
    outlined: z.literal(true),
    clearSpace: z.strictObject({
      /** Clear space on every side as a fraction of the logotype's height. */
      ratioOfHeight: z.number().min(0).max(1),
      basis: NoteSchema
    }),
    minimumHeightPx: z.number().positive(),
    sizes: z.array(z.strictObject({ place: z.string().trim().min(2).max(80), heightPx: z.string().trim().min(1).max(20) })).max(12)
  }),
  palettes: z.array(PaletteSchema).min(1).max(8),
  /**
   * The studio's seven carousel tokens, when this kit sets them. `library.ts` must carry exactly
   * these values for `studioBrand`; a test holds the two together.
   */
  carouselPalette: z.strictObject({
    background: CarouselTokenSchema,
    surface: CarouselTokenSchema,
    "surface-strong": CarouselTokenSchema,
    foreground: CarouselTokenSchema,
    muted: CarouselTokenSchema,
    accent: CarouselTokenSchema,
    secondary: CarouselTokenSchema
  }).optional(),
  rules: z.array(NoteSchema).min(1).max(20),
  doNots: z.array(NoteSchema).min(1).max(20),
  typography: z.array(NoteSchema).max(10),
  assets: z.array(BrandKitAssetSchema).min(1).max(24)
}).superRefine((kit, context) => {
  const seen = new Set<string>();
  kit.assets.forEach((asset, index) => {
    if (seen.has(asset.file)) context.addIssue({ code: "custom", message: `Duplicate file ${asset.file}`, path: ["assets", index, "file"] });
    seen.add(asset.file);
    const svg = asset.file.endsWith(".svg");
    if (svg !== (asset.mediaType === "image/svg+xml")) {
      context.addIssue({ code: "custom", message: "mediaType does not match the file extension", path: ["assets", index, "mediaType"] });
    }
    if (LOGO_ROLES.has(asset.role) && !svg) {
      context.addIssue({ code: "custom", message: "A logotype role must be an outlined SVG", path: ["assets", index, "file"] });
    }
    if (asset.mediaType === "image/png" && !asset.pixels) {
      context.addIssue({ code: "custom", message: "A PNG asset records its pixel size", path: ["assets", index, "pixels"] });
    }
  });
  for (const role of LOGO_ROLES) {
    if (kit.assets.filter((asset) => asset.role === role).length > 1) {
      context.addIssue({ code: "custom", message: `More than one ${role} asset`, path: ["assets"] });
    }
  }
  if (!kit.assets.some((asset) => LOGO_ROLES.has(asset.role))) {
    context.addIssue({ code: "custom", message: "A kit carries at least one logotype file", path: ["assets"] });
  }
  const [, , width, height] = kit.logotype.viewBox;
  if (Math.abs(width / height - kit.logotype.aspectRatio) > 0.01) {
    context.addIssue({ code: "custom", message: `aspectRatio ${kit.logotype.aspectRatio} disagrees with the viewBox (${(width / height).toFixed(3)})`, path: ["logotype", "aspectRatio"] });
  }
});

export type BrandKitManifest = z.infer<typeof BrandKitManifestSchema>;
export type BrandKitAsset = BrandKitManifest["assets"][number];

/** What reading one kit directory found. A problem is a reason the kit cannot be used as it is. */
export interface BrandKitReading {
  directory: string;
  manifest: BrandKitManifest | null;
  problems: string[];
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Read and verify one kit: the manifest parses, its venture matches its directory, and every
 * file it names exists with the recorded size and hash.
 *
 * Never throws. A missing or damaged kit is reported, because the admin shows it as unavailable
 * and the renderer refuses to draw from it, and those are two different reactions to one fact.
 */
export function readBrandKit(venture: string, root = BRAND_KITS_DIRECTORY): BrandKitReading {
  const directory = path.join(root, venture);
  const manifestPath = path.join(directory, "manifest.json");
  if (!existsSync(manifestPath)) return { directory, manifest: null, problems: ["manifest.json is missing"] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { directory, manifest: null, problems: [`manifest.json is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = BrandKitManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { directory, manifest: null, problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`) };
  }
  const manifest = parsed.data;
  const problems: string[] = [];
  if (manifest.venture !== venture) problems.push(`manifest names venture ${manifest.venture}, directory is ${venture}`);
  for (const asset of manifest.assets) {
    const file = path.join(directory, asset.file);
    if (!existsSync(file)) {
      problems.push(`${asset.file} is missing`);
      continue;
    }
    const bytes = readFileSync(file);
    if (bytes.length !== asset.bytes) problems.push(`${asset.file} is ${bytes.length} bytes, manifest says ${asset.bytes}`);
    if (sha256(bytes) !== asset.sha256) problems.push(`${asset.file} does not match its recorded sha256`);
  }
  return { directory, manifest, problems };
}

/** Every kit directory, in name order. A directory without a manifest is still listed. */
export function brandKitVentures(root = BRAND_KITS_DIRECTORY): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && VentureIdSchema.safeParse(entry.name).success)
    .map((entry) => entry.name)
    .sort();
}

export function readBrandKits(root = BRAND_KITS_DIRECTORY): BrandKitReading[] {
  return brandKitVentures(root).map((venture) => readBrandKit(venture, root));
}

/** One colouring of the logotype, ready to draw. */
export interface LogotypeVariant {
  role: BrandKitRole;
  grounds: readonly string[];
  onPhoto: boolean;
  inks: readonly string[];
  /** The file's drawing with its root element, title and metadata removed. Ids are `LOGO_ID`-prefixed. */
  markup: string;
}

export interface KitLogotype {
  venture: string;
  displayName: string;
  viewBox: readonly [number, number, number, number];
  aspectRatio: number;
  clearSpace: number;
  minimumHeightPx: number;
  /** In the order the preference rule walks them: full colour first, then the mono files. */
  variants: readonly LogotypeVariant[];
}

/** A placeholder every id and `url(#…)` in logo markup carries, replaced with a per-layer id. */
export const LOGO_ID = "__logo__";

/**
 * The drawable part of an SVG file.
 *
 * Only what a nested `<svg>` needs: the root element, `<title>` and `<metadata>` (the provenance
 * manifest the design tool embedded) are dropped, and ids are namespaced so two logos on one
 * slide, or a logo and a gradient, cannot share one. Anything scripted or external is refused
 * rather than stripped, because a kit that needs stripping is not the approved file.
 */
export function logotypeMarkup(svg: string): string {
  if (/<script|<foreignObject|\son[a-z]+=|href="(?!#)/i.test(svg)) throw new Error("Logotype SVG carries script, foreign content or an external reference");
  const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg.trim())?.[1];
  if (inner === undefined) throw new Error("Logotype file is not a single SVG element");
  return inner
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\sid="([^"]+)"/g, ` id="${LOGO_ID}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${LOGO_ID}$1)`);
}

const VARIANT_ORDER: readonly BrandKitRole[] = ["logo-on-light", "logo-on-dark", "logo-mono-white", "logo-mono-black"];

/** The logotype a kit hands the renderer, or an error naming why it cannot. */
export function kitLogotype(reading: BrandKitReading): KitLogotype {
  const { manifest, problems, directory } = reading;
  if (!manifest || problems.length) throw new Error(`Brand kit ${path.basename(directory)} is unusable: ${problems.join("; ")}`);
  const variants = VARIANT_ORDER.flatMap((role) => {
    const asset = manifest.assets.find((candidate) => candidate.role === role);
    if (!asset) return [];
    return [{
      role,
      grounds: asset.grounds,
      onPhoto: asset.onPhoto,
      inks: asset.inks,
      markup: logotypeMarkup(readFileSync(path.join(directory, asset.file), "utf8"))
    }];
  });
  return {
    venture: manifest.venture,
    displayName: manifest.displayName,
    viewBox: manifest.logotype.viewBox,
    aspectRatio: manifest.logotype.aspectRatio,
    clearSpace: manifest.logotype.clearSpace.ratioOfHeight,
    minimumHeightPx: manifest.logotype.minimumHeightPx,
    variants
  };
}

const logotypeCache = new Map<string, KitLogotype | null>();

/**
 * The logotype for a studio brand, or null when no kit dresses that brand.
 *
 * Read once per process. A kit that exists but fails verification throws: drawing the old
 * wordmark instead would ship a card in an identity the venture has replaced, and nothing would
 * say so.
 */
export function logotypeForBrand(studioBrand: string): KitLogotype | null {
  if (logotypeCache.has(studioBrand)) return logotypeCache.get(studioBrand)!;
  let found: KitLogotype | null = null;
  for (const reading of readBrandKits()) {
    if (!reading.manifest) {
      // A damaged kit that claims this brand, or sits in its directory, refuses the render. One
      // that belongs to another brand is that brand's problem, and the kit test fails on it.
      if (claimedStudioBrand(reading.directory) === studioBrand) {
        throw new Error(`Brand kit ${path.basename(reading.directory)} is unusable: ${reading.problems.join("; ")}`);
      }
      continue;
    }
    if (reading.manifest.studioBrand !== studioBrand) continue;
    found = kitLogotype(reading);
    break;
  }
  logotypeCache.set(studioBrand, found);
  return found;
}

/** The studio brand a manifest names, read without the schema; the directory name when unreadable. */
function claimedStudioBrand(directory: string): string {
  try {
    const raw = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")) as { studioBrand?: unknown };
    if (typeof raw.studioBrand === "string") return raw.studioBrand;
  } catch {
    // Missing or not JSON: fall through to the directory name.
  }
  return path.basename(directory);
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function wcagRatio(left: string, right: string): number {
  const [light, dark] = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * Which colouring of the logotype goes on these grounds.
 *
 * The brand spec names exact grounds per file, so the rule reads it literally:
 *
 * 1. Over a photograph, the file the spec names for photographs (the white mono).
 * 2. When every possible ground is one the spec names for a file, that file — full colour first.
 * 3. Otherwise a one-colour file, whichever of white and black has the better worst-case
 *    contrast against those grounds. The spec does not name a tinted panel, and a one-colour
 *    logo is the conservative reading of that silence; recolouring the full-colour file to fit
 *    would break its first rule.
 *
 * `exempt` is true for rule 2 only. An approved file on its approved ground is the brand's own
 * decision (WCAG 1.4.3 exempts logotypes for the same reason), so the contrast gates measure the
 * one-colour fallbacks and leave the approved pairing alone.
 */
export function chooseLogotypeVariant(
  logotype: KitLogotype,
  grounds: readonly string[],
  onPhoto: boolean
): { variant: LogotypeVariant; exempt: boolean } | null {
  const normalised = grounds.map((ground) => ground.toLowerCase());
  if (onPhoto) {
    const photo = logotype.variants.find((variant) => variant.onPhoto);
    if (photo) return { variant: photo, exempt: false };
  }
  const approved = logotype.variants.find((variant) =>
    variant.grounds.length > 0 && normalised.length > 0 && normalised.every((ground) => variant.grounds.includes(ground))
  );
  if (approved) return { variant: approved, exempt: true };
  const mono = logotype.variants.filter((variant) => variant.inks.length === 1);
  let best: { variant: LogotypeVariant; worst: number } | null = null;
  for (const variant of mono) {
    const worst = Math.min(...normalised.map((ground) => wcagRatio(variant.inks[0]!, ground)));
    if (!best || worst > best.worst) best = { variant, worst };
  }
  return best ? { variant: best.variant, exempt: false } : null;
}
