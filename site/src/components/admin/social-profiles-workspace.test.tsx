import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { readAdminSocialProfiles } from "@/lib/social-profiles/snapshot";
import { SocialProfilesWorkspace } from "./social-profiles-workspace";

const root = path.resolve(process.cwd(), "..");

describe("Social Profiles workspace", () => {
  it("renders separate real groups and honest unavailable values", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test", SOCIAL_KILL_SWITCH: "true" } });
    const venture = renderToStaticMarkup(<SocialProfilesWorkspace section="venture-profiles" snapshot={snapshot} />);
    const amplification = renderToStaticMarkup(<SocialProfilesWorkspace section="amplification-profiles" snapshot={snapshot} />);

    expect(venture).toContain("Venture Profiles · 6");
    expect(venture).toContain("Operational metrics");
    expect(venture).toContain("Unavailable");
    expect(venture).toContain("Door Money");
    expect(venture).not.toContain("Personal Growth");
    expect(venture).not.toContain("Kvórum");
    expect(amplification).toContain("Amplification Profiles · 0");
    expect(amplification).toContain("intentionally empty");
    expect(amplification).not.toContain("Simulation 01");
  });

  it("shows bounded detail with reference names and no secret values", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test", CAUGHT_UP_THREADS_ACCESS_TOKEN: "private-secret-value" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace profileId="social-profile-caught-up" section="venture-profiles" snapshot={snapshot} />);

    expect(html).toContain("data-social-profile-detail=\"social-profile-caught-up\"");
    expect(html).toContain("CAUGHT_UP_THREADS_ACCESS_TOKEN");
    expect(html).toContain("human-activation-required");
    expect(html).not.toContain("private-secret-value");
  });

  it("labels every explicit simulation and excludes them from real totals", async () => {
    const snapshot = await readAdminSocialProfiles(root, { includeSimulations: true, environment: { NODE_ENV: "test" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace section="activity-setup" snapshot={snapshot} />);

    expect(snapshot.simulations).toHaveLength(50);
    expect(html).toContain("Synthetic visual QA · excluded from totals");
    expect(html.match(/>simulation</gu)).toHaveLength(50);
    expect(html).toContain("Venture Profiles</p><p class=\"admin-tabular");
    expect(snapshot.ventureProfiles).toHaveLength(6);
  });
});
