"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { AdminButton, AdminCallout, AdminLabel, AdminSelect, AdminTextarea } from "./admin-primitives";

interface ActionOption {
  value: string;
  label: string;
  type: string;
  connectionId: string | null;
}

export function SocialProfileLifecycleActions({
  profileId,
  lifecycle,
  connections
}: {
  profileId: string;
  lifecycle: string;
  connections: readonly { id: string; platform: string; currentState: string }[];
}) {
  const router = useRouter(); const writesEnabled = useAdminWritesEnabled();
  const options = useMemo(() => {
    const result: ActionOption[] = [];
    if (!["retired", "rejected"].includes(lifecycle)) result.push({ value: "request-setup", label: "Request manual setup", type: "request-setup", connectionId: null });
    if (!["paused", "retired", "rejected"].includes(lifecycle)) result.push({ value: "pause-profile", label: "Pause profile", type: "pause-profile", connectionId: null });
    if (lifecycle !== "active" && lifecycle !== "retired") result.push({ value: "retire-profile", label: "Retire internal profile", type: "retire-profile", connectionId: null });
    if (lifecycle !== "active" && lifecycle !== "rejected") result.push({ value: "reject-profile", label: "Reject internal profile", type: "reject-profile", connectionId: null });
    for (const connection of connections) {
      if (connection.currentState !== "paused") result.push({ value: `pause-connection:${connection.id}`, label: `Pause ${connection.platform} connection`, type: "pause-connection", connectionId: connection.id });
      if (connection.currentState !== "disconnected") result.push({ value: `disconnect-connection:${connection.id}`, label: `Disconnect ${connection.platform} binding`, type: "disconnect-connection", connectionId: connection.id });
      result.push({ value: `request-reauthorisation:${connection.id}`, label: `Request ${connection.platform} reauthorisation`, type: "request-reauthorisation", connectionId: connection.id });
    }
    return result;
  }, [connections, lifecycle]);
  const [selection, setSelection] = useState(options[0]?.value ?? ""); const [reason, setReason] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const selected = options.find(({ value }) => value === selection) ?? null;

  const submit = async () => {
    if (!selected || reason.trim().length < 5) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/admin/api/social-profiles/actions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: selected.type, profileId, connectionId: selected.connectionId, reason: reason.trim() }) });
      const body = await response.json() as { error?: string; changed?: boolean };
      if (!response.ok) throw new Error(body.error ?? "The lifecycle action was not saved.");
      setMessage(body.changed ? "Lifecycle evidence saved." : "This lifecycle evidence was already recorded."); setReason(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The lifecycle action was not saved."); }
    finally { setPending(false); }
  };

  return (
    <div className="grid gap-3" data-social-profile-safe-actions>
      <AdminCallout tone="information">These controls append internal lifecycle evidence. They cannot create an account, complete OAuth, install a token, broaden scopes, activate publishing, engage with a user or purchase a provider.</AdminCallout>
      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)_auto] lg:items-end">
        <div><AdminLabel htmlFor={`social-action-${profileId}`}>Lifecycle action</AdminLabel><AdminSelect disabled={!writesEnabled || pending || options.length === 0} id={`social-action-${profileId}`} onChange={(event) => setSelection(event.target.value)} value={selection}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</AdminSelect></div>
        <div><AdminLabel htmlFor={`social-reason-${profileId}`}>Owner reason</AdminLabel><AdminTextarea className="min-h-[var(--admin-touch-target)] lg:min-h-[var(--admin-control-height)]" disabled={!writesEnabled || pending} id={`social-reason-${profileId}`} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why should this lifecycle state change?" value={reason} /></div>
        <AdminButton disabled={!writesEnabled || pending || !selected || reason.trim().length < 5} onClick={submit} variant={selected?.type.includes("pause") || selected?.type.includes("disconnect") || selected?.type.includes("reject") || selected?.type.includes("retire") ? "destructive" : "secondary"}>{pending ? "Saving…" : "Record action"}</AdminButton>
      </div>
      {!writesEnabled ? <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-warning)]">Canonical GitHub writing is not configured for this deployment.</p> : null}
      {message ? <p aria-live="polite" className="m-0 text-[length:var(--admin-type-control)]" role="status">{message}</p> : null}
    </div>
  );
}
