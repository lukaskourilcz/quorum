import { cp, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VentureRegistrySchema } from "../src/contracts/venture-registry.js";
import { checkTemplateFounding, foundTemplateVenture } from "../src/ventures/founding.js";
import { repoRoot } from "../src/paths.js";
import { VentureTemplateCandidateSchema, VentureTemplateSchema } from "../src/contracts/autonomy.js";

const candidate = VentureTemplateCandidateSchema.parse({
  schemaVersion: "venture-template-candidate/1",
  proposalRef: "state/ventures/incubator/niche-proposals/dummy.json",
  slug: "dummy-desk",
  name: "Dummy Desk",
  deliveryTarget: "boardless-site",
  dailyEnvelopeUsd: 0.1,
  cadenceHourPrague: 16,
  cast: ["CANVAS", "JAB", "AUDIT"],
  styleBrief: "Write direct, sourced daily briefs.",
  requiresNewCredentials: false,
  requiresNewAccounts: false,
  includesCommerce: false,
  includesPayments: false,
  includesAds: false,
  includesPersonalData: false,
  createsLegalSurface: false,
  createsSocialAccount: false
});

describe("template founding", () => {
  it("rejects collisions and forbidden surfaces", async () => {
    const [templateRaw, registryRaw] = await Promise.all([
      readFile(path.join(repoRoot, "config/venture-template.json"), "utf8"),
      readFile(path.join(repoRoot, "config/ventures.json"), "utf8")
    ]);
    const result = checkTemplateFounding({
      candidate: { ...candidate, cadenceHourPrague: 17, includesCommerce: true },
      template: VentureTemplateSchema.parse(JSON.parse(templateRaw)),
      registry: VentureRegistrySchema.parse(JSON.parse(registryRaw)),
      rosterIds: new Set(candidate.cast)
    });
    expect(result.problems).toEqual(expect.arrayContaining(["calendar-slot-collision", "commerce-surface"]));
  });

  it("founds and cleanly isolates a compliant dummy venture in a fixture repo", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-founding-"));
    await cp(path.join(repoRoot, "config"), path.join(root, "config"), { recursive: true });
    const result = await foundTemplateVenture({ repoRoot: root, candidateValue: candidate, now: new Date("2026-08-01T12:00:00.000Z") });
    expect(result.status).toBe("founded");
    const registry = VentureRegistrySchema.parse(JSON.parse(await readFile(path.join(root, "config/ventures.json"), "utf8")));
    expect(registry.ventures.find((venture) => venture.id === "dummy-desk")?.templateOperation)
      .toMatchObject({ deliveryTarget: "boardless-site", cast: ["CANVAS", "JAB", "AUDIT"] });
    expect(await readFile(path.join(root, "state/ventures/dummy-desk/STYLEBOOK.md"), "utf8"))
      .toContain("Non-negotiable rules");
  });
});
