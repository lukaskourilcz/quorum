import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export interface AdminTehdejsiSignalDigest {
  id: string;
  recordedAt: string;
  sourceLabel: string;
  recollections: string[];
}

export interface AdminTehdejsiSignalTheme {
  label: string;
  recurrence: number;
  lastSeenAt: string;
}

export interface AdminTehdejsiAudienceRequest {
  kind: "city" | "year" | "correction";
  value: string;
  recurrence: number;
  lastSeenAt: string;
}

export interface AdminTehdejsiProductInsight {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "rejected" | "done";
  proposedAction: string;
  evidenceCount: number;
}

export interface AdminTehdejsiSignalsView {
  digests: AdminTehdejsiSignalDigest[];
  themes: AdminTehdejsiSignalTheme[];
  requests: AdminTehdejsiAudienceRequest[];
  insights: AdminTehdejsiProductInsight[];
  unreadable: number;
}

export const EMPTY_TEHDEJSI_SIGNALS: AdminTehdejsiSignalsView = {
  digests: [],
  themes: [],
  requests: [],
  insights: [],
  unreadable: 0
};

export function tehdejsiSignalsCount(view: AdminTehdejsiSignalsView): number {
  return view.digests.length + view.themes.length + view.requests.length + view.insights.length;
}

function CommunityMemory({ view }: { view: AdminTehdejsiSignalsView }) {
  return (
    <section aria-labelledby="tehdejsi-community-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Owner-pasted only</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-community-heading">Community memory</h3></div>
        <Badge>{view.digests.length} digest{view.digests.length === 1 ? "" : "s"}</Badge>
      </div>
      <Callout className="mt-4">
        This view never scrapes comments or calls a platform API. Paste-in controls appear only after a canonical signal writer exists.
      </Callout>
      {view.digests.length ? (
        <div className="mt-4 grid gap-3">
          {view.digests.map((digest) => (
            <Card key={digest.id}><CardContent>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{digest.id}</p><h4 className="mt-1 text-lg font-semibold">{digest.sourceLabel}</h4></div>
                <time className="text-xs text-[var(--fog)]" dateTime={digest.recordedAt}>{formatDateTime(digest.recordedAt)}</time>
              </div>
              <ul className="mt-4 grid gap-3">
                {digest.recollections.map((recollection, index) => (
                  <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" key={`${digest.id}-${index}`}>
                    <Badge tone="warning">Recollection · not a fact</Badge>
                    <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{recollection}</p>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          ))}
        </div>
      ) : <Callout className="mt-4">No owner-pasted community memory is recorded.</Callout>}
    </section>
  );
}

function ThemesAndRequests({ view }: { view: AdminTehdejsiSignalsView }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section aria-labelledby="tehdejsi-themes-heading">
        <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold" id="tehdejsi-themes-heading">Extracted themes</h3><Badge>{view.themes.length}</Badge></div>
        {view.themes.length ? <ul className="mt-4 grid gap-3">{view.themes.map((theme) => (
          <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={theme.label}>
            <div className="flex items-center justify-between gap-3"><p className="font-semibold">{theme.label}</p><Badge tone="dark">{theme.recurrence} mention{theme.recurrence === 1 ? "" : "s"}</Badge></div>
            <p className="mt-2 text-xs text-[var(--fog)]">Last seen {formatDateTime(theme.lastSeenAt)}</p>
          </li>
        ))}</ul> : <Callout className="mt-4">No themes have been extracted from recorded memory.</Callout>}
      </section>
      <section aria-labelledby="tehdejsi-requests-heading">
        <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold" id="tehdejsi-requests-heading">Audience requests</h3><Badge>{view.requests.length}</Badge></div>
        {view.requests.length ? <ol className="mt-4 grid gap-3">{[...view.requests]
          .sort((left, right) => right.recurrence - left.recurrence || left.value.localeCompare(right.value))
          .map((request) => (
            <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={`${request.kind}-${request.value}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{request.value}</p><div className="flex gap-2"><Badge>{request.kind}</Badge><Badge tone="dark">Repeated {request.recurrence}</Badge></div></div>
              <p className="mt-2 text-xs text-[var(--fog)]">Last requested {formatDateTime(request.lastSeenAt)}</p>
            </li>
          ))}</ol> : <Callout className="mt-4">No recurring city, year or correction request is recorded.</Callout>}
      </section>
    </div>
  );
}

function InsightQueue({ view }: { view: AdminTehdejsiSignalsView }) {
  return (
    <section aria-labelledby="tehdejsi-insights-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Owner-controlled product recommendations</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-insights-heading">Product insight queue</h3></div>
        <Badge>{view.insights.length} insight{view.insights.length === 1 ? "" : "s"}</Badge>
      </div>
      {view.insights.length ? <div className="mt-4 grid gap-3">{view.insights.map((insight) => (
        <Card key={insight.id}><CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{insight.id}</p><h4 className="mt-1 text-lg font-semibold">{insight.title}</h4></div><Badge tone={insight.status === "done" ? "success" : insight.status === "rejected" ? "danger" : "warning"}>{insight.status}</Badge></div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{insight.proposedAction}</p>
          <p className="mt-2 text-xs text-[var(--fog)]">{insight.evidenceCount} recorded evidence item{insight.evidenceCount === 1 ? "" : "s"}</p>
        </CardContent></Card>
      ))}</div> : <Callout className="mt-4">No product insight is recorded. This panel cannot change the product.</Callout>}
    </section>
  );
}

export function TehdejsiSvetSignalsPanel({ view = EMPTY_TEHDEJSI_SIGNALS }: { view?: AdminTehdejsiSignalsView }) {
  return (
    <div className="grid gap-10" data-tehdejsi-signals>
      {view.unreadable > 0 ? <Callout tone="warning">{view.unreadable} malformed signal record{view.unreadable === 1 ? "" : "s"} was omitted.</Callout> : null}
      <CommunityMemory view={view} />
      <ThemesAndRequests view={view} />
      <InsightQueue view={view} />
    </div>
  );
}
