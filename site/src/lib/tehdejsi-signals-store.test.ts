import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { saveTehdejsiSignalHarvest } from "./tehdejsi-signals-store";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function rootWithApproval(approved: boolean): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-signal-store-")); roots.push(root);
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state/INBOX.md"), `- [${approved ? "x" : " "}] HUMAN_APPROVAL TS-RESULTS-005 — synthetic test authority.\n`);
  return root;
}

describe("Tehdejsi svet signal store", () => {
  const input = { sourceLabel: "Synthetic owner paste", comments: ["A fictional recollection.", "[year: 1988] Another made-up memory."] };

  it("keeps paste-in closed until the named human approval is signed", async () => {
    await expect(saveTehdejsiSignalHarvest(input, { root: await rootWithApproval(false) }))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("TS-RESULTS-005 is pending") });
  });

  it("writes an idempotent owner-paste record without contacting a platform", async () => {
    const root = await rootWithApproval(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = await saveTehdejsiSignalHarvest(input, { root, now: new Date("2026-08-15T12:00:00.000Z") });
    const second = await saveTehdejsiSignalHarvest(input, { root, now: new Date("2026-08-15T13:00:00.000Z") });
    expect(first).toMatchObject({ changed: true, harvest: { source: "owner-paste", ventureId: "tehdejsi-svet", comments: input.comments } });
    expect(second).toMatchObject({ changed: false, harvest: { id: first.harvest.id, pastedAt: "2026-08-15T12:00:00.000Z" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(root, `state/ventures/tehdejsi-svet/signals/harvests/${first.harvest.id}.json`), "utf8")))
      .not.toHaveProperty("platformAccount");
  });

  it("refuses duplicate, oversized and unknown input rather than normalising it into authority", async () => {
    const root = await rootWithApproval(true);
    for (const poison of [
      { ...input, comments: ["same", "SAME"] },
      { ...input, comments: ["x".repeat(601)] },
      { ...input, scrapedBy: "api" }
    ]) await expect(saveTehdejsiSignalHarvest(poison, { root })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
