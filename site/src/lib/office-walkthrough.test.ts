import { describe, expect, it, vi } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { getDailyResults, parseDailyResult, type DailyResult } from "./daily-results";
import { getPublicMoneySnapshot } from "./money-records";
import { WORKSPACE_CHANNELS } from "./meeting-feed";
import { projectForKind, readOfficeWalkthrough } from "./office-walkthrough";

// The real reader stays in place; one case below swaps in two receipts for a single call.
vi.mock("./daily-results", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./daily-results")>();
  return { ...actual, getDailyResults: vi.fn(actual.getDailyResults) };
});

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

  it("puts the newest daily receipt on the TV, not the oldest", async () => {
    const day = (date: string, costUsd: number): DailyResult => ({
      date,
      portfolioLine: "",
      rows: [{
        ventureId: "caught-up",
        ventureLabel: "DNESKAi",
        kind: "DNESKAi daily desk",
        output: "The edition was published.",
        roomLink: null,
        status: "produced",
        costUsd,
        failureReason: null
      }],
      totalCostUsd: costUsd
    });
    // Newest first, which is the order getDailyResults returns. The screen used to read the last
    // entry and so showed the oldest receipt on file for as long as the digest kept writing.
    vi.mocked(getDailyResults).mockResolvedValueOnce([day("2026-09-25", 0.2989), day("2026-08-01", 0.1998)]);
    const data = await readOfficeWalkthrough(new Date("2026-09-26T06:00:00.000Z"));
    expect(data.reports.daily.date).toBe("2026-09-25");
    expect(data.reports.daily.spendUsd).toBe(0.2989);
    expect(data.reports.daily.roomsHeld).toBe(1);
  });

  it("counts a DNESKAi day as an article only when its edition room recorded one (#577)", async () => {
    // The section counts this month's produced DNESKAi rows as articles. A day whose edition room
    // recorded NO_EDITION used to count too, because its plain-language line hid the outcome.
    const month = (await getPublicMoneySnapshot())?.costs.api.month ?? "2026-09";
    const day = (date: string, outcome: string, line: string) => parseDailyResult({
      digest: {
        date,
        meetings: [{ ventureId: "caught-up", kind: "cu-day", held: true, outcome, bullets: [{ text: line, roomLink: `/meetings/${date}-cu-edition` }], costUsd: 0.05 }],
        operations: [],
        portfolioLine: "Recorded API spend $0.0500 against the $1.00 daily budget."
      }
    })!;
    vi.mocked(getDailyResults).mockResolvedValueOnce([
      day(`${month}-25`, "EDITION", "The desk explained a verified model price cut."),
      day(`${month}-24`, "NO_EDITION", "Today's candidate stories did not meet the source rules, so nothing was written.")
    ]);
    const data = await readOfficeWalkthrough(new Date(`${month}-26T06:00:00.000Z`));
    expect(data.results.articles).toBe(1);
    expect(data.results.costPerArticle).toBe(0.05);
  });
});
