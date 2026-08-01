import { describe, expect, it, vi } from "vitest";
import { fetchOddsApiMma, loadMmaSourceRegistry, projectCitoBouts, projectCitoEvents, projectCitoFighters, projectOddsApiEvents } from "../src/fightaiq/sources.js";

describe("FightAIQ source controls", () => {
  it("keeps only the reviewed free-source allowlist", async () => {
    const registry = await loadMmaSourceRegistry();
    expect(registry.sources.filter((source) => source.state === "wired").map((source) => source.id)).toEqual(["wikimedia", "the-odds-api", "cito-ufc", "owner-reviewed-import"]);
    expect(registry.sources.find((source) => source.id === "official-organization-pages")).toMatchObject({ state: "disabled", termsVerdict: "unclear" });
    expect(registry.sources.map((source) => source.id)).not.toContain("oddspapi");
  });

  it("projects fixture odds without retaining unrecognized markets", () => {
    expect(projectOddsApiEvents([{ id: "event-1", commence_time: "2026-08-08T18:00:00Z", home_team: "Red", away_team: "Blue", bookmakers: [{ title: "Fixture book", markets: [{ key: "h2h", outcomes: [{ name: "Red", price: 1.8 }, { name: "Blue", price: 2.1 }] }] }] }])).toEqual([{ id: "event-1", commenceTime: "2026-08-08T18:00:00.000Z", red: "Red", blue: "Blue", bookmakers: [{ name: "Fixture book", redDecimal: 1.8, blueDecimal: 2.1 }] }]);
  });

  it("tracks The Odds API quota and stops before another request at zero", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-requests-last": "1",
        "x-requests-remaining": "0",
        "x-requests-used": "500"
      }
    }));
    const result = await fetchOddsApiMma({
      apiKey: "fixture-key",
      context: { allowHosts: ["api.the-odds-api.com"], now: new Date("2026-08-01T00:00:00Z") },
      fetchImpl: fetchImpl as typeof fetch,
      resolveImpl: async () => ["203.0.113.10"]
    });
    expect(result).toMatchObject({ remainingCredits: 0, usedCredits: 500, lastRequestCredits: 1, exhausted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const stopped = await fetchOddsApiMma({
      apiKey: "fixture-key",
      remainingCredits: result.remainingCredits,
      context: { allowHosts: ["api.the-odds-api.com"], now: new Date("2026-08-01T00:00:00Z") },
      fetchImpl: fetchImpl as typeof fetch
    });
    expect(stopped).toMatchObject({ events: [], remainingCredits: 0, exhausted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("projects documented Cito envelopes and drops malformed rows", () => {
    expect(projectCitoFighters({ data: { fighters: [
      { id: 1, slug: "alex-example", name: "Alex Example", record: { wins: 12, losses: 2, draws: 0 }, weightClass: "Light Heavyweight", stance: "Orthodox", height_cm: "190 cm", reach_cm: 198 },
      { id: 2 }
    ] } })).toEqual([{
      id: "1",
      slug: "alex-example",
      name: "Alex Example",
      record: "12-2-0",
      division: "Light Heavyweight",
      stance: "Orthodox",
      heightCm: 190,
      reachCm: 198
    }]);

    const bouts = projectCitoBouts({ data: { bouts: [{
      id: "bout-1",
      redFighter: { id: "f1", slug: "alex-example", name: "Alex Example" },
      blueFighter: { id: "f2", slug: "blair-example", name: "Blair Example" },
      weightClass: "Light Heavyweight",
      scheduledRounds: 5,
      status: "confirmed"
    }] } });
    expect(bouts).toEqual([{
      id: "bout-1",
      red: { id: "f1", slug: "alex-example", name: "Alex Example" },
      blue: { id: "f2", slug: "blair-example", name: "Blair Example" },
      division: "Light Heavyweight",
      scheduledRounds: 5,
      status: "weigh-in"
    }]);
    expect(projectCitoEvents({ data: { events: [{
      id: "event-1",
      slug: "ufc-example",
      name: "UFC Example",
      venue: "Example Arena",
      startsAt: "2026-08-03T18:00:00Z",
      timezone: "UTC",
      bouts
    }] } })).toMatchObject([{ id: "event-1", slug: "ufc-example", name: "UFC Example", bouts }]);
  });
});
