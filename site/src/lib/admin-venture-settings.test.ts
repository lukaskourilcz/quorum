import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  UNPAUSABLE_VENTURES,
  VentureSettingsPersistenceError,
  readAdminVentureSettings,
  setVenturePaused
} from "./admin-venture-settings";

/**
 * The pause switches against a scratch registry: the three ventures others depend on never
 * appear and can never be flipped, an operating venture flips both ways with a one-field diff,
 * an exploration never appears, and anything else is refused with a sentence the owner can read.
 */

function registry() {
  return {
    schemaVersion: "venture-registry/1",
    ventures: [
      { id: "caught-up", name: "Caught Up", status: "operating" },
      { id: "door-money", name: "Door Money", status: "paused", pausedOn: "2026-08-29", day: { kind: "dm-day" }, meetings: [{ kind: "dm-desk" }] },
      { id: "carousel-studio", name: "Design Lab", status: "operating" },
      { id: "goviral", name: "GoVIRAL", status: "operating" },
      { id: "fightaiq", name: "FightAIQ", status: "paused", pausedOn: "2026-09-15", meetings: [{ kind: "mma-intake" }] },
      { id: "webdev-signal", name: "WebDev Signal", status: "operating" },
      { id: "contest-radar", name: "Contest Radar", status: "exploration" }
    ]
  };
}

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "venture-settings-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config", "ventures.json"), `${JSON.stringify(registry(), null, 2)}\n`);
  await mkdir(path.join(root, "state", "meetings", "skips"), { recursive: true });
  for (const file of ["2026-08-27-dm-desk.json", "2026-08-28-dm-day.json", "2026-09-14-mma-intake.json", "not-a-record.txt"]) {
    await writeFile(path.join(root, "state", "meetings", file), "{}\n");
  }
  // A skip is not a sitting.
  await writeFile(path.join(root, "state", "meetings", "skips", "2026-09-20-dm-day.json"), "{}\n");
  return root;
}

describe("the owner's project switches", () => {
  it("lists only the running ventures whose pause breaks nothing else", async () => {
    const root = await scratchRoot();
    const settings = await readAdminVentureSettings(root);
    expect(settings.ventures.map(({ id }) => id)).toEqual(["caught-up", "webdev-signal"]);
    // WebDev Signal runs a daily scan inside the Caught Up day now, so its switch is the owner's.
    expect(settings.ventures).toContainEqual({ id: "webdev-signal", name: "WebDev Signal", paused: false });
    for (const id of Object.keys(UNPAUSABLE_VENTURES)) {
      expect(settings.ventures.some((venture) => venture.id === id), id).toBe(false);
    }
  });

  it("lists every paused venture in its own table, newest pause first, with its last sitting", async () => {
    const root = await scratchRoot();
    const settings = await readAdminVentureSettings(root);
    expect(settings.paused).toEqual([
      {
        id: "fightaiq",
        name: "FightAIQ",
        pausedOn: "2026-09-15",
        lastMeetingOn: "2026-09-14",
        resumable: false,
        note: UNPAUSABLE_VENTURES.fightaiq
      },
      { id: "door-money", name: "Door Money", pausedOn: "2026-08-29", lastMeetingOn: "2026-08-28", resumable: true, note: null }
    ]);
  });

  it("flips a venture both ways, dates the pause, and touches nothing else in the file", async () => {
    const root = await scratchRoot();
    const before = await readFile(path.join(root, "config", "ventures.json"), "utf8");
    const paused = await setVenturePaused("caught-up", true, root);
    expect(paused.ventures.some((venture) => venture.id === "caught-up")).toBe(false);
    const row = paused.paused.find((venture) => venture.id === "caught-up");
    expect(row?.pausedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(row?.resumable).toBe(true);
    const resumed = await setVenturePaused("caught-up", false, root);
    expect(resumed.ventures).toContainEqual({ id: "caught-up", name: "Caught Up", paused: false });
    expect(resumed.paused.some((venture) => venture.id === "caught-up")).toBe(false);
    const after = await readFile(path.join(root, "config", "ventures.json"), "utf8");
    expect(after).toBe(before);
  });

  it("refuses the shared machinery, an unknown venture and an exploration", async () => {
    const root = await scratchRoot();
    for (const id of ["carousel-studio", "goviral", "fightaiq"]) {
      await expect(setVenturePaused(id, true, root), id).rejects.toThrowError(VentureSettingsPersistenceError);
    }
    await expect(setVenturePaused("not-a-venture", true, root)).rejects.toThrowError(/does not exist/u);
    await expect(setVenturePaused("contest-radar", true, root)).rejects.toThrowError(/Only an operating project/u);
    const paused = await setVenturePaused("webdev-signal", true, root);
    expect(paused.paused.map(({ id }) => id)).toContain("webdev-signal");
  });
});
