import { describe, expect, it } from "vitest";
import { priorityExpired } from "./autonomy-panel";

describe("priority expiry", () => {
  it("marks a recorded expiry once the current time has passed it", () => {
    expect(priorityExpired("2026-08-10T08:33:18.686Z", "2026-08-10T08:33:18.687Z")).toBe(true);
    expect(priorityExpired("2026-08-10T08:33:18.686Z", "2026-08-10T08:33:18.686Z")).toBe(false);
  });
});
