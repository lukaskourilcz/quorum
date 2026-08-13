import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { updateTehdejsiProductInsight } from "./tehdejsi-product-insights-store";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixtureRoot(): Promise<{ root: string; insight: Record<string, unknown> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-insight-store-")); roots.push(root);
  const insight = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/tehdejsi-product-insight.valid.json"), "utf8")) as Record<string, unknown>;
  const directory = path.join(root, "state/ventures/tehdejsi-svet/product-insights");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${insight.id}.json`), `${JSON.stringify(insight, null, 2)}\n`);
  return { root, insight };
}

describe("Tehdejsi svet product-insight store", () => {
  it("updates only owner fields and never contacts the product repository", async () => {
    const { root, insight } = await fixtureRoot();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const updated = await updateTehdejsiProductInsight({ id: insight.id, status: "accepted", ownerNote: "Owner will review this synthetic gap." }, { root, now: new Date("2026-08-13T10:00:00.000Z") });
    expect(updated).toMatchObject({ changed: true, insight: { status: "accepted", ownerNote: "Owner will review this synthetic gap.", finding: insight.finding, evidence: insight.evidence } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await updateTehdejsiProductInsight({ id: insight.id, status: "accepted", ownerNote: "Owner will review this synthetic gap." }, { root }))
      .toMatchObject({ changed: false });
  });

  it("allows only the owner decision state machine and preserves terminal records", async () => {
    const { root, insight } = await fixtureRoot();
    await updateTehdejsiProductInsight({ id: insight.id, status: "rejected", ownerNote: null }, { root });
    await expect(updateTehdejsiProductInsight({ id: insight.id, status: "accepted", ownerNote: null }, { root }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateTehdejsiProductInsight({ id: insight.id, status: "implemented-by-agent", ownerNote: null }, { root }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });
});
