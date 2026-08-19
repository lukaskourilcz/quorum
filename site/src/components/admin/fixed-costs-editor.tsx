"use client";

import { useState } from "react";
import { CircleDollarSign, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  fixedCostCategories,
  type FixedCostCategory,
  type FixedCostEntry
} from "@/lib/fixed-cost-model";
import { formatUsd } from "@/lib/utils";

interface EditableCost extends FixedCostEntry {
  rowId: string;
}

function row(entry: FixedCostEntry, index: number): EditableCost {
  return { ...entry, rowId: `saved-${index}` };
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function categoryLabel(category: FixedCostCategory): string {
  const labels: Record<FixedCostCategory, string> = {
    hosting: "Hosting",
    database: "Database",
    domain: "Domain",
    software: "Other software",
    email: "Email",
    other: "Other"
  };
  return labels[category];
}

export function FixedCostsEditor({ initialCosts }: { initialCosts: FixedCostEntry[] }) {
  const writesEnabled = useAdminWritesEnabled();
  const [costs, setCosts] = useState<EditableCost[]>(() => initialCosts.map(row));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const monthlyTotal = costs.reduce((sum, cost) => sum + (Number.isFinite(cost.monthlyUsd) ? cost.monthlyUsd : 0), 0);

  function update(rowId: string, change: Partial<FixedCostEntry>) {
    if (!writesEnabled) return;
    setCosts((current) => current.map((cost) => cost.rowId === rowId ? { ...cost, ...change } : cost));
    setMessage("");
  }

  function add() {
    if (!writesEnabled) return;
    setCosts((current) => [...current, {
      rowId: `new-${Date.now()}`,
      name: "",
      monthlyUsd: 0,
      category: "software",
      since: today()
    }]);
    setMessage("");
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writesEnabled) return;
    setPending(true);
    setMessage("Saving…");
    setError("");
    try {
      const payload = costs.map((cost) => ({
        name: cost.name,
        monthlyUsd: cost.monthlyUsd,
        category: cost.category,
        since: cost.since
      }));
      const response = await fetch("/admin/api/fixed-costs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs: payload })
      });
      const result = await response.json() as { error?: string; snapshot?: { costs: FixedCostEntry[] } };
      if (!response.ok || !result.snapshot) throw new Error(result.error ?? `Save failed with ${response.status}.`);
      setCosts(result.snapshot.costs.map(row));
      setMessage("Fixed monthly costs saved. The next daily check will include them on Money.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The fixed costs were not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="fixed-costs-heading" className="min-w-0">
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-3">
            <CircleDollarSign aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Money</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]" id="fixed-costs-heading">Fixed monthly costs</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fog)]">Add only subscriptions and services you actually pay for. AI usage is counted separately from meeting receipts.</p>
            </div>
          </div>
          <Badge tone={costs.length ? "warning" : "neutral"}>{formatUsd(monthlyTotal)} each month</Badge>
        </div>

        <form className="mt-7" onSubmit={save}><fieldset disabled={!writesEnabled}>
          {costs.length ? (
            <div className="grid gap-4">
              {costs.map((cost, index) => (
                <fieldset className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={cost.rowId}>
                  <legend className="px-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Cost {index + 1}</legend>
                  <div className="grid gap-4 md:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,0.7fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_auto] md:items-end">
                    <div>
                      <label className="text-sm font-semibold" htmlFor={`fixed-cost-name-${cost.rowId}`}>Name</label>
                      <input className="mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] px-3" id={`fixed-cost-name-${cost.rowId}`} maxLength={120} onChange={(event) => update(cost.rowId, { name: event.target.value })} required type="text" value={cost.name} />
                    </div>
                    <div>
                      <label className="text-sm font-semibold" htmlFor={`fixed-cost-amount-${cost.rowId}`}>Monthly USD</label>
                      <input className="mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] px-3 tabular-nums" id={`fixed-cost-amount-${cost.rowId}`} min="0.0001" onChange={(event) => update(cost.rowId, { monthlyUsd: event.target.valueAsNumber })} required step="0.0001" type="number" value={Number.isNaN(cost.monthlyUsd) ? "" : cost.monthlyUsd} />
                    </div>
                    <div>
                      <label className="text-sm font-semibold" htmlFor={`fixed-cost-category-${cost.rowId}`}>Category</label>
                      <select className="mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] px-3" id={`fixed-cost-category-${cost.rowId}`} onChange={(event) => update(cost.rowId, { category: event.target.value as FixedCostCategory })} value={cost.category}>
                        {fixedCostCategories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold" htmlFor={`fixed-cost-since-${cost.rowId}`}>Paid since</label>
                      <input className="mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] px-3" id={`fixed-cost-since-${cost.rowId}`} onChange={(event) => update(cost.rowId, { since: event.target.value })} required type="date" value={cost.since} />
                    </div>
                    <Button aria-label={`Remove ${cost.name || `cost ${index + 1}`}`} disabled={pending || !writesEnabled} onClick={() => setCosts((current) => current.filter((entry) => entry.rowId !== cost.rowId))} size="small" type="button" variant="ghost">
                      <Trash2 aria-hidden="true" className="size-4" />
                      <span className="md:sr-only">Remove</span>
                    </Button>
                  </div>
                </fieldset>
              ))}
            </div>
          ) : (
            <Callout>No fixed costs are saved. Money shows $0 for this part and explains that no real amount has been entered.</Callout>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button disabled={pending || !writesEnabled} onClick={add} type="button" variant="secondary"><Plus aria-hidden="true" className="size-4" />Add cost</Button>
            <Button disabled={pending || !writesEnabled} type="submit"><Save aria-hidden="true" className="size-4" />{pending ? "Saving…" : "Save fixed costs"}</Button>
          </div>
        </fieldset></form>
        <div aria-live="polite" className="mt-4 min-h-6 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--destructive)]">{error} Reload the page before trying again if another edit was saved.</span> : <span className="text-[var(--fog)]">{message}</span>}</div>
      </div>
    </section>
  );
}
