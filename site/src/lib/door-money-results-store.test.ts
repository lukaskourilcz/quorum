import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyDoorMoneyRecommendationDecision } from "./door-money-recommendations-store";
import { saveDoorMoneyOwnerResult } from "./door-money-results-store";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function recommendationRoot(posted: boolean, resultsApproved = true): Promise<{ root: string; id: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "door-money-results-store-"));
  roots.push(root);
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"), "utf8"
  )) as { id: string };
  const directory = path.join(root, "state/ventures/door-money/recommendations");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(root, "state/INBOX.md"),
    `- [${resultsApproved ? "x" : " "}] HUMAN_APPROVAL DM-RESULTS-004 — synthetic test state.\n`
  );
  await writeFile(path.join(directory, `${recommendation.id}.json`), `${JSON.stringify(recommendation, null, 2)}\n`);
  if (posted) {
    await applyDoorMoneyRecommendationDecision({
      id: recommendation.id, decision: { action: "approve" }, now: new Date("2026-08-12T11:00:00.000Z")
    }, root);
    await applyDoorMoneyRecommendationDecision({
      id: recommendation.id,
      decision: { action: "posted", postedUrl: "https://example.test/posts/synthetic-radio" },
      now: new Date("2026-08-12T12:00:00.000Z")
    }, root);
  }
  return { root, id: recommendation.id };
}

describe("Door Money owner-results store", () => {
  it("refuses owner results until DM-RESULTS-004 is signed", async () => {
    const { root, id } = await recommendationRoot(true, false);
    await expect(saveDoorMoneyOwnerResult({
      recommendationId: id,
      platform: "instagram",
      metrics: { views: 1 },
      outcome: "Synthetic result that must remain disabled."
    }, { root })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("DM-RESULTS-004 is pending")
    });
  });

  it("derives the recorded post URL and never contacts a platform", async () => {
    const { root, id } = await recommendationRoot(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const saved = await saveDoorMoneyOwnerResult({
      recommendationId: id,
      platform: "instagram",
      metrics: { views: 17, comments: 2 },
      outcome: "The synthetic owner typed two comments from the visible post screen."
    }, { root, now: new Date("2026-08-13T10:00:00.000Z") });

    expect(saved).toMatchObject({
      changed: true,
      result: {
        ventureId: "door-money",
        recommendationId: id,
        postUrl: "https://example.test/posts/synthetic-radio",
        source: "owner-entry",
        capturedAt: "2026-08-13T10:00:00.000Z"
      }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects entries before posting and platforms outside the recommendation", async () => {
    const draft = await recommendationRoot(false);
    await expect(saveDoorMoneyOwnerResult({
      recommendationId: draft.id, platform: "instagram", metrics: { views: 1 }, outcome: "Synthetic result."
    }, { root: draft.root })).rejects.toMatchObject({ code: "CONFLICT" });

    const posted = await recommendationRoot(true);
    await expect(saveDoorMoneyOwnerResult({
      recommendationId: posted.id, platform: "youtube", metrics: { views: 1 }, outcome: "Synthetic result."
    }, { root: posted.root })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
