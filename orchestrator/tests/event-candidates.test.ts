import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EventCandidateFileSchema } from "../src/contracts/event-candidates.js";
import { collectEventCandidates } from "../src/events/collect.js";
import { normalizeIcs, cityOf } from "../src/events/candidates.js";
import { parseIcsEvents, unescapeText } from "../src/events/ics.js";
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

// The shape of the ČAUI Luma export on 2026-09-28: CRLF, folded lines, UTC times, the event page
// only in the description.
const LUMA = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART:20261029T223000Z",
  "DTEND:20261029T233000Z",
  "UID:evt-pTx1VFUbHfn9427@events.lu.ma",
  "SUMMARY:AI STATUS: Budoucnost s roboty",
  "DESCRIPTION:Get up-to-date information at: https://luma.com/8pm87y68\\n\\nAd",
  " dress:\\nNa Příkopě 388/1\\, Praha",
  "LOCATION:Na Příkopě 388/1\\, Staré Město\\, 110 00 Praha 1\\, Czechia",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261105",
  "DTEND;VALUE=DATE:20261107",
  "UID:evt-online@events.lu.ma",
  "SUMMARY:Online AI kurz",
  "DESCRIPTION:Slides at https://example.org/deck and the page https://luma.com/abc123.",
  "LOCATION:https://zoom.us/j/1",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/Prague:20261110T180000",
  "UID:evt-nolink@events.lu.ma",
  "SUMMARY:Bez odkazu",
  "DESCRIPTION:No page anywhere.",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20260101T100000Z",
  "SUMMARY:Proběhlo",
  "URL:https://luma.com/old",
  "END:VEVENT",
  "END:VCALENDAR",
  ""
].join("\r\n");

describe("the iCalendar reader", () => {
  it("unfolds, unescapes and dates events in Prague", () => {
    const events = parseIcsEvents(LUMA);
    expect(events).toHaveLength(4);
    // 22:30 UTC on 29 October is 23:30 in Prague, still the 29th; the end at 23:30 UTC is the 30th.
    expect(events[0]).toMatchObject({ starts: "2026-10-29", ends: "2026-10-30", summary: "AI STATUS: Budoucnost s roboty" });
    expect(events[0]!.description).toContain("Address:\nNa Příkopě 388/1, Praha");
    // An all-day DTEND is exclusive.
    expect(events[1]).toMatchObject({ starts: "2026-11-05", ends: "2026-11-06" });
    // A TZID local time keeps the date it was written with.
    expect(events[2]).toMatchObject({ starts: "2026-11-10" });
    expect(events[2]!.ends).toBeUndefined();
    expect(unescapeText("a\\, b\\; c\\nd\\\\e")).toBe("a, b; c\nd\\e");
  });

  it("offers dated events with a page, and drops the ones without", () => {
    const source = registry().sources.find((entry) => entry.id === "caui-luma")!;
    const batch = normalizeIcs(LUMA, source, {
      date: DATE,
      windowDays: 240,
      topicKeywords: registry().topicKeywords,
      czechCountries: registry().czechCountries
    });
    expect(batch.read).toBe(4);
    expect(batch.candidates.map((candidate) => candidate.title)).toEqual(["AI STATUS: Budoucnost s roboty", "Online AI kurz"]);
    const [inPerson, online] = batch.candidates;
    expect(inPerson).toMatchObject({ url: "https://luma.com/8pm87y68", online: false, city: "Praha 1", scope: "cz" });
    expect(inPerson!.description).not.toMatch(/Get up-to-date|https:/u);
    // Only a link on the calendar's own event host stands in for a missing URL property.
    expect(online).toMatchObject({ url: "https://luma.com/abc123", online: true, ends: "2026-11-06" });
    expect(batch.dropped).toBe(2);
  });

  it("reads a city without its postcode or country", () => {
    expect(cityOf("Hybernia Theatre, Náměstí Republiky 3/4, 110 00 Praha 1-Nové Město, Czechia", ["Czechia"])).toBe("Praha 1-Nové Město");
  });

  it("keeps the duplicate aiakce export disabled", () => {
    const aiakce = registry().sources.find((entry) => entry.id === "aiakce-ics");
    expect(aiakce?.enabled).toBe(false);
    expect(eventSourceHosts(registry())).toContain("api.lu.ma");
  });
});

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
      if (url.includes("api.lu.ma")) return new Response(LUMA, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8" } });
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
    expect(titles).toContain("AI STATUS: Budoucnost s roboty");
    expect(titles).not.toContain("Už v kalendáři");

    const aiakce = file.sources.find((source) => source.id === "aiakce");
    expect(aiakce?.known).toBe(1);
    const general = file.sources.find((source) => source.id === "confs-tech-general");
    expect(general?.error).toBeTruthy();
    expect(general?.accepted).toBe(0);
  });
});
