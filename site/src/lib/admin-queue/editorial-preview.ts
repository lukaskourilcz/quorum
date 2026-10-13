import "server-only";
import { approvedEditorialPackage, EditorialPreviewSelectionSchema } from "@boardlessai/orchestrator/marketing-source";
import { editorialCard } from "./editorial";
import { rawObject } from "./item";
import { queueRepositoryRoot } from "./state";
import { QueueActionError, queueStore } from "./store";

const HASH = /^[a-f0-9]{64}$/u;

export function assertEditorialPreviewScope(): { repository: "lukaskourilcz/quorum"; branch: string } {
  const branch = process.env.DNESKAI_EDITORIAL_PREVIEW_BRANCH;
  if (process.env.VERCEL_ENV !== "preview" || process.env.DNESKAI_EDITORIAL_PREVIEW_SELECTION_ENABLED !== "true" ||
      !branch || !/^codex\/[A-Za-z0-9][A-Za-z0-9._/-]{0,180}$/u.test(branch) ||
      branch !== process.env.BOARDLESSAI_GITHUB_BRANCH ||
      (process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum") !== "lukaskourilcz/quorum") {
    throw new QueueActionError("REFUSED", "Isolated editorial selection requires an enabled Preview and its explicitly configured codex branch.");
  }
  return { repository: "lukaskourilcz/quorum", branch };
}

export async function readEditorialPreview(id: string, root = queueRepositoryRoot()) {
  assertEditorialPreviewScope();
  if (!HASH.test(id)) throw new QueueActionError("INVALID", "Choose one exact article review.");
  const store = queueStore(root);
  const stored = await store.read(`state/editorial/reviews/${id}.json`);
  const card = editorialCard(stored?.value);
  if (!card) throw new QueueActionError("NOT_FOUND", "This article review is unavailable.");
  const raw = (await store.read(`state/editorial/preview-selections/${id}.json`))?.value;
  const selection = raw === undefined ? null : EditorialPreviewSelectionSchema.safeParse(raw);
  if (selection && (!selection.success || selection.data.decision.reviewId !== id || selection.data.decision.reviewHash !== card.hash ||
      selection.data.branch !== process.env.BOARDLESSAI_GITHUB_BRANCH)) throw new QueueActionError("CONFLICT", "The preview selection no longer matches this review and branch.");
  return { review: card, selection: selection?.success ? selection.data : null, productionApproval: "required-separately", delivery: "disabled" };
}

/** The isolated namespace is deliberately invisible to source export and article delivery. */
export async function applyEditorialPreviewSelection(value: unknown, root = queueRepositoryRoot(), now = new Date()) {
  const scope = assertEditorialPreviewScope();
  const raw = rawObject(value);
  if (!raw || Object.keys(raw).some(key => !["id", "hash", "action", "title", "imageId"].includes(key)) ||
      typeof raw.id !== "string" || !HASH.test(raw.id) || typeof raw.hash !== "string" || !HASH.test(raw.hash) ||
      !["approve", "reject"].includes(String(raw.action)) || typeof raw.title !== "string" || typeof raw.imageId !== "string") {
    throw new QueueActionError("INVALID", "Choose the exact reviewed headline and image.");
  }
  const store = queueStore(root);
  const stored = await store.read(`state/editorial/reviews/${raw.id}.json`);
  const card = editorialCard(stored?.value);
  if (!card) throw new QueueActionError("NOT_FOUND", "This article review is unavailable.");
  if (card.hash !== raw.hash) throw new QueueActionError("CONFLICT", "The article changed. Reload and review the new version.");
  const title = raw.title.normalize("NFC").trim();
  if (!card.titles.some(choice => choice.normalize("NFC").trim() === title)) throw new QueueActionError("REFUSED", "Select a headline already recorded in this review.");
  if (!card.images.some(choice => choice.id === raw.imageId)) throw new QueueActionError("REFUSED", "Select an image already recorded in this review.");
  const selection = EditorialPreviewSelectionSchema.safeParse({ schemaVersion: "editorial-preview-selection/1", scope: "preview-only", delivery: "disabled", ...scope,
    decision: { schemaVersion: "editorial-decision/1", reviewId: raw.id, reviewHash: raw.hash, action: raw.action,
      title, imageId: raw.imageId, decidedAt: now.toISOString(), actor: "owner" } });
  if (!selection.success) throw new QueueActionError("INVALID", "Choose the exact reviewed headline and image.");
  if (raw.action === "approve" && (!card.ready || card.titles.length !== 4 || card.images.length !== 4 ||
      !approvedEditorialPackage(stored?.value, selection.data.decision))) {
    throw new QueueActionError("REFUSED", "This selection needs four distinct reviewed headlines and images and a valid exact article package.");
  }
  const saved = await store.create(`state/editorial/preview-selections/${raw.id}.json`, selection.data, `admin(preview): ${raw.action} article selection ${card.date}`);
  if (!saved) throw new QueueActionError("CONFLICT", "A preview selection already exists for this version. Reload to see it.");
  return { selection: selection.data, persistence: store.persistence, productionApproval: "required-separately", delivery: "disabled",
    message: "Preview selection saved. Magazine release and social approval require separate owner decisions." };
}
