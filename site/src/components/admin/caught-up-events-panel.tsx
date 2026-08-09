"use client";

import { useMemo, useState } from "react";
import type { MagazineEvent } from "@/lib/caught-up-events-store";

/**
 * The Akce manager: the one manual content category in DNESKAi.
 *
 * Everything else in the magazine arrives through a delivery contract; these
 * the owner types. The panel's job is therefore to make the two irreversible
 * things obvious: that a past event cannot be edited without saying it is a
 * correction, and that archiving removes an event from the reader.
 */
export interface EventsPanelProps {
  events: MagazineEvent[];
  /** The publishing day, passed in so upcoming and past never depend on a clock. */
  today: string;
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

export function CaughtUpEventsPanel({ events, today, engine }: EventsPanelProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [scopeFilter, setScopeFilter] = useState<"all" | "cz" | "global">("all");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const filtered = events.filter((event) => scopeFilter === "all" || event.scope === scopeFilter);
    return {
      upcoming: filtered.filter((event) => !isPast(event, today)).sort((a, b) => a.starts.localeCompare(b.starts)),
      past: filtered.filter((event) => isPast(event, today)).sort((a, b) => b.starts.localeCompare(a.starts)),
    };
  }, [events, scopeFilter, today]);

  const submit = async (options: { archive?: boolean; correction?: boolean } = {}) => {
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
      setStatus(response.ok ? `Saved: ${body.action}.` : (body.error ?? "The event was not saved."));
      if (response.ok && !options.archive) setDraft(EMPTY);
    } catch {
      setStatus("The event was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Draft, label: string, type = "text") => (
    <label className="grid gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">
      {label}
      <input
        className="rounded-[7px] border border-[#3f3f46] bg-[#0d0d10] px-2 py-1.5 font-sans text-[13px] normal-case tracking-normal text-[#f4f4f5]"
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        type={type}
        value={String(draft[key] ?? "")}
      />
    </label>
  );

  const row = (event: MagazineEvent, muted: boolean) => (
    <li
      className={`grid gap-1 border-b border-[#26262b] py-2 ${muted ? "text-[#71717a]" : "text-[#d4d4d8]"}`}
      key={event.id}
    >
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] tabular-nums">{event.starts}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">
          {event.scope === "cz" ? "Česko" : "Svět"}
        </span>
        <span className="text-[13px]">{event.title}</span>
        {event.corrected ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#f5a524]">
            corrected {event.corrected}
          </span>
        ) : null}
      </span>
      <button
        className="justify-self-start font-mono text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa] underline"
        onClick={() =>
          setDraft({
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
          })
        }
        type="button"
      >
        Load into the form
      </button>
    </li>
  );

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">DNESKAi engine</h3>
        {/* Each empty row names the thing that has not happened yet. "None on record" read the
            same whether a step had never run or had run and found nothing. */}
        <dl className="grid gap-1 font-mono text-[11px] text-[#d4d4d8] sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-[#71717a]">Last edition</dt>
            <dd>
              {engine.lastEdition
                ? `${engine.lastEdition.date}${engine.lastEdition.slug ? ` · ${engine.lastEdition.slug}` : ""}`
                : "no edition published yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#71717a]">Last stream sync</dt>
            <dd>
              {engine.lastStreamSync
                ? `${engine.lastStreamSync.date} · ${engine.lastStreamSync.stream} (+${engine.lastStreamSync.added})`
                : "no sync has run yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#71717a]">Last dataset append</dt>
            <dd>
              {engine.lastDatasetAppend
                ? `${engine.lastDatasetAppend.date} · ${engine.lastDatasetAppend.dataset}`
                : "nothing appended yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#71717a]">Upcoming events</dt>
            <dd>
              Czech {events.filter((e) => e.scope === "cz" && !isPast(e, today)).length} · world{" "}
              {events.filter((e) => e.scope === "global" && !isPast(e, today)).length}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">Akce</h3>
          <select
            className="rounded-[7px] border border-[#3f3f46] bg-[#0d0d10] px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8]"
            onChange={(e) => setScopeFilter(e.target.value as "all" | "cz" | "global")}
            value={scopeFilter}
          >
            <option value="all">all</option>
            <option value="cz">česko</option>
            <option value="global">svět</option>
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">Upcoming ({upcoming.length})</p>
            <ul className="mt-1">{upcoming.map((event) => row(event, false))}</ul>
            {upcoming.length === 0 ? <p className="py-2 text-[13px] text-[#71717a]">Nothing upcoming.</p> : null}
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">Past ({past.length})</p>
            <ul className="mt-1">{past.map((event) => row(event, true))}</ul>
            {past.length === 0 ? <p className="py-2 text-[13px] text-[#71717a]">Nothing past.</p> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">Add or edit</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {field("id", "id (slug)")}
          <label className="grid gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">
            scope
            <select
              className="rounded-[7px] border border-[#3f3f46] bg-[#0d0d10] px-2 py-1.5 font-sans text-[13px] normal-case tracking-normal text-[#f4f4f5]"
              onChange={(e) => setDraft({ ...draft, scope: e.target.value as Draft["scope"] })}
              value={draft.scope}
            >
              <option value="cz">cz</option>
              <option value="global">global</option>
            </select>
          </label>
          {field("title", "title (czech)")}
          {field("url", "url (https)")}
          {field("starts", "starts", "date")}
          {field("ends", "ends (optional)", "date")}
          {field("city", "city")}
          {field("venue", "venue")}
          {field("price", "price")}
          {field("organizer", "organizer")}
          {field("description", "description (max 280)")}
          <label className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">
            <input checked={draft.online} onChange={(e) => setDraft({ ...draft, online: e.target.checked })} type="checkbox" />
            online
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8] disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit()}
            type="button"
          >
            Save
          </button>
          {/* A past event is a record of something that happened. Changing one
              has to be stated as a correction rather than done silently. */}
          <button
            className="rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#f5a524] disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit({ correction: true })}
            type="button"
          >
            Save as correction
          </button>
          <button
            className="rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#f87171] disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit({ archive: true })}
            type="button"
          >
            Archive
          </button>
          {status ? <span className="font-mono text-[11px] text-[#d4d4d8]">{status}</span> : null}
        </div>
      </section>
    </div>
  );
}
