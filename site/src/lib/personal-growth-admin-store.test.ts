import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyPersonalGrowthAdminAction,
  parsePersonalGrowthAdminAction
} from "./personal-growth-admin-store";

async function rootWithPlanner(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "personal-growth-admin-store-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(
    path.join(root, "config", "personal-growth-planner.json"),
    await readFile(path.resolve(process.cwd(), "..", "config", "personal-growth-planner.json"))
  );
  return root;
}

afterEach(() => vi.unstubAllEnvs());

describe("Personal Growth Admin writes", () => {
  it("updates an anchor while preserving the prior date and correction reason", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithPlanner();
    const action = { type: "anchor", lane: "okraj", date: "2026-09-01", reason: "Owner corrected the first due date." };
    const first = await applyPersonalGrowthAdminAction(action, { root, now: new Date("2026-08-27T10:00:00.000Z") });
    const second = await applyPersonalGrowthAdminAction(action, { root, now: new Date("2026-08-27T10:01:00.000Z") });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const planner = JSON.parse(await readFile(path.join(root, "config", "personal-growth-planner.json"), "utf8")) as { lanes: Array<{ lane: string; recurrenceAnchorDate: string }> };
    expect(planner.lanes.find(({ lane }) => lane === "okraj")?.recurrenceAnchorDate).toBe("2026-09-01");
    const history = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/anchor-history.json"), "utf8")) as { revisions: Array<Record<string, unknown>> };
    expect(history.revisions).toEqual([expect.objectContaining({
      lane: "okraj",
      previousDate: "2026-08-27",
      nextDate: "2026-09-01",
      reason: "Owner corrected the first due date."
    })]);
  });

  it("appends timeline corrections and bounded Threads decisions without publishing", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithPlanner();
    const timeline = {
      type: "timeline",
      lane: "bbarak",
      occurrenceDate: "2026-08-27",
      operation: "rescheduled",
      reason: "The owner moved the writing window.",
      rescheduledTo: "2026-08-29",
      finalUrl: null,
      collaborationUrl: null
    };
    const decision = {
      type: "thread",
      suggestionId: "pg-thread-1111111111111111",
      operation: "posted",
      reason: "Recorded after the owner posted manually.",
      postUrl: "https://www.threads.net/@owner/post/example"
    };
    await expect(applyPersonalGrowthAdminAction(timeline, { root, now: new Date("2026-08-27T11:00:00.000Z") })).resolves.toMatchObject({ changed: true });
    await expect(applyPersonalGrowthAdminAction(timeline, { root, now: new Date("2026-08-27T11:01:00.000Z") })).resolves.toMatchObject({ changed: false });
    await expect(applyPersonalGrowthAdminAction(decision, { root, now: new Date("2026-08-27T11:02:00.000Z") })).resolves.toMatchObject({ changed: true });
    const history = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/history.json"), "utf8")) as { events: Array<Record<string, unknown>> };
    const reasons = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/timeline-reasons.json"), "utf8")) as { reasons: Array<Record<string, unknown>> };
    const decisions = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/thread-decisions.json"), "utf8")) as { decisions: Array<Record<string, unknown>> };
    expect(history.events).toHaveLength(1);
    expect(reasons.reasons).toEqual([expect.objectContaining({ reason: timeline.reason })]);
    expect(decisions.decisions).toEqual([expect.objectContaining({ action: "posted", postUrl: decision.postUrl })]);
  });

  it("rejects extra authority, malformed URLs and unbounded action names", () => {
    for (const operation of ["approved", "rejected", "snoozed", "posted"]) {
      expect(parsePersonalGrowthAdminAction({
        type: "thread",
        suggestionId: "pg-thread-1111111111111111",
        operation,
        reason: operation === "posted" ? "Recorded after manual posting." : null,
        postUrl: operation === "posted" ? "https://www.threads.net/@owner/post/example" : null
      })).toMatchObject({ operation });
    }
    expect(parsePersonalGrowthAdminAction({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "publish", reason: null, postUrl: null })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "approved", reason: null, postUrl: null, publish: true })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "anchor", lane: "okraj", date: "2026-99-99", reason: "bad" })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "timeline", lane: "bbarak", occurrenceDate: "2026-08-27", operation: "completed", reason: "done", rescheduledTo: null, finalUrl: "http://unsafe.test", collaborationUrl: null })).toBeNull();
  });
});
