import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyOrgMaintenancePlan,
  OrgMaintenancePlanSchema
} from "../src/org/maintenance.js";
import { repoRoot } from "../src/paths.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function plan() {
  return OrgMaintenancePlanSchema.parse(
    JSON.parse(
      await readFile(
        path.join(repoRoot, "state/org/proposals/ORG-2026-07-31-HACEK.json"),
        "utf8"
      )
    ) as unknown
  );
}

describe("declarative organization maintenance", () => {
  it("applies the approved Tier C role once and records an idempotent change", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-org-maintenance-"));
    roots.push(stateRoot);
    const approved = await plan();
    const first = await applyOrgMaintenancePlan({
      plan: approved,
      repoRoot,
      stateRoot
    });
    const second = await applyOrgMaintenancePlan({
      plan: approved,
      repoRoot,
      stateRoot
    });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    const records = (await readFile(path.join(stateRoot, "org/changes.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: string; status: string });
    expect(records).toEqual([
      expect.objectContaining({ id: "ORG-2026-07-31-HACEK", status: "applied" })
    ]);
  });

  it("refuses a new role without Human Steward approval", async () => {
    const approved = await plan();
    const missingApproval = {
      ...approved,
      change: { ...approved.change, approvers: [] }
    };
    await expect(applyOrgMaintenancePlan({
      plan: missingApproval,
      repoRoot,
      stateRoot: path.join(os.tmpdir(), "boardless-org-maintenance-refused")
    })).rejects.toThrow(/HUMAN_APPROVAL/);
  });
});
