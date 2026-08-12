import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import {
  KvorumRecommendationsPanel,
  kvorumRecommendationActionRef
} from "./kvorum-recommendations-panel";
import { readAdminKvorum, type AdminKvorumSnapshot } from "@/lib/admin-kvorum";

let root = "";

async function fixtureRecommendation(options: { posted?: boolean; result?: boolean } = {}): Promise<void> {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-panel-"));
  const relative = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  if (options.posted) {
    recommendation.status = "posted";
    recommendation.updatedAt = "2026-08-12T22:00:00.000Z";
    recommendation.designLab = {
      status: "queued",
      requestedAt: "2026-08-12T21:30:00.000Z",
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    };
    recommendation.owner = {
      ...(recommendation.owner as Record<string, unknown>),
      approvedAt: "2026-08-12T21:30:00.000Z",
      postedAt: "2026-08-12T22:00:00.000Z",
      postedUrl: "https://example.com/kvorum/public-media",
      resultRefs: options.result
        ? ["state/ventures/kvorum/results/2026-08-12-1a2b3c4d5e6f.json"]
        : []
    };
  }
  await writeFile(
    target,
    `${JSON.stringify(recommendation, null, 2)}\n`,
    "utf8"
  );
  if (options.result) {
    const resultTarget = path.join(
      root,
      "state/ventures/kvorum/results/2026-08-12-1a2b3c4d5e6f.json"
    );
    await mkdir(path.dirname(resultTarget), { recursive: true });
    await writeFile(
      resultTarget,
      await readFile(path.resolve(process.cwd(), "../contracts/fixtures/owner-result-entry.valid.json"), "utf8"),
      "utf8"
    );
  }
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("the Kvórum recommendation review card", () => {
  it("renders the full fixture context and every owner-only draft action", async () => {
    await fixtureRecommendation();
    const snapshot = await readAdminKvorum();
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <KvorumRecommendationsPanel snapshot={snapshot} />
      </AdminWriteProvider>
    );

    expect(html).toContain("Poplatky se vracejí do Sněmovny");
    expect(html).toContain("Drafted copy by format");
    expect(html).toContain("fact-multi");
    expect(html).toContain("https://www.irozhlas.cz/zpravy-domov/televizni-poplatky");
    expect(html).toContain("Štít · internal context only");
    expect(html).toContain("TRIBUN · why this is worth it");
    expect(html).toContain("Approve as drafted");
    expect(html).toContain("Edit then approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Your rating");
    expect(html.match(/data-horizontal-scroll/g)).toHaveLength(2);
    expect(html).not.toContain("state/ventures/kvorum");
    expect(kvorumRecommendationActionRef(snapshot.recommendations[0]!))
      .toBe("state/ventures/kvorum/recommendations/2026-08-12-public-media.json");
  });

  it("makes every write control inert on a read-only deployment", async () => {
    await fixtureRecommendation();
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <KvorumRecommendationsPanel snapshot={await readAdminKvorum()} />
      </AdminWriteProvider>
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Approve as drafted");
  });

  it("puts owner-entered outcome beside posted intent and exposes only a manual form", async () => {
    await fixtureRecommendation({ posted: true, result: true });
    const snapshot = await readAdminKvorum();
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <KvorumRecommendationsPanel snapshot={snapshot} />
      </AdminWriteProvider>
    );
    expect(html).toContain("Outcome beside intent");
    expect(html).toContain("Owner-entered results");
    expect(html).toContain("Saves");
    expect(html).toContain("43");
    expect(html).toContain("Record owner result");
    expect(html).toContain("No automated collection or fetch runs here.");
    expect(html).not.toContain("recommendationRef");
    expect(html).not.toContain("state/ventures/kvorum/results");
  });

  it("states whether an empty queue is missing, unreadable or present", () => {
    const base: Omit<AdminKvorumSnapshot, "recommendationsState"> = {
      recommendations: [],
      monitorState: "missing",
      monitor: [],
      claimsState: "missing",
      claims: [],
      claimsUnreadable: 0,
      resultsState: "missing",
      results: [],
      resultsUnreadable: 0,
      quotaState: "missing",
      quota: null,
      entityLabels: {},
      unreadable: 0
    };
    const missing = renderToStaticMarkup(<KvorumRecommendationsPanel snapshot={{ ...base, recommendationsState: "missing" }} />);
    const unreadable = renderToStaticMarkup(<KvorumRecommendationsPanel snapshot={{ ...base, recommendationsState: "unreadable", unreadable: 1 }} />);
    const present = renderToStaticMarkup(<KvorumRecommendationsPanel snapshot={{ ...base, recommendationsState: "present" }} />);
    expect(missing).toContain("has not written its first recommendation queue");
    expect(unreadable).toContain("none can be read safely");
    expect(present).toContain("store exists and its queue is empty");
  });
});
