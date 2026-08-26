import {
  PersonalGrowthGoViralFeedbackSchema,
  PersonalGrowthGoViralPacketSchema,
  type PersonalGrowthGoViralOpportunity,
  type PersonalGrowthGoViralPacket
} from "../../contracts/personal-growth.js";
import { personalGrowthHash } from "./planner.js";
import { atomicWriteJson, readJson } from "../../state.js";

export const PERSONAL_GROWTH_GOVIRAL_CURRENT_PATH = "ventures/personal-growth/intelligence/current.json";

export const PERSONAL_GROWTH_TOPICS = [
  "owner-writing",
  "building-in-public",
  "ai-tools",
  "solo-founder",
  "hip-hop-culture",
  "life-stories"
] as const;

export interface SavedGoViralPersonalCandidate {
  candidateId: string;
  topic: (typeof PERSONAL_GROWTH_TOPICS)[number];
  evidenceRefs: string[];
  sourceRefs: string[];
  evidenceStatus: "verified" | "corroborated" | "insufficient";
  velocity: number | null;
  relevance: number;
  pillar: "craft" | "career" | "culture" | "business" | "personal";
  expiresAt: string;
  format: "threads" | "instagram-carousel" | "reel" | "article";
  fit: "strong" | "possible" | "weak";
  risk: "low" | "medium" | "high";
  overload: "clear" | "collision" | "skip";
}

export interface SavedGoViralBrief {
  briefId: string;
  briefHash: string;
  weekOf: string;
  generatedAt: string;
  expiresAt: string;
  sourceHealth: "healthy" | "degraded" | "unavailable";
  quota: "available" | "constrained" | "exhausted" | "unknown";
  agendaRef: string | null;
  candidates: SavedGoViralPersonalCandidate[];
}

function isoWeekKey(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error("GoVIRAL week date is invalid");
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const first = new Date(Date.UTC(value.getUTCFullYear(), 0, 1, 12));
  const week = Math.ceil((((value.getTime() - first.getTime()) / 86_400_000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function pragueWeekday(instant: string): string {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) throw new Error("GoVIRAL generation time is invalid");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    weekday: "short"
  }).format(value);
}

function disposition(candidate: SavedGoViralPersonalCandidate): "use" | "watch" | "ignore" {
  if (candidate.overload === "skip" || candidate.risk === "high" || candidate.fit === "weak") return "ignore";
  if (candidate.fit === "strong" && candidate.relevance >= 0.7 && candidate.risk === "low" && candidate.overload === "clear") return "use";
  return "watch";
}

function status(candidate: SavedGoViralPersonalCandidate, generatedAt: string): "available" | "expired" {
  return Date.parse(candidate.expiresAt) <= Date.parse(generatedAt) ? "expired" : "available";
}

function acceptedCandidates(brief: SavedGoViralBrief): PersonalGrowthGoViralOpportunity[] {
  if (brief.quota === "exhausted" || brief.sourceHealth === "unavailable") return [];
  return brief.candidates
    .filter((candidate) =>
      candidate.evidenceStatus !== "insufficient"
      && candidate.evidenceRefs.length > 0
      && candidate.sourceRefs.length > 0
      && Date.parse(candidate.expiresAt) > Date.parse(brief.generatedAt))
    .sort((left, right) =>
      right.relevance - left.relevance
      || (right.velocity ?? -Infinity) - (left.velocity ?? -Infinity)
      || left.candidateId.localeCompare(right.candidateId))
    .slice(0, 3)
    .map((candidate) => ({
      opportunityId: `pg-gv-${personalGrowthHash({ brief: brief.briefHash, candidate: candidate.candidateId }).slice(-16)}`,
      topic: candidate.topic,
      disposition: disposition(candidate),
      evidenceStatus: candidate.evidenceStatus === "verified" ? "verified" as const : "corroborated" as const,
      evidenceRefs: candidate.evidenceRefs,
      sourceRefs: candidate.sourceRefs,
      velocity: candidate.velocity,
      relevance: candidate.relevance,
      pillar: candidate.pillar,
      expiresAt: candidate.expiresAt,
      format: candidate.format,
      fit: candidate.fit,
      risk: candidate.risk,
      overload: candidate.overload,
      status: status(candidate, brief.generatedAt),
      outcome: "unused"
    }));
}

/**
 * Adapt the one saved weekly GoVIRAL brief for the private desk. This function never calls an
 * actor, scraper or provider. Candidate values are data, not instructions, and only exact enums,
 * numbers and evidence references survive into the packet.
 */
export function buildPersonalGrowthGoViralPacket(input: {
  brief: SavedGoViralBrief;
  personalGrowthRunAt: Date;
  threadsMode?: "official-future-seam" | "bounded-public-actor" | "unavailable";
  existing?: PersonalGrowthGoViralPacket | null;
}): PersonalGrowthGoViralPacket {
  if (Number.isNaN(input.personalGrowthRunAt.getTime())) throw new Error("Personal Growth run time is invalid");
  if (Date.parse(input.brief.generatedAt) >= input.personalGrowthRunAt.getTime()) {
    throw new Error("The saved Monday GoVIRAL brief must precede the Personal Growth desk");
  }
  if (pragueWeekday(input.brief.generatedAt) !== "Mon") {
    throw new Error("Personal Growth intelligence is accepted only from the Monday GoVIRAL brief");
  }
  const weekKey = isoWeekKey(input.brief.weekOf);
  if (input.existing
      && input.existing.agenda.weekKey === weekKey
      && input.existing.goviralBriefHash === input.brief.briefHash
      && Date.parse(input.existing.expiresAt) > input.personalGrowthRunAt.getTime()) {
    return PersonalGrowthGoViralPacketSchema.parse(input.existing);
  }
  const priorAgenda = input.existing?.agenda.weekKey === weekKey ? input.existing.agenda.agendaRef : null;
  const agendaRef = priorAgenda ?? input.brief.agendaRef;
  const opportunities = acceptedCandidates(input.brief);
  const packet = {
    schemaVersion: "personal-growth-goviral-packet/1" as const,
    packetId: `pg-goviral-${input.brief.weekOf}`,
    weekOf: input.brief.weekOf,
    generatedAt: input.brief.generatedAt,
    expiresAt: input.brief.expiresAt,
    inputHash: personalGrowthHash({
      briefHash: input.brief.briefHash,
      sourceHealth: input.brief.sourceHealth,
      quota: input.brief.quota,
      threadsMode: input.threadsMode ?? "bounded-public-actor",
      candidates: opportunities
    }),
    goviralBriefId: input.brief.briefId,
    goviralBriefHash: input.brief.briefHash,
    sourceRegistryRef: "config/goviral-sources.json" as const,
    profileRef: "state/ventures/goviral/profile.md" as const,
    sourceHealth: input.brief.sourceHealth,
    quota: input.brief.quota,
    retrieval: {
      threadsKeywordMode: input.threadsMode ?? "bounded-public-actor",
      accountCredentialsUsed: false as const,
      apifyUpgradeRequired: false as const
    },
    reusedWeeklyBrief: true as const,
    providerRerun: false as const,
    incrementalCostUsd: 0 as const,
    opportunities,
    agenda: {
      weekKey,
      status: agendaRef === null
        ? (input.brief.sourceHealth === "unavailable" ? "unavailable" as const : "not-needed" as const)
        : priorAgenda ? "reused" as const : "created" as const,
      agendaRef
    }
  };
  return PersonalGrowthGoViralPacketSchema.parse(packet);
}

export function reusablePersonalGrowthGoViralPacket(
  packet: unknown,
  at: Date
): PersonalGrowthGoViralPacket | null {
  const parsed = PersonalGrowthGoViralPacketSchema.safeParse(packet);
  if (!parsed.success || Number.isNaN(at.getTime()) || Date.parse(parsed.data.expiresAt) <= at.getTime()) return null;
  return parsed.data;
}

export async function readPersonalGrowthGoViralPacket(
  root: string,
  at: Date
): Promise<PersonalGrowthGoViralPacket | null> {
  return reusablePersonalGrowthGoViralPacket(
    await readJson<unknown>(root, PERSONAL_GROWTH_GOVIRAL_CURRENT_PATH, null),
    at
  );
}

export async function writePersonalGrowthGoViralPacket(
  root: string,
  packetInput: PersonalGrowthGoViralPacket
): Promise<{ packet: PersonalGrowthGoViralPacket; created: boolean }> {
  const packet = PersonalGrowthGoViralPacketSchema.parse(packetInput);
  const existingRaw = await readJson<unknown>(root, PERSONAL_GROWTH_GOVIRAL_CURRENT_PATH, null);
  const existing = PersonalGrowthGoViralPacketSchema.safeParse(existingRaw);
  if (existing.success && existing.data.inputHash === packet.inputHash) {
    return { packet: existing.data, created: false };
  }
  if (existing.success
      && existing.data.weekOf === packet.weekOf
      && existing.data.agenda.agendaRef !== null
      && packet.agenda.agendaRef !== existing.data.agenda.agendaRef) {
    throw new Error("Personal Growth permits at most one GoVIRAL agenda per week");
  }
  await atomicWriteJson(root, PERSONAL_GROWTH_GOVIRAL_CURRENT_PATH, packet);
  return { packet, created: true };
}

/** Record feedback beside, never inside, the immutable source packet. */
export function personalGrowthGoViralFeedback(input: {
  packet: PersonalGrowthGoViralPacket;
  opportunityId: string;
  outcome: "used" | "rejected" | "ignored" | "posted";
  recordedAt: Date;
}) {
  const packet = PersonalGrowthGoViralPacketSchema.parse(input.packet);
  if (!packet.opportunities.some(({ opportunityId }) => opportunityId === input.opportunityId)) {
    throw new Error("Feedback must identify an opportunity from the immutable packet");
  }
  return PersonalGrowthGoViralFeedbackSchema.parse({
    schemaVersion: "personal-growth-goviral-feedback/1",
    packetId: packet.packetId,
    opportunityId: input.opportunityId,
    outcome: input.outcome,
    recordedAt: input.recordedAt.toISOString(),
    sourcePacketHash: personalGrowthHash(packet)
  });
}
