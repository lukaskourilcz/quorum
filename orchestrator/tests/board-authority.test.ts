import { describe, expect, it } from "vitest";
import { loadBoardAuthority } from "../src/governance/board-authority.js";

const lockedControls = [
  "accessibility_gates",
  "bundle_ceiling",
  "compatibility_contracts",
  "honesty_invariants",
  "human_only_payments",
  "sanitization_boundary",
  "security_headers"
];

describe("DNESKAi board authority", () => {
  it("keeps ring three complete and unreachable from delivery", async () => {
    const authority = await loadBoardAuthority();
    expect(authority.rings.locked.controls.map((control) => control.id).sort()).toEqual(
      lockedControls
    );
    expect(authority.deliveryBoundary.codeWritesAllowed).toBe(false);
    expect(authority.deliveryBoundary.allowedPaths.every((file) =>
      !file.startsWith("app/") && !file.startsWith("lib/") && !file.startsWith("components/")
    )).toBe(true);
  });

  it("requires a human gate before revenue", async () => {
    const authority = await loadBoardAuthority();
    expect(authority.revenueGate).toEqual({
      acceptMoneyBeforeApproval: false,
      hostingPlan: "vercel-pro",
      hostingDecisionStatus: "resolved",
      approvalActionId: "sponsor_or_revenue"
    });
    expect(authority.rings.humanApproval.inboxType).toBe("HUMAN_APPROVAL");
  });
});
