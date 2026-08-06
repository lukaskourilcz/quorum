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

/**
 * Running the status-label pass ahead of the word list silently killed the two named token
 * rules whose plain wording is a phrase rather than a label: publicDecisionLabel does not know
 * OPS-OBSERVE or NO_POST, so they came out lowercased as "ops-observe" and "no post" — and
 * "ops-observe" reached the home page.
 */
describe("named token rules survive the status-label pass", () => {
  it("keeps the phrases the label map cannot produce", () => {
    expect(publicAgentText("The OPS-OBSERVE item is internal.")).toContain("record check");
    expect(publicAgentText("Growth plan: NO_POST for this shift.")).toContain("do not publish");
    expect(publicAgentText("Record NO_PROPOSAL and close.")).toContain("no proposal");
    expect(publicAgentText("The room recorded NO_ACTION.")).toContain("do nothing");
  });

  it("still labels a status the map does know", () => {
    expect(publicAgentText("Delivery is NEEDS_RECONCILIATION today.")).toContain("Needs checking");
  });
});
