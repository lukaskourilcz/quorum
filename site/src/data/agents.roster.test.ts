import { describe, expect, it } from "vitest";
import { agents } from "./agents";

/**
 * The roster cut stood ten roles down and the public pages kept counting them, so the team page
 * presented forty working members when thirty do the work. The counts are derived now; this is
 * the assertion that keeps them derived.
 */
describe("the public roster counts what works", () => {
  it("separates working roles from stood-down ones", () => {
    const working = agents.filter((agent) => agent.status === "active");
    const standDown = agents.filter((agent) => agent.status !== "active");

    expect(working.length + standDown.length).toBe(agents.length);
    expect(working.length).toBeLessThan(agents.length);
    // Four decision makers, and every one of them is working: the home page's "4 DECIDE" and
    // its "N - 4 other roles" both depend on it.
    expect(working.filter((agent) => agent.group === "Council")).toHaveLength(4);
    expect(standDown.every((agent) => agent.group !== "Council")).toBe(true);
  });
});
