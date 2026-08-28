import { createHash } from "node:crypto";
import type { WebDevEvidenceBrief, WebDevRecord, WebDevSelection } from "../../../contracts/webdev-signal.js";
import { WebDevEvidenceBriefSchema } from "../../../contracts/webdev-signal.js";

const BRIEF_VERSION = "1.0.0";
const PROMPT_VERSION = "1.0.0";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string, maximum = 500): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximum);
}

export class WebDevEvidenceBriefError extends Error {}

export function buildWebDevEvidenceBrief(input: {
  record: WebDevRecord;
  selection: WebDevSelection;
  selectionRef: string;
}): WebDevEvidenceBrief {
  const { record, selection } = input;
  if (selection.outcome !== "selected" || selection.selectedRecordId !== record.id) {
    throw new WebDevEvidenceBriefError("selection-does-not-accept-record");
  }
  const selected = selection.candidates.find(({ recordId }) => recordId === record.id);
  if (!selected || selected.gate !== "eligible") throw new WebDevEvidenceBriefError("selected-record-is-not-eligible");
  if (record.agreement.status === "conflicted" || record.agreement.conflictRefs.length > 0) {
    throw new WebDevEvidenceBriefError("selected-record-has-unresolved-conflict");
  }

  const claims: WebDevEvidenceBrief["claims"] = [];
  const addClaim = (id: string, text: string, evidenceRefs = record.evidenceRefs, confidence = record.developerImpact.confidence): string => {
    claims.push({ id, text: bounded(text), confidence, evidenceRefs: evidenceRefs.slice(0, 20), requiredInBothLocales: true });
    return id;
  };
  const developmentClaim = addClaim("claim:development", `${record.project}: ${record.title}`);
  const impactClaim = addClaim("claim:impact", record.developerImpact.summary, record.developerImpact.evidenceRefs);
  const whatChangedClaimIds = [developmentClaim];
  const whyItMattersClaimIds = [impactClaim];
  if (record.versionRefs.length > 0) {
    whatChangedClaimIds.push(addClaim("claim:versions", `The official source names ${record.versionRefs.join(", ")}.`));
  }
  if (record.affectedVersions.length > 0 || record.affectedConfigurations.length > 0) {
    const scope = [...record.affectedVersions, ...record.affectedConfigurations].join(", ");
    const id = addClaim("claim:affected", `The stated affected scope is ${scope}.`);
    whatChangedClaimIds.push(id);
    whyItMattersClaimIds.push(id);
  }
  if (record.fixedVersions.length > 0) {
    whatChangedClaimIds.push(addClaim("claim:fixed", `The stated fixed scope is ${record.fixedVersions.join(", ")}.`));
  }
  const safeActions = record.safeActions.map((action, index) => {
    const claimId = addClaim(`claim:action:${index + 1}`, action.action, action.evidenceRefs);
    return { id: action.id, text: action.action, claimIds: [claimId] };
  });
  const uncertainty = [
    ...(record.agreement.status === "single-official" ? ["The brief relies on one official source; no second official confirmation is recorded."] : []),
    ...(record.releaseStability === "unknown" ? ["The accepted evidence does not establish a stable release state."] : [])
  ];
  const lifetimeDays = ["security-advisory", "breaking-change", "deprecation"].includes(record.changeKind) ? 7 : 14;
  const recordHash = hash(record);
  const core = {
    schemaVersion: "webdev-evidence-brief/1" as const,
    selectedRecordId: record.id,
    selectionRef: input.selectionRef,
    selectionHash: selection.idempotencyHash,
    inputSnapshotHash: selection.inputSnapshotHash,
    recordHash,
    canonicalDevelopment: bounded(`${record.project}: ${record.title}`, 280),
    claims,
    whatChangedClaimIds,
    whyItMattersClaimIds,
    affectedAudienceIds: record.developerImpact.audienceIds,
    safeActions,
    affectedVersions: record.affectedVersions,
    fixedVersions: record.fixedVersions,
    releaseStability: record.releaseStability,
    uncertainty,
    conflicts: [],
    sources: [{ url: record.canonicalUrl, label: `${record.project} official source`, authority: record.authority }],
    prohibitedClaims: [
      "Every web project is affected.",
      "The change is stable when the accepted record says beta or preview.",
      "A benchmark or adoption rate not present in the accepted evidence."
    ],
    prohibitedPhrases: ["game changer", "you won't believe", "revoluce", "změní všechno", "comment below", "co si o tom myslíte"],
    expiresAt: new Date(Date.parse(record.publishedAt) + lifetimeDays * 86_400_000).toISOString(),
    updateConditions: [
      "An official source revises the version, stability, affected or fixed scope.",
      "The selection is corrected or superseded.",
      "An accepted official source introduces a material conflict."
    ],
    promptVersion: PROMPT_VERSION,
    extractionVersion: record.extractionVersion,
    version: BRIEF_VERSION
  };
  const id = `brief:${hash(core).slice(0, 24)}`;
  return WebDevEvidenceBriefSchema.parse({ ...core, id, contentHash: hash({ ...core, id }) });
}
