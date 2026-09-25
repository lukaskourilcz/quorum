import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyQueueAction } from "./actions";
import { fakeGitHub, type FakeGitHub } from "./fake-github";
import { DRAFT_FILE, queueFixtureRoot, readQueueFixture } from "./fixture-root";
import { QueueActionError } from "./store";

/**
 * quorum#574: an approval saved on GitHub wakes the social publisher; nothing else does. The
 * whole deployed path runs against a fake GitHub — the Contents API the Queue writes through and
 * the workflow dispatch — so the test sees what was sent, in which order, and what the owner reads.
 */
const now = new Date("2026-09-26T08:00:00.000Z");
const ITEM = "ms-2026-09-26-devshark-en-linkedin";
const ITEM_PATH = `/repos/lukaskourilcz/quorum/contents/state/social/queue/${DRAFT_FILE}`;
const roots: string[] = [];
let root = "";
let hash = "";
let github: FakeGitHub;

async function useRoot(options: { capabilityEdge?: boolean } = {}): Promise<void> {
  root = await queueFixtureRoot(options);
  roots.push(root);
  github = fakeGitHub(root);
  vi.stubGlobal("fetch", github.fetch);
}

async function stored(): Promise<{ status: string; approvalProvenance: { approvalRef: string } }> {
  return JSON.parse(await readFile(path.join(root, "state/social/queue", DRAFT_FILE), "utf8")) as { status: string; approvalProvenance: { approvalRef: string } };
}

beforeEach(async () => {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
  vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum");
  vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "main");
  vi.stubEnv("NODE_ENV", "production");
  await useRoot();
  hash = ((await readQueueFixture()).content as { contentHash: string }).contentHash;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("an approval wakes the publisher", () => {
  it("dispatches social-publisher.yml once, after the approved item is saved on GitHub", async () => {
    const result = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "now" }, { root, now });
    expect(result).toMatchObject({
      changed: true,
      persistence: "github",
      event: { action: "approve", nextStatus: "queued" },
      dispatch: { state: "dispatched", reason: "started", runUrl: "https://github.com/lukaskourilcz/quorum/actions/runs/42" }
    });
    expect(result.message).toBe("Queued. The publisher runs within a few minutes. It sends the post only while its LinkedIn connection and channel are live.");
    expect(github.dispatches()).toEqual([expect.objectContaining({ method: "POST", body: { ref: "main", inputs: { validate_only: "false" } }, authorization: "Bearer test-token" })]);
    // The run checks out the branch, so the wake-up must come after the item it should find.
    const itemWrite = github.calls.findIndex((call) => call.method === "PUT" && call.path === ITEM_PATH);
    const dispatch = github.calls.findIndex((call) => call.path.endsWith("/dispatches"));
    expect(itemWrite).toBeGreaterThan(-1);
    expect(dispatch).toBe(github.calls.length - 1);
    expect(dispatch).toBeGreaterThan(itemWrite);
    expect((await stored()).status).toBe("queued");
  });

  it("dispatches for an approval for the window too, once the window is open", async () => {
    const result = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "window" }, { root, now });
    expect(result.dispatch).toMatchObject({ state: "dispatched" });
    expect(result.message).toMatch(/^Queued for its window\. The publisher runs within a few minutes\./u);
    expect(github.dispatches()).toHaveLength(1);
  });

  it.each([
    ["hold", { reason: "Not this week." }],
    ["reject", { reason: "The hook promises more than slide two delivers." }],
    ["edit", { edits: { caption: "Which selector wins: .card p or p.note? Count it.", altText: null } }]
  ] as const)("does not dispatch on %s", async (action, extra) => {
    const result = await applyQueueAction({ action, itemId: ITEM, expectedContentHash: hash, ...extra }, { root, now });
    expect(result).toMatchObject({ changed: true, persistence: "github", dispatch: null });
    expect(github.calls.some((call) => call.method === "PUT")).toBe(true);
    expect(github.dispatches()).toEqual([]);
  });

  it("dispatches nothing when the approval is refused or conflicts", async () => {
    const conflict = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: "f".repeat(64), mode: "now" }, { root, now }).catch((error: unknown) => error);
    expect(conflict).toMatchObject({ code: "CONFLICT" });
    await useRoot({ capabilityEdge: false });
    const refused = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "now" }, { root, now }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(QueueActionError);
    expect(refused).toMatchObject({ code: "REFUSED" });
    expect(github.dispatches()).toEqual([]);
  });
});

describe("a failed wake-up", () => {
  it("keeps the approval, leaves the item queued and says so in the action response", async () => {
    github.dispatchAnswer = { status: 403, body: { message: "Resource not accessible by personal access token" } };
    const result = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "now" }, { root, now });
    expect(result).toMatchObject({ changed: true, event: { nextStatus: "queued" }, dispatch: { state: "failed", reason: "refused", runUrl: null } });
    expect(result.message).toBe(
      "Queued, but the publisher did not start. GitHub refused to start the publisher (403); the token needs the Actions write permission listed in NEEDED.md. The post stays queued: the next approval, or a run of the publisher from GitHub Actions, sends it inside its window."
    );
    expect((await stored()).status).toBe("queued");
    expect(await readdir(path.join(root, "state/social/queue-events"))).toHaveLength(1);
  });

  it("is retried by approving the same copy again, which records nothing new", async () => {
    github.dispatchAnswer = "network-error";
    const first = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "now" }, { root, now });
    expect(first.dispatch).toMatchObject({ state: "failed", reason: "unreachable" });
    github.dispatchAnswer = { status: 204 };
    const again = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "now" }, { root, now: new Date("2026-09-26T08:05:00.000Z") });
    expect(again).toMatchObject({ changed: false, dispatch: { state: "dispatched", runUrl: null } });
    expect(again.message).toMatch(/^This approval was already recorded\. The publisher runs within a few minutes\./u);
    expect(github.dispatches()).toHaveLength(2);
    expect(await readdir(path.join(root, "state/social/queue-events"))).toHaveLength(1);
  });
});

describe("an approval saved to a local checkout", () => {
  it("never calls GitHub, because the publisher would not see it", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    vi.stubEnv("NODE_ENV", "test");
    const result = await applyQueueAction({ action: "approve", itemId: ITEM, expectedContentHash: hash, mode: "window" }, { root, now });
    expect(result).toMatchObject({ persistence: "filesystem", dispatch: { state: "skipped", reason: "local-checkout", runUrl: null } });
    expect(result.message).toBe("Queued for its window. It was saved to this checkout rather than to GitHub, so the publisher, which reads GitHub, was not started.");
    expect(github.calls).toEqual([]);
  });
});
