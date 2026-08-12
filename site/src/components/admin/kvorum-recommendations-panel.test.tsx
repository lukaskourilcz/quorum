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

async function fixtureRecommendation(): Promise<void> {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-panel-"));
  const relative = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    await readFile(path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"), "utf8"),
    "utf8"
  );
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

  it("states whether an empty queue is missing, unreadable or present", () => {
    const base: Omit<AdminKvorumSnapshot, "recommendationsState"> = {
      recommendations: [],
      monitorState: "missing",
      monitor: [],
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
