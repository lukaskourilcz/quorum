"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function FightAiQOddsCapture({ events }: { events: Array<{ id: string; name: string }> }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true); setMessage("Saving prices…"); setError("");
    try {
      const response = await fetch("/admin/api/fightaiq/odds", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData))
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The price capture could not be saved.");
      setMessage(`Saved ${payload.id}. Refresh this page to see it in the source history.`);
    } catch (caught) {
      setMessage(""); setError(caught instanceof Error ? caught.message : "The price capture could not be saved.");
    } finally { setPending(false); }
  }

  if (!events.length) return <p className="text-sm leading-6 text-[var(--fog)]">Add a verified event card before entering market prices.</p>;
  return <form action={submit} className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm"><span className="mb-2 block text-[var(--fog)]">Event</span><select className="min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" name="eventRef" required>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
    <label className="text-sm"><span className="mb-2 block text-[var(--fog)]">Bout reference</span><input className="min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" maxLength={160} name="boutRef" required /></label>
    <label className="text-sm"><span className="mb-2 block text-[var(--fog)]">Red decimal price</span><input className="min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" min="1.01" name="redOdds" required step="0.001" type="number" /></label>
    <label className="text-sm"><span className="mb-2 block text-[var(--fog)]">Blue decimal price</span><input className="min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" min="1.01" name="blueOdds" required step="0.001" type="number" /></label>
    <label className="text-sm sm:col-span-2"><span className="mb-2 block text-[var(--fog)]">Where you saw these prices</span><input className="min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" maxLength={240} name="sourceLabel" placeholder="Owner capture, date and source name" required /></label>
    <div className="flex items-center gap-4 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : "Save price snapshot"}</Button><p aria-live="polite" className={`text-sm ${error ? "text-[var(--destructive)]" : "text-[var(--fog)]"}`} role={error ? "alert" : "status"}>{error || message}</p></div>
  </form>;
}
