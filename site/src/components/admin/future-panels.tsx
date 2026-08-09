import Link from "next/link";
import type { AdminCard } from "@/lib/admin-portfolio";
import type { MonetizationCatalog } from "@/lib/monetization-options";
import { currentRating } from "@/lib/rating-model";

/**
 * FUTURE: what the company could earn from, and everything the meetings have thought of.
 *
 * Read-only. The catalog is a file the owner curates and the ideas are ledgers the rooms append
 * to; a control here would be a second writer on both. What this adds is the view neither had —
 * one page where the money question and the idea list sit next to each other.
 */

const STATUS: Readonly<Record<string, { label: string; colour: string }>> = {
  ready: { label: "ready", colour: "#4ade80" },
  idea: { label: "idea", colour: "#94949c" },
  blocked: { label: "blocked", colour: "#f5a524" }
};

const EFFORT: Readonly<Record<string, string>> = {
  low: "little work",
  medium: "some work",
  high: "a lot of work"
};

function usd(value: number): string {
  return value === 0 ? "$0" : `$${value.toFixed(2)}`;
}

export function MonetizationPanel({ catalog }: { catalog: MonetizationCatalog }) {
  if (catalog.state === "missing") {
    return (
      <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#94949c]">
        The catalog file <code className="font-mono text-[11px]">config/monetization-options.json</code>{" "}
        is missing or could not be read, so there is nothing to show. Nothing else on this page
        depends on it.
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <p className="m-0 max-w-[75ch] text-[13px] leading-[1.6] text-[#d4d4d8]">
        Every way this company could bring money in, with what each one needs before it could
        start. Nothing here is switched on and nothing here spends anything — it is a list to
        choose from.
      </p>

      {catalog.byCategory.map((group) => (
        <section className="grid gap-2.5" key={group.category}>
          <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#94949c]">
            {group.category}
          </h3>
          <div className="grid gap-2.5 xl:grid-cols-2">
            {group.options.map((option) => {
              const status = STATUS[option.status] ?? STATUS.idea!;
              return (
                <article
                  className="grid gap-2 rounded-[10px] border border-[#26262b] bg-[#0e0e11] p-3.5"
                  key={option.id}
                >
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-[13.5px] font-semibold text-[#f4f4f5]">{option.name}</span>
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]"
                      style={{ borderColor: status.colour, color: status.colour }}
                    >
                      {status.label}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#71717a]">
                      {EFFORT[option.effort] ?? option.effort}
                    </span>
                  </div>

                  <p className="m-0 text-[12.5px] leading-[1.6] text-[#a1a1aa]">{option.description}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#71717a]">
                    <span>Costs {usd(option.upfrontCostUsd)} to start</span>
                    <span>{usd(option.recurringCostUsd)} a month</span>
                    {option.fitFor.length ? <span>fits {option.fitFor.join(", ")}</span> : null}
                  </div>

                  {option.blockers.length ? (
                    <ul className="m-0 grid list-disc gap-0.5 pl-4 text-[12px] leading-[1.5] text-[#f5a524]">
                      {option.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
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
      <p className="m-0 max-w-[75ch] text-[13px] leading-[1.6] text-[#d4d4d8]">
        Every idea the meetings have produced, across all projects, newest first. An idea marked as
        a duplicate was screened against the ones already on file and stopped there.
      </p>

      {rows.length === 0 ? (
        <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] text-[#d4d4d8]">
          No meeting has produced an idea yet.
        </p>
      ) : (
        <div className="overflow-x-auto" data-horizontal-scroll>
          <table className="w-full min-w-[52rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#26262b]">
                {["Project", "Idea", "State", "Your rating", "From", "Date"].map((head) => (
                  <th
                    className="px-2.5 py-2 text-left align-top font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]"
                    key={head}
                    scope="col"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rating = currentRating(row.card.ratings, row.card.id);
                return (
                  <tr className="border-b border-[#1e1e22]" key={`${row.ventureId}-${row.card.id}`}>
                    <td className="px-2.5 py-2 align-top text-[#a1a1aa]">{row.ventureName}</td>
                    <td className="px-2.5 py-2 align-top">
                      <span className="font-semibold text-[#f4f4f5]">{row.card.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-[1.5] text-[#94949c]">
                        {row.card.summary}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-[11px] text-[#a1a1aa]">
                      {row.card.status}
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-[11px]">
                      {/* An unrated idea is unrated, not bad. */}
                      {rating ? rating.rating : <span className="text-[#71717a]">—</span>}
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-[11px]">
                      {row.originHref ? (
                        <Link className="text-[#a1a1aa] underline" href={row.originHref}>
                          meeting
                        </Link>
                      ) : (
                        <span className="text-[#71717a]">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-[11px] tabular-nums text-[#a1a1aa]">
                      {row.card.updatedAt?.slice(0, 10) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
        {rows.length} {rows.length === 1 ? "idea" : "ideas"}
        {unreadable.length > 0 ? ` · ${unreadable.length} unreadable: ${unreadable.join(", ")}` : ""}
      </p>
    </div>
  );
}
