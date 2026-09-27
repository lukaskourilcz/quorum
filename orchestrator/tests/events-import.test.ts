import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BoardlessEventsSchema } from "../src/contracts/boardless-events.js";
import { RECEIPTS_RELATIVE_PATH, runEventsImport, STORE_RELATIVE_PATH } from "../src/events/import-cli.js";
import { eventsOffered, mergeImportedEvents, normalizeImportedEvent, parseStore, type StoreFile } from "../src/events/import.js";

const TODAY = "2026-09-28";

const future = {
  id: "ai-v-marketingu-2026",
  scope: "cz",
  title: "AI v marketingu 5.0",
  starts: "2026-11-10",
  online: false,
  url: "https://example.org/ai-marketing",
  city: "Praha"
};

function store(events: StoreFile["events"] = []): StoreFile {
  return { schemaVersion: "boardless-events/1", updated: "2026-09-01", events };
}

describe("normalizeImportedEvent", () => {
  it("reads the store shape and the usual aliases", () => {
    const result = normalizeImportedEvent({ name: "Agentic AI Security", start: "2026-11-29T09:00:00+01:00", link: "https://example.org/sec", location: "Brno", scope: "cz" });
    expect(result).toMatchObject({ event: { id: "agentic-ai-security-2026", starts: "2026-11-29", url: "https://example.org/sec", venue: "Brno", online: false } });
  });

  it("reads free and an online city from a researched list", () => {
    const result = normalizeImportedEvent({ title: "Webinář", date: "2026-11-12", city: "online", online: false, free: true, url: "https://lu.ma/x", scope: "cz" });
    expect(result).toMatchObject({ event: { online: true, price: "Zdarma" } });
    expect("event" in result ? result.event.city : "missing event").toBeUndefined();
  });

  it("drops what the reader would refuse, by reason", () => {
    expect(normalizeImportedEvent({ ...future, url: "http://example.org" })).toMatchObject({ reason: "no https URL" });
    expect(normalizeImportedEvent({ ...future, ends: "2026-11-01" })).toMatchObject({ reason: "ends before it starts" });
    expect(normalizeImportedEvent({ ...future, scope: undefined })).toMatchObject({ reason: expect.stringContaining("no scope") });
    expect(normalizeImportedEvent({ ...future, scope: undefined }, { defaultScope: "cz" })).toHaveProperty("event");
    expect(normalizeImportedEvent({ ...future, id: "Not A Slug" })).toMatchObject({ reason: expect.stringContaining("slug") });
    expect(normalizeImportedEvent({ ...future, starts: "listopad" })).toMatchObject({ reason: expect.stringContaining("start date") });
  });

  it("leaves out an optional field the reader would drop, and notes it", () => {
    const result = normalizeImportedEvent({ ...future, description: "x".repeat(281) });
    expect(result).toMatchObject({ notes: ["description left out: longer than 280 characters"] });
    expect("event" in result ? result.event.description : "missing event").toBeUndefined();
  });
});

describe("mergeImportedEvents", () => {
  it("adds, updates, keeps past events and accounts for every offered entry", () => {
    const past = { id: "probehla-2026", scope: "cz" as const, title: "Proběhlá", starts: "2026-09-01", online: false, url: "https://example.org/p", added: "2026-08-01" };
    const existing = { ...future, scope: "cz" as const, title: "Old title", added: "2026-09-10" };
    const { file, outcome } = mergeImportedEvents({
      store: store([past, existing]),
      offered: [
        future,
        { ...past, title: "Rewritten history" },
        { ...future, id: "new-one-2026", title: "Nová akce", starts: "2026-11-05" },
        { title: "No link", starts: "2026-11-06", scope: "cz" },
        { ...future, title: "Duplicate" },
        { ...future, id: "already-over-2026", starts: "2026-09-02" }
      ],
      today: TODAY
    });
    expect(outcome.updated).toEqual([future.id]);
    expect(outcome.added).toEqual(["new-one-2026"]);
    expect(outcome.skipped.map((entry) => entry.id)).toEqual(["probehla-2026", "already-over-2026"]);
    expect(outcome.dropped.map((entry) => entry.index)).toEqual([3, 4]);
    expect(file.events.find((event) => event.id === "probehla-2026")?.title).toBe("Proběhlá");
    const updated = file.events.find((event) => event.id === future.id)!;
    expect(updated).toMatchObject({ title: "AI v marketingu 5.0", added: "2026-09-10" });
    expect(file.events.find((event) => event.id === "new-one-2026")?.added).toBe(TODAY);
    expect(file.events.map((event) => event.starts)).toEqual(["2026-09-01", "2026-11-05", "2026-11-10"]);
    expect(file.updated).toBe(TODAY);
    expect(BoardlessEventsSchema.safeParse(file).success).toBe(true);
  });

  it("changes nothing when the store already holds the file", () => {
    const first = mergeImportedEvents({ store: store(), offered: [future], today: TODAY });
    const second = mergeImportedEvents({ store: first.file, offered: [future], today: "2026-09-30" });
    expect(second.outcome).toMatchObject({ added: [], updated: [], unchanged: [future.id] });
    expect(second.file).toEqual(first.file);
  });
});

describe("eventsOffered and parseStore", () => {
  it("takes an envelope, an items object or a bare array", () => {
    expect(eventsOffered({ schemaVersion: "boardless-events/1", updated: TODAY, events: [future] })).toHaveLength(1);
    expect(eventsOffered({ items: [future, future] })).toHaveLength(2);
    expect(eventsOffered([future])).toHaveLength(1);
    expect(eventsOffered({ nothing: true })).toBeNull();
  });

  it("drops null optionals the admin never writes", () => {
    const parsed = parseStore({ schemaVersion: "boardless-events/1", updated: TODAY, events: [{ ...future, ends: null, price: null }] }, TODAY);
    expect(parsed.events[0]).not.toHaveProperty("ends");
    expect(parsed.events[0]).not.toHaveProperty("price");
  });
});

describe("runEventsImport", () => {
  it("writes the store and one receipt, and nothing on a repeat", () => {
    const root = mkdtempSync(path.join(tmpdir(), "events-import-"));
    const input = path.join(root, "curated.json");
    writeFileSync(input, JSON.stringify([future, { title: "Bez data", url: "https://example.org/x", scope: "cz" }]));
    const first = runEventsImport({ file: input, date: TODAY, root });
    expect(first.changed).toBe(true);
    expect(first.receiptPath).toMatch(/^ventures\/caught-up\/events\/receipts\/2026-09-28-import-[0-9a-f]{12}\.json$/u);
    const written = JSON.parse(readFileSync(path.join(root, STORE_RELATIVE_PATH), "utf8")) as unknown;
    expect(BoardlessEventsSchema.parse(written).events).toHaveLength(1);
    const receipt = JSON.parse(readFileSync(path.join(root, first.receiptPath!), "utf8")) as { dropped: unknown[]; added: string[] };
    expect(receipt.added).toEqual([future.id]);
    expect(receipt.dropped).toHaveLength(1);

    const again = runEventsImport({ file: input, date: TODAY, root });
    expect(again).toMatchObject({ changed: false, receiptPath: null });
    expect(readdirSync(path.join(root, RECEIPTS_RELATIVE_PATH))).toHaveLength(1);
  });

  it("writes nothing in a dry run", () => {
    const root = mkdtempSync(path.join(tmpdir(), "events-import-dry-"));
    const input = path.join(root, "curated.json");
    writeFileSync(input, JSON.stringify({ events: [future] }));
    expect(runEventsImport({ file: input, date: TODAY, root, dry: true })).toMatchObject({ changed: true, receiptPath: null });
    expect(() => readFileSync(path.join(root, STORE_RELATIVE_PATH))).toThrow();
  });
});
