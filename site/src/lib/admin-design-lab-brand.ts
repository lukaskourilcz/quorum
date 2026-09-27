import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CAROUSEL_BRANDS,
  readBrandKit,
  brandKitVentures,
  type BrandKitManifest
} from "@boardlessai/carousel-studio";
import { designLabBrandVenture } from "@/lib/design-lab-ventures";

/**
 * The Design Lab's Brand tab: each venture's approved brand kit, read once on the server.
 *
 * The kits live in `studio/brand-kits/<venture>/`, where the renderer reads them. This module is
 * the only reader on the site side. It verifies each kit the way the studio does (manifest schema,
 * file sizes, sha256) and hands the client plain JSON: a kit that fails is shown as unavailable
 * with its reasons, and a directory with no manifest yet is shown as pending. Neither throws.
 *
 * Only operating ventures are listed, the same rule as every other admin navigation surface. If
 * the venture registry cannot be read, every kit is listed rather than none.
 */

const repositoryRoot = () => process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export const brandKitsRoot = () => path.join(repositoryRoot(), "studio", "brand-kits");

export interface BrandKitAssetView {
  role: string;
  kind: BrandKitManifest["assets"][number]["kind"];
  label: string;
  file: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  use: string;
  /** The ground the preview is drawn on: the first the spec names, or a neutral that fits. */
  previewGround: string;
  grounds: string[];
  onPhoto: boolean;
  pixels: string | null;
  minimumSize: string | null;
  /** Whether the studio draws this file in a carousel's logo slot. */
  logoSlot: boolean;
  href: string;
  downloadHref: string;
}

export interface BrandKitSwatch {
  role: string;
  value: string;
}

export interface BrandKitView {
  venture: string;
  name: string;
  status: "ready" | "pending" | "unavailable";
  /** Why an unavailable kit cannot be used. Empty otherwise. */
  problems: string[];
  studioBrand: string | null;
  approvedOn: string | null;
  /** Where the files came from, as one line, plus the documents the rules were read from. */
  source: { summary: string; pinned: boolean; documents: string[] } | null;
  logotype: {
    viewBox: string;
    aspectRatio: number;
    clearSpacePercent: number | null;
    clearSpaceBasis: string;
    minimumHeightPx: number | null;
    sizes: Array<{ place: string; size: string }>;
  } | null;
  palettes: Array<{ id: string; label: string; grounds: string[]; colors: BrandKitSwatch[] }>;
  carouselPalette: Array<{ token: string; value: string; source: string }>;
  rules: string[];
  doNots: string[];
  socialRules: string[];
  typography: string[];
  assets: BrandKitAssetView[];
  /** Whether the studio draws this kit's logotype in carousels today. */
  drawnByStudio: boolean;
}

export interface BrandKitSnapshot {
  kits: BrandKitView[];
}

/** The display name a pending kit is shown under: the studio brand its venture will dress. */
function pendingName(venture: string, registryName: string | undefined): string {
  const brands = Object.values(CAROUSEL_BRANDS).filter((brand) => designLabBrandVenture(brand.id) === venture);
  return brands.length === 1 ? brands[0]!.name : registryName ?? venture;
}

function previewGround(asset: BrandKitManifest["assets"][number]): string {
  if (asset.grounds[0]) return asset.grounds[0];
  // A one-colour file with no named ground: paper for dark ink, near-black for light ink.
  const ink = asset.inks[0] ?? "#000000";
  const channel = (offset: number) => Number.parseInt(ink.slice(offset, offset + 2), 16);
  const light = (channel(1) * 299 + channel(3) * 587 + channel(5) * 114) / 1000 > 128;
  return light ? "#14161a" : "#ffffff";
}

function sourceView(source: BrandKitManifest["source"]): NonNullable<BrandKitView["source"]> {
  if (source.kind === "repository") {
    return { summary: `${source.repository} @ ${source.commit.slice(0, 7)} (${source.ref})`, pinned: true, documents: [...source.documents] };
  }
  return { summary: `Handoff from the ${source.from}, ${source.receivedOn}. ${source.description} To be pinned: ${source.pinTo}`, pinned: false, documents: [...source.documents] };
}

function assetHref(venture: string, file: string, download: boolean): string {
  return `/admin/api/brand-kits/${encodeURIComponent(venture)}/${encodeURIComponent(file)}${download ? "?download=1" : ""}`;
}

function kitView(venture: string, name: string, root: string): BrandKitView {
  const reading = readBrandKit(venture, root);
  const pending = !reading.manifest && reading.problems.length === 1 && reading.problems[0] === "manifest.json is missing";
  const empty: BrandKitView = {
    venture,
    name,
    status: pending ? "pending" : "unavailable",
    problems: pending ? [] : reading.problems,
    studioBrand: null,
    approvedOn: null,
    source: null,
    logotype: null,
    palettes: [],
    carouselPalette: [],
    rules: [],
    doNots: [],
    socialRules: [],
    typography: [],
    assets: [],
    drawnByStudio: false
  };
  const manifest = reading.manifest;
  if (!manifest) return empty;
  return {
    ...empty,
    name: manifest.displayName,
    status: reading.problems.length ? "unavailable" : "ready",
    problems: reading.problems,
    studioBrand: manifest.studioBrand,
    approvedOn: manifest.approvedOn,
    source: sourceView(manifest.source),
    logotype: {
      viewBox: manifest.logotype.viewBox.join(" "),
      aspectRatio: manifest.logotype.aspectRatio,
      clearSpacePercent: manifest.logotype.clearSpace.ratioOfHeight === undefined ? null : Math.round(manifest.logotype.clearSpace.ratioOfHeight * 100),
      clearSpaceBasis: manifest.logotype.clearSpace.basis,
      minimumHeightPx: manifest.logotype.minimumHeightPx ?? null,
      sizes: manifest.logotype.sizes.map((size) => ({ ...size }))
    },
    palettes: manifest.palettes.map((palette) => ({
      id: palette.id,
      label: palette.label,
      grounds: [...palette.grounds],
      colors: palette.colors.map((color) => ({ role: color.role, value: color.value }))
    })),
    carouselPalette: manifest.carouselPalette
      ? Object.entries(manifest.carouselPalette).map(([token, entry]) => ({ token, value: entry.value, source: entry.source }))
      : [],
    rules: [...manifest.rules],
    doNots: [...manifest.doNots],
    socialRules: [...manifest.socialRules],
    typography: [...manifest.typography],
    drawnByStudio: reading.problems.length === 0 && manifest.assets.some((asset) => asset.logoSlot),
    // A file that failed verification is not offered for download.
    assets: reading.problems.length ? [] : manifest.assets.map((asset) => ({
      role: asset.role,
      kind: asset.kind,
      label: asset.label,
      file: asset.file,
      mediaType: asset.mediaType,
      bytes: asset.bytes,
      sha256: asset.sha256,
      use: asset.use,
      previewGround: previewGround(asset),
      grounds: [...asset.grounds],
      onPhoto: asset.onPhoto,
      pixels: asset.pixels ? `${asset.pixels.width} × ${asset.pixels.height}` : null,
      minimumSize: asset.minimumSize ?? null,
      logoSlot: asset.logoSlot,
      href: assetHref(venture, asset.file, false),
      downloadHref: assetHref(venture, asset.file, true)
    }))
  };
}

async function operatingVentures(): Promise<Map<string, string> | null> {
  try {
    const registry = JSON.parse(await readFile(path.join(repositoryRoot(), "config", "ventures.json"), "utf8")) as {
      ventures?: Array<{ id?: unknown; name?: unknown; status?: unknown }>;
    };
    return new Map((registry.ventures ?? [])
      .filter((venture) => venture.status === "operating" && typeof venture.id === "string")
      .map((venture) => [String(venture.id), typeof venture.name === "string" ? venture.name : String(venture.id)]));
  } catch {
    return null;
  }
}

export async function readBrandKitSnapshot(root = brandKitsRoot()): Promise<BrandKitSnapshot> {
  const operating = await operatingVentures();
  const ventures = brandKitVentures(root).filter((venture) => operating === null || operating.has(venture));
  // Registry order, so the tab lists ventures the way the rest of the admin does.
  const order = operating ? [...operating.keys()] : [];
  ventures.sort((left, right) => order.indexOf(left) - order.indexOf(right) || left.localeCompare(right));
  return { kits: ventures.map((venture) => kitView(venture, pendingName(venture, operating?.get(venture)), root)) };
}

/**
 * One kit file, verified, for the download route. Null for anything the manifest does not list or
 * that fails its hash — the route answers 404 either way.
 */
export async function readBrandKitAsset(
  venture: string,
  file: string,
  root = brandKitsRoot()
): Promise<{ bytes: Buffer; mediaType: string; file: string } | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(venture)) return null;
  const operating = await operatingVentures();
  if (operating !== null && !operating.has(venture)) return null;
  const reading = readBrandKit(venture, root);
  if (!reading.manifest || reading.problems.length) return null;
  const asset = reading.manifest.assets.find((candidate) => candidate.file === file);
  if (!asset) return null;
  const bytes = await readFile(path.join(root, venture, asset.file));
  return { bytes, mediaType: asset.mediaType, file: asset.file };
}
