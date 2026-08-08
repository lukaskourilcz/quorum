import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { ArticleImageSchema } from "../src/contracts/autonomy.js";
import { ImageProgramBudget, IMAGE_GENERATION_DAY_LIMIT } from "../src/images/budget.js";
import { illustrationAltCs } from "../src/images/alt.js";
import {
  ILLUSTRATION_USD_PER_IMAGE,
  illustrationEnabled,
  illustrationImage,
  illustrationPrompt,
  type IllustrationRenderer
} from "../src/images/illustration.js";
import { selectEditionHero } from "../src/images/ladder.js";
import type { GateOutcome } from "../src/images/vision-gate.js";
import type { VisualBrief } from "../src/images/visual-brief.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const made = await mkdtemp(path.join(os.tmpdir(), "illustration-"));
  roots.push(made);
  return made;
}

async function frame(): Promise<Uint8Array> {
  const bytes = await sharp({
    create: { width: 1_344, height: 768, channels: 3, background: { r: 12, g: 14, b: 22 } }
  }).jpeg().toBuffer();
  return new Uint8Array(bytes);
}

const brief: VisualBrief = {
  phrases: ["empty courtroom bench", "government building facade"],
  concept: null,
  negatives: ["circuit board"]
};

function verdict(selected: string | null, sceneCs?: string): GateOutcome["verdict"] {
  return {
    mode: "generated",
    considered: 1,
    selected,
    reason: selected ? "On brief, no text, no faces." : "all-candidates-rejected",
    candidates: [{
      candidateId: "illustration:2026-08-09",
      provider: "boardlessai",
      fit: selected ? 9 : 4,
      vetoes: selected ? [] : ["embedded-text"],
      reason: "Judged.",
      ...(sceneCs ? { sceneCs } : {})
    }],
    skipped: [],
    costUsd: 0.003
  };
}

async function walk(options: {
  stateRoot: string;
  budget?: ImageProgramBudget;
  enabled?: boolean;
  render?: IllustrationRenderer;
  gateSelects?: boolean;
  brief?: VisualBrief | null;
}) {
  const rendered: string[] = [];
  const result = await selectEditionHero(
    {
      venture: "caught-up",
      stateRoot: options.stateRoot,
      cycleId: "cycle-test",
      budget: options.budget ?? new ImageProgramBudget({ usd: 0, generatedImages: 0 }),
      article: { titleCs: "Soud rozhodl", dekCs: "Rozhodnutí mění pravidla." },
      brief: options.brief === undefined ? brief : options.brief,
      seed: "2026-08-09",
      illustrationSlug: "2026-08-09-soud-rozhodl",
      subjectQuery: "courtroom"
    },
    {
      scenePhoto: async () => null,
      search: async () => ({ candidates: [], skippedProviders: [] }),
      illustrationEnabled: () => options.enabled ?? true,
      render: options.render ?? (async ({ prompt }) => {
        rendered.push(prompt);
        return { bytes: await frame(), prompt };
      }),
      gate: async () => ({
        selected: options.gateSelects === false
          ? null
          : ({ id: "illustration:2026-08-09" } as never),
        verdict: verdict(options.gateSelects === false ? null : "illustration:2026-08-09", "prázdná soudní síň")
      })
    }
  );
  return { result, rendered };
}

describe("whether the rung runs at all", () => {
  it("needs both the key and the flag", () => {
    expect(illustrationEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(illustrationEnabled({ FAL_KEY: "k" } as NodeJS.ProcessEnv)).toBe(false);
    expect(illustrationEnabled({ ARTICLE_ILLUSTRATION_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(illustrationEnabled({ FAL_KEY: "k", ARTICLE_ILLUSTRATION_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
    // A flag that is not exactly "true" is not a flag. "1" and "yes" are somebody guessing.
    expect(illustrationEnabled({ FAL_KEY: "k", ARTICLE_ILLUSTRATION_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("is skipped in silence, and reaches the plate, when the rung is dark", async () => {
    let called = false;
    const { result } = await walk({
      stateRoot: await root(),
      enabled: false,
      render: async () => {
        called = true;
        throw new Error("the renderer must not be reached");
      }
    });

    expect(called).toBe(false);
    expect(result.rung).toBe("plate");
    expect(result.illustration).toBeUndefined();
  });

  it("is skipped when the desk wrote no brief, because there is nothing to render", async () => {
    const { result, rendered } = await walk({ stateRoot: await root(), brief: null });
    expect(rendered).toEqual([]);
    expect(result.rung).toBe("plate");
  });
});

describe("the prompt", () => {
  it("carries the desk's phrases and the magazine's prohibitions, and nothing else", () => {
    const prompt = illustrationPrompt("caught-up", brief);
    expect(prompt).toContain("empty courtroom bench, government building facade");
    expect(prompt).toContain("no human faces");
    expect(prompt).toContain("no circuit boards");
    // The headline never travels: a renderer given one would try to draw the words.
    expect(prompt).not.toContain("Soud rozhodl");

    const mma = illustrationPrompt("mma-files", brief);
    expect(mma).toContain("no recognisable faces");
    expect(mma).toContain("no depictions of real fighters");
  });
});

describe("what the rung produces", () => {
  it("attaches an illustration the gate approved, labelled as one", async () => {
    const where = await root();
    const { result, rendered } = await walk({ stateRoot: where });

    expect(rendered).toHaveLength(1);
    expect(result.rung).toBe("illustration");
    expect(result.candidate).toBeNull();
    const image = result.illustration!;
    expect(image.origin).toBe("illustration");
    expect(image.license.name).toBe("BoardlessAI illustration");
    expect(image.license.attribution_html).toBe("Ilustrace: BoardlessAI FRAME");
    // The sentence that keeps it honest, in the alt text a screen-reader user hears.
    expect(image.alt_cs).toBe(illustrationAltCs("prázdná soudní síň"));
    expect(image.alt_cs).toContain("Nejde o fotografii");
    expect(image.hero_path).toBe("public/images/editions/2026-08-09-soud-rozhodl/hero.webp");

    // Billed once, under the programme's own phase, as an image.
    const ledger = JSON.parse(await readFile(path.join(where, "budget", "ledger.json"), "utf8")) as {
      entries: Array<{ phase: string; kind: string; provider: string; usd: number; ventureId: string }>;
    };
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      phase: "article_illustration",
      kind: "image",
      provider: "fal",
      ventureId: "caught-up",
      usd: ILLUSTRATION_USD_PER_IMAGE
    });
  });

  it("burns the attempt when the gate refuses it", async () => {
    // The renderer billed whether or not the picture is used, so a refusal has to count. Two a
    // day means two renders, not two successes.
    const where = await root();
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const { result } = await walk({ stateRoot: where, budget, gateSelects: false });

    expect(result.rung).toBe("plate");
    expect(result.illustration).toBeUndefined();
    expect(budget.spent().generatedImages).toBe(1);
    const ledger = JSON.parse(await readFile(path.join(where, "budget", "ledger.json"), "utf8")) as {
      entries: unknown[];
    };
    expect(ledger.entries).toHaveLength(1);
    // The refusal is on the record too.
    expect(result.verdicts.at(-1)?.mode).toBe("generated");
  });

  it("stops at the day's second render, whichever magazine spent them", async () => {
    const budget = new ImageProgramBudget({ usd: 0.01, generatedImages: IMAGE_GENERATION_DAY_LIMIT });
    let called = false;
    const { result } = await walk({
      stateRoot: await root(),
      budget,
      render: async () => {
        called = true;
        throw new Error("the day's renders are spent");
      }
    });

    expect(called).toBe(false);
    expect(result.rung).toBe("plate");
  });

  it("costs the plate and nothing else when the renderer fails", async () => {
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const { result } = await walk({
      stateRoot: await root(),
      budget,
      render: async () => {
        throw new Error("the renderer is unreachable");
      }
    });

    expect(result.rung).toBe("plate");
    // Nothing was rendered, so nothing is counted against the day.
    expect(budget.spent().generatedImages).toBe(0);
  });
});

describe("the package shape", () => {
  it("round-trips through the schema, and its licence is tied to its origin", async () => {
    const image = await illustrationImage({
      bytes: await frame(),
      venture: "mma-files",
      slug: "ufc-330-preview",
      sceneCs: "světlo haly v oparu"
    });
    expect(ArticleImageSchema.parse(image).origin).toBe("illustration");

    // A rendering under a photographer's licence, and the plate's licence on a rendering.
    expect(() => ArticleImageSchema.parse({
      ...image,
      license: { ...image.license, name: "CC BY" }
    })).toThrow();
    expect(() => ArticleImageSchema.parse({
      ...image,
      license: { ...image.license, name: "BoardlessAI deterministic" }
    })).toThrow();
    // And the reverse: a photograph may not wear the illustration licence.
    expect(() => ArticleImageSchema.parse({
      ...image,
      origin: "photo"
    })).toThrow();
  });
});
