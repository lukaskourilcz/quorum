"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SocialCampaignRecord } from "@/lib/social-profiles/campaign-model";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { AdminButton, AdminCallout, AdminInput, AdminLabel, AdminSelect, AdminTextarea } from "./admin-primitives";

interface CampaignActionOption {
  value: string;
  label: string;
  type: "approve-target" | "reject-target" | "correct-item" | "change-window" | "hold" | "cancel";
  targetId: string | null;
  itemId: string | null;
  expectedBindingHash: string | null;
}

export function SocialCampaignActions({ campaign, targetApprovalHashes }: { campaign: SocialCampaignRecord; targetApprovalHashes: Readonly<Record<string, string>> }) {
  const router = useRouter(); const writesEnabled = useAdminWritesEnabled();
  const options = useMemo(() => {
    const result: CampaignActionOption[] = [];
    for (const target of campaign.targets.filter(({ fit }) => fit === "eligible")) {
      const binding = targetApprovalHashes[target.id]; if (!binding) continue;
      if (campaign.status !== "held") result.push({ value: `approve:${target.id}`, label: `Approve exact ${target.role} target`, type: "approve-target", targetId: target.id, itemId: null, expectedBindingHash: binding });
      result.push({ value: `reject:${target.id}`, label: `Reject ${target.role} target`, type: "reject-target", targetId: target.id, itemId: null, expectedBindingHash: binding });
    }
    for (const item of campaign.channelItems.filter(({ status }) => !["published", "cancelled", "expired"].includes(status))) {
      result.push({ value: `correct:${item.id}`, label: `Correct ${item.channel}/${item.locale} copy`, type: "correct-item", targetId: null, itemId: item.id, expectedBindingHash: item.approval.bindingHash });
      result.push({ value: `window:${item.id}`, label: `Change ${item.channel}/${item.locale} window`, type: "change-window", targetId: null, itemId: item.id, expectedBindingHash: item.approval.bindingHash });
    }
    if (campaign.status !== "held") result.push({ value: "hold", label: "Hold whole campaign", type: "hold", targetId: null, itemId: null, expectedBindingHash: null });
    if (campaign.status !== "cancelled") result.push({ value: "cancel", label: "Cancel whole campaign", type: "cancel", targetId: null, itemId: null, expectedBindingHash: null });
    return result;
  }, [campaign, targetApprovalHashes]);
  const [selection, setSelection] = useState(options[0]?.value ?? ""); const selected = options.find(({ value }) => value === selection) ?? null;
  const selectedItem = selected?.itemId ? campaign.channelItems.find(({ id }) => id === selected.itemId) ?? null : null;
  const [reason, setReason] = useState(""); const [copy, setCopy] = useState(""); const [notBefore, setNotBefore] = useState(""); const [notAfter, setNotAfter] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const choose = (value: string) => { setSelection(value); const option = options.find((candidate) => candidate.value === value); const item = option?.itemId ? campaign.channelItems.find((candidate) => candidate.id === option.itemId) : null; setCopy(option?.type === "correct-item" ? item?.copy.text ?? "" : ""); setNotBefore(option?.type === "change-window" ? item?.window.notBefore ?? "" : ""); setNotAfter(option?.type === "change-window" ? item?.window.notAfter ?? "" : ""); setMessage(""); };
  const complete = Boolean(selected && reason.trim().length >= 5 && (selected.type !== "correct-item" || (copy.trim().length >= 1 && copy.trim().length <= 2_200)) && (selected.type !== "change-window" || (notBefore && notAfter && Date.parse(notAfter) > Date.parse(notBefore))));

  const submit = async () => {
    if (!selected || !complete) return; setPending(true); setMessage("");
    const replacement = selected.type === "correct-item" ? { text: copy.trim(), destination: null, altText: null, notBefore: null, notAfter: null }
      : selected.type === "change-window" ? { text: null, destination: null, altText: null, notBefore: new Date(notBefore).toISOString(), notAfter: new Date(notAfter).toISOString() } : null;
    try {
      const response = await fetch("/admin/api/social-profiles/campaign-actions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: selected.type, campaignId: campaign.id, targetId: selected.targetId, itemId: selected.itemId, expectedBindingHash: selected.expectedBindingHash, reason: reason.trim(), replacement }) });
      const body = await response.json() as { error?: string; changed?: boolean }; if (!response.ok) throw new Error(body.error ?? "The campaign action was not saved.");
      setMessage(body.changed ? "Campaign evidence saved." : "This campaign evidence was already recorded."); setReason(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The campaign action was not saved."); }
    finally { setPending(false); }
  };

  return <div className="grid gap-3" data-social-campaign-safe-actions>
    <AdminCallout tone="information">These controls append bounded owner evidence only. They cannot publish, schedule a second queue, contact a person, engage with an account, broaden provider scopes or include Contest Radar.</AdminCallout>
    <div className="grid gap-3 lg:grid-cols-2"><div><AdminLabel htmlFor={`campaign-action-${campaign.id}`}>Campaign action</AdminLabel><AdminSelect disabled={!writesEnabled || pending || options.length === 0} id={`campaign-action-${campaign.id}`} onChange={(event) => choose(event.target.value)} value={selection}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</AdminSelect></div><div><AdminLabel htmlFor={`campaign-reason-${campaign.id}`}>Owner reason</AdminLabel><AdminTextarea disabled={!writesEnabled || pending} id={`campaign-reason-${campaign.id}`} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why should this exact campaign binding change?" value={reason} /></div></div>
    {selected?.type === "correct-item" ? <div><AdminLabel htmlFor={`campaign-copy-${campaign.id}`}>Bounded replacement copy</AdminLabel><AdminTextarea disabled={!writesEnabled || pending} id={`campaign-copy-${campaign.id}`} maxLength={2_200} onChange={(event) => setCopy(event.target.value)} placeholder={selectedItem?.copy.text} value={copy} /></div> : null}
    {selected?.type === "change-window" ? <div className="grid gap-3 sm:grid-cols-2"><div><AdminLabel htmlFor={`campaign-window-start-${campaign.id}`}>Not before (ISO or local date/time)</AdminLabel><AdminInput disabled={!writesEnabled || pending} id={`campaign-window-start-${campaign.id}`} onChange={(event) => setNotBefore(event.target.value)} value={notBefore} /></div><div><AdminLabel htmlFor={`campaign-window-end-${campaign.id}`}>Not after (ISO or local date/time)</AdminLabel><AdminInput disabled={!writesEnabled || pending} id={`campaign-window-end-${campaign.id}`} onChange={(event) => setNotAfter(event.target.value)} value={notAfter} /></div></div> : null}
    <div><AdminButton disabled={!writesEnabled || pending || !complete} onClick={submit} variant={selected && ["reject-target", "hold", "cancel"].includes(selected.type) ? "destructive" : "secondary"}>{pending ? "Saving…" : "Record campaign action"}</AdminButton></div>
    {!writesEnabled ? <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-warning)]">Canonical GitHub writing is not configured for this deployment.</p> : null}
    {message ? <p aria-live="polite" className="m-0 text-[length:var(--admin-type-control)]" role="status">{message}</p> : null}
  </div>;
}
