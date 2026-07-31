import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parsePublicMeetingRecord } from "./meeting-record-model";
import { currentRating, parseRatingLedger, type RatingRecord } from "./rating-model";

export type IncubatorProposalStatus = "proposed" | "rated" | "shortlist" | "archived";

export interface PublicIncubatorProposal {
  id: string;
  domain: string;
  oneLiner: string;
  whyPeopleCareDaily: string;
  status: IncubatorProposalStatus;
  rating: { value: "perfect" | "good" | "bad"; ratedAt: string } | null;
  audience: {
    regions: string[];
    ageMin: number;
    ageMax: number;
    interests: string[];
    platforms: string[];
  };
  cadence: string;
  formats: string[];
  caughtUpReuseNotes: string;
  competitionNotes: Array<{ note: string; evidenceRef: string }>;
  risks: string[];
  evidenceRefs: string[];
  originMeetingId: string;
}

export interface IncubatorSnapshot {
  proposals: PublicIncubatorProposal[];
  shortlist: PublicIncubatorProposal[];
  meetingIds: string[];
  apiSpendUsd: number;
  unreadableFiles: string[];
}

const forbiddenPublicText = /(?:system prompt|developer message|process\.env|api[_ -]?key|private[_ -]?key|state\/inbox|social\/queue)/i;

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && candidate.length <= maximum && !forbiddenPublicText.test(candidate)
    ? candidate
    : null;
}

function textArray(value: unknown, maximumItems: number, maximumText = 500): string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const parsed = value.map((entry) => text(entry, maximumText));
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function derivedStatus(
  stored: IncubatorProposalStatus,
  rating: RatingRecord | null
): IncubatorProposalStatus {
  if (!rating) return stored;
  if (rating.rating === "perfect") return "shortlist";
  if (rating.rating === "bad") return "archived";
  return "rated";
}

function parseProposal(
  raw: string,
  ratings: readonly RatingRecord[]
): PublicIncubatorProposal | null {
  let proposal: Record<string, unknown> | null;
  try {
    proposal = object(JSON.parse(raw));
  } catch {
    return null;
  }
  if (proposal?.schemaVersion !== "niche-proposal/1") return null;
  const id = text(proposal.id, 160);
  const domain = text(proposal.domain, 120);
  const oneLiner = text(proposal.oneLiner, 240);
  const whyPeopleCareDaily = text(proposal.whyPeopleCareDaily, 800);
  const storedStatus = typeof proposal.status === "string" && ["proposed", "rated", "shortlist", "archived"].includes(proposal.status)
    ? proposal.status as IncubatorProposalStatus
    : null;
  const originMeetingRef = text(proposal.originMeetingRef, 160);
  const audience = object(proposal.audienceHypothesis);
  const ageRange = object(audience?.ageRange);
  const regions = textArray(audience?.regions, 24, 80);
  const interests = textArray(audience?.interests, 24, 80);
  const platforms = textArray(audience?.platforms, 16, 80);
  const contentShape = object(proposal.contentShape);
  const cadence = text(contentShape?.cadence, 120);
  const formats = textArray(contentShape?.formats, 16, 80);
  const caughtUpReuseNotes = text(contentShape?.caughtUpReuseNotes, 500);
  const risks = textArray(proposal.risks, 24, 300);
  const evidenceRefs = textArray(proposal.evidenceRefs, 32, 160);
  const competitionNotes = Array.isArray(proposal.competitionNotes) && proposal.competitionNotes.length <= 24
    ? proposal.competitionNotes.map((entry) => {
      const note = object(entry);
      const body = text(note?.note, 500);
      const evidenceRef = text(note?.evidenceRef, 160);
      return body && evidenceRef ? { note: body, evidenceRef } : null;
    })
    : null;
  if (
    !id || !/^niche-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/.test(id) ||
    !domain || !oneLiner || !whyPeopleCareDaily || !storedStatus ||
    !originMeetingRef?.startsWith("meetings/") ||
    !regions?.length || !interests?.length || !platforms?.length ||
    typeof ageRange?.min !== "number" || typeof ageRange?.max !== "number" ||
    !Number.isInteger(ageRange.min) || !Number.isInteger(ageRange.max) ||
    ageRange.min < 18 || ageRange.max < ageRange.min ||
    !cadence || !formats?.length || !caughtUpReuseNotes || !risks || !evidenceRefs ||
    !competitionNotes || competitionNotes.some((entry) => entry === null)
  ) return null;
  const history = ratings.filter((rating) =>
    rating.ventureId === "incubator" &&
    rating.objectKind === "niche-proposal" &&
    rating.objectRef.id === id
  );
  const rating = currentRating(history, id);
  return {
    id,
    domain,
    oneLiner,
    whyPeopleCareDaily,
    status: derivedStatus(storedStatus, rating),
    rating: rating ? { value: rating.rating, ratedAt: rating.ratedAt } : null,
    audience: {
      regions,
      ageMin: ageRange.min,
      ageMax: ageRange.max,
      interests,
      platforms
    },
    cadence,
    formats,
    caughtUpReuseNotes,
    competitionNotes: competitionNotes as Array<{ note: string; evidenceRef: string }>,
    risks,
    evidenceRefs,
    originMeetingId: originMeetingRef.slice("meetings/".length)
  };
}

async function optionalText(filename: string): Promise<string> {
  try {
    return await readFile(filename, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function getIncubatorSnapshot(root = repositoryRoot()): Promise<IncubatorSnapshot> {
  const proposalDirectory = path.join(root, "state", "ventures", "incubator", "niche-proposals");
  const proposalNames = (await readdir(proposalDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const [ratingRaw, ledgerRaw, scanRaw, synthesisRaw, ...proposalRaws] = await Promise.all([
    optionalText(path.join(root, "state", "ratings", "incubator", "ledger.jsonl")),
    optionalText(path.join(root, "state", "budget", "ledger.json")),
    readFile(path.join(root, "state", "meetings", "2026-08-01-incubator-scan.json"), "utf8"),
    readFile(path.join(root, "state", "meetings", "2026-08-01-incubator-synthesis.json"), "utf8"),
    ...proposalNames.map((name) => readFile(path.join(proposalDirectory, name), "utf8"))
  ]);
  const ratings = parseRatingLedger(ratingRaw);
  if (!ratings) throw new Error("Incubator rating ledger is malformed");
  const proposals: PublicIncubatorProposal[] = [];
  const unreadableFiles: string[] = [];
  proposalRaws.forEach((raw, index) => {
    const parsed = parseProposal(raw, ratings);
    if (parsed) proposals.push(parsed);
    else unreadableFiles.push(proposalNames[index]!);
  });
  const meetingIds = [scanRaw, synthesisRaw].map((raw) => parsePublicMeetingRecord(JSON.parse(raw)))
    .filter((meeting) => meeting?.kind === "incubator-scan" || meeting?.kind === "incubator-synthesis")
    .map((meeting) => meeting!.id);
  if (meetingIds.length !== 2) throw new Error("Incubator dry meeting record is invalid");
  let ledger: { entries?: Array<{ ventureId?: string; usd?: number }> } = {};
  if (ledgerRaw) {
    try {
      ledger = JSON.parse(ledgerRaw) as typeof ledger;
    } catch {
      throw new Error("Budget ledger is malformed");
    }
  }
  const apiSpendUsd = (ledger.entries ?? [])
    .filter((entry) => entry.ventureId === "incubator" && typeof entry.usd === "number" && Number.isFinite(entry.usd))
    .reduce((sum, entry) => sum + (entry.usd ?? 0), 0);
  proposals.sort((left, right) => left.domain.localeCompare(right.domain));
  return {
    proposals,
    shortlist: proposals.filter((proposal) => proposal.status === "shortlist"),
    meetingIds,
    apiSpendUsd: Number(apiSpendUsd.toFixed(8)),
    unreadableFiles
  };
}
