import { describe, expect, it } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { WORKSPACE_CHANNELS } from "./meeting-feed";
import { projectForKind, readOfficeWalkthrough } from "./office-walkthrough";

describe("the home-page venture registry projection", () => {
  it("keeps every operating venture on the wall, in results and in facilities", async () => {
    const data = await readOfficeWalkthrough(new Date("2026-08-13T12:00:00.000Z"));
    const registered = ventureRegistry.ventures
      .filter((venture) => venture.status === "operating" && venture.visibility === "public")
      .map((venture) => venture.id);

    expect(data.projects.map((project) => project.id)).toEqual(registered);
    expect(data.results.projects.map((project) => project.id)).toEqual(registered);
    expect(data.workflows.rooms).toHaveLength(registered.length + 1);
    expect(new Set(data.workflows.rooms.map((room) => room.key))).toEqual(new Set([
      "company",
      ...registered
    ]));
    // A paused venture's desk channel and calendar rows leave with the venture. Computed from
    // the registry so the assertion holds whichever way the owner's switches point today.
    const paused = new Set(ventureRegistry.ventures
      .filter((venture) => venture.status === "paused")
      .map((venture) => venture.id));
    const expectedChannels = WORKSPACE_CHANNELS
      .filter((channel) => channel.venture === null || !paused.has(channel.venture));
    expect(data.channels.map(({ id }) => id)).toEqual(expectedChannels.map(({ id }) => id));
    const rowKinds = new Set(data.weeks[data.currentWeek]?.rows.map((row) => row.kind));
    for (const kind of ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"] as const) {
      const expected = !paused.has(projectForKind(kind) ?? "");
      expect(rowKinds.has(kind), `${kind} in today's meeting rows`).toBe(expected);
    }
  });

  it("routes every new room kind to its own venture rather than Board HQ", () => {
    expect(projectForKind("bh-desk")).toBe("booksofhistory");
    expect(projectForKind("dm-desk")).toBe("door-money");
    expect(projectForKind("dm-growth")).toBe("door-money");
    expect(projectForKind("ts-desk")).toBe("tehdejsi-svet");
    expect(projectForKind("kv-desk")).toBe("kvorum");
  });
});
