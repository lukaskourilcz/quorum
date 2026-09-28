"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { EditorialCard } from "@/lib/admin-queue/editorial";
import { AdminButton, AdminCard, AdminCardContent, AdminInput, AdminLabel } from "./admin-primitives";
import { useAdminWritesEnabled } from "./admin-write-mode";

function ArticleCard({ item }: { item: EditorialCard }) {
  const id = useId();
  const router = useRouter();
  const enabled = useAdminWritesEnabled();
  const [title, setTitle] = useState(item.title);
  const [imageId, setImageId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [decided, setDecided] = useState(item.decision !== "pending");
  const disabled = !enabled || pending || decided;
  async function decide(action: "approve" | "reject") {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/admin/api/queue/articles", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, hash: item.hash, action, title, imageId: imageId || "photo-1" }) });
      const result = await response.json() as { error?: string; decision?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this decision.");
      setDecided(true);
      setMessage(result.message ?? (action === "approve" ? "Article approved for delivery to DNESKAi." : "Article rejected. It will not be delivered."));
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Check your connection and try again."); }
    finally { setPending(false); }
  }
  return <AdminCard><AdminCardContent className="grid min-w-0 gap-4 p-4">
    <div><p className="text-sm text-[var(--admin-foreground-muted)]">DNESKAi · {item.date} · {item.decision === "pending" ? "Waiting for article review" : item.decision === "approve" ? "Article approved" : "Rejected"}</p>
      <h3 className="break-words text-lg font-semibold">{item.title}</h3></div>
    <details><summary className="admin-focus-ring cursor-pointer rounded-sm">Read the article</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{item.body}</pre></details>
    <fieldset disabled={disabled} className="grid gap-2"><legend className="mb-2 font-medium">1. Choose a headline</legend>
      {item.titles.map((option, index) => <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded border border-[var(--admin-border)] p-3" key={option}>
        <input type="radio" className="mt-1" name={`${id}-title`} checked={title === option} onChange={() => setTitle(option)} />
        <span className="min-w-0 break-words">{index + 1}. {option}</span></label>)}
      {item.titles.length < 4 && <p role="status" className="text-sm">The writer supplied {item.titles.length} distinct headlines. You can write your own below.</p>}
      <AdminLabel htmlFor={`${id}-custom`}>Edit the chosen headline</AdminLabel><AdminInput id={`${id}-custom`} maxLength={240} value={title} onChange={event => setTitle(event.target.value)} />
    </fieldset>
    <fieldset disabled={disabled}><legend className="mb-2 font-medium">2. Choose an image</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {item.images.map(image => <label key={image.id} className="grid min-w-0 content-start gap-2 rounded border border-[var(--admin-border)] p-3">
        <span className="flex min-h-11 items-center gap-2"><input type="radio" name={`${id}-image`} checked={imageId === image.id} disabled={disabled || !image.available} onChange={() => setImageId(image.id)} />{image.id === "fal" ? "AI illustration · fal.ai" : image.id.startsWith("candidate-") ? `Image ${image.id.slice(-1)}` : image.id === "photo-1" ? "Licensed photo 1" : "Licensed photo 2"}</span>
        {image.available ? <><Image unoptimized width={640} height={360} className="h-auto w-full rounded" src={`/admin/api/queue/articles/thumbnail?id=${item.id}&image=${image.id}`} alt={image.alt} /><p className="break-words text-xs">{image.credit}</p></> : <p className="text-sm">{image.reason}</p>}
      </label>)}
    </div></fieldset>
    <p className="text-sm text-[var(--admin-foreground-muted)]">Your chosen headline and image will be delivered with the article to DNESKAi. Leave the article here to keep it on hold.</p>
    {!item.ready && <p role="status">Waiting for four distinct headlines and four reviewed image options. Approval remains unavailable until the choices are complete.</p>}
    <div className="flex flex-wrap gap-2"><AdminButton disabled={disabled || !item.ready || !title.trim() || !imageId} onClick={() => void decide("approve")}>{pending ? "Saving…" : "Approve article"}</AdminButton><AdminButton disabled={disabled} onClick={() => void decide("reject")}>Reject article</AdminButton></div>
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </AdminCardContent></AdminCard>;
}

export function EditorialQueuePanel({ items, unavailable, dropped }: { items: EditorialCard[]; unavailable: boolean; dropped: number }) {
  return <section aria-label="Article review" className="mb-8 grid gap-4">
    <h2 className="text-xl font-semibold">Article review</h2>
    {unavailable ? <p role="alert">Article review is unavailable. Refresh to try again; no article approval has been inferred.</p> : items.length === 0 ? <p>No articles are waiting for review.</p> : items.map(item => <ArticleCard key={item.id} item={item} />)}
    {dropped > 0 && <p role="status">{dropped} article records could not be shown. No approval was inferred for them.</p>}
  </section>;
}
