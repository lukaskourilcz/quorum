"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge
} from "./admin-primitives";
import type { AdminVentureSwitch } from "@/lib/admin-venture-settings";

/**
 * The owner's project switches. One switch per project, one plain consequence: paused means no
 * meetings, no agents, no engine work, and the project leaves the public site until it is
 * resumed. The archive stays readable in the admin either way.
 */
export function VenturePauseSwitches({ initialVentures }: { initialVentures: AdminVentureSwitch[] }) {
  const writesEnabled = useAdminWritesEnabled();
  const [ventures, setVentures] = useState(initialVentures);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setPaused(ventureId: string, paused: boolean): Promise<void> {
    if (!writesEnabled) return;
    setPending(ventureId);
    setMessage("Saving…");
    setError("");
    try {
      const response = await fetch("/admin/api/settings/ventures", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventureId, paused })
      });
      const result = await response.json() as { error?: string; settings?: { ventures: AdminVentureSwitch[] } };
      if (!response.ok) throw new Error(result.error ?? `Save failed with ${response.status}.`);
      if (result.settings) setVentures(result.settings.ventures);
      const name = ventures.find((venture) => venture.id === ventureId)?.name ?? ventureId;
      setMessage(paused
        ? `${name} is paused. Its meetings stop and it leaves the public site with the next deploy.`
        : `${name} is running again from its next scheduled meeting.`);
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The switch was not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminSectionHeading
          actions={<AdminStatusBadge tone="warning">Applies from the next run</AdminStatusBadge>}
          description="Pause a project and its meetings stop, its agents stand down, and it leaves the public site. Everything it made stays saved here."
          title="Projects on and off"
        />
      </AdminCardHeader>
      <AdminCardContent className="grid gap-4">
        <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
          {ventures.map((venture) => (
            <article className="flex min-w-0 items-center justify-between gap-4 py-3" key={venture.id}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="m-0 text-[length:var(--admin-type-body)] font-semibold">{venture.name}</p>
                <AdminStatusBadge tone={venture.paused ? "neutral" : "success"}>{venture.paused ? "Paused" : "Running"}</AdminStatusBadge>
              </div>
              <AdminButton
                aria-checked={!venture.paused}
                aria-label={`${venture.paused ? "Resume" : "Pause"} ${venture.name}`}
                className="shrink-0 px-4"
                disabled={!writesEnabled || pending !== null}
                onClick={() => setPaused(venture.id, !venture.paused)}
                role="switch"
                variant={venture.paused ? "primary" : "secondary"}
              >
                {venture.paused ? "Resume" : "Pause"}
              </AdminButton>
            </article>
          ))}
        </div>
        {error || message ? (
          <div aria-live="polite" role={error ? "alert" : "status"}>
            {error ? (
              <AdminStateMessage state="error" title={error} />
            ) : (
              <AdminStateMessage state={pending ? "loading" : "success"} title={message} />
            )}
          </div>
        ) : null}
        <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">
          The Design Lab, GoVIRAL and FightAIQ keep the other projects running, so they have no switch here.
        </p>
      </AdminCardContent>
    </AdminCard>
  );
}
