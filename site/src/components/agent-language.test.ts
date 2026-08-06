import { describe, expect, it } from "vitest";
import { publicAgentText, publicDecisionLabel } from "./agent-language";

describe("publicAgentText", () => {
  it("replaces internal role and work codes with plain language", () => {
    // The dash stays: rewriting every em dash to a colon mangled ordinary sentences to fix one
    // code that now has its own label.
    expect(publicAgentText("LEDGER approved OPS-HANDOFF — no external action.")).toBe(
      "Budget keeper approved Prepare the next step — no outside action."
    );
  });

  it("labels a shouted code before the word list can tear it in half", () => {
    // NEEDS_RECONCILIATION used to render as "NEEDS_final checking": the word list matched
    // "reconciliation" inside the token. Status labels run first now, on any shouted code.
    expect(publicAgentText("Delivery is NEEDS_RECONCILIATION today.")).toBe(
      "Delivery is Needs checking today."
    );
    expect(publicAgentText("DATA_ONLY. No probability is published.")).toBe(
      "data only. No probability is published."
    );
  });

  it("uses readable names for scored business checks", () => {
    expect(publicAgentText("Evidence quality / independence")).toBe(
      "Source quality and independence"
    );
    expect(publicAgentText("First monetization experiment")).toBe(
      "First revenue test"
    );
    expect(publicAgentText("The editorial slate and ModelRun artifact passed calibration.")).toBe(
      "The daily article plan and saved calculations passed forecast accuracy."
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
