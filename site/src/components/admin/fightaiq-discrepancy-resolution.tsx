"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";

export function FightAiQDiscrepancyResolution({ fighterRef, field, values }: {
  fighterRef: string;
  field: string;
  values: Array<{ sourceRef: string; displayValue: string }>;
}) {
  const writesEnabled = useAdminWritesEnabled();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    if (!writesEnabled) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/admin/api/fightaiq/discrepancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fighterRef,
          field,
          selectedSourceRef: formData.get("selectedSourceRef"),
          reason: formData.get("reason")
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The review could not be saved.");
      setMessage("Saved. A lone source stays provisional; two matching sources can restore model use.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review could not be saved.");
    } finally { setBusy(false); }
  }

  return <form action={submit} className="mt-5 grid gap-4"><fieldset className="contents" disabled={!writesEnabled}>
    <label className="grid gap-2 text-sm font-semibold" htmlFor={`${fighterRef}-${field}-source`}>
      Value to keep
      <select className="min-h-11 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" defaultValue="" id={`${fighterRef}-${field}-source`} name="selectedSourceRef" required>
        <option disabled value="">Choose a cited value</option>
        {values.map((value) => <option key={value.sourceRef} value={value.sourceRef}>{value.displayValue} · {value.sourceRef}</option>)}
      </select>
    </label>
    <label className="grid gap-2 text-sm font-semibold" htmlFor={`${fighterRef}-${field}-reason`}>
      Why this source wins
      <textarea className="min-h-24 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" id={`${fighterRef}-${field}-reason`} maxLength={280} name="reason" required />
    </label>
    <div><Button disabled={busy || !writesEnabled} type="submit">{busy ? "Saving…" : "Resolve disagreement"}</Button></div>
    </fieldset>
    {message ? <p aria-live="polite" className="text-sm text-[var(--fog)]">{message}</p> : null}
  </form>;
}
