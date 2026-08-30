import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTEST_TABS, ContestRadarPanel, resolveContestTab } from "./contest-radar-panel";
import type { AdminContestRadarSnapshot, ContestAdminRow } from "@/lib/admin-contest-radar";

const stated = (value: string | number | boolean) => ({ value, confidence: "stated", unavailableReason: null });
const absent = (reason: string) => ({ value: null, confidence: null, unavailableReason: reason });

function row(over: Partial<ContestAdminRow> = {}): ContestAdminRow {
  return {
    id: "cr-1",
    title: "Vyhrajte zmrzlinovač",
    canonicalUrl: "https://esutaze.sk/zmrzlinovac",
    organizer: null,
    track: "consumer",
    kind: "sweepstakes",
    language: "sk",
    lifecycle: "open",
    readiness: "needs-detail",
    readinessReasons: ["Rules page unread."],
    legitimacy: "unverified",
    deadline: stated("2026-09-15"),
    prizeDescription: stated("Ninja 7v1"),
    prizeValue: absent("not-stated"),
    currency: absent("not-stated"),
    purchaseRequired: absent("requires-owner-check"),
    mechanics: ["like"],
    effortTier: "minutes",
    effortBasis: "One mechanic.",
    conflicts: [],
    sourceCount: 1,
    firstSeenAt: "2026-08-30T06:00:00.000Z",
    lastSeenAt: "2026-08-30T06:00:00.000Z",
    lockedFields: [],
    ...over
  };
}

const SNAPSHOT: AdminContestRadarSnapshot = {
  recordsState: "present",
  records: [row()],
  runsState: "present",
  runs: [{
    date: "2026-08-30",
    outcome: "success",
    reason: "9 records from 3 sources.",
    candidates: 9,
    records: 9,
    cacheReused: 0,
    modelCalls: 0,
    modelUsd: 0,
    apifyUsd: 0,
    sources: [],
    nextSafeAction: "Review the ranked list. Nothing is entered automatically."
  }],
  ownerEventsState: "missing",
  ownerEvents: [],
  sourcesState: "present",
  sources: [{
    id: "vyhrat-sk",
    name: "Vyhrat.sk",
    track: "consumer",
    type: "html",
    host: "www.vyhrat.sk",
    verdict: "rejected",
    verdictReason: "The listing redirects to a login page.",
    discoveryOnly: false,
    lastVerifiedOn: "2026-08-30",
    verificationDueOn: "2026-11-30"
  }],
  authority: { foundingCountersigned: true, paidPathsHeld: true },
  unreadable: 0,
  snapshotHash: "a".repeat(64)
};

function render(snapshot: AdminContestRadarSnapshot, tab: (typeof CONTEST_TABS)[number]): string {
  return renderToStaticMarkup(<ContestRadarPanel snapshot={snapshot} tab={tab} />);
}

describe("the Soutěžní radar workspace", () => {
  it("leads with what is worth an evening and says the system enters nothing", () => {
    const html = render(SNAPSHOT, "today");

    expect(html).toContain("Vyhrajte zmrzlinovač");
    expect(html).toContain("2026-09-15");
    expect(html).toContain("never enters, submits, follows, comments, buys or claims");
  });

  it("has no enter, submit or claim control anywhere", () => {
    const html = CONTEST_TABS.map((tab) => render(SNAPSHOT, tab)).join(" ");

    // The founding decision's line, enforced by there being nothing to click.
    expect(html).not.toMatch(/<button[^>]*>\s*(?:Enter|Submit|Claim|Vstoupit)/iu);
    expect(html).not.toMatch(/<form\b/u);
  });

  it("shows an unstated fact as its reason rather than as a blank or a zero", () => {
    const html = render({
      ...SNAPSHOT,
      records: [row({ prizeDescription: absent("not-stated"), deadline: absent("unparseable") })]
    }, "today");

    // "not stated" and "unparseable" send the owner to different places; a blank sends them nowhere.
    expect(html).toContain("not stated");
    expect(html).toContain("unparseable");
    expect(html).toContain("check the rules");
  });

  it("sorts a purchase-required contest below a free one", () => {
    const html = render({
      ...SNAPSHOT,
      records: [
        row({ id: "cr-paid", title: "Paid entry", purchaseRequired: stated(true), deadline: stated("2026-08-31") }),
        row({ id: "cr-free", title: "Free entry", deadline: stated("2026-12-01") })
      ]
    }, "today");

    // Even closing sooner, the purchase-required one is below: the system will not buy the product.
    expect(html.indexOf("cr-free")).toBeLessThan(html.indexOf("cr-paid"));
    expect(html).toContain("purchase required");
  });

  it("flags a record whose sources disagree instead of picking one", () => {
    const html = render({
      ...SNAPSHOT,
      records: [row({ conflicts: [{ field: "dates.deadline", values: ["2026-09-15", "2026-09-30"] }] })]
    }, "today");

    expect(html).toContain("sources disagree");
  });

  it("shows a rejected source with the reason the site gave", () => {
    const html = render(SNAPSHOT, "sources");

    expect(html).toContain("rejected");
    expect(html).toContain("redirects to a login page");
    expect(html).toContain("nothing here works around a login page or a bot check");
  });

  it("says a venture with no records is waiting rather than broken", () => {
    const html = render({ ...SNAPSHOT, records: [], recordsState: "missing" }, "today");

    expect(html).toContain("No contests on file yet");
    expect(html).toContain("paid path stays held");
  });

  it("reports unreadable records as a count and never as a path", () => {
    const html = render({ ...SNAPSHOT, unreadable: 3 }, "today");

    expect(html).toContain("3 records were dropped");
    expect(html).not.toContain(".json");
  });

  it("falls an unknown bookmark back to today", () => {
    expect(resolveContestTab(undefined)).toBe("today");
    expect(resolveContestTab("nonsense")).toBe("today");
    expect(resolveContestTab("sources")).toBe("sources");
  });
});
