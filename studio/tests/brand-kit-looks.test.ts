import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRAND_KITS_DIRECTORY, CarouselLookSchema, readBrandKit } from "../src/brand-kit.js";
import { dressBrand, kitLookFamilies, kitStyleFor, kitStyleWithLook, readKitStyle } from "../src/kit-style.js";
import { CAROUSEL_BRANDS } from "../src/library.js";

/*
 * Brand kit looks (docs/design-lab/dneskai-kits/ADR.md §4): named overlays of a kit's carousel
 * palette, faces and style flags, one file each in `brand-kits/<kit>/looks/`. The default look
 * must equal the kit's own palette and faces entry for entry, which is what keeps every render
 * made before looks existed byte-identical.
 */

const DNESKAI_LOOKS = ["editorial"];

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A copy of the caught-up kit in a temp root, with one look file rewritten. */
function tampered(edit: (root: string) => void): string {
  const root = mkdtempSync(path.join(tmpdir(), "brand-kit-looks-"));
  temporary.push(root);
  cpSync(path.join(BRAND_KITS_DIRECTORY, "caught-up"), path.join(root, "caught-up"), { recursive: true });
  edit(path.join(root, "caught-up"));
  return root;
}

function rewriteJson(file: string, change: (value: Record<string, any>) => void): void {
  const value = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
  change(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("brand kit looks: the manifest and the files", () => {
  const reading = readBrandKit("caught-up");

  it("reads the caught-up kit clean, with the looks its manifest lists", () => {
    expect(reading.problems).toEqual([]);
    expect(reading.manifest!.carouselLooks).toEqual({ default: "editorial", ids: DNESKAI_LOOKS });
    expect(reading.looks.map((look) => look.id)).toEqual(DNESKAI_LOOKS);
  });

  it.each(DNESKAI_LOOKS)("looks/%s.json parses and names itself", (id) => {
    const raw = JSON.parse(readFileSync(path.join(reading.directory, "looks", `${id}.json`), "utf8"));
    expect(CarouselLookSchema.parse(raw).id).toBe(id);
  });

  it("keeps the default look equal to the kit's carousel palette and fonts, entry for entry", () => {
    const manifest = reading.manifest!;
    const look = reading.looks.find((entry) => entry.id === manifest.carouselLooks!.default)!;
    expect(look.palette).toEqual(manifest.carouselPalette);
    expect(look.fonts).toEqual(manifest.carouselFonts);
    expect(look.style).toEqual({});
  });

  it("names a default look that drifted from the palette", () => {
    const root = tampered((kit) => rewriteJson(path.join(kit, "looks", "editorial.json"), (look) => { look.palette.accent.value = "#ff00ff"; }));
    const result = readBrandKit("caught-up", root);
    expect(result.problems).toEqual(["the default look editorial differs from carouselPalette at accent"]);
    expect(result.looks).toEqual([]);
  });

  it("names a default look whose face drifted", () => {
    const root = tampered((kit) => rewriteJson(path.join(kit, "looks", "editorial.json"), (look) => { look.fonts.body.family = "Literata"; }));
    expect(readBrandKit("caught-up", root).problems).toEqual(["the default look editorial differs from carouselFonts at body"]);
  });

  it("names a missing look file", () => {
    const root = tampered((kit) => rmSync(path.join(kit, "looks", "editorial.json")));
    expect(readBrandKit("caught-up", root).problems).toEqual(["looks/editorial.json is missing"]);
  });

  it("names a look that clears a flag the kit sets", () => {
    const root = tampered((kit) => rewriteJson(path.join(kit, "looks", "editorial.json"), (look) => { look.style = { flat: false }; }));
    expect(readBrandKit("caught-up", root).problems).toEqual(["look editorial clears flat, which the kit sets"]);
  });

  it("names a look file the manifest does not list, a file under the wrong name and one that is not JSON", () => {
    const root = tampered((kit) => {
      writeFileSync(path.join(kit, "looks", "stray.json"), "{}");
      rewriteJson(path.join(kit, "manifest.json"), (manifest) => { manifest.carouselLooks.ids.push("second", "broken"); });
      rewriteJson(path.join(kit, "looks", "editorial.json"), () => undefined);
      writeFileSync(path.join(kit, "looks", "second.json"), readFileSync(path.join(kit, "looks", "editorial.json")));
      writeFileSync(path.join(kit, "looks", "broken.json"), "{ not json");
    });
    const problems = readBrandKit("caught-up", root).problems;
    expect(problems).toContain("looks/ holds stray.json the manifest does not list");
    expect(problems).toContain("looks/second.json names look editorial, file is second");
    expect(problems.some((entry) => entry.startsWith("looks/broken.json is not JSON:"))).toBe(true);
  });

  it("refuses a manifest whose default look is not listed", () => {
    const root = tampered((kit) => rewriteJson(path.join(kit, "manifest.json"), (manifest) => { manifest.carouselLooks.default = "absent"; }));
    expect(readBrandKit("caught-up", root).problems).toEqual(["carouselLooks.default: The default look absent is not listed"]);
  });
});

describe("brand kit looks: the kit style", () => {
  const brand = CAROUSEL_BRANDS["caught-up"];
  const style = kitStyleFor(brand)!;

  it("exposes the kit's looks and its default", () => {
    expect([...style.looks.keys()]).toEqual(DNESKAI_LOOKS);
    expect(style.defaultLook).toBe("editorial");
  });

  it("returns the cached style itself when no look is asked for", () => {
    expect(kitStyleWithLook(style)).toBe(style);
    expect(kitStyleWithLook(style, undefined)).toBe(style);
    expect(kitStyleWithLook(null)).toBeNull();
  });

  it("throws for a look the kit does not declare, and for a look on a brand with no kit", () => {
    expect(() => kitStyleWithLook(style, "no-such")).toThrow(/declares no look no-such/);
    expect(() => kitStyleWithLook(null, "editorial")).toThrow(/names no brand kit/);
  });

  it("dresses the brand in the default look exactly as in the kit's base palette", () => {
    expect(dressBrand(brand, kitStyleWithLook(style, "editorial"))).toEqual(dressBrand(brand, style));
    const dressed = kitStyleWithLook(style, "editorial");
    expect([dressed.flat, dressed.squareCorners, dressed.logo]).toEqual([style.flat, style.squareCorners, style.logo]);
    expect(kitStyleWithLook(style, "editorial")).toBe(dressed);
  });

  it("folds every look's colours into the kit's colours and lists every look family", () => {
    for (const look of style.looks.values()) for (const colour of look.colours) expect(style.colours.has(colour), `${look.id} ${colour}`).toBe(true);
    expect(kitLookFamilies(style).sort()).toEqual(["IBM Plex Mono", "Source Serif 4", "Space Grotesk"]);
  });

  it("refuses a look that names a family the studio does not ship", () => {
    const root = tampered((kit) => {
      rewriteJson(path.join(kit, "manifest.json"), (manifest) => { manifest.carouselLooks.ids.push("odd"); });
      rewriteJson(path.join(kit, "looks", "editorial.json"), () => undefined);
      const odd = JSON.parse(readFileSync(path.join(kit, "looks", "editorial.json"), "utf8"));
      odd.id = "odd";
      odd.fonts.headline.family = "Comic Sans";
      writeFileSync(path.join(kit, "looks", "odd.json"), JSON.stringify(odd));
    });
    expect(readBrandKit("caught-up", root).problems).toEqual([]);
    expect(() => readKitStyle("caught-up", root)).toThrow("Brand kit caught-up look odd names a family the studio does not ship: Comic Sans");
  });
});
