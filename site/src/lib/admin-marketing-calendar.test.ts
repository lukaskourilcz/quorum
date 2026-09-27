import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminQueueItemView } from "@/lib/admin-queue/types";
import { mergeCalendarEntries, ownDashboardUrl, readAdminMarketingCalendar } from "./admin-marketing-calendar";
import { parseMarketingCalendar, type CalendarEntry } from "./marketing-calendar-model";

const now = new Date("2026-11-05T08:00:00.000Z");
let root = "";

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "ds-001", date: "2026-11-05", time: "09:00", platform: "threads", kind: "thread", pillar: "p1", title: "QOTD",
    hook: null, hookType: null, body: "", cta: null, assets: [], effortMin: 10, status: "planned", blockedBy: null,
    producer: "owner", tipRefs: [], measure: null, links: [], note: null, ...over
  };
}

function item(over: Partial<AdminQueueItemView>): AdminQueueItemView {
  return {
    id: "q-1", ventureKey: "devshark", platform: "instagram", status: "draft", contentKind: "carousel",
    publishWindow: { notBefore: "2026-11-05T16:30:00.000Z", notAfter: "2026-11-05T20:00:00.000Z" },
    designLabHref: "/admin?venture=design-lab&tab=studio&brand=devshark", permalink: null, ...over
  } as AdminQueueItemView;
}

const period = { start: "2026-11-05", end: "2026-11-06" };

describe("mergeCalendarEntries", () => {
  it("takes queued and published from the Queue, keyed by date, venture and platform", () => {
    const merged = mergeCalendarEntries({
      entries: [
        entry({ id: "ds-001", platform: "instagram", kind: "carousel", producer: "marketingShark", time: "17:30" }),
        entry({ id: "ds-002", platform: "threads" })
      ],
      queueItems: [item({ status: "published", permalink: "https://instagram.com/p/x" }), item({ id: "q-2", ventureKey: "caught-up", platform: "threads", contentKind: "text", status: "queued" })],
      queueKey: "devshark",
      packageDates: new Set(["2026-11-05"]),
      rotation: null,
      period
    });
    expect(merged.matched).toBe(1);
    expect(merged.entries[0]).toMatchObject({ effectiveStatus: "published", statusSource: "queue", packageExists: true, queue: { itemId: "q-1", permalink: "https://instagram.com/p/x" } });
    expect(merged.entries[1]).toMatchObject({ effectiveStatus: "planned", statusSource: "owner", queue: null, packageExists: null });
  });

  it("gives one Queue item to one entry, drafted-by-agent before owner, and counts what fits nowhere", () => {
    const merged = mergeCalendarEntries({
      entries: [
        entry({ id: "ds-001", time: "09:00", producer: "owner" }),
        entry({ id: "ds-002", time: "17:30", producer: "marketingShark" })
      ],
      queueItems: [
        item({ id: "q-1", platform: "threads", contentKind: "text", status: "approved" }),
        item({ id: "q-2", platform: "threads", contentKind: "text", status: "approved" }),
        item({ id: "q-3", platform: "threads", contentKind: "text", status: "approved" })
      ],
      queueKey: "devshark",
      packageDates: null,
      rotation: null,
      period
    });
    expect(merged.entries.map((view) => [view.id, view.queue?.itemId, view.effectiveStatus])).toEqual([
      ["ds-001", "q-2", "queued"],
      ["ds-002", "q-1", "queued"]
    ]);
    expect(merged.unmatched).toBe(1);
  });

  it("lets an owner's skip stand over a Queue draft", () => {
    const merged = mergeCalendarEntries({
      entries: [entry({ platform: "instagram", kind: "carousel", status: "skipped" })],
      queueItems: [item({ status: "draft" })],
      queueKey: "devshark", packageDates: null, rotation: null, period
    });
    expect(merged.entries[0]).toMatchObject({ effectiveStatus: "skipped", statusSource: "owner", queue: { itemId: "q-1" } });
  });

  it("fills a day the plan leaves empty with the rotation's planned default", () => {
    const merged = mergeCalendarEntries({
      entries: [entry({})],
      queueItems: [],
      queueKey: "devshark",
      packageDates: new Set(),
      rotation: { friday: "this-week" },
      period
    });
    expect(merged.entries.at(-1)).toMatchObject({ id: "rotation-2026-11-06", synthetic: true, producer: "marketingShark", packageExists: false });
    expect(merged.entries.at(-1)!.title).toContain("this week");
  });
});

describe("readAdminMarketingCalendar", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "boardless-calendar-read-"));
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const plan = await readFile(path.resolve(process.cwd(), "../contracts/fixtures/marketing-calendar.valid.json"), "utf8");
    await mkdir(path.join(root, "state", "marketing-calendar"), { recursive: true });
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "state", "marketing-calendar", "marketingshark.json"), plan);
    await writeFile(path.join(root, "config", "marketingshark.json"), JSON.stringify({ brands: [{ id: "devshark", rotation: { thursday: "quiz", friday: "this-week" } }] }));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it("reads the plan with the rotation, no packages and an unavailable Queue named as such", async () => {
    const snapshot = await readAdminMarketingCalendar("marketingshark", { root, now, queueItems: null });
    expect(snapshot.state).toBe("ready");
    if (snapshot.state !== "ready") return;
    expect(snapshot.today).toBe("2026-11-05");
    expect(snapshot.clock).toBe("09:00");
    expect(snapshot.rotation).toEqual({ thursday: "quiz", friday: "this-week" });
    expect(snapshot.queue.state).toBe("unavailable");
    expect(snapshot.document.entries).toEqual([]);
    expect(snapshot.entries.map((view) => view.id)).toEqual(["ds-001", "ds-002"]);
    expect(snapshot.entries[1]!.packageExists).toBe(false);
  });

  it("names a missing and a malformed plan instead of rendering nothing", async () => {
    const missing = await readAdminMarketingCalendar("caught-up", { root, now, queueItems: [] });
    expect(missing).toMatchObject({ state: "missing" });
    await writeFile(path.join(root, "state", "marketing-calendar", "caught-up.json"), JSON.stringify({ name: "DNESKAi", entries: [] }));
    const malformed = await readAdminMarketingCalendar("caught-up", { root, now, queueItems: [] });
    expect(malformed).toMatchObject({ state: "malformed", reason: "The plan has no readable entry." });
  });

  it("parses the seeds the reader serves", async () => {
    const seed = JSON.parse(await readFile(path.resolve(process.cwd(), "../state/marketing-calendar/caught-up.json"), "utf8"));
    expect(parseMarketingCalendar(seed).ok).toBe(true);
  });
});

describe("ownDashboardUrl", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses the configured https origin and falls back to the deployed dashboard", () => {
    vi.stubEnv("OWN_DASHBOARD_URL", "https://dash.example/");
    expect(ownDashboardUrl()).toBe("https://dash.example");
    vi.stubEnv("OWN_DASHBOARD_URL", "javascript:alert(1)");
    expect(ownDashboardUrl()).toBe("https://own-dashboard-tau.vercel.app");
  });
});
