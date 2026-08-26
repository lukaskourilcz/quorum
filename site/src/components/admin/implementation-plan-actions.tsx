"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminButton } from "./admin-primitives";

type ActionState = { kind: "idle" | "working" | "success" | "error"; message: string };

export function ImplementationRefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ kind: "idle", message: "" });

  async function requestRefresh() {
    setState({ kind: "working", message: "Recording refresh request…" });
    try {
      const response = await fetch("/admin/api/implementation-plans/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "The refresh request was not recorded.");
      }
      setState({ kind: "success", message: "Refresh requested. The next orchestrator checkpoint will update this view." });
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
      <p aria-live="polite" className="m-0 max-w-xs text-right text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]" role="status">
        {state.message}
      </p>
    </div>
  );
}

export function ImplementationCopyButton({ label = "Copy action", value }: { label?: string; value: string }) {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Copy failed. Select the text manually.");
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <AdminButton onClick={copy} variant="secondary">{label}</AdminButton>
      <span aria-live="polite" className="text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]" role="status">{message}</span>
    </div>
  );
}

export function ImplementationCopyLinkButton() {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy failed. Use the browser address bar.");
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <AdminButton onClick={copy} variant="secondary">Copy link</AdminButton>
      <span aria-live="polite" className="text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]" role="status">{message}</span>
    </div>
  );
}
