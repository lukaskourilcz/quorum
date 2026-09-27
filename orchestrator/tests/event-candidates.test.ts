import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EventCandidateFileSchema } from "../src/contracts/event-candidates.js";
import { collectEventCandidates } from "../src/events/collect.js";
import { eventSourceHosts, loadEventSourceRegistry, type EventSourceRegistry } from "../src/events/registry.js";
import { configRoot } from "../src/paths.js";

const DATE = "2026-09-27";

function registry(): EventSourceRegistry {
  return loadEventSourceRegistry();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const publicAddress = async (): Promise<string[]> => ["93.184.216.34"];

describe("the event candidate sources", () => {
  it("contacts only hosts the network allowlist names", async () => {
    const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
    for (const host of eventSourceHosts(registry())) {
      expect(allowlist.runtimeHosts, host).toContain(host);
    }
  });
});

describe("collectEventCandidates", () => {
  it("offers in-window entries, drops what the store holds and records a failing source", async () => {
    const calendar = {
      events: [
        { title: "AI v praxi &amp; data", start_date: "2026-10-14 09:00:00", url: "https://www.aiakce.cz/akce/ai-v-praxi/", venue: { city: "Praha" } },
        { title: "Proběhlá akce", start_date: "2026-01-10 09:00:00", url: "https://www.aiakce.cz/akce/probehla/" },
        { title: "Už v kalendáři", start_date: "2026-11-02 09:00:00", url: "https://www.aiakce.cz/akce/uz-ulozena/" }
      ]
    };
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("aiakce.cz")) return jsonResponse(calendar);
      if (url.includes("general.json")) return new Response("upstream down", { status: 500 });
      return jsonResponse([
        { name: "Prague ML Summit", startDate: "2026-11-20", url: "https://example.org/ml", country: "Czech Republic", city: "Prague" },
        { name: "Frontend Nights", startDate: "2026-11-21", url: "https://example.org/fe", country: "Germany" }
      ]);
    }) as typeof fetch;

    const file = await collectEventCandidates({
      registry: registry(),
      events: [{ id: "uz-ulozena", url: "https://www.aiakce.cz/akce/uz-ulozena/" }],
      deps: { now: DATE, fetchImpl, resolveImpl: publicAddress }
    });

    expect(EventCandidateFileSchema.safeParse(file).success).toBe(true);
    const titles = file.candidates.map((candidate) => candidate.title);
    expect(titles).toContain("AI v praxi & data");
    expect(titles).toContain("Prague ML Summit");
    expect(titles).not.toContain("Proběhlá akce");
    expect(titles).not.toContain("Frontend Nights");
    expect(titles).not.toContain("Už v kalendáři");

    const aiakce = file.sources.find((source) => source.id === "aiakce");
    expect(aiakce?.known).toBe(1);
    const general = file.sources.find((source) => source.id === "confs-tech-general");
    expect(general?.error).toBeTruthy();
    expect(general?.accepted).toBe(0);
  });
});
