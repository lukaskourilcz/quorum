import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readOwnerAttention } from "./owner-attention";

async function root(file: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-owner-attention-site-"));
  if (file !== undefined) {
    await mkdir(path.join(directory, "state"), { recursive: true });
    await writeFile(
      path.join(directory, "state", "owner-attention.json"),
      typeof file === "string" ? file : JSON.stringify(file)
    );
  }
  return directory;
}

const approval = {
  id: "APIFY-ACCOUNT-001",
  title: "Create an Apify account",
  plain: "GoVIRAL has no trend data until this exists.",
  source: { kind: "inbox", ref: "state/INBOX.md#APIFY-ACCOUNT-001" },
  since: "2026-08-04",
  urgency: "blocking"
};

describe("the owner-attention panel's data", () => {
  it("reads approvals and manual tasks, and tracks their steps", async () => {
    const snapshot = await readOwnerAttention(await root({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-10T04:00:00.000Z",
      approvals: [approval],
      manualTasks: [{
        id: "ADMIN_USER",
        title: "Admin username is not set",
        plain: "The admin door will not open until a username and password are set.",
        steps: ["Open Vercel", "Add the values", "Redeploy", "A fourth step nobody should see"],
        source: { kind: "runtime", ref: "ADMIN_USER" },
        since: null,
        urgency: "blocking"
      }]
    }));

    expect(snapshot.state).toBe("present");
    expect(snapshot.approvals.map((item) => item.id)).toEqual(["APIFY-ACCOUNT-001"]);
    expect(snapshot.approvals[0]?.since).toBe("2026-08-04");
    // Three steps at most: a list you cannot read at a glance is not a list you act on.
    expect(snapshot.manualTasks[0]?.steps).toHaveLength(3);
    expect(snapshot.unreadable).toBe(0);
  });

  it("drops a malformed entry and counts it, instead of failing the panel", async () => {
    const snapshot = await readOwnerAttention(await root({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-10T04:00:00.000Z",
      approvals: [approval, { id: "", title: "", plain: null }, { nothing: true }],
      manualTasks: []
    }));
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.unreadable).toBe(2);
  });

  it("refuses an approval claiming a source kind it cannot have", async () => {
    // An approval comes from the inbox. One claiming to come from a runtime probe is not an
    // approval, whatever it says about itself.
    const snapshot = await readOwnerAttention(await root({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-10T04:00:00.000Z",
      approvals: [{ ...approval, source: { kind: "runtime", ref: "ADMIN_USER" } }],
      manualTasks: []
    }));
    expect(snapshot.approvals).toEqual([]);
    expect(snapshot.unreadable).toBe(1);
  });

  it("tells a first run apart from an empty list", async () => {
    expect((await readOwnerAttention(await root(undefined))).state).toBe("missing");
    expect((await readOwnerAttention(await root("{ not json"))).state).toBe("missing");
    expect((await readOwnerAttention(await root({ schemaVersion: "owner-attention/2" }))).state).toBe("missing");
    expect((await readOwnerAttention(await root({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-10T04:00:00.000Z",
      approvals: [],
      manualTasks: []
    }))).state).toBe("present");
  });
});
