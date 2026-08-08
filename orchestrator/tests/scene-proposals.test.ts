import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_OPEN_PROPOSALS,
  PROPOSAL_FIT_THRESHOLD,
  proposeCuratedScene,
  sceneProposalsPath
} from "../src/images/scene-proposals.js";
import type { LicensedPhotoCandidate } from "../src/images/licensed.js";
import type { GateCandidateVerdict } from "../src/images/vision-gate.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const made = await mkdtemp(path.join(os.tmpdir(), "scene-proposals-"));
  roots.push(made);
  return made;
}

function candidate(id: string): LicensedPhotoCandidate {
  return {
    id,
    provider: "pexels",
    title: `Empty arena ${id}`,
    thumbnailUrl: `https://images.pexels.com/${id}-medium.jpg`,
    downloadUrl: `https://images.pexels.com/${id}.jpg`,
    width: 1_920,
    height: 1_080,
    license: "Pexels License",
    author: "A photographer",
    sourceUrl: `https://www.pexels.com/photo/${id}/`,
    attributionHtml: "Photo by A photographer on Pexels"
  };
}

function verdict(overrides: Partial<GateCandidateVerdict> = {}): GateCandidateVerdict {
  return {
    candidateId: "pexels:1",
    provider: "pexels",
    fit: 9,
    vetoes: [],
    reason: "An empty arena bowl, nobody in frame.",
    sceneCs: "prázdná aréna před otevřením dveří",
    ...overrides
  };
}

async function file(where: string, venture: "caught-up" | "mma-files" = "mma-files"): Promise<string> {
  return readFile(path.join(where, sceneProposalsPath(venture)), "utf8");
}

describe("the scene-proposal flywheel", () => {
  it("writes one unchecked line carrying everything a reviewer needs", async () => {
    const where = await root();
    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:1"),
      verdict: verdict()
    })).toBe(true);

    const written = await file(where);
    expect(written).toContain("# Curated scene proposals — MMA Files");
    const line = written.split("\n").find((entry) => entry.startsWith("- [ ]"))!;
    expect(line).toContain("**Empty arena pexels:1**");
    expect(line).toContain("pexels `pexels:1`");
    // The licence as the validator accepted it, not as a page claimed it.
    expect(line).toContain("Pexels License");
    expect(line).toContain("fit 9");
    expect(line).toContain("Scéna: prázdná aréna před otevřením dveří");
    expect(line).toContain("<https://www.pexels.com/photo/pexels:1/>");
    // The Czech line says what is in the frame and names nobody and nothing.
    expect(line).not.toMatch(/UFC|OKTAGON|202\d/u);
  });

  it("proposes nothing that carried a veto, however well it scored", async () => {
    const where = await root();
    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:1"),
      verdict: verdict({ fit: 10, vetoes: ["dated-aesthetic"] })
    })).toBe(false);
  });

  it("proposes nothing that only just cleared the shipping bar", async () => {
    // Seven is good enough to run above one article. The curated set is what runs above many.
    const where = await root();
    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:1"),
      verdict: verdict({ fit: PROPOSAL_FIT_THRESHOLD - 1 })
    })).toBe(false);
  });

  it("proposes nothing the gate wrote no scene line for", async () => {
    // The Czech line is what a curated entry ships as its alt text. Without one there is nothing
    // to review and nothing to promote.
    const where = await root();
    const { sceneCs: _dropped, ...withoutScene } = verdict();
    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:1"),
      verdict: withoutScene
    })).toBe(false);
  });

  it("counts one photograph once, however often the search returns it", async () => {
    const where = await root();
    const once = { root: where, venture: "mma-files" as const, candidate: candidate("pexels:1"), verdict: verdict() };
    expect(await proposeCuratedScene(once)).toBe(true);
    expect(await proposeCuratedScene(once)).toBe(false);
    expect((await file(where)).match(/^- \[ \] /gmu)).toHaveLength(1);
  });

  it("stops at twenty open proposals and says nothing about it", async () => {
    // A review queue nobody can finish is a review queue nobody starts.
    const where = await root();
    for (let index = 0; index < MAX_OPEN_PROPOSALS + 5; index += 1) {
      await proposeCuratedScene({
        root: where,
        venture: "mma-files",
        candidate: candidate(`pexels:${index}`),
        verdict: verdict({ candidateId: `pexels:${index}` })
      });
    }

    expect((await file(where)).match(/^- \[ \] /gmu)).toHaveLength(MAX_OPEN_PROPOSALS);
  });

  it("makes room again as the owner ticks them off", async () => {
    const where = await root();
    for (let index = 0; index < MAX_OPEN_PROPOSALS; index += 1) {
      await proposeCuratedScene({
        root: where,
        venture: "mma-files",
        candidate: candidate(`pexels:${index}`),
        verdict: verdict({ candidateId: `pexels:${index}` })
      });
    }
    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:late"),
      verdict: verdict({ candidateId: "pexels:late" })
    })).toBe(false);

    // The owner reviews three. The cap counts what is still open, so three more may be offered.
    const reviewed = (await file(where)).replace(/^- \[ \] /gmu, (match, offset, whole: string) =>
      (whole.slice(0, offset).match(/^- \[x\] /gmu) ?? []).length < 3 ? "- [x] " : match);
    const { atomicWriteText } = await import("../src/state.js");
    await atomicWriteText(where, sceneProposalsPath("mma-files"), reviewed);

    expect(await proposeCuratedScene({
      root: where,
      venture: "mma-files",
      candidate: candidate("pexels:late"),
      verdict: verdict({ candidateId: "pexels:late" })
    })).toBe(true);
  });

  it("keeps the two magazines' queues apart", async () => {
    const where = await root();
    await proposeCuratedScene({
      root: where,
      venture: "caught-up",
      candidate: candidate("pexels:1"),
      verdict: verdict()
    });

    expect(await file(where, "caught-up")).toContain("# Curated scene proposals — DNESKAi");
    await expect(file(where, "mma-files")).rejects.toThrow();
  });
});
