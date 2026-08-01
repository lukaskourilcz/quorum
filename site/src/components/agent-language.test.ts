import { describe, expect, it } from "vitest";
import { publicAgentText, publicDecisionLabel } from "./agent-language";

describe("publicAgentText", () => {
  it("replaces internal role and work codes with plain language", () => {
    expect(publicAgentText("LEDGER approved OPS-HANDOFF — no external action.")).toBe(
      "Budget keeper approved next-step summary: no outside action."
    );
  });

  it("uses readable names for scored business checks", () => {
    expect(publicAgentText("Evidence quality / independence")).toBe(
      "Source quality and independence"
    );
    expect(publicAgentText("First monetization experiment")).toBe(
      "First revenue test"
    );
  });

  it("turns internal decision codes into clear outcomes", () => {
    expect(publicDecisionLabel("EVIDENCE_PACKET_REQUIRED")).toBe(
      "Needs reliable sources"
    );
    expect(publicDecisionLabel("done")).toBe("Finished");
    expect(publicAgentText("Current shift")).toBe("Current meeting");
  });
});
