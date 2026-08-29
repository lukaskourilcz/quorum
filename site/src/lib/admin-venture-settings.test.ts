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
 * The pause switches against a scratch registry: the four ventures others depend on never
 * appear and can never be flipped, an operating venture flips both ways with a one-field diff,
 * and anything else is refused with a sentence the owner can read.
 */

function registry() {
  return {
    schemaVersion: "venture-registry/1",
    ventures: [
      { id: "caught-up", name: "Caught Up", status: "operating" },
      { id: "door-money", name: "Door Money", status: "paused" },
      { id: "carousel-studio", name: "Design Lab", status: "operating" },
      { id: "goviral", name: "GoVIRAL", status: "operating" },
      { id: "fightaiq", name: "FightAIQ", status: "operating" },
      { id: "webdev-signal", name: "WebDev Signal", status: "exploration" }
    ]
  };
}

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "venture-settings-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config", "ventures.json"), `${JSON.stringify(registry(), null, 2)}\n`);
  return root;
}

describe("the owner's project switches", () => {
  it("lists only the ventures whose pause breaks nothing else", async () => {
    const root = await scratchRoot();
    const settings = await readAdminVentureSettings(root);
    expect(settings.ventures.map(({ id }) => id)).toEqual(["caught-up", "door-money"]);
    expect(settings.ventures).toContainEqual({ id: "door-money", name: "Door Money", paused: true });
    for (const id of Object.keys(UNPAUSABLE_VENTURES)) {
      expect(settings.ventures.some((venture) => venture.id === id), id).toBe(false);
    }
  });

  it("flips a venture both ways and touches nothing else in the file", async () => {
    const root = await scratchRoot();
    const before = await readFile(path.join(root, "config", "ventures.json"), "utf8");
    const paused = await setVenturePaused("caught-up", true, root);
    expect(paused.ventures).toContainEqual({ id: "caught-up", name: "Caught Up", paused: true });
    const resumed = await setVenturePaused("caught-up", false, root);
    expect(resumed.ventures).toContainEqual({ id: "caught-up", name: "Caught Up", paused: false });
    const after = await readFile(path.join(root, "config", "ventures.json"), "utf8");
    expect(after).toBe(before);
  });

  it("refuses the shared machinery, an unknown venture and an unfounded one", async () => {
    const root = await scratchRoot();
    for (const id of ["carousel-studio", "goviral", "fightaiq"]) {
      await expect(setVenturePaused(id, true, root), id).rejects.toThrowError(VentureSettingsPersistenceError);
    }
    await expect(setVenturePaused("not-a-venture", true, root)).rejects.toThrowError(/does not exist/u);
    await expect(setVenturePaused("webdev-signal", true, root)).rejects.toThrowError(VentureSettingsPersistenceError);
  });
});
