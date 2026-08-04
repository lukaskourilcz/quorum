import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveEditorialSlate } from "../src/mma-files/live.js";

import { repoRoot, stateRoot } from "../src/paths.js";
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "forslot-"));
  roots.push(root);
  return root;
}

async function plantFighter(root: string, id: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(stateRoot, "mma", "fighters", `${id}.json`), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "mma", "fighters"), { recursive: true });
  await writeFile(path.join(root, "mma", "fighters", `${id}.json`), JSON.stringify({ ...raw, ...overrides }));
}

/**
 * Which slot a derived slate hands the strongest subject to.
 *
 * Each run derives its own slate, so before this the AM slot was always filled first and a PM
 * run could name the same fighter the morning had already published.
 */
describe("a slate derived for one slot", () => {
  it("gives a pm run the strongest subject when am published nothing", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    await plantFighter(root, "ufc:aleksandar-rakic", { completeness: 0.7 });
    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T18:00:00.000Z"), { forSlot: "pm" });
    expect(slate!.slots.map((slot) => [slot.slot, slot.status, slot.subjectRefs[0]])).toEqual([
      ["am", "assigned", "ufc:aleksandar-rakic"],
      ["pm", "assigned", "oktagon:gustavo-lopez"]
    ]);
  });

  it("kills the caller's counterpart slot, not always pm, and keeps a verdict for it", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T18:00:00.000Z"), { forSlot: "pm" });
    expect(slate!.slots[0].status).toBe("killed");
    expect(slate!.slots[1].subjectRefs).toEqual(["oktagon:gustavo-lopez"]);
    expect(slate!.vaultVerdicts.map((verdict) => verdict.subjectRef)).toEqual([
      "oktagon:gustavo-lopez",
      "missing:2026-08-03:am"
    ]);
  });

  it("emits the real event card path for a fight-week preview", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    const raw = JSON.parse(await readFile(path.join(stateRoot, "mma", "events", "ufc", "ufc-330-makhachev-vs-machado-garry.json"), "utf8")) as Record<string, unknown>;
    await mkdir(path.join(root, "mma", "events"), { recursive: true });
    await writeFile(path.join(root, "mma", "events", "ufc-330-makhachev-vs-machado-garry.json"), JSON.stringify({ ...raw, startsAtUtc: "2026-08-04T00:00:00.000Z" }));
    const bout = await readFile(path.join(stateRoot, "mma", "bouts", "ufc", "ufc-ufc-330-makhachev-vs-machado-garry-bout-islam-makhachev-vs-ian-machado-garry-1.json"), "utf8");
    await mkdir(path.join(root, "mma", "bouts"), { recursive: true });
    await writeFile(path.join(root, "mma", "bouts", "bout.json"), bout);

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));
    const verdict = slate!.vaultVerdicts.find((entry) => entry.subjectRef.includes(":event:"))!;
    expect(verdict.evidenceRef).toBe("state/mma/events/ufc/ufc-330-makhachev-vs-machado-garry.json");
    // The ref must name a file that actually exists in the repository. The line above is what
    // makes the assertion below safe: `evidenceRef` is optional now that a verdict may instead
    // carry a note about evidence that could not be resolved, and this one is neither.
    await expect(readFile(path.join(repoRoot, verdict.evidenceRef!), "utf8")).resolves.toContain("event-card/1");
  });
});
