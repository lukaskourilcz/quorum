import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WEBDEV_TABS, WebDevSignalPanel, resolveWebDevTab, webDevTabLabel } from "./webdev-signal-panel";
import type { AdminWebDevSignalSnapshot, WebDevAdminDay } from "@/lib/admin-webdev-signal";

const DAY: WebDevAdminDay = {
  date: "2026-08-12",
  provenance: "fixture",
  outcome: "selected",
  reason: "Chrome shipped a change every reader has to act on.",
  selectedRecordId: "rec-1",
  scoreMargin: { value: 0.21, unavailableReason: null },
  confidence: { value: 0.83, unavailableReason: null },
  ownerOverride: false,
  goviral: { status: "used", changedWinner: false },
  sources: { configured: 12, attempted: 12, healthy: 11, failed: 1, authorityClassesCovered: 2, layoutChanges: 0 },
  candidates: { fetched: 40, afterPrefilter: 28, duplicatesCollapsed: 4, held: 14, eligible: 6 },
  editions: [
    { locale: "cs", state: "valid", holdReasons: [], claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" },
    { locale: "en", state: "held", holdReasons: ["Awaiting a source-attribution fix."], claimParity: "pass", accessibility: "unavailable", renderState: "held", deliveryState: "absent" }
  ],
  corrections: { opened: 0, resolved: 0, factualIncidents: 0, securityVersionIncidents: 0 },
  cost: { modelCalls: 0, providerCostUsd: 0, cacheReused: 8, callsAvoided: 2 },
  evidenceRefs: ["state/ventures/webdev-signal/runs/2026-08-12.json"],
  snapshotHash: "a".repeat(64)
};

const SNAPSHOT: AdminWebDevSignalSnapshot = {
  observationsState: "present",
  days: [DAY],
  baselineState: "missing",
  baseline: null,
  profilesState: "present",
  profiles: [
    { id: "social-profile-webdev-signal-cs", displayLabel: "WebDev Signal CZ", locale: "cs", lifecycle: "proposed", liveEligible: false, connections: [] }
  ],
  authority: { foundingCountersigned: true, liveBehaviourHeld: true, accountsCreated: false },
  unreadable: 0,
  snapshotHash: "b".repeat(64)
};

function render(snapshot: AdminWebDevSignalSnapshot, tab: (typeof WEBDEV_TABS)[number]): string {
  return renderToStaticMarkup(<WebDevSignalPanel snapshot={snapshot} tab={tab} />);
}

describe("the WebDev Signal workspace", () => {
  it("answers the operational question on the tab that leads", () => {
    const html = render(SNAPSHOT, "today");

    expect(html).toContain("Edition selected");
    expect(html).toContain("Chrome shipped a change");
    // Both editions on the first screen, because one being held is the thing worth seeing.
    expect(html).toContain("Czech");
    expect(html).toContain("English");
  });

  it("shows a held locale rather than hiding it behind the valid one", () => {
    const html = render(SNAPSHOT, "edition-en");

    expect(html).toContain("Awaiting a source-attribution fix.");
    expect(html).toContain("held");
  });

  it("says a NO_EDITION day is the desk refusing filler", () => {
    const html = render({
      ...SNAPSHOT,
      days: [{ ...DAY, outcome: "NO_EDITION", editions: [], scoreMargin: { value: null, unavailableReason: "no-edition-day" } }]
    }, "today");

    expect(html).toContain("No edition today");
    expect(html).toContain("refusing filler");
  });

  it("gives a missing measure its reason instead of a bare word", () => {
    const html = render({
      ...SNAPSHOT,
      days: [{ ...DAY, scoreMargin: { value: null, unavailableReason: "no-edition-day" } }]
    }, "decision");

    expect(html).toContain("no edition day");
  });

  it("says a venture that has never run is waiting, not broken", () => {
    const html = render({ ...SNAPSHOT, observationsState: "missing", days: [] }, "today");

    expect(html).toContain("has not run a day yet");
    expect(html).toContain("owner creates the four Instagram and Threads accounts");
  });

  it("names the connection each profile does not have", () => {
    const html = render(SNAPSHOT, "delivery");

    expect(html).toContain("None — the owner creates the account");
    expect(html).toContain("Nothing in this workspace posts");
  });

  it("reports unreadable records as a count and never as a path", () => {
    const html = render({ ...SNAPSHOT, unreadable: 2 }, "today");

    expect(html).toContain("2 records were dropped as unreadable");
    expect(html).not.toContain(".json");
  });

  it("falls an unknown bookmark back to the tab that answers the question", () => {
    expect(resolveWebDevTab(undefined)).toBe("today");
    expect(resolveWebDevTab("nonsense")).toBe("today");
    expect(resolveWebDevTab("results")).toBe("results");
  });

  it("labels every tab it declares", () => {
    for (const tab of WEBDEV_TABS) expect(webDevTabLabel(tab).length).toBeGreaterThan(0);
  });
});
