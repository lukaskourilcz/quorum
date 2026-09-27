import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_KITS_DIRECTORY,
  brandKitVentures,
  kitLogotype,
  readBrandKit,
  readBrandKits
} from "../src/brand-kit.js";
import { CAROUSEL_BRANDS } from "../src/library.js";

const readings = readBrandKits();
/** Kits with a manifest. A directory without one is a kit on its way and holds only its README. */
const kits = readings.filter((reading) => !reading.problems.includes("manifest.json is missing"));

function svgFills(file: string): string[] {
  const drawing = readFileSync(file, "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/g, "");
  return [...new Set([...drawing.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((match) => match[1]!.toLowerCase()))].sort();
}

describe("brand kits", () => {
  it("ships the DNESKAi and devShark kits", () => {
    expect(brandKitVentures()).toEqual(expect.arrayContaining(["caught-up", "marketingshark"]));
    expect(kits.map((kit) => path.basename(kit.directory))).toEqual(expect.arrayContaining(["caught-up", "marketingshark"]));
  });

  it("lets a pending kit directory hold nothing but its README", () => {
    for (const reading of readings.filter((candidate) => !kits.includes(candidate))) {
      expect(readdirSync(reading.directory)).toEqual(["README.md"]);
    }
  });

  it.each(kits.map((kit) => [path.basename(kit.directory), kit] as const))("%s: manifest parses and every file matches its size and sha256", (_venture, kit) => {
    expect(kit.problems).toEqual([]);
    expect(kit.manifest).not.toBeNull();
  });

  it.each(kits.map((kit) => [path.basename(kit.directory), kit] as const))("%s: holds no file the manifest does not name", (_venture, kit) => {
    const named = new Set(["manifest.json", ...(kit.manifest?.assets.map((asset) => asset.file) ?? [])]);
    expect(readdirSync(kit.directory).filter((file) => !named.has(file))).toEqual([]);
  });

  it.each(kits.map((kit) => [path.basename(kit.directory), kit] as const))("%s: records the fills and viewBox each SVG actually draws", (_venture, kit) => {
    for (const asset of kit.manifest!.assets) {
      if (asset.mediaType !== "image/svg+xml") continue;
      const file = path.join(kit.directory, asset.file);
      expect(svgFills(file), asset.file).toEqual([...asset.inks].sort());
      const viewBox = /viewBox="([^"]+)"/.exec(readFileSync(file, "utf8"))?.[1]?.split(/\s+/).map(Number);
      expect(viewBox, asset.file).toEqual(asset.viewBox);
    }
  });

  it.each(kits.map((kit) => [path.basename(kit.directory), kit] as const))("%s: dresses a studio brand whose tokens are the kit's carousel palette", (_venture, kit) => {
    const manifest = kit.manifest!;
    const brand = CAROUSEL_BRANDS[manifest.studioBrand as keyof typeof CAROUSEL_BRANDS];
    expect(brand, `${manifest.studioBrand} is not a studio brand`).toBeDefined();
    // Case-insensitive: devShark's recorded frames still carry the capitals (see library.ts).
    expect(brand.logoText.toLowerCase()).toBe(manifest.displayName.toLowerCase());
    if (manifest.carouselPalette) {
      expect(brand.colors).toEqual(Object.fromEntries(Object.entries(manifest.carouselPalette).map(([token, entry]) => [token, entry.value])));
    }
  });

  it("reports a tampered or missing file instead of using it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "brand-kit-"));
    cpSync(path.join(BRAND_KITS_DIRECTORY, "caught-up"), path.join(root, "caught-up"), { recursive: true });
    const logo = path.join(root, "caught-up", "DNESKAi-logo.svg");
    writeFileSync(logo, readFileSync(logo, "utf8").replace("#2F5AE6", "#FF0000"));
    const reading = readBrandKit("caught-up", root);
    expect(reading.problems).toEqual(["DNESKAi-logo.svg does not match its recorded sha256"]);
    expect(() => kitLogotype(reading)).toThrow(/unusable/);
    expect(readBrandKit("marketingshark", root).problems).toEqual(["manifest.json is missing"]);
  });
});
