import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { readAdminSocialProfiles } from "@/lib/social-profiles/snapshot";
import { parseSocialCampaign } from "@/lib/social-profiles/campaign-model";
import { campaignTargetApprovalHash } from "@/lib/social-profiles/campaign-projection";
import { SocialProfilesWorkspace } from "./social-profiles-workspace";

const root = path.resolve(process.cwd(), "..");

describe("Social Profiles workspace", () => {
  it("renders separate real groups and honest unavailable values", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test", SOCIAL_KILL_SWITCH: "true" } });
    const venture = renderToStaticMarkup(<SocialProfilesWorkspace section="venture-profiles" snapshot={snapshot} />);
    const amplification = renderToStaticMarkup(<SocialProfilesWorkspace section="amplification-profiles" snapshot={snapshot} />);

    expect(venture).toContain("Venture Profiles · 6");
    expect(venture).toContain("Operational results");
    expect(venture).toContain("Unavailable");
    expect(venture).toContain("Door Money");
    expect(venture).not.toContain("Personal Growth");
    expect(venture).not.toContain("Kvórum");
    expect(amplification).toContain("Amplification Profiles · 0");
    expect(amplification).toContain("intentionally empty");
    expect(amplification).not.toContain("Simulation 01");
    expect(venture).toContain(">Campaigns<");
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

  it("renders an honest optional Network without turning the benchmark into progress", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace section="network" snapshot={snapshot} />);
    expect(html).toContain("Planning benchmark");
    expect(html).toContain("Recorded relationships");
    expect(html).toContain("No Network relationships");
    expect(html).toContain("never sends");
    expect(snapshot.network.benchmark).toEqual({ target: 50, actual: 0, optedInOrActive: 0, fabricatedProgress: false });
  });

  it("renders the direct core and optional provider postures without secrets or failover authority", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test", CAUGHT_UP_THREADS_ACCESS_TOKEN: "private-secret-value" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace section="providers" snapshot={snapshot} />);
    expect(html).toContain("Providers &amp; automation health");
    expect(html).toContain("Direct Meta");
    expect(html).toContain("direct-core");
    expect(html).toContain("Buffer");
    expect(html).toContain("optional-held");
    expect(html).toContain("No provider delivery evidence");
    expect(html).toContain("never trigger automatic failover");
    expect(html).not.toContain("private-secret-value");
    expect(snapshot.providerControl.summary).toEqual({ directCoreAvailable: true, activeBindings: 0, heldBindings: 6, ambiguousReceipts: 0 });
  });

  it("renders canonical Content runway constitutions without queue or publishing controls", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace profileId="social-profile-caught-up" section="content-runway" snapshot={snapshot} />);

    expect(html).toContain("Profile constitutions · 6");
    expect(html).toContain("data-social-runway-detail=\"social-profile-caught-up\"");
    expect(html).toContain("Deterministic first");
    expect(html).toContain("Design Lab");
    expect(html).toContain("No inventory candidates");
    expect(html).toContain("No inventory build receipt");
    expect(html).toContain("exposes no queue, publish, account activation or routine-scope action");
    expect(snapshot.contentRunway.summary).toEqual({ strategies: 6, healthy: 0, lowOrNoRunway: 0, unavailable: 6, actualCostUsd: 0 });
    expect(snapshot.contentRunway).toMatchObject({ authorityGranted: false, queueAuthorized: false, publishingAuthorized: false });
  });

  it("renders the Prague-day receipt surface with explicit draft-only authority", async () => {
    const snapshot = await readAdminSocialProfiles(root, { now: new Date("2026-08-28T08:00:00.000Z"), environment: { NODE_ENV: "test" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace section="today" snapshot={snapshot} />);
    expect(html).toContain("Today · 2026-08-28");
    expect(html).toContain("No daily operation receipts");
    expect(html).toContain("No countersigned routine scopes");
    expect(html).toContain("Do not force filler");
    expect(html).toContain("None bypasses #409 publishing");
    expect(snapshot.today).toMatchObject({ authorityGranted: false, publishingAuthorized: false });
  });

  it("renders separate truthful Results tables without charts, identities or spend controls", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    const html = renderToStaticMarkup(<SocialProfilesWorkspace section="results" snapshot={snapshot} />);

    expect(html).toContain("Venture Profile results · 0");
    expect(html).toContain("Amplification Profile results · 0");
    expect(html).toContain("No Campaign result sets");
    expect(html).toContain("Unavailable; no winner is declared");
    expect(html).toContain("At most two may be live");
    expect(html).toContain("No organic result has created a proposal");
    expect(html).not.toMatch(/visitor id|audience identity list|private message body|purchase now|boost now/iu);
    expect(snapshot.socialResults).toMatchObject({ audienceIdentityExposed: false, privateMessagesExposed: false, spendAuthorized: false });
  });

  it("renders campaign gates, immutable bindings and safe actions without fake results", async () => {
    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    const fixture = JSON.parse(await readFile(path.join(root, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
    const campaign = parseSocialCampaign(fixture.campaign); expect(campaign).not.toBeNull(); if (!campaign) return;
    snapshot.campaigns = [{ campaign, immutableStatus: campaign.status, appliedEvents: 0, rejectedEvents: 0, targetApprovalHashes: Object.fromEntries(campaign.targets.map((target) => [target.id, campaignTargetApprovalHash(campaign.channelItems.filter((item) => item.targetId === target.id))])), operationalResults: null }];
    const html = renderToStaticMarkup(<SocialProfilesWorkspace campaignId={campaign.id} section="campaigns" snapshot={snapshot} />);
    expect(html).toContain(`data-social-campaign-detail="${campaign.id}"`);
    expect(html).toContain("Hard gates run before scoring");
    expect(html).toContain("needs-owner-review");
    expect(html).toContain("cannot publish");
    expect(html).toContain("Results: manual-only");
    expect(html).not.toMatch(/like account|follow account|comment on|Contest Radar candidate/iu);
  });
});
