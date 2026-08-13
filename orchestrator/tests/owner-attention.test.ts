import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerAttentionSchema } from "../src/contracts/owner-attention.js";
import {
  collectOwnerAttention,
  parseInboxApprovals,
  parseNeededTasks,
  runtimeGaps
} from "../src/org/owner-attention.js";

const NOW = new Date("2026-08-10T04:00:00.000Z");
const NEW_VENTURE_APPROVALS = [
  "BH-RESEARCH-001", "BH-SEED-002", "BH-ACCOUNTS-003", "BH-RESULTS-004",
  "BOOK-SOURCE-001", "BOOK-INGEST-002", "DM-ACCOUNTS-003", "DM-RESULTS-004",
  "TS-SNAPSHOT-001", "TS-MEDIA-002", "TS-ACCOUNTS-003", "TS-RESEARCH-004", "TS-RESULTS-005",
  "KV-APIFY-001", "KV-SOURCES-002", "KV-ACCOUNTS-003", "KV-EDITORIAL-004"
] as const;

const INBOX = `# Things only you can approve

- [ ] HUMAN_APPROVAL APIFY-ACCOUNT-001 — Create an Apify account on the **Free
  plan** and add \`APIFY_TOKEN\` to the repository's Actions secrets.
  What this approves, exactly:
  - **The plan:** Free, and only Free.

- [x] HUMAN_APPROVAL DEVSHARK-BANNER-001 — Place the devShark house banner.
  → approved 2026-08-02.

- [ ] HUMAN_APPROVAL MYSTERY-042 — Something nobody has written plain copy for yet.
`;

const NEEDED = `# What the owner needs to do

- [ ] **Add \`THE_ODDS_API_KEY\` to Actions secrets** (and optionally \`CITO_API_KEY\`) — the single
  unblock for every FightAIQ output. Without a price source the evening check has nothing to
  compare against. [imp:5] [owner:me] [time:10m] [kind:setup]

- [ ] **Something the system does itself** — this one is the agent's job.
  [imp:2] [owner:ai] [time:1h] [kind:content]

- [x] **Already done** — finished last week. [imp:3] [owner:me] [time:5m] [kind:setup]

- [ ] **Pick the Czech AI podcasts** — two empty slots wait for the shows you choose.
  [imp:2] [owner:me] [time:20m] [kind:decision]
`;

async function root(files: { inbox?: string; needed?: string }): Promise<{ repoRoot: string; stateRoot: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), "boardless-owner-attention-"));
  const stateRoot = path.join(base, "state");
  await mkdir(path.join(base, "docs"), { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  if (files.inbox !== undefined) await writeFile(path.join(stateRoot, "INBOX.md"), files.inbox);
  if (files.needed !== undefined) await writeFile(path.join(base, "docs", "NEEDED.md"), files.needed);
  return { repoRoot: base, stateRoot };
}

describe("reading the inbox", () => {
  it("takes the unchecked approvals and leaves the countersigned ones alone", () => {
    const approvals = parseInboxApprovals(INBOX);
    expect(approvals.map((entry) => entry.id)).toEqual(["APIFY-ACCOUNT-001", "MYSTERY-042"]);
    expect(approvals[0]?.plain).toContain("no trend data");
    expect(approvals[0]?.needsPlainCopy).toBeUndefined();
    // An item nobody has written a sentence for says so, rather than showing its raw title as
    // though somebody had.
    expect(approvals[1]?.needsPlainCopy).toBe(true);
  });

  it("keeps every new venture approval in the canonical inbox with owner-ready copy", async () => {
    const inbox = await readFile(path.resolve(process.cwd(), "../state/INBOX.md"), "utf8");
    const approvals = parseInboxApprovals(inbox);
    const byId = new Map(approvals.map((approval) => [approval.id, approval]));

    for (const id of NEW_VENTURE_APPROVALS) {
      expect(byId.get(id)?.id, id).toBe(id);
      expect(byId.get(id)?.needsPlainCopy, id).toBeUndefined();
    }
  });
});

describe("reading the owner's task list", () => {
  it("takes unchecked owner:me items and nothing else", () => {
    const tasks = parseNeededTasks(NEEDED);
    expect(tasks.map((task) => task.title)).toEqual([
      "Add THE_ODDS_API_KEY to Actions secrets",
      "Pick the Czech AI podcasts"
    ]);
    // The sentence starts at the em dash, not at the bold title, so a parenthetical between the
    // two does not become the opening words.
    expect(tasks[0]?.plain.startsWith("the single unblock")).toBe(true);
    expect(tasks[0]?.urgency).toBe("blocking");
    expect(tasks[1]?.urgency).toBe("whenever");
  });
});

describe("probing the runtime", () => {
  it("reports a missing key without ever touching a value", () => {
    const gaps = runtimeGaps({ ADMIN_USER: "owner", ADMIN_PASSWORD: "hunter2", CAUGHT_UP_STREAMS_ENABLED: "true" });
    const ids = gaps.map((gap) => gap.id);
    expect(ids).not.toContain("ADMIN_USER");
    expect(ids).not.toContain("CAUGHT_UP_STREAMS_ENABLED");
    expect(ids).toContain("THE_ODDS_API_KEY");
    // The secret's value must not appear anywhere in what this writes.
    expect(JSON.stringify(gaps)).not.toContain("hunter2");
    expect(JSON.stringify(gaps)).not.toContain("owner");
  });

  it("treats a switch that is not 'true' as off", () => {
    expect(runtimeGaps({ CAUGHT_UP_STREAMS_ENABLED: "false" }).map((gap) => gap.id))
      .toContain("CAUGHT_UP_STREAMS_ENABLED");
  });

  it("collapses two keys that are one job into one row", () => {
    const gaps = runtimeGaps({});
    const podcast = gaps.filter((gap) => gap.plain.includes("podcast shows"));
    expect(podcast).toHaveLength(1);
  });
});

describe("the collected file", () => {
  it("covers the inbox, the task list and the missing keys, and calls no model", async () => {
    const { repoRoot, stateRoot } = await root({ inbox: INBOX, needed: NEEDED });
    const { path: relative, record } = await collectOwnerAttention({ repoRoot, stateRoot, now: NOW, env: {} });

    expect(relative).toBe("owner-attention.json");
    expect(OwnerAttentionSchema.parse(record)).toBeTruthy();
    expect(record.approvals.map((entry) => entry.id)).toEqual(["APIFY-ACCOUNT-001", "MYSTERY-042"]);
    expect(record.manualTasks.some((task) => task.source.kind === "runtime")).toBe(true);
    expect(record.manualTasks.some((task) => task.source.kind === "needed")).toBe(true);
    // Blocking first, so the top of the panel is the thing that is actually stopping something.
    expect(record.manualTasks[0]?.urgency).toBe("blocking");

    const written = JSON.parse(await readFile(path.join(stateRoot, relative), "utf8"));
    expect(written.schemaVersion).toBe("owner-attention/1");

    const source = await readFile(new URL("../src/org/owner-attention.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/guardedJsonCall|guardedVisionCall/u);
  });

  it("clears an item once it is resolved at its source", async () => {
    const { repoRoot, stateRoot } = await root({ inbox: INBOX, needed: NEEDED });
    const before = (await collectOwnerAttention({ repoRoot, stateRoot, now: NOW, env: {} })).record;
    expect(before.approvals.map((entry) => entry.id)).toContain("APIFY-ACCOUNT-001");
    expect(before.manualTasks.map((task) => task.id)).toContain("THE_ODDS_API_KEY");

    // Countersign the inbox entry and set the key: the next run must forget both, with no second
    // place to update.
    await writeFile(
      path.join(stateRoot, "INBOX.md"),
      INBOX.replace("- [ ] HUMAN_APPROVAL APIFY-ACCOUNT-001", "- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001")
    );
    const after = (await collectOwnerAttention({
      repoRoot, stateRoot, now: NOW, env: { THE_ODDS_API_KEY: "set" }
    })).record;

    expect(after.approvals.map((entry) => entry.id)).not.toContain("APIFY-ACCOUNT-001");
    expect(after.manualTasks.map((task) => task.id)).not.toContain("THE_ODDS_API_KEY");
  });

  it("reads a missing source as an empty one rather than failing the cycle", async () => {
    const { repoRoot, stateRoot } = await root({});
    const { record } = await collectOwnerAttention({ repoRoot, stateRoot, now: NOW, env: {} });
    expect(record.approvals).toEqual([]);
    expect(record.manualTasks.every((task) => task.source.kind === "runtime")).toBe(true);
  });
});
