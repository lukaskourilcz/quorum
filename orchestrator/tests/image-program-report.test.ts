import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLiveEdition } from "../src/edition/live.js";
import type { EditionRunReport } from "../src/edition/report.js";
import type { EditionModelGateway } from "../src/edition/types.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema } from "../src/sources/types.js";
import { repoRoot } from "../src/paths.js";
import { imageProgramReadiness } from "../src/images/readiness.js";
import type { GateVerdict } from "../src/images/vision-gate.js";

/**
 * The question the owner could never ask before: why is the published picture that picture?
 *
 * The answer is two halves. The verdict says which candidates were looked at, how each scored
 * and what was wrong with the ones that lost. The readiness beside it says what the run could
 * have reached at all — because a keyless provider and a spent cap used to look identical from
 * outside, both producing a drawn plate and saying nothing.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const VERDICT: GateVerdict = {
  mode: "search",
  considered: 3,
  selected: null,
  reason: "all-candidates-rejected",
  candidates: [
    { candidateId: "pexels:1", provider: "pexels", fit: 4, vetoes: ["wrong-subject"], reason: "A city skyline." },
    { candidateId: "pexels:2", provider: "pexels", fit: 9, vetoes: ["logo-or-watermark"], reason: "An agency bug." },
    { candidateId: "wikimedia:3", provider: "wikimedia", fit: 5, vetoes: [], reason: "Loosely related." }
  ],
  skipped: [{ candidateId: "openverse:4", reason: "404" }],
  costUsd: 0.0041
};

async function runWithVerdict(): Promise<EditionRunReport> {
  const root = await mkdtemp(path.join(os.tmpdir(), "image-report-"));
  roots.push(root);
  const items = (JSON.parse(await readFile(
    path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "source-items.json"),
    "utf8"
  )) as unknown[]).map((item) => SourceItemSchema.parse(item));
  const registry = await loadSourceRegistry();
  const gateway: EditionModelGateway = {
    invoke: async () => {
      throw new Error("the provider is reached through the injected production step, not directly");
    }
  };
  const result = await runLiveEdition({
    cycleId: "20260809050000-cu-edition",
    date: "2026-08-09",
    now: new Date("2026-08-09T05:00:00.000Z"),
    meetingRef: "meetings/2026-08-09-cu-edition",
    roomUrl: "https://boardless.example/meetings/2026-08-09-cu-edition",
    root,
    licensedImageSearchEnabled: true,
    dependencies: {
      loadRegistry: async () => registry,
      scrape: async () => ({
        items,
        sources: registry.sources.slice(0, 12).map((source) => ({
          sourceId: source.id,
          status: "success" as const,
          candidateItems: 1,
          durationMs: 0,
          errorCode: null,
          errorMessage: null
        }))
      }),
      gateway,
      // The ladder's own behaviour is covered where it lives; this stands in for it so no
      // archive is reached, and returns the shape a wholly refused shortlist produces.
      selectHero: async () => ({
        candidate: null,
        rung: "plate" as const,
        verdicts: [VERDICT],
        skippedProviders: [{ provider: "pixabay" as const, reason: "missing-key" as const }]
      }),
      // Stands in for the whole production step: it walks the ladder the way production does,
      // through the resolver the caller handed it, and then fails the way an assembly failure
      // fails. What is under test is that the verdict reached the run report either way.
      produce: async (input) => {
        await input.selectHero?.({
          subjectQuery: "data centre",
          brief: null,
          slug: "2026-08-09-fixture",
          article: { titleCs: "Titulek", dekCs: "Perex." }
        });
        throw new Error("edition package: assembly stopped after the ladder");
      }
    }
  });
  return JSON.parse(await readFile(path.join(root, result.reportPath), "utf8")) as EditionRunReport;
}

describe("what a run report says about the picture", () => {
  it("carries the readiness a dry run would report", async () => {
    const readiness = await imageProgramReadiness({
      stateRoot: await mkdtemp(path.join(os.tmpdir(), "image-readiness-")).then((made) => {
        roots.push(made);
        return made;
      }),
      now: new Date("2026-08-09T05:00:00.000Z"),
      env: { PEXELS_API_KEY: "present-not-printed" } as NodeJS.ProcessEnv
    });

    // Two archives need no credential, which is why the ladder is never wholly keyless.
    expect(readiness.providers).toEqual({
      openverse: "keyless",
      wikimedia: "keyless",
      pexels: "present",
      pixabay: "absent"
    });
    // Presence, never a value. Nothing in the block can carry a key.
    expect(JSON.stringify(readiness)).not.toContain("present-not-printed");
    expect(readiness.gateModelConfigured).toBe(true);
    expect(readiness.caps).toEqual({ perArticleUsd: 0.02, perDayUsd: 0.1, generatedImagesPerDay: 2 });
    expect(readiness.illustrationRung).toBe("dark");
  });

  it("reports the rung armed when both the key and the flag are set", async () => {
    const readiness = await imageProgramReadiness({
      stateRoot: await mkdtemp(path.join(os.tmpdir(), "image-readiness-")).then((made) => {
        roots.push(made);
        return made;
      }),
      now: new Date("2026-08-09T05:00:00.000Z"),
      env: { FAL_KEY: "k", ARTICLE_ILLUSTRATION_ENABLED: "true" } as NodeJS.ProcessEnv
    });
    expect(readiness.illustrationRung).toBe("armed");
  });

  it("carries the gate's verdict, including the run where nothing shipped", async () => {
    const report = await runWithVerdict();

    expect(report.imageProgram?.readiness.caps.perDayUsd).toBe(0.1);
    expect(report.imageProgram?.rung).toBe("plate");
    const verdict = report.imageProgram?.verdicts[0];
    expect(verdict?.reason).toBe("all-candidates-rejected");
    // Every candidate that was looked at, with why it lost. This is the answer to the question.
    expect(verdict?.candidates.map((entry) => `${entry.candidateId}:${entry.fit}`))
      .toEqual(["pexels:1:4", "pexels:2:9", "wikimedia:3:5"]);
    expect(verdict?.candidates[1]?.vetoes).toEqual(["logo-or-watermark"]);
    expect(verdict?.skipped).toEqual([{ candidateId: "openverse:4", reason: "404" }]);
    expect(verdict?.costUsd).toBe(0.0041);
  }, 30_000);
});

