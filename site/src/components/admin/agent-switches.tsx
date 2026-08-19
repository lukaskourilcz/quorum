"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import type { AdminAgentControl } from "@/lib/agent-control-model";

export function AgentSwitches({
  ventureId,
  initialAgents
}: {
  ventureId: string;
  initialAgents: AdminAgentControl[];
}) {
  const writesEnabled = useAdminWritesEnabled();
  const [agents, setAgents] = useState(initialAgents);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setEnabled(agentId: string, enabled: boolean): Promise<void> {
    if (!writesEnabled) return;
    setPending(agentId);
    setMessage(`Saving ${agentId}…`);
    setError("");
    try {
      const response = await fetch("/admin/api/agent-controls", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventureId, agentId, enabled })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Save failed with ${response.status}.`);
      setAgents((current) => current.map((agent) => agent.id === agentId ? { ...agent, enabled } : agent));
      setMessage(`${agentId} is now ${enabled ? "on" : "off"}. New meetings will use this setting.`);
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The switch was not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="agent-switches-heading" className="mt-8">
      <AdminCard>
        <AdminCardHeader>
          <AdminSectionHeading
            actions={<AdminStatusBadge tone="warning">Changes apply to future runs</AdminStatusBadge>}
            description="Turn optional roles off to keep meetings focused and avoid their model calls. Locked roles protect article quality, delivery or safety."
            title={<span id="agent-switches-heading">Choose who joins new work</span>}
          />
        </AdminCardHeader>
        <AdminCardContent className="grid gap-4">
          {agents.length ? (
            <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
              {agents.map((agent) => (
              <article className="flex min-w-0 items-start justify-between gap-4 py-3" key={agent.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-[length:var(--admin-type-control)] font-bold">{agent.id}</span>
                    <AdminStatusBadge tone={agent.enabled ? "success" : "neutral"}>{agent.enabled ? "On" : "Off"}</AdminStatusBadge>
                    {agent.locked ? <LockKeyhole aria-label="Locked on" className="size-3.5 text-[var(--admin-foreground-muted)]" /> : null}
                  </div>
                  <p className="mt-2 text-[length:var(--admin-type-body)] font-semibold">{agent.title}</p>
                  <p className="mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{agent.mission}</p>
                  <p className="admin-tabular mt-2 break-all font-mono text-[length:var(--admin-type-micro)] leading-5 text-[var(--admin-foreground-muted)]">{agent.model} · {agent.estimatedCost}</p>
                </div>
                <AdminButton
                  aria-checked={agent.enabled}
                  aria-label={agent.locked
                    ? `${agent.id} is required for this project`
                    : `${agent.enabled ? "Turn off" : "Turn on"} ${agent.id} for this project`
                  }
                  className="shrink-0 px-4"
                  disabled={!writesEnabled || agent.locked || pending !== null}
                  onClick={() => setEnabled(agent.id, !agent.enabled)}
                  role="switch"
                  variant={agent.enabled ? "secondary" : "primary"}
                >
                  {agent.locked ? "Required" : agent.enabled ? "Turn off" : "Turn on"}
                </AdminButton>
              </article>
              ))}
            </div>
          ) : (
            <AdminStateMessage state="initial-empty" title="No meeting controls are recorded for this workspace." />
          )}
          {error || message ? (
            <div aria-live="polite" role={error ? "alert" : "status"}>
              {error ? (
                <AdminStateMessage state="error" title={error} />
              ) : (
                <AdminStateMessage state={pending ? "loading" : "success"} title={message} />
              )}
            </div>
          ) : null}
          {ventureId === "caught-up" ? (
            <p className="text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">
              DNESKAi social drafts run only when Threads, Instagram and image posts are all switched on. Writing the article, editing the Czech, making its picture and delivering it are separate and keep going either way.
            </p>
          ) : null}
        </AdminCardContent>
      </AdminCard>
    </section>
  );
}
