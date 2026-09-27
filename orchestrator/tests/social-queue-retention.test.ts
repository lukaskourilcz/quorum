import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { SocialQueueRetentionSchema } from "../src/contracts/social-queue-retention.js";
import { sha256 } from "../src/hashing.js";
import { repoRoot } from "../src/paths.js";
import { SOCIAL_QUEUE_RETENTION_DAYS, pruneSocialQueue } from "../src/social/queue-retention.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-queue-retention-"));
  roots.push(root);
  return root;
}

async function put(root: string, relative: string, value: unknown): Promise<string> {
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), text);
  return text;
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

const HASH = "a".repeat(64);

const base = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/social-queue-item-v2-approved.valid.json"), "utf8")) as Record<string, unknown>;

/** The committed v2 fixture with only the fields retention reads changed. */
function item(id: string, status: string, day: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(base),
    id,
    status,
    publishWindow: { notBefore: `${day}T08:00:00.000Z`, notAfter: `${day}T20:00:00.000Z` },
    createdAt: `${day}T06:00:00.000Z`,
    attempt: null,
    ...extra
  };
}

function event(itemId: string, at: string, action: "hold" | "edit", supersedingItemId: string | null = null): Record<string, unknown> {
  return {
    schemaVersion: "social-queue-event/1",
    id: `social-queue-event-${sha256(`${itemId}${at}${action}`).slice(0, 24)}`,
    at,
    actor: "owner",
    action,
    itemId,
    sourceVentureId: "marketingshark",
    channel: "linkedin",
    expectedContentHash: HASH,
    previousStatus: "draft",
    nextStatus: "cancelled",
    resultingContentHash: action === "edit" ? "b".repeat(64) : null,
    mode: null,
    publishWindow: null,
    deterministicChecks: null,
    ownerEvidenceFor: [],
    supersedingItemId,
    changedFields: action === "edit" ? ["caption"] : [],
    reason: action === "hold" ? "Not this week." : null,
    tasteNote: null
  };
}

function eventFile(itemId: string, at: string, action: string): string {
  return `social/queue-events/${at.replace(/[:.]/gu, "-")}-${itemId}-${action}.json`;
}

describe("closed queue items leave state/social after ninety days", () => {
  it("keeps the same ninety days as the frames", () => {
    expect(SOCIAL_QUEUE_RETENTION_DAYS).toBe(90);
  });

  it("removes closed items last active before the window with their events, hashing each first", async () => {
    const state = await tempState();
    const old = {
      published: await put(state, "social/queue/2026-06-01-devshark-en-linkedin.json", item("2026-06-01-devshark-en-linkedin", "published", "2026-06-01")),
      cancelled: await put(state, "social/queue/2026-06-02-devshark-en-linkedin.json", item("2026-06-02-devshark-en-linkedin", "cancelled", "2026-06-02")),
      expired: await put(state, "social/queue/2026-06-03-devshark-en-linkedin.json", item("2026-06-03-devshark-en-linkedin", "expired", "2026-06-03")),
      failed: await put(state, "social/queue/2026-06-04-devshark-en-linkedin.json", item("2026-06-04-devshark-en-linkedin", "failed", "2026-06-04"))
    };
    const holdEvent = await put(state, eventFile("2026-06-02-devshark-en-linkedin", "2026-06-02T09:00:00.000Z", "hold"), event("2026-06-02-devshark-en-linkedin", "2026-06-02T09:00:00.000Z", "hold"));
    // Open, or closed within the window: all stay.
    await put(state, "social/queue/2026-06-05-devshark-en-linkedin.json", item("2026-06-05-devshark-en-linkedin", "draft", "2026-06-05"));
    await put(state, "social/queue/2026-06-06-devshark-en-linkedin.json", item("2026-06-06-devshark-en-linkedin", "needs_reconciliation", "2026-06-06"));
    await put(state, "social/queue/2026-06-27-devshark-en-linkedin.json", item("2026-06-27-devshark-en-linkedin", "published", "2026-06-27"));
    await put(state, "social/queue/README.md", "not an item");
    // A receipt is never touched.
    await put(state, "social/posts/2026-06-01-devshark-en-linkedin.json", { schemaVersion: "social-post-receipt/1" });

    const { record, artifacts } = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });

    expect(artifacts).toEqual(["social/queue-retention/2026-09-25.json"]);
    expect(record).toMatchObject({ keepFrom: "2026-06-27", retentionDays: 90, keptItems: 3, keptEvents: 0, heldByLink: 0, unmanagedCount: 0 });
    expect(record.removedItems.map(({ status, sha256: hash }) => [status, hash]).sort()).toEqual(
      Object.entries(old).map(([status, text]) => [status, sha256(text)]).sort()
    );
    expect(record.removedEvents).toEqual([expect.objectContaining({ itemId: "2026-06-02-devshark-en-linkedin", at: "2026-06-02", sha256: sha256(holdEvent) })]);
    for (const removed of [...record.removedItems, ...record.removedEvents]) expect(await exists(path.join(state, removed.path.replace(/^state\//u, "")))).toBe(false);
    for (const kept of ["social/queue/2026-06-05-devshark-en-linkedin.json", "social/queue/2026-06-06-devshark-en-linkedin.json",
      "social/queue/2026-06-27-devshark-en-linkedin.json", "social/queue/README.md", "social/posts/2026-06-01-devshark-en-linkedin.json"]) {
      expect(await exists(path.join(state, kept))).toBe(true);
    }
    expect(SocialQueueRetentionSchema.parse(JSON.parse(await readFile(path.join(state, artifacts[0]!), "utf8")))).toEqual(record);
  });

  it("dates an item by its last activity, so a late owner event or a claim keeps it", async () => {
    const state = await tempState();
    await put(state, "social/queue/2026-06-01-late-event.json", item("2026-06-01-late-event", "cancelled", "2026-06-01"));
    await put(state, eventFile("2026-06-01-late-event", "2026-07-01T09:00:00.000Z", "hold"), event("2026-06-01-late-event", "2026-07-01T09:00:00.000Z", "hold"));
    await put(state, "social/queue/2026-06-01-late-claim.json", item("2026-06-01-late-claim", "failed", "2026-06-01", {
      attempt: { idempotencyKey: HASH, claimedAt: "2026-06-30T09:00:00.000Z", attemptCount: 1, lastError: "provider said no" }
    }));

    const { record, artifacts } = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });

    expect(artifacts).toEqual([]);
    expect(record).toMatchObject({ removedItems: [], removedEvents: [], keptItems: 2, keptEvents: 1 });
  });

  it("removes a supersession chain whole or not at all", async () => {
    const state = await tempState();
    // An old edit whose successor is still a draft: the cancelled original and the edit event stay.
    await put(state, "social/queue/2026-06-01-open-chain.json", item("2026-06-01-open-chain", "cancelled", "2026-06-01"));
    await put(state, "social/queue/2026-06-01-open-chain-r1.json", item("2026-06-01-open-chain-r1", "draft", "2026-06-01"));
    await put(state, eventFile("2026-06-01-open-chain", "2026-06-01T09:00:00.000Z", "edit"), event("2026-06-01-open-chain", "2026-06-01T09:00:00.000Z", "edit", "2026-06-01-open-chain-r1"));
    // An old edit whose successor was published long ago: all three go.
    await put(state, "social/queue/2026-06-02-closed-chain.json", item("2026-06-02-closed-chain", "cancelled", "2026-06-02"));
    await put(state, "social/queue/2026-06-02-closed-chain-r1.json", item("2026-06-02-closed-chain-r1", "published", "2026-06-02"));
    await put(state, eventFile("2026-06-02-closed-chain", "2026-06-02T09:00:00.000Z", "edit"), event("2026-06-02-closed-chain", "2026-06-02T09:00:00.000Z", "edit", "2026-06-02-closed-chain-r1"));

    const { record } = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });

    expect(record.removedItems.map(({ id }) => id).sort()).toEqual(["2026-06-02-closed-chain", "2026-06-02-closed-chain-r1"]);
    expect(record.removedEvents.map(({ itemId }) => itemId)).toEqual(["2026-06-02-closed-chain"]);
    expect(record).toMatchObject({ heldByLink: 1, keptItems: 2, keptEvents: 1 });
    expect(await exists(path.join(state, "social/queue/2026-06-01-open-chain.json"))).toBe(true);
  });

  it("never removes a file it cannot parse as queue v2, nor anything linked to one", async () => {
    const state = await tempState();
    const legacy = { ...item("caught-up-2026-06-01-cs-instagram", "expired", "2026-06-01"), schemaVersion: 1 };
    await put(state, "social/queue/2026-06-01-cs-instagram.json", legacy);
    await put(state, "social/queue/2026-06-01-broken.json", "{ not json");
    await put(state, "social/queue-events/broken.json", "{ not json");

    const { record, artifacts } = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });

    expect(artifacts).toEqual([]);
    expect(record).toMatchObject({ removedItems: [], unmanagedCount: 3 });
    expect(await exists(path.join(state, "social/queue/2026-06-01-cs-instagram.json"))).toBe(true);
  });

  it("adds a second run's removals to the day's record and writes nothing when nothing goes", async () => {
    const state = await tempState();
    await put(state, "social/queue/2026-06-01-first.json", item("2026-06-01-first", "published", "2026-06-01"));
    await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });
    await put(state, "social/queue/2026-06-02-second.json", item("2026-06-02-second", "published", "2026-06-02"));
    const second = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });
    const quiet = await pruneSocialQueue({ stateRoot: state, today: "2026-09-26" });

    expect(second.record.removedItems.map(({ id }) => id)).toEqual(["2026-06-01-first", "2026-06-02-second"]);
    expect(quiet).toMatchObject({ artifacts: [], record: { removedItems: [] } });
    expect(await exists(path.join(state, "social/queue-retention/2026-09-26.json"))).toBe(false);
  });

  it("answers an empty record when neither directory exists", async () => {
    const state = await tempState();
    const { record, artifacts } = await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });
    expect(artifacts).toEqual([]);
    expect(record).toMatchObject({ removedItems: [], removedEvents: [], keptItems: 0, keptEvents: 0, unmanagedCount: 0 });
  });
});

describe("the queue-health step commits the queue prune as deletions only", () => {
  it("stages the retention record and the deletions, and adds nothing under the queue", async () => {
    const cycle = await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");
    const start = cycle.indexOf("      - name: Check both publish queues are draining\n");
    const step = cycle.slice(start, cycle.indexOf("\n      - name: ", start + 1));
    expect(step).toMatch(/for queue_path in [^\n]*state\/social\/queue-retention/u);
    expect(step).toContain("git ls-files --deleted -z -- state/social/queue state/social/queue-events | xargs -0 -r git rm --cached --quiet --");
    expect(step).not.toMatch(/git add[^\n]*state\/social\/queue(?:-events)?\b(?!-retention)/u);
  });

  it("leaves an item a failed cycle wrote out of the commit", async () => {
    const root = await tempState();
    const git = (...args: string[]) => execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
    const state = path.join(root, "state");
    await git("init", "--quiet");
    await put(state, "social/queue/2026-06-01-old.json", item("2026-06-01-old", "published", "2026-06-01"));
    await git("add", "--", "state");
    await git("commit", "--quiet", "-m", "queue");
    await put(state, "social/queue/2026-09-25-new.json", item("2026-09-25-new", "draft", "2026-09-25"));
    await pruneSocialQueue({ stateRoot: state, today: "2026-09-25" });

    await execFileAsync("bash", ["-c", "git ls-files --deleted -z -- state/social/queue state/social/queue-events | xargs -0 -r git rm --cached --quiet --"], { cwd: root });
    const { stdout } = await git("diff", "--cached", "--name-status");

    expect(stdout.trim()).toBe("D\tstate/social/queue/2026-06-01-old.json");
  });
});
