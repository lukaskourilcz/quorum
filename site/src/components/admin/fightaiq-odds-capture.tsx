"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
} from "./admin-primitives";

export function FightAiQOddsCapture({ events }: { events: Array<{ id: string; name: string }> }) {
  const writesEnabled = useAdminWritesEnabled();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    if (!writesEnabled) return;
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

  if (!events.length) return <AdminStateMessage state="held" title="Add a verified event card before entering market prices." />;
  return <form action={submit} className="grid gap-4 sm:grid-cols-2"><fieldset className="contents" disabled={!writesEnabled}>
    <div><AdminLabel htmlFor="fightaiq-odds-event">Event</AdminLabel><AdminSelect id="fightaiq-odds-event" name="eventRef" required>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</AdminSelect></div>
    <div><AdminLabel htmlFor="fightaiq-odds-bout">Fight ID</AdminLabel><AdminInput id="fightaiq-odds-bout" maxLength={160} name="boutRef" required /></div>
    <div><AdminLabel htmlFor="fightaiq-odds-red">Red-corner price (for example 1.80)</AdminLabel><AdminInput id="fightaiq-odds-red" min="1.01" name="redOdds" required step="0.001" type="number" /></div>
    <div><AdminLabel htmlFor="fightaiq-odds-blue">Blue-corner price (for example 2.10)</AdminLabel><AdminInput id="fightaiq-odds-blue" min="1.01" name="blueOdds" required step="0.001" type="number" /></div>
    <div className="sm:col-span-2"><AdminLabel htmlFor="fightaiq-odds-source">Where you saw these prices</AdminLabel><AdminInput id="fightaiq-odds-source" maxLength={240} name="sourceLabel" placeholder="Owner capture, date and source name" required /></div>
    <div className="flex items-center gap-4 sm:col-span-2"><Button disabled={pending || !writesEnabled} type="submit">{pending ? "Saving…" : "Save price snapshot"}</Button><p aria-live="polite" className={`text-sm ${error ? "text-[var(--admin-destructive)]" : "text-[var(--admin-foreground-muted)]"}`} role={error ? "alert" : "status"}>{error || message}</p></div>
  </fieldset>
  </form>;
}
