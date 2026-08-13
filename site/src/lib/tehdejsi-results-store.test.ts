import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { saveTehdejsiOwnerResult } from "./tehdejsi-results-store";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function state(): Promise<{ root: string; recommendationId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-results-"));
  roots.push(root);
  const fixture = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  const recommendation = {
    ...fixture,
    status: "posted",
    owner: {
      postedUrls: {
        cs: "https://www.instagram.com/p/synthetic-cs-result/",
        ua: "https://www.instagram.com/p/synthetic-ua-result/"
      },
      rejectionReason: null
    },
    updatedAt: "2026-08-20T12:00:00.000Z"
  };
  const directory = path.join(root, "state/ventures/tehdejsi-svet/drafts");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "synthetic-feature.json"), `${JSON.stringify(recommendation, null, 2)}\n`);
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state/INBOX.md"), "- [x] HUMAN_APPROVAL TS-RESULTS-005 — owner approved manual entry\n");
  return { root, recommendationId: String(fixture.id) };
}

const metrics = {
  sends: 17,
  saves: 23,
  views: 900,
  likes: null,
  comments: 4,
  shares: null,
  follows: null,
  linkTaps: null
};

describe("Tehdejsi svet owner-result store", () => {
  it("writes a canonical manual result idempotently without contacting a platform", async () => {
    const { root, recommendationId } = await state();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = {
      recommendationId,
      locale: "cs",
      platform: "instagram",
      capturedAt: "2026-08-20T12:00:00.000Z",
      recordedAt: "2026-08-20T12:05:00.000Z",
      metrics,
      note: "Synthetic owner note."
    };
    const first = await saveTehdejsiOwnerResult(input, { root });
    const second = await saveTehdejsiOwnerResult(input, { root });

    expect(first).toMatchObject({ changed: true, result: { enteredBy: "owner", platform: "instagram", metrics: { sends: 17, saves: 23 } } });
    expect(second).toMatchObject({ changed: false, result: { resultId: first.result.resultId } });
    expect(fetchSpy).not.toHaveBeenCalled();
    const stored = JSON.parse(await readFile(path.join(
      root,
      `state/ventures/tehdejsi-svet/results/${first.result.resultId}.json`
    ), "utf8"));
    expect(stored).toEqual(first.result);
  });

  it("requires approval, a recorded URL and its matching platform host", async () => {
    const { root, recommendationId } = await state();
    const input = {
      recommendationId,
      locale: "cs" as const,
      platform: "facebook" as const,
      capturedAt: "2026-08-20T12:00:00.000Z",
      recordedAt: "2026-08-20T12:05:00.000Z",
      metrics,
      note: null
    };
    await expect(saveTehdejsiOwnerResult(input, { root })).rejects.toThrow(/not on facebook/u);
    await writeFile(path.join(root, "state/INBOX.md"), "- [ ] HUMAN_APPROVAL TS-RESULTS-005 — pending\n");
    await expect(saveTehdejsiOwnerResult({ ...input, platform: "instagram" }, { root })).rejects.toThrow(/pending/u);
  });
});
