import type { OrgChange } from "./change.js";

export function evaluateOrgChange(
  change: OrgChange,
  currentCycle: number,
  observed: number | null
): {
  due: boolean;
  metExpectedDelta: boolean | null;
  action: "wait" | "keep" | "revert" | "investigate";
} {
  if (currentCycle < change.reviewCycle) {
    return { due: false, metExpectedDelta: null, action: "wait" };
  }
  if (change.baseline === null || observed === null) {
    return { due: true, metExpectedDelta: null, action: "investigate" };
  }
  const metExpectedDelta =
    observed - change.baseline >= change.expectedDelta;
  return {
    due: true,
    metExpectedDelta,
    action: metExpectedDelta ? "keep" : "revert"
  };
}
