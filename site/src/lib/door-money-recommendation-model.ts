const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const FORMATS = ["carousel", "single-image", "thread", "caption", "short-video-script"] as const;
const COPY_KINDS = ["cover", "body", "outro", "thread-post", "caption", "script", "shot-list"] as const;
const STATUSES = ["draft", "approved", "posted", "archived", "rejected"] as const;
const PLATFORMS = ["instagram", "tiktok", "x", "threads", "youtube"] as const;
const GATES = ["voice", "claims", "quotes", "excerpt-cap", "duplicate", "cta-frequency", "living-person"] as const;
export const DOOR_MONEY_SCORE_AXES = [
  "entertainment", "emotionalImpact", "shock", "humor", "relatability", "hipHopRelevance",
  "storytellingStrength", "controversy", "shareability", "educationalValue", "quotePotential",
  "carouselPotential", "shortVideoPotential", "threadPotential", "bookCuriosityPotential"
] as const;
const CHUNK_ID = /^ch\d{2,}-s\d{2,}-c\d{3,}$/u;
const MANUSCRIPT_HASH = /^sha256:[a-f0-9]{64}$/u;
const STATE_PATH = /^state\/[a-zA-Z0-9._/-]+$/u;

export type DoorMoneyRecommendationFormat = (typeof FORMATS)[number];
export type DoorMoneyRecommendationStatus = (typeof STATUSES)[number];
export type DoorMoneyCopyBlockKind = (typeof COPY_KINDS)[number];

export interface DoorMoneyCopyBlock {
  kind: DoorMoneyCopyBlockKind;
  ordinal: number;
  text: string;
}

interface DoorMoneyOwnerFields {
  editedCopyBlocks: DoorMoneyCopyBlock[] | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  postedAt: string | null;
  archivedAt: string | null;
  postedUrl: string | null;
  resultIds: string[];
  ratingRef: string | null;
}

interface DoorMoneyStatusEntry {
  from: DoorMoneyRecommendationStatus | null;
  to: DoorMoneyRecommendationStatus;
  at: string;
  actor: "system" | "owner";
  reason: string | null;
}

/** The gated record as stored. Admin loaders project path-free views from this raw contract. */
export interface DoorMoneyRecommendation {
  schemaVersion: "venture-recommendation/1";
  id: string;
  ventureId: "door-money";
  date: string;
  status: DoorMoneyRecommendationStatus;
  hook: string;
  formats: DoorMoneyRecommendationFormat[];
  platforms: string[];
  copyBlocks: DoorMoneyCopyBlock[];
  rationale: string;
  curiosityBridge: string;
  cta: { mode: "soft-curiosity" | "explicit-buy-book"; text: string | null };
  evidence: {
    kind: "book-passage";
    manuscriptHash: string;
    excerptChunkId: string;
    excerpt: string;
    privateStoreLink: string;
    chunkIds: string[];
    scoresAtSelection: Array<{ chunkId: string; scores: Record<(typeof DOOR_MONEY_SCORE_AXES)[number], DoorMoneyScore> }>;
  };
  gateResults: Array<{ gate: string; passed: true; detail: string }>;
  designLab: { eligible: boolean; summaryPath: string | null; readyAt: string | null };
  owner: DoorMoneyOwnerFields;
  statusHistory: DoorMoneyStatusEntry[];
  generatedAt: string;
  updatedAt: string;
}

export interface DoorMoneyScore {
  score: number;
  justification: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

export function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function nullableString(value: unknown, max: number): value is string | null {
  return value === null || boundedText(value, max);
}

export function isDateTime(value: unknown): value is string {
  return typeof value === "string" && DATE_TIME.test(value);
}

function nullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

/** Owner-edited public copy, contract-bounded and normalized without touching the original. */
export function parseDoorMoneyCopyBlocks(value: unknown): DoorMoneyCopyBlock[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return null;
  const parsed: DoorMoneyCopyBlock[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["kind", "ordinal", "text"])) return null;
    if (typeof entry.kind !== "string" || !(COPY_KINDS as readonly string[]).includes(entry.kind)) return null;
    if (!Number.isInteger(entry.ordinal) || (entry.ordinal as number) < 1 || !boundedText(entry.text, 4_000)) return null;
    parsed.push({ kind: entry.kind as DoorMoneyCopyBlockKind, ordinal: entry.ordinal as number, text: entry.text.trim() });
  }
  return parsed;
}

/** Strict public recommendation parsing, including the irreversible excerpt/vector boundary. */
export function parseDoorMoneyRecommendation(value: unknown): DoorMoneyRecommendation | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "id", "ventureId", "date", "status", "hook", "formats", "platforms",
    "copyBlocks", "rationale", "curiosityBridge", "cta", "evidence", "gateResults", "designLab",
    "owner", "statusHistory", "generatedAt", "updatedAt"
  ]) || value.schemaVersion !== "venture-recommendation/1" || value.ventureId !== "door-money") return null;
  if (!boundedText(value.id, 160) || !SLUG.test(value.id) || typeof value.date !== "string" || !DATE.test(value.date) ||
      typeof value.status !== "string" || !(STATUSES as readonly string[]).includes(value.status) ||
      !boundedText(value.hook, 500) || !boundedText(value.rationale, 2_000) || !boundedText(value.curiosityBridge, 1_000)) return null;
  if (!Array.isArray(value.formats) || value.formats.length < 1 || value.formats.length > 3 ||
      value.formats.some((format) => typeof format !== "string" || !(FORMATS as readonly string[]).includes(format)) ||
      new Set(value.formats).size !== value.formats.length) return null;
  if (!Array.isArray(value.platforms) || value.platforms.length < 1 || value.platforms.length > 5 ||
      value.platforms.some((platform) => typeof platform !== "string" || !(PLATFORMS as readonly string[]).includes(platform)) ||
      new Set(value.platforms).size !== value.platforms.length || !parseDoorMoneyCopyBlocks(value.copyBlocks)) return null;
  if (!isRecord(value.cta) || !hasOnlyKeys(value.cta, ["mode", "text"]) ||
      (value.cta.mode !== "soft-curiosity" && value.cta.mode !== "explicit-buy-book") ||
      !(value.cta.text === null || boundedText(value.cta.text, 500)) ||
      ((value.cta.mode === "explicit-buy-book") !== (value.cta.text !== null))) return null;

  if (!isRecord(value.evidence) || !hasOnlyKeys(value.evidence, [
    "kind", "manuscriptHash", "chunkIds", "scoresAtSelection", "excerptChunkId", "excerpt", "privateStoreLink"
  ]) || value.evidence.kind !== "book-passage" || typeof value.evidence.manuscriptHash !== "string" ||
      !MANUSCRIPT_HASH.test(value.evidence.manuscriptHash) || typeof value.evidence.excerptChunkId !== "string" ||
      !CHUNK_ID.test(value.evidence.excerptChunkId) || !boundedText(value.evidence.excerpt, 600) ||
      !boundedText(value.evidence.privateStoreLink, 500) || !Array.isArray(value.evidence.chunkIds) ||
      value.evidence.chunkIds.length < 1 || value.evidence.chunkIds.length > 3 ||
      value.evidence.chunkIds.some((id) => typeof id !== "string" || !CHUNK_ID.test(id)) ||
      new Set(value.evidence.chunkIds).size !== value.evidence.chunkIds.length ||
      !value.evidence.chunkIds.includes(value.evidence.excerptChunkId)) return null;
  const privateLink = `private-book://sha256/${value.evidence.manuscriptHash.slice("sha256:".length)}/chunks/${value.evidence.excerptChunkId}.json`;
  if (value.evidence.privateStoreLink !== privateLink || !Array.isArray(value.evidence.scoresAtSelection) ||
      value.evidence.scoresAtSelection.length !== value.evidence.chunkIds.length) return null;
  const scoredIds: string[] = [];
  for (const selection of value.evidence.scoresAtSelection) {
    if (!isRecord(selection) || !hasOnlyKeys(selection, ["chunkId", "scores"]) || typeof selection.chunkId !== "string" ||
        !CHUNK_ID.test(selection.chunkId) || !isRecord(selection.scores) || !hasOnlyKeys(selection.scores, DOOR_MONEY_SCORE_AXES)) return null;
    scoredIds.push(selection.chunkId);
    for (const axis of DOOR_MONEY_SCORE_AXES) {
      const score = selection.scores[axis];
      if (!isRecord(score) || !hasOnlyKeys(score, ["score", "justification"]) || !Number.isInteger(score.score) ||
          (score.score as number) < 0 || (score.score as number) > 5 || !boundedText(score.justification, 240)) return null;
    }
  }
  if ([...scoredIds].sort().join("\n") !== [...value.evidence.chunkIds].sort().join("\n")) return null;
  if (!Array.isArray(value.gateResults) || value.gateResults.length < 1 || value.gateResults.length > 20 ||
      value.gateResults.some((gate) => !isRecord(gate) || !hasOnlyKeys(gate, ["gate", "passed", "detail"]) ||
        typeof gate.gate !== "string" || !(GATES as readonly string[]).includes(gate.gate) ||
        gate.passed !== true || !boundedText(gate.detail, 500))) return null;
  const gateNames = value.gateResults.map((gate) => (gate as Record<string, unknown>).gate);
  if (new Set(gateNames).size !== gateNames.length) return null;

  if (!isRecord(value.designLab) || !hasOnlyKeys(value.designLab, ["eligible", "summaryPath", "readyAt"]) ||
      typeof value.designLab.eligible !== "boolean" ||
      !(value.designLab.summaryPath === null || (boundedText(value.designLab.summaryPath, 400) &&
        STATE_PATH.test(value.designLab.summaryPath) && !value.designLab.summaryPath.includes(".."))) ||
      !nullableDateTime(value.designLab.readyAt)) return null;
  const visual = (value.formats as string[]).some((format) => format === "carousel" || format === "single-image");
  if (value.designLab.eligible !== visual) return null;
  if (!isRecord(value.owner) || !hasOnlyKeys(value.owner, [
    "editedCopyBlocks", "approvalNote", "rejectionReason", "approvedAt", "rejectedAt", "postedAt",
    "archivedAt", "postedUrl", "resultIds", "ratingRef"
  ]) || !(value.owner.editedCopyBlocks === null || parseDoorMoneyCopyBlocks(value.owner.editedCopyBlocks)) ||
      !nullableString(value.owner.approvalNote, 1_000) || !nullableString(value.owner.rejectionReason, 1_000) ||
      !nullableDateTime(value.owner.approvedAt) || !nullableDateTime(value.owner.rejectedAt) ||
      !nullableDateTime(value.owner.postedAt) || !nullableDateTime(value.owner.archivedAt) ||
      !(value.owner.postedUrl === null || httpsUrl(value.owner.postedUrl)) || !Array.isArray(value.owner.resultIds) ||
      value.owner.resultIds.length > 100 || value.owner.resultIds.some((id) => typeof id !== "string" || !SLUG.test(id)) ||
      new Set(value.owner.resultIds).size !== value.owner.resultIds.length ||
      !(value.owner.ratingRef === null || (boundedText(value.owner.ratingRef, 400) &&
        STATE_PATH.test(value.owner.ratingRef) && !value.owner.ratingRef.includes("..")))) return null;

  if (!Array.isArray(value.statusHistory) || value.statusHistory.length < 1 || value.statusHistory.length > 20) return null;
  let previous: DoorMoneyRecommendationStatus | null = null;
  for (const [index, entry] of value.statusHistory.entries()) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["from", "to", "at", "actor", "reason"]) ||
        !(entry.from === null || (typeof entry.from === "string" && (STATUSES as readonly string[]).includes(entry.from))) ||
        typeof entry.to !== "string" || !(STATUSES as readonly string[]).includes(entry.to) || !isDateTime(entry.at) ||
        (entry.actor !== "system" && entry.actor !== "owner") || !nullableString(entry.reason, 500) ||
        (index === 0 && (entry.from !== null || entry.to !== "draft" || entry.actor !== "system")) ||
        (index > 0 && entry.from !== previous) || ![
          "null>draft", "draft>approved", "draft>rejected", "approved>posted", "posted>archived"
        ].includes(`${entry.from ?? "null"}>${entry.to}`)) return null;
    previous = entry.to as DoorMoneyRecommendationStatus;
  }
  if (previous !== value.status || !isDateTime(value.generatedAt) || !isDateTime(value.updatedAt) ||
      Date.parse(value.updatedAt) < Date.parse(value.generatedAt)) return null;
  const owner = value.owner as unknown as DoorMoneyOwnerFields;
  if (value.status === "draft" && [owner.approvedAt, owner.rejectedAt, owner.postedAt, owner.archivedAt, owner.postedUrl].some(Boolean)) return null;
  if (value.status === "rejected" && (!owner.rejectedAt || !owner.rejectionReason || owner.approvedAt)) return null;
  if (["approved", "posted", "archived"].includes(value.status) && !owner.approvedAt) return null;
  if (["posted", "archived"].includes(value.status) && (!owner.postedAt || !owner.postedUrl)) return null;
  if (value.status === "archived" && !owner.archivedAt) return null;
  if (visual && ["approved", "posted", "archived"].includes(value.status) &&
      (!value.designLab.summaryPath || !value.designLab.readyAt)) return null;
  if (!visual && (value.designLab.summaryPath !== null || value.designLab.readyAt !== null)) return null;
  return value as unknown as DoorMoneyRecommendation;
}
