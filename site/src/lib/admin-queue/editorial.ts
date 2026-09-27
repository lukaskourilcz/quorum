import "server-only";
import { dispatchEditorialRelease } from "./editorial-dispatch";
import { createHash } from "node:crypto";
import { listAdminJson } from "@/lib/admin-repository";
import { queueRepositoryRoot } from "./state";
import { queueStore, QueueActionError } from "./store";
import { rawObject } from "./item";

const HASH = /^[a-f0-9]{64}$/u;
const IMAGE_IDS = ["photo-1", "photo-2", "fal"] as const;
export interface EditorialCard {
  id: string; hash: string; date: string; title: string; body: string; titles: string[];
  images: { id: string; available: boolean; alt: string; credit: string; reason: string | null }[];
  decision: "pending" | "approve" | "reject";
}

export function editorialCard(value: unknown): EditorialCard | null {
  const raw = rawObject(value);
  const articlePackage = rawObject(raw?.package);
  const article = rawObject(rawObject(articlePackage?.article)?.cs);
  const frontmatter = rawObject(article?.frontmatter);
  if (raw?.schemaVersion !== "editorial-review/1" || typeof raw.id !== "string" || !HASH.test(raw.id) ||
      articlePackage?.idempotencyKey !== raw.id || articlePackage.status !== "edition" ||
      typeof articlePackage.date !== "string" || typeof frontmatter?.title !== "string" || typeof article?.body !== "string" ||
      !Array.isArray(raw.titles) || !raw.titles.every(title => typeof title === "string" && title.length <= 240) ||
      !Array.isArray(raw.images) || raw.images.length !== 3) return null;
  const images: EditorialCard["images"] = [];
  for (const value of raw.images) {
    const slot = rawObject(value);
    if (!slot || !IMAGE_IDS.includes(slot.id as typeof IMAGE_IDS[number])) return null;
    const image = rawObject(slot.image);
    const licence = rawObject(image?.license);
    const available = !!image && image.origin === (slot.id === "fal" ? "illustration" : "photo") &&
      typeof image.thumb_bytes_base64 === "string" && typeof image.alt_cs === "string";
    images.push({ id: slot.id as string, available, alt: available ? image!.alt_cs as string : "",
      credit: typeof licence?.author === "string" && typeof licence?.name === "string" ? `${licence.author} · ${licence.name}` : "",
      reason: available ? null : "This candidate is unavailable. Check image generation and budget in Settings." });
  }
  if (new Set(images.map(image => image.id)).size !== 3) return null;
  return { id: raw.id, hash: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    date: articlePackage.date, title: frontmatter.title, body: article.body.slice(0, 60_000),
    titles: raw.titles as string[], images, decision: "pending" };
}

/** Read current GitHub records; a deployment's bundled state is never an approval authority. */
async function reviewIds(root: string): Promise<string[]> {
  try { return (await listAdminJson(root, "state/editorial/reviews")).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

export async function readEditorialQueue(root = queueRepositoryRoot()): Promise<{ items: EditorialCard[]; unavailable: boolean; dropped: number }> {
  try {
    const files = await reviewIds(root);
    const store = queueStore(root);
    let dropped = Math.max(0, files.length - 100);
    const items: EditorialCard[] = [];
    for (const file of files.slice(-100)) {
      try {
        const stored = await store.read(`state/editorial/reviews/${file}`);
        const card = editorialCard(stored?.value);
        if (!card) { dropped++; continue; }
        const decided = rawObject((await store.read(`state/editorial/decisions/${file}`))?.value);
        if (decided) {
          if (decided.reviewHash !== card.hash || !["approve", "reject"].includes(String(decided.action))) { dropped++; continue; }
          card.decision = decided.action as "approve" | "reject";
        }
        items.push(card);
      } catch { dropped++; }
    }
    return { items: items.sort((a, b) => b.date.localeCompare(a.date)), unavailable: false, dropped };
  } catch { return { items: [], unavailable: true, dropped: 0 }; }
}

export async function applyEditorialDecision(value: unknown, root = queueRepositoryRoot(), now = new Date()) {
  const raw = rawObject(value);
  if (!raw || Object.keys(raw).some(key => !["id", "hash", "action", "title", "imageId"].includes(key)) ||
      typeof raw.id !== "string" || !HASH.test(raw.id) || typeof raw.hash !== "string" || !HASH.test(raw.hash) ||
      !["approve", "reject"].includes(String(raw.action)) || typeof raw.title !== "string" ||
      !raw.title.trim() || raw.title.trim().length > 240 || !IMAGE_IDS.includes(raw.imageId as typeof IMAGE_IDS[number])) {
    throw new QueueActionError("INVALID", "Choose a title and image for this article.");
  }
  const store = queueStore(root);
  const stored = await store.read(`state/editorial/reviews/${raw.id}.json`);
  const card = editorialCard(stored?.value);
  if (!card) throw new QueueActionError("NOT_FOUND", "This article review is unavailable.");
  if (card.hash !== raw.hash) throw new QueueActionError("CONFLICT", "The article changed. Reload and review the new version.");
  if (raw.action === "approve" && !card.images.find(image => image.id === raw.imageId)?.available) {
    throw new QueueActionError("REFUSED", "Choose an available, reviewed image.");
  }
  const decision = { schemaVersion: "editorial-decision/1", reviewId: raw.id, reviewHash: raw.hash,
    action: raw.action, title: raw.title.normalize("NFC").trim(), imageId: raw.imageId, decidedAt: now.toISOString(), actor: "owner" };
  const saved = await store.create(`state/editorial/decisions/${raw.id}.json`, decision, `admin(queue): ${raw.action} article ${card.date}`);
  if (!saved) throw new QueueActionError("CONFLICT", "A decision already exists for this version. Reload to see it.");
  return { decision: raw.action, persistence: store.persistence, message: raw.action === "approve" ? await dispatchEditorialRelease(store.persistence) : "Article rejected. It will not be delivered." };
}

export async function editorialThumbnail(id: string, imageId: string, root = queueRepositoryRoot()): Promise<Uint8Array | null> {
  if (!HASH.test(id) || !IMAGE_IDS.includes(imageId as typeof IMAGE_IDS[number])) return null;
  const stored = await queueStore(root).read(`state/editorial/reviews/${id}.json`);
  if (!editorialCard(stored?.value)) return null;
  const slots = rawObject(stored!.value)!.images as unknown[];
  const image = rawObject(rawObject(slots.find(slot => rawObject(slot)?.id === imageId))?.image);
  return typeof image?.thumb_bytes_base64 === "string" ? new Uint8Array(Buffer.from(image.thumb_bytes_base64, "base64")) : null;
}
