import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  type ReserveContext
} from "../../budget.js";
import {
  BookKbIndexSchema,
  type BookKbIndex
} from "../../contracts/book-kb-index.js";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
import {
  RecommendationFormatSchema,
  RecommendationPlatformSchema,
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../../contracts/venture-recommendation.js";
import type { CycleResult } from "../../cycle/types.js";
import { remainingScheduledCycles } from "../../cycle/ledger.js";
import { guardedJsonCall, ModelOutputParseError, type GuardedCallInput } from "../../llm/call.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../../meetings/calendar.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { configRoot, repoRoot } from "../../paths.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { wrapUntrustedData } from "../../security/content.js";
import { atomicWriteJson } from "../../state.js";
import type { RunnablePhase, Stage } from "../../types.js";
import {
  getVentureMeetingDefinition,
  loadVentureRegistry
} from "../registry.js";
import {
  doorMoneyRecommendationId,
  gateDoorMoneyPackage,
  loadDoorMoneyDuplicateThreshold,
  storeDoorMoneyDraft
} from "./gates.js";
import {
  assembleDoorMoneyDeskPacket,
  DOOR_MONEY_FORMAT_MENU,
  openLocalCloneDoorMoneyKnowledgeStore,
  PrivateBookChunkSchema,
  type DoorMoneyDeskPacket,
  type DoorMoneyKnowledgeStore,
  type PrivateBookChunk
} from "./kb.js";
import { annotationToBookChunk } from "./ingest/annotate.js";
import {
  MemoryBookIngestPrivateStore,
  runBookIngest,
  type BookIngestPrivateArtifacts
} from "./ingest/run.js";
import {
  selectDoorMoneyPassages,
  type PassageSelectionOutcome,
  type SelectionPerformanceWeights
} from "./select.js";

export type DoorMoneyPhase = "dm-desk" | "dm-growth";

export function isDoorMoneyPhase(phase: RunnablePhase): phase is DoorMoneyPhase {
  return phase === "dm-desk" || phase === "dm-growth";
}

export {
  DOOR_MONEY_GROWTH_AGENDA_ANCHOR,
  DOOR_MONEY_GROWTH_TOPICS,
  doorMoneyGrowthAgenda,
  isDoorMoneyGrowthDay,
  runDoorMoneyGrowthCycle,
  type BookerCall,
  type BookerResponse,
  type DoorMoneyGrowthAgenda,
  type DoorMoneyGrowthCycleResult,
  type DoorMoneyGrowthTopic
} from "./growth.js";

const GhostCopyBlockSchema = z.strictObject({
  kind: z.enum(["cover", "body", "outro", "thread-post", "caption", "script", "shot-list"]),
  ordinal: z.number().int().positive(),
  text: z.string().trim().min(1).max(4_000)
});

const GhostPackageSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  hook: z.string().trim().min(1).max(500),
  formatPlans: z.array(z.strictObject({
    format: RecommendationFormatSchema,
    platforms: z.array(RecommendationPlatformSchema).min(1).max(5),
    reason: z.string().trim().min(1).max(600)
  })).min(1).max(3),
  copyBlocks: z.array(GhostCopyBlockSchema).min(1).max(40),
  rationale: z.string().trim().min(1).max(2_000),
  curiosityBridge: z.string().trim().min(1).max(1_000),
  cta: z.strictObject({
    mode: z.enum(["soft-curiosity", "explicit-buy-book"]),
    text: z.string().trim().min(1).max(500).nullable()
  }),
  sourceRefs: z.array(z.string().regex(/^ch\d{2,}-s\d{2,}-c\d{3,}$/)).min(1).max(3),
  bookClaims: z.array(z.strictObject({
    text: z.string().trim().min(1).max(1_000),
    chunkIds: z.array(z.string().regex(/^ch\d{2,}-s\d{2,}-c\d{3,}$/)).min(1).max(3)
  })).max(30),
  verbatimQuotes: z.array(z.strictObject({
    text: z.string().trim().min(1).max(600),
    chunkId: z.string().regex(/^ch\d{2,}-s\d{2,}-c\d{3,}$/)
  })).max(12)
}).superRefine((item, context) => {
  for (const [field, values] of [
    ["formatPlans", item.formatPlans.map(({ format }) => format)],
    ["sourceRefs", item.sourceRefs],
    ["copyBlocks", item.copyBlocks.map(({ ordinal }) => String(ordinal))]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [field], message: `${field} entries must be unique` });
    }
  }
  if ((item.cta.mode === "explicit-buy-book") !== (item.cta.text !== null)) {
    context.addIssue({ code: "custom", path: ["cta"], message: "Only an explicit buy CTA carries CTA text" });
  }
});

export const GhostDeskResponseSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("packages"),
    packages: z.array(GhostPackageSchema).min(1).max(2)
  }),
  z.strictObject({
    outcome: z.literal("refusal"),
    reason: z.string().trim().min(1).max(600)
  })
]);

export type GhostDeskResponse = z.infer<typeof GhostDeskResponseSchema>;
export type GhostDeskPackage = z.infer<typeof GhostPackageSchema>;

export interface DoorMoneyDeskKnowledge {
  index: BookKbIndex;
  styleProfile: Parameters<typeof assembleDoorMoneyDeskPacket>[0]["styleProfile"];
  store: DoorMoneyKnowledgeStore;
  recommendationHistory?: VentureRecommendation[];
  performanceWeights?: SelectionPerformanceWeights;
}

export interface DoorMoneyDeskCycleResult extends CycleResult {
  packages: VentureRecommendation[];
  droppedPackages: number;
  fixtureReason: string | null;
}

type GhostCall = (input: GuardedCallInput<GhostDeskResponse>) => Promise<{
  value: GhostDeskResponse;
  cached: boolean;
  usd: number;
}>;

interface GhostRoute {
  provider: "anthropic";
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
}

const GhostRouteSchema = z.strictObject({
  provider: z.literal("anthropic"),
  model: z.string().trim().min(1),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive()
});

const CurrentKnowledgeSchema = z.strictObject({
  schemaVersion: z.literal("door-money-knowledge-current/1"),
  manuscriptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bookKbIndexPath: z.string().regex(/^state\/ventures\/door-money\/knowledge\/[a-zA-Z0-9._/-]+$/),
  styleProfilePath: z.string().regex(/^state\/ventures\/door-money\/knowledge\/[a-zA-Z0-9._/-]+$/),
  generatedAt: z.string().datetime()
});

function stateRelative(value: string): string {
  if (value.includes("..")) throw new Error("Door Money state path cannot traverse directories");
  return value.slice("state/".length);
}

async function optionalJson(root: string, relativePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function recommendationHistory(root: string): Promise<VentureRecommendation[]> {
  const directory = path.join(root, "ventures", "door-money", "recommendations");
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) =>
    VentureRecommendationSchema.parse(JSON.parse(await readFile(path.join(directory, name), "utf8")))));
}

async function loadLiveKnowledge(root: string): Promise<DoorMoneyDeskKnowledge | null> {
  const currentRaw = await optionalJson(root, "ventures/door-money/knowledge/current.json");
  const privateStore = openLocalCloneDoorMoneyKnowledgeStore({
    privateRoot: process.env.BOOK_PRIVATE_CLONE_PATH,
    repositoryRoot: repoRoot
  });
  if (currentRaw === null || privateStore === null) return null;
  const current = CurrentKnowledgeSchema.parse(currentRaw);
  const [indexRaw, styleRaw, history, weightsRaw] = await Promise.all([
    optionalJson(root, stateRelative(current.bookKbIndexPath)),
    optionalJson(root, stateRelative(current.styleProfilePath)),
    recommendationHistory(root),
    optionalJson(root, "ventures/door-money/performance-weights.json")
  ]);
  if (indexRaw === null || styleRaw === null) return null;
  const index = BookKbIndexSchema.parse(indexRaw);
  if (index.manuscriptHash !== current.manuscriptHash) throw new Error("Current Door Money index hash does not match its pointer");
  return {
    index,
    styleProfile: z.object({ manuscriptHash: z.literal(current.manuscriptHash) }).passthrough().parse(styleRaw) as DoorMoneyDeskKnowledge["styleProfile"],
    store: privateStore,
    recommendationHistory: history,
    performanceWeights: (weightsRaw ?? {}) as SelectionPerformanceWeights
  };
}

class ArtifactKnowledgeStore implements DoorMoneyKnowledgeStore {
  private readonly chunks: Map<string, PrivateBookChunk>;

  constructor(private readonly artifacts: BookIngestPrivateArtifacts) {
    const annotations = new Map(artifacts.annotations.map((annotation) => [annotation.chunkId, annotation]));
    this.chunks = new Map(artifacts.chunked.chunks.map((chunk) => [chunk.id, PrivateBookChunkSchema.parse({
      schemaVersion: "private-book-chunk/1",
      manuscriptHash: artifacts.manuscriptHash,
      ...chunk,
      annotation: annotations.get(chunk.id)
    })]));
  }

  async chunk(manuscriptHash: string, chunkId: string): Promise<PrivateBookChunk> {
    const value = this.chunks.get(chunkId);
    if (!value || manuscriptHash !== this.artifacts.manuscriptHash) throw new Error("Fixture private chunk is unavailable");
    return value;
  }

  async embeddings(manuscriptHash: string) {
    if (manuscriptHash !== this.artifacts.manuscriptHash) throw new Error("Fixture embeddings are unavailable");
    return this.artifacts.embeddings;
  }
}

function fixtureIndex(artifacts: BookIngestPrivateArtifacts): BookKbIndex {
  const annotations = new Map(artifacts.annotations.map((annotation) => [annotation.chunkId, annotation]));
  return BookKbIndexSchema.parse({
    schemaVersion: "book-kb-index/1",
    ventureId: "door-money",
    ingestionId: `book-ingest-${artifacts.manuscriptHash.slice("sha256:".length, "sha256:".length + 16)}`,
    manuscriptHash: artifacts.manuscriptHash,
    manuscriptBytes: artifacts.manuscriptBytes,
    modelVersions: {
      annotation: artifacts.annotationModelVersion,
      rollup: artifacts.rollupModelVersion,
      embedding: artifacts.embeddingModelVersion
    },
    ingestionCostUsd: 0,
    chunkCount: artifacts.chunked.chunks.length,
    chapters: artifacts.rollups.chapters,
    entityIndex: artifacts.rollups.entityIndex,
    themeIndex: artifacts.rollups.themeIndex,
    chunks: artifacts.chunked.chunks.map((chunk) => annotationToBookChunk({
      chunk,
      annotation: annotations.get(chunk.id)!
    })),
    generatedAt: artifacts.styleProfile.generatedAt
  });
}

export async function buildDoorMoneyDryKnowledge(now: Date): Promise<DoorMoneyDeskKnowledge> {
  const fixtureSource = await readFile(
    path.join(repoRoot, "orchestrator", "tests", "fixtures", "door-money", "synthetic-diary.md"),
    "utf8"
  );
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "door-money-desk-fixture-"));
  try {
    const store = new MemoryBookIngestPrivateStore();
    const report = await runBookIngest({
      source: fixtureSource,
      stateRoot: path.join(temporaryRoot, "state"),
      privateRoot: path.join(temporaryRoot, "private"),
      privateStore: store,
      approved: false,
      dry: true,
      now,
      reserveContext: async (entries, cycleId): Promise<ReserveContext> => ({
        now,
        cycleId,
        stage: "VALIDATION",
        ledger: entries,
        allInNonApiSpentUsd: 0,
        allInCommittedUsd: 0,
        knownMonthlyForecastUsd: 0,
        remainingScheduledCycles: 1,
        limits: { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 1, monthlyApiUsd: 25, monthlyOperatingUsd: 30 }
      })
    });
    const stored = report.manuscriptHash ? store.versions.get(report.manuscriptHash) : undefined;
    if (report.status !== "complete" || !stored) throw new Error("Synthetic desk knowledge ingestion did not complete");
    return {
      index: fixtureIndex(stored.artifacts),
      styleProfile: stored.artifacts.styleProfile,
      store: new ArtifactKnowledgeStore(stored.artifacts),
      recommendationHistory: [],
      performanceWeights: {}
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function ghostModelPacket(packet: DoorMoneyDeskPacket): Record<string, unknown> {
  const sourceChunks = new Map<string, Record<string, unknown>>();
  for (const passage of packet.passages) {
    sourceChunks.set(passage.source.id, {
      chunkId: passage.source.id,
      text: passage.source.text,
      annotation: {
        summary: passage.source.annotation.summary,
        entities: passage.source.annotation.entities,
        themes: passage.source.annotation.themes,
        arc: passage.source.annotation.arc,
        era: passage.source.annotation.era,
        storyType: passage.source.annotation.storyType,
        quotables: passage.source.annotation.quotables
      }
    });
    for (const neighbor of passage.neighbors) {
      if (!sourceChunks.has(neighbor.id)) {
        const before = neighbor.byteOffsets.end <= passage.source.byteOffsets.start;
        sourceChunks.set(neighbor.id, {
          chunkId: neighbor.id,
          // The private in-memory packet retains the full neighbor. GHOST receives only the
          // adjacent edge needed for continuity so two selections still fit its configured 8k
          // context without dropping either selected passage or weakening the hard model cap.
          continuityWindow: before ? neighbor.text.slice(-1_000) : neighbor.text.slice(0, 1_000),
          neighborOnly: true
        });
      }
    }
  }
  const { exemplarBank: _allExemplars, ...styleProfile } = packet.styleProfile;
  return {
    schemaVersion: packet.schemaVersion,
    ventureId: packet.ventureId,
    date: packet.date,
    manuscriptHash: packet.manuscriptHash,
    selections: packet.passages.map(({ selection, source, neighbors }) => ({
      selection: {
        chunkId: selection.chunkId,
        chapterId: selection.chapterId,
        sceneId: selection.sceneId,
        arc: selection.arc,
        themes: selection.themes,
        primaryFormat: selection.primaryFormat,
        formatScores: selection.formatScores
      },
      sourceChunkId: source.id,
      neighborChunkIds: neighbors.map(({ id }) => id)
    })),
    sourceChunks: [...sourceChunks.values()],
    styleProfile,
    exemplarsByFormat: packet.exemplarsByFormat,
    recommendationHistory: packet.recommendationHistory,
    performanceWeights: packet.performanceWeights,
    formatMenu: packet.formatMenu
  };
}

function explicitCtaAllowed(date: string): boolean {
  // Sunday is the sole weekly offer slot. DM-15 still applies the rolling-history veto.
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() === 0;
}

function validateGhostResponse(input: {
  raw: unknown;
  selected: PassageSelectionOutcome & { kind: "selected" };
  explicitCtaAllowed: boolean;
}): GhostDeskResponse {
  const response = GhostDeskResponseSchema.parse(input.raw);
  if (response.outcome === "refusal") return response;
  const allowedChunks = new Set(input.selected.passages.map(({ chunkId }) => chunkId));
  const packageIds = response.packages.map(({ id }) => id);
  if (new Set(packageIds).size !== packageIds.length) throw new Error("GHOST package ids must be unique");
  const menu = new Map(DOOR_MONEY_FORMAT_MENU.map((item) => [item.format, new Set(item.compatiblePlatforms)]));
  for (const item of response.packages) {
    const referenced = [
      ...item.sourceRefs,
      ...item.bookClaims.flatMap(({ chunkIds }) => chunkIds),
      ...item.verbatimQuotes.map(({ chunkId }) => chunkId)
    ];
    if (referenced.some((chunkId) => !allowedChunks.has(chunkId))) {
      throw new Error("GHOST referenced a chunk outside code selection");
    }
    for (const plan of item.formatPlans) {
      if (plan.platforms.some((platform) => !menu.get(plan.format)?.has(platform))) {
        throw new Error(`GHOST mapped ${plan.format} to an incompatible platform`);
      }
    }
    if (item.cta.mode === "explicit-buy-book" && !input.explicitCtaAllowed) {
      throw new Error("GHOST used an explicit book CTA outside its weekly slot");
    }
  }
  return response;
}

export function fixtureGhostResponse(input: {
  date: string;
  selection: PassageSelectionOutcome & { kind: "selected" };
}): GhostDeskResponse {
  const passage = input.selection.passages[0]!;
  const menu = DOOR_MONEY_FORMAT_MENU.find(({ format }) => format === passage.primaryFormat)!;
  return GhostDeskResponseSchema.parse({
    outcome: "packages",
    packages: [{
      id: `fixture-${input.date}-${passage.chunkId}`,
      hook: "A missed handoff became the only part of the invented route worth keeping.",
      formatPlans: [{
        format: passage.primaryFormat,
        platforms: [menu.compatiblePlatforms[0]],
        reason: "The invented fixture has a visible setup, turn and understated landing."
      }],
      copyBlocks: [
        { kind: "cover", ordinal: 1, text: "The route failed before the promise did." },
        { kind: "body", ordinal: 2, text: "This is synthetic fixture copy for owner-review wiring only." },
        { kind: "outro", ordinal: 3, text: "The next invented scene begins where the timetable stops." }
      ],
      rationale: "The synthetic scene supplies a concrete object, a practical reversal and a restrained finish.",
      curiosityBridge: "The fixture leaves the next stop unresolved without claiming a real event.",
      cta: { mode: "soft-curiosity", text: null },
      sourceRefs: [passage.chunkId],
      bookClaims: [{ text: "The invented fixture turns a failed handoff into a repair.", chunkIds: [passage.chunkId] }],
      verbatimQuotes: []
    }]
  });
}

async function ghostRouteAndPrompt(): Promise<{ route: GhostRoute; system: string }> {
  const [modelsRaw, ghost, craft] = await Promise.all([
    readFile(path.join(configRoot, "models.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator", "prompts", "door-money", "ghost.md"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator", "prompts", "door-money", "craft.md"), "utf8")
  ]);
  const models = JSON.parse(modelsRaw) as { roles?: Record<string, unknown> };
  return {
    route: GhostRouteSchema.parse(models.roles?.GHOST),
    system: `${ghost.trim()}\n\n${craft.trim()}`
  };
}

async function defaultBudgetContext(input: {
  root: string;
  cycleId: string;
  now: Date;
  stage: Stage;
}): Promise<ReserveContext> {
  const [ledgerRaw, limits, fixedMonthlyUsd] = await Promise.all([
    optionalJson(input.root, "budget/ledger.json"),
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, input.now)
  ]);
  const entries = ((ledgerRaw as { entries?: unknown[] } | null)?.entries ?? [])
    .map((entry) => BudgetLedgerEntrySchema.parse(entry));
  return {
    now: input.now,
    cycleId: input.cycleId,
    stage: input.stage,
    ledger: entries,
    allInNonApiSpentUsd: fixedMonthlyUsd,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: remainingScheduledCycles(input.now),
    limits
  };
}

function failureMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/(?:\/[^\s:]+)+/gu, "[private path]").slice(0, 600);
}

function buildDeskMeeting(input: {
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  fixture: boolean;
  status: "PLAN" | "NO_ACTION" | "PAUSED" | "FAILED";
  summary: string;
  packages: readonly VentureRecommendation[];
  ghostParticipated: boolean;
  spendUsd: number;
  envelopeUsd: number;
  monthAllInUsd: number;
  monthCapUsd: number;
}) {
  const times = Array.from({ length: 4 }, (_, index) =>
    new Date(input.now.getTime() + index * 1_000).toISOString());
  const ghostParticipated = input.ghostParticipated || input.status === "FAILED";
  const evidenceRefs = [...new Set(input.packages.flatMap(({ evidence }) => evidence.chunkIds))]
    .map((chunkId) => `door-money:chunk:${chunkId}`);
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: "dm-desk",
    kind: "dm-desk",
    fixture: input.fixture,
    status: input.status,
    stage: input.stage,
    operatingBrief: "Turn only code-selected private-store passages into bounded English draft recommendations for owner review; never publish.",
    participantReasons: [
      { agent: "GHOST", reason: "writes one bounded recommendation response from the selected evidence packet", participated: ghostParticipated },
      { agent: "AUDIT", reason: "keeps source, budget and drafts-only boundaries visible in the record", participated: true }
    ],
    ledger: {
      estimatedCycleUsd: input.envelopeUsd,
      actualCycleUsd: input.spendUsd,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: input.monthCapUsd
    },
    decision: {
      outcome: input.packages.length > 0 ? "PLAN" : "NO_ACTION",
      summary: input.summary,
      evidenceRefs
    },
    proposals: input.packages.map((item) => ({
      agent: "GHOST",
      summary: `${item.hook} ${item.formats.join(", ")}: ${item.rationale}`.slice(0, 600),
      evidenceRefs: item.evidence.chunkIds.map((chunkId) => `door-money:chunk:${chunkId}`)
    })),
    voteMatrix: [{ voter: "AUDIT", firstChoice: input.packages.length > 0 ? "owner-review" : "no-action", veto: false }],
    tasks: [],
    growthPlan: "Drafts only. Seven deterministic gates passed before every stored recommendation. Nothing was published, posted, scheduled, bought or sent; nothing was queued or used to create an account, and no channel or treasury path was touched. Owner approval remains mandatory.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: times[0],
      closedAt: times[3],
      gavel: ghostParticipated ? "GHOST" : "AUDIT",
      setting: input.fixture
        ? "Labeled synthetic fixture. Selection and packet assembly ran; no provider or external system was contacted."
        : "One bounded GHOST response from private evidence. Raw source stayed in memory and nothing was published.",
      turns: ghostParticipated
        ? [
            { agent: "GHOST", mode: "gavel", sentAt: times[0], text: "The code-selected evidence packet is the whole writing boundary." },
            { agent: "GHOST", mode: "statement", sentAt: times[1], text: input.summary },
            { agent: "AUDIT", mode: "statement", sentAt: times[2], text: "Failed packages were dropped; stored records are drafts, not approvals. Nothing left the review boundary." },
            { agent: "GHOST", mode: "close", sentAt: times[3], text: input.summary }
          ]
        : [
            { agent: "AUDIT", mode: "gavel", sentAt: times[0], text: "The deterministic gate closed before GHOST was asked to write." },
            { agent: "AUDIT", mode: "close", sentAt: times[3], text: input.summary }
          ]
    },
    generatedAt: times[3]
  });
}

export async function runDoorMoneyDeskCycle(input: {
  cycleId: string;
  now: Date;
  dry: boolean;
  root?: string;
  stage?: Stage;
  knowledge?: DoorMoneyDeskKnowledge;
  call?: GhostCall;
  budgetContext?: ReserveContext;
}): Promise<DoorMoneyDeskCycleResult> {
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : path.join(repoRoot, "state"));
  const date = pragueClockParts(input.now).date;
  const stage: Stage = input.stage ?? await readFile(path.join(configRoot, "stages.json"), "utf8")
    .then((raw) => (JSON.parse(raw) as { current: Stage }).current);
  const registry = await loadVentureRegistry();
  const { meeting } = getVentureMeetingDefinition(registry, "dm-desk");
  let fixtureReason: string | null = input.dry ? "dry mode uses only invented diary data" : null;
  let packages: VentureRecommendation[] = [];
  let droppedPackages = 0;
  let ghostParticipated = false;
  const recommendationPaths: string[] = [];
  let spendUsd = 0;
  let status: "PLAN" | "NO_ACTION" | "PAUSED" | "FAILED" = "NO_ACTION";
  let summary = "No recommendation was drafted.";

  try {
    let knowledge = input.knowledge ?? (input.dry ? await buildDoorMoneyDryKnowledge(input.now) : await loadLiveKnowledge(root));
    if (!knowledge) {
      fixtureReason = "private knowledge or its owner-provided local clone is unavailable";
      knowledge = await buildDoorMoneyDryKnowledge(input.now);
    }
    const selection = selectDoorMoneyPassages({
      ventureId: "door-money",
      date,
      chunks: knowledge.index.chunks,
      performanceWeights: knowledge.performanceWeights
    });
    if (selection.kind === "quiet-day") {
      summary = `Honest quiet day: no passage cleared score and repetition rules (${selection.diagnostics.considered} considered). Nothing was spent.`;
    } else {
      let generatedPackages: GhostDeskPackage[] = [];
      let deskPacket: DoorMoneyDeskPacket | null = null;
      let packetResult = await assembleDoorMoneyDeskPacket({
        date,
        index: knowledge.index,
        styleProfile: knowledge.styleProfile,
        selection,
        store: knowledge.store,
        recommendationHistory: knowledge.recommendationHistory,
        performanceWeights: knowledge.performanceWeights
      });
      if (packetResult.kind === "fixture-required" && !fixtureReason) {
        fixtureReason = packetResult.reason;
        knowledge = await buildDoorMoneyDryKnowledge(input.now);
        const fixtureSelection = selectDoorMoneyPassages({
          ventureId: "door-money",
          date,
          chunks: knowledge.index.chunks,
          performanceWeights: knowledge.performanceWeights
        });
        if (fixtureSelection.kind === "quiet-day") throw new Error("Synthetic desk selection unexpectedly produced a quiet day");
        packetResult = await assembleDoorMoneyDeskPacket({
          date,
          index: knowledge.index,
          styleProfile: knowledge.styleProfile,
          selection: fixtureSelection,
          store: knowledge.store,
          recommendationHistory: [],
          performanceWeights: {}
        });
        if (packetResult.kind !== "ready") throw new Error(packetResult.reason);
        deskPacket = packetResult.packet;
        const response = fixtureGhostResponse({ date, selection: fixtureSelection });
        ghostParticipated = true;
        generatedPackages = response.outcome === "packages" ? response.packages : [];
      } else if (packetResult.kind === "ready") {
        deskPacket = packetResult.packet;
        if (fixtureReason) {
          const response = fixtureGhostResponse({ date, selection });
          ghostParticipated = true;
          generatedPackages = response.outcome === "packages" ? response.packages : [];
        } else {
          const { route, system } = await ghostRouteAndPrompt();
          const packet = wrapUntrustedData("door-money-desk-packet", JSON.stringify({
            ...ghostModelPacket(packetResult.packet),
            ctaPolicy: {
              explicitBuyBookAllowed: explicitCtaAllowed(date),
              reason: "Only the Sunday rotation may propose the week's explicit book CTA; DM-15 still checks rolling history."
            },
            outputContract: {
              outcome: "packages (1-2) or refusal",
              packageFields: [
                "id", "hook", "formatPlans[{format,platforms,reason}]", "copyBlocks[{kind,ordinal,text}]",
                "rationale", "curiosityBridge", "cta{mode,text}", "sourceRefs", "bookClaims[{text,chunkIds}]",
                "verbatimQuotes[{text,chunkId}]"
              ]
            }
          }));
          const estimatedInputTokens = Math.ceil((system.length + packet.length) / 3.5);
          if (estimatedInputTokens > route.maxInputTokens) {
            throw new Error(`GHOST packet estimate ${estimatedInputTokens} exceeds ${route.maxInputTokens} tokens`);
          }
          const called = await (input.call ?? guardedJsonCall)({
            stateRoot: root,
            cycleId: input.cycleId,
            phase: "dm-desk",
            ventureId: "door-money",
            agent: "GHOST",
            provider: route.provider,
            model: route.model,
            system,
            input: packet,
            maxOutputTokens: route.maxOutputTokens,
            // DM-15 has not run yet. A valid-looking response may still echo private source, so
            // it stays in memory and cannot enter the public model cache before deterministic gates.
            cacheResponse: false,
            budgetContext: input.budgetContext ?? await defaultBudgetContext({
              root,
              cycleId: input.cycleId,
              now: input.now,
              stage
            }),
            parse: (text) => validateGhostResponse({
              raw: JSON.parse(text),
              selected: selection,
              explicitCtaAllowed: explicitCtaAllowed(date)
            })
          });
          ghostParticipated = true;
          spendUsd = called.usd;
          generatedPackages = called.value.outcome === "packages" ? called.value.packages : [];
          if (called.value.outcome === "refusal") summary = `GHOST refused the packet: ${called.value.reason}`;
        }
      } else {
        throw new Error(packetResult.reason);
      }
      if (generatedPackages.length > 0 && deskPacket) {
        const duplicateThreshold = await loadDoorMoneyDuplicateThreshold();
        const prior = [...(knowledge.recommendationHistory ?? [])];
        const accepted: VentureRecommendation[] = [];
        const seenIds = new Set<string>();
        for (const generated of generatedPackages) {
          const candidateId = doorMoneyRecommendationId(date, generated.sourceRefs);
          if (seenIds.has(candidateId)) {
            droppedPackages += 1;
            continue;
          }
          seenIds.add(candidateId);
          const gated = gateDoorMoneyPackage({
            package: generated,
            packet: deskPacket,
            priorRecommendations: prior,
            duplicateThreshold,
            now: input.now
          });
          if (!gated.recommendation) {
            droppedPackages += 1;
            continue;
          }
          accepted.push(gated.recommendation);
          prior.push(gated.recommendation);
        }
        for (const draft of accepted) {
          const stored = await storeDoorMoneyDraft(root, draft);
          packages.push(stored.recommendation);
          if (!recommendationPaths.includes(stored.relativePath)) recommendationPaths.push(stored.relativePath);
        }
        status = packages.length > 0 ? "PLAN" : "NO_ACTION";
        summary = packages.length > 0
          ? `${packages.length} gated ${fixtureReason ? "fixture " : ""}${packages.length === 1 ? "draft" : "drafts"} stored for owner review; ${droppedPackages} failed package(s) dropped.`
          : `${droppedPackages} generated package(s) failed deterministic gates and were dropped. Nothing was stored, published or sent.`;
      }
    }
  } catch (error) {
    spendUsd = error instanceof ModelOutputParseError ? error.usd : spendUsd;
    status = error instanceof BudgetError ? "PAUSED" : "FAILED";
    summary = `${error instanceof BudgetError ? "Budget gate paused the desk" : "Desk failure"}: ${failureMessage(error)} Nothing was published or sent.`;
  }

  const ledger = await (async () => {
    const [raw, limits, fixed] = await Promise.all([
      optionalJson(root, "budget/ledger.json"),
      loadRuntimeBudgetLimits(),
      loadFixedMonthlyUsd(configRoot, input.now)
    ]);
    const entries = ((raw as { entries?: unknown[] } | null)?.entries ?? [])
      .map((entry) => BudgetLedgerEntrySchema.parse(entry));
    const month = date.slice(0, 7);
    return {
      monthAllInUsd: fixed + entries.filter(({ ts }) => ts.slice(0, 7) === month)
        .reduce((sum, entry) => sum + entry.usd, 0),
      monthCapUsd: limits.monthlyOperatingUsd
    };
  })();
  const record = buildDeskMeeting({
    cycleId: input.cycleId,
    date,
    now: input.now,
    stage,
    fixture: fixtureReason !== null,
    status,
    summary,
    packages,
    ghostParticipated,
    spendUsd,
    envelopeUsd: meeting.envelopeUsd,
    ...ledger
  });
  const recordPath = `meetings/${date}-dm-desk.json`;
  await atomicWriteJson(root, recordPath, record);
  const records = await loadMeetingRecords(root);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...records.filter((candidate) => !(candidate.date === date && candidate.kind === "dm-desk")), record],
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now: input.now
  });
  const calendarPath = await writeCalendarFeed(root, calendar);
  return {
    cycleId: input.cycleId,
    phase: "dm-desk",
    dry: input.dry,
    status: input.dry ? "dry_complete" : status === "PLAN" || status === "NO_ACTION" ? "live_complete" : "paused",
    decision: status === "PLAN" ? "PLAN" : status === "PAUSED" || status === "FAILED" ? "PAUSED" : "NO_ACTION",
    estimatedWorstCaseUsd: meeting.envelopeUsd,
    selectedAgents: ghostParticipated ? [...meeting.cast] : ["AUDIT"],
    skippedAgents: ghostParticipated ? [] : ["GHOST"],
    artifacts: [recordPath, calendarPath, ...recommendationPaths]
      .map((relative) => path.relative(repoRoot, path.join(root, relative))),
    packages,
    droppedPackages,
    fixtureReason
  };
}
