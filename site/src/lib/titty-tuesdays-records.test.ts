import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getTittyTuesdaysSnapshot } from "./titty-tuesdays-records";

describe("Titty Tuesdays public snapshot", () => {
  it("projects four concepts, measured ledger spend and the countersigned founding gate", async () => {
    const snapshot = await getTittyTuesdaysSnapshot();
    const root = path.basename(process.cwd()) === "site" ? path.resolve(process.cwd(), "..") : process.cwd();
    const ledger = JSON.parse(await readFile(path.join(root, "state", "budget", "ledger.json"), "utf8")) as {
      entries: Array<{ ventureId?: string; usd?: number }>;
    };
    const measuredSpend = ledger.entries
      .filter((entry) => entry.ventureId === "titty-tuesdays" && typeof entry.usd === "number")
      .reduce((sum, entry) => sum + (entry.usd ?? 0), 0);
    expect(snapshot.season.products).toHaveLength(4);
    expect(snapshot.season.products.every((product) => product.status === "concept")).toBe(true);
    expect(snapshot.apiSpendUsd).toBe(Number(measuredSpend.toFixed(8)));
    expect(snapshot.foundingStatus).toBe("countersigned");
    // The owner countersigned the budget raise on 2026-08-04. This reads the live decision, so
    // asserting "pending" tested the state of the repository and broke when the state changed.
    expect(snapshot.budgetStatus).toBe("countersigned");
    expect(snapshot.bootstrapMeetingId).toBe("2026-08-01-tt-marketing");
  });
});
