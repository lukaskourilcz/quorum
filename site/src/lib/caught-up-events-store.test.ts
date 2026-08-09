import { describe, expect, it } from "vitest";
import {
  applyEvent,
  emptyEventsFile,
  EventsPersistenceError,
  parseEvent,
  parseEventsFile,
  type EventsFile,
  type MagazineEvent,
} from "./caught-up-events-store";

const TODAY = "2026-08-09";

const valid = {
  id: "ml-prague-2026",
  scope: "cz",
  title: "Machine Learning Prague 2026",
  starts: "2026-10-14",
  online: false,
  url: "https://mlprague.com",
};

const event = (over: Partial<MagazineEvent> = {}): MagazineEvent => ({
  ...(parseEvent(valid) as MagazineEvent),
  ...over,
});

function file(events: MagazineEvent[]): EventsFile {
  return { schemaVersion: "boardless-events/1", updated: TODAY, events };
}

describe("parsing one event", () => {
  it("accepts a complete event", () => {
    expect(parseEvent(valid)?.title).toBe("Machine Learning Prague 2026");
  });

  it("refuses an id that is not a slug", () => {
    expect(parseEvent({ ...valid, id: "Bad Id" })).toBeNull();
    expect(parseEvent({ ...valid, id: "" })).toBeNull();
  });

  it("refuses an unknown scope", () => {
    expect(parseEvent({ ...valid, scope: "moon" })).toBeNull();
  });

  it("refuses anything but an https link", () => {
    expect(parseEvent({ ...valid, url: "http://mlprague.com" })).toBeNull();
    expect(parseEvent({ ...valid, url: "javascript:alert(1)" })).toBeNull();
    expect(parseEvent({ ...valid, url: "https://" })).toBeNull();
  });

  it("refuses a malformed or reversed date range", () => {
    expect(parseEvent({ ...valid, starts: "14. 10. 2026" })).toBeNull();
    expect(parseEvent({ ...valid, ends: "2026-10-13" })).toBeNull();
    expect(parseEvent({ ...valid, ends: "2026-10-16" })?.ends).toBe("2026-10-16");
  });

  it("holds the length limits", () => {
    expect(parseEvent({ ...valid, title: "x".repeat(121) })).toBeNull();
    expect(parseEvent({ ...valid, title: "x".repeat(120) })).not.toBeNull();
    expect(parseEvent({ ...valid, description: "x".repeat(281) })?.description).toBeUndefined();
  });
});

describe("parsing the whole file", () => {
  it("accepts a valid file and rejects a duplicate id", () => {
    const good = { schemaVersion: "boardless-events/1", updated: TODAY, events: [valid] };
    expect(parseEventsFile(good)?.events).toHaveLength(1);
    expect(parseEventsFile({ ...good, events: [valid, valid] })).toBeNull();
  });

  it("rejects the wrong schema version", () => {
    expect(parseEventsFile({ schemaVersion: "boardless-dataset/1", updated: TODAY, events: [] })).toBeNull();
  });

  it("rejects the file when one event is bad, rather than dropping it silently", () => {
    // A hand-maintained store is different from a synced stream: a value the
    // owner typed wrong should surface, not disappear.
    const bad = { schemaVersion: "boardless-events/1", updated: TODAY, events: [{ ...valid, scope: "moon" }] };
    expect(parseEventsFile(bad)).toBeNull();
  });
});

describe("applying a save", () => {
  it("creates, then updates in place", () => {
    const created = applyEvent(emptyEventsFile(TODAY), event(), { today: TODAY });
    expect(created.action).toBe("created");
    expect(created.file.events).toHaveLength(1);

    const updated = applyEvent(created.file, event({ title: "Nový název" }), { today: TODAY });
    expect(updated.action).toBe("updated");
    expect(updated.file.events).toHaveLength(1);
    expect(updated.file.events[0]?.title).toBe("Nový název");
  });

  it("keeps the original added date across an update", () => {
    const created = applyEvent(emptyEventsFile("2026-08-01"), event(), { today: "2026-08-01" });
    const updated = applyEvent(created.file, event({ title: "B" }), { today: TODAY });
    expect(updated.file.events[0]?.added).toBe("2026-08-01");
  });

  it("refuses to edit a past event silently", () => {
    const past = file([event({ id: "old", starts: "2026-06-01" })]);
    expect(() => applyEvent(past, event({ id: "old", starts: "2026-06-01", title: "Rewritten" }), { today: TODAY }))
      .toThrow(EventsPersistenceError);
  });

  it("allows a past event to change as an explicit correction, and records it", () => {
    const past = file([event({ id: "old", starts: "2026-06-01" })]);
    const result = applyEvent(
      past,
      event({ id: "old", starts: "2026-06-01", title: "Opravený název" }),
      { today: TODAY, correction: true },
    );
    expect(result.file.events[0]?.title).toBe("Opravený název");
    expect(result.file.events[0]?.corrected).toBe(TODAY);
  });

  it("does not mark a future edit as a correction", () => {
    const created = applyEvent(emptyEventsFile(TODAY), event(), { today: TODAY });
    const updated = applyEvent(created.file, event({ title: "B" }), { today: TODAY, correction: true });
    expect(updated.file.events[0]?.corrected).toBeUndefined();
  });

  it("archives an event out of the file", () => {
    const created = applyEvent(emptyEventsFile(TODAY), event(), { today: TODAY });
    const archived = applyEvent(created.file, event(), { today: TODAY, archive: true });
    expect(archived.action).toBe("archived");
    expect(archived.file.events).toHaveLength(0);
  });

  it("refuses to archive something that is not there", () => {
    expect(() => applyEvent(emptyEventsFile(TODAY), event(), { today: TODAY, archive: true }))
      .toThrow(EventsPersistenceError);
  });

  it("keeps the list sorted by start date", () => {
    let current = emptyEventsFile(TODAY);
    for (const [id, starts] of [["c", "2026-12-01"], ["a", "2026-09-01"], ["b", "2026-10-01"]] as const) {
      current = applyEvent(current, event({ id, starts }), { today: TODAY }).file;
    }
    expect(current.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("moves the updated stamp forward on every save", () => {
    const created = applyEvent(emptyEventsFile("2026-08-01"), event(), { today: TODAY });
    expect(created.file.updated).toBe(TODAY);
  });
});
