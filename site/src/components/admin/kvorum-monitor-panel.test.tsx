import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAdminKvorum, type AdminKvorumSnapshot } from "@/lib/admin-kvorum";
import { KvorumMonitorPanel, weeklyEntityHeat } from "./kvorum-monitor-panel";

let root = "";

async function fixtureState(): Promise<AdminKvorumSnapshot> {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-monitor-panel-"));
  const files = {
    "state/ventures/kvorum/monitor/2026-08-12.json": "../contracts/fixtures/kvorum-monitor.valid.json",
    "state/kvorum/source-quota/apify.json": "../contracts/fixtures/kvorum-apify-quota.valid.json",
    "config/kvorum-entities.json": "../config/kvorum-entities.json"
  };
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.resolve(process.cwd(), source), "utf8"), "utf8");
  }
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  return readAdminKvorum();
}

afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("the read-only Kvórum monitor panel", () => {
  it("renders the fixture digest, source truth, quota, entity heat and purge record", async () => {
    const snapshot = await fixtureState();
    const html = renderToStaticMarkup(<KvorumMonitorPanel snapshot={snapshot} />);

    expect(html).toContain("Source health · recorded response");
    expect(html).toContain("stit-demokracie-facebook");
    expect(html).toContain("iROZHLAS");
    expect(html).toContain("$0.151 / $2.000 venture share");
    expect(html).toContain("Financování médií veřejné služby");
    expect(html).toContain("Sněmovna projedná financování médií veřejné služby.");
    expect(html).toContain("Andrej Babiš");
    expect(html).toContain("30-day window");
    expect(html).toContain("2 before · 2 after · 0 purged");
    expect(html).toContain("this panel cannot fetch, spend or change it");
    expect(html.match(/data-horizontal-scroll/g)).toHaveLength(2);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });

  it("counts entity appearances only inside the latest seven recorded days", async () => {
    const snapshot = await fixtureState();
    const latest = snapshot.monitor[0]!;
    const recent = structuredClone(latest);
    recent.date = "2026-08-08";
    const old = structuredClone(latest);
    old.date = "2026-08-01";
    expect(weeklyEntityHeat([latest, recent, old], snapshot.entityLabels)).toEqual([
      { id: "andrej-babis", label: "Andrej Babiš", mentions: 2 },
      { id: "public-media-funding", label: "Financování médií veřejné služby", mentions: 2 }
    ]);
  });

  it("keeps missing, unreadable and empty monitor stores distinct", () => {
    const base: Omit<AdminKvorumSnapshot, "monitorState"> = {
      recommendationsState: "missing",
      recommendations: [],
      claimsState: "missing",
      claims: [],
      claimsUnreadable: 0,
      resultsState: "missing",
      results: [],
      resultsUnreadable: 0,
      monitor: [],
      quotaState: "missing",
      quota: null,
      entityLabels: {},
      unreadable: 0
    };
    expect(renderToStaticMarkup(<KvorumMonitorPanel snapshot={{ ...base, monitorState: "missing" }} />))
      .toContain("has not written its first receipt");
    expect(renderToStaticMarkup(<KvorumMonitorPanel snapshot={{ ...base, monitorState: "unreadable", unreadable: 1 }} />))
      .toContain("none can be read safely");
    expect(renderToStaticMarkup(<KvorumMonitorPanel snapshot={{ ...base, monitorState: "present" }} />))
      .toContain("store exists and contains no receipt");
  });
});
