import type { AdminCostSnapshot } from "@/lib/admin-cost-model";
import { formatUsd } from "@/lib/utils";
import {
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "./admin-primitives";
import { Panel } from "./panel";

/**
 * What each edition and each decision cost, and how each room did against its own envelope.
 *
 * Three tables rather than three cards: these are the same question asked of many rows, and a
 * comparison reads down a column.
 *
 * The rule that shapes every cell: a figure nobody recorded prints `unavailable`, never `$0.00`.
 * The billed column is the whole reason — it is what the provider invoiced, and reading it needs
 * an admin key nobody has created yet. A confident zero there beside a real metered figure is a
 * number nobody can act on, which is the line `state/FINANCE.md` already draws for revenue.
 */

const Unavailable = () => (
  <span className="text-[var(--admin-muted-foreground)]" data-adm-cost-unavailable>unavailable</span>
);

function ventureLabel(id: string): string {
  return id === "caught-up" ? "DNESKAi" : id;
}

function Usd({ value }: { value: number | null }) {
  return value === null ? <Unavailable /> : <>{formatUsd(value)}</>;
}

export function CostPanel({ snapshot }: { snapshot: AdminCostSnapshot | null }) {
  if (!snapshot) {
    return (
      <Panel note="Per edition and per decision" title="What the work cost">
        <AdminStateMessage
          description="The cycle writes state/money/cost-report.json on every non-dry run. Until one has, there is nothing to show here — which is not the same as nothing having been spent."
          state="initial-empty"
          title="No cost report has been recorded yet"
        />
      </Panel>
    );
  }

  const dropped = Object.values(snapshot.unreadable).reduce((carry, value) => carry + value, 0);

  return (
    <Panel note={snapshot.month} title="What the work cost">
      <div className="grid min-w-0 gap-4" data-adm-cost-panel>
        <p className="m-0 text-[length:var(--admin-type-body)] text-[var(--admin-muted-foreground)]">
          Metered {formatUsd(snapshot.total.totalUsd)} across {snapshot.total.calls} calls
          {" · "}billed{" "}
          {snapshot.billedUsd === null ? <Unavailable /> : formatUsd(snapshot.billedUsd)}
        </p>
        <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-muted-foreground)]" data-adm-cost-reconciliation>
          {snapshot.reconciliation.note}
        </p>

        <section className="grid min-w-0 gap-2">
          <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">What each edition cost</h3>
          {snapshot.editions.length === 0 ? (
            <p className="m-0 text-[length:var(--admin-type-body)] text-[var(--admin-muted-foreground)]">
              No edition was delivered this month.
            </p>
          ) : (
            <AdminTableRegion label="Cost per delivered edition">
              <AdminTable data-adm-cost-editions>
                <thead>
                  <tr>
                    <AdminTableHead scope="col">Date</AdminTableHead>
                    <AdminTableHead scope="col">Venture</AdminTableHead>
                    <AdminTableHead scope="col">Metered</AdminTableHead>
                    <AdminTableHead scope="col">Billed</AdminTableHead>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.editions.map((edition) => (
                    <tr key={`${edition.date}-${edition.ventureId}`} data-adm-cost-edition={edition.date}>
                      <AdminTableCell className="admin-tabular whitespace-nowrap">
                        {edition.articleUrl ? (
                          <a className="admin-focus-ring underline-offset-2 hover:underline" href={edition.articleUrl} rel="noreferrer" target="_blank">
                            {edition.date}
                          </a>
                        ) : edition.date}
                      </AdminTableCell>
                      <AdminTableCell>{ventureLabel(edition.ventureId)}</AdminTableCell>
                      <AdminTableCell className="admin-tabular whitespace-nowrap">
                        <Usd value={edition.cost?.totalUsd ?? null} />
                      </AdminTableCell>
                      {/* Billed is per month, never per edition: the provider invoices days, not
                          articles, so no row here can ever carry a share of one honestly. */}
                      <AdminTableCell className="admin-tabular whitespace-nowrap"><Unavailable /></AdminTableCell>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminTableRegion>
          )}
        </section>

        <section className="grid min-w-0 gap-2">
          <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">What each decision cost</h3>
          {snapshot.decisions.length === 0 ? (
            <p className="m-0 text-[length:var(--admin-type-body)] text-[var(--admin-muted-foreground)]">
              No room recorded a decision this month.
            </p>
          ) : (
            <AdminTableRegion label="Cost per recorded decision">
              <AdminTable data-adm-cost-decisions>
                <thead>
                  <tr>
                    <AdminTableHead scope="col">Room</AdminTableHead>
                    <AdminTableHead scope="col">Venture</AdminTableHead>
                    <AdminTableHead scope="col">Outcome</AdminTableHead>
                    <AdminTableHead scope="col">Metered</AdminTableHead>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.decisions.map((decision) => (
                    <tr key={decision.cycleId} data-adm-cost-decision={decision.cycleId}>
                      <AdminTableCell className="whitespace-nowrap">{decision.phase}</AdminTableCell>
                      <AdminTableCell>{ventureLabel(decision.ventureId)}</AdminTableCell>
                      <AdminTableCell>{decision.outcome}</AdminTableCell>
                      <AdminTableCell className="admin-tabular whitespace-nowrap">
                        <Usd value={decision.cost?.totalUsd ?? null} />
                      </AdminTableCell>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminTableRegion>
          )}
        </section>

        <section className="grid min-w-0 gap-2">
          <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">Envelope against actual</h3>
          <AdminTableRegion label="Room envelope against metered spend">
            <AdminTable data-adm-cost-envelopes>
              <thead>
                <tr>
                  <AdminTableHead scope="col">Room</AdminTableHead>
                  <AdminTableHead scope="col">Cycles</AdminTableHead>
                  <AdminTableHead scope="col">Envelope</AdminTableHead>
                  <AdminTableHead scope="col">Metered</AdminTableHead>
                  <AdminTableHead scope="col">Variance</AdminTableHead>
                </tr>
              </thead>
              <tbody>
                {snapshot.envelopes.map((room) => (
                  <tr key={room.phase} data-adm-cost-envelope={room.phase}>
                    <AdminTableCell className="whitespace-nowrap">{room.phase}</AdminTableCell>
                    <AdminTableCell className="admin-tabular">
                      {room.comparable ? `${room.comparable.cycles} of ${room.cycles}` : String(room.cycles)}
                    </AdminTableCell>
                    <AdminTableCell className="admin-tabular whitespace-nowrap">
                      <Usd value={room.comparable?.envelopeUsd ?? null} />
                    </AdminTableCell>
                    <AdminTableCell className="admin-tabular whitespace-nowrap">{formatUsd(room.meteredUsd)}</AdminTableCell>
                    <AdminTableCell className="admin-tabular whitespace-nowrap">
                      {room.comparable ? (
                        room.comparable.varianceUsd > 0 ? (
                          // The word, not only the colour: over-envelope has to read without hue.
                          <AdminStatusBadge tone="risk">over {formatUsd(room.comparable.varianceUsd)}</AdminStatusBadge>
                        ) : (
                          <>under {formatUsd(Math.abs(room.comparable.varianceUsd))}</>
                        )
                      ) : <Unavailable />}
                    </AdminTableCell>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminTableRegion>
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-muted-foreground)]">
            The envelope is what each cycle&rsquo;s own scorecard reserved. A cycle with no
            scorecard has none, so its spend is counted and left out of the comparison.
          </p>
        </section>

        {dropped > 0 || snapshot.truncated.decisions > 0 || snapshot.truncated.editions > 0 ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-muted-foreground)]" data-adm-cost-dropped>
            {dropped > 0 ? `${dropped} record${dropped === 1 ? "" : "s"} could not be read. ` : ""}
            {snapshot.truncated.editions + snapshot.truncated.decisions > 0
              ? `${snapshot.truncated.editions + snapshot.truncated.decisions} further rows are in the report and not shown here.`
              : ""}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
