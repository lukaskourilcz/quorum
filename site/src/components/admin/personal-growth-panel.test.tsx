import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

import { readAdminPersonalGrowth, type PersonalGrowthCoreTab } from "@/lib/admin-personal-growth";
import { PersonalGrowthOverview, PersonalGrowthPanel } from "./personal-growth-panel";

const tabs: PersonalGrowthCoreTab[] = ["today", "timeline", "threads", "instagram", "reels", "trend-radar"];

describe("Personal Growth core Admin panels", () => {
  it("server-renders the overview and all six isolated, bookmarkable views", async () => {
    const snapshot = await readAdminPersonalGrowth(path.resolve(process.cwd(), ".."), new Date("2026-08-27T08:00:00.000Z"));
    const html = renderToStaticMarkup(
      <>
        <PersonalGrowthOverview snapshot={snapshot} />
        {tabs.map((tab) => <PersonalGrowthPanel key={tab} snapshot={snapshot} tab={tab} />)}
      </>
    );

    expect(html).toContain("data-personal-growth-overview");
    for (const tab of tabs) expect(html).toContain(`data-personal-growth-tab="${tab}"`);
    expect(html).toContain("What should I do next?");
    expect(html).toContain("Thirty-day owner timeline");
    expect(html).toContain("Public conversation opportunities");
    expect(html).toContain("Strategic recommendation");
    expect(html).toContain("Bounded GoVIRAL packet");
    expect(html).toContain("Publishing, replying and purchases remain disabled.");
    expect(html).not.toContain("portfolio bridge");
    expect(html.toLowerCase()).not.toContain("kvorum");
    expect(html.toLowerCase()).not.toContain("manuscript");
  });
});
