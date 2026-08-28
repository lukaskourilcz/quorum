import { createHash } from "node:crypto";
import type {
  WebDevCandidate,
  WebDevChangeKind,
  WebDevRecord,
  WebDevSelection,
  WebDevTopic
} from "../../../contracts/webdev-signal.js";
import { WebDevRecordSchema } from "../../../contracts/webdev-signal.js";
import {
  canonicalizeWebDevProject,
  canonicalizeWebDevUrl,
  explicitWebDevIdentifier,
  stableWebDevRecordId
} from "./canonical.js";
import type { WebDevSelectionConfig } from "./config.js";

export type WebDevGate = WebDevSelection["candidates"][number]["gate"];

export interface WebDevSelectionHistoryEntry {
  recordId: string;
  canonicalUrl: string;
  project: string;
  topic: WebDevTopic;
  selectedAt: string;
  correctionRef?: string | null;
  superseded?: boolean;
}

export interface WebDevPrefilterDrop {
  sourceId: string;
  sourceItemId: string;
  gate: Exclude<WebDevGate, "eligible">;
  reason: string;
}

export interface BuiltWebDevRecord {
  record: WebDevRecord;
  gateHint: WebDevGate;
  gateReasons: string[];
}

export interface BuildWebDevRecordsResult {
  records: BuiltWebDevRecord[];
  drops: WebDevPrefilterDrop[];
  exactClusters: number;
  fuzzyClusters: number;
  conflicts: number;
}

export class WebDevRecordCollisionError extends Error {}

interface CandidateFact {
  candidate: WebDevCandidate;
  project: string;
  targetUrl: string;
  projectUrl: string;
  identifier: string | null;
  stability: "stable" | "beta" | "preview" | "deprecated" | "withdrawn" | "unknown";
  security: boolean;
}

function words(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/u).filter((word) => word.length > 2));
}

function similarity(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
}

function stability(candidate: WebDevCandidate): CandidateFact["stability"] {
  const text = `${candidate.title} ${candidate.summary} ${candidate.versionText ?? ""}`;
  if (/\b(?:withdrawn|retracted)\b/iu.test(text)) return "withdrawn";
  if (/\bdeprecat(?:ed|ion)\b/iu.test(text) || candidate.changeKindHints.includes("deprecation")) return "deprecated";
  if (/\b(?:alpha|canary|experimental|preview)\b/iu.test(text)) return "preview";
  if (/\b(?:beta|release candidate|\brc\d*)\b/iu.test(text) || candidate.changeKindHints.includes("beta-preview")) return "beta";
  if (candidate.changeKindHints.includes("stable-release") || /\bstable\b/iu.test(text)) return "stable";
  return "unknown";
}

function prefilter(candidate: WebDevCandidate, now: string, config: WebDevSelectionConfig): WebDevPrefilterDrop | null {
  const text = `${candidate.title} ${candidate.summary}`;
  const base = { sourceId: candidate.sourceId, sourceItemId: candidate.sourceItemId };
  if (/\b(?:job opening|we(?:'re| are) hiring|discount|coupon|affiliate|sponsored|register now|buy now)\b/iu.test(text)) {
    return { ...base, gate: "promotional", reason: "promotional-or-commercial-language" };
  }
  if (/\b(?:rumou?r|reportedly|unconfirmed|leak(?:ed)?)\b/iu.test(text)) {
    return { ...base, gate: "rumor-unsupported", reason: "unsupported-rumor-language" };
  }
  if (/\b(?:top \d+|listicle|beginner guide|tips and tricks|opinion:)\b/iu.test(text)) {
    return { ...base, gate: "minor-no-material-impact", reason: "tutorial-listicle-or-opinion" };
  }
  if (/\b(?:artificial intelligence|\bai\b|llm)\b/iu.test(text)
    && !/\b(?:browser|css|html|javascript|typescript|frontend|framework|runtime|npm|web security|web platform)\b/iu.test(text)) {
    return { ...base, gate: "out-of-scope", reason: "ai-without-web-development-impact" };
  }
  if (/\b(?:withdrawn|retracted|corrected away)\b/iu.test(text)) {
    return { ...base, gate: "stale", reason: "withdrawn-or-corrected-away" };
  }
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(candidate.publishedAt)) / 86_400_000);
  const security = candidate.changeKindHints.includes("security-advisory") || candidate.securityText !== null;
  if (ageDays > (security ? config.thresholds.securityFreshnessDays : config.thresholds.freshnessDays)) {
    return { ...base, gate: "stale", reason: `older-than-${security ? config.thresholds.securityFreshnessDays : config.thresholds.freshnessDays}-days` };
  }
  const version = explicitWebDevIdentifier(candidate.versionText);
  const patch = version?.match(/^\d+\.\d+\.(\d+)(?:-|$)/u)?.[1];
  if (patch && Number(patch) > 0
    && !security
    && !candidate.changeKindHints.some((kind) => ["breaking-change", "deprecation", "policy-licensing-governance"].includes(kind))
    && /\b(?:patch|bug fixes?|maintenance|dependency updates?)\b/iu.test(text)) {
    return { ...base, gate: "minor-no-material-impact", reason: "minor-patch-without-material-impact" };
  }
  return null;
}

function fact(candidate: WebDevCandidate, config: WebDevSelectionConfig): CandidateFact {
  const targetUrl = canonicalizeWebDevUrl(candidate.targetUrl, config);
  const security = candidate.changeKindHints.includes("security-advisory") || candidate.securityText !== null;
  return {
    candidate,
    project: canonicalizeWebDevProject(candidate.project, config),
    targetUrl,
    projectUrl: canonicalizeWebDevUrl(candidate.canonicalProjectUrl, config),
    identifier: explicitWebDevIdentifier(`${candidate.securityText ?? ""} ${candidate.versionText ?? ""} ${candidate.title}`),
    stability: stability(candidate),
    security
  };
}

class UnionFind {
  private readonly parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, index) => index); }
  find(index: number): number {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]!);
    return this.parent[index]!;
  }
  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function equivalent(left: CandidateFact, right: CandidateFact): "exact" | "fuzzy" | null {
  if (left.targetUrl === right.targetUrl) return "exact";
  if (left.project !== right.project) return null;
  if (left.identifier && right.identifier) {
    if (left.identifier === right.identifier && left.security === right.security) return "exact";
    return null;
  }
  if (left.security !== right.security) return null;
  const distanceHours = Math.abs(Date.parse(left.candidate.publishedAt) - Date.parse(right.candidate.publishedAt)) / 3_600_000;
  if (distanceHours <= 48 && similarity(left.candidate.title, right.candidate.title) >= 0.78) return "fuzzy";
  return null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function mostCommon<T extends string>(values: readonly T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right))[0]?.[0] ?? fallback;
}

function versionScopes(facts: readonly CandidateFact[]): { versionRefs: string[]; affectedVersions: string[]; fixedVersions: string[] } {
  const values = facts.map(({ candidate }) => candidate.versionText).filter((value): value is string => value !== null);
  const versionRefs = unique(values.flatMap((value) => value.match(/\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/gu) ?? [])).slice(0, 20);
  const affectedVersions = unique(values.flatMap((value) => [...value.matchAll(/\baffected\s+(.+?)(?=\s+fixed\s+|;|$)/giu)].map((match) => match[1]!.trim()))).slice(0, 20);
  const fixedVersions = unique(values.flatMap((value) => [...value.matchAll(/\bfixed\s+(.+?)(?=;|$)/giu)].map((match) => match[1]!.trim()))).slice(0, 20);
  return { versionRefs, affectedVersions, fixedVersions };
}

function affectedConfigurations(facts: readonly CandidateFact[]): string[] {
  return unique(facts.flatMap(({ candidate }) => {
    const match = `${candidate.summary} ${candidate.securityText ?? ""}`.match(/\baffect(?:s|ed|ing)\s+(projects?\s+(?:using|with)\s+[^.;]{3,180})/iu);
    return match?.[1] ? [match[1].trim()] : [];
  })).slice(0, 20);
}

function changeKind(facts: readonly CandidateFact[], scoped: boolean): WebDevChangeKind {
  const hints = facts.flatMap(({ candidate }) => candidate.changeKindHints).filter((kind) => kind !== "lead-only");
  if (facts.some(({ security }) => security)) return scoped ? "security-advisory" : "other-unknown";
  if (hints.includes("breaking-change")) return scoped ? "breaking-change" : "other-unknown";
  if (hints.includes("deprecation")) return scoped ? "deprecation" : "other-unknown";
  return mostCommon(hints, "other-unknown");
}

function historySimilarity(input: {
  project: string;
  topic: WebDevTopic;
  canonicalUrl: string;
  now: string;
  history: readonly WebDevSelectionHistoryEntry[];
  config: WebDevSelectionConfig;
}): number {
  let value = 0;
  for (const entry of input.history) {
    if (entry.superseded) continue;
    const ageDays = Math.max(0, (Date.parse(input.now) - Date.parse(entry.selectedAt)) / 86_400_000);
    if (entry.canonicalUrl === input.canonicalUrl && ageDays <= input.config.thresholds.projectCooldownDays) value = Math.max(value, 1);
    if (canonicalizeWebDevProject(entry.project, input.config) === input.project && ageDays <= input.config.thresholds.projectCooldownDays) value = Math.max(value, 0.85);
    if (entry.topic === input.topic && ageDays <= input.config.thresholds.topicCooldownDays) value = Math.max(value, 0.55);
  }
  return value;
}

function buildRecord(
  facts: readonly CandidateFact[],
  now: string,
  config: WebDevSelectionConfig,
  history: readonly WebDevSelectionHistoryEntry[]
): BuiltWebDevRecord {
  const ranked = [...facts].sort((left, right) => {
    const authority = { "official-advisory": 2, "official-primary": 1, "secondary-discovery": 0 } as const;
    return authority[right.candidate.provenance.authority] - authority[left.candidate.provenance.authority]
      || right.candidate.publishedAt.localeCompare(left.candidate.publishedAt)
      || left.targetUrl.localeCompare(right.targetUrl);
  });
  const primary = ranked[0]!;
  const identifiers = unique(facts.map(({ identifier }) => identifier).filter((value): value is string => value !== null));
  const stabilities = unique(facts.map(({ stability: value }) => value).filter((value) => value !== "unknown"));
  const projects = unique(facts.map(({ project }) => project));
  const conflicts = [
    ...(identifiers.length > 1 ? [`conflicting-identifiers:${identifiers.join(",")}`] : []),
    ...(stabilities.length > 1 ? [`conflicting-stability:${stabilities.join(",")}`] : []),
    ...(projects.length > 1 ? [`conflicting-projects:${projects.join(",")}`] : [])
  ];
  const scopes = versionScopes(facts);
  const configurations = affectedConfigurations(facts);
  const hasExactScope = scopes.affectedVersions.length > 0 || configurations.length > 0;
  const hasFixed = scopes.fixedVersions.length > 0;
  const kind = changeKind(facts, hasExactScope && (!facts.some(({ security }) => security) || hasFixed));
  const topic = mostCommon(facts.flatMap(({ candidate }) => candidate.topicHints), "other-unknown");
  const canonicalUrl = primary.targetUrl;
  const project = primary.project;
  const sourceIds = unique(facts.map(({ candidate }) => candidate.sourceId)).sort();
  const evidenceRefs = unique(facts.flatMap(({ candidate }) => candidate.provenance.evidenceRefs)).sort().slice(0, 40);
  const officialSourceIds = unique(facts.filter(({ candidate }) => candidate.provenance.authority !== "secondary-discovery").map(({ candidate }) => candidate.sourceId));
  const authority = facts.some(({ candidate }) => candidate.provenance.authority === "official-advisory")
    ? "official-advisory" as const
    : facts.some(({ candidate }) => candidate.provenance.authority === "official-primary")
      ? "official-primary" as const
      : "secondary-discovery" as const;
  const recordId = stableWebDevRecordId({ canonicalUrl, project, explicitIdentifier: identifiers[0] ?? null, config });
  const recentEditionSimilarity = historySimilarity({ project, topic, canonicalUrl, now, history, config });
  const severity = mostCommon(facts.flatMap(({ candidate }) => candidate.securityText?.match(/\b(critical|high|moderate|low)\b/iu)?.[1]?.toLocaleLowerCase("en") as "critical" | "high" | "moderate" | "low" | undefined).filter((value): value is "critical" | "high" | "moderate" | "low" => value !== undefined), "unknown" as const);
  const advisoryIds = unique(facts.flatMap(({ candidate }) => `${candidate.securityText ?? ""} ${candidate.title}`.match(/\b(?:GHSA-[a-z0-9-]+|CVE-\d{4}-\d{4,})\b/giu) ?? [])).slice(0, 20);
  const confidenceBase = authority === "official-advisory" ? 0.98 : authority === "official-primary" ? 0.9 : 0.5;
  const confidence = Math.max(0, Math.min(1, confidenceBase + (officialSourceIds.length > 1 ? 0.05 : 0) - (conflicts.length > 0 ? 0.5 : 0)));
  const safeActions = kind === "security-advisory" && hasExactScope && hasFixed
    ? [{
        id: "action:check-and-update",
        action: `Check whether the project uses ${scopes.affectedVersions.join(", ") || configurations.join(", ")} and update to ${scopes.fixedVersions.join(", ")}.`,
        urgency: severity === "critical" || severity === "high" ? "act-now" as const : "check" as const,
        evidenceRefs
      }]
    : [];
  const releaseStability = stabilities.length === 1 ? stabilities[0]! : conflicts.length > 0 ? "unknown" : primary.stability;
  const record = WebDevRecordSchema.parse({
    schemaVersion: "webdev-record/1",
    id: recordId,
    canonicalUrl,
    sourceIds,
    candidateIds: facts.map(({ candidate }) => `candidate:${createHash("sha256").update(`${candidate.sourceId}:${candidate.sourceItemId}`).digest("hex").slice(0, 24)}`).sort(),
    evidenceRefs,
    project,
    topic,
    changeKind: kind,
    impactScope: topic === "browsers-web-platform" || topic === "html-css" || topic === "javascript"
      ? "broad-web-platform"
      : ["frontend-framework", "meta-framework", "runtime", "package-manager", "build-tooling"].includes(topic)
        ? "framework-ecosystem-wide"
        : hasExactScope ? "specific-version-configuration" : "unknown",
    authority,
    title: primary.candidate.title,
    sourceSummary: primary.candidate.summary,
    publishedAt: facts.map(({ candidate }) => candidate.publishedAt).sort().at(-1)!,
    updatedAt: facts.map(({ candidate }) => candidate.updatedAt).filter((value): value is string => value !== null).sort().at(-1) ?? null,
    versionRefs: scopes.versionRefs,
    affectedVersions: scopes.affectedVersions,
    fixedVersions: scopes.fixedVersions,
    affectedConfigurations: configurations,
    developerImpact: {
      summary: primary.candidate.summary,
      audienceIds: unique(["audience:web-developers", `audience:${topic}`]),
      confidence,
      evidenceRefs
    },
    safeActions,
    security: { severity: facts.some(({ security }) => security) ? severity : "none", advisoryIds },
    releaseStability,
    agreement: {
      status: conflicts.length > 0 ? "conflicted" : officialSourceIds.length > 1 ? "corroborated" : "single-official",
      agreeingSourceIds: sourceIds,
      conflictRefs: conflicts.length > 0 ? evidenceRefs : []
    },
    firstSeenAt: facts.map(({ candidate }) => candidate.provenance.fetchedAt).sort()[0]!,
    lastSeenAt: facts.map(({ candidate }) => candidate.provenance.fetchedAt).sort().at(-1)!,
    extractionVersion: config.extractionVersion,
    scoringVersion: config.scoringVersion,
    recentEditionSimilarity,
    historyRefs: history.filter(({ project: value }) => canonicalizeWebDevProject(value, config) === project).map(({ recordId: id }) => `history:${id}`).slice(0, 40),
    lifecycle: "new"
  });

  let gateHint: WebDevGate = "eligible";
  const gateReasons: string[] = ["eligible:official-evidence-and-material-shape"];
  if (authority === "secondary-discovery") {
    gateHint = "needs-official-confirmation";
    gateReasons.splice(0, gateReasons.length, "secondary-lead-has-no-official-confirmation");
  } else if (conflicts.length > 0) {
    gateHint = "conflicted";
    gateReasons.splice(0, gateReasons.length, ...conflicts);
  } else if ((facts.some(({ security }) => security) || facts.some(({ candidate }) => candidate.changeKindHints.some((hint) => ["breaking-change", "deprecation"].includes(hint))))
    && (!hasExactScope || (facts.some(({ security }) => security) && !hasFixed))) {
    gateHint = "high-risk-factual-review";
    gateReasons.splice(0, gateReasons.length, "high-risk-change-missing-exact-affected-or-fixed-scope");
  } else if (recentEditionSimilarity >= 0.8 && kind !== "security-advisory" && kind !== "breaking-change") {
    gateHint = "duplicate-recent-edition";
    gateReasons.splice(0, gateReasons.length, "project-or-canonical-url-inside-cooldown");
  }
  return { record, gateHint, gateReasons };
}

export function buildWebDevRecords(input: {
  candidates: readonly WebDevCandidate[];
  now: string;
  config: WebDevSelectionConfig;
  history?: readonly WebDevSelectionHistoryEntry[];
}): BuildWebDevRecordsResult {
  const drops: WebDevPrefilterDrop[] = [];
  const facts: CandidateFact[] = [];
  for (const candidate of input.candidates) {
    const dropped = prefilter(candidate, input.now, input.config);
    if (dropped) drops.push(dropped);
    else facts.push(fact(candidate, input.config));
  }
  const union = new UnionFind(facts.length);
  let exactClusters = 0;
  let fuzzyClusters = 0;
  for (let left = 0; left < facts.length; left += 1) {
    for (let right = left + 1; right < facts.length; right += 1) {
      const relation = equivalent(facts[left]!, facts[right]!);
      if (relation) {
        union.union(left, right);
        if (relation === "exact") exactClusters += 1;
        else fuzzyClusters += 1;
      }
    }
  }
  const groups = new Map<number, CandidateFact[]>();
  facts.forEach((value, index) => groups.set(union.find(index), [...(groups.get(union.find(index)) ?? []), value]));
  const records: BuiltWebDevRecord[] = [];
  for (const group of groups.values()) {
    if (group.every(({ candidate }) => candidate.provenance.authority === "secondary-discovery")) {
      drops.push(...group.map(({ candidate }) => ({
        sourceId: candidate.sourceId,
        sourceItemId: candidate.sourceItemId,
        gate: "needs-official-confirmation" as const,
        reason: "secondary-lead-has-no-official-confirmation"
      })));
      continue;
    }
    records.push(buildRecord(group, input.now, input.config, input.history ?? []));
  }
  const seen = new Map<string, string>();
  for (const { record } of records) {
    const material = `${record.canonicalUrl}|${record.project}|${record.versionRefs.join(",")}`;
    const prior = seen.get(record.id);
    if (prior && prior !== material) throw new WebDevRecordCollisionError(`record-id-collision:${record.id}`);
    seen.set(record.id, material);
  }
  return {
    records: records.sort((left, right) => left.record.id.localeCompare(right.record.id)),
    drops: drops.sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.sourceItemId.localeCompare(right.sourceItemId)),
    exactClusters,
    fuzzyClusters,
    conflicts: records.filter(({ gateHint }) => gateHint === "conflicted").length
  };
}
