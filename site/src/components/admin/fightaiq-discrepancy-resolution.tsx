"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from "./admin-primitives";

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
    <div>
      <AdminLabel htmlFor={`${fighterRef}-${field}-source`}>Value to keep</AdminLabel>
      <AdminSelect defaultValue="" id={`${fighterRef}-${field}-source`} name="selectedSourceRef" required>
        <option disabled value="">Choose a cited value</option>
        {values.map((value) => <option key={value.sourceRef} value={value.sourceRef}>{value.displayValue} · {value.sourceRef}</option>)}
      </AdminSelect>
    </div>
    <div>
      <AdminLabel htmlFor={`${fighterRef}-${field}-reason`}>Why this source wins</AdminLabel>
      <AdminTextarea id={`${fighterRef}-${field}-reason`} maxLength={280} name="reason" required />
    </div>
    <div><Button disabled={busy || !writesEnabled} type="submit">{busy ? "Saving…" : "Resolve disagreement"}</Button></div>
    </fieldset>
    {message ? <p aria-live="polite" className="text-sm text-[var(--admin-foreground-muted)]">{message}</p> : null}
  </form>;
}
