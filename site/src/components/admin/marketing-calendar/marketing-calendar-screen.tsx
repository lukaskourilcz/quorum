import { AdminStateMessage } from "@/components/admin/admin-primitives";
import { VentureViewChip } from "@/components/admin/venture-view-chip";
import {
  MARKETING_CALENDAR_VENTURES,
  readAdminMarketingCalendar,
  type MarketingCalendarVentureId
} from "@/lib/admin-marketing-calendar";
import { calendarStateFromQuery, defaultCalendarWeek } from "@/lib/marketing-calendar-view";
import { ventureBrand } from "@/lib/venture-brand";
import { MarketingCalendarPanel } from "./marketing-calendar-panel";

/**
 * The Calendar for one venture, resolved on the server: the company destination and the venture
 * tab both render this, so the two cannot drift. `switchHref` is null inside a venture workspace,
 * where the workspace itself is the venture choice.
 */
export async function MarketingCalendarScreen({
  venture,
  query,
  switchHref,
  writesConfigured
}: {
  venture: MarketingCalendarVentureId;
  query: URLSearchParams;
  switchHref: ((venture: MarketingCalendarVentureId) => string) | null;
  writesConfigured: boolean;
}) {
  const snapshot = await readAdminMarketingCalendar(venture);
  const switcher = switchHref ? (
    <nav aria-label="Marketing plan" className="flex flex-wrap gap-2" data-calendar-venture-switch>
      {MARKETING_CALENDAR_VENTURES.map((candidate) => (
        <VentureViewChip brand={ventureBrand(candidate.id)} href={switchHref(candidate.id)} key={candidate.id} label={candidate.label} on={candidate.id === venture} />
      ))}
    </nav>
  ) : null;
  if (snapshot.state !== "ready") {
    return (
      <div className="grid min-w-0 gap-5">
        {switcher}
        <AdminStateMessage
          description={`${snapshot.reason} The calendar reads ${snapshot.sourcePath}; commit a marketing-calendar/1 document there (docs/MARKETING-CALENDAR.md).`}
          state={snapshot.state === "missing" ? "initial-empty" : "malformed"}
          title={`No readable plan for ${snapshot.venture.label}`}
        />
      </div>
    );
  }
  const initial = calendarStateFromQuery(query, snapshot.document.pillars.map((pillar) => pillar.id));
  return (
    <div className="grid min-w-0 gap-5">
      {switcher}
      <MarketingCalendarPanel
        accent={ventureBrand(venture)}
        clock={snapshot.clock}
        document={snapshot.document}
        entries={snapshot.entries}
        initial={{ ...initial, week: defaultCalendarWeek(snapshot.today, snapshot.document, query.get("week")) }}
        key={venture}
        ownDashboardUrl={snapshot.ownDashboardUrl}
        queue={snapshot.queue}
        rotation={snapshot.rotation}
        sourcePath={snapshot.sourcePath}
        today={snapshot.today}
        venture={snapshot.venture}
        writesConfigured={writesConfigured}
      />
    </div>
  );
}
