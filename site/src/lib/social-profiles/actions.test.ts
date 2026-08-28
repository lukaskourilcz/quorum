import { cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applySocialProfileAdminAction, parseSocialProfileAdminAction, SocialProfileActionError } from "./actions";
import { parseSocialProfileEvent } from "./model";

const roots: string[] = [];
const repositoryRoot = path.resolve(process.cwd(), "..");

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-profile-action-")); roots.push(root);
  await mkdir(path.join(root, "config"), { recursive: true });
  await cp(path.join(repositoryRoot, "config/social-publisher-registry.json"), path.join(root, "config/social-publisher-registry.json"));
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Social Profiles lifecycle writer", () => {
  it("appends one validated owner event and makes an identical retry idempotent", async () => {
    const root = await fixtureRoot(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const action = { type: "pause-profile", profileId: "social-profile-door-money", connectionId: null, reason: "Hold setup while the owner reviews the account decision." };
    const first = await applySocialProfileAdminAction(action, { root, now: new Date("2026-08-27T12:00:00.000Z") });
    const retry = await applySocialProfileAdminAction(action, { root, now: new Date("2026-08-27T13:00:00.000Z") });
    const files = await readdir(path.join(root, "state/social/profile-events"));
    const stored = parseSocialProfileEvent(JSON.parse(await readFile(path.join(root, "state/social/profile-events", files[0]!), "utf8")) as unknown);

    expect(first).toMatchObject({ changed: true, persistence: "filesystem", event: { action: "paused", actor: "owner" } });
    expect(retry).toMatchObject({ changed: false, event: { eventId: first.event.eventId } });
    expect(files).toHaveLength(1);
    expect(stored).toMatchObject({ profileId: action.profileId, reason: action.reason });
  });

  it("binds connection actions and refuses mismatches, extra fields and sensitive reasons", async () => {
    const root = await fixtureRoot(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const action = { type: "request-reauthorisation", profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", reason: "Owner requests a manual reauthorisation review." };
    await expect(applySocialProfileAdminAction(action, { root })).resolves.toMatchObject({ event: { action: "reauthorisation-requested" } });
    await expect(applySocialProfileAdminAction({ ...action, profileId: "social-profile-mma-files" }, { root })).rejects.toMatchObject({ code: "REFUSED" });
    expect(parseSocialProfileAdminAction({ ...action, liveEligible: true })).toBeNull();
    expect(parseSocialProfileAdminAction({ ...action, reason: "Bearer secret-value" })).toBeNull();
  });

  it("fails closed in production without canonical GitHub persistence", async () => {
    const root = await fixtureRoot(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    await expect(applySocialProfileAdminAction({ type: "request-setup", profileId: "social-profile-door-money", connectionId: null, reason: "Request the bounded owner setup checklist." }, { root })).rejects.toEqual(expect.objectContaining<Partial<SocialProfileActionError>>({ code: "UNCONFIGURED" }));
  });
});
