import { describe, expect, it } from "vitest";
import {
  eventSection,
  parseDtsDate,
  projectCurrentRosterNames,
  projectEventBouts,
  projectScheduledEvents,
  selectScheduledEvents
} from "../src/fightaiq/wikipedia-events.js";

/**
 * Rows copied from the two live pages on 3 August 2026, because the parser's job is to read those
 * pages and a hand-written table would only prove it reads hand-written tables.
 *
 * The two are laid out differently, which is the point: "List of UFC events" has a Scheduled
 * events section whose columns start at Event, and Oktagon's year page has one table for the whole
 * year whose columns start at a row number.
 */

const UFC = `== Scheduled events ==
{| id="Scheduled events" class="sortable wikitable"
! scope="col" | Event
! scope="col" | Date
! scope="col" | Venue
! scope="col" | Location
! scope="col" | Ref.
|-
| [[UFC 333]]
| {{dts|2026|Oct|24}}
| [[Etihad Arena]]
| [[Abu Dhabi]], United Arab Emirates
| <ref>{{Cite web|url=https://example.test/a|title=x}}</ref>
|-
| [[UFC Fight Night: Gamrot vs. Salkilld]]
| {{dts|2026|Aug|8}}
| [[UFC Apex|Meta Apex]]
| [[Las Vegas]], Nevada, United States
|
|}`;

const OKTAGON = `== List of events ==
{| class="sortable wikitable"
! scope="col" | #
! scope="col" | Event
! scope="col" | Date
! scope="col" | Venue
! scope="col" | Location
|-
| align=center| 17
| Oktagon 99: Dortmund
| {{dts|2026|Dec|5}}
| [[Westfalenhalle]]
| [[Dortmund]], Germany
|-
| align=center| 16
| [[#Oktagon 100|Oktagon 100: Prague]]
| {{dts|2026|Dec|29}}
| [[O2 Arena (Prague)|O<sub>2</sub> Arena]]
| [[Prague]], Czech Republic
|-
| align=center| 1
| [[#Oktagon 82|Oktagon 82: Engizek vs. Jotko]]
| {{dts|2026|Jan|17}}
| [[PSD Bank Dome]]
| [[Düsseldorf]], Germany
|}`;

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("reading a scheduled card off Wikipedia", () => {
  it("takes the event from the column before the date, whatever precedes it", () => {
    // Picking the name by looking for a wikilink put a venue in the event column when a row's
    // name happened to be plain text, and the row number in when the row had no link at all.
    const events = projectScheduledEvents({
      wikitext: OKTAGON,
      org: "oktagon",
      sourceTitle: "2026 in Oktagon MMA",
      heading: null,
      now: NOW
    });
    expect(events.map((event) => event.name)).toEqual([
      "Oktagon 99: Dortmund",
      "Oktagon 100: Prague"
    ]);
    expect(events[0]!.venue).toBe("Westfalenhalle");
    expect(events[0]!.location).toBe("Dortmund, Germany");
  });

  it("drops a row whose date has already passed", () => {
    // Oktagon's table is the whole year, past and future together, so the date is what decides.
    const events = projectScheduledEvents({
      wikitext: OKTAGON,
      org: "oktagon",
      sourceTitle: "2026 in Oktagon MMA",
      heading: null,
      now: NOW
    });
    expect(events.some((event) => event.name.includes("Engizek"))).toBe(false);
  });

  it("reads the UFC table under its own heading and orders by date", () => {
    const events = projectScheduledEvents({
      wikitext: UFC,
      org: "ufc",
      sourceTitle: "List of UFC events",
      heading: "Scheduled events",
      now: NOW
    });
    expect(events.map((event) => event.name)).toEqual([
      "UFC Fight Night: Gamrot vs. Salkilld",
      "UFC 333"
    ]);
    // The piped label, not the target: readers know the Apex by the name on the page.
    expect(events[0]!.venue).toBe("Meta Apex");
    expect(events[0]!.startsAtUtc).toBe("2026-08-08T00:00:00.000Z");
  });

  it("returns nothing rather than guessing when the heading is absent", () => {
    expect(projectScheduledEvents({
      wikitext: UFC,
      org: "ufc",
      sourceTitle: "List of UFC events",
      heading: "Some section that is not there",
      now: NOW
    })).toEqual([]);
  });
});

describe("the date template", () => {
  it("reads both the month-name and month-number forms", () => {
    expect(parseDtsDate("{{dts|2026|Oct|24}}")).toBe("2026-10-24T00:00:00.000Z");
    expect(parseDtsDate("{{dts|2026|10|24}}")).toBe("2026-10-24T00:00:00.000Z");
  });

  it("answers null for a cell with no date, rather than a wrong one", () => {
    expect(parseDtsDate("[[Etihad Arena]]")).toBeNull();
    expect(parseDtsDate("{{dts|2026|Neveruary|24}}")).toBeNull();
  });
});

describe("the announced card on an event page", () => {
  const CARD = `== Fight card ==
{{MMAevent card|Fight card (Paramount+)}}
{{MMAevent bout
|Welterweight
|[[Islam Makhachev]] (c)
|vs.
|[[Ian Machado Garry]]
|
|
|
|
|For the [[UFC Welterweight Championship]].
}}
{{MMAevent bout
|Middleweight
|[[Mansur Abdul-Malik]]
|vs.
|[[Dustin Stoltzfus]]
|
|
|
|
|
}}`;

  it("reads the pairing, and drops the champion marker from the name", () => {
    const bouts = projectEventBouts(CARD);
    expect(bouts).toHaveLength(2);
    expect(bouts[0]).toMatchObject({
      division: "Welterweight",
      red: "Islam Makhachev",
      blue: "Ian Machado Garry",
      scheduledRounds: 5,
      title: true
    });
    // Not five because it is second, but because nothing marks it a title fight.
    expect(bouts[1]).toMatchObject({ red: "Mansur Abdul-Malik", scheduledRounds: 3, title: false });
  });

  it("scopes an Oktagon year page to one numbered event", () => {
    const year = `
== Oktagon 92: Previous ==
{{MMAevent bout|Lightweight|Wrong Red|vs.|Wrong Blue|||||}}
== Oktagon 93: Roušal vs. Mågård ==
===Fight card===
{{MMAevent bout|Featherweight|Radek Roušal|vs.|Jonas Mågård|||||}}
{{MMAevent bout|Light Heavyweight|Vojtech Garba|vs.|Robert Lau|||||}}
== Oktagon 94: Next ==
{{MMAevent bout|Welterweight|Later Red|vs.|Later Blue|||||}}`;
    const section = eventSection(year, "Oktagon 93: Roušal vs. Mågård");
    expect(section).toBeTruthy();
    expect(projectEventBouts(section ?? "").map((bout) => [bout.red, bout.blue])).toEqual([
      ["Radek Roušal", "Jonas Mågård"],
      ["Vojtech Garba", "Robert Lau"]
    ]);
  });
});

describe("the bounded card horizon", () => {
  it("keeps the nearest card from both promotions before filling by date", () => {
    const event = (org: "ufc" | "oktagon", name: string, day: string) => ({
      org,
      name,
      startsAtUtc: `${day}T00:00:00.000Z`,
      venue: null,
      location: null,
      sourceTitle: "fixture",
      pageTitle: null
    });
    const selected = selectScheduledEvents({
      events: [
        event("ufc", "UFC 1", "2026-08-15"),
        event("ufc", "UFC 2", "2026-08-22"),
        event("ufc", "UFC 3", "2026-08-29"),
        event("ufc", "UFC 4", "2026-09-05"),
        event("ufc", "UFC 5", "2026-09-12"),
        event("ufc", "UFC 6", "2026-09-19"),
        event("oktagon", "Oktagon 93", "2026-09-12")
      ],
      now: new Date("2026-08-09T12:00:00.000Z"),
      withinDays: 42,
      maxEvents: 6
    });
    expect(selected).toHaveLength(6);
    expect(selected.some((item) => item.org === "oktagon")).toBe(true);
    expect(selected.map((item) => item.name)).not.toContain("UFC 6");
  });
});

describe("who is currently on the roster", () => {
  it("reads the sortname template the page actually uses", () => {
    // Reading plain wikilinks instead found country codes and event links, matched 55 of 80
    // tracked fighters, and would have marked twenty-five current ones former — champions
    // among them. Checked against the live page before this was wired to anything.
    const names = projectCurrentRosterNames(
      "| {{sortname|Merab|Dvalishvili}} || x\n| {{sortname|Ian|Machado Garry|Ian Garry}} || y\n| [[UFC 323|December 6, 2025]]"
    );
    expect(names.has("Merab Dvalishvili")).toBe(true);
    expect(names.has("Ian Machado Garry")).toBe(true);
    expect(names.has("Ian Garry"), "the article title when it differs from the display name").toBe(true);
    expect(names.has("UFC 323"), "an event link is not a fighter").toBe(false);
  });
});
