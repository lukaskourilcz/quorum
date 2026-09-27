"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AdminButton } from "./admin-primitives";
import { useAdminWritesEnabled } from "./admin-write-mode";

interface Post { id: string; hash: string; channel: string }
interface Choices { posts: Post[]; reviewId: string | null; images: { id: string; available: boolean; alt: string }[] }

export function ArticleQueueActions({ date, unsaved }: { date: string; unsaved: boolean }) {
  const enabled = useAdminWritesEnabled();
  const [choices, setChoices] = useState<Choices | null>(null);
  const [imageId, setImageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/admin/api/queue/articles?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the current drafts. Try again.");
      setChoices(await response.json() as Choices);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load drafts."); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!choices) return;
    setBusy(true); setMessage("");
    let changed = 0;
    try {
      for (const post of choices.posts) {
        const response = await fetch("/admin/api/queue/actions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rerender", itemId: post.id, expectedContentHash: post.hash, ...(imageId ? { imageId } : {}) }) });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? `Could not update ${post.channel}.`);
        changed++;
      }
      setMessage(`${changed} new social drafts are ready in Queue. Each needs your approval.`);
      setChoices(null);
    } catch (error) { setMessage(`${changed} drafts updated. ${error instanceof Error ? error.message : "The remaining drafts could not be updated."} Reload the drafts before retrying.`); }
    finally { setBusy(false); }
  }
  return <section aria-label="Send article design to Queue" className="grid gap-3 rounded-lg border border-[var(--admin-border)] p-4">
    <h3 className="font-semibold">Send to Queue</h3>
    <p className="text-sm">Save the design above, choose an image if needed, then create new social drafts. This does not publish them.</p>
    {unsaved && <p role="status" className="text-sm">Save your changes before sending this design.</p>}
    <AdminButton disabled={!enabled || busy || unsaved} onClick={() => void load()}>{busy ? "Working…" : "Load current posts and images"}</AdminButton>
    {choices && <>
      <fieldset disabled={!enabled || busy || unsaved} className="grid gap-2"><legend className="mb-2 text-sm font-medium">Carousel image</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name={`hero-${date}`} checked={!imageId} onChange={() => setImageId("")} />Keep the approved article image</label>
        <div className="grid gap-3 sm:grid-cols-3">{choices.images.map(image => <label key={image.id} className="grid gap-2 rounded border border-[var(--admin-border)] p-3">
          <span className="flex min-h-11 items-center gap-2"><input type="radio" name={`hero-${date}`} disabled={!image.available} checked={imageId === image.id} onChange={() => setImageId(image.id)} />{image.id === "fal" ? "fal.ai illustration" : image.id === "photo-1" ? "Free photo 1" : "Free photo 2"}{!image.available ? " · unavailable" : ""}</span>
          {image.available && choices.reviewId && <Image unoptimized width={640} height={360} className="h-auto w-full" src={`/admin/api/queue/articles/thumbnail?id=${choices.reviewId}&image=${image.id}`} alt={image.alt} />}
        </label>)}</div>
      </fieldset>
      <p className="text-sm">{choices.posts.length ? choices.posts.map(post => post.channel).join(" · ") : "No editable social drafts for this article. Approve the article first, or check Queue for a closed publishing window."}</p>
      <AdminButton disabled={!enabled || busy || unsaved || !choices.posts.length} onClick={() => void send()}>Create social drafts from saved design</AdminButton>
    </>}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
    <Link className="admin-focus-ring rounded text-sm underline" href="/admin/queue?venture=caught-up">Review posts in Queue</Link>
  </section>;
}
