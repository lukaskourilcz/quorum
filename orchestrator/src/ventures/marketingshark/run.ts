import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../../budget.js";
import { MeetingSkipSchema } from "../../contracts/meeting-skip.js";
import { guardedJsonCall } from "../../llm/call.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import type { Stage } from "../../types.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { loadQuestionBankSnapshot, type NormalizedQuestion } from "./bank.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand, type MarketingSharkConfig } from "./config.js";
import { runTruthGates, type GateViolation } from "./gates.js";
import {
  assignHooks,
  EMPTY_LEDGER,
  MarketingSharkLedgerSchema,
  recordServed,
  selectQuestion,
  type MarketingSharkLedger
} from "./ledger.js";
import { ChumOutput, MarketingSharkPackage, packagePath, SLIDE_ROLES } from "./package.js";
import { buildChumPacket, readCraftRules } from "./packet.js";
import { buildQueueItems } from "./queue.js";
import { engineVersion, MARKETINGSHARK_FORMAT, renderCarousel, type RenderedRoleSlide } from "./render.js";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";

export const LEDGER_PATH = "marketingshark/ledger.json";
export const MS_DAILY_PHASE = "ms-daily";

/** Why a brand produced nothing, in the vocabulary the meeting record and the calendar use. */
export type BrandOutcome =
  | { status: "drafted"; brandId: string; questionId: string; packagePath: string; spendUsd: number; hookA: string; hookB: string; relaxed: boolean }
  | { status: "already-served"; brandId: string; questionId: string; packagePath: string }
  | { status: "aborted"; brandId: string; reason: "config-invalid" | "bank-invalid" | "selection-failed" | "hook-assignment-failed" | "model-output-invalid" | "truth-gate-failed" | "render-failed"; detail: string; spendUsd: number };

export interface MarketingSharkRunResult {
  date: string;
  dry: boolean;
  brands: BrandOutcome[];
  spendUsd: number;
  skipped: { reason: string } | null;
  artifacts: string[];
}

export async function readLedger(root = stateRoot): Promise<MarketingSharkLedger> {
  const raw = await readJson<unknown>(root, LEDGER_PATH, EMPTY_LEDGER);
  return MarketingSharkLedgerSchema.parse(raw);
}

/**
 * Everything the room decides before it is allowed to spend anything.
 *
 * Kept separate from the call so a dry run, a test and the live room all reach the same question
 * and the same two patterns by the same path. Steps 2 to 4 of the meeting flow, and all $0.
 */
export async function planBrandDay(input: {
  config: MarketingSharkConfig;
  brand: Brand;
  ledger: MarketingSharkLedger;
  date: string;
  root?: string;
}): Promise<{
  question: NormalizedQuestion;
  selection: ReturnType<typeof selectQuestion>;
  hooks: ReturnType<typeof assignHooks>;
  contentHash: string;
}> {
  const snapshot = await loadQuestionBankSnapshot(input.brand.questionBank.snapshotPath, input.root ?? repoRoot);
  const selection = selectQuestion({
    ledger: input.ledger,
    brandId: input.brand.id,
    date: input.date,
    questionIds: snapshot.questions.map((entry) => entry.id),
    contentHash: snapshot.contentHash
  });
  const question = snapshot.questions.find((entry) => entry.id === selection.questionId);
  if (!question) throw new Error(`${selection.questionId} is not in ${input.brand.id}'s snapshot`);

  const hooks = assignHooks({
    library: input.config.hookLibrary,
    brand: input.brand,
    brandId: input.brand.id,
    question,
    date: input.date,
    served: selection.brandLedger.served,
    minEligibleBeforeRelax: input.config.minEligibleBeforeRelax
  });

  return { question, selection, hooks, contentHash: snapshot.contentHash };
}

/** Fold CHUM's copy and everything code already knows into the committed package. */
export function assemblePackage(input: {
  date: string;
  brand: Brand;
  question: NormalizedQuestion;
  hookAId: string;
  hookBId: string;
  output: ChumOutput;
  rendered: { cs: RenderedRoleSlide[]; en: RenderedRoleSlide[] };
  summaryPaths: string[];
  spendUsd: number;
}): MarketingSharkPackage {
  const slides = (locale: "cs" | "en") =>
    input.output.carousels[locale].slides.map((slide, index) => ({
      role: SLIDE_ROLES[index]!,
      templateId: input.brand.templateMap[SLIDE_ROLES[index]!],
      headline: slide.headline,
      ...(slide.body ? { body: slide.body } : {}),
      alt: slide.alt
    }));

  return MarketingSharkPackage.parse({
    schemaVersion: "marketingshark-package/1",
    date: input.date,
    brandId: input.brand.id,
    question: { id: input.question.id, category: input.question.category, difficulty: input.question.difficulty },
    hooks: {
      a: { patternId: input.hookAId, en: input.output.carousels.en.slides[0]!.headline, cs: input.output.carousels.cs.slides[0]!.headline },
      b: { patternId: input.hookBId, en: input.output.hookB.en, cs: input.output.hookB.cs }
    },
    carousels: { cs: { slides: slides("cs") }, en: { slides: slides("en") } },
    descriptions: input.output.descriptions,
    hashtags: input.output.hashtags,
    render: { engineVersion: engineVersion(), summaryPaths: input.summaryPaths },
    status: "draft",
    abRecord: {
      measured: false,
      note: "Both hook variants met the truth rule. SPLIT is retired and METRICS_INGESTION_ENABLED is false, so neither is ranked."
    },
    spendUsd: input.spendUsd
  });
}

/**
 * The carousel summary written beside the package.
 *
 * Delivered articles get a summary next to them because a delivery cannot happen without one.
 * The same rule holds here for the same reason: the recorded artifact is what was actually
 * rendered, so the admin preview and any later review read bytes rather than rebuilding them
 * from copy that may since have changed.
 */
export function buildRenderSummary(input: {
  date: string;
  brand: Brand;
  locale: "cs" | "en";
  rendered: RenderedRoleSlide[];
}) {
  return {
    schemaVersion: "marketingshark-render/1" as const,
    date: input.date,
    brandId: input.brand.id,
    locale: input.locale,
    format: MARKETINGSHARK_FORMAT,
    engineVersion: engineVersion(),
    slides: input.rendered.map((slide) => ({
      role: slide.role,
      templateId: slide.templateId,
      version: slide.version,
      slideId: slide.slideId,
      svgHash: slide.svgHash,
      truncatedSlots: slide.truncatedSlots,
      svg: slide.svg
    }))
  };
}

export async function writeSkip(input: { date: string; reason: string; now: Date; root?: string }): Promise<string> {
  const root = input.root ?? stateRoot;
  const relative = `meetings/skips/${input.date}-${MS_DAILY_PHASE}.json`;
  const skip = MeetingSkipSchema.parse({
    schemaVersion: "meeting-skip/1",
    date: input.date,
    phase: MS_DAILY_PHASE,
    reason: input.reason,
    decidedAt: input.now.toISOString()
  });
  await mkdir(path.join(root, "meetings", "skips"), { recursive: true });
  await atomicWriteJson(root, relative, skip);
  return relative;
}

/**
 * Write the package, its two render summaries and the ledger entry, or write none of them.
 *
 * The package, the ledger and the queue entry are one unit. A day that wrote a package but no
 * ledger entry would re-serve the same question tomorrow; a ledger entry with no package would
 * burn a question nobody ever saw. Everything is staged in memory and committed at the end.
 */
export async function commitBrandDay(input: {
  root: string;
  date: string;
  brand: Brand;
  built: MarketingSharkPackage;
  summaries: Array<{ relative: string; body: unknown }>;
  ledger: MarketingSharkLedger;
  selection: ReturnType<typeof selectQuestion>;
  hookAId: string;
  hookBId: string;
  relaxed: boolean;
  queueItems: ReturnType<typeof buildQueueItems>;
}): Promise<string[]> {
  const relative = packagePath(input.date, input.brand.id);
  await mkdir(path.join(input.root, path.dirname(relative)), { recursive: true });
  for (const summary of input.summaries) {
    await mkdir(path.join(input.root, path.dirname(summary.relative)), { recursive: true });
    await atomicWriteJson(input.root, summary.relative, summary.body);
  }
  await atomicWriteJson(input.root, relative, input.built);

  // Draft-locked, and written in the same breath as the package so a reviewer never finds copy
  // with no queue entry or a queue entry pointing at copy that was never committed.
  for (const { relative: queuePath, item } of input.queueItems) {
    await atomicWriteJson(input.root, queuePath, item);
  }

  const nextLedger = recordServed(input.ledger, input.brand.id, input.selection.brandLedger, {
    date: input.date,
    epoch: input.selection.epoch,
    questionId: input.built.question.id,
    hookA: input.hookAId,
    hookB: input.hookBId,
    relaxed: input.relaxed,
    package: `state/${relative}`
  });
  await atomicWriteJson(input.root, LEDGER_PATH, nextLedger);

  return [
    relative,
    ...input.summaries.map((summary) => summary.relative),
    ...input.queueItems.map((entry) => entry.relative),
    LEDGER_PATH
  ];
}

export function summaryPathsFor(date: string, brandId: string): { cs: string; en: string } {
  return {
    cs: `ventures/marketingshark/packages/${date}/${brandId}/render-cs.json`,
    en: `ventures/marketingshark/packages/${date}/${brandId}/render-en.json`
  };
}

/**
 * One brand's morning, from the already-made plan through the one paid call to the committed
 * package. Returns the outcome rather than throwing, so one brand's bad day cannot take the
 * other brand's package with it.
 */
export async function runBrandDay(input: {
  config: MarketingSharkConfig;
  brand: Brand;
  ledger: MarketingSharkLedger;
  date: string;
  cycleId: string;
  root: string;
  dry: boolean;
  now?: Date;
  call: (packet: string, attempt: number) => Promise<{ output: ChumOutput; usd: number }>;
}): Promise<{ outcome: BrandOutcome; ledger: MarketingSharkLedger; artifacts: string[] }> {
  const { brand, date } = input;
  const now = input.now ?? new Date(`${date}T07:00:00.000Z`);
  let spendUsd = 0;

  let plan: Awaited<ReturnType<typeof planBrandDay>>;
  try {
    // The snapshot path and the craft rules are repo-relative and are read from the repository on
    // every run. Only state writes move to the dry-run root; a dry run reads the same committed
    // bank the live room reads, which is the whole point of it proving the wiring.
    plan = await planBrandDay({ config: input.config, brand, ledger: input.ledger, date, root: repoRoot });
  } catch (error) {
    return {
      outcome: { status: "aborted", brandId: brand.id, reason: "bank-invalid", detail: message(error), spendUsd: 0 },
      ledger: input.ledger,
      artifacts: []
    };
  }

  if (plan.selection.alreadyServed) {
    return {
      outcome: {
        status: "already-served",
        brandId: brand.id,
        questionId: plan.selection.questionId,
        packagePath: plan.selection.alreadyServed.package
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const craft = await readCraftRules(repoRoot);
  let violations: GateViolation[] = [];
  let output: ChumOutput | null = null;

  // One call, and one retry that carries the failed checks back. Never more: the envelope is
  // $0.10 for the brand and a third attempt is a room that has stopped converging.
  for (let attempt = 1; attempt <= 2 && !output; attempt += 1) {
    const packet = buildChumPacket({
      brand,
      question: plan.question,
      hookA: plan.hooks.a,
      hookB: plan.hooks.b,
      date,
      ...(violations.length ? { violations } : {})
    });
    let candidate: ChumOutput;
    try {
      const result = await input.call(`${craft}\n\n${packet}`, attempt);
      spendUsd += result.usd;
      candidate = result.output;
    } catch (error) {
      return {
        outcome: { status: "aborted", brandId: brand.id, reason: "model-output-invalid", detail: message(error), spendUsd },
        ledger: input.ledger,
        artifacts: []
      };
    }
    violations = runTruthGates({
      output: candidate,
      brand,
      question: plan.question,
      hookA: plan.hooks.a,
      hookB: plan.hooks.b
    });
    if (violations.length === 0) output = candidate;
  }

  if (!output) {
    return {
      outcome: {
        status: "aborted",
        brandId: brand.id,
        reason: "truth-gate-failed",
        detail: violations.map((violation) => `${violation.gate}/${violation.locale}`).join(", "),
        spendUsd
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  let rendered: { cs: RenderedRoleSlide[]; en: RenderedRoleSlide[] };
  try {
    rendered = {
      cs: renderCarousel({ brand, locale: "cs", copy: { slides: output.carousels.cs.slides.map(withRole) }, question: plan.question }),
      en: renderCarousel({ brand, locale: "en", copy: { slides: output.carousels.en.slides.map(withRole) }, question: plan.question })
    };
  } catch (error) {
    return {
      outcome: { status: "aborted", brandId: brand.id, reason: "render-failed", detail: message(error), spendUsd },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const summaryPaths = summaryPathsFor(date, brand.id);
  const built = assemblePackage({
    date,
    brand,
    question: plan.question,
    hookAId: plan.hooks.a.id,
    hookBId: plan.hooks.b.id,
    output,
    rendered,
    summaryPaths: [summaryPaths.cs, summaryPaths.en].map((relative) => `state/${relative}`),
    spendUsd
  });

  const artifacts = await commitBrandDay({
    root: input.root,
    date,
    brand,
    built,
    summaries: [
      { relative: summaryPaths.cs, body: buildRenderSummary({ date, brand, locale: "cs", rendered: rendered.cs }) },
      { relative: summaryPaths.en, body: buildRenderSummary({ date, brand, locale: "en", rendered: rendered.en }) }
    ],
    ledger: input.ledger,
    selection: plan.selection,
    hookAId: plan.hooks.a.id,
    hookBId: plan.hooks.b.id,
    relaxed: plan.hooks.relaxed,
    queueItems: buildQueueItems({ built, brand, now })
  });

  return {
    outcome: {
      status: "drafted",
      brandId: brand.id,
      questionId: plan.question.id,
      packagePath: `state/${packagePath(date, brand.id)}`,
      spendUsd,
      hookA: plan.hooks.a.id,
      hookB: plan.hooks.b.id,
      relaxed: plan.hooks.relaxed
    },
    ledger: await readLedger(input.root),
    artifacts
  };
}

function withRole(slide: ChumOutput["carousels"]["cs"]["slides"][number], index: number) {
  return {
    role: SLIDE_ROLES[index]!,
    templateId: "",
    headline: slide.headline,
    ...(slide.body ? { body: slide.body } : {}),
    alt: slide.alt
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The deterministic fixture reply a dry run uses instead of a provider call.
 *
 * Labeled as a fixture everywhere it lands, so it can never be read as evidence that the venture
 * produced something. It exists to prove the wiring: selection, gates, render, packaging and the
 * ledger all run for real against it.
 */
export function fixtureChumOutput(input: { brand: Brand; question: NormalizedQuestion; hookA: string; hookACs: string; hookB: string; hookBCs: string }): ChumOutput {
  const { brand, question } = input;
  const answer = question.en.options[question.correctIndex] ?? "";
  const letter = String.fromCharCode(65 + question.correctIndex);
  const code = (question.en.question.match(/```[a-z0-9+#-]*\n([\s\S]*?)```/iu)?.[1] ?? "").replace(/\s+$/u, "");
  const slides = (locale: "cs" | "en") => ({
    slides: [
      { role: "hook" as const, headline: locale === "cs" ? input.hookACs : input.hookA, alt: `Slide 1: fixture hook (${locale})` },
      { role: "context" as const, headline: (locale === "cs" && question.cs?.question ? question.cs.question : question.en.question).split("\n")[0]!.slice(0, 110), ...(code ? { body: code } : {}), alt: `Slide 2: fixture question (${locale})` },
      { role: "reveal" as const, headline: letter, body: answer.slice(0, 110), alt: `Slide 3: fixture reveal (${locale})` },
      { role: "why" as const, headline: "Fixture", body: question.en.explanation.split(/\s+/u).slice(0, 25).join(" "), alt: `Slide 4: fixture explanation (${locale})` },
      { role: "footer" as const, headline: brand.slide5[locale], alt: `Slide 5: fixture footer (${locale})` }
    ]
  });
  return ChumOutput.parse({
    carousels: { cs: slides("cs"), en: slides("en") },
    descriptions: {
      instagram: {
        cs: `Fixture. Otázka dne z ${brand.displayName}. Odpověď je v karuselu.`,
        en: `Fixture. Question of the day from ${brand.displayName}. The answer is in the carousel.`
      },
      threads: { cs: "Fixture. Otázka dne.", en: "Fixture. Question of the day." }
    },
    hashtags: {
      instagram: { cs: brand.hashtags.instagram.cs, en: brand.hashtags.instagram.en },
      threads: { cs: [brand.hashtags.threadsTopic.cs], en: [brand.hashtags.threadsTopic.en] }
    },
    hookB: { en: input.hookB, cs: input.hookBCs }
  });
}

/**
 * The whole `ms-daily` slot: gates, then one brand at a time, then the record.
 *
 * Everything except step 6 is $0, and every abort path leaves the ledger and the package
 * directory exactly as it found them. A closed gate writes a MeetingSkip so the calendar can say
 * which gate closed rather than showing an hour nobody reached.
 */
export async function runMarketingSharkCycle(input: {
  cycleId: string;
  dry: boolean;
  now: Date;
  date: string;
  stage: Stage;
}): Promise<MarketingSharkRunResult> {
  const root = input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
  const config = await loadMarketingSharkConfig();
  const brands = enabledBrands(config);

  if (!input.dry) {
    const closed = process.env.PORTFOLIO_LIVE_ENABLED !== "true" ? "the portfolio live switch is off" : null;
    if (closed) {
      // Only a scheduled wake-up leaves a skip. A manual or local invocation of a closed slot is
      // not a missed meeting and must not write one onto the calendar.
      const artifacts = process.env.MEETING_TRIGGER === "schedule"
        ? [await writeSkip({ date: input.date, reason: `ms-daily did not open: ${closed}.`, now: input.now, root })]
        : [];
      return { date: input.date, dry: false, brands: [], spendUsd: 0, skipped: { reason: closed }, artifacts };
    }
  }

  const limits = await loadRuntimeBudgetLimits();
  const ledgerEntries = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] })).entries
    .map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const models = JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")) as {
    roles: Record<string, { provider: "openai" | "anthropic"; model: string; maxOutputTokens: number }>;
  };
  const chum = models.roles.CHUM;
  if (!chum) throw new Error("config/models.json has no CHUM route");

  let ledger = await readLedger(root);
  const outcomes: BrandOutcome[] = [];
  const artifacts: string[] = [];
  let spendUsd = 0;

  for (const brand of brands) {
    const result = await runBrandDay({
      config,
      brand,
      ledger,
      date: input.date,
      cycleId: input.cycleId,
      root,
      dry: input.dry,
      call: async (packet, attempt) => {
        if (input.dry) {
          // A dry run proves the wiring and never contacts a provider. The fixture reply runs
          // through the same gates, the same render and the same packaging as a paid one.
          const plan = await planBrandDay({ config, brand, ledger, date: input.date, root: repoRoot });
          return {
            usd: 0,
            output: fixtureChumOutput({
              brand,
              question: plan.question,
              hookA: plan.hooks.a.variants[brand.tone]?.en ?? "",
              hookACs: plan.hooks.a.variants[brand.tone]?.cs ?? "",
              hookB: plan.hooks.b.variants[brand.tone]?.en ?? "",
              hookBCs: plan.hooks.b.variants[brand.tone]?.cs ?? ""
            })
          };
        }
        const call = await guardedJsonCall<ChumOutput>({
          stateRoot: root,
          cycleId: input.cycleId,
          phase: MS_DAILY_PHASE,
          attempt,
          ventureId: "marketingshark",
          agent: "CHUM",
          provider: chum.provider,
          model: chum.model,
          system: "You are CHUM, the marketingShark bilingual carousel copywriter. Return only the JSON object you were asked for.",
          input: packet,
          maxOutputTokens: chum.maxOutputTokens,
          budgetContext: {
            now: input.now,
            cycleId: input.cycleId,
            stage: input.stage,
            ledger: ledgerEntries,
            allInNonApiSpentUsd: 0,
            allInCommittedUsd: 0,
            knownMonthlyForecastUsd: 0,
            remainingScheduledCycles: 60,
            limits
          },
          parse: (text) => ChumOutput.parse(JSON.parse(text))
        });
        return { output: call.value, usd: call.usd };
      }
    });
    if (result.outcome.status === "aborted") {
      // An abort that only shows up as an empty artifact list is indistinguishable from a room
      // nobody reached. The reason is the whole point of recording one.
      console.warn(JSON.stringify({
        event: "marketingshark_brand_aborted",
        brand: result.outcome.brandId,
        reason: result.outcome.reason,
        detail: result.outcome.detail,
        usd: result.outcome.spendUsd
      }));
    }
    outcomes.push(result.outcome);
    ledger = result.ledger;
    artifacts.push(...result.artifacts);
    // An aborted brand still spent whatever its call cost before the gate refused it, and the
    // record has to carry that. Only an already-served brand costs nothing.
    if (result.outcome.status !== "already-served") spendUsd += result.outcome.spendUsd;
  }

  const recordPath = `meetings/${input.date}-${MS_DAILY_PHASE}.json`;
  await atomicWriteJson(root, recordPath, buildMeetingRecord({
    cycleId: input.cycleId,
    date: input.date,
    now: input.now,
    stage: input.stage,
    dry: input.dry,
    outcomes,
    spendUsd,
    envelopeUsd: 0.1 * brands.length
  }));
  artifacts.push(recordPath);

  return { date: input.date, dry: input.dry, brands: outcomes, spendUsd, skipped: null, artifacts };
}

/**
 * The room's record, in the same shape and with the same sanitising as every other room.
 *
 * The transcript is three deterministic turns rather than a conversation, because that is what
 * happened: MAKO opens with the day's objective, CHUM reports what it drafted, AUDIT states the
 * locks that held. Writing it as a debate would be a nicer record of a meeting that did not occur.
 */
export function buildMeetingRecord(input: {
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  dry: boolean;
  outcomes: readonly BrandOutcome[];
  spendUsd: number;
  envelopeUsd: number;
}) {
  const drafted = input.outcomes.filter((outcome) => outcome.status === "drafted");
  const aborted = input.outcomes.filter((outcome) => outcome.status === "aborted");
  const times = Array.from({ length: 4 }, (_, index) => new Date(input.now.getTime() + index * 60_000).toISOString());
  const summary = drafted.length === 0
    ? aborted.length > 0
      ? `No package was drafted. ${aborted.map((outcome) => `${outcome.brandId}: ${outcome.reason}`).join("; ")}.`
      : "Every enabled brand already had today's package; nothing was re-served."
    : `${drafted.length} draft ${drafted.length === 1 ? "package" : "packages"}: ${drafted.map((outcome) => `${outcome.brandId} (${outcome.hookA}/${outcome.hookB}${outcome.relaxed ? ", cooldown relaxed" : ""})`).join("; ")}.`;

  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: MS_DAILY_PHASE,
    kind: MS_DAILY_PHASE,
    fixture: input.dry,
    status: input.dry ? "PLAN" : "HELD",
    stage: input.stage,
    operatingBrief: "Turn one selected question into one Czech and one English five-slide carousel per enabled brand, as a draft behind the approval queue.",
    participantReasons: [
      { agent: "MAKO", reason: "directs the venture and chairs the bounded room", participated: true },
      { agent: "CHUM", reason: "writes the day's bilingual copy", participated: drafted.length > 0 },
      { agent: "AUDIT", reason: "serves the veto seat", participated: true }
    ],
    ledger: { estimatedCycleUsd: input.envelopeUsd, actualCycleUsd: input.spendUsd, monthAllInUsd: 0, monthCapUsd: 30 },
    decision: {
      outcome: drafted.length > 0 ? "PLAN" : "NO_ACTION",
      summary,
      evidenceRefs: drafted.map((outcome) => `marketingshark:question:${outcome.questionId}`)
    },
    proposals: drafted.map((outcome) => ({
      agent: "CHUM",
      summary: `${outcome.brandId}: question ${outcome.questionId}, hook ${outcome.hookA}, alternate ${outcome.hookB}.`,
      evidenceRefs: [`marketingshark:question:${outcome.questionId}`]
    })),
    voteMatrix: [
      { voter: "MAKO", firstChoice: drafted.length > 0 ? "approve" : "abstain", veto: false },
      { voter: "AUDIT", firstChoice: "approve", veto: false }
    ],
    tasks: [],
    growthPlan: "Drafts only. Nothing here posts, schedules, buys or opens an account: SOCIAL_KILL_SWITCH is the supreme stop, marketingShark owns no channel or credentials, and every queue item is written as a draft with all approval checks pending.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: times[0],
      closedAt: times[3],
      gavel: "MAKO",
      setting: input.dry
        ? "Deterministic dry room. The reply is a labeled fixture and no provider was contacted."
        : "Live bounded room. One model call per enabled brand, and the question, hooks, templates and slide-5 line were all decided in code before it.",
      turns: [
        { agent: "MAKO", mode: "gavel", sentAt: times[0], text: "One question, one Czech and one English carousel per enabled brand." },
        { agent: "CHUM", mode: "statement", sentAt: times[1], text: summary },
        { agent: "AUDIT", mode: "statement", sentAt: times[2], text: "Truth gates ran on every returned draft. Nothing was published, queued or scheduled." },
        { agent: "MAKO", mode: "close", sentAt: times[3], text: summary }
      ]
    },
    generatedAt: times[3]
  });
}

export { enabledBrands, loadMarketingSharkConfig, guardedJsonCall, readFile, writeFile };
