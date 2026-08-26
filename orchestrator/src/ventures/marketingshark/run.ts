import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BudgetError, BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../../budget.js";
import { ModelOutputParseError } from "../../llm/call.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { MeetingSkipSchema } from "../../contracts/meeting-skip.js";
import { guardedJsonCall } from "../../llm/call.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import type { Stage } from "../../types.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { loadQuestionBankSnapshot, truthSubjectOf, type NormalizedQuestion } from "./bank.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand, type MarketingSharkConfig } from "./config.js";
import { runTruthGates, type GateViolation } from "./gates.js";
import {
  EMPTY_LEDGER,
  MarketingSharkLedgerSchema,
  recordServed,
  selectQuestion,
  type MarketingSharkLedger
} from "./ledger.js";
import { assertHookAssignmentValid, assignPackHook, channelRecordFor, hookLineFor } from "../../studio/hook-brain.js";
import { recordPost, writeHookChannels, type HookChannels } from "../../studio/hook-channels.js";
import type { HookAssignment } from "../../contracts/hook-assignment.js";
import type { Hook } from "@boardlessai/carousel-studio";
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
/**
 * One channel per brand, not one per platform.
 *
 * Instagram and Threads are built from a single package and carry the same slide 1, so they are one
 * rotation with one cooldown. Scoping them separately would record two posts for one decision and
 * halve the effective wear-out window for no gain.
 */
export function hookChannelFor(brandId: string): string {
  return `${brandId}-carousel`;
}

/**
 * `{topic}` values, in the register the copy expects.
 *
 * Category slugs are what the bank actually carries, and they are the honest topic: a hook filled
 * from anything else would be claiming something the payload does not say. Only the presentation is
 * mapped, and only for the slugs whose display form is not their capitalisation.
 */
const TOPIC_LABELS: Readonly<Record<string, string>> = {
  javascript: "JavaScript", typescript: "TypeScript", nodejs: "Node.js", css: "CSS", html: "HTML",
  dsa: "DSA", "system-design": "system design", react: "React", git: "Git", databases: "databases",
  testing: "testing", security: "security", internet: "the internet", algorithms: "algorithms"
};

export function topicLabel(category: string): string {
  return TOPIC_LABELS[category] ?? `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

export interface BrandDayPlan {
  question: NormalizedQuestion;
  selection: ReturnType<typeof selectQuestion>;
  assignment: HookAssignment;
  hook: Hook | null;
  /** The recorded alternate. Never published; kept so a split test has a counterfactual on file. */
  alternate: Hook | null;
  /** The channel state the assignment was taken against, committed with the package. */
  channels: HookChannels;
  contentHash: string;
}

export async function planBrandDay(input: {
  config: MarketingSharkConfig;
  brand: Brand;
  ledger: MarketingSharkLedger;
  date: string;
  root?: string;
  stateRoot?: string;
}): Promise<BrandDayPlan> {
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

  const subject = truthSubjectOf(question);
  const { assignment, hook, library, channels } = await assignPackHook({
    stateRoot: input.stateRoot ?? stateRoot,
    surface: "quiz",
    channel: hookChannelFor(input.brand.id),
    date: input.date,
    itemId: question.id,
    vertical: input.brand.tone,
    languages: ["en", "cs"],
    subject: {
      subject: {
        difficulty: subject.difficulty,
        hasCode: subject.hasCode,
        category: subject.category,
        optionCount: subject.optionCount,
        canonicalEnglishQuestion: subject.englishQuestion
      },
      categoryLists: input.brand.categoryLists
    }
  });

  // The alternate is the next member of the same available list, so it is bound by exactly the
  // gates the assigned hook was. There is no second draw and no second cooldown spend.
  const available = assignment.availableIds;
  const chosen = available.indexOf(assignment.hookId ?? "");
  const alternateId = chosen >= 0 && available.length > 1
    ? available[(chosen + 1) % available.length]!
    : null;
  const alternate = alternateId ? library.hooks.find((entry) => entry.id === alternateId) ?? null : null;

  return { question, selection, assignment, hook, alternate, channels, contentHash: snapshot.contentHash };
}

/**
 * The hook line each locale's slide 1 must carry, or null when the pack falls back.
 *
 * Both languages come from the same assignment. There is one eligible set per pack, so slide 1 is
 * the same hook in EN and CS — only the string differs.
 */
export function hookLinesFor(input: {
  hook: Hook | null;
  brand: Brand;
  question: NormalizedQuestion;
}): { cs: string; en: string } | null {
  if (!input.hook) return null;
  const topic = topicLabel(input.question.category);
  const line = (language: "cs" | "en") =>
    hookLineFor({ hook: input.hook, vertical: input.brand.tone, language, topic })!;
  return { cs: line("cs"), en: line("en") };
}

/**
 * The hook lines a fixture reply should echo back on the hook slide.
 *
 * The same resolution the live path uses, so a dry run exercises the verbatim gate for real: on an
 * assignment it echoes the assigned line, and on the `no-hook` fallback it writes the question, which
 * is what a live run would render when nothing is eligible.
 */
export function fixtureHookLines(plan: Pick<BrandDayPlan, "hook" | "question">, brand: Brand): { hookA: string; hookACs: string } {
  const lines = hookLinesFor({ hook: plan.hook, brand, question: plan.question });
  return {
    hookA: lines?.en ?? plan.question.en.question,
    hookACs: lines?.cs ?? plan.question.cs?.question ?? plan.question.en.question
  };
}

/** Fold CHUM's copy and everything code already knows into the committed package. */
export function assemblePackage(input: {
  date: string;
  brand: Brand;
  question: NormalizedQuestion;
  assignment: HookAssignment;
  hook: Hook | null;
  alternate: Hook | null;
  output: ChumOutput;
  rendered: { cs: RenderedRoleSlide[]; en: RenderedRoleSlide[] };
  summaryPaths: string[];
  spendUsd: number;
}): MarketingSharkPackage {
  // The last place the bound is checked before the assignment becomes a file. An override that
  // reached outside its eligible set, or a set edited after it was evaluated, stops here.
  assertHookAssignmentValid(input.assignment);

  const lines = hookLinesFor(input);
  const alternateLines = hookLinesFor({ ...input, hook: input.alternate });

  const slides = (locale: "cs" | "en") =>
    input.output.carousels[locale].slides.map((slide, index) => ({
      role: SLIDE_ROLES[index]!,
      templateId: input.brand.templateMap[SLIDE_ROLES[index]!],
      // Slide 1 is the library's line, not the model's. The assignment is deterministic $0 code and
      // the copy it assigns is the copy that was linted, length-budgeted and gate-licensed; a
      // paraphrase would be none of those. On the `no-hook` fallback the template's own headline —
      // whatever CHUM wrote for the slide — renders instead.
      headline: index === 0 && lines ? lines[locale] : slide.headline,
      ...(slide.body ? { body: slide.body } : {}),
      alt: slide.alt
    }));

  return MarketingSharkPackage.parse({
    schemaVersion: "marketingshark-package/1",
    date: input.date,
    brandId: input.brand.id,
    question: { id: input.question.id, category: input.question.category, difficulty: input.question.difficulty },
    hooks: {
      a: {
        patternId: input.assignment.hookId ?? "no-hook",
        en: lines?.en ?? input.output.carousels.en.slides[0]!.headline,
        cs: lines?.cs ?? input.output.carousels.cs.slides[0]!.headline
      },
      b: {
        patternId: input.alternate?.id ?? "none",
        en: alternateLines?.en ?? "",
        cs: alternateLines?.cs ?? ""
      }
    },
    hookAssignment: input.assignment,
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
  assignment: HookAssignment;
  hook: Hook | null;
  channels: HookChannels;
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
    hookA: input.assignment.hookId ?? "no-hook",
    hookB: input.built.hooks.b.patternId,
    // The channel cooldown never relaxes: it takes the `no-hook` fallback instead. The field stays
    // for the packages written before that was true.
    relaxed: false,
    package: `state/${relative}`
  });
  await atomicWriteJson(input.root, LEDGER_PATH, nextLedger);

  // The channel record is part of the same unit. A hook recorded without a package would cool a
  // line that never posted; a package without the record would let it post again tomorrow.
  const channelsPath = await writeHookChannels(
    input.root,
    recordPost(input.channels, input.assignment.channel, channelRecordFor(input.assignment, input.hook))
  );

  return [
    relative,
    ...input.summaries.map((summary) => summary.relative),
    ...input.queueItems.map((entry) => entry.relative),
    LEDGER_PATH,
    channelsPath
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
    plan = await planBrandDay({ config: input.config, brand, ledger: input.ledger, date, root: repoRoot, stateRoot: input.root });
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
      hookLines: hookLinesFor({ hook: plan.hook, brand, question: plan.question }),
      hookId: plan.assignment.hookId,
      date,
      ...(violations.length ? { violations } : {})
    });
    let candidate: ChumOutput;
    try {
      const result = await input.call(`${craft}\n\n${packet}`, attempt);
      spendUsd += result.usd;
      candidate = result.output;
    } catch (error) {
      // A refused reservation is not a model failure and must not be recorded as one. Letting it
      // through reaches quietWhenBudgetStops in cycle.ts, which writes a skip naming the gate;
      // swallowing it here reported "model-output-invalid" for a cap doing its job.
      if (error instanceof BudgetError) throw error;
      // guardedJsonCall writes the ledger entry before it throws, so an unparsable reply was
      // still billed. The amount rides on the error and the record has to carry it.
      if (error instanceof ModelOutputParseError) spendUsd += error.usd;
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
      hookLines: hookLinesFor({ hook: plan.hook, brand, question: plan.question })
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

  // A clipped slide is a worse slide, not a rendered one. fitText has always reported which slots
  // it had to cut and the renderer surfaces it as truncatedSlots; nothing read it, so copy that
  // cleared every truth gate could still ship with its last line replaced by an ellipsis. The
  // gates bound what the model writes; this bounds what the canvas can actually hold.
  const clipped = [...rendered.cs, ...rendered.en]
    .flatMap((slide) => slide.truncatedSlots.map((slot) => `${slide.locale}/${slide.role}:${slot}`));
  if (clipped.length > 0) {
    return {
      outcome: {
        status: "aborted",
        brandId: brand.id,
        reason: "render-failed",
        detail: `slides were clipped to fit: ${clipped.join(", ")}`,
        spendUsd
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const summaryPaths = summaryPathsFor(date, brand.id);
  const built = assemblePackage({
    date,
    brand,
    question: plan.question,
    assignment: plan.assignment,
    hook: plan.hook,
    alternate: plan.alternate,
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
    assignment: plan.assignment,
    hook: plan.hook,
    channels: plan.channels,
    queueItems: buildQueueItems({ built, brand, now })
  });

  return {
    outcome: {
      status: "drafted",
      brandId: brand.id,
      questionId: plan.question.id,
      packagePath: `state/${packagePath(date, brand.id)}`,
      spendUsd,
      hookA: plan.assignment.hookId ?? "no-hook",
      hookB: built.hooks.b.patternId,
      relaxed: false
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
export function fixtureChumOutput(input: { brand: Brand; question: NormalizedQuestion; hookA: string; hookACs: string }): ChumOutput {
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
    }
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
  const fixedMonthlyUsd = await loadFixedMonthlyUsd(configRoot, input.now);
  const monthToDateUsd = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
    .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry))
    .filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
    .reduce((sum, entry) => sum + entry.usd, 0);
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
          const plan = await planBrandDay({ config, brand, ledger, date: input.date, root: repoRoot, stateRoot: root });
          return {
            usd: 0,
            output: fixtureChumOutput({ brand, question: plan.question, ...fixtureHookLines(plan, brand) })
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
            // Read per call rather than once before the brand loop. assertSharedReservation
            // derives the cycle, daily and monthly spend entirely from this array, so a frozen
            // snapshot made every reservation in the run see a world where nothing had been spent
            // yet -- the second brand's call could not see the first brand's.
            ledger: (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
              .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry)),
            // The $50 all-in limb of the cap sums this with the model spend. Every other live call
            // site supplies the real figure; passing zero here made this the one paid path that
            // could not see the company's fixed costs.
            allInNonApiSpentUsd: fixedMonthlyUsd,
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
    envelopeUsd: 0.1 * brands.length,
    // The published figures every other room computes. They were literals here, so a reader of an
    // ms-daily record saw "$0.00 of $30.00" on a day the company had spent real money.
    monthAllInUsd: fixedMonthlyUsd + monthToDateUsd + spendUsd,
    monthCapUsd: limits.monthlyOperatingUsd
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
  monthAllInUsd: number;
  monthCapUsd: number;
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
    ledger: { estimatedCycleUsd: input.envelopeUsd, actualCycleUsd: input.spendUsd, monthAllInUsd: input.monthAllInUsd, monthCapUsd: input.monthCapUsd },
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
