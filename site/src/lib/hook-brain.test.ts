import { SEED_TEMPLATES } from "@boardlessai/carousel-studio";
import { describe, expect, it, vi } from "vitest";
import { previewPayload, previewPayloadForBrand, slideOneTextSlot } from "./carousel-studio";
import { readHookBrain, RECENT_ASSIGNMENT_LIMIT } from "./hook-brain";

vi.mock("server-only", () => ({}));

const poster = SEED_TEMPLATES.find((template) => template.id === "minimal-text-poster")!;

describe("the hook brain snapshot", () => {
  it("counts every surface, all three now authored", async () => {
    const snapshot = await readHookBrain();
    expect(snapshot.surfaces.map((surface) => surface.surface)).toEqual(["quiz", "news", "mma"]);

    const quiz = snapshot.surfaces.find((surface) => surface.surface === "quiz")!;
    expect(quiz.hooks).toBe(50);
    expect(quiz.archetypes).toBeGreaterThan(10);
    expect(quiz.note).toBeNull();

    // The magazines were the two standing no-hook surfaces. Their packs now carry a gated line,
    // so nothing should still be reporting itself as unauthored.
    for (const surface of ["news", "mma"] as const) {
      const entry = snapshot.surfaces.find((candidate) => candidate.surface === surface)!;
      expect(entry.hooks).toBeGreaterThanOrEqual(12);
      expect(entry.archetypes).toBeGreaterThanOrEqual(8);
      expect(entry.note).toBeNull();
    }
  });

  it("resolves a real assignment for every fixture item", async () => {
    const snapshot = await readHookBrain();
    expect(snapshot.previews.length).toBeGreaterThan(0);
    for (const preview of snapshot.previews) {
      expect(preview.hookId).not.toBeNull();
      expect(preview.en).not.toBeNull();
      expect(preview.cs).not.toBeNull();
      // A rendered hook never carries an unfilled token to a slide.
      expect(preview.en).not.toMatch(/\{[a-z]+\}/u);
      expect(preview.cs).not.toMatch(/\{[a-z]+\}/u);
      expect(preview.gates.length).toBeGreaterThan(0);
      expect(preview.eligibleCount).toBeGreaterThanOrEqual(5);
    }
  });

  it("shows both verticals, because the split is the point of two variants", async () => {
    const snapshot = await readHookBrain();
    expect(new Set(snapshot.previews.map((preview) => preview.vertical))).toEqual(new Set(["dev", "geo"]));
  });

  it("caps the recent feed and counts logged fallbacks", async () => {
    const snapshot = await readHookBrain();
    expect(snapshot.recent.length).toBeLessThanOrEqual(RECENT_ASSIGNMENT_LIMIT);
    expect(snapshot.fallbackCount).toBe(snapshot.recent.filter((row) => row.fallback !== null).length);
  });
});

describe("brand-aware preview payloads", () => {
  it("puts a real assigned hook in slide 1 for the quiz brands", async () => {
    const slot = slideOneTextSlot(poster)!;
    const generic = previewPayload(poster, "en");

    for (const brand of ["devshark", "geoshark"] as const) {
      const payload = await previewPayloadForBrand(poster, "en", brand);
      expect(payload.strings[slot]).not.toBe(generic.strings[slot]);
      expect(payload.strings[slot]!.length).toBeLessThanOrEqual(58);
      // Every other slot keeps its fixture text: only slide 1 is the studio's to assign.
      for (const [key, value] of Object.entries(generic.strings)) {
        if (key !== slot) expect(payload.strings[key]).toBe(value);
      }
    }
  });

  it("gives the two verticals different lines", async () => {
    const slot = slideOneTextSlot(poster)!;
    const dev = await previewPayloadForBrand(poster, "en", "devshark");
    const geo = await previewPayloadForBrand(poster, "en", "geoshark");
    expect(dev.strings[slot]).not.toBe(geo.strings[slot]);
  });

  it("renders Czech from the Czech variant, within its own budget", async () => {
    const slot = slideOneTextSlot(poster)!;
    const cs = await previewPayloadForBrand(poster, "cs", "devshark");
    const en = await previewPayloadForBrand(poster, "en", "devshark");
    expect(cs.strings[slot]).not.toBe(en.strings[slot]);
    expect([...cs.strings[slot]!].length).toBeLessThanOrEqual(66);
  });

  it("leaves a non-quiz brand's fixture headline alone", async () => {
    // Their libraries are unwritten. Inventing a hook for a preview would show something the
    // pipeline would never produce.
    const slot = slideOneTextSlot(poster)!;
    const generic = previewPayload(poster, "en");
    for (const brand of ["caught-up", "mma-files", "titty-tuesdays"] as const) {
      const payload = await previewPayloadForBrand(poster, "en", brand);
      expect(payload.strings[slot]).toBe(generic.strings[slot]);
    }
  });

  it("is stable across calls, so a preview URL keeps its ETag", async () => {
    const first = await previewPayloadForBrand(poster, "en", "devshark");
    const second = await previewPayloadForBrand(poster, "en", "devshark");
    expect(first).toEqual(second);
  });
});
