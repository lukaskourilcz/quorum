import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TehdejsiSvetSignalsPanel, type AdminTehdejsiSignalsView } from "./tehdejsi-svet-signals-panel";

const view: AdminTehdejsiSignalsView = {
  digests: [{
    id: "signal-fixture-sunday-tram",
    recordedAt: "2026-08-16T10:00:00.000Z",
    sourceLabel: "Owner-pasted synthetic comments",
    recollections: ["A fictional reader remembered waiting beside the last tram stop."]
  }],
  themes: [{ label: "last tram home", recurrence: 3, lastSeenAt: "2026-08-16T10:00:00.000Z" }],
  requests: [{ kind: "city", value: "Synthetic Brno district", recurrence: 4, lastSeenAt: "2026-08-16T10:00:00.000Z" }],
  insights: [{
    id: "insight-fixture-map-gap",
    title: "Synthetic map gap",
    status: "proposed",
    proposedAction: "Ask the owner to review a fictional missing district before any product change.",
    evidenceCount: 2
  }],
  unreadable: 1,
  pendingHarvests: 2
};

describe("Tehdejsi svet signals panel", () => {
  it("renders bounded community memory, recurrence and the owner-controlled insight queue", () => {
    const html = renderToStaticMarkup(<TehdejsiSvetSignalsPanel view={view} />);

    expect(html).toContain("Community memory");
    expect(html).toContain("Owner-pasted synthetic comments");
    expect(html).toContain("Recollection · not a fact");
    expect(html).toContain("last tram home");
    expect(html).toContain("3 mentions");
    expect(html).toContain("Synthetic Brno district");
    expect(html).toContain("Repeated 4");
    expect(html).toContain("Product insight queue");
    expect(html).toContain("Synthetic map gap");
    expect(html).toContain("1 malformed signal record");
    expect(html).toContain("2 awaiting Sunday");
  });

  it("renders honest missing states with only the owner-paste writer", () => {
    const html = renderToStaticMarkup(<TehdejsiSvetSignalsPanel />);

    expect(html).toContain("No owner-pasted community memory is recorded.");
    expect(html).toContain("No themes have been extracted");
    expect(html).toContain("No recurring city, year or correction request is recorded.");
    expect(html).toContain("No product insight is recorded.");
    expect(html).toContain("never scrapes comments or calls a platform API");
    expect(html).toContain("Paste comment harvest");
    expect(html).toContain("Record recollections");
    expect(html).toContain("research prompts, never facts");
    expect(html).not.toContain("/admin/api/tehdejsi-svet/signals");
  });
});
