import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BudgetError } from "../../budget.js";
import { guardedJsonCall, ModelOutputParseError, ModelResponseTruncatedError } from "../../llm/call.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { atomicWriteBuffer, atomicWriteJson, readJson } from "../../state.js";
import { loadQuestionBankSnapshot, truthSubjectOf, type NormalizedQuestion } from "./bank.js";
import { brandLocales, enabledBrands, loadMarketingSharkConfig, type Brand, type MarketingSharkConfig, type MarketingSharkLocale } from "./config.js";
import { runFitGate, runTruthGates, type GateViolation, type HookLines } from "./gates.js";
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
import { ChumOutput, inLocale, MarketingSharkPackage, packageId, packagePath, SLIDE_ROLES } from "./package.js";
import { buildChumPacket, craftRulesFor, readCraftRules } from "./packet.js";
import type { BrandOutcome } from "./outcome.js";
import type { RotationKind } from "./kinds.js";
import { readBrandTrendLines } from "./trends.js";
import { topicLabel } from "./topics.js";
import { buildQueueItems, marketingSharkCapabilityRef } from "./queue.js";
import { loadVentureCapabilityMap } from "../capabilities.js";
import {
  codeOwnedSlotsFit,
  engineVersion,
  MARKETINGSHARK_FORMAT,
  quizFacts,
  rasteriseCarousel,
  renderCarousel,
  slotBudget,
  type RenderedFrame,
  type RenderedRoleSlide
} from "./render.js";
import { mayRenderDeck, resolveDeckRender } from "../../studio/render-access.js";

export const LEDGER_PATH = "marketingshark/ledger.json";
export const MS_DAILY_PHASE = "ms-daily";

export type { BrandOutcome } from "./outcome.js";

export interface MarketingSharkRunResult {
  date: string;
  dry: boolean;
  brands: BrandOutcome[];
  spendUsd: number;
  /** Why the room did not open. `rest` marks a day the rotation gives no room, not a closed gate. */
  skipped: { reason: string; rest?: boolean } | null;
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
    // A question whose own options overflow the context slide would fail at render whatever the
    // writer did; it is skipped here for $0 instead of after a paid call.
    questionIds: snapshot.questions.filter((entry) => codeOwnedSlotsFit(input.brand, entry)).map((entry) => entry.id),
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
    // English first, as the assignment has always recorded it; Czech only for a brand that writes it.
    languages: (["en", "cs"] as const).filter((language) => input.brand.locales.includes(language)),
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
 * Every language comes from the same assignment. There is one eligible set per pack, so slide 1 is
 * the same hook in EN and CS — only the string differs. Czech only for a brand that writes it.
 */
export function hookLinesFor(input: {
  hook: Hook | null;
  brand: Brand;
  question: NormalizedQuestion;
}): HookLines | null {
  if (!input.hook) return null;
  const topic = topicLabel(input.question.category);
  const line = (language: MarketingSharkLocale) =>
    hookLineFor({ hook: input.hook, vertical: input.brand.tone, language, topic })!;
  return { en: line("en"), ...(brandLocales(input.brand).includes("cs") ? { cs: line("cs") } : {}) };
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
    // Unused for an English-only brand: fixtureChumOutput writes only the brand's languages.
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
  rendered: RenderedByLocale;
  summaryPaths: string[];
  frames: readonly RenderedFrame[];
  spendUsd: number;
  /** The kind the rotation wanted when this quiz ran in its place (quorum#576). */
  rotation?: { scheduled: RotationKind; reason: string } | null;
}): MarketingSharkPackage {
  // The last place the bound is checked before the assignment becomes a file. An override that
  // reached outside its eligible set, or a set edited after it was evaluated, stops here.
  assertHookAssignmentValid(input.assignment);

  const lines = hookLinesFor(input);
  const alternateLines = hookLinesFor({ ...input, hook: input.alternate });

  const locales = brandLocales(input.brand);
  const slides = (locale: MarketingSharkLocale) =>
    inLocale(input.output.carousels, locale).slides.map((slide, index) => ({
      role: SLIDE_ROLES[index]!,
      templateId: inLocale(input.rendered, locale)[index]!.templateId,
      // Slide 1 is the library's line, not the model's. The assignment is deterministic $0 code and
      // the copy it assigns is the copy that was linted, length-budgeted and gate-licensed; a
      // paraphrase would be none of those. On the `no-hook` fallback the template's own headline —
      // whatever CHUM wrote for the slide — renders instead.
      headline: index === 0 && lines?.[locale] !== undefined ? lines[locale]! : slide.headline,
      ...(slide.body ? { body: slide.body } : {}),
      alt: slide.alt
    }));

  // Only the brand's languages reach the package. A reply that also wrote Czech for an English-only
  // brand paid for it; nothing downstream reads it, so nothing keeps it.
  const pick = <T>(values: { en: T; cs?: T | undefined }) =>
    Object.fromEntries(locales.map((locale) => [locale, inLocale(values, locale)])) as { en: T; cs?: T };
  const writesCzech = locales.includes("cs");
  return MarketingSharkPackage.parse({
    schemaVersion: "marketingshark-package/2",
    id: packageId(input.date, input.brand.id),
    date: input.date,
    brandId: input.brand.id,
    locales,
    question: { id: input.question.id, category: input.question.category, difficulty: input.question.difficulty },
    hooks: {
      a: {
        patternId: input.assignment.hookId ?? "no-hook",
        en: lines?.en ?? input.output.carousels.en.slides[0]!.headline,
        ...(writesCzech ? { cs: lines?.cs ?? inLocale(input.output.carousels, "cs").slides[0]!.headline } : {})
      },
      b: {
        patternId: input.alternate?.id ?? "none",
        en: alternateLines?.en ?? "",
        ...(writesCzech ? { cs: alternateLines?.cs ?? "" } : {})
      }
    },
    hookAssignment: input.assignment,
    carousels: Object.fromEntries(locales.map((locale) => [locale, { slides: slides(locale) }])),
    descriptions: {
      instagram: pick(input.output.descriptions.instagram),
      threads: pick(input.output.descriptions.threads),
      linkedin: { en: input.output.descriptions.linkedin.en }
    },
    hashtags: {
      instagram: pick(input.output.hashtags.instagram),
      threads: pick(input.output.hashtags.threads),
      linkedin: { en: input.output.hashtags.linkedin.en }
    },
    render: {
      engineVersion: engineVersion(),
      format: MARKETINGSHARK_FORMAT,
      summaryPaths: input.summaryPaths,
      frames: input.frames.map(({ locale, role, slide, svgHash, width, height, png, jpeg }) =>
        ({ locale, role, slide, svgHash, width, height, png, jpeg }))
    },
    status: "draft",
    abRecord: {
      measured: false,
      note: "Both hook variants met the truth rule. SPLIT is retired and METRICS_INGESTION_ENABLED is false, so neither is ranked."
    },
    ...(input.rotation ? { rotation: input.rotation } : {}),
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
  question: NormalizedQuestion;
  locale: MarketingSharkLocale;
  rendered: RenderedRoleSlide[];
}) {
  return {
    schemaVersion: "marketingshark-render/1" as const,
    date: input.date,
    brandId: input.brand.id,
    locale: input.locale,
    format: MARKETINGSHARK_FORMAT,
    engineVersion: engineVersion(),
    /**
     * What code put on the slides: the brand's name and link, the correct letter, the options and
     * the question's code. With these and the package's own copy, the Design Lab renders this deck
     * again through the same studio functions (quorum#575), without the question bank it cannot read.
     */
    facts: quizFacts(input.brand, input.question, input.locale),
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


/**
 * Write the package, its two render summaries and the ledger entry, or write none of them.
 *
 * The package, the ledger and the queue entry are one unit. A day that wrote a package but no
 * ledger entry would re-serve the same question tomorrow; a ledger entry with no package would
 * burn a question nobody ever saw. Everything is staged in memory and committed at the end.
 */
export async function commitBrandDay(input: {
  root: string;
  /** The site's public root; frames land under its `social/` directory. */
  publicRoot: string;
  date: string;
  brand: Brand;
  built: MarketingSharkPackage;
  summaries: Array<{ relative: string; body: unknown }>;
  /** Each frame file's bytes, by its public path. */
  frameFiles: ReadonlyArray<{ path: string; bytes: Uint8Array }>;
  ledger: MarketingSharkLedger;
  selection: ReturnType<typeof selectQuestion>;
  assignment: HookAssignment;
  hook: Hook | null;
  channels: HookChannels;
  queueItems: ReturnType<typeof buildQueueItems>;
}): Promise<string[]> {
  const relative = packagePath(input.date, input.brand.id);
  // Frames first: a package or a queue item never points at a frame that was not written.
  for (const frame of input.frameFiles) {
    await atomicWriteBuffer(input.publicRoot, frame.path.replace(/^\//u, ""), frame.bytes);
  }
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
    channelsPath,
    // Relative to the state root like every other artifact, so the cycle resolves them the same way.
    ...input.frameFiles.map((frame) => path.relative(input.root, path.join(input.publicRoot, frame.path.replace(/^\//u, ""))))
  ];
}

export function summaryPathFor(date: string, brandId: string, locale: MarketingSharkLocale): string {
  return `ventures/marketingshark/packages/${date}/${brandId}/render-${locale}.json`;
}

/** One language's five rendered slides, for each language the brand writes. */
export type RenderedByLocale = { en: RenderedRoleSlide[]; cs?: RenderedRoleSlide[] };

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
  /**
   * The site's public root the frames are written under: `site/public` live, its dry-run twin in a
   * dry run. Required rather than defaulted, so no caller can write frames into the real site by
   * forgetting to say where.
   */
  publicRoot: string;
  /** Where the capability map is read from; the repository's config unless a test says otherwise. */
  configRoot?: string;
  dry: boolean;
  now?: Date;
  /**
   * The kind the rotation scheduled when the quiz runs in its place, and why (quorum#576). Recorded
   * on the package and in the meeting record; absent on a quiz day.
   */
  rotation?: { scheduled: RotationKind; reason: string } | null;
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
      outcome: { status: "aborted", brandId: brand.id, kind: "quiz", reason: "bank-invalid", detail: message(error), spendUsd: 0 },
      ledger: input.ledger,
      artifacts: []
    };
  }

  if (plan.selection.alreadyServed) {
    return {
      outcome: {
        status: "already-served",
        brandId: brand.id,
        kind: "quiz",
        subject: `marketingshark:question:${plan.selection.questionId}`,
        questionId: plan.selection.questionId,
        packagePath: plan.selection.alreadyServed.package
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  // One package a day, whatever its kind (quorum#576). A day another kind already drafted — the
  // owner's announcement, say, whose copy file has since been moved — is served, and the quiz must
  // not write over its package or its frames.
  const existing = packagePath(date, brand.id);
  if (await access(path.join(input.root, existing)).then(() => true, () => false)) {
    return {
      outcome: { status: "already-served", brandId: brand.id, kind: null, subject: `state/${existing}`, questionId: null, packagePath: `state/${existing}` },
      ledger: input.ledger,
      artifacts: []
    };
  }

  // The Design Lab renders this venture's slides only under its own edge in the capability map
  // (quorum#568). Asked before the paid call: a closed edge is a $0 abort, not a draft paid for and
  // then refused at render.
  const renderAccess = await resolveDeckRender("marketingshark", { configRoot: input.configRoot ?? configRoot });
  if (!mayRenderDeck(renderAccess)) {
    return {
      outcome: {
        status: "aborted",
        brandId: brand.id,
        kind: "quiz",
        reason: "render-failed",
        detail: `the marketingshark -> design-lab render edge is ${renderAccess.decision}: ${renderAccess.reason}`,
        spendUsd: 0
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const craft = craftRulesFor(await readCraftRules(repoRoot), "quiz");
  // Read from the real state root in a dry run too: the snapshot is committed data and costs $0.
  const trendLines = await readBrandTrendLines({ stateRoot, configRoot, brandId: brand.id, date });
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
      trendLines,
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
      // Both carry what the provider billed for a reply that could not be used. Counting only the
      // parse case left a truncated room reporting $0 against a real charge on the same ledger.
      if (error instanceof ModelOutputParseError) spendUsd += error.usd;
      if (error instanceof ModelResponseTruncatedError) spendUsd += error.usd ?? 0;
      return {
        outcome: { status: "aborted", brandId: brand.id, kind: "quiz", reason: "model-output-invalid", detail: message(error), spendUsd },
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
    if (violations.length === 0) {
      try {
        violations = runFitGate({ output: candidate, brand, question: plan.question });
      } catch (error) {
        return {
          outcome: { status: "aborted", brandId: brand.id, kind: "quiz", reason: "render-failed", detail: message(error), spendUsd },
          ledger: input.ledger,
          artifacts: []
        };
      }
    }
    if (violations.length === 0) output = candidate;
  }

  if (!output) {
    return {
      outcome: {
        status: "aborted",
        brandId: brand.id,
        kind: "quiz",
        reason: "truth-gate-failed",
        detail: violations.map((violation) => `${violation.gate}/${violation.locale}`).join(", "),
        spendUsd
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const locales = brandLocales(brand);
  let rendered: RenderedByLocale;
  try {
    const written = output;
    const draw = (locale: MarketingSharkLocale) =>
      renderCarousel({ brand, locale, copy: { slides: inLocale(written.carousels, locale).slides.map(withRole) }, question: plan.question });
    rendered = { en: draw("en"), ...(locales.includes("cs") ? { cs: draw("cs") } : {}) };
  } catch (error) {
    return {
      outcome: { status: "aborted", brandId: brand.id, kind: "quiz", reason: "render-failed", detail: message(error), spendUsd },
      ledger: input.ledger,
      artifacts: []
    };
  }

  // A clipped slide is a worse slide, not a rendered one. fitText has always reported which slots
  // it had to cut and the renderer surfaces it as truncatedSlots; nothing read it, so copy that
  // cleared every truth gate could still ship with its last line replaced by an ellipsis. The
  // gates bound what the model writes; this bounds what the canvas can actually hold.
  const clipped = locales.flatMap((locale) => inLocale(rendered, locale))
    .flatMap((slide) => slide.truncatedSlots.map((slot) => `${slide.locale}/${slide.role}:${slot}`));
  if (clipped.length > 0) {
    return {
      outcome: {
        status: "aborted",
        brandId: brand.id,
        kind: "quiz",
        reason: "render-failed",
        detail: `slides were clipped to fit: ${clipped.join(", ")}`,
        spendUsd
      },
      ledger: input.ledger,
      artifacts: []
    };
  }

  // The PNG frames and their JPEG copies, rasterised from the slides the clip check just passed.
  let frames: Awaited<ReturnType<typeof rasteriseCarousel>>;
  try {
    const written = output;
    frames = (await Promise.all(locales.map((locale) => rasteriseCarousel({
      brand,
      locale,
      copy: { slides: inLocale(written.carousels, locale).slides.map(withRole) },
      question: plan.question,
      date,
      reviewed: inLocale(rendered, locale)
    })))).flat();
  } catch (error) {
    return {
      outcome: { status: "aborted", brandId: brand.id, kind: "quiz", reason: "render-failed", detail: message(error), spendUsd },
      ledger: input.ledger,
      artifacts: []
    };
  }

  const summaries = locales.map((locale) => ({
    relative: summaryPathFor(date, brand.id, locale),
    body: buildRenderSummary({ date, brand, question: plan.question, locale, rendered: inLocale(rendered, locale) })
  }));
  const built = assemblePackage({
    date,
    brand,
    question: plan.question,
    assignment: plan.assignment,
    hook: plan.hook,
    alternate: plan.alternate,
    output,
    rendered,
    summaryPaths: summaries.map((summary) => `state/${summary.relative}`),
    frames,
    spendUsd,
    rotation: input.rotation ?? null
  });

  // The queue drafts cross into Social Distribution, so they exist only under that exact edge. A map
  // that does not allow it still gets the package, for review in the admin, and no queue item.
  const capabilityRef = await loadVentureCapabilityMap(input.configRoot ?? configRoot)
    .then(marketingSharkCapabilityRef, () => null);

  const artifacts = await commitBrandDay({
    root: input.root,
    publicRoot: input.publicRoot,
    date,
    brand,
    built,
    summaries,
    frameFiles: frames.flatMap((frame) => [
      { path: frame.png.path, bytes: frame.pngBytes },
      { path: frame.jpeg.path, bytes: frame.jpegBytes }
    ]),
    ledger: input.ledger,
    selection: plan.selection,
    assignment: plan.assignment,
    hook: plan.hook,
    channels: plan.channels,
    queueItems: capabilityRef ? buildQueueItems({ built, brand, now, capabilityRef }) : []
  });

  return {
    outcome: {
      status: "drafted",
      brandId: brand.id,
      kind: "quiz",
      subject: `marketingshark:question:${plan.question.id}`,
      questionId: plan.question.id,
      fallback: input.rotation ?? null,
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

function withRole(slide: ChumOutput["carousels"]["en"]["slides"][number], index: number) {
  return {
    role: SLIDE_ROLES[index]!,
    templateId: "",
    headline: slide.headline,
    ...(slide.body ? { body: slide.body } : {}),
    alt: slide.alt
  };
}

/** Whole words from the start of a text, within a character count, for the fixture reply. */
function wordsWithin(text: string, maxChars: number): string {
  let kept = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length > maxChars) break;
    kept = next;
  }
  return kept;
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
  const slides = (locale: MarketingSharkLocale) => ({
    slides: [
      { role: "hook" as const, headline: locale === "cs" ? input.hookACs : input.hookA, alt: `Slide 1: fixture hook (${locale})` },
      { role: "context" as const, headline: (locale === "cs" && question.cs?.question ? question.cs.question : question.en.question).split("\n")[0]!.slice(0, 110), ...(code ? { body: code } : {}), alt: `Slide 2: fixture question (${locale})` },
      { role: "reveal" as const, headline: letter, body: wordsWithin(answer, slotBudget("stat-highlight", "stat-label").maxChars - 10), alt: `Slide 3: fixture reveal (${locale})` },
      { role: "why" as const, headline: "Fixture", body: wordsWithin(question.en.explanation, slotBudget("quote-card", "quote").maxChars - 30), alt: `Slide 4: fixture explanation (${locale})` },
      { role: "footer" as const, headline: brand.slide5[locale], alt: `Slide 5: fixture footer (${locale})` }
    ]
  });
  // The brand's languages only, as a live reply is asked to write them.
  const written = <T>(value: (locale: MarketingSharkLocale) => T) =>
    Object.fromEntries(brandLocales(brand).map((locale) => [locale, value(locale)])) as { en: T; cs?: T };
  return ChumOutput.parse({
    carousels: written(slides),
    descriptions: {
      instagram: written((locale) => locale === "cs"
        ? `Fixture. Otázka dne z ${brand.displayName}. Odpověď je v karuselu.`
        : `Fixture. Question of the day from ${brand.displayName}. The answer is in the carousel.`),
      threads: written((locale) => locale === "cs" ? "Fixture. Otázka dne." : "Fixture. Question of the day."),
      linkedin: {
        en: `Fixture. One ${brand.displayName} question for working developers, written for LinkedIn.\n\n`
          + `The carousel walks through the question, the answer and why it holds.\n\n${brand.productUrl}`
      }
    },
    hashtags: {
      instagram: written((locale) => brand.hashtags.instagram[locale]),
      threads: written((locale) => [brand.hashtags.threadsTopic[locale]]),
      linkedin: { en: brand.hashtags.instagram.en.slice(0, 3) }
    }
  });
}

export { enabledBrands, loadMarketingSharkConfig, guardedJsonCall, readFile, writeFile, topicLabel };
