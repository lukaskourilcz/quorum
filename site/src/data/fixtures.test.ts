import { describe, expect, it } from "vitest";
import { agents } from "./agents";
import { opportunities, standups } from "./fixtures";

describe("public fixture truthfulness", () => {
  it("exposes exactly fourteen unique role profiles", () => {
    expect(agents).toHaveLength(14);
    expect(new Set(agents.map((agent) => agent.id)).size).toBe(14);
    expect(new Set(agents.map((agent) => agent.slug)).size).toBe(14);
  });

  it("never presents a fixture opportunity as selected", () => {
    expect(opportunities.every((opportunity) => opportunity.fixture)).toBe(true);
    expect(opportunities.every((opportunity) => opportunity.status === "Rejected")).toBe(
      true
    );
    expect(Math.max(...opportunities.map((opportunity) => opportunity.score))).toBe(
      34
    );
  });

  it("marks the founding record and its non-decision", () => {
    expect(standups[0]?.fixture).toBe(true);
    expect(standups[0]?.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(standups[0]?.ledger.actual).toBe(0);
  });
});
