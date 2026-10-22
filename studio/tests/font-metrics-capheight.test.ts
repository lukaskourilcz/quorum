import { describe, expect, it } from "vitest";
import { FONT_METRICS } from "../src/font-metrics.generated.js";

/*
 * Cap and x heights in the committed metrics table (docs/design-lab/dneskai-kits/ADR.md §8). A
 * layout reads the cap line of the face a slot is set in instead of one constant tuned to three
 * faces; the editorial kit still pins 0.3 em, and the reason is the arithmetic tested below.
 */

const faces = Object.entries(FONT_METRICS);

describe("cap and x heights in the font metrics", () => {
  it("covers all 46 committed faces", () => {
    expect(faces).toHaveLength(46);
  });

  it.each(faces)("%s has a plausible cap height and x-height", (_key, face) => {
    expect(face.capHeight).toBeGreaterThanOrEqual(550);
    expect(face.capHeight).toBeLessThanOrEqual(900);
    expect(face.xHeight).toBeGreaterThanOrEqual(300);
    expect(face.xHeight).toBeLessThanOrEqual(800);
    expect(face.xHeight).toBeLessThan(face.capHeight);
  });

  it("pins the values measured from OS/2 on 2026-10-22", () => {
    expect(FONT_METRICS["space-grotesk-700"]!.capHeight).toBe(700);
    expect(FONT_METRICS["ibm-plex-mono-400"]!.capHeight).toBe(698);
    expect(FONT_METRICS["source-serif-4-400"]!.capHeight).toBe(670);
    expect(FONT_METRICS["anton-400"]!.capHeight).toBe(859);
  });

  it("keeps the editorial faces within 0.035 em of the pinned 0.3 cap offset, which is why the editorial kit pins it", () => {
    for (const key of ["space-grotesk-700", "ibm-plex-mono-400", "source-serif-4-400"]) {
      const derived = 1 - FONT_METRICS[key]!.capHeight / 1_000;
      expect(Math.abs(derived - 0.3), key).toBeLessThanOrEqual(0.035);
    }
    // Source Serif 4 derives 0.33: one pixel at 34 px body type, and one pixel moves a hash.
    expect(1 - FONT_METRICS["source-serif-4-400"]!.capHeight / 1_000).not.toBe(0.3);
  });

  it("leaves the existing fields as the previous table had them", () => {
    expect(FONT_METRICS["space-grotesk-700"]).toMatchObject({ average: 588, fallback: 578 });
    expect(FONT_METRICS["source-serif-4-400"]).toMatchObject({ average: 574, fallback: 416 });
    expect(FONT_METRICS["anton-400"]).toMatchObject({ average: 460, fallback: 492 });
    expect(FONT_METRICS["space-grotesk-700"]!.widths["258"]).toBe("|¦");
    expect(FONT_METRICS["source-serif-4-400"]!.widths["212"]).toBe("ʼ‘’");
    expect(FONT_METRICS["anton-400"]!.widths["216"]).toBe("|");
  });
});
