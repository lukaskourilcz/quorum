import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerAttentionSchema } from "../src/contracts/owner-attention.js";
import {
  collectOwnerAttention,
  insertNeededItem,
  parseInboxApprovals,
  parseNeededTasks,
  runtimeGaps
} from "../src/org/owner-attention.js";

const NOW = new Date("2026-08-10T04:00:00.000Z");
const NEW_VENTURE_APPROVALS = [
  "BH-RESEARCH-001", "BH-SEED-002", "BH-ACCOUNTS-003", "BH-RESULTS-004",
  "BOOK-SOURCE-001", "BOOK-INGEST-002", "DM-ACCOUNTS-003", "DM-RESULTS-004",
  "TS-SNAPSHOT-001", "TS-MEDIA-002", "TS-ACCOUNTS-003", "TS-RESEARCH-004", "TS-RESULTS-005",
  "KV-APIFY-001", "KV-SOURCES-002", "KV-ACCOUNTS-003", "KV-EDITORIAL-004",
  "DEVSHARK-SOCIAL-001", "DEVSHARK-SOCIAL-002", "DEVSHARK-SOCIAL-003"
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

  it("gives the month-stamped budget items the copy written for them", () => {
    /*
     * The ids this system mints itself carry the month, so an exact-ref lookup could never
     * match them. The one item that says the company has stopped spending reached the owner's
     * admin flagged "no plain description yet" — the only item on the page with no explanation
     * of what to do about it. The prefix lookup answers both budget items, and only those.
     */
    const approvals = parseInboxApprovals([
      "- [ ] HUMAN_APPROVAL BUDGET-PACE-2026-09 — All-in warning: $40.00 of $50.00 used.",
      "- [ ] HUMAN_APPROVAL BUDGET-EXHAUSTED-2026-09 — BoardlessAI spending has stopped.",
      "- [ ] HUMAN_APPROVAL BUDGET-SOMETHING-ELSE — Not a curated prefix."
    ].join("\n\n"));
    expect(approvals.map((entry) => entry.id)).toEqual([
      "BUDGET-PACE-2026-09",
      "BUDGET-EXHAUSTED-2026-09",
      "BUDGET-SOMETHING-ELSE"
    ]);
    expect(approvals[0]?.needsPlainCopy).toBeUndefined();
    expect(approvals[0]?.urgency).toBe("soon");
    expect(approvals[0]?.plain).toContain("no approval is needed");
    expect(approvals[1]?.needsPlainCopy).toBeUndefined();
    expect(approvals[1]?.urgency).toBe("blocking");
    expect(approvals[1]?.plain).toContain("read-only");
    // A prefix that nobody curated stays uncurated. Longest match wins, and no match is fine.
    expect(approvals[2]?.needsPlainCopy).toBe(true);
  });

  it("keeps every new venture approval in the canonical inbox with owner-ready copy", async () => {
    const inbox = await readFile(path.resolve(process.cwd(), "../state/INBOX.md"), "utf8");

    /*
     * Two separate claims, and they used to be tangled into one.
     *
     * The parser reports only unresolved approvals — `- [ ]` — so reading the real inbox and
     * asserting each id came back also asserted that the owner had signed none of them. That held
     * until the launch countersignatures landed and then failed for thirteen ids at once, which is
     * a test going red because the product moved forward. Presence is checked against the file in
     * either checkbox state; copy quality is checked through the parser on a synthetic inbox, so
     * it measures the curated-copy registry rather than the owner's progress.
     */
    for (const id of NEW_VENTURE_APPROVALS) {
      expect(new RegExp(`^- (?:\\[[ x]\\]|WITHDRAWN) HUMAN_APPROVAL ${id}\\b`, "mu").test(inbox), id).toBe(true);
    }

    const pending = NEW_VENTURE_APPROVALS
      .map((id) => `- [ ] HUMAN_APPROVAL ${id} — placeholder title for the copy check.`)
      .join("\n");
    const byId = new Map(parseInboxApprovals(pending).map((approval) => [approval.id, approval]));
    for (const id of NEW_VENTURE_APPROVALS) {
      expect(byId.get(id)?.id, id).toBe(id);
      // Curated copy exists for this id, so the owner never meets a raw approval reference.
      expect(byId.get(id)?.needsPlainCopy, id).toBeUndefined();
    }
  });
});

it("withdraws social automation without recording approval", async () => {
  const inbox = await readFile(path.resolve(process.cwd(), "../state/INBOX.md"), "utf8");
  expect(parseInboxApprovals(inbox).map(item => item.id).filter(id => id.startsWith("DEVSHARK-SOCIAL-"))).toEqual([]);
  for (const id of ["001", "002", "003"]) {
    expect(inbox).toContain(`- WITHDRAWN HUMAN_APPROVAL DEVSHARK-SOCIAL-${id}`);
    expect(inbox).not.toContain(`- [x] HUMAN_APPROVAL DEVSHARK-SOCIAL-${id}`);
  }
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

  /*
   * Parked work stays in the one owner document and stops counting as waiting.
   *
   * The parse used to read every unchecked owner item in the file, wherever it lived: on
   * 2026-09-26, 18 of the 77 it found sat under "On hold — paused ventures".
   */
  it("leaves the parked sections out, subsections included, and reads the sections after them", () => {
    const tasks = parseNeededTasks(`# NEEDED

## Focus

- [ ] **Keep this one** — a focus venture waits on it. [imp:3] [owner:me] [time:5m] [kind:setup]

## On hold — paused ventures

- [ ] **Paused venture item** — waits for its venture. [imp:5] [owner:me] [time:5m] [kind:setup]

### MMA Files and FightAIQ

- [ ] **Paused subsection item** — also waits. [imp:4] [owner:me] [time:5m] [kind:decision]

## Parked — outside the current focus

### The office page

- [ ] **Parked office item** — outside the focus. [imp:2] [owner:me] [time:1h] [kind:content]

## Reference

- [ ] **Read after the parked sections** — still waiting. [imp:2] [owner:me] [time:5m] [kind:setup]
`);
    expect(tasks.map((task) => task.title)).toEqual(["Keep this one", "Read after the parked sections"]);
  });

  it("files a written item above the parked sections, where the collector reads it", () => {
    const item = "- [ ] **Add a key** — a focus venture waits on it. [imp:4] [owner:me] [time:5m] [kind:setup]";
    const parked = "# NEEDED\n\n## Focus\n\n- [ ] **Keep this one** — waits. [imp:3] [owner:me] [time:5m] [kind:setup]\n\n"
      + "## On hold — paused ventures\n\n### Personal Growth\n\n- [ ] **Paused item** — waits. [imp:2] [owner:me] [time:5m] [kind:setup]\n";
    const written = insertNeededItem(parked, item);
    expect(parseNeededTasks(written).map((task) => task.title)).toEqual(["Keep this one", "Add a key"]);
    expect(written.indexOf(item)).toBeLessThan(written.indexOf("## On hold"));
    expect(written.endsWith("- [ ] **Paused item** — waits. [imp:2] [owner:me] [time:5m] [kind:setup]\n")).toBe(true);
    // A file with no parked section gets the item at its end, as before.
    expect(insertNeededItem("# NEEDED\n", item)).toBe(`# NEEDED\n\n${item}\n`);
  });
});

describe("probing the runtime", () => {
  it("reports a missing key without ever touching a value", () => {
    const gaps = runtimeGaps({ APIFY_TOKEN: "hunter2-apify" });
    const ids = gaps.map((gap) => gap.id);
    expect(ids).not.toContain("APIFY_TOKEN");
    expect(ids).toContain("FAL_KEY");
    // The secret's value must not appear anywhere in what this writes.
    expect(JSON.stringify(gaps)).not.toContain("hunter2");
  });

  it("treats a blank key as missing", () => {
    expect(runtimeGaps({ APIFY_TOKEN: "  ", FAL_KEY: "" }).map((gap) => gap.id))
      .toEqual(["FAL_KEY"]);
  });

  it("does not request retired GoVIRAL credentials", () => {
    expect(runtimeGaps({}).map(gap => gap.id)).not.toContain("APIFY_TOKEN");
  });

  it("writes one row per job", () => {
    const gaps = runtimeGaps({});
    expect(new Set(gaps.map((gap) => gap.plain)).size).toBe(gaps.length);
  });

  /*
   * The collector runs inside the cycle job, so it can only see a key that job maps. The admin
   * credentials, the stream switch and the Podcast Index pair never reached it, and each one sat in
   * "Waiting for you" from the first snapshot on 2026-08-10, after the owner set the credentials and
   * the switch on 2026-08-29 as well.
   */
  it("probes only keys the cycle job maps into its environment", async () => {
    const cycle = await readFile(path.resolve(import.meta.dirname, "../../.github/workflows/cycle.yml"), "utf8");
    const probed = runtimeGaps({}).map((gap) => gap.id);
    expect(probed.length).toBeGreaterThan(0);
    for (const id of probed) {
      // Anchored at the job env's indentation: a step's own `env:` or an `if:` does not reach the collector.
      expect(new RegExp(`^ {6}${id}: `, "mu").test(cycle), `${id} is not in the cycle job's env`).toBe(true);
    }
    for (const id of ["ADMIN_USER", "ADMIN_PASSWORD", "BOARDLESSAI_GITHUB_TOKEN", "CAUGHT_UP_STREAMS_ENABLED", "PODCASTINDEX_API_KEY", "PODCASTINDEX_API_SECRET"]) {
      expect(probed, id).not.toContain(id);
    }
  });

  it("does not ask for FightAIQ's odds key while FightAIQ is paused", async () => {
    const registry = JSON.parse(
      await readFile(path.resolve(import.meta.dirname, "../../config/ventures.json"), "utf8")
    ) as { ventures: Array<{ id: string; status: string }> };
    if (registry.ventures.find((venture) => venture.id === "fightaiq")?.status !== "paused") return;
    expect(runtimeGaps({}).map((gap) => gap.id)).not.toContain("THE_ODDS_API_KEY");
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
    expect(before.manualTasks.map((task) => task.id)).toContain("FAL_KEY");

    // Countersign the inbox entry and set the key: the next run must forget both, with no second
    // place to update.
    await writeFile(
      path.join(stateRoot, "INBOX.md"),
      INBOX.replace("- [ ] HUMAN_APPROVAL APIFY-ACCOUNT-001", "- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001")
    );
    const after = (await collectOwnerAttention({
      repoRoot, stateRoot, now: NOW, env: { FAL_KEY: "set" }
    })).record;

    expect(after.approvals.map((entry) => entry.id)).not.toContain("APIFY-ACCOUNT-001");
    expect(after.manualTasks.map((task) => task.id)).not.toContain("FAL_KEY");
  });

  it("reads a missing source as an empty one rather than failing the cycle", async () => {
    const { repoRoot, stateRoot } = await root({});
    const { record } = await collectOwnerAttention({ repoRoot, stateRoot, now: NOW, env: {} });
    expect(record.approvals).toEqual([]);
    expect(record.manualTasks.every((task) => task.source.kind === "runtime")).toBe(true);
  });

  it("preserves deduplicated operational incidents in the same owner-attention store", async () => {
    const { repoRoot, stateRoot } = await root({});
    await writeFile(path.join(stateRoot, "owner-attention.json"), JSON.stringify({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-26T08:00:00.000Z",
      approvals: [],
      manualTasks: [],
      operationalIncidents: [{
        incidentId: "incident-caught-up",
        conditionKey: "caught-up.delivery.token",
        nodeId: "caught-up",
        affectedScope: "Instagram connection",
        firstSeenAt: "2026-08-26T08:00:00.000Z",
        lastSeenAt: "2026-08-26T08:00:00.000Z",
        evidenceRefs: ["state/operations/health/caught-up/current.json"],
        exactOwnerAction: "Reconnect the existing account.",
        impact: "One connection is paused.",
        unaffectedScope: "Editorial and website operation continue.",
        retryCondition: "Resume after the existing credential is restored.",
        sourcePolicyRef: "config/operations-recovery.json#caught-up:routine",
        status: "active",
        correctionHistory: []
      }]
    }));
    const { record } = await collectOwnerAttention({ repoRoot, stateRoot, now: NOW, env: {} });
    expect(record.operationalIncidents).toHaveLength(1);
    expect(record.operationalIncidents?.[0]?.conditionKey).toBe("caught-up.delivery.token");
  });
});

/*
 * The committed snapshot is what the admin renders, and it is recorded rather than re-derived —
 * the same reason the Design Lab summary and the image ladder's verdict are. Recorded state can
 * go stale, and this is the one way it goes stale in practice: the owner (or a session acting for
 * him) ticks an approval in `state/INBOX.md` by hand and nothing regenerates the file, so
 * "Waiting for you" keeps asking for a signature that was given.
 *
 * That is exactly what happened on 2026-08-29: ten signed approvals stayed on the panel until the
 * next checkpoint would have cleared them. The daily checkpoint does regenerate this, so the fix
 * is not to derive it live — it is to fail here, before the stale copy ships.
 */
describe("the committed owner-attention snapshot", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

  it("agrees with state/INBOX.md about what is still unsigned", async () => {
    const inbox = await readFile(path.join(repositoryRoot, "state", "INBOX.md"), "utf8");
    const snapshot = OwnerAttentionSchema.parse(JSON.parse(
      await readFile(path.join(repositoryRoot, "state", "owner-attention.json"), "utf8")
    ));
    expect(snapshot.approvals.map((approval) => approval.id).sort())
      .toEqual(parseInboxApprovals(inbox).map((approval) => approval.id).sort());
  });
});
