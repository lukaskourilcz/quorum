"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MmaFilesMetricsForm({ posts }: { posts: Array<{ value: string; label: string }> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(form: FormData) {
    setPending(true); setMessage("Saving results…"); setError("");
    try {
      const response = await fetch("/admin/api/mma-files/metrics", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const payload = await response.json() as { error?: string; idempotent?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "The results could not be saved.");
      setMessage(payload.idempotent ? "These results were already saved." : "Results saved. Refresh to update the sample table.");
    } catch (caught) { setMessage(""); setError(caught instanceof Error ? caught.message : "The results could not be saved."); }
    finally { setPending(false); }
  }

  if (!posts.length) return <p className="text-sm leading-6 text-[var(--fog)]">No social variants are ready for results yet.</p>;
  const field = "min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3";
  return <form action={submit} className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm sm:col-span-2"><span className="mb-2 block text-[var(--fog)]">Post</span><select className={field} name="postRef" required>{posts.map((post) => <option key={post.value} value={post.value}>{post.label}</option>)}</select></label>
    <label className="text-sm"><span className="mb-2 block text-[var(--fog)]">Time window</span><select className={field} name="window" required><option value="48h">After 48 hours</option><option value="7d">After 7 days</option></select></label>
    {(["views", "likes", "comments", "shares", "saves", "clicks", "follows"] as const).map((name) => <label className="text-sm" key={name}><span className="mb-2 block capitalize text-[var(--fog)]">{name}</span><input className={field} min="0" name={name} required={["views", "likes", "comments", "shares"].includes(name)} step="1" type="number" /></label>)}
    <div className="flex items-center gap-4 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : "Save results"}</Button><p aria-live="polite" className={`text-sm ${error ? "text-[var(--destructive)]" : "text-[var(--fog)]"}`} role={error ? "alert" : "status"}>{error || message}</p></div>
  </form>;
}
