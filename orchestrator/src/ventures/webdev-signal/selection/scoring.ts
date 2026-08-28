import type { WebDevRecord, WebDevSelection } from "../../../contracts/webdev-signal.js";
import type { WebDevSelectionConfig } from "./config.js";

type ScoreComponent = WebDevSelection["candidates"][number]["components"][number];
type ComponentName = ScoreComponent["name"];

export interface WebDevRecordScore {
  components: ScoreComponent[];
  baseScore: number;
  finalScore: number;
  confidence: number;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function component(
  name: ComponentName,
  rawValue: number,
  confidence: number,
  evidenceRefs: string[],
  config: WebDevSelectionConfig
): ScoreComponent {
  const boundedRaw = Math.max(-1, Math.min(1, rawValue));
  const weight = config.weights[name];
  return {
    name,
    rawValue: round(boundedRaw),
    weight,
    contribution: round(boundedRaw * weight * 100),
    confidence: round(Math.max(0, Math.min(1, confidence))),
    evidenceRefs: evidenceRefs.slice(0, 20)
  };
}

function impact(record: WebDevRecord): number {
  switch (record.changeKind) {
    case "security-advisory": return 1;
    case "breaking-change": return 0.95;
    case "deprecation": return 0.82;
    case "standards-platform-availability": return 0.85;
    case "stable-release": return 0.8;
    case "policy-licensing-governance": return 0.72;
    case "tooling-workflow-change": return 0.62;
    case "incident-fix": return 0.65;
    case "beta-preview": return 0.4;
    default: return 0.25;
  }
}

function breadth(record: WebDevRecord): number {
  switch (record.impactScope) {
    case "broad-web-platform": return 1;
    case "framework-ecosystem-wide": return 0.8;
    case "specific-version-configuration": return 0.58;
    case "niche-advanced": return 0.32;
    default: return 0.2;
  }
}

function urgency(record: WebDevRecord): number {
  if (record.changeKind === "security-advisory") {
    return { critical: 1, high: 0.88, moderate: 0.62, low: 0.35, unknown: 0.45, none: 0 }[record.security.severity];
  }
  if (record.changeKind === "breaking-change") return 0.78;
  if (record.changeKind === "deprecation") return 0.55;
  return record.releaseStability === "stable" ? 0.2 : 0.1;
}

function magnitude(record: WebDevRecord): number {
  if (record.changeKind === "security-advisory" || record.changeKind === "breaking-change") return 0.92;
  if (record.changeKind === "standards-platform-availability") return 0.85;
  if (record.changeKind === "stable-release") return 0.75;
  if (record.changeKind === "deprecation" || record.changeKind === "policy-licensing-governance") return 0.7;
  if (record.changeKind === "beta-preview") return 0.35;
  return 0.5;
}

export function scoreWebDevRecord(input: {
  record: WebDevRecord;
  now: string;
  config: WebDevSelectionConfig;
  goViralContribution?: number;
  goViralEvidenceRefs?: string[];
}): WebDevRecordScore {
  const { record, config } = input;
  const evidence = record.evidenceRefs;
  const confidence = record.developerImpact.confidence;
  const ageDays = Math.max(0, (Date.parse(input.now) - Date.parse(record.publishedAt)) / 86_400_000);
  const freshnessWindow = record.changeKind === "security-advisory"
    ? config.thresholds.securityFreshnessDays
    : config.thresholds.freshnessDays;
  const freshness = Math.max(0, 1 - ageDays / freshnessWindow);
  const goViralContribution = Math.max(0, Math.min(config.thresholds.maximumGoViralContribution, input.goViralContribution ?? 0));
  const goViralRaw = config.weights["goviral-momentum"] === 0 ? 0 : goViralContribution / (config.weights["goviral-momentum"] * 100);
  const components: ScoreComponent[] = [
    component("authority-evidence", record.authority === "official-advisory" ? 1 : 0.9, confidence, evidence, config),
    component("developer-impact", impact(record), confidence, record.developerImpact.evidenceRefs, config),
    component("breadth", breadth(record), confidence, evidence, config),
    component("actionability", record.safeActions.length > 0 ? 0.95 : record.releaseStability === "stable" ? 0.6 : 0.35, confidence, evidence, config),
    component("urgency", urgency(record), confidence, evidence, config),
    component("magnitude-novelty", magnitude(record), confidence, evidence, config),
    component("corroboration", record.agreement.status === "corroborated" ? 1 : 0.65, confidence, evidence, config),
    component("freshness", freshness, 1, evidence, config),
    component("audience-relevance", record.topic === "other-unknown" ? 0.3 : 0.9, confidence, evidence, config),
    component("concentration-penalty", -record.recentEditionSimilarity, 1, record.historyRefs, config),
    component("uncertainty-penalty", -(1 - confidence), confidence, evidence, config),
    component("goviral-momentum", goViralRaw, 1, input.goViralEvidenceRefs ?? [], config)
  ];
  const baseScore = round(components.filter(({ name }) => name !== "goviral-momentum").reduce((total, value) => total + value.contribution, 0));
  const finalScore = round(Math.min(100, baseScore + components.find(({ name }) => name === "goviral-momentum")!.contribution));
  return { components, baseScore, finalScore, confidence: round(confidence) };
}
