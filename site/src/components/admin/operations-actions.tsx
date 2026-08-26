"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminButton } from "./admin-primitives";

export function OperationsCopyDiagnostics({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <AdminButton
      aria-live="polite"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopyState("copied");
          window.setTimeout(() => setCopyState("idle"), 2_000);
        }).catch(() => setCopyState("failed"));
      }}
      variant="secondary"
    >
      {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy diagnostics"}
    </AdminButton>
  );
}

export function OperationsRefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<{ kind: "idle" | "working" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  async function requestRefresh() {
    setState({ kind: "working", message: "Recording refresh request…" });
    try {
      const response = await fetch("/admin/api/operations/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The refresh request was not recorded.");
      setState({ kind: "success", message: "Refresh requested for the next orchestrator checkpoint." });
      router.refresh();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "The refresh request was not recorded." });
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <AdminButton disabled={state.kind === "working"} onClick={requestRefresh} variant="primary">
        {state.kind === "working" ? "Requesting…" : "Request refresh"}
      </AdminButton>
      <p aria-live="polite" className="m-0 max-w-xs text-right text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]" role="status">{state.message}</p>
    </div>
  );
}
