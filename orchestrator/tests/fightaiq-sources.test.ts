import { describe, expect, it } from "vitest";
import { loadMmaSourceRegistry, projectCitoFighters, projectOddsApiEvents } from "../src/fightaiq/sources.js";

describe("FightAIQ source controls", () => {
  it("wires only verified APIs and blocks Tapology", async () => {
    const registry = await loadMmaSourceRegistry();
    expect(registry.sources.filter((source) => source.state === "wired").map((source) => source.id)).toEqual(["the-odds-api", "cito-ufc"]);
    expect(registry.sources.find((source) => source.id === "tapology")).toMatchObject({ state: "blocked", termsVerdict: "forbidden" });
    expect(registry.sources.find((source) => source.id === "octagon-api")).toMatchObject({ state: "disabled", termsVerdict: "unclear" });
  });

  it("projects fixture odds without retaining unrecognized markets", () => {
    expect(projectOddsApiEvents([{ id: "event-1", commence_time: "2026-08-08T18:00:00Z", home_team: "Red", away_team: "Blue", bookmakers: [{ title: "Fixture book", markets: [{ key: "h2h", outcomes: [{ name: "Red", price: 1.8 }, { name: "Blue", price: 2.1 }] }] }] }])).toEqual([{ id: "event-1", commenceTime: "2026-08-08T18:00:00.000Z", red: "Red", blue: "Blue", bookmakers: [{ name: "Fixture book", redDecimal: 1.8, blueDecimal: 2.1 }] }]);
  });

  it("drops malformed Cito rows", () => {
    expect(projectCitoFighters({ data: [{ id: 1, name: "Alex Example", record: "12-2-0" }, { id: 2 }] })).toEqual([{ id: "1", name: "Alex Example", record: "12-2-0" }]);
  });
});
