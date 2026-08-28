import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WebDevCandidateSchema } from "../src/contracts/webdev-signal.js";
import { repoRoot } from "../src/paths.js";
import { buildWebDevEvidenceBrief } from "../src/ventures/webdev-signal/editor/brief.js";
import { loadWebDevSelectionConfig } from "../src/ventures/webdev-signal/selection/config.js";
import { decideWebDevEdition } from "../src/ventures/webdev-signal/selection/decision.js";

const NOW = "2026-08-28T08:00:00.000Z";

async function acceptedSecuritySelection() {
  const candidate = WebDevCandidateSchema.parse(JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "webdev-candidate.valid.json"), "utf8")));
  return decideWebDevEdition({ candidates: [candidate], pragueDate: "2026-08-28", now: NOW, config: await loadWebDevSelectionConfig() });
}

describe("WebDev Signal immutable evidence brief", () => {
  it("builds one language-neutral, source-backed brief from the accepted record", async () => {
    const decided = await acceptedSecuritySelection();
    const record = decided.records[0]!;
    const brief = buildWebDevEvidenceBrief({
      record,
      selection: decided.selection,
      selectionRef: "state/ventures/webdev-signal/selections/2026-08-28.json"
    });
    expect(brief).toMatchObject({
      selectedRecordId: record.id,
      selectionHash: decided.selection.idempotencyHash,
      inputSnapshotHash: decided.selection.inputSnapshotHash,
      affectedVersions: ["<4.2.1"],
      fixedVersions: ["4.2.1"],
      releaseStability: "unknown",
      conflicts: [],
      promptVersion: "1.0.0",
      extractionVersion: "1.0.0"
    });
    expect(brief.claims.map(({ id }) => id)).toEqual(expect.arrayContaining(["claim:development", "claim:impact", "claim:affected", "claim:fixed", "claim:action:1"]));
    expect(brief.claims.every(({ evidenceRefs }) => evidenceRefs.length > 0)).toBe(true);
    expect(JSON.stringify(brief)).not.toMatch(/provider|credential|publishAuthorized|rawBody/u);
  });

  it("is deterministic and changes when the accepted selection changes", async () => {
    const decided = await acceptedSecuritySelection();
    const input = { record: decided.records[0]!, selection: decided.selection, selectionRef: "state/ventures/webdev-signal/selections/2026-08-28.json" };
    const first = buildWebDevEvidenceBrief(input);
    expect(buildWebDevEvidenceBrief(input)).toEqual(first);
    const correctedSelection = { ...decided.selection, idempotencyHash: "f".repeat(64), ownerCorrectionRef: "owner:correction" };
    const corrected = buildWebDevEvidenceBrief({ ...input, selection: correctedSelection });
    expect(corrected.contentHash).not.toBe(first.contentHash);
    expect(corrected.selectionHash).toBe("f".repeat(64));
  });

  it("refuses NO_EDITION, mismatched or conflicted truth", async () => {
    const decided = await acceptedSecuritySelection();
    const record = decided.records[0]!;
    expect(() => buildWebDevEvidenceBrief({
      record,
      selection: { ...decided.selection, outcome: "NO_EDITION", selectedRecordId: null, noEditionReason: "fixture quiet day" },
      selectionRef: "selection:quiet"
    })).toThrow(/does-not-accept/);
    expect(() => buildWebDevEvidenceBrief({
      record: { ...record, agreement: { status: "conflicted", agreeingSourceIds: record.sourceIds, conflictRefs: record.evidenceRefs } },
      selection: decided.selection,
      selectionRef: "selection:conflict"
    })).toThrow(/unresolved-conflict/);
  });
});
