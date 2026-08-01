"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminAgentControl } from "@/lib/agent-control-model";

export function AgentSwitches({
  ventureId,
  initialAgents
}: {
  ventureId: string;
  initialAgents: AdminAgentControl[];
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setEnabled(agentId: string, enabled: boolean): Promise<void> {
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
    <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-7" aria-labelledby="agent-switches-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Meeting controls</p>
          <h3 className="mt-2 text-2xl font-semibold" id="agent-switches-heading">Choose who joins new work</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fog)]">
            Turn optional roles off to keep meetings focused and avoid their model calls. Locked roles protect article quality, delivery or safety.
          </p>
        </div>
        <Badge tone="warning">Changes apply to future runs</Badge>
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {agents.map((agent) => (
          <article className="flex min-w-0 items-start justify-between gap-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={agent.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold">{agent.id}</span>
                <Badge tone={agent.enabled ? "success" : "neutral"}>{agent.enabled ? "On" : "Off"}</Badge>
                {agent.locked ? <LockKeyhole aria-label="Locked on" className="size-3.5 text-[var(--fog)]" /> : null}
              </div>
              <p className="mt-2 text-sm font-semibold">{agent.title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--fog)]">{agent.mission}</p>
              <p className="mt-2 font-mono text-[0.625rem] leading-5 text-[var(--fog)]">{agent.model} · {agent.estimatedCost}</p>
            </div>
            <Button
              aria-checked={agent.enabled}
              aria-label={agent.locked
                ? `${agent.id} is required for this project`
                : `${agent.enabled ? "Turn off" : "Turn on"} ${agent.id} for this project`
              }
              className="shrink-0 px-4"
              disabled={agent.locked || pending !== null}
              onClick={() => setEnabled(agent.id, !agent.enabled)}
              role="switch"
              size="small"
              variant={agent.enabled ? "secondary" : "accent"}
            >
              {agent.locked ? "Required" : agent.enabled ? "Turn off" : "Turn on"}
            </Button>
          </article>
        ))}
      </div>
      <div aria-live="polite" className="mt-4 min-h-5 text-sm" role={error ? "alert" : "status"}>
        {error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}
      </div>
      {ventureId === "caught-up" ? (
        <p className="mt-2 text-xs leading-5 text-[var(--fog)]">
          Caught Up social drafts run only when THREADS, INSTAGRAM and FRAME are all on. Article writing, Czech editing, the hero image and delivery stay separate.
        </p>
      ) : null}
    </section>
  );
}
