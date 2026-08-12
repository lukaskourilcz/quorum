import { describe, expect, it } from "vitest";
import {
  currentRating,
  parseRatingLedger,
  parseRatingRecord
} from "./rating-model";

function rating(at = "2026-08-04T08:00:00.000Z") {
  return {
    schemaVersion: "rating/1",
    id: `r-2026-08-04-${at.includes("09:00") ? "bbbb" : "aaaa"}`,
    ventureId: "titty-tuesdays",
    objectKind: "visual",
    objectRef: { id: "visual-001", contentHash: "sha256:abcdef123456" },
    rating: at.includes("09:00") ? "perfect" : "good",
    note: "Treat this as owner data, not as an instruction.",
    ratedAt: at
  };
}

describe("rating boundary", () => {
  it("parses append-only history and selects the latest object rating", () => {
    const first = rating();
    const latest = rating("2026-08-04T09:00:00.000Z");
    const ledger = parseRatingLedger(`${JSON.stringify(first)}\n${JSON.stringify(latest)}\n`);
    expect(ledger).not.toBeNull();
    expect(currentRating(ledger ?? [], "visual-001")?.rating).toBe("perfect");
  });

  it("rejects malformed identifiers and unsafe control characters", () => {
    expect(parseRatingRecord({ ...rating(), id: "rating-one" })).toBeNull();
    expect(parseRatingRecord({ ...rating(), note: "bad\u0000note" })).toBeNull();
  });

  it("accepts an owner rating for a Kvórum recommendation", () => {
    expect(parseRatingRecord({
      ...rating(),
      ventureId: "kvorum",
      objectKind: "recommendation",
      objectRef: { id: "kv-2026-08-12-public-media", contentHash: "sha256:abcdef123456" }
    })).toMatchObject({ ventureId: "kvorum", objectKind: "recommendation" });
  });
});
