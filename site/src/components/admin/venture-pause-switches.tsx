"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "./admin-primitives";
import type { AdminVentureSettings } from "@/lib/admin-venture-settings";

/**
 * The owner's project switches, in two lists (`operations-2026-09b`).
 *
 * Running projects each carry a Pause switch. A paused project leaves the workspace navigation,
 * the Design Lab and the schedule, so this page is the one place it is still listed: the "Paused
 * ventures" table, with the day it stopped, the last day one of its rooms met and a Resume switch.
 * Its archive stays readable at its own address.
 */
export function VenturePauseSwitches({ initialSettings }: { initialSettings: AdminVentureSettings }) {
  const writesEnabled = useAdminWritesEnabled();
  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setPaused(ventureId: string, name: string, paused: boolean): Promise<void> {
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
      const result = await response.json() as { error?: string; settings?: AdminVentureSettings };
      if (!response.ok) throw new Error(result.error ?? `Save failed with ${response.status}.`);
      if (result.settings) setSettings(result.settings);
      setMessage(paused
        ? `${name} is paused. Its meetings stop now; it leaves the navigation, the Design Lab and the schedule with the next deploy.`
        : `${name} is running again. Its slots return to the schedule once the site is deployed.`);
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The switch was not saved.");
    } finally {
      setPending(null);
    }
  }

  const status = error || message ? (
    <div aria-live="polite" role={error ? "alert" : "status"}>
      {error ? (
        <AdminStateMessage state="error" title={error} />
      ) : (
        <AdminStateMessage state={pending ? "loading" : "success"} title={message} />
      )}
    </div>
  ) : null;

  return (
    <div className="grid min-w-0 gap-4">
      <AdminCard data-admin-running-ventures>
        <AdminCardHeader>
          <AdminSectionHeading
            actions={<AdminStatusBadge tone="warning">Applies from the next run</AdminStatusBadge>}
            description="Pause a project and its meetings stop, its agents stand down, and it leaves the navigation, the Design Lab and the public site. Everything it made stays saved."
            title="Running projects"
          />
        </AdminCardHeader>
        <AdminCardContent className="grid gap-4">
          {settings.ventures.length === 0 ? (
            <AdminStateMessage state="initial-empty" title="No running project can be paused from here." />
          ) : (
            <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
              {settings.ventures.map((venture) => (
                <article className="flex min-w-0 items-center justify-between gap-4 py-3" key={venture.id}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="m-0 text-[length:var(--admin-type-body)] font-semibold">{venture.name}</p>
                    <AdminStatusBadge tone="success">Running</AdminStatusBadge>
                  </div>
                  <AdminButton
                    aria-checked
                    aria-label={`Pause ${venture.name}`}
                    className="shrink-0 px-4"
                    disabled={!writesEnabled || pending !== null}
                    onClick={() => setPaused(venture.id, venture.name, true)}
                    role="switch"
                    variant="secondary"
                  >
                    Pause
                  </AdminButton>
                </article>
              ))}
            </div>
          )}
          <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">
            The Design Lab and GoVIRAL keep the running projects going, so they have no switch here.
          </p>
        </AdminCardContent>
      </AdminCard>

      <AdminCard data-admin-paused-ventures>
        <AdminCardHeader>
          <AdminSectionHeading
            description="Paused projects are listed only here. Their archives stay at their own addresses, and Resume puts one back on the schedule."
            title="Paused ventures"
          />
        </AdminCardHeader>
        <AdminCardContent className="grid gap-4">
          {settings.paused.length === 0 ? (
            <AdminStateMessage state="initial-empty" title="Nothing is paused." />
          ) : (
            <AdminTableRegion label="Paused ventures">
              <AdminTable className="min-w-[560px]">
                <thead>
                  <tr>
                    <AdminTableHead scope="col">Venture</AdminTableHead>
                    <AdminTableHead scope="col">Paused since</AdminTableHead>
                    <AdminTableHead scope="col">Last meeting</AdminTableHead>
                    <AdminTableHead className="text-right" scope="col">Switch</AdminTableHead>
                  </tr>
                </thead>
                <tbody>
                  {settings.paused.map((venture) => (
                    <tr data-paused-venture={venture.id} key={venture.id}>
                      <AdminTableCell>
                        <Link className="admin-focus-ring font-semibold text-[var(--admin-link)]" href={`/admin?venture=${venture.id}`}>
                          {venture.name}
                        </Link>
                      </AdminTableCell>
                      <AdminTableCell className="admin-tabular">{venture.pausedOn ?? "Not recorded"}</AdminTableCell>
                      <AdminTableCell className="admin-tabular">{venture.lastMeetingOn ?? "Never met"}</AdminTableCell>
                      <AdminTableCell className="text-right">
                        {venture.resumable ? (
                          <AdminButton
                            aria-checked={false}
                            aria-label={`Resume ${venture.name}`}
                            className="px-4"
                            disabled={!writesEnabled || pending !== null}
                            onClick={() => setPaused(venture.id, venture.name, false)}
                            role="switch"
                            variant="primary"
                          >
                            Resume
                          </AdminButton>
                        ) : (
                          <span className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
                            {venture.note ?? "Resumes with the project it serves"}
                          </span>
                        )}
                      </AdminTableCell>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminTableRegion>
          )}
        </AdminCardContent>
      </AdminCard>
      {status}
    </div>
  );
}
