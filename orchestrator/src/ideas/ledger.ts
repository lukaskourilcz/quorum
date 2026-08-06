import { createHash } from "node:crypto";
import { z } from "zod";
import {
  IdeaLedgerEntrySchema,
  type IdeaLedgerEntry
} from "../contracts/idea-ledger.js";
import type { Evidence } from "../research/evidence.js";
import { atomicWriteText, readText } from "../state.js";

export const GLOBAL_IDEA_NAMESPACE = "global";
export const CAUGHT_UP_IDEA_NAMESPACE = "caught-up";
export const MAX_IDEA_INDEX_CHARS = 6_000;
const LEGACY_IDEA_LEDGER_PATH = "ideas/ledger.jsonl";
const LEGACY_IDEA_INDEX_PATH = "ideas/INDEX.md";
const IDEA_NAMESPACE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type IdeaNamespace = string;

function checkedNamespace(namespace: IdeaNamespace): IdeaNamespace {
  if (!IDEA_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(`Invalid idea namespace: ${namespace}`);
  }
  return namespace;
}

export function ideaLedgerPath(namespace: IdeaNamespace = GLOBAL_IDEA_NAMESPACE): string {
  return `ideas/${checkedNamespace(namespace)}/ledger.jsonl`;
}

export function ideaIndexPath(namespace: IdeaNamespace = GLOBAL_IDEA_NAMESPACE): string {
  return `ideas/${checkedNamespace(namespace)}/INDEX.md`;
}

export function ideaDetailPath(
  namespace: IdeaNamespace,
  ideaId: string
): string {
  if (!/^idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/.test(ideaId)) {
    throw new Error(`Invalid idea id: ${ideaId}`);
  }
  return `ideas/${checkedNamespace(namespace)}/details/${ideaId}.md`;
}

export const IDEA_LEDGER_PATH = ideaLedgerPath();
export const IDEA_INDEX_PATH = ideaIndexPath();

export const IDEA_STOPWORDS = [
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "should",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "will",
  "with",
  "would",
  "you",
  "your"
] as const;

const STOPWORD_SET = new Set<string>(IDEA_STOPWORDS);
const MATERIAL_DIFFERENCE = /\b(adds?|changes?|different|difference|distinct|expands?|focuses?|narrows?|targets?)\b/i;

export interface IdeaProposal {
  title: string;
  summary: string;
  origin: {
    // Widened from the SPARK literal: portfolio rooms record ideas under the seat that
    // raised them (ANGLE, PULSE, SCOUT, ...). The value is still validated against
    // ContractAgentIdSchema when the entry is written, so an unknown id is rejected.
    agent: string;
    meetingRef: string;
  };
  proposedAt: string;
  evidenceRef?: string;
}

export interface ScoredIdeaCandidate {
  entry: IdeaLedgerEntry;
  score: number;
}

export const VaultVerdictSchema = z.object({
  verdict: z.union([
    z.literal("novel"),
    z.string().regex(/^duplicate_of:idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/),
    z.string().regex(/^variant_of:idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/)
  ]),
  reason: z.string().trim().min(1).max(200)
});
export type VaultVerdict = z.infer<typeof VaultVerdictSchema>;

export interface VaultAdjudicator {
  adjudicate(input: {
    proposal: IdeaProposal;
    candidates: readonly ScoredIdeaCandidate[];
  }): Promise<VaultVerdict>;
}

/**
 * A VAULT adjudicator that never calls a model.
 *
 * `prefilterIdeaCandidates` already scores each existing idea by token overlap, so for
 * capture-only paths the verdict can be read off those scores. Portfolio rooms record
 * ideas as a side effect of work already paid for; making capture cost an extra call
 * would mean the cheapest safe outcome (writing the idea down) is the one the budget
 * discourages. Near-duplicates are linked rather than dropped, so nothing is lost.
 */
export function deterministicVaultAdjudicator(input?: { duplicateAtOrAbove?: number }): VaultAdjudicator {
  const duplicateAt = input?.duplicateAtOrAbove ?? 0.85;
  return {
    async adjudicate({ candidates }) {
      const top = candidates[0];
      if (!top) return { verdict: "novel", reason: "No prior idea shares enough wording to compare." };
      const score = Number(top.score.toFixed(2));
      if (top.score >= duplicateAt) {
        return { verdict: `duplicate_of:${top.entry.id}`, reason: `Wording overlap ${score} is at or above the duplicate threshold.` };
      }
      // Deliberately never returns variant_of. That verdict is guarded by
      // MATERIAL_DIFFERENCE: the reason must name what is materially different, which is a
      // semantic judgement a similarity score cannot make. Producing a sentence that merely
      // satisfies the regex would defeat the guard rather than honour it, so a close-but-not
      // -identical idea is recorded on its own and left for a room to link deliberately.
      return { verdict: "novel", reason: `Closest prior idea overlaps only ${score}.` };
    }
  };
}

export interface IdeaScreeningResult {
  entry: IdeaLedgerEntry;
  verdict: "novel" | "duplicate_of" | "variant_of" | "revived";
  reason: string;
  modelCalled: boolean;
  autoRejected: boolean;
  comparedIds: string[];
}

export interface IdeaRoomVerdict {
  verdict: "accept" | "veto" | "defer" | "supersede";
  reason: string;
  deferred?: { until: string } | { condition: string };
  supersedes?: string;
}

function naiveSingularize(token: string): string {
  return token.length > 1 && token.endsWith("s") ? token.slice(0, -1) : token;
}

export function canonicalIdeaTokens(title: string, summary: string): string[] {
  return `${title} ${summary}`
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/\p{P}+/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOPWORD_SET.has(token))
    .map(naiveSingularize);
}

function sortedUniqueTokens(title: string, summary: string): string[] {
  return [...new Set(canonicalIdeaTokens(title, summary))].sort();
}

export function ideaFingerprint(title: string, summary: string): string {
  const canonical = sortedUniqueTokens(title, summary).join("\n");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 1 : intersection / union;
}

function lexicalBigramText(title: string, summary: string): string {
  // Bigram scoring stays lexical: expand only the common short form and the
  // explicit newsletter/digest phrase pair. Fingerprints and token Jaccard use
  // the canonical tokens unchanged.
  return canonicalIdeaTokens(title, summary)
    .join(" ")
    .replaceAll(/\bdev\b/g, "developer")
    .replaceAll(/\b(?:email digest|digest email)\b/g, "newsletter");
}

function characterBigrams(value: string): Set<string> {
  if (value.length < 2) return new Set(value ? [value] : []);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function bigramOverlap(left: string, right: string): number {
  const leftBigrams = characterBigrams(left);
  const rightBigrams = characterBigrams(right);
  if (leftBigrams.size === 0 && rightBigrams.size === 0) return 1;
  const intersection = [...leftBigrams].filter((bigram) => rightBigrams.has(bigram)).length;
  return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
}

export function ideaSimilarity(
  left: Pick<IdeaProposal, "title" | "summary">,
  right: Pick<IdeaLedgerEntry, "title" | "summary">
): number {
  const tokenScore = jaccard(
    new Set(sortedUniqueTokens(left.title, left.summary)),
    new Set(sortedUniqueTokens(right.title, right.summary))
  );
  const phraseScore = bigramOverlap(
    lexicalBigramText(left.title, left.summary),
    lexicalBigramText(right.title, right.summary)
  );
  return Number((0.6 * tokenScore + 0.4 * phraseScore).toFixed(8));
}

export function prefilterIdeaCandidates(
  proposal: Pick<IdeaProposal, "title" | "summary">,
  entries: readonly IdeaLedgerEntry[]
): ScoredIdeaCandidate[] {
  return currentIdeaEntries(entries)
    .map((entry) => ({ entry, score: ideaSimilarity(proposal, entry) }))
    .filter((candidate) => candidate.score >= 0.18)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, 8);
}

function parseIdeaLedger(raw: string, namespace: IdeaNamespace): IdeaLedgerEntry[] {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return IdeaLedgerEntrySchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Invalid ${namespace} idea ledger line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

export async function readIdeaLedger(
  root: string,
  namespace: IdeaNamespace = GLOBAL_IDEA_NAMESPACE
): Promise<IdeaLedgerEntry[]> {
  const normalized = checkedNamespace(namespace);
  const raw = await readText(root, ideaLedgerPath(normalized));
  const compatibleRaw = !raw && normalized === GLOBAL_IDEA_NAMESPACE
    ? await readText(root, LEGACY_IDEA_LEDGER_PATH)
    : raw;
  return parseIdeaLedger(compatibleRaw, normalized);
}

export async function readIdeaLedgerScope(
  root: string,
  namespace: IdeaNamespace
): Promise<IdeaLedgerEntry[]> {
  const normalized = checkedNamespace(namespace);
  const local = await readIdeaLedger(root, normalized);
  if (normalized === GLOBAL_IDEA_NAMESPACE) return local;
  return [...await readIdeaLedger(root, GLOBAL_IDEA_NAMESPACE), ...local];
}

export async function ensureIdeaInNamespace(
  root: string,
  namespace: IdeaNamespace,
  ideaId: string
): Promise<IdeaLedgerEntry | null> {
  const normalized = checkedNamespace(namespace);
  const local = await readIdeaLedger(root, normalized);
  const localEntry = currentIdeaEntries(local).find((entry) => entry.id === ideaId);
  if (localEntry) return localEntry;
  if (normalized === GLOBAL_IDEA_NAMESPACE) return null;
  const globalEntry = currentIdeaEntries(
    await readIdeaLedger(root, GLOBAL_IDEA_NAMESPACE)
  ).find((entry) => entry.id === ideaId);
  if (!globalEntry) return null;
  await appendSnapshots(root, normalized, local, [globalEntry]);
  return globalEntry;
}

export function currentIdeaEntries(entries: readonly IdeaLedgerEntry[]): IdeaLedgerEntry[] {
  const current = new Map<string, IdeaLedgerEntry>();
  for (const entry of entries) current.set(entry.id, entry);
  return [...current.values()];
}

function lastHistory(entry: IdeaLedgerEntry) {
  return entry.statusHistory.at(-1)!;
}

function validateSnapshot(entry: IdeaLedgerEntry): IdeaLedgerEntry {
  const parsed = IdeaLedgerEntrySchema.parse(entry);
  if (lastHistory(parsed).status !== parsed.status) {
    throw new Error(`Idea ${parsed.id} status does not match its final history item`);
  }
  return parsed;
}

async function appendSnapshots(
  root: string,
  namespace: IdeaNamespace,
  existing: readonly IdeaLedgerEntry[],
  appended: readonly IdeaLedgerEntry[]
): Promise<IdeaLedgerEntry[]> {
  const snapshots = [...existing, ...appended.map(validateSnapshot)];
  const content = snapshots.length
    ? `${snapshots.map((entry) => JSON.stringify(entry)).join("\n")}\n`
    : "";
  await atomicWriteText(root, ideaLedgerPath(namespace), content);
  await atomicWriteText(root, ideaIndexPath(namespace), renderIdeaIndex(snapshots, namespace));
  await Promise.all(currentIdeaEntries(snapshots).map((entry) =>
    atomicWriteText(root, ideaDetailPath(namespace, entry.id), renderIdeaDetail(entry))
  ));
  return snapshots;
}

function ideaId(proposal: IdeaProposal, fingerprint: string): string {
  const date = proposal.proposedAt.slice(0, 10);
  const suffix = createHash("sha256")
    .update(`${fingerprint}\n${proposal.origin.meetingRef}`)
    .digest("hex")
    .slice(0, 8);
  return `idea-${date}-${suffix}`;
}

function deadAt(entry: IdeaLedgerEntry): string | null {
  return [...entry.statusHistory]
    .reverse()
    .find((history) => history.status === "killed" || history.status === "vetoed")
    ?.at ?? null;
}

function qualifyingRevivalEvidence(
  evidenceRef: string | undefined,
  predecessor: IdeaLedgerEntry,
  evidence: readonly Evidence[]
): boolean {
  const killedAt = deadAt(predecessor);
  if (!evidenceRef || !killedAt || !evidenceRef.startsWith("EVIDENCE.jsonl:")) return false;
  const id = evidenceRef.slice("EVIDENCE.jsonl:".length);
  const record = evidence.find((candidate) => candidate.id === id);
  return Boolean(record && Date.parse(record.capturedAt) > Date.parse(killedAt));
}

function initialEntry(input: {
  proposal: IdeaProposal;
  fingerprint: string;
  status: IdeaLedgerEntry["status"];
  reason: string;
  similarTo: IdeaLedgerEntry["similarTo"];
  revival?: IdeaLedgerEntry["revival"];
}): IdeaLedgerEntry {
  return IdeaLedgerEntrySchema.parse({
    schemaVersion: "idea-ledger/1",
    id: ideaId(input.proposal, input.fingerprint),
    fingerprint: input.fingerprint,
    title: input.proposal.title,
    summary: input.proposal.summary,
    origin: input.proposal.origin,
    status: input.status,
    statusHistory: [{
      status: input.status,
      at: input.proposal.proposedAt,
      meetingRef: input.proposal.origin.meetingRef,
      reason: input.reason
    }],
    similarTo: input.similarTo,
    ...(input.revival ? { revival: input.revival } : {})
  });
}

function linkedSnapshot(
  predecessor: IdeaLedgerEntry,
  linkedId: string,
  score: number,
  verdict: "duplicate_of" | "variant_of"
): IdeaLedgerEntry {
  if (predecessor.similarTo.some((link) => link.id === linkedId && link.verdict === verdict)) {
    return predecessor;
  }
  return IdeaLedgerEntrySchema.parse({
    ...predecessor,
    similarTo: [...predecessor.similarTo, { id: linkedId, score, verdict }]
  });
}

function screeningAgainstDeadIdea(input: {
  proposal: IdeaProposal;
  predecessor: IdeaLedgerEntry;
  fingerprint: string;
  score: number;
  reason: string;
  evidence: readonly Evidence[];
}): { entry: IdeaLedgerEntry; verdict: "duplicate_of" | "revived"; autoRejected: boolean } {
  const revived = qualifyingRevivalEvidence(
    input.proposal.evidenceRef,
    input.predecessor,
    input.evidence
  );
  const entry = initialEntry({
    proposal: input.proposal,
    fingerprint: input.fingerprint,
    status: revived ? "revived" : "vetoed",
    reason: revived
      ? `VAULT revival: ${input.reason}`
      : `VAULT hard stop: ${input.reason}`,
    similarTo: [{ id: input.predecessor.id, score: input.score, verdict: "duplicate_of" }],
    ...(revived && input.proposal.evidenceRef
      ? { revival: { from: input.predecessor.id, evidenceRef: input.proposal.evidenceRef } }
      : {})
  });
  return { entry, verdict: revived ? "revived" : "duplicate_of", autoRejected: !revived };
}

export async function screenAndRecordIdea(input: {
  root: string;
  namespace?: IdeaNamespace;
  proposal: IdeaProposal;
  evidence: readonly Evidence[];
  adjudicator: VaultAdjudicator;
}): Promise<IdeaScreeningResult> {
  const namespace = checkedNamespace(input.namespace ?? GLOBAL_IDEA_NAMESPACE);
  const snapshots = await readIdeaLedger(input.root, namespace);
  const current = currentIdeaEntries(await readIdeaLedgerScope(input.root, namespace));
  const localIds = new Set(currentIdeaEntries(snapshots).map((entry) => entry.id));
  const fingerprint = ideaFingerprint(input.proposal.title, input.proposal.summary);
  const id = ideaId(input.proposal, fingerprint);
  const replay = current.find((entry) => entry.id === id);
  if (replay) {
    if (!localIds.has(replay.id)) {
      await appendSnapshots(input.root, namespace, snapshots, [replay]);
    }
    const link = replay.similarTo[0];
    return {
      entry: replay,
      verdict: replay.status === "revived"
        ? "revived"
        : link?.verdict === "variant_of"
          ? "variant_of"
          : replay.status === "vetoed"
            ? "duplicate_of"
            : "novel",
      reason: lastHistory(replay).reason,
      modelCalled: false,
      autoRejected: replay.status === "vetoed",
      comparedIds: replay.similarTo.map((candidate) => candidate.id)
    };
  }

  const exact = current.find((entry) => entry.fingerprint === fingerprint);
  if (exact) {
    const dead = exact.status === "vetoed" || exact.status === "killed";
    const result = dead
      ? screeningAgainstDeadIdea({
          proposal: input.proposal,
          predecessor: exact,
          fingerprint,
          score: 1,
          reason: `exact fingerprint match to ${exact.id}`,
          evidence: input.evidence
        })
      : {
          entry: initialEntry({
            proposal: input.proposal,
            fingerprint,
            status: "vetoed",
            reason: `VAULT hard stop: exact fingerprint match to ${exact.id}`,
            similarTo: [{ id: exact.id, score: 1, verdict: "duplicate_of" }]
          }),
          verdict: "duplicate_of" as const,
          autoRejected: true
        };
    await appendSnapshots(input.root, namespace, snapshots, [
      ...(localIds.has(exact.id)
        ? [linkedSnapshot(exact, result.entry.id, 1, "duplicate_of")]
        : []),
      result.entry
    ]);
    return {
      ...result,
      reason: lastHistory(result.entry).reason,
      modelCalled: false,
      comparedIds: [exact.id]
    };
  }

  const candidates = prefilterIdeaCandidates(input.proposal, snapshots);
  const adjudication = VaultVerdictSchema.parse(await input.adjudicator.adjudicate({
    proposal: input.proposal,
    candidates
  }));
  if (adjudication.verdict === "novel") {
    const entry = initialEntry({
      proposal: input.proposal,
      fingerprint,
      status: "proposed",
      reason: `VAULT novel: ${adjudication.reason}`,
      similarTo: []
    });
    await appendSnapshots(input.root, namespace, snapshots, [entry]);
    return {
      entry,
      verdict: "novel",
      reason: adjudication.reason,
      modelCalled: true,
      autoRejected: false,
      comparedIds: candidates.map((candidate) => candidate.entry.id)
    };
  }

  const [kind, predecessorId] = adjudication.verdict.split(":") as [
    "duplicate_of" | "variant_of",
    string
  ];
  const candidate = candidates.find((value) => value.entry.id === predecessorId);
  if (!candidate) {
    throw new Error(`VAULT referenced non-candidate idea ${predecessorId}`);
  }
  if (kind === "variant_of" && !MATERIAL_DIFFERENCE.test(adjudication.reason)) {
    throw new Error("VAULT variant reason must state the material difference");
  }

  if (kind === "duplicate_of") {
    const dead = candidate.entry.status === "vetoed" || candidate.entry.status === "killed";
    const result = dead
      ? screeningAgainstDeadIdea({
          proposal: input.proposal,
          predecessor: candidate.entry,
          fingerprint,
          score: candidate.score,
          reason: adjudication.reason,
          evidence: input.evidence
        })
      : {
          entry: initialEntry({
            proposal: input.proposal,
            fingerprint,
            status: "vetoed",
            reason: `VAULT hard stop: ${adjudication.reason}`,
            similarTo: [{ id: candidate.entry.id, score: candidate.score, verdict: "duplicate_of" }]
          }),
          verdict: "duplicate_of" as const,
          autoRejected: true
        };
    await appendSnapshots(input.root, namespace, snapshots, [
      ...(localIds.has(candidate.entry.id)
        ? [linkedSnapshot(candidate.entry, result.entry.id, candidate.score, "duplicate_of")]
        : []),
      result.entry
    ]);
    return {
      ...result,
      reason: adjudication.reason,
      modelCalled: true,
      comparedIds: candidates.map((value) => value.entry.id)
    };
  }

  const entry = initialEntry({
    proposal: input.proposal,
    fingerprint,
    status: "proposed",
    reason: `VAULT variant: ${adjudication.reason}`,
    similarTo: [{ id: candidate.entry.id, score: candidate.score, verdict: "variant_of" }]
  });
  await appendSnapshots(input.root, namespace, snapshots, [
    ...(localIds.has(candidate.entry.id)
      ? [linkedSnapshot(candidate.entry, entry.id, candidate.score, "variant_of")]
      : []),
    entry
  ]);
  return {
    entry,
    verdict: "variant_of",
    reason: adjudication.reason,
    modelCalled: true,
    autoRejected: false,
    comparedIds: candidates.map((value) => value.entry.id)
  };
}

function verdictStatus(verdict: IdeaRoomVerdict["verdict"]): IdeaLedgerEntry["status"] {
  if (verdict === "accept" || verdict === "supersede") return "accepted";
  if (verdict === "defer") return "deferred";
  return "vetoed";
}

export async function applyIdeaRoomVerdict(input: {
  root: string;
  namespace?: IdeaNamespace;
  ideaId: string;
  verdict: IdeaRoomVerdict;
  meetingRef: string;
  at: string;
}): Promise<IdeaLedgerEntry> {
  const namespace = checkedNamespace(input.namespace ?? GLOBAL_IDEA_NAMESPACE);
  const snapshots = await readIdeaLedger(input.root, namespace);
  const localCurrent = currentIdeaEntries(snapshots);
  const current = currentIdeaEntries(await readIdeaLedgerScope(input.root, namespace));
  const entry = localCurrent.find((candidate) => candidate.id === input.ideaId);
  if (!entry) throw new Error(`Unknown idea ${input.ideaId}`);
  const expectedStatus = verdictStatus(input.verdict.verdict);
  if (
    entry.status === expectedStatus &&
    lastHistory(entry).meetingRef === input.meetingRef
  ) {
    return entry;
  }
  if (input.verdict.verdict === "defer" && !input.verdict.deferred) {
    throw new Error("A defer verdict requires an until date or condition");
  }
  const status = expectedStatus;
  const next = IdeaLedgerEntrySchema.parse({
    ...entry,
    status,
    statusHistory: [...entry.statusHistory, {
      status,
      at: input.at,
      meetingRef: input.meetingRef,
      reason: input.verdict.reason
    }],
    ...(input.verdict.verdict === "defer" ? { deferred: input.verdict.deferred } : { deferred: undefined }),
    supersededBy: undefined
  });
  const appended: IdeaLedgerEntry[] = [];
  const globalAppended: IdeaLedgerEntry[] = [];
  if (input.verdict.verdict === "supersede") {
    const predecessorId = input.verdict.supersedes
      ?? entry.similarTo.find((link) => link.verdict === "variant_of")?.id;
    const predecessor = current.find((candidate) => candidate.id === predecessorId);
    if (!predecessor || predecessor.id === entry.id) {
      throw new Error("A supersede verdict requires a linked predecessor");
    }
    const superseded = IdeaLedgerEntrySchema.parse({
      ...predecessor,
      status: "superseded",
      statusHistory: [...predecessor.statusHistory, {
        status: "superseded",
        at: input.at,
        meetingRef: input.meetingRef,
        reason: input.verdict.reason
      }],
      supersededBy: entry.id
    });
    if (namespace !== GLOBAL_IDEA_NAMESPACE && !localCurrent.some((candidate) => candidate.id === predecessor.id)) {
      globalAppended.push(superseded);
    } else {
      appended.push(superseded);
    }
  }
  appended.push(next);
  if (globalAppended.length) {
    await appendSnapshots(
      input.root,
      GLOBAL_IDEA_NAMESPACE,
      await readIdeaLedger(input.root, GLOBAL_IDEA_NAMESPACE),
      globalAppended
    );
  }
  await appendSnapshots(input.root, namespace, snapshots, appended);
  return next;
}

function compact(value: string, max: number): string {
  const oneLine = value.replaceAll(/\s+/g, " ").replaceAll("|", "\\|").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function shortTitle(title: string): string {
  return compact(title.split(/\s+/).slice(0, 8).join(" "), 80);
}

export function renderIdeaDetail(entry: IdeaLedgerEntry): string {
  const history = entry.statusHistory.map((item) => [
    `### ${item.status.replaceAll("_", " ")} — ${item.at}`,
    "",
    item.reason,
    "",
    `Meeting: ${item.meetingRef}`
  ].join("\n")).join("\n\n");
  return [
    `# ${entry.title}`,
    "",
    `> ${entry.summary}`,
    "",
    `Current status: ${entry.status.replaceAll("_", " ")}`,
    `First proposed by: ${entry.origin.agent}`,
    `Source meeting: ${entry.origin.meetingRef}`,
    "",
    "## Decision history",
    "",
    history,
    "",
    "## Similar ideas",
    "",
    ...(entry.similarTo.length
      ? entry.similarTo.map((item) => `- ${item.verdict.replaceAll("_", " ")}: ${item.id} (${Math.round(item.score * 100)}% lexical similarity)`)
      : ["- No linked duplicate or variant."]),
    ""
  ].join("\n");
}

export function renderIdeaIndex(
  entries: readonly IdeaLedgerEntry[],
  namespace: IdeaNamespace = GLOBAL_IDEA_NAMESPACE
): string {
  const normalized = checkedNamespace(namespace);
  const current = currentIdeaEntries(entries);
  const byNewest = [...current].sort((left, right) =>
    lastHistory(right).at.localeCompare(lastHistory(left).at) || left.id.localeCompare(right.id)
  );
  const killed = byNewest.filter((entry) =>
    entry.statusHistory.some((history) => history.status === "killed" || history.status === "vetoed")
  );
  const active = byNewest
    .filter((entry) => entry.status !== "killed" && entry.status !== "vetoed")
    .filter((entry) => entry.status !== "superseded");
  const supersededCount = current.filter((entry) => entry.status === "superseded").length;
  const row = (entry: IdeaLedgerEntry) =>
    `| ${entry.id} | ${shortTitle(entry.title)} | ${entry.status} | ${compact(lastHistory(entry).reason, 120)} |`;
  let activeRows = active.map(row);
  let killedRows = killed.map(row);
  const render = () => [
    `# Idea ledger index — ${normalized}`,
    "",
    `> Compact ${normalized} meeting context generated from the append-only ledger. The raw JSONL ledger is never injected into a meeting. VAULT compares this namespace with global memory.`,
    "",
    "## Current index",
    "",
    "| ID | Title (≤8 words) | Status | Last reason |",
    "| --- | --- | --- | --- |",
    activeRows.length ? activeRows.join("\n") : "| — | No ideas recorded | — | — |",
    "",
    `Omitted older current entries: ${active.length - activeRows.length}.`,
    `Collapsed superseded entries: ${supersededCount}.`,
    "",
    "## All-time kill list",
    "",
    "| ID | Title (≤8 words) | Current status | Last reason |",
    "| --- | --- | --- | --- |",
    killedRows.length ? killedRows.join("\n") : "| — | No ideas recorded | — | — |",
    "",
    `Omitted older kill-list entries: ${killed.length - killedRows.length}.`,
    ""
  ].join("\n");
  let rendered = render();
  while (rendered.length > MAX_IDEA_INDEX_CHARS && (activeRows.length || killedRows.length)) {
    if (activeRows.length >= killedRows.length && activeRows.length) activeRows = activeRows.slice(0, -1);
    else killedRows = killedRows.slice(0, -1);
    rendered = render();
  }
  if (rendered.length > MAX_IDEA_INDEX_CHARS) {
    throw new Error(`Idea index header exceeds ${MAX_IDEA_INDEX_CHARS} characters`);
  }
  return rendered;
}

export async function regenerateIdeaIndex(
  root: string,
  namespace: IdeaNamespace = GLOBAL_IDEA_NAMESPACE
): Promise<string> {
  const entries = await readIdeaLedger(root, namespace);
  const rendered = renderIdeaIndex(entries, namespace);
  await atomicWriteText(root, ideaIndexPath(namespace), rendered);
  return rendered;
}

export async function readIdeaIndexSlice(
  root: string,
  namespace: IdeaNamespace
): Promise<string> {
  const normalized = checkedNamespace(namespace);
  const fallback = renderIdeaIndex([], normalized);
  let index = await readText(root, ideaIndexPath(normalized));
  if (!index && normalized === GLOBAL_IDEA_NAMESPACE) {
    index = await readText(root, LEGACY_IDEA_INDEX_PATH);
  }
  if (!index) return fallback;
  if (index.length > MAX_IDEA_INDEX_CHARS) {
    return regenerateIdeaIndex(root, normalized);
  }
  return index;
}

/**
 * The screening verdict as a reader meets it.
 *
 * The stored verdict is a machine value, and it was written straight into the morning meeting's
 * public transcript: "VAULT recorded duplicate_of". The stored value keeps its shape; only the
 * sentence changes.
 */
export function screeningWord(verdict: IdeaScreeningResult["verdict"]): string {
  const words: Record<IdeaScreeningResult["verdict"], string> = {
    novel: "new",
    duplicate_of: "a duplicate",
    variant_of: "a variant of an existing idea",
    revived: "revived"
  };
  return words[verdict];
}
