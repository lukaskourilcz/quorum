import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}
const STATE_VALUES = [
  "not-started", "ready", "in-progress", "implemented-awaiting-verification", "owner-action",
  "blocked", "complete", "held-optional", "stale", "inconsistent", "superseded"
] as const;
const STATE_SET = new Set<string>(STATE_VALUES);
export type AdminImplementationState = (typeof STATE_VALUES)[number];

export interface AdminImplementationProbe {
  id: string;
  status: "pass" | "fail" | "unavailable";
  detail: string;
  evidenceRef: string | null;
}

export interface AdminImplementationPullRequest {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  checksPassed: boolean | null;
  updatedAt: string;
}

export interface AdminImplementationItem {
  id: string;
  programRefs: string[];
  issueNumber: number;
  issueUrl: string;
  title: string;
  summary: string;
  phaseId: string;
  posture: "mandatory" | "optional" | "held-optional";
  state: AdminImplementationState;
  explanation: string;
  dependencyIds: string[];
  blockerItemIds: string[];
  safeParallelGroup: string | null;
  protectedFileGroups: string[];
  expectedDeliverables: string[];
  ownerOnlySetupClasses: string[];
  ownerActions: string[];
  discrepancies: string[];
  recommendedAction: string;
  weight: number | null;
  finalGate: boolean;
  sharedWorkItemRef: string | null;
  supersededBy: string | null;
  issueState: "open" | "closed" | null;
  issueUpdatedAt: string | null;
  pullRequests: AdminImplementationPullRequest[];
  probes: AdminImplementationProbe[];
  evidenceRefs: string[];
  stale: boolean;
}

export interface AdminImplementationProgram {
  id: string;
  name: string;
  description: string;
  parentIssueNumber: number;
  parentIssueUrl: string;
  visibility: "public" | "owner-only" | "internal";
  manifestVersion: string;
  phases: Array<{ id: string; name: string; workItemIds: string[] }>;
  prerequisiteIssueNumbers: number[];
  finalReleaseItemId: string;
  mandatoryCompleted: number;
  mandatoryTotal: number;
  weightedProgressPercent: number | null;
  stateCounts: Record<AdminImplementationState, number>;
  currentItemId: string | null;
  nextUnblockedItemIds: string[];
  parallelSafeItemIds: string[];
  ownerWaitingItemIds: string[];
  finalGateReady: boolean;
  finalGateComplete: boolean;
}

export type AdminImplementationProgress =
  | { state: "missing"; programs: []; items: []; unreadableItems: number; generatedAt: null; sourceFreshness: "unavailable"; lastSuccessfulSyncAt: null; github: null; sharedItemIds: [] }
  | { state: "malformed"; programs: AdminImplementationProgram[]; items: AdminImplementationItem[]; unreadableItems: number; generatedAt: string | null; sourceFreshness: "unavailable"; lastSuccessfulSyncAt: string | null; github: null; sharedItemIds: string[] }
  | {
      state: "present";
      programs: AdminImplementationProgram[];
      items: AdminImplementationItem[];
      unreadableItems: number;
      generatedAt: string;
      sourceFreshness: "fresh" | "partial" | "stale" | "unavailable";
      lastSuccessfulSyncAt: string | null;
      github: { cacheStatus: string; rateRemaining: number | null; failedItems: number };
      sharedItemIds: string[];
    };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, maximum = 500): string | null {
  return typeof value === "string" && value.trim() && value.length <= maximum ? value.trim() : null;
}

function id(value: unknown): string | null {
  const candidate = text(value, 160);
  return candidate && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate) ? candidate : null;
}

function iso(value: unknown): string | null {
  const candidate = text(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function strings(value: unknown, maximum = 60): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => text(entry));
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function ids(value: unknown, maximum = 60): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map(id);
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function githubUrl(value: unknown): string | null {
  const candidate = text(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && parsed.hostname === "github.com" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeEvidenceRef(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate || /[\r\n\0]/u.test(candidate)) return null;
  if (candidate.startsWith("https://")) return githubUrl(candidate);
  return !path.isAbsolute(candidate) && !candidate.split(/[\\/]/u).includes("..") ? candidate : null;
}

function parseProbe(value: unknown): AdminImplementationProbe | null {
  const probe = record(value);
  const probeId = id(probe?.probeId);
  const status = probe?.status;
  const detail = text(probe?.detail);
  const evidenceRef = probe?.evidenceRef === null ? null : safeEvidenceRef(probe?.evidenceRef);
  return probeId && (status === "pass" || status === "fail" || status === "unavailable") && detail && (probe?.evidenceRef === null || evidenceRef)
    ? { id: probeId, status, detail, evidenceRef }
    : null;
}

function parsePull(value: unknown): AdminImplementationPullRequest | null {
  const pull = record(value);
  const number = integer(pull?.number);
  const url = githubUrl(pull?.url);
  const state = pull?.state;
  const updatedAt = iso(pull?.updatedAt);
  return number && url && (state === "open" || state === "closed") && typeof pull?.merged === "boolean" &&
    (typeof pull?.checksPassed === "boolean" || pull?.checksPassed === null) && updatedAt
    ? { number, url, state, merged: pull.merged, checksPassed: pull.checksPassed as boolean | null, updatedAt }
    : null;
}

function parseItem(value: unknown): AdminImplementationItem | null {
  const item = record(value);
  const github = record(item?.github);
  const issue = record(github?.issue);
  const itemId = id(item?.itemId);
  const programRefs = ids(item?.programRefs, 4);
  const issueNumber = integer(item?.issueNumber);
  const issueUrl = githubUrl(item?.issueUrl);
  const title = text(item?.title, 240);
  const summary = text(item?.summary);
  const phaseId = id(item?.phaseId);
  const posture = item?.posture;
  const state = item?.state;
  const explanation = text(item?.explanation, 800);
  const dependencyIds = ids(item?.dependencyIds, 30);
  const blockerItemIds = ids(item?.blockerItemIds, 30);
  const safeParallelGroup = item?.safeParallelGroup === null ? null : id(item?.safeParallelGroup);
  const protectedFileGroups = ids(item?.protectedFileGroups, 20);
  const expectedDeliverables = strings(item?.expectedDeliverables, 20);
  const ownerOnlySetupClasses = strings(item?.ownerOnlySetupClasses, 20);
  const ownerActions = strings(item?.ownerActions, 20);
  const discrepancies = strings(item?.discrepancies, 20);
  const recommendedAction = text(item?.recommendedAction);
  const probes = Array.isArray(item?.probes) ? item.probes.map(parseProbe) : null;
  const pullRequests = Array.isArray(github?.pullRequests) ? github.pullRequests.map(parsePull) : null;
  const evidenceRefs = Array.isArray(item?.evidenceRefs) ? item.evidenceRefs.map(safeEvidenceRef) : null;
  const issueState = issue?.state === "open" || issue?.state === "closed" ? issue.state : null;
  const issueUpdatedAt = issue ? iso(issue.updatedAt) : null;
  const weight = item?.weight === null ? null : typeof item?.weight === "number" && item.weight > 0 ? item.weight : null;
  const sharedWorkItemRef = item?.sharedWorkItemRef === null ? null : id(item?.sharedWorkItemRef);
  const supersededBy = item?.supersededBy === null ? null : id(item?.supersededBy);
  if (!itemId || !programRefs?.length || !issueNumber || !issueUrl || !title || !summary || !phaseId ||
    (posture !== "mandatory" && posture !== "optional" && posture !== "held-optional") || !STATE_SET.has(String(state)) ||
    !explanation || !dependencyIds || !blockerItemIds || (item?.safeParallelGroup !== null && !safeParallelGroup) ||
    !protectedFileGroups || !expectedDeliverables?.length || !ownerOnlySetupClasses || !ownerActions || !discrepancies || !recommendedAction ||
    !probes || probes.some((entry) => !entry) || !pullRequests || pullRequests.some((entry) => !entry) ||
    !evidenceRefs || evidenceRefs.some((entry) => !entry) || (item?.weight !== null && weight === null) || typeof item?.finalGate !== "boolean" ||
    (item?.sharedWorkItemRef !== null && !sharedWorkItemRef) || (item?.supersededBy !== null && !supersededBy)) return null;
  return {
    id: itemId,
    programRefs,
    issueNumber,
    issueUrl,
    title,
    summary,
    phaseId,
    posture,
    state: state as AdminImplementationState,
    explanation,
    dependencyIds,
    blockerItemIds,
    safeParallelGroup,
    protectedFileGroups,
    expectedDeliverables,
    ownerOnlySetupClasses,
    ownerActions,
    discrepancies,
    recommendedAction,
    weight,
    finalGate: item.finalGate,
    sharedWorkItemRef,
    supersededBy,
    issueState,
    issueUpdatedAt,
    pullRequests: pullRequests as AdminImplementationPullRequest[],
    probes: probes as AdminImplementationProbe[],
    evidenceRefs: evidenceRefs as string[],
    stale: github?.stale === true
  };
}

function parseProgram(value: unknown): AdminImplementationProgram | null {
  const program = record(value);
  const programId = id(program?.programId);
  const name = text(program?.name, 160);
  const description = text(program?.description, 600);
  const parentIssueNumber = integer(program?.parentIssueNumber);
  const parentIssueUrl = githubUrl(program?.parentIssueUrl);
  const visibility = program?.visibility;
  const manifestVersion = text(program?.manifestVersion, 40);
  const phases = Array.isArray(program?.phases) ? program.phases.map((raw) => {
    const phase = record(raw);
    const phaseId = id(phase?.id);
    const phaseName = text(phase?.name, 120);
    const workItemIds = ids(phase?.workItemIds);
    return phaseId && phaseName && workItemIds?.length ? { id: phaseId, name: phaseName, workItemIds } : null;
  }) : null;
  const prerequisiteIssueNumbers = Array.isArray(program?.prerequisiteIssueNumbers)
    ? program.prerequisiteIssueNumbers.map(integer)
    : null;
  const finalReleaseItemId = id(program?.finalReleaseItemId);
  const mandatoryCompleted = integer(program?.mandatoryCompleted);
  const mandatoryTotal = integer(program?.mandatoryTotal);
  const weightedProgressPercent = program?.weightedProgressPercent === null ? null : typeof program?.weightedProgressPercent === "number" && program.weightedProgressPercent >= 0 && program.weightedProgressPercent <= 100 ? program.weightedProgressPercent : null;
  const rawCounts = record(program?.stateCounts);
  const counts = Object.fromEntries(STATE_VALUES.map((state) => [state, integer(rawCounts?.[state])])) as Record<AdminImplementationState, number | null>;
  const currentItemId = program?.currentItemId === null ? null : id(program?.currentItemId);
  const nextUnblockedItemIds = ids(program?.nextUnblockedItemIds);
  const parallelSafeItemIds = ids(program?.parallelSafeItemIds);
  const ownerWaitingItemIds = ids(program?.ownerWaitingItemIds);
  if (!programId || !name || !description || !parentIssueNumber || !parentIssueUrl ||
    (visibility !== "public" && visibility !== "owner-only" && visibility !== "internal") || !manifestVersion || !phases?.length || phases.some((entry) => !entry) ||
    !prerequisiteIssueNumbers || prerequisiteIssueNumbers.some((entry) => entry === null) || !finalReleaseItemId || mandatoryCompleted === null || mandatoryTotal === null ||
    (program?.weightedProgressPercent !== null && weightedProgressPercent === null) || Object.values(counts).some((entry) => entry === null) ||
    (program?.currentItemId !== null && !currentItemId) || !nextUnblockedItemIds || !parallelSafeItemIds || !ownerWaitingItemIds ||
    typeof program?.finalGateReady !== "boolean" || typeof program?.finalGateComplete !== "boolean") return null;
  return {
    id: programId,
    name,
    description,
    parentIssueNumber,
    parentIssueUrl,
    visibility,
    manifestVersion,
    phases: phases as AdminImplementationProgram["phases"],
    prerequisiteIssueNumbers: prerequisiteIssueNumbers as number[],
    finalReleaseItemId,
    mandatoryCompleted,
    mandatoryTotal,
    weightedProgressPercent,
    stateCounts: counts as Record<AdminImplementationState, number>,
    currentItemId,
    nextUnblockedItemIds,
    parallelSafeItemIds,
    ownerWaitingItemIds,
    finalGateReady: program.finalGateReady,
    finalGateComplete: program.finalGateComplete
  };
}

export async function readAdminImplementationProgress(root = repositoryRoot()): Promise<AdminImplementationProgress> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(root, "state/programs/current.json"), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing", programs: [], items: [], unreadableItems: 0, generatedAt: null, sourceFreshness: "unavailable", lastSuccessfulSyncAt: null, github: null, sharedItemIds: [] };
    return { state: "malformed", programs: [], items: [], unreadableItems: 1, generatedAt: null, sourceFreshness: "unavailable", lastSuccessfulSyncAt: null, github: null, sharedItemIds: [] };
  }
  const snapshot = record(raw);
  const generatedAt = iso(snapshot?.generatedAt);
  const sourceFreshness = snapshot?.sourceFreshness;
  const lastSuccessfulSyncAt = snapshot?.lastSuccessfulSyncAt === null ? null : iso(snapshot?.lastSuccessfulSyncAt);
  const programEnvelopeValid = Array.isArray(snapshot?.programs) && snapshot.programs.length > 0 && snapshot.programs.length <= 100;
  const itemEnvelopeValid = Array.isArray(snapshot?.items) && snapshot.items.length > 0 && snapshot.items.length <= 500;
  const rawPrograms = programEnvelopeValid ? snapshot!.programs as unknown[] : [];
  const rawItems = itemEnvelopeValid ? snapshot!.items as unknown[] : [];
  const programs = rawPrograms.map(parseProgram).filter((entry): entry is AdminImplementationProgram => Boolean(entry));
  const items = rawItems.map(parseItem).filter((entry): entry is AdminImplementationItem => Boolean(entry));
  const malformedProbeCount = integer(snapshot?.malformedProbeCount);
  const unreadableItems = rawPrograms.length - programs.length + rawItems.length - items.length + (malformedProbeCount ?? 0);
  const parsedSharedItemIds = ids(snapshot?.sharedItemIds);
  const sharedItemIds = parsedSharedItemIds ?? [];
  const github = record(snapshot?.github);
  const cacheStatus = text(github?.cacheStatus, 40);
  const rateRemaining = github?.rateRemaining === null ? null : integer(github?.rateRemaining);
  const failedItems = integer(github?.failedItems);
  if (snapshot?.schemaVersion !== "implementation-progress/1" || !generatedAt ||
    !programEnvelopeValid || !itemEnvelopeValid || !parsedSharedItemIds || malformedProbeCount === null ||
    (sourceFreshness !== "fresh" && sourceFreshness !== "partial" && sourceFreshness !== "stale" && sourceFreshness !== "unavailable") ||
    (snapshot?.lastSuccessfulSyncAt !== null && !lastSuccessfulSyncAt) || !cacheStatus || failedItems === null ||
    (github?.rateRemaining !== null && rateRemaining === null)) {
    return { state: "malformed", programs, items, unreadableItems: Math.max(1, unreadableItems), generatedAt, sourceFreshness: "unavailable", lastSuccessfulSyncAt, github: null, sharedItemIds };
  }
  return {
    state: "present",
    programs,
    items,
    unreadableItems,
    generatedAt,
    sourceFreshness,
    lastSuccessfulSyncAt,
    github: { cacheStatus, rateRemaining, failedItems },
    sharedItemIds
  };
}
