import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getTittyTuesdaysSnapshot } from "./titty-tuesdays-records";

describe("Titty Tuesdays public snapshot", () => {
  it("projects four concepts, measured zero spend and pending gates", async () => {
    const snapshot = await getTittyTuesdaysSnapshot();
    expect(snapshot.season.products).toHaveLength(4);
    expect(snapshot.season.products.every((product) => product.status === "concept")).toBe(true);
    expect(snapshot.apiSpendUsd).toBe(0);
    expect(snapshot.foundingStatus).toBe("pending owner countersignature");
    expect(snapshot.budgetStatus).toBe("pending owner countersignature");
    expect(snapshot.bootstrapMeetingId).toBe("2026-08-01-tt-marketing");
  });
});
