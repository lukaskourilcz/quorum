import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { readAdminPersonalGrowth, type PersonalGrowthCoreTab } from "@/lib/admin-personal-growth";
import { PersonalGrowthPanel } from "./personal-growth-panel";

const tabs: PersonalGrowthCoreTab[] = ["results", "experiments", "voice-strategy", "budget"];

describe("Personal Growth analysis Admin panels", () => {
  it("renders all four responsive, keyboard-operable destinations without private content or elevated authority", async () => {
    const snapshot = await readAdminPersonalGrowth(path.resolve(process.cwd(), ".."), new Date("2026-08-27T08:00:00.000Z"));
    const html = renderToStaticMarkup(<>{tabs.map((tab) => <PersonalGrowthPanel key={tab} snapshot={snapshot} tab={tab} />)}</>);
    for (const tab of tabs) expect(html).toContain(`data-personal-growth-tab="${tab}"`);
    expect(html).toContain("7 days");
    expect(html).toContain("28 days");
    expect(html).toContain("90 days");
    expect(html).toContain("Two-live-experiment ceiling");
    expect(html).toContain("Source / title hashes");
    expect(html).toContain("Authorised allocation");
    expect(html).toContain("Record owner-supplied result");
    expect(html).toContain("Append policy revision");
    expect(html).toContain("cannot be raised here");
    expect(html).toContain("Purchase and publishing authority are both absent.");
    expect(html).not.toContain("portfolio allowlist");
    expect(html.toLowerCase()).not.toContain("kvorum");
    expect(html.toLowerCase()).not.toContain("private-personal-growth-journal");
  });
});
