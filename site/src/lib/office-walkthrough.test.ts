import { describe, expect, it } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { projectForKind, readOfficeWalkthrough } from "./office-walkthrough";

describe("the home-page venture registry projection", () => {
  it("keeps every operating venture on the wall, in results and in facilities", async () => {
    const data = await readOfficeWalkthrough(new Date("2026-08-13T12:00:00.000Z"));
    const registered = ventureRegistry.ventures
      .filter((venture) => venture.status === "operating")
      .map((venture) => venture.id);

    expect(data.projects.map((project) => project.id)).toEqual(registered);
    expect(data.results.projects.map((project) => project.id)).toEqual(registered);
    expect(data.workflows.rooms).toHaveLength(registered.length + 1);
    expect(new Set(data.workflows.rooms.map((room) => room.key))).toEqual(new Set([
      "company",
      ...registered
    ]));
    expect(data.channels).toHaveLength(12);
    const rowKinds = new Set(data.weeks[data.currentWeek]?.rows.map((row) => row.kind));
    for (const kind of ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"]) {
      expect(rowKinds.has(kind), `${kind} is missing from today's meeting rows`).toBe(true);
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
