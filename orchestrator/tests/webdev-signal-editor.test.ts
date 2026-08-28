import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WebDevCandidateSchema } from "../src/contracts/webdev-signal.js";
import { repoRoot } from "../src/paths.js";
import { buildWebDevEvidenceBrief } from "../src/ventures/webdev-signal/editor/brief.js";
import {
  createDeterministicWebDevPackages,
  holdWebDevPackage,
  validateGeneratedWebDevPackages,
  type WebDevSocialContentLimits
} from "../src/ventures/webdev-signal/editor/packages.js";
import { loadWebDevSelectionConfig } from "../src/ventures/webdev-signal/selection/config.js";
import { decideWebDevEdition } from "../src/ventures/webdev-signal/selection/decision.js";

const NOW = "2026-08-28T08:00:00.000Z";
const LIMITS: WebDevSocialContentLimits = {
  threadsPrimaryMaxChars: 500,
  threadsContinuationMaxItems: 1,
  threadsContinuationMaxChars: 500,
  instagramCaptionMaxChars: 2_200,
  instagramPanelsMin: 4,
  instagramPanelsMax: 6
};

async function acceptedSecuritySelection() {
  const candidate = WebDevCandidateSchema.parse(JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "webdev-candidate.valid.json"), "utf8")));
  return decideWebDevEdition({ candidates: [candidate], pragueDate: "2026-08-28", now: NOW, config: await loadWebDevSelectionConfig() });
}

async function acceptedBrief() {
  const decided = await acceptedSecuritySelection();
  const record = decided.records[0]!;
  const brief = buildWebDevEvidenceBrief({ record, selection: decided.selection, selectionRef: "state/ventures/webdev-signal/selections/2026-08-28.json" });
  return { ...decided, record, brief };
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

describe("WebDev Signal native social packages", () => {
  it("creates independent Czech and English packages with exact claim parity", async () => {
    const { brief, record } = await acceptedBrief();
    const packages = createDeterministicWebDevPackages({ brief, briefRef: "state/ventures/webdev-signal/briefs/fixture.json", record, limits: LIMITS });
    expect(packages.cs.headline).toContain("oprava");
    expect(packages.en.headline).toContain("fix");
    expect(packages.cs.explanation).not.toBe(packages.en.explanation);
    expect(packages.cs.claimIdsUsed).toEqual(packages.en.claimIdsUsed);
    expect(packages.cs.instagramCaption).toContain(brief.sources[0]!.url);
    expect(packages.en.threads.primary).toContain(brief.sources[0]!.url);
    expect(packages.cs).toMatchObject({ status: "draft", editorialProvenance: { modelRole: "WEBDEV_SIGNAL_EDITOR", deterministic: true, provider: null, model: null } });
    expect(validateGeneratedWebDevPackages({ brief, record, packages, limits: LIMITS })).toEqual({ cs: [], en: [], pair: [] });
  });

  it("uses variable 4, 5 and 6 panel payloads from actual evidence complexity", async () => {
    const { brief, record } = await acceptedBrief();
    const six = createDeterministicWebDevPackages({ brief, briefRef: "brief:fixture", record, limits: LIMITS });
    const five = createDeterministicWebDevPackages({ brief: { ...brief, uncertainty: [] }, briefRef: "brief:fixture", record, limits: LIMITS });
    const four = createDeterministicWebDevPackages({ brief: { ...brief, uncertainty: [], safeActions: [] }, briefRef: "brief:fixture", record: { ...record, safeActions: [] }, limits: LIMITS });
    expect([four.en.instagramPanels.length, five.en.instagramPanels.length, six.en.instagramPanels.length]).toEqual([4, 5, 6]);
  });

  it("keeps beta and preview wording explicitly non-stable", async () => {
    const { brief, record } = await acceptedBrief();
    const previewBrief = { ...brief, releaseStability: "preview" as const, uncertainty: [] };
    const previewRecord = { ...record, changeKind: "beta-preview" as const, releaseStability: "preview" as const, safeActions: [], affectedVersions: [], fixedVersions: [], security: { severity: "none" as const, advisoryIds: [] } };
    const packages = createDeterministicWebDevPackages({ brief: previewBrief, briefRef: "brief:preview", record: previewRecord, limits: LIMITS });
    expect(packages.cs.headline).toContain("náhled");
    expect(packages.en.headline).toContain("preview");
    expect(validateGeneratedWebDevPackages({ brief: previewBrief, record: previewRecord, packages, limits: LIMITS })).toEqual({ cs: [], en: [], pair: [] });
  });

  it("rejects source copying, hype, over-limit Threads and unsupported versions locally", async () => {
    const { brief, record } = await acceptedBrief();
    const packages = createDeterministicWebDevPackages({ brief, briefRef: "brief:fixture", record, limits: LIMITS });
    const poisoned = structuredClone(packages);
    poisoned.en.headline = record.title;
    poisoned.en.deck = "A game changer — comment below.";
    poisoned.en.threads.primary = "x".repeat(501);
    poisoned.en.affectedVersionRefsUsed.push("invented-99.0");
    const reasons = validateGeneratedWebDevPackages({ brief, record, packages: poisoned, limits: LIMITS });
    expect(reasons.en).toEqual(expect.arrayContaining(["unsupported-version", "threads-over-limit", "hype-or-engagement-bait", "source-copy-overlap"]));
    expect(reasons.cs).toEqual([]);
    const held = holdWebDevPackage(poisoned.en, reasons.en);
    expect(held).toMatchObject({ status: "held" });
    expect(held.heldReason).toContain("unsupported-version");
    expect(packages.cs.status).toBe("draft");
  });

  it("rejects literal cross-locale cloning without mutating the brief", async () => {
    const { brief, record } = await acceptedBrief();
    const packages = createDeterministicWebDevPackages({ brief, briefRef: "brief:fixture", record, limits: LIMITS });
    const clone = structuredClone(packages);
    clone.cs.headline = clone.en.headline;
    clone.cs.deck = clone.en.deck;
    clone.cs.explanation = clone.en.explanation;
    clone.cs.threads.primary = clone.en.threads.primary;
    const reasons = validateGeneratedWebDevPackages({ brief, record, packages: clone, limits: LIMITS });
    expect(reasons.pair).toContain("literal-translation-or-clone");
    expect(brief).toEqual((await acceptedBrief()).brief);
  });
});
