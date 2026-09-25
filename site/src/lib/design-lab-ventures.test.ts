import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS } from "@boardlessai/carousel-studio";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activeDesignLabVentureIds,
  designLabVentureIds,
  isDesignLabVenture,
  readDesignLabSections,
  readDesignLabVenture
} from "@/lib/design-lab-ventures";

/**
 * The Design Lab's sections are the renderer's brand registry, and that is the whole point.
 *
 * The alternative — a list of ventures written in the admin — is a list that has to be remembered
 * twice. A venture would acquire an identity, the studio would happily draw for it, and its
 * section would be missing with nothing to say so: no error, no empty state, just a venture the
 * owner cannot open. Holding the section list to `CAROUSEL_BRANDS` means a new venture gets its
 * section by the same act that lets the studio render for it at all.
 */
describe("the Design Lab's venture sections", () => {
  it("offers one section per brand the engine can render, in the engine's own order", () => {
    expect(designLabVentureIds()).toEqual(Object.keys(CAROUSEL_BRANDS));
  });

  it("covers every venture the owner named, whether or not it publishes articles", () => {
    // Titty Tuesdays delivers no articles. It still has a palette and three typefaces, which is
    // exactly what its section is for. devShark's section lists marketingShark's packages.
    for (const id of ["caught-up", "mma-files", "devshark", "titty-tuesdays", "tehdejsi-svet"]) {
      expect(designLabVentureIds()).toContain(id);
    }
  });

  it("keeps devShark as the only shark section", () => {
    // The geography brand retired with StudyShark. A section for it would offer the owner a
    // palette for a product nothing promotes any more.
    expect(designLabVentureIds().filter((id) => id.endsWith("shark"))).toEqual(["devshark"]);
  });

  it("opens article rails for every summary-producing venture", async () => {
    for (const id of ["caught-up", "mma-files", "kvorum", "booksofhistory", "door-money", "tehdejsi-svet", "devshark"] as const) {
      expect((await readDesignLabVenture(id)).publishesArticles, id).toBe(true);
    }
  });

  it("recognises only ids the registry declares", () => {
    expect(isDesignLabVenture("mma-files")).toBe(true);
    expect(isDesignLabVenture("carousel-studio")).toBe(false);
    expect(isDesignLabVenture("dneskai")).toBe(false);
    expect(isDesignLabVenture(undefined)).toBe(false);
  });

  it("gives every section the accent and the two typefaces its renders will use", () => {
    // The section shows the tokens the export route hands the renderer, so a section that cannot
    // name them is one whose preview would come out in colours the owner never saw.
    for (const id of designLabVentureIds()) {
      const brand = CAROUSEL_BRANDS[id];
      expect(brand.colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.colors.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.fonts.headline.length).toBeGreaterThan(1);
      expect(brand.fonts.body.length).toBeGreaterThan(1);
    }
  });
});

describe("the Design Lab offers running ventures only (operations-2026-09b)", () => {
  it("lists DNESKAi, devShark and WebDev Signal with today's registry", async () => {
    expect(await activeDesignLabVentureIds()).toEqual(["caught-up", "devshark", "webdev-signal"]);
    expect((await readDesignLabSections()).map((section) => section.id)).toEqual(["caught-up", "devshark", "webdev-signal"]);
  });

  it("drops a paused venture's brand and a disabled marketingShark brand, and keeps both renderable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "design-lab-active-"));
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [
        { id: "caught-up", status: "operating" },
        { id: "mma-files", status: "paused" },
        { id: "marketingshark", status: "operating" },
        { id: "titty-tuesdays", status: "operating" }
      ]
    }));
    await writeFile(path.join(root, "config", "marketingshark.json"), JSON.stringify({
      brands: [{ id: "devshark", enabled: true }, { id: "geoshark", enabled: false }]
    }));
    expect(await activeDesignLabVentureIds(root)).toEqual(["caught-up", "titty-tuesdays", "devshark"]);
    // The renderer's registry is untouched: a paused brand's recorded decks still render.
    expect(isDesignLabVenture("mma-files")).toBe(true);
  });

  it("offers every brand rather than none when the registry cannot be read", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "design-lab-missing-"));
    expect(await activeDesignLabVentureIds(root)).toEqual(designLabVentureIds());
  });
});
