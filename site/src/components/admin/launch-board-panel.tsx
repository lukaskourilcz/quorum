import Link from "next/link";
import type { LaunchBoard, LaunchState } from "@/lib/admin-launch-board";
import {
  AdminCallout,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "./admin-primitives";
import { Panel } from "./panel";

/**
 * The launch set, on one board, above everything else on the overview.
 *
 * Deliberately a table rather than seven cards: seven ventures compared on the same six questions
 * is a comparison, and a comparison reads down a column. The verdict sits above it because the
 * first thing an owner needs is whether anything needs them at all — the rows are for when the
 * answer is yes.
 *
 * Every value here was already recorded somewhere; nothing on this board is computed from a
 * clock or re-derived. A field the record cannot supply prints an em dash, never a zero, which is
 * the same rule the wallboard keeps.
 */

const TONE: Record<LaunchState, "neutral" | "information" | "success" | "risk"> = {
  shipping: "success",
  ready: "information",
  attention: "risk",
  held: "neutral"
};

const Dash = () => <span className="text-[var(--admin-muted-foreground)]">—</span>;

export function LaunchBoardPanel({ board }: { board: LaunchBoard }) {
  return (
    <Panel note="The ventures being launched" title="Launch board">
      <div className="grid min-w-0 gap-4" data-adm-launch-panel>
        <AdminCallout tone={board.verdict.tone} data-adm-launch-verdict>
          <p className="text-[length:var(--admin-type-section)] font-semibold">{board.verdict.headline}</p>
          <p className="text-[length:var(--admin-type-body)] text-[var(--admin-muted-foreground)]">
            {board.verdict.detail}
          </p>
        </AdminCallout>

        <AdminTableRegion label="Launch board by venture">
          <AdminTable data-adm-launch-board>
            <thead>
              <tr>
                <AdminTableHead scope="col">Venture</AdminTableHead>
                <AdminTableHead scope="col">State</AdminTableHead>
                <AdminTableHead scope="col">Last delivery</AdminTableHead>
                <AdminTableHead scope="col">Next slot</AdminTableHead>
                <AdminTableHead scope="col">Last picture</AdminTableHead>
                <AdminTableHead scope="col">Social</AdminTableHead>
                <AdminTableHead scope="col">Needs you</AdminTableHead>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.id} data-adm-launch-row={row.id}>
                  <AdminTableCell>
                    <Link className="admin-focus-ring font-medium underline-offset-2 hover:underline" href={`/admin?venture=${row.id}`}>
                      {row.name}
                    </Link>
                  </AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">
                    {/* Dot and word together: a reader who cannot separate the hues still reads the state. */}
                    <AdminStatusBadge tone={TONE[row.state]}>{row.stateLabel}</AdminStatusBadge>
                  </AdminTableCell>
                  {/* A delivery reads the same whether or not it has a link to follow. */}
                  <AdminTableCell className="admin-tabular whitespace-nowrap">
                    {row.lastDelivery ? (
                      row.lastDelivery.url ? (
                        <a className="admin-focus-ring underline-offset-2 hover:underline" href={row.lastDelivery.url} rel="noreferrer" target="_blank">
                          {row.lastDelivery.date}
                        </a>
                      ) : (
                        row.lastDelivery.date
                      )
                    ) : <Dash />}
                  </AdminTableCell>
                  {/* The hour is the fact; the room's own name explains it without abbreviating. */}
                  <AdminTableCell>
                    {row.nextSlot ? (
                      <span className="grid gap-0.5">
                        <span className="admin-tabular whitespace-nowrap font-medium">
                          {String(row.nextSlot.hour).padStart(2, "0")}:00
                        </span>
                        <span className="text-[length:var(--admin-type-micro)] text-[var(--admin-muted-foreground)]">
                          {row.nextSlot.label}
                        </span>
                      </span>
                    ) : <Dash />}
                  </AdminTableCell>
                  {/* The rung that answered, and underneath it how often the window ran out of
                      rungs entirely. One is today; the other is whether this is a habit. */}
                  <AdminTableCell>
                    {row.image?.rung ? (
                      <span className="grid gap-0.5">
                        <span className={`whitespace-nowrap${row.image.fellToPlate ? " text-[var(--admin-warning)]" : ""}`}>
                          {row.image.rung}
                        </span>
                        {row.image.plateCount > 0 ? (
                          <span className="whitespace-nowrap text-[length:var(--admin-type-micro)] text-[var(--admin-muted-foreground)]">
                            {row.image.plateCount} of last {row.image.sampled} drawn
                          </span>
                        ) : null}
                      </span>
                    ) : <Dash />}
                  </AdminTableCell>
                  <AdminTableCell className="admin-tabular whitespace-nowrap">
                    {row.social ? `${row.social.counter}/${row.social.required}` : <Dash />}
                  </AdminTableCell>
                  <AdminTableCell>
                    {row.blocking ? (
                      <Link className="admin-focus-ring underline-offset-2 hover:underline" href={row.blocking.href}>
                        {row.blocking.title}
                      </Link>
                    ) : <Dash />}
                  </AdminTableCell>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminTableRegion>

        <p className="text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-muted-foreground)]">
          Every figure is read from the record. A dash is something the record cannot supply, never a zero.
        </p>
        {board.attention.stale ? (
          // The age travels with the figure. A blocker the owner cleared this morning still shows
          // until the collector runs, and saying so is cheaper than being quietly wrong.
          <p data-adm-launch-attention-age className="text-[length:var(--admin-type-micro)] text-[var(--admin-warning)]">
            The owner-attention collector last wrote on{" "}
            <span className="admin-tabular">{board.attention.asOf}</span>, {board.attention.ageDays} days ago, so the
            &ldquo;Needs you&rdquo; column is that old.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
