import Link from "next/link";
import {
  AdminCallout,
  AdminEntityBadge,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion,
} from "./admin-primitives";
import type { AdminCard } from "@/lib/admin-portfolio";
import type { MonetizationCatalog } from "@/lib/monetization-options";
import { currentRating } from "@/lib/rating-model";

/** Read-only projections of the owner-curated catalog and append-only idea ledgers. */

const STATUS = {
  ready: { label: "Ready", tone: "success" },
  idea: { label: "Idea", tone: "neutral" },
  blocked: { label: "Blocked", tone: "warning" },
} as const;

const EFFORT: Readonly<Record<string, string>> = {
  low: "little work",
  medium: "some work",
  high: "a lot of work",
};

function usd(value: number): string {
  return value === 0 ? "$0" : `$${value.toFixed(2)}`;
}

function ideaTone(status: string): "neutral" | "information" | "success" | "warning" {
  if (status === "approved" || status === "selected") return "success";
  if (status === "rejected" || status === "duplicate") return "warning";
  if (status === "proposed" || status === "open") return "information";
  return "neutral";
}

export function MonetizationPanel({ catalog }: { catalog: MonetizationCatalog }) {
  if (catalog.state === "missing") {
    return (
      <AdminStateMessage
        description={<>The catalog file <code>config/monetization-options.json</code> is missing or unreadable. Nothing else on this page depends on it.</>}
        state="unavailable"
        title="The earning-options catalog is unavailable"
      />
    );
  }

  return (
    <div className="grid gap-5">
      <p className="m-0 max-w-[75ch] text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground-muted)]">
        Every way this company could bring money in, with what each one needs before it could
        start. Nothing here is switched on and nothing here spends anything — it is a list to
        choose from.
      </p>

      {catalog.byCategory.map((group) => (
        <section className="grid gap-2" key={group.category}>
          <h3 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
            {group.category}
          </h3>
          <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
            {group.options.map((option) => {
              const status = STATUS[option.status] ?? STATUS.idea;
              return (
                <article className="grid gap-2 py-3" key={option.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-foreground)]">{option.name}</span>
                    <AdminStatusBadge tone={status.tone}>{status.label}</AdminStatusBadge>
                    <AdminEntityBadge>{EFFORT[option.effort] ?? option.effort}</AdminEntityBadge>
                  </div>
                  <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{option.description}</p>
                  <div className="admin-tabular flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">
                    <span>Costs {usd(option.upfrontCostUsd)} to start</span>
                    <span>{usd(option.recurringCostUsd)} a month</span>
                    {option.fitFor.length ? <span>fits {option.fitFor.join(", ")}</span> : null}
                  </div>
                  {option.blockers.length ? (
                    <AdminCallout tone="warning">
                      <ul className="m-0 grid list-disc gap-1 pl-4">
                        {option.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                      </ul>
                    </AdminCallout>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="admin-tabular m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">
        {catalog.total} {catalog.total === 1 ? "option" : "options"}
        {catalog.updatedAt ? ` · reviewed ${catalog.updatedAt}` : ""}
        {catalog.dropped > 0 ? ` · ${catalog.dropped} could not be read` : ""}
      </p>
    </div>
  );
}

export interface FutureIdeaRow {
  ventureId: string;
  ventureName: string;
  card: AdminCard;
  originHref: string | null;
}

export function IdeasPanel({ rows, unreadable }: { rows: readonly FutureIdeaRow[]; unreadable: readonly string[] }) {
  return (
    <div className="grid gap-4">
      <p className="m-0 max-w-[75ch] text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground-muted)]">
        Every idea the meetings have produced, across all projects, newest first. An idea marked as
        a duplicate was screened against the ones already on file and stopped there.
      </p>

      {rows.length === 0 ? (
        <AdminStateMessage state="initial-empty" title="No meeting has produced an idea yet" />
      ) : (
        <AdminTableRegion label="Ideas from company meetings">
          <AdminTable className="min-w-[52rem]">
            <thead>
              <tr>
                {["Project", "Idea", "State", "Your rating", "From", "Date"].map((head) => (
                  <AdminTableHead key={head} scope="col">{head}</AdminTableHead>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rating = currentRating(row.card.ratings, row.card.id);
                return (
                  <tr key={`${row.ventureId}-${row.card.id}`}>
                    <AdminTableCell className="align-top text-[var(--admin-foreground-muted)]">{row.ventureName}</AdminTableCell>
                    <AdminTableCell className="align-top">
                      <span className="font-semibold">{row.card.title}</span>
                      <span className="mt-0.5 block max-w-[44ch] text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{row.card.summary}</span>
                    </AdminTableCell>
                    <AdminTableCell className="align-top"><AdminStatusBadge tone={ideaTone(row.card.status)}>{row.card.status}</AdminStatusBadge></AdminTableCell>
                    <AdminTableCell className="admin-tabular align-top">{rating ? rating.rating : <span aria-label="Not rated">—</span>}</AdminTableCell>
                    <AdminTableCell className="align-top">
                      {row.originHref ? <Link className="admin-focus-ring underline underline-offset-2" href={row.originHref}>Meeting</Link> : <span aria-label="No meeting link">—</span>}
                    </AdminTableCell>
                    <AdminTableCell className="admin-tabular align-top">{row.card.updatedAt?.slice(0, 10) ?? "—"}</AdminTableCell>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        </AdminTableRegion>
      )}

      {unreadable.length > 0 ? (
        <AdminStateMessage
          description={unreadable.join(", ")}
          state="malformed"
          title={`${unreadable.length} ${unreadable.length === 1 ? "idea record could" : "idea records could"} not be read`}
        />
      ) : null}

      <p className="admin-tabular m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">
        {rows.length} {rows.length === 1 ? "idea" : "ideas"}
      </p>
    </div>
  );
}
