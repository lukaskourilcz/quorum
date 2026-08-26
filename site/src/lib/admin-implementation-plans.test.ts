import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminImplementationProgress } from "./admin-implementation-plans";
import {
  IMPLEMENTATION_REFRESH_COOLDOWN_MS,
  ImplementationRefreshError,
  requestImplementationProgressRefresh
} from "./admin-implementation-refresh";

const created: string[] = [];

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-programs-admin-"));
  created.push(directory);
  return directory;
}

async function contractFixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.resolve(process.cwd(), `../contracts/fixtures/${name}.json`), "utf8")) as Record<string, unknown>;
}

async function writeSnapshot(directory: string, value: unknown): Promise<void> {
  await mkdir(path.join(directory, "state/programs"), { recursive: true });
  await writeFile(path.join(directory, "state/programs/current.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("the Admin implementation progress boundary", () => {
  it("keeps missing and malformed snapshots explicit", async () => {
    expect(await readAdminImplementationProgress(await root())).toMatchObject({ state: "missing", programs: [], items: [] });
    const malformedRoot = await root();
    await writeSnapshot(malformedRoot, "not a snapshot");
    expect(await readAdminImplementationProgress(malformedRoot)).toMatchObject({ state: "malformed", unreadableItems: 1 });
  });

  it("reads the published snapshot as sanitised Admin data", async () => {
    const directory = await root();
    await writeSnapshot(directory, await contractFixture("implementation-progress.valid"));
    const snapshot = await readAdminImplementationProgress(directory);
    expect(snapshot).toMatchObject({
      state: "present",
      generatedAt: "2026-08-26T12:00:00.000Z",
      sourceFreshness: "fresh",
      unreadableItems: 0,
      github: { cacheStatus: "fresh", rateRemaining: 4999, failedItems: 0 },
      programs: [{ id: "fixture-program", mandatoryCompleted: 1, finalGateComplete: true }],
      items: [{ id: "fixture-item", state: "complete", issueState: "closed", probes: [{ status: "pass" }] }]
    });
  });

  it("isolates malformed records and rejects non-GitHub links", async () => {
    const directory = await root();
    const fixture = await contractFixture("implementation-progress.valid");
    const programs = fixture.programs as Array<Record<string, unknown>>;
    const items = fixture.items as Array<Record<string, unknown>>;
    fixture.programs = [...programs, { ...programs[0], programId: "unsafe-program", parentIssueUrl: "https://evil.example/issues/1" }];
    fixture.items = [...items, { ...items[0], itemId: "unsafe-item", issueUrl: "javascript:alert(1)" }];
    await writeSnapshot(directory, fixture);
    const snapshot = await readAdminImplementationProgress(directory);
    expect(snapshot).toMatchObject({ state: "present", unreadableItems: 2 });
    expect(snapshot.programs.map(({ id }) => id)).toEqual(["fixture-program"]);
    expect(snapshot.items.map(({ id }) => id)).toEqual(["fixture-item"]);
  });
});

describe("implementation refresh requests", () => {
  it("writes one bounded atomic receipt and enforces the cooldown", async () => {
    const directory = await root();
    const now = new Date("2026-08-26T12:00:00.000Z");
    const receipt = await requestImplementationProgressRefresh({ root: directory, now, requestedBy: "owner" });
    expect(receipt).toEqual({
      requestedAt: now.toISOString(),
      nextRequestAllowedAt: new Date(now.getTime() + IMPLEMENTATION_REFRESH_COOLDOWN_MS).toISOString()
    });
    const stored = JSON.parse(await readFile(path.join(directory, "state/programs/refresh-request.json"), "utf8")) as Record<string, unknown>;
    expect(stored).toMatchObject({ schemaVersion: "implementation-refresh-request/1", requestedBy: "owner" });
    await expect(requestImplementationProgressRefresh({ root: directory, now: new Date(now.getTime() + 1_000), requestedBy: "owner" }))
      .rejects.toMatchObject({ code: "COOLDOWN" } satisfies Partial<ImplementationRefreshError>);
  });

  it("fails closed when an existing receipt is unreadable", async () => {
    const directory = await root();
    await mkdir(path.join(directory, "state/programs"), { recursive: true });
    await writeFile(path.join(directory, "state/programs/refresh-request.json"), "{", "utf8");
    await expect(requestImplementationProgressRefresh({ root: directory, requestedBy: "owner" }))
      .rejects.toMatchObject({ code: "UNAVAILABLE" } satisfies Partial<ImplementationRefreshError>);
  });
});
