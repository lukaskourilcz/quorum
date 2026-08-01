import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDiscrepancyResolution, saveDiscrepancyResolution } from "./fightaiq-discrepancy-store";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("FightAIQ disagreement review", () => {
  it("rejects unbounded or path-like review input", () => {
    expect(parseDiscrepancyResolution({ fighterRef: "../../admin", field: "reachCm", selectedSourceRef: "source:a", reason: "checked" })).toBeNull();
    expect(parseDiscrepancyResolution({ fighterRef: "ufc:test-fighter", field: "../reach", selectedSourceRef: "source:a", reason: "checked" })).toBeNull();
  });

  it("records the chosen source but keeps a lone value out of the model", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-discrepancy-"));
    const target = path.join(root, "state", "mma", "fighters", "ufc:test-fighter.json");
    await mkdir(path.dirname(target), { recursive: true });
    const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "..", "contracts", "fixtures", "fighter-record.valid.json"), "utf8"));
    await writeFile(target, JSON.stringify({
      ...fixture,
      schemaVersion: "fighter-card/1",
      id: "ufc:test-fighter",
      slug: "test-fighter",
      org: "ufc",
      canonicalName: "Test Fighter",
      fields: {
        name: { value: "Test Fighter", sourceRefs: ["source:a", "source:b"], retrievedAt: "2026-08-01T00:00:00.000Z", status: "verified", corroborated: true },
        reachCm: { value: 180, sourceRefs: ["source:a"], retrievedAt: "2026-08-01T00:00:00.000Z", status: "disputed", corroborated: false }
      },
      criticalFields: ["reachCm"],
      discrepancies: [{ field: "reachCm", values: [{ value: 180, sourceRef: "source:a" }, { value: 182, sourceRef: "source:b" }], status: "open" }],
      completeness: 1,
      corroboration: 0.5,
      modelEligible: false,
      modelVersion: "mma-1.0.0+aaaaaaaa",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }, null, 2));
    const resolution = parseDiscrepancyResolution({ fighterRef: "ufc:test-fighter", field: "reachCm", selectedSourceRef: "source:b", reason: "The official commission measurement is newer." }, new Date("2026-08-01T12:00:00Z"));
    expect(resolution).not.toBeNull();
    await expect(saveDiscrepancyResolution(resolution!, root)).resolves.toBe("filesystem");
    const stored = JSON.parse(await readFile(target, "utf8"));
    expect(stored.fields.reachCm).toMatchObject({ value: 182, sourceRefs: ["source:b"], status: "provisional", corroborated: false });
    expect(stored.discrepancies[0]).toMatchObject({ status: "resolved", selectedSourceRef: "source:b", resolution: "The official commission measurement is newer." });
    expect(stored.modelEligible).toBe(false);
  });
});
