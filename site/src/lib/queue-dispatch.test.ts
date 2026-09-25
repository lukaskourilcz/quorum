import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub, type FakeGitHub } from "@/lib/admin-queue/fake-github";
import { dispatchSocialPublisher, type QueueDispatchRequest } from "./queue-dispatch";

const now = new Date("2026-09-26T08:00:00.000Z");
const open: QueueDispatchRequest = { persistence: "github", publishWindow: { notBefore: "2026-09-26T08:00:00.000Z", notAfter: "2026-09-26T09:00:00.000Z" }, now };
let github: FakeGitHub;

beforeEach(() => {
  github = fakeGitHub("/nonexistent");
  vi.stubGlobal("fetch", github.fetch);
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
  vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum");
  vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "main");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the publisher wake-up", () => {
  it("asks GitHub for one publishing run of social-publisher.yml and nothing else", async () => {
    const result = await dispatchSocialPublisher(open);
    expect(result).toEqual({ state: "dispatched", reason: "started", runUrl: "https://github.com/lukaskourilcz/quorum/actions/runs/42", detail: "The publisher runs within a few minutes." });
    expect(github.calls).toEqual([{
      method: "POST",
      path: "/repos/lukaskourilcz/quorum/actions/workflows/social-publisher.yml/dispatches",
      body: { ref: "main", inputs: { validate_only: "false" } },
      authorization: "Bearer test-token"
    }]);
  });

  it("accepts the 204 of the API versions before 2026-03-10, and drops a run URL that is not GitHub's", async () => {
    github.dispatchAnswer = { status: 204 };
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "dispatched", runUrl: null });
    github.dispatchAnswer = { status: 200, body: { workflow_run_id: 7, html_url: "https://example.com/phish" } };
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "dispatched", runUrl: null });
    github.dispatchAnswer = { status: 200, body: "not json at all" };
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "dispatched", runUrl: null });
  });

  it.each([
    [401, "refused", /Actions write permission/u],
    [403, "refused", /Actions write permission/u],
    [404, "not-found", /did not find the publisher workflow/u],
    [422, "rejected", /workflow on main does not accept it/u],
    [500, "remote", /could not start the publisher \(500\)/u]
  ] as const)("names GitHub's %i as a failed wake-up", async (status, reason, detail) => {
    github.dispatchAnswer = { status, body: { message: "Resource not accessible by personal access token" } };
    const result = await dispatchSocialPublisher(open);
    expect(result).toMatchObject({ state: "failed", reason, runUrl: null });
    expect(result.detail).toMatch(detail);
    expect(result.detail).not.toContain("personal access token");
  });

  it("answers an unreachable GitHub as a failed wake-up instead of throwing", async () => {
    github.dispatchAnswer = "network-error";
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "failed", reason: "unreachable" });
  });

  it("does not call GitHub when a run could not help or could not be authorised", async () => {
    expect(await dispatchSocialPublisher({ ...open, persistence: "filesystem" })).toMatchObject({ state: "skipped", reason: "local-checkout" });
    const later = await dispatchSocialPublisher({ ...open, publishWindow: { notBefore: "2026-09-26T16:00:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" } });
    expect(later).toMatchObject({ state: "skipped", reason: "window-not-open" });
    expect(later.detail).toContain("26 Sept, 18:00 Prague time");
    expect(await dispatchSocialPublisher({ ...open, now: new Date("2026-09-26T09:00:00.000Z") })).toMatchObject({ state: "skipped", reason: "window-closed" });
    vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum/../other");
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "failed", reason: "unconfigured" });
    vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum");
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    expect(await dispatchSocialPublisher(open)).toMatchObject({ state: "failed", reason: "unconfigured" });
    expect(github.calls).toEqual([]);
  });
});
