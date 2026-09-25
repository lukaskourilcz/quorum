import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { BudgetError } from "../../budget.js";
import { ModelOutputParseError, ModelResponseTruncatedError } from "../../llm/call.js";
import { configRoot as defaultConfigRoot, repoRoot } from "../../paths.js";
import { atomicWriteBuffer, atomicWriteJson } from "../../state.js";
import { mayRenderDeck, resolveDeckRender } from "../../studio/render-access.js";
import { loadVentureCapabilityMap } from "../capabilities.js";
import type { Brand } from "./config.js";
import type { GateViolation } from "./gates.js";
import { clipToWords, POST_KIND_ROLES, WRITER_FIELDS, writerRoles, type CopyField } from "./kinds.js";
import type { BrandOutcome } from "./outcome.js";
import { packageId, packagePath, PostPackageSchema, type PostPackage, type PostWriterOutput } from "./package.js";
import { craftRulesFor, readCraftRules } from "./packet.js";
import { assemblePostSlides, runPostFitGate, runPostGates } from "./post-gates.js";
import { buildPostPacket } from "./post-packet.js";
import type { PostDayPlan } from "./post-plan.js";
import { buildPostRenderSummary, rasterisePostDeck, renderPostDeck } from "./post-render.js";
import { buildQueueItems, marketingSharkCapabilityRef } from "./queue.js";
import { engineVersion, MARKETINGSHARK_FORMAT, type RasterisedFrame } from "./render.js";

/**
 * One brand's morning for a kind beyond the quiz (quorum#576): the plan code already made, one paid
 * call and one retry for the writer's slides and captions — none at all for the owner's
 * announcement — then the same render, frames, package and draft queue items as the quiz.
 *
 * It returns its outcome rather than throwing, and it writes nothing unless every step passed, so a
 * refused day leaves the package directory, the frames and the queue as it found them.
 */

type PostOutcome = Extract<BrandOutcome, { status: "drafted" | "aborted" | "already-served" }>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true, () => false);
}

/**
 * The deterministic stand-in for the writer in a dry run. Labeled a fixture on every line it
 * writes, and built only from what the plan already holds, so it passes the same gates, the same
 * render and the same packaging as a paid reply, and proves the wiring and nothing else.
 */
export function fixturePostOutput(plan: PostDayPlan, brand: Brand): PostWriterOutput {
  if (plan.ownerCopy) return plan.ownerCopy;
  const fields = WRITER_FIELDS[plan.kind] as Partial<Record<string, readonly CopyField[]>>;
  const pickLine = plan.provenance.week
    ? plan.provenance.week.items.find((item) => item.date === plan.provenance.week!.pick.date)?.line ?? ""
    : "";
  const words: Record<string, { headline: string; body: string }> = {
    what: { headline: "Fixture: what it is", body: `Fixture. ${plan.subject.label}, as the fact sheet names it.` },
    how: { headline: "Fixture: how it works", body: "Fixture. This slide says how a visitor uses it, from the facts." },
    why: { headline: "Fixture: why it helps", body: "Fixture. This slide says why it helps a developer, from the facts." },
    try: { headline: "Fixture: try it", body: "Fixture. Solve it in devShark before you open a second hint." },
    theme: { headline: "", body: "Fixture. The line under this week's theme." },
    pick: { headline: "Fixture: worth a look", body: `Fixture. ${clipToWords(pickLine.replace(/^\w{3} · /u, ""), 150)}` }
  };
  const slides = writerRoles(plan.kind).map((role) => {
    const owned = fields[role] ?? [];
    const text = words[role] ?? { headline: "Fixture", body: "Fixture." };
    return {
      role,
      ...(owned.includes("headline") ? { headline: text.headline } : {}),
      ...(owned.includes("body") ? { body: text.body } : {}),
      alt: `Slide ${(POST_KIND_ROLES[plan.kind] as readonly string[]).indexOf(role) + 1}: fixture ${role}`
    };
  });
  const line = plan.hook.en;
  return {
    slides,
    descriptions: {
      instagram: { en: `Fixture. ${line} on Instagram. The carousel shows it slide by slide.` },
      threads: { en: `Fixture. ${line} on Threads.` },
      linkedin: { en: `Fixture. ${line}, written for LinkedIn.\n\nThe carousel shows it slide by slide.\n\n${brand.productUrl}` }
    },
    hashtags: {
      instagram: { en: brand.hashtags.instagram.en },
      threads: { en: [brand.hashtags.threadsTopic.en] },
      linkedin: { en: brand.hashtags.instagram.en.slice(0, 3) }
    }
  };
}

/** Fold the plan, the writer's words and the frames into the committed package. */
export function assemblePostPackage(input: {
  date: string;
  brand: Brand;
  plan: PostDayPlan;
  output: PostWriterOutput;
  templateIds: readonly string[];
  summaryPaths: string[];
  frames: readonly RasterisedFrame[];
  spendUsd: number;
}): PostPackage {
  const slides = assemblePostSlides(input.plan, input.output);
  return PostPackageSchema.parse({
    id: packageId(input.date, input.brand.id),
    schemaVersion: "marketingshark-package/2",
    kind: input.plan.kind,
    date: input.date,
    brandId: input.brand.id,
    locales: ["en"],
    subject: input.plan.subject,
    hook: { patternId: input.plan.hook.patternId, en: slides[0]!.headline },
    carousels: {
      en: {
        slides: slides.map((slide, index) => ({
          role: slide.role,
          templateId: input.templateIds[index]!,
          headline: slide.headline,
          ...(slide.body ? { body: slide.body } : {}),
          alt: slide.alt
        }))
      }
    },
    descriptions: input.output.descriptions,
    hashtags: input.output.hashtags,
    ...input.plan.provenance,
    rotation: { weekday: input.plan.weekday, scheduled: input.plan.scheduled },
    render: {
      engineVersion: engineVersion(),
      format: MARKETINGSHARK_FORMAT,
      summaryPaths: input.summaryPaths,
      frames: input.frames.map(({ locale, role, slide, svgHash, width, height, png, jpeg }) => ({ locale, role, slide, svgHash, width, height, png, jpeg }))
    },
    status: "draft",
    spendUsd: input.spendUsd
  });
}

/**
 * Write the frames, the render summary, the package and its queue drafts, frames first, so nothing
 * ever points at a file that was not written. There is no ledger or hook-channel record: those
 * belong to the quiz's question rotation, and a post kind's idempotency is its package on disk.
 */
async function commitPostDay(input: {
  root: string;
  publicRoot: string;
  date: string;
  brand: Brand;
  built: PostPackage;
  summary: { relative: string; body: unknown };
  frames: readonly RasterisedFrame[];
  queueItems: ReturnType<typeof buildQueueItems>;
}): Promise<string[]> {
  const frameFiles = input.frames.flatMap((frame) => [
    { path: frame.png.path, bytes: frame.pngBytes },
    { path: frame.jpeg.path, bytes: frame.jpegBytes }
  ]);
  for (const frame of frameFiles) await atomicWriteBuffer(input.publicRoot, frame.path.replace(/^\//u, ""), frame.bytes);
  const relative = packagePath(input.date, input.brand.id);
  await mkdir(path.join(input.root, path.dirname(relative)), { recursive: true });
  await atomicWriteJson(input.root, input.summary.relative, input.summary.body);
  await atomicWriteJson(input.root, relative, input.built);
  for (const { relative: queuePath, item } of input.queueItems) await atomicWriteJson(input.root, queuePath, item);
  return [
    relative,
    input.summary.relative,
    ...input.queueItems.map((entry) => entry.relative),
    ...frameFiles.map((frame) => path.relative(input.root, path.join(input.publicRoot, frame.path.replace(/^\//u, ""))))
  ];
}

export async function runPostDay(input: {
  brand: Brand;
  date: string;
  root: string;
  publicRoot: string;
  configRoot?: string;
  now?: Date;
  plan: PostDayPlan;
  /** The brand's measured hashtags from GoVIRAL's snapshot, for the kinds that take them. */
  trendLines?: readonly string[];
  call: (packet: string, attempt: number) => Promise<{ output: PostWriterOutput; usd: number }>;
}): Promise<{ outcome: PostOutcome; artifacts: string[] }> {
  const { brand, date, plan } = input;
  const now = input.now ?? new Date(`${date}T07:00:00.000Z`);
  const relative = packagePath(date, brand.id);
  const aborted = (reason: Extract<BrandOutcome, { status: "aborted" }>["reason"], detail: string, spendUsd: number) =>
    ({ outcome: { status: "aborted" as const, brandId: brand.id, kind: plan.kind, reason, detail, spendUsd }, artifacts: [] });

  // One package a day: a rerun, a sweep or a manual dispatch after the day drafted finds it here.
  if (await exists(path.join(input.root, relative))) {
    return { outcome: { status: "already-served", brandId: brand.id, kind: plan.kind, subject: plan.subject.ref, questionId: null, packagePath: `state/${relative}` }, artifacts: [] };
  }
  const renderAccess = await resolveDeckRender("marketingshark", { configRoot: input.configRoot ?? defaultConfigRoot });
  if (!mayRenderDeck(renderAccess)) {
    return aborted("render-failed", `the marketingshark -> design-lab render edge is ${renderAccess.decision}: ${renderAccess.reason}`, 0);
  }

  let spendUsd = 0;
  let output: PostWriterOutput | null = null;
  let violations: GateViolation[] = [];
  const check = (candidate: PostWriterOutput): GateViolation[] | { codeClipped: string[] } => {
    const truth = runPostGates({ output: candidate, brand, plan });
    if (truth.length > 0) return truth;
    const fit = runPostFitGate({ output: candidate, brand, plan });
    return fit.codeClipped.length > 0 ? { codeClipped: fit.codeClipped } : fit.violations;
  };

  if (plan.ownerCopy) {
    // The owner's words go through every gate once and are never rewritten: a refusal is theirs to fix.
    const result = check(plan.ownerCopy);
    if (!Array.isArray(result)) return aborted("render-failed", `the announcement would clip: ${result.codeClipped.join(", ")}`, 0);
    if (result.length > 0) return aborted("truth-gate-failed", result.map((violation) => `${violation.gate}: ${violation.detail}`).join("; "), 0);
    output = plan.ownerCopy;
  } else {
    const craft = craftRulesFor(await readCraftRules(repoRoot), plan.kind);
    // One call and one retry that carries the failed checks back, inside the brand's envelope.
    for (let attempt = 1; attempt <= 2 && !output; attempt += 1) {
      const packet = buildPostPacket({ brand, plan, date, ...(input.trendLines ? { trendLines: input.trendLines } : {}), ...(violations.length ? { violations } : {}) });
      let candidate: PostWriterOutput;
      try {
        const result = await input.call(`${craft}\n\n${packet}`, attempt);
        spendUsd += result.usd;
        candidate = result.output;
      } catch (error) {
        if (error instanceof BudgetError) throw error;
        if (error instanceof ModelOutputParseError) spendUsd += error.usd;
        if (error instanceof ModelResponseTruncatedError) spendUsd += error.usd ?? 0;
        return aborted("model-output-invalid", message(error), spendUsd);
      }
      const result = check(candidate);
      if (!Array.isArray(result)) return aborted("render-failed", `code's own slides would clip: ${result.codeClipped.join(", ")}`, spendUsd);
      violations = result;
      if (violations.length === 0) output = candidate;
    }
    if (!output) return aborted("truth-gate-failed", violations.map((violation) => `${violation.gate}/${violation.locale}`).join(", "), spendUsd);
  }

  const slides = assemblePostSlides(plan, output);
  let rendered: ReturnType<typeof renderPostDeck>;
  let frames: RasterisedFrame[];
  try {
    rendered = renderPostDeck({ brand, kind: plan.kind, slides });
    const clipped = rendered.flatMap((slide) => slide.truncatedSlots.map((slot) => `en/${slide.role}:${slot}`));
    if (clipped.length > 0) return aborted("render-failed", `slides were clipped to fit: ${clipped.join(", ")}`, spendUsd);
    frames = await rasterisePostDeck({ brand, kind: plan.kind, slides, date, reviewed: rendered });
  } catch (error) {
    return aborted("render-failed", message(error), spendUsd);
  }

  const summaryRelative = `ventures/marketingshark/packages/${date}/${brand.id}/render-en.json`;
  let built: PostPackage;
  try {
    built = assemblePostPackage({
      date,
      brand,
      plan,
      output,
      templateIds: rendered.map((slide) => slide.templateId),
      summaryPaths: [`state/${summaryRelative}`],
      frames,
      spendUsd
    });
  } catch (error) {
    return aborted("render-failed", `the package did not validate: ${message(error)}`, spendUsd);
  }
  const capabilityRef = await loadVentureCapabilityMap(input.configRoot ?? defaultConfigRoot).then(marketingSharkCapabilityRef, () => null);
  const artifacts = await commitPostDay({
    root: input.root,
    publicRoot: input.publicRoot,
    date,
    brand,
    built,
    summary: { relative: summaryRelative, body: buildPostRenderSummary({ date, brand, kind: plan.kind, rendered }) },
    frames,
    queueItems: capabilityRef ? buildQueueItems({ built, brand, now, capabilityRef }) : []
  });
  return {
    outcome: {
      status: "drafted",
      brandId: brand.id,
      kind: plan.kind,
      subject: plan.subject.ref,
      questionId: null,
      packagePath: `state/${relative}`,
      spendUsd,
      hookA: plan.hook.patternId,
      hookB: "none",
      relaxed: false,
      fallback: null
    },
    artifacts
  };
}
