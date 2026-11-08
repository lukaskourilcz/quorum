import { describe, expect, it } from "vitest";
import { falFrameUsd, parseConfig, PERSONA_KEYS } from "../src/config.js";
import { pickShots } from "../src/select.js";
import { config } from "./helpers.js";

describe("the shot list", () => {
  it("parses, and every prompt forbids people, faces, text and logos in its own words", async () => {
    const loaded = await config();
    for (const persona of PERSONA_KEYS) {
      const shots = loaded.personas[persona].shots;
      expect(shots.length, persona).toBeGreaterThanOrEqual(8);
      for (const shot of shots) {
        const prompt = shot.prompt.toLowerCase();
        for (const phrase of ["no people", "no faces", "no text", "no logos"]) expect(prompt, shot.id).toContain(phrase);
        expect(shot.id.startsWith(persona), shot.id).toBe(true);
      }
    }
  });

  it("refuses a prompt that leaves the prohibition out", async () => {
    const raw = await config();
    raw.personas.nina.shots[0]!.prompt = "A latte on a marble table by a rainy window in Prague, soft light from the left.";
    expect(() => parseConfig(raw)).toThrow(/no people/u);
  });

  it("refuses a shot id used twice", async () => {
    const raw = await config();
    raw.personas.teresa.shots[0]!.id = raw.personas.nina.shots[0]!.id;
    expect(() => parseConfig(raw)).toThrow(/appears twice/u);
  });

  it("prices fal by the megapixel rounded up", async () => {
    const loaded = await config();
    // 1080x1350 is 1.46 MP, billed as 2; 1080x1920 is 2.07 MP, billed as 3.
    expect(falFrameUsd(loaded, "4:5")).toBeCloseTo(0.05, 6);
    expect(falFrameUsd(loaded, "9:16")).toBeCloseTo(0.075, 6);
  });
});

describe("pickShots", () => {
  const shots = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `nina-s${i}`, pillar: "views" as const, prompt: "p", aspects: ["4:5" as const] }));

  it("never repeats a shot until the whole list has run", async () => {
    const list = shots(5);
    let used: string[] = [];
    const seen: string[] = [];
    for (const date of ["2026-11-01", "2026-11-02"]) {
      const result = pickShots({ shots: list, used, count: 2, date, persona: "nina" });
      seen.push(...result.picked.map((shot) => shot.id));
      used = result.used;
    }
    expect(new Set(seen).size).toBe(4);
    const third = pickShots({ shots: list, used, count: 2, date: "2026-11-03", persona: "nina" });
    // One shot was left; it comes first, then a new cycle starts without today's pick in it.
    expect(third.picked.map((shot) => shot.id)).toContain(list.find((shot) => !seen.includes(shot.id))!.id);
    expect(new Set(third.picked.map((shot) => shot.id)).size).toBe(2);
    expect(third.used).toHaveLength(1);
  });

  it("picks the same shots for the same day and persona, and different ones for another persona", () => {
    const list = shots(10);
    const a = pickShots({ shots: list, used: [], count: 3, date: "2026-11-08", persona: "nina" });
    const b = pickShots({ shots: list, used: [], count: 3, date: "2026-11-08", persona: "nina" });
    const c = pickShots({ shots: list, used: [], count: 3, date: "2026-11-08", persona: "teresa" });
    expect(a.picked).toEqual(b.picked);
    expect(c.picked).not.toEqual(a.picked);
  });

  it("drops a shot that left the config from the rotation", () => {
    const list = shots(3);
    const result = pickShots({ shots: list, used: ["nina-gone", "nina-s0"], count: 1, date: "2026-11-08", persona: "nina" });
    expect(result.used).not.toContain("nina-gone");
    expect(result.picked[0]!.id).not.toBe("nina-s0");
  });

  it("caps the count at the list length without repeating within the day", () => {
    const result = pickShots({ shots: shots(3), used: ["nina-s1"], count: 9, date: "2026-11-08", persona: "nina" });
    expect(result.picked).toHaveLength(3);
    expect(new Set(result.picked.map((shot) => shot.id)).size).toBe(3);
  });
});
