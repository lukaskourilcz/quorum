import { describe, expect, it } from "vitest";
import { BOOK_KB_SCORE_AXES, type BookKbChunk } from "../src/contracts/book-kb-index.js";
import {
  adaptiveCooldownDays,
  doorMoneyHookStyle,
  scorePassageForFormat,
  selectDoorMoneyPassages,
  type DoorMoneyFormatRules
} from "../src/ventures/door-money/select.js";

function chunk(input: {
  id: string;
  chapter?: number;
  scene?: number;
  score?: number;
  themes?: string[];
  arc?: string | null;
  uses?: string[];
}): BookKbChunk {
  const chapter = String(input.chapter ?? Number(input.id.match(/\d+/u)?.[0] ?? 1)).padStart(2, "0");
  const scene = String(input.scene ?? 1).padStart(2, "0");
  const chapterId = `ch${chapter}`;
  const sceneId = `${chapterId}-s${scene}`;
  return {
    id: `${sceneId}-c${input.id.replace(/\D/gu, "").slice(-3).padStart(3, "0")}`,
    chapterId,
    sceneId,
    ordinal: Number(input.id.replace(/\D/gu, "")) || 1,
    arc: input.arc === undefined ? `arc-${input.id}` : input.arc,
    byteOffsets: { start: 0, end: 1 },
    summary: `Invented metadata summary ${input.id}.`,
    entities: [],
    themes: input.themes ?? [`theme-${input.id}`],
    era: "invented-era",
    storyType: "lesson",
    quotables: [],
    scores: Object.fromEntries(BOOK_KB_SCORE_AXES.map((axis) => [axis, {
      score: input.score ?? 5,
      justification: `Invented reason for ${axis}.`
    }])) as BookKbChunk["scores"],
    usageHistory: (input.uses ?? []).map((recommendedOn, index) => ({
      recommendationId: `invented-${input.id}-${index}`,
      recommendationPath: `state/ventures/door-money/recommendations/invented-${input.id}-${index}.json`,
      recommendedOn,
      format: "carousel"
    }))
  };
}

const permissiveRules = Object.fromEntries([
  "carousel",
  "single-image",
  "thread",
  "caption",
  "short-video-script"
].map((format) => [format, { threshold: 0, axisWeights: { entertainment: 1 } }])) as DoorMoneyFormatRules;

describe("Door Money passage selection", () => {
  it("is stable across rebuilds and independent of index order", () => {
    const chunks = [chunk({ id: "1" }), chunk({ id: "2" }), chunk({ id: "3" })];
    const first = selectDoorMoneyPassages({ ventureId: "door-money", date: "2026-09-01", chunks });
    const rebuilt = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [...chunks].reverse()
    });
    expect(rebuilt).toEqual(first);
    expect(first.seed).toBe("2026-09-01:door-money");
    expect(first.passages).toHaveLength(2);
  });

  it("applies each format threshold before performance weighting", () => {
    const low = chunk({ id: "10", score: 3 });
    const result = selectDoorMoneyPassages({ ventureId: "door-money", date: "2026-09-01", chunks: [low] });
    expect(result).toMatchObject({
      kind: "quiet-day",
      reason: "no-eligible-passages",
      diagnostics: { excluded: { scoreThreshold: 1 } }
    });

    const base = scorePassageForFormat({ chunk: chunk({ id: "11", score: 4 }), format: "carousel" });
    const boosted = scorePassageForFormat({
      chunk: chunk({ id: "11", score: 4, themes: ["tour-work"] }),
      format: "carousel",
      performanceWeights: { formatPriors: { carousel: 1.2 }, themePriors: { "tour-work": 1.25 } }
    });
    expect(base.baseScore).toBe(4);
    expect(boosted.baseScore).toBe(4);
    expect(boosted.performanceMultiplier).toBe(1.5);
    expect(boosted.weightedScore).toBe(6);
  });

  it("reads deterministic hook-style priors and clamps the combined feedback multiplier", () => {
    const fixture = chunk({ id: "12", score: 4, themes: ["tour-work"] });
    expect(doorMoneyHookStyle(fixture.scores)).toBe("narrative-led");
    const low = scorePassageForFormat({
      chunk: fixture,
      format: "carousel",
      performanceWeights: {
        formatPriors: { carousel: 0.5 },
        themePriors: { "tour-work": 0.5 },
        hookStylePriors: { "narrative-led": 0.5 }
      }
    });
    const high = scorePassageForFormat({
      chunk: fixture,
      format: "carousel",
      performanceWeights: {
        formatPriors: { carousel: 1.5 },
        themePriors: { "tour-work": 1.5 },
        hookStylePriors: { "narrative-led": 1.5 }
      }
    });
    expect(low.performanceMultiplier).toBe(0.5);
    expect(high.performanceMultiplier).toBe(1.5);
    expect(selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [fixture],
      performanceWeights: { hookStylePriors: { "narrative-led": 1.2 } }
    }).passages[0]).toMatchObject({ hookStyle: "narrative-led" });
  });

  it("applies a modest deterministic boost only to themes in recorded trend-call tactics", () => {
    const chunks = [
      chunk({ id: "13", chapter: 1, themes: ["author-marketing"], arc: "author-work" }),
      chunk({ id: "14", chapter: 2, themes: ["night-work"], arc: "night-work" })
    ];
    const trendBrief = { tactics: [{
      description: "Trend call: author marketing (door-money, free google-news signal): 2 articles."
    }] };
    const first = selectDoorMoneyPassages({
      ventureId: "door-money", date: "2026-09-01", chunks, trendBrief
    });
    const rebuilt = selectDoorMoneyPassages({
      ventureId: "door-money", date: "2026-09-01", chunks: [...chunks].reverse(), trendBrief
    });
    expect(rebuilt).toEqual(first);
    const byTheme = new Map(first.passages.map((passage) => [passage.themes[0], passage]));
    expect(byTheme.get("author-marketing")?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1.05)).toBe(true);
    expect(byTheme.get("night-work")?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1)).toBe(true);
    expect(byTheme.get("author-marketing")?.formatScores.every(({ performanceMultiplier }) => performanceMultiplier === 1)).toBe(true);
  });

  it("does not infer a trend from an ordinary GoVIRAL idea that mentions a theme", () => {
    const result = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [chunk({ id: "15", themes: ["author-marketing"] })],
      trendBrief: { tactics: [{ description: "Owner idea: write an author marketing checklist." }] }
    });
    expect(result.passages[0]?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1)).toBe(true);
  });

  it("enforces the 21-day minimum and doubles a longer last-use interval", () => {
    expect(adaptiveCooldownDays([])).toBe(21);
    expect(adaptiveCooldownDays(["2026-06-01", "2026-06-11"])).toBe(21);
    expect(adaptiveCooldownDays(["2026-06-01", "2026-07-01"])).toBe(60);

    const cooling = chunk({ id: "20", uses: ["2026-06-01", "2026-07-01"] });
    expect(selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-08-29",
      chunks: [cooling],
      formatRules: permissiveRules
    })).toMatchObject({ kind: "quiet-day", diagnostics: { excluded: { chapterCooldown: 1 } } });
    expect(selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-08-30",
      chunks: [cooling],
      formatRules: permissiveRules
    }).kind).toBe("selected");
  });

  it("cools a theme across chapters", () => {
    const used = chunk({ id: "31", chapter: 1, themes: ["night-work"], uses: ["2026-08-20"] });
    const sameTheme = chunk({ id: "32", chapter: 2, themes: ["night-work"] });
    const result = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [used, sameTheme],
      formatRules: permissiveRules
    });
    expect(result).toMatchObject({
      kind: "quiet-day",
      diagnostics: { excluded: { chapterCooldown: 1, themeCooldown: 1 } }
    });
  });

  it("blocks an arc used in the prior seven days after other cooldowns clear", () => {
    const oldChapterUse = chunk({ id: "41", chapter: 1, arc: "return-trip", uses: ["2026-08-27"] });
    const sameArc = chunk({ id: "42", chapter: 2, arc: "return-trip" });
    const result = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [oldChapterUse, sameArc],
      formatRules: permissiveRules
    });
    expect(result).toMatchObject({
      kind: "quiet-day",
      diagnostics: { excluded: { chapterCooldown: 1, arcRepeat: 1 } }
    });
  });

  it("does not let today's recorded use perturb an idempotent rebuild", () => {
    const withoutToday = chunk({ id: "50" });
    const withToday = chunk({ id: "50", uses: ["2026-09-01"] });
    const first = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [withoutToday],
      formatRules: permissiveRules
    });
    const rebuilt = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [withToday],
      formatRules: permissiveRules
    });
    expect(rebuilt).toEqual(first);
  });

  it("rejects feedback priors outside the bounded selection range", () => {
    expect(() => selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: [chunk({ id: "60" })],
      performanceWeights: { formatPriors: { carousel: 0.49 } }
    })).toThrow(/between 0.5 and 1.5/u);
  });
});
