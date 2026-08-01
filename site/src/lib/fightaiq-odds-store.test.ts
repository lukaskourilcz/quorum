import { describe, expect, it, vi } from "vitest";
import { parseOwnerOddsCapture } from "./fightaiq-odds-store";

vi.mock("server-only", () => ({}));

describe("owner price capture", () => {
  it("builds a bounded odds-snapshot record", () => {
    const capture = parseOwnerOddsCapture({ eventRef: "ufc:event:301", boutRef: "bout-main", redOdds: "1.8", blueOdds: "2.1", sourceLabel: "Owner capture from a public price screen" }, new Date("2026-08-01T12:00:00Z"));
    expect(capture).toMatchObject({ schemaVersion: "odds-snapshot/1", source: "owner-entry", market: "moneyline", prices: [{ decimal: 1.8 }, { decimal: 2.1 }] });
  });

  it("rejects path-like events and invalid prices", () => {
    expect(parseOwnerOddsCapture({ eventRef: "../../admin", boutRef: "x", redOdds: 1.8, blueOdds: 2.1, sourceLabel: "owner" })).toBeNull();
    expect(parseOwnerOddsCapture({ eventRef: "bellator:event:100", boutRef: "x", redOdds: 1.8, blueOdds: 2.1, sourceLabel: "owner" })).toBeNull();
  });
});
