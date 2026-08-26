import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PersonalGrowthContentConfigSchema,
  PersonalGrowthContentPolicySchema,
  PersonalGrowthConversationOpportunitySchema,
  PersonalGrowthInstagramRecommendationSchema,
  PersonalGrowthManualVentureReferenceSchema,
  PersonalGrowthReelSuggestionSchema,
  PersonalGrowthThreadsCandidateSchema,
  PersonalGrowthThreadsPacketSchema,
  PersonalGrowthThreadsSuggestionSchema,
  type PersonalGrowthContentConfig,
  type PersonalGrowthContentPolicy,
  type PersonalGrowthConversationOpportunity,
  type PersonalGrowthInstagramRecommendation,
  type PersonalGrowthManualVentureReference,
  type PersonalGrowthReelSuggestion,
  type PersonalGrowthThreadsCandidate,
  type PersonalGrowthThreadsPacket
} from "../../contracts/personal-growth-recommendations.js";
import { configRoot } from "../../paths.js";
import { auditPersonalGrowthOutput } from "./journal.js";
import { personalGrowthHash } from "./planner.js";

const FORBIDDEN_SOURCE_MARKERS = [
  "kvorum", "portfolio", "social-distribution", "campaign-", "door-money", "booksofhistory",
  "tehdejsi", "dneskai", "mma-files", "fightaiq", "contest-radar", "monetization"
] as const;

export async function loadPersonalGrowthContentConfig(
  filePath = path.join(configRoot, "personal-growth-content.json")
): Promise<PersonalGrowthContentConfig> {
  return PersonalGrowthContentConfigSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function isLooser(before: PersonalGrowthContentPolicy["revisions"][number], after: PersonalGrowthContentPolicy["revisions"][number]): boolean {
  return after.personalFeedMinimum < before.personalFeedMinimum
    || after.ventureLedMaximum > before.ventureLedMaximum
    || after.ventureStoriesPerSevenDaysMaximum > before.ventureStoriesPerSevenDaysMaximum
    || after.sameVentureCooldownDays < before.sameVentureCooldownDays;
}

export function assertPersonalGrowthContentPolicyUpdate(
  previous: PersonalGrowthContentPolicy,
  next: PersonalGrowthContentPolicy
): PersonalGrowthContentPolicy {
  const before = PersonalGrowthContentPolicySchema.parse(previous);
  const after = PersonalGrowthContentPolicySchema.parse(next);
  if (after.currentRevision !== before.currentRevision + 1 || after.revisions.length !== before.revisions.length + 1) {
    throw new Error("A policy update must append exactly one revision");
  }
  if (JSON.stringify(after.revisions.slice(0, -1)) !== JSON.stringify(before.revisions)) {
    throw new Error("Personal Growth policy history is append-only");
  }
  const newest = after.revisions.at(-1)!;
  if (newest.revision !== after.currentRevision) throw new Error("The appended policy revision number is invalid");
  if (isLooser(before.revisions.at(-1)!, newest) && newest.looseningDecisionRef === null) {
    throw new Error("Loosening Personal Growth policy requires a preserved owner decision");
  }
  return after;
}

function words(value: string): string[] {
  return value.toLocaleLowerCase("und").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function ngrams(value: string, size = 3): Set<string> {
  const tokens = words(value);
  const values = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) values.add(tokens.slice(index, index + size).join(" "));
  return values;
}

function textSimilarity(left: string, right: string): number {
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return left.trim().toLocaleLowerCase("und") === right.trim().toLocaleLowerCase("und") ? 1 : 0;
  const overlap = [...a].filter((value) => b.has(value)).length;
  return Number((overlap / (a.size + b.size - overlap)).toFixed(4));
}

function forbiddenProvenance(refs: readonly string[]): boolean {
  return refs.some((ref) => {
    const normalized = ref.toLowerCase();
    return normalized.includes("..") || normalized.includes("\\")
      || FORBIDDEN_SOURCE_MARKERS.some((marker) => normalized.includes(marker));
  });
}

type Rejection =
  | "schema" | "character-limit" | "forbidden-provenance" | "recent-similarity" | "manuscript-overlap"
  | "false-memory" | "expired-signal" | "owner-veto" | "english-profile" | "quality" | "topic-tags" | "candidate-similarity";

function checkedThreadsCandidate(input: {
  candidate: unknown;
  config: PersonalGrowthContentConfig;
  generatedAt: Date;
  recentPosts: readonly string[];
  privateSources: readonly string[];
}): { suggestion: ReturnType<typeof PersonalGrowthThreadsSuggestionSchema.parse> | null; rejection: Rejection | null } {
  const parsed = PersonalGrowthThreadsCandidateSchema.safeParse(input.candidate);
  if (!parsed.success) return { suggestion: null, rejection: "schema" };
  const candidate = parsed.data;
  if ([...candidate.text].length > input.config.threads.characterLimit) return { suggestion: null, rejection: "character-limit" };
  if ((candidate.text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0) > input.config.threads.maximumTopicTags) {
    return { suggestion: null, rejection: "topic-tags" };
  }
  if (forbiddenProvenance(candidate.provenanceRefs)) return { suggestion: null, rejection: "forbidden-provenance" };
  if (candidate.ownerVetoed) return { suggestion: null, rejection: "owner-veto" };
  if (candidate.language === "en" && !input.config.englishProfileAvailable) return { suggestion: null, rejection: "english-profile" };
  if (candidate.assertedPersonalMemory && candidate.ownerMemoryEvidenceRefs.length === 0) return { suggestion: null, rejection: "false-memory" };
  if (Object.values(candidate.qualityFlags).some(Boolean)) return { suggestion: null, rejection: "quality" };
  if (candidate.goviralExpiresAt !== null && Date.parse(candidate.goviralExpiresAt) <= input.generatedAt.getTime()) {
    return { suggestion: null, rejection: "expired-signal" };
  }
  const recentSimilarity = input.recentPosts.reduce((highest, post) => Math.max(highest, textSimilarity(candidate.text, post)), 0);
  if (recentSimilarity > input.config.threads.recentSimilarityMaximum) return { suggestion: null, rejection: "recent-similarity" };
  const leakAudit = auditPersonalGrowthOutput({ candidate: candidate.text, privateSources: input.privateSources });
  if (leakAudit.status !== "pass") return { suggestion: null, rejection: "manuscript-overlap" };
  return {
    suggestion: PersonalGrowthThreadsSuggestionSchema.parse({
      suggestionId: `pg-thread-${personalGrowthHash(candidate).slice(-16)}`,
      text: candidate.text,
      language: candidate.language,
      characterCount: [...candidate.text].length,
      topicTag: candidate.topicTag,
      sourceLane: candidate.sourceLane,
      personalPillar: candidate.personalPillar,
      provenanceRefs: candidate.provenanceRefs,
      selectionReason: candidate.selectionReason,
      conversationPurpose: candidate.conversationPurpose,
      goviralSignalId: candidate.goviralSignalId,
      recentSimilarity,
      similarityVerdict: "pass",
      activeExperimentId: candidate.activeExperimentId,
      generatedVersion: candidate.generatedVersion,
      profileVersion: candidate.profileVersion,
      leakAudit
    }),
    rejection: null
  };
}

export function buildPersonalGrowthThreadsPacket(input: {
  recommendationDate: string;
  generatedAt: Date;
  config: PersonalGrowthContentConfig;
  candidates: readonly unknown[];
  recentPosts?: readonly string[];
  privateSources?: readonly string[];
  conversationCandidates?: readonly unknown[];
  officialSearchEnabled?: boolean;
  recommendationAuthority?: boolean;
}): PersonalGrowthThreadsPacket {
  const config = PersonalGrowthContentConfigSchema.parse(input.config);
  const rejectedCounts: Record<string, number> = {};
  const suggestions: Array<ReturnType<typeof PersonalGrowthThreadsSuggestionSchema.parse>> = [];
  for (const candidate of input.candidates) {
    const checked = checkedThreadsCandidate({
      candidate,
      config,
      generatedAt: input.generatedAt,
      recentPosts: input.recentPosts ?? [],
      privateSources: input.privateSources ?? []
    });
    if (checked.rejection) rejectedCounts[checked.rejection] = (rejectedCounts[checked.rejection] ?? 0) + 1;
    if (!checked.suggestion) continue;
    if (suggestions.some(({ text }) => textSimilarity(text, checked.suggestion!.text) > config.threads.recentSimilarityMaximum)) {
      rejectedCounts["candidate-similarity"] = (rejectedCounts["candidate-similarity"] ?? 0) + 1;
      continue;
    }
    suggestions.push(checked.suggestion);
    if (suggestions.length >= 1 + config.threads.maximumAlternatives) break;
  }
  const authority = input.recommendationAuthority ?? true;
  const conversations = (input.conversationCandidates ?? []).flatMap((candidate) => {
    const parsed = PersonalGrowthConversationOpportunitySchema.safeParse(candidate);
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= input.generatedAt.getTime()) return [];
    if (parsed.data.provider === "official-threads-search" && !input.officialSearchEnabled) return [];
    return [parsed.data];
  }).slice(0, config.threads.maximumConversationOpportunities);
  const decision = !authority ? "HELD" as const : suggestions.length > 0 ? "RECOMMEND" as const : "NO_POST" as const;
  const noPostReason = decision === "RECOMMEND"
    ? null
    : decision === "HELD"
      ? "authority-held" as const
      : input.candidates.length === 0
        ? "no-useful-candidate" as const
        : rejectedCounts["english-profile"] === input.candidates.length
          ? "english-profile-unavailable" as const
          : "all-candidates-rejected" as const;
  return PersonalGrowthThreadsPacketSchema.parse({
    schemaVersion: "personal-growth-threads-recommendation/1",
    recommendationDate: input.recommendationDate,
    generatedAt: input.generatedAt.toISOString(),
    inputHash: personalGrowthHash({ config, candidates: input.candidates, recentPosts: input.recentPosts ?? [], conversations }),
    decision,
    noPostReason,
    primary: decision === "RECOMMEND" ? suggestions[0] : null,
    alternatives: decision === "RECOMMEND" ? suggestions.slice(1) : [],
    conversationStatus: conversations.length > 0 ? "available" : "unavailable",
    conversationOpportunities: conversations,
    publishingAuthorized: false,
    repliesAuthorized: false,
    rejectedCounts
  });
}

export interface PersonalGrowthContentHistoryEntry {
  date: string;
  classification: "personal-or-personally-authored" | "owner-manual-venture-led";
  action: "feed" | "story-reshare";
  sourceProject: string | null;
}

export function evaluatePersonalGrowthManualReference(input: {
  reference: unknown;
  policy: PersonalGrowthContentPolicy;
  history: readonly PersonalGrowthContentHistoryEntry[];
  now: Date;
}): { accepted: boolean; reasons: string[]; projectedPersonalRatio: number | null; reference: PersonalGrowthManualVentureReference | null } {
  const parsed = PersonalGrowthManualVentureReferenceSchema.safeParse(input.reference);
  if (!parsed.success) return { accepted: false, reasons: ["invalid-manual-reference"], projectedPersonalRatio: null, reference: null };
  const reference = parsed.data;
  const rule = PersonalGrowthContentPolicySchema.parse(input.policy).revisions.at(-1)!;
  const reasons: string[] = [];
  if (Date.parse(reference.expiresAt) <= input.now.getTime()) reasons.push("expired");
  if (reference.requestedAction !== "RESHARE_WITH_PERSONAL_NOTE") reasons.push("not-selected-for-reshare");
  const feedHistory = input.history.filter(({ action }) => action === "feed");
  const recordedPersonal = feedHistory.filter(({ classification }) => classification === "personal-or-personally-authored").length;
  const recordedVenture = feedHistory.filter(({ classification }) => classification === "owner-manual-venture-led").length;
  if (feedHistory.length > 0 && (recordedPersonal !== reference.personalItemsInRollingWindow || recordedVenture !== reference.ventureItemsInRollingWindow)) {
    reasons.push("content-mix-mismatch");
  }
  const personalItems = feedHistory.length > 0 ? recordedPersonal : reference.personalItemsInRollingWindow;
  const ventureItems = feedHistory.length > 0 ? recordedVenture : reference.ventureItemsInRollingWindow;
  const total = personalItems + ventureItems + 1;
  const projectedPersonalRatio = total === 0 ? null : personalItems / total;
  if (projectedPersonalRatio === null || projectedPersonalRatio < rule.personalFeedMinimum) reasons.push("85-15-policy");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(input.now);
  const recentStories = input.history.filter((entry) => entry.action === "story-reshare"
    && Date.parse(`${entry.date}T00:00:00.000Z`) >= Date.parse(`${today}T00:00:00.000Z`) - (6 * 86_400_000));
  if (recentStories.length >= rule.ventureStoriesPerSevenDaysMaximum) reasons.push("story-cap");
  if (recentStories.some((entry) => entry.sourceProject === reference.sourceProject
      && Date.parse(`${entry.date}T00:00:00.000Z`) > Date.parse(`${today}T00:00:00.000Z`) - (rule.sameVentureCooldownDays * 86_400_000))) {
    reasons.push("same-venture-cooldown");
  }
  return { accepted: reasons.length === 0, reasons, projectedPersonalRatio, reference };
}

export function buildPersonalGrowthInstagramRecommendation(input: {
  recommendationDate: string;
  generatedAt: Date;
  actionType: PersonalGrowthInstagramRecommendation["actionType"];
  pillar: PersonalGrowthInstagramRecommendation["pillar"];
  goal: string | null;
  dueWindow: string | null;
  ownerSourceRefs: readonly string[];
  collaborator?: string | null;
  assetChecklist?: readonly string[];
  distributionChecklist?: readonly string[];
  storiesSupport?: readonly string[];
  reason: string;
  reel?: PersonalGrowthReelSuggestion | null;
  manualReferenceEvaluation?: ReturnType<typeof evaluatePersonalGrowthManualReference>;
  goviralSignalId?: string | null;
  activeExperimentId?: string | null;
  englishProfileAvailable?: boolean;
  recommendationAuthority?: boolean;
}): PersonalGrowthInstagramRecommendation {
  const authority = input.recommendationAuthority ?? true;
  const reel = input.reel ? PersonalGrowthReelSuggestionSchema.parse(input.reel) : null;
  const manual = input.manualReferenceEvaluation;
  const blockedEnglish = reel?.language === "en" && !(input.englishProfileAvailable ?? false);
  const blockedPolicy = input.actionType === "owner-manual-venture-reshare" && manual?.accepted !== true;
  const noPostReason = !authority ? "authority-held" as const
    : blockedEnglish ? "english-profile-unavailable" as const
      : blockedPolicy ? "policy-blocked" as const
        : input.actionType === "no-post" ? "no-useful-candidate" as const
          : null;
  const actionType = noPostReason === null ? input.actionType : "no-post" as const;
  const format = actionType === "no-post" ? "none" as const
    : actionType === "reel" ? "reel" as const
      : actionType === "story-sequence" || actionType === "owner-manual-venture-reshare" ? "story" as const
        : actionType === "okraj-distribution" || actionType === "bbarak-distribution" ? "distribution-checklist" as const
          : actionType === "photo-dump" ? "feed-carousel" as const : "feed-photo" as const;
  return PersonalGrowthInstagramRecommendationSchema.parse({
    schemaVersion: "personal-growth-instagram-recommendation/1",
    recommendationDate: input.recommendationDate,
    generatedAt: input.generatedAt.toISOString(),
    actionType,
    format,
    pillar: actionType === "no-post" ? null : input.pillar,
    goal: actionType === "no-post" ? null : input.goal,
    dueWindow: actionType === "no-post" ? null : input.dueWindow,
    ownerSourceRefs: actionType === "no-post" ? [] : input.ownerSourceRefs,
    collaborator: actionType === "no-post" ? null : input.collaborator ?? null,
    assetChecklist: actionType === "no-post" ? [] : input.assetChecklist ?? [],
    distributionChecklist: actionType === "no-post" ? [] : input.distributionChecklist ?? [],
    storiesSupport: actionType === "no-post" ? [] : input.storiesSupport ?? [],
    projectedPersonalRatio: manual?.projectedPersonalRatio ?? null,
    goviralSignalId: actionType === "no-post" ? null : input.goviralSignalId ?? null,
    activeExperimentId: actionType === "no-post" ? null : input.activeExperimentId ?? null,
    reason: noPostReason ? [input.reason, ...(manual?.reasons ?? [])].join(": ") : input.reason,
    noPostReason,
    reel: actionType === "reel" ? reel : null,
    manualVentureReferenceId: actionType === "owner-manual-venture-reshare" ? manual?.reference?.referenceId ?? null : null,
    ownerWritesArtifact: true,
    publishingAuthorized: false
  });
}

export function createPersonalGrowthConversationOpportunity(input: Omit<PersonalGrowthConversationOpportunity, "opportunityId">): PersonalGrowthConversationOpportunity {
  return PersonalGrowthConversationOpportunitySchema.parse({
    ...input,
    opportunityId: `pg-conversation-${personalGrowthHash(input).slice(-16)}`
  });
}
