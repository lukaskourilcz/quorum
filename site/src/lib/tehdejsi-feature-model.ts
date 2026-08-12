export type TehdejsiFeatureLocale = "cs" | "ua";
export type TehdejsiFeatureStatus = "draft" | "approved" | "posted" | "archived" | "rejected";
export type TehdejsiCtaKind = "none" | "ask-your-parents" | "tag-a-friend" | "share-your-photo" | "read-more" | "product-link";

export interface TehdejsiFeaturePayload {
  slides: Array<{ ordinal: number; cs: string; ua: string }>;
  captionCs: string;
  captionUa: string;
  ctaKind: TehdejsiCtaKind;
}

export interface TehdejsiFeatureRecommendation {
  schemaVersion: "venture-recommendation/1";
  id: string;
  ventureId: "tehdejsi-svet";
  date: string;
  cycleId: string;
  status: TehdejsiFeatureStatus;
  evidence: {
    kind: "tehdejsi-story";
    factsHash: string;
    factIds: string[];
    shortlistRef: string;
    dossierRefs: string[];
    sensitivityTier: 0 | 1 | 2;
    tierRaisedBy: string[];
    terminologyCheck: {
      tableVersion: "tehdejsi-terminology/1";
      checkedAt: string;
      findings: Array<{ rule: string; language: "cs" | "uk"; detail: string }>;
    };
  };
  payload: TehdejsiFeaturePayload;
  media: Array<{
    slideOrdinal: number;
    source: string;
    sourceUrl: string | null;
    licence: "cc-by" | "cc-by-sa" | "public-domain" | "own-render";
    attribution: string;
  }>;
  humanReviewRequired: boolean;
  humanReviewedAt: string | null;
  designLab: { summaryPath: string | null; readyAt: string | null };
  owner: { postedUrls: Record<TehdejsiFeatureLocale, string | null>; rejectionReason: string | null };
  generatedAt: string;
  updatedAt: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const STATE_PATH = /^state\/[a-zA-Z0-9._/-]+$/u;
const HASH = /^[a-f0-9]{64}$/u;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function slug(value: unknown, max = 160): value is string {
  return typeof value === "string" && value.length <= max && SLUG.test(value);
}

function instant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function statePath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 400 && STATE_PATH.test(value) && !value.includes("..");
}

function https(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function parseTehdejsiFeaturePayload(value: unknown): TehdejsiFeaturePayload | null {
  const payload = object(value);
  if (!payload || !exact(payload, ["slides", "captionCs", "captionUa", "ctaKind"])) return null;
  if (!Array.isArray(payload.slides) || payload.slides.length < 2 || payload.slides.length > 10) return null;
  const slides: TehdejsiFeaturePayload["slides"] = [];
  for (const [index, raw] of payload.slides.entries()) {
    const slide = object(raw);
    if (!slide || !exact(slide, ["ordinal", "cs", "ua"]) || slide.ordinal !== index + 1) return null;
    if (!text(slide.cs, 1, 400) || !text(slide.ua, 1, 400)) return null;
    slides.push({ ordinal: index + 1, cs: slide.cs.trim(), ua: slide.ua.trim() });
  }
  if (!text(payload.captionCs, 1, 2_200) || !text(payload.captionUa, 1, 2_200)) return null;
  if (!["none", "ask-your-parents", "tag-a-friend", "share-your-photo", "read-more", "product-link"].includes(String(payload.ctaKind))) return null;
  return {
    slides,
    captionCs: payload.captionCs.trim(),
    captionUa: payload.captionUa.trim(),
    ctaKind: payload.ctaKind as TehdejsiCtaKind
  };
}

/** Strict public parser for the recorded TS recommendation boundary. */
export function parseTehdejsiFeatureRecommendation(value: unknown): TehdejsiFeatureRecommendation | null {
  const record = object(value);
  if (!record || !exact(record, [
    "schemaVersion", "id", "ventureId", "date", "cycleId", "status", "evidence", "payload",
    "media", "humanReviewRequired", "humanReviewedAt", "designLab", "owner", "generatedAt", "updatedAt"
  ])) return null;
  if (record.schemaVersion !== "venture-recommendation/1" || record.ventureId !== "tehdejsi-svet") return null;
  if (!slug(record.id) || typeof record.date !== "string" || !DATE.test(record.date) || !text(record.cycleId, 1, 120)) return null;
  if (!["draft", "approved", "posted", "archived", "rejected"].includes(String(record.status))) return null;
  if (!instant(record.generatedAt) || !instant(record.updatedAt) || Date.parse(record.updatedAt) < Date.parse(record.generatedAt)) return null;

  const evidence = object(record.evidence);
  const terminology = object(evidence?.terminologyCheck);
  if (!evidence || !exact(evidence, ["kind", "factsHash", "factIds", "shortlistRef", "dossierRefs", "sensitivityTier", "tierRaisedBy", "terminologyCheck"])) return null;
  if (evidence.kind !== "tehdejsi-story" || typeof evidence.factsHash !== "string" || !HASH.test(evidence.factsHash)) return null;
  if (!Array.isArray(evidence.factIds) || evidence.factIds.length < 1 || evidence.factIds.length > 4 || evidence.factIds.some((id) => !slug(id))) return null;
  if (new Set(evidence.factIds).size !== evidence.factIds.length || !statePath(evidence.shortlistRef)) return null;
  if (!Array.isArray(evidence.dossierRefs) || evidence.dossierRefs.length > 6 || evidence.dossierRefs.some((ref) => !statePath(ref))) return null;
  if (![0, 1, 2].includes(Number(evidence.sensitivityTier))) return null;
  if (!Array.isArray(evidence.tierRaisedBy) || evidence.tierRaisedBy.length > 8 || evidence.tierRaisedBy.some((id) => !slug(id))) return null;
  if (evidence.tierRaisedBy.length > 0 && evidence.sensitivityTier !== 2) return null;
  if (!terminology || !exact(terminology, ["tableVersion", "checkedAt", "findings"]) || terminology.tableVersion !== "tehdejsi-terminology/1" || !instant(terminology.checkedAt)) return null;
  if (!Array.isArray(terminology.findings) || terminology.findings.length > 0) return null;

  const payload = parseTehdejsiFeaturePayload(record.payload);
  if (!payload) return null;
  if (evidence.sensitivityTier === 2 && ["ask-your-parents", "tag-a-friend", "share-your-photo"].includes(payload.ctaKind)) return null;

  if (!Array.isArray(record.media) || record.media.length > 10) return null;
  const media: TehdejsiFeatureRecommendation["media"] = [];
  for (const raw of record.media) {
    const entry = object(raw);
    if (!entry || !exact(entry, ["slideOrdinal", "source", "sourceUrl", "licence", "attribution"])) return null;
    if (!Number.isInteger(entry.slideOrdinal) || Number(entry.slideOrdinal) < 1 || Number(entry.slideOrdinal) > payload.slides.length) return null;
    if (!text(entry.source, 1, 200) || (entry.sourceUrl !== null && !https(entry.sourceUrl))) return null;
    if (!["cc-by", "cc-by-sa", "public-domain", "own-render"].includes(String(entry.licence))) return null;
    if (typeof entry.attribution !== "string" || entry.attribution.length > 300) return null;
    if (entry.licence === "own-render" ? entry.attribution.length > 0 : entry.attribution.trim().length === 0) return null;
    media.push(entry as unknown as TehdejsiFeatureRecommendation["media"][number]);
  }

  const humanReviewRequired = record.humanReviewRequired === true;
  if (typeof record.humanReviewRequired !== "boolean" || humanReviewRequired !== (evidence.sensitivityTier === 2)) return null;
  if (record.humanReviewedAt !== null && !instant(record.humanReviewedAt)) return null;
  if (humanReviewRequired && record.humanReviewedAt === null && !["draft", "rejected"].includes(String(record.status))) return null;

  const designLab = object(record.designLab);
  if (!designLab || !exact(designLab, ["summaryPath", "readyAt"])) return null;
  if (designLab.summaryPath !== null && !statePath(designLab.summaryPath)) return null;
  if (designLab.readyAt !== null && !instant(designLab.readyAt)) return null;
  if (["approved", "posted", "archived"].includes(String(record.status)) && (designLab.summaryPath === null || designLab.readyAt === null)) return null;

  const owner = object(record.owner);
  const postedUrls = object(owner?.postedUrls);
  if (!owner || !exact(owner, ["postedUrls", "rejectionReason"]) || !postedUrls || !exact(postedUrls, ["cs", "ua"])) return null;
  if ([postedUrls.cs, postedUrls.ua].some((url) => url !== null && !https(url))) return null;
  if (owner.rejectionReason !== null && !text(owner.rejectionReason, 1, 1_000)) return null;
  const posted = [postedUrls.cs, postedUrls.ua];
  if (record.status === "posted" && posted.some((url) => url === null)) return null;
  if (["draft", "rejected"].includes(String(record.status)) && posted.some((url) => url !== null)) return null;
  if ((record.status === "rejected") !== (owner.rejectionReason !== null)) return null;

  return {
    ...record,
    status: record.status as TehdejsiFeatureStatus,
    evidence: {
      ...evidence,
      sensitivityTier: evidence.sensitivityTier as 0 | 1 | 2,
      terminologyCheck: { ...terminology, findings: [] }
    },
    payload,
    media,
    humanReviewRequired,
    designLab: designLab as unknown as TehdejsiFeatureRecommendation["designLab"],
    owner: owner as unknown as TehdejsiFeatureRecommendation["owner"]
  } as unknown as TehdejsiFeatureRecommendation;
}
