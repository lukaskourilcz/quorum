import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configRoot } from "../src/paths.js";
import { GoViralTrendsSchema, type GoViralTrends } from "../src/sources/goviral-trends.js";
import { atomicWriteJson } from "../src/state.js";
import { loadVentureCapabilityMap, validateVentureCapabilityPayload } from "../src/ventures/capabilities.js";
import {
  categoryForTopic,
  readTrendHook,
  trendPacketFrom,
  trendVelocity
} from "../src/ventures/marketingshark/intelligence.js";

// quorum#576 (B9): the Friday note's trend hook crosses `goviral -> marketingshark` as a
// goviral-intelligence-packet/1 — a topic, a velocity and evidence refs, never copy.

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function snapshot(date: string, tags: Array<[string, string, number, number | null]>): GoViralTrends {
  return GoViralTrendsSchema.parse({
    schemaVersion: "goviral-trends/1",
    date,
    generatedAt: `${date}T09:00:00.000Z`,
    sourceResults: [],
    freeSignals: [],
    items: [{
      platform: "instagram", kind: "post", topicSet: "devshark", text: "A stranger's caption that must never reach a post.",
      likes: 10, comments: 1, reshares: 0, postedAt: `${date}T08:00:00.000Z`, url: "https://www.instagram.com/p/x", hashtags: ["#typescript"],
      audioTitle: null, audioArtist: null, exploreSection: null
    }],
    signals: {
      topHashtags: tags.map(([hashtag, topicSet, engagementPerHour, weekOverWeekDelta]) =>
        ({ hashtag, topicSet, posts: 3, engagementPerHour, weekOverWeekDelta })),
      topFormats: [],
      topAudio: [],
      exploreSections: [],
      perTopicSet: []
    },
    forMagazines: { ai: [], mma: [] }
  });
}

const WEEK: Array<[string, string, number, number | null]> = [
  ["#ai", "dneskai", 40, 12],
  ["#react", "devshark", 30, -4],
  ["#typescript", "devshark", 20, 5],
  ["#css", "devshark", 10, null]
];

/** A config root whose capability map lacks the named edges, for the fail-closed cases. */
async function configWithout(drop: (edge: Record<string, unknown>) => boolean): Promise<string> {
  const root = await tempDir("ms-intel-config-");
  await cp(configRoot, root, { recursive: true });
  const file = path.join(root, "venture-capabilities.json");
  const map = JSON.parse(await readFile(file, "utf8")) as { edges: Array<Record<string, unknown>> };
  map.edges = map.edges.filter((edge) => !drop(edge));
  await writeFile(file, JSON.stringify(map));
  return root;
}

describe("marketingShark's GoVIRAL trend hook", () => {
  it("takes the brand's strongest tag that is rising or new, and nothing from another topic set", () => {
    const packet = trendPacketFrom(snapshot("2026-09-21", WEEK), "devshark");
    expect(packet).toEqual({
      schemaVersion: "goviral-intelligence-packet/1",
      topic: "#typescript",
      measuredAt: "2026-09-21T09:00:00.000Z",
      // The day after the snapshot leaves the trends window, the window the hashtag signals obey.
      expiresAt: "2026-10-06T00:00:00.000Z",
      velocity: 33,
      evidenceRefs: ["state/goviral/trends/2026-09-21.json"]
    });
    expect(validateVentureCapabilityPayload("goviral-intelligence-packet/1", packet)).toMatchObject({ valid: true });
    // No caption, handle, URL or item text rides along: the schema is strict and the packet is its shape.
    expect(JSON.stringify(packet)).not.toMatch(/stranger|instagram\.com/u);
    // Every devShark tag cooling means no hook at all.
    expect(trendPacketFrom(snapshot("2026-09-21", [["#react", "devshark", 30, -4]]), "devshark")).toBeNull();
  });

  it("states velocity as a bounded week-over-week percentage, and null when there is no last week", () => {
    expect(trendVelocity(20, 5)).toBe(33);
    expect(trendVelocity(10, null)).toBeNull();
    expect(trendVelocity(50, 49)).toBe(100);
    expect(trendVelocity(5, 5)).toBe(100);
    expect(trendVelocity(0, -10)).toBe(-100);
  });

  it("maps a tag to one of the bank's own categories, or to none", () => {
    const categories = ["javascript", "typescript", "react", "system-design", "databases"];
    expect(categoryForTopic("#TypeScript", categories)).toBe("typescript");
    expect(categoryForTopic("#ts", categories)).toBe("typescript");
    expect(categoryForTopic("#systemdesign", categories)).toBe("system-design");
    expect(categoryForTopic("#sql", categories)).toBe("databases");
    expect(categoryForTopic("#100daysofcode", categories)).toBeNull();
    // A category the bank does not carry is never produced, whatever the alias says.
    expect(categoryForTopic("#node", categories)).toBeNull();
  });

  it("reads through the registered packet edge and records where the hook came from", async () => {
    const state = await tempDir("ms-intel-state-");
    await expect(readTrendHook({ stateRoot: state, configRoot, brandId: "devshark", date: "2026-09-25" }))
      .resolves.toMatchObject({ packet: null, reason: expect.stringContaining("no readable trend snapshot") });
    await atomicWriteJson(state, "goviral/trends/2026-09-21.json", snapshot("2026-09-21", WEEK));
    const read = await readTrendHook({ stateRoot: state, configRoot, brandId: "devshark", date: "2026-09-25" });
    expect(read.packet?.topic).toBe("#typescript");
    expect(read.reason).toBe("GoVIRAL's 2026-09-21 snapshot, expiring 2026-10-06.");
    // A snapshot past the window reads as no snapshot; one that is current but cooling offers none.
    await expect(readTrendHook({ stateRoot: state, configRoot, brandId: "devshark", date: "2026-10-06" }))
      .resolves.toMatchObject({ packet: null });
  });

  it("fails closed when either edge is missing or the map cannot be read", async () => {
    const state = await tempDir("ms-intel-state-");
    await atomicWriteJson(state, "goviral/trends/2026-09-21.json", snapshot("2026-09-21", WEEK));
    const packetEdge = (edge: Record<string, unknown>) => edge.source === "goviral" && edge.target === "marketingshark"
      && edge.dataSchemaVersion === "goviral-intelligence-packet/1";
    const trendsEdge = (edge: Record<string, unknown>) => edge.source === "goviral" && edge.target === "marketingshark"
      && edge.dataSchemaVersion === "goviral-trends/1";
    const withoutPacket = await readTrendHook({ stateRoot: state, configRoot: await configWithout(packetEdge), brandId: "devshark", date: "2026-09-25" });
    expect(withoutPacket).toEqual({ packet: null, reason: "The goviral -> marketingshark intelligence packet edge is denied, so no trend hook was taken." });
    const withoutTrends = await readTrendHook({ stateRoot: state, configRoot: await configWithout(trendsEdge), brandId: "devshark", date: "2026-09-25" });
    expect(withoutTrends.packet).toBeNull();
    const absent = await tempDir("ms-intel-absent-");
    await expect(readTrendHook({ stateRoot: state, configRoot: absent, brandId: "devshark", date: "2026-09-25" }))
      .resolves.toEqual({ packet: null, reason: "The capability map could not be read, so no trend hook was taken." });
  });

  it("is registered exactly, and nothing broader rides on it", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const edges = map.edges.filter((edge) => edge.source === "goviral" && edge.target === "marketingshark");
    expect(edges.map((edge) => [edge.capability, edge.dataSchemaVersion, edge.decision, edge.runtimeEnforcementPoint])).toEqual([
      ["intelligence-read", "goviral-trends/1", "allowed", "orchestrator/src/ventures/marketingshark/trends.ts"],
      ["intelligence-read", "goviral-intelligence-packet/1", "allowed", "orchestrator/src/ventures/marketingshark/intelligence.ts"]
    ]);
    expect(edges[1]!.governingReference).toBe("state/decisions/2026-09-26-devshark-social-queue.md");
    expect(map.supersessionHistory.at(-1)).toMatchObject({ mapVersion: "1.5.0", decisionReference: "state/decisions/2026-09-26-devshark-social-queue.md" });
  });
});
