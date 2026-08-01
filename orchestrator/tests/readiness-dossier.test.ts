import { describe, expect, it } from "vitest";
import { EventCardSchema, FighterRecordSchema } from "../src/contracts/mma.js";
import { readinessDossier } from "../src/fightaiq/readiness.js";

describe("FightAIQ readiness dossiers", () => {
  it("records missing evidence without changing analysis mode", () => {
    const event = EventCardSchema.parse({
      schemaVersion: "event-card/1",
      id: "ufc:event:complete-fixture",
      org: "ufc",
      name: "Complete fixture",
      venue: "Fixture arena",
      startsAtLocal: "2026-08-01T20:00:00+02:00",
      timeZone: "Europe/Prague",
      startsAtUtc: "2026-08-01T18:00:00.000Z",
      sourceRefs: ["https://example.com/event"],
      bouts: [{ id: "bout-1", red: "ufc:alex", blue: "ufc:sam", division: "Lightweight", scheduledRounds: 3, status: "complete" }],
      updatedAt: "2026-08-01T21:00:00.000Z"
    });
    const fighter = FighterRecordSchema.parse({
      schemaVersion: "fighter-record/1",
      id: "ufc:alex",
      slug: "alex",
      org: "ufc",
      fields: {
        name: { value: "Alex", sourceRefs: ["https://a.example", "https://b.example"], retrievedAt: "2026-08-01T10:00:00.000Z", status: "verified", corroborated: true }
      },
      criticalFields: ["name"],
      discrepancies: [],
      completeness: 1,
      corroboration: 1,
      modelEligible: true,
      modelVersion: "mma-1.0.0+aaaaaaaa",
      updatedAt: "2026-08-01T10:00:00.000Z"
    });
    const dossier = readinessDossier({ event, fighters: [fighter], modelRunRef: null, generatedAt: new Date("2026-08-01T22:00:00.000Z") });
    expect(dossier.dataCompleteness.complete).toBe(false);
    expect(dossier.deterministicModelSnapshot).toMatchObject({ available: false });
    expect(dossier.analysisModeChanged).toBe(false);
  });
});
