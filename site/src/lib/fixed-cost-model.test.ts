import { describe, expect, it } from "vitest";
import {
  parseStoredFixedCostRegistry,
  replaceStoredFixedCosts,
  toAdminFixedCosts
} from "./fixed-cost-model";

const emptyRegistry = {
  schemaVersion: "fixed-costs/1" as const,
  currency: "USD" as const,
  costs: [],
  $comment: ["Examples are instructions, not active costs."]
};

describe("fixed-cost editor model", () => {
  it("keeps comments outside the active cost total", () => {
    const parsed = parseStoredFixedCostRegistry(emptyRegistry);
    expect(parsed).not.toBeNull();
    expect(toAdminFixedCosts(parsed!)).toEqual([]);
  });

  it("round-trips owner-entered costs without dropping the non-operative note", () => {
    const next = replaceStoredFixedCosts(emptyRegistry, [{
      name: "Vercel Pro",
      monthlyUsd: 20,
      category: "hosting",
      since: "2026-08-01"
    }]);
    expect(next?.$comment).toEqual(emptyRegistry.$comment);
    expect(next?.costs).toEqual([{
      name: "Vercel Pro",
      monthly_usd: 20,
      category: "hosting",
      since: "2026-08-01"
    }]);
  });

  it("rejects zero values, duplicate entries and impossible dates", () => {
    expect(replaceStoredFixedCosts(emptyRegistry, [{ name: "Hosting", monthlyUsd: 0, category: "hosting", since: "2026-08-01" }])).toBeNull();
    expect(replaceStoredFixedCosts(emptyRegistry, [
      { name: "Hosting", monthlyUsd: 10, category: "hosting", since: "2026-08-01" },
      { name: " hosting ", monthlyUsd: 12, category: "hosting", since: "2026-08-01" }
    ])).toBeNull();
    expect(replaceStoredFixedCosts(emptyRegistry, [{ name: "Hosting", monthlyUsd: 10, category: "hosting", since: "2026-02-30" }])).toBeNull();
  });
});
