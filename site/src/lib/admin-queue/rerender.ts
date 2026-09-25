import "server-only";
import { createHash } from "node:crypto";
import { CAROUSEL_BRANDS, quizFrameJpeg, quizSlideRenderInput, renderCarouselSlidePng } from "@boardlessai/carousel-studio";
import {
  canonicalJson,
  designLabPackagesAllowed,
  isQuizDraft,
  packageAddress,
  packageHash,
  quizSlideCopies,
  readQuizPackage,
  reviewPackageSlides,
  slidesWithEdits,
  type PackageFrameFile,
  type PackageSlide,
  type QuizPackageRecord
} from "@/lib/devshark-package";
import { packageSlideEdits, parsePackageSlideOverrides } from "@/lib/package-slide-overrides";
import { SLIDE_OVERRIDES_PATH } from "@/lib/carousel-studio-admin-store";
import type { SocialQueueEventRecord } from "./event";
import { parseQueueItemV2, queueItemV2Hash, supersedingQueueItem, type QueueItemV2 } from "./item";
import type { QueueState } from "./state";
import { QueueActionError, type QueueStore, type StoredQueueFile } from "./store";
import { freeRevisionId, validated, writeEvent } from "./writes";
import type { QueueActionRequest, QueueActionResult } from "./actions";

/**
 * The Queue's `rerender` (quorum#575): the Design Lab's saved slides become a new draft.
 *
 * It renders the item's package through the same studio functions the marketingShark room used,
 * with the owner's saved slide edits laid over it, and runs the room's caps and the clip gate
 * first. The frames (a PNG and a JPEG per slide) and a package revision that records their hashes
 * are written before anything points at them; then the event, the superseding draft and the
 * cancelled original, in that order, exactly as an edit writes them.
 *
 * A revision is addressed by its content: the base package's hash and the five slides' words. So
 * re-rendering the LinkedIn, Instagram and Threads drafts of one package writes the frames once
 * and finds them there for the other two, and a revision can never be two different things. When
 * the saved slides read as the package does, the draft goes back to the package's own frames.
 */

const SUPERSEDABLE = ["draft", "approved", "queued", "failed"];

interface Target {
  artifactRef: string;
  hash: string;
  frames: Array<{ slide: number; png: PackageFrameFile; jpeg: PackageFrameFile }>;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function sameCopy(left: PackageSlide, right: PackageSlide): boolean {
  return left.headline === right.headline && left.body === right.body && left.alt === right.alt;
}

/** The first 12 hex of the revision's identity, which names its frame directory and its file. */
function revisionKey(record: QuizPackageRecord, slides: readonly PackageSlide[]): string {
  const words = slides.map(({ headline, body, alt }) => ({ headline, body, alt }));
  return sha256(Buffer.from(canonicalJson({ base: record.hash, slides: words }))).slice(0, 12);
}

/** Write a frame, or accept the one already there when its bytes are the same. */
async function writeFrame(store: QueueStore, publicPath: string, bytes: Uint8Array, message: string): Promise<void> {
  const relative = `site/public${publicPath}`;
  if (await store.createBytes(relative, bytes, message)) return;
  const existing = await store.readBytes(relative);
  if (!existing || sha256(existing) !== sha256(bytes)) throw new QueueActionError("CONFLICT", `A different frame already sits at ${publicPath}; nothing was changed.`);
}

/**
 * Render the revision's frames and write them and the revision package. Deterministic: the same
 * package and the same words give the same bytes, so a second writer finds its files already there.
 */
async function writeRevision(store: QueueStore, record: QuizPackageRecord, slides: readonly PackageSlide[]): Promise<Target> {
  const key = revisionKey(record, slides);
  const brand = CAROUSEL_BRANDS.devshark;
  const background = brand.colors.background ?? "#000000";
  const copies = quizSlideCopies(slides);
  const raw = structuredClone(record.raw) as { carousels: { en: { slides: Array<Record<string, unknown>> } }; render: { frames: Array<Record<string, unknown>> } };
  const frames: Target["frames"] = [];
  for (const [index, copy] of copies.entries()) {
    const rendered = await renderCarouselSlidePng(quizSlideRenderInput({ ...copy, facts: record.facts!, locale: "en", brand, format: record.format }));
    if (!rendered || rendered.truncatedSlots.length > 0) throw new QueueActionError("REFUSED", `Slide ${index + 1} would clip ${rendered?.truncatedSlots.join(", ") ?? "its slots"}; fix it in the Design Lab first.`);
    const jpeg = await quizFrameJpeg(rendered.png, background);
    const slide = index + 1;
    const base = `/social/${record.brandId}/${record.date}/en/${key}/slide-${String(slide).padStart(2, "0")}`;
    const png: PackageFrameFile = { path: `${base}.png`, sha256: rendered.pngHash, bytes: rendered.png.length };
    const jpg: PackageFrameFile = { path: `${base}.jpg`, sha256: sha256(jpeg), bytes: jpeg.length };
    await writeFrame(store, png.path, rendered.png, `admin(queue): re-render ${record.id} slide ${slide} (${key})`);
    await writeFrame(store, jpg.path, jpeg, `admin(queue): re-render ${record.id} slide ${slide} JPEG (${key})`);
    frames.push({ slide, png, jpeg: jpg });
    const { headline, body, alt } = slides[index]!;
    const packaged = raw.carousels.en.slides[index]!;
    Object.assign(packaged, { headline, alt });
    if (body) packaged.body = body;
    else delete packaged.body;
    const frame = raw.render.frames.find((entry) => entry.locale === "en" && entry.slide === slide);
    if (!frame) throw new QueueActionError("CORRUPT", "The package does not record the frame a re-render replaces.");
    Object.assign(frame, { svgHash: rendered.svgHash, png, jpeg: jpg });
  }
  const revision = { ...raw, revisionOf: { artifactRef: record.artifactRef, packageHash: record.hash } };
  const artifactRef = `state/ventures/marketingshark/packages/${record.date}/${record.brandId}/revisions/${key}.json`;
  const hash = packageHash(revision);
  if (!await store.create(artifactRef, revision, `admin(queue): record the ${key} revision of ${record.id}`)) {
    const existing = await store.read(artifactRef);
    if (!existing || packageHash(existing.value) !== hash) throw new QueueActionError("CONFLICT", "A different package revision already has this name; nothing was changed.");
  }
  return { artifactRef, hash, frames };
}

export async function rerenderQueueItem(input: {
  request: QueueActionRequest;
  current: QueueItemV2;
  state: QueueState;
  store: QueueStore;
  stored: StoredQueueFile;
  relative: string;
  root: string;
  now: Date;
  event: SocialQueueEventRecord;
}): Promise<QueueActionResult> {
  const { current, store } = input;
  if (!SUPERSEDABLE.includes(current.status)) throw new QueueActionError("REFUSED", `A ${current.status} item cannot be re-rendered.`);
  const address = packageAddress(current.releaseId);
  if (current.sourceVentureId !== "marketingshark" || current.content.assetPaths.length === 0 || !address) {
    throw new QueueActionError("REFUSED", "Only a marketingShark carousel is re-rendered from the Design Lab.");
  }
  if (!isQuizDraft(current.content.factualClaimRefs)) {
    throw new QueueActionError("REFUSED", "Only a quiz carousel is re-rendered from the Design Lab. Edit this post's captions here in the Queue.");
  }
  if (!await designLabPackagesAllowed(input.root)) throw new QueueActionError("REFUSED", "marketingShark has no Design Lab edge in the capability map, so nothing is re-rendered for it.");
  const record = await readQuizPackage(address.date, address.brand, input.root);
  if (!record) throw new QueueActionError("NOT_FOUND", "The package this post was drafted from is not in this deployment.");
  if (record.problems.length > 0) throw new QueueActionError("REFUSED", record.problems.join(" "));

  // The saved edits where they are saved: on GitHub in a deployment, not in its copy of the repository.
  const overrides = await store.read(SLIDE_OVERRIDES_PATH);
  const slides = slidesWithEdits(record, packageSlideEdits(parsePackageSlideOverrides(overrides?.value ?? null), record.slug, record.date));
  const problems = reviewPackageSlides(record, slides);
  if (problems.length > 0) throw new QueueActionError("REFUSED", `Not re-rendered: ${problems.map((problem) => problem.message).join(" ")}`);

  const unchanged = slides.every((slide, index) => sameCopy(slide, record.slides[index]!));
  const target: Target = unchanged
    ? { artifactRef: record.artifactRef, hash: record.hash, frames: record.frames }
    : await writeRevision(store, record, slides);
  if (current.sourcePackage?.artifactRef === target.artifactRef && current.sourcePackage.packageHash === target.hash) {
    throw new QueueActionError("INVALID", "This post already carries the Design Lab's saved slides, so there is nothing to re-render.");
  }

  const altText = slides.map((slide) => slide.alt).join(" ");
  const supersedingId = await freeRevisionId(input.state, store, current.id);
  const successor = supersedingQueueItem(current, {
    id: supersedingId,
    text: current.content.text,
    altText,
    now: input.now,
    // Instagram takes JPEG only; LinkedIn and Threads get the PNGs, as the room assigns them.
    assetPaths: target.frames.map((frame) => current.channel === "instagram" ? frame.jpeg.path : frame.png.path),
    sourcePackage: { schemaVersion: "approved-publish-package/1", artifactRef: target.artifactRef, packageHash: target.hash }
  });
  if (!parseQueueItemV2(JSON.parse(JSON.stringify(successor)) as unknown) || queueItemV2Hash(successor) !== successor.content.contentHash) {
    throw new QueueActionError("CORRUPT", "The re-rendered copy did not validate as a queue v2 item.");
  }
  const recorded = validated({
    ...input.event,
    supersedingItemId: supersedingId,
    resultingContentHash: successor.content.contentHash,
    changedFields: ["frames", ...(altText !== current.content.altText ? ["altText" as const] : [])]
  });
  await writeEvent(store, recorded);
  if (!await store.create(`state/social/queue/${supersedingId}.json`, successor, `admin(queue): ${supersedingId} re-renders ${current.id}`)) {
    throw new QueueActionError("CONFLICT", `A queue item named ${supersedingId} already exists; reload and re-render again.`);
  }
  await store.replace(input.relative, { ...current, status: "cancelled" }, input.stored.version, `admin(queue): ${current.id} superseded by ${supersedingId}`);
  return {
    changed: true,
    itemId: current.id,
    supersedingItemId: supersedingId,
    event: { id: recorded.id, action: "rerender", nextStatus: "cancelled" },
    persistence: store.persistence,
    dispatch: null,
    message: unchanged
      ? "Re-rendered with the package's own slides. A new draft replaces this one; approve it when it reads right."
      : "Re-rendered from the Design Lab. A new draft with the new frames replaces this one; approve it when it reads right."
  };
}
