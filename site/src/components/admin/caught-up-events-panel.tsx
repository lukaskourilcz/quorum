"use client";

import { useMemo, useState } from "react";
import {
  AdminButton,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminSectionHeading,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import type { MagazineEvent } from "@/lib/caught-up-events-store";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";

export interface EventsPanelProps {
  events: MagazineEvent[];
  today: string;
  eventStore?: "missing" | "unreadable" | "present";
  engine: {
    lastEdition?: { date: string; slug: string | null } | null;
    lastStreamSync?: { date: string; stream: string; added: number } | null;
    lastDatasetAppend?: { date: string; dataset: string } | null;
  };
}

interface Draft {
  id: string;
  scope: "cz" | "global";
  title: string;
  description: string;
  starts: string;
  ends: string;
  city: string;
  venue: string;
  online: boolean;
  url: string;
  price: string;
  organizer: string;
}

const EMPTY: Draft = {
  id: "",
  scope: "cz",
  title: "",
  description: "",
  starts: "",
  ends: "",
  city: "",
  venue: "",
  online: false,
  url: "",
  price: "",
  organizer: "",
};

function isPast(event: MagazineEvent, today: string): boolean {
  return (event.ends ?? event.starts) < today;
}

export function CaughtUpEventsPanel({ events, today, engine, eventStore = "present" }: EventsPanelProps) {
  const writesEnabled = useAdminWritesEnabled();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [scopeFilter, setScopeFilter] = useState<"all" | "cz" | "global">("all");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const filtered = events.filter((event) => scopeFilter === "all" || event.scope === scopeFilter);
    return {
      upcoming: filtered.filter((event) => !isPast(event, today)).sort((a, b) => a.starts.localeCompare(b.starts)),
      past: filtered.filter((event) => isPast(event, today)).sort((a, b) => b.starts.localeCompare(a.starts)),
    };
  }, [events, scopeFilter, today]);

  const submit = async (options: { archive?: boolean; correction?: boolean } = {}) => {
    if (!writesEnabled) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/admin/api/caught-up/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          today,
          ...options,
          event: {
            ...draft,
            description: draft.description || undefined,
            ends: draft.ends || undefined,
            city: draft.city || undefined,
            venue: draft.venue || undefined,
            price: draft.price || undefined,
            organizer: draft.organizer || undefined,
          },
        }),
      });
      const body = (await response.json()) as { error?: string; action?: string };
      setStatus({ error: !response.ok, text: response.ok ? `Saved: ${body.action}.` : (body.error ?? "The event was not saved.") });
      if (response.ok && !options.archive) setDraft(EMPTY);
    } catch {
      setStatus({ error: true, text: "The event was not saved." });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Draft, label: string, hint?: string, type = "text") => {
    const id = `caught-up-event-${key}`;
    return (
      <div>
        <AdminLabel htmlFor={id}>{label}</AdminLabel>
        <AdminInput disabled={!writesEnabled} id={id} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} type={type} value={String(draft[key] ?? "")} />
        {hint ? <p className="m-0 mt-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{hint}</p> : null}
      </div>
    );
  };

  const load = (event: MagazineEvent) => setDraft({
    id: event.id,
    scope: event.scope,
    title: event.title,
    description: event.description ?? "",
    starts: event.starts,
    ends: event.ends ?? "",
    city: event.city ?? "",
    venue: event.venue ?? "",
    online: event.online,
    url: event.url,
    price: event.price ?? "",
    organizer: event.organizer ?? "",
  });

  const eventRows = (rows: MagazineEvent[], archived: boolean) => rows.map((event) => (
    <li className="grid gap-2 border-b border-[var(--admin-border)] py-2.5 last:border-b-0" key={event.id}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <time className="admin-tabular text-[length:var(--admin-type-control)]" dateTime={event.starts}>{event.starts}</time>
        <AdminEntityBadge>{event.scope === "cz" ? "Czech" : "World"}</AdminEntityBadge>
        <span className={archived ? "text-[var(--admin-foreground-muted)]" : "font-medium text-[var(--admin-foreground)]"}>{event.title}</span>
        {event.corrected ? <AdminStatusBadge tone="warning">Corrected {event.corrected}</AdminStatusBadge> : null}
      </div>
      <AdminButton className="justify-self-start" onClick={() => load(event)} type="button" variant="ghost">Load into the form</AdminButton>
    </li>
  ));

  const emptyState = scopeFilter === "all" ? "initial-empty" as const : "filtered-empty" as const;

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 border-b border-[var(--admin-border)] pb-4">
        <AdminSectionHeading title="DNESKAi engine" />
        <dl className="grid gap-x-6 gap-y-2 text-[length:var(--admin-type-control)] sm:grid-cols-2">
          <div className="flex min-w-0 justify-between gap-3"><dt className="text-[var(--admin-foreground-muted)]">Last edition</dt><dd className="admin-tabular m-0 break-all text-right">{engine.lastEdition ? `${engine.lastEdition.date}${engine.lastEdition.slug ? ` · ${engine.lastEdition.slug}` : ""}` : "no edition published yet"}</dd></div>
          <div className="flex min-w-0 justify-between gap-3"><dt className="text-[var(--admin-foreground-muted)]">Last stream sync</dt><dd className="admin-tabular m-0 break-all text-right">{engine.lastStreamSync ? `${engine.lastStreamSync.date} · ${engine.lastStreamSync.stream} (+${engine.lastStreamSync.added})` : "no sync has run yet"}</dd></div>
          <div className="flex min-w-0 justify-between gap-3"><dt className="text-[var(--admin-foreground-muted)]">Last dataset append</dt><dd className="admin-tabular m-0 break-all text-right">{engine.lastDatasetAppend ? `${engine.lastDatasetAppend.date} · ${engine.lastDatasetAppend.dataset}` : "nothing appended yet"}</dd></div>
          <div className="flex min-w-0 justify-between gap-3"><dt className="text-[var(--admin-foreground-muted)]">Upcoming events</dt><dd className="admin-tabular m-0 text-right">Czech {events.filter((event) => event.scope === "cz" && !isPast(event, today)).length} · world {events.filter((event) => event.scope === "global" && !isPast(event, today)).length}</dd></div>
        </dl>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <AdminSectionHeading title="Events" />
          <div className="min-w-36"><AdminLabel htmlFor="caught-up-event-filter">Scope</AdminLabel><AdminSelect id="caught-up-event-filter" onChange={(event) => setScopeFilter(event.target.value as "all" | "cz" | "global")} value={scopeFilter}><option value="all">All</option><option value="cz">Czech</option><option value="global">World</option></AdminSelect></div>
        </div>
        {eventStore === "missing" ? (
          <AdminStateMessage
            description={<>Events are the one magazine input nothing fetches. Saving below creates <code>state/ventures/caught-up/events/events.json</code>.</>}
            state="initial-empty"
            title="No event has ever been entered"
          />
        ) : null}
        {eventStore === "unreadable" ? (
          <AdminStateMessage
            description={<>The file is <code>state/ventures/caught-up/events/events.json</code>. Saving this form would replace it.</>}
            state="malformed"
            title="The saved events file cannot be read"
          />
        ) : null}
        <div className="grid gap-5 lg:grid-cols-2">
          <div><p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Upcoming ({upcoming.length})</p>{upcoming.length ? <ul className="m-0 mt-1 list-none p-0">{eventRows(upcoming, false)}</ul> : <AdminStateMessage className="mt-2" state={emptyState} title="Nothing upcoming" />}</div>
          <div><p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Past ({past.length})</p>{past.length ? <ul className="m-0 mt-1 list-none p-0">{eventRows(past, true)}</ul> : <AdminStateMessage className="mt-2" state={emptyState} title="Nothing past" />}</div>
        </div>
      </section>

      <section className="grid gap-3 border-t border-[var(--admin-border)] pt-4">
        <AdminSectionHeading description="Past events require an explicit correction; archiving removes an event from the reader." title="Add or edit" />
        <div className="grid gap-3 sm:grid-cols-2">
          {field("id", "Short name", "Lowercase letters, numbers and hyphens. It never changes.")}
          <div><AdminLabel htmlFor="caught-up-event-scope">Where it counts</AdminLabel><AdminSelect disabled={!writesEnabled} id="caught-up-event-scope" onChange={(event) => setDraft({ ...draft, scope: event.target.value as Draft["scope"] })} value={draft.scope}><option value="cz">Czech</option><option value="global">World</option></AdminSelect></div>
          {field("title", "Title", "Written in Czech — this is what the reader sees.")}
          {field("url", "Link", "Must start with https://")}
          {field("starts", "First day", undefined, "date")}
          {field("ends", "Last day", "Leave empty for a one-day event.", "date")}
          {field("city", "City")}{field("venue", "Venue")}{field("price", "Price")}{field("organizer", "Organiser")}
          {field("description", "Description", "At most 280 characters.")}
          <label className="admin-focus-ring flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius)] px-2 text-[length:var(--admin-type-control)] font-medium"><input checked={draft.online} disabled={!writesEnabled} onChange={(event) => setDraft({ ...draft, online: event.target.checked })} type="checkbox" />Happens online</label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton disabled={busy || !writesEnabled} onClick={() => void submit()} type="button" variant="primary">Save</AdminButton>
          <AdminButton disabled={busy || !writesEnabled} onClick={() => void submit({ correction: true })} type="button" variant="secondary">Save as correction</AdminButton>
          <AdminButton disabled={busy || !writesEnabled} onClick={() => void submit({ archive: true })} type="button" variant="destructive">Archive</AdminButton>
        </div>
        <div aria-live="polite" role={status?.error ? "alert" : "status"}>
          {status ? <AdminStateMessage state={status.error ? "error" : "success"} title={status.text} /> : null}
        </div>
      </section>
    </div>
  );
}
