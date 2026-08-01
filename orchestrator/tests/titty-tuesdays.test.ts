import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { VisualWeightsSchema } from "../src/contracts/visual-weights.js";
import { repoRoot } from "../src/paths.js";
import { parseTasteDocument } from "../src/taste/model.js";
import {
  createTittyTuesdaysBootstrapMeeting,
  loadSeasonFile
} from "../src/titty-tuesdays/bootstrap.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

describe("Titty Tuesdays bootstrap", () => {
  it("registers venture 002 on the resolved 11:00 Prague schedule", async () => {
    const registry = await loadVentureRegistry();
    const venture = registry.ventures.find((candidate) => candidate.id === "titty-tuesdays");
    expect(venture).toMatchObject({
      status: "operating",
      taste: true,
      ledgerNamespace: "titty-tuesdays",
      adminTabs: ["plans", "ideas", "visuals"],
      pendingApproval: "budget-2026-08d",
      meetings: [expect.objectContaining({ kind: "tt-marketing", cadence: "daily@11:00", envelopeUsd: 0.08 })]
    });
  });

  it("stores exactly four non-purchasable crop-top concepts", async () => {
    const season = await loadSeasonFile(repoRoot);
    expect(season.products).toHaveLength(4);
    expect(season.products.every((product) => product.status === "concept")).toBe(true);
    expect(season.products.every((product) => product.concept.includes("TITTY TUESDAYS"))).toBe(true);
    expect(season.campaignArc).toContain("never imply stock or a release");
  });

  it("reproduces the committed dry bootstrap meeting", async () => {
    const season = await loadSeasonFile(repoRoot);
    const committed = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "state", "meetings", "2026-08-01-tt-marketing.json"),
      "utf8"
    )));
    expect(committed).toEqual(createTittyTuesdaysBootstrapMeeting(season));
    expect(committed.fixture).toBe(true);
    expect(committed.ledger.actualCycleUsd).toBe(0);
    expect(committed.growthPlan).toContain("NO_POST");
  });

  it("starts taste and visual memory without inventing owner preferences", async () => {
    const taste = parseTasteDocument(await readFile(
      path.join(repoRoot, "state", "taste", "titty-tuesdays", "TASTE.md"),
      "utf8"
    ));
    expect(taste).toMatchObject({ watermark: null, pursue: [], avoid: [], open: [] });
    const weights = VisualWeightsSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "config", "visual-weights", "titty-tuesdays.json"),
      "utf8"
    )));
    expect(Object.values(weights.weights).every((weight) => weight >= 0.1)).toBe(true);
    expect(weights.adjustments).toEqual([]);
  });

  it("records the founding approval while keeping budget, commerce and platform actions pending", async () => {
    const [brand, founding, budget, platform] = await Promise.all([
      readFile(path.join(repoRoot, "state", "ventures", "titty-tuesdays", "BRAND.md"), "utf8"),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-titty-tuesdays-founding.md"), "utf8"),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-budget-raise.md"), "utf8"),
      readFile(path.join(repoRoot, ".claude", "skills", "titty-tuesdays-brandbook", "references", "platform-policy.md"), "utf8")
    ]);
    expect(brand).toContain("No commerce, payment, inventory or availability claims");
    expect(founding).toContain("Status: countersigned");
    expect(budget).toContain("Automatic fallback shape B");
    expect(platform).toContain("No primary source found");
  });
});
