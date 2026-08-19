"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import type { CarouselStudioSnapshot } from "@/lib/carousel-studio";
import { formatDateTime } from "@/lib/utils";

function formatLabel(value: string): string {
  return value.replaceAll("instagram-", "Instagram ").replaceAll("-", " ");
}

function previewUrl(input: { templateId: string; version: string; brand: string; format: string; slide: number }): string {
  return `/api/carousel-studio/preview/${encodeURIComponent(input.templateId)}/${encodeURIComponent(input.version)}/${encodeURIComponent(input.brand)}/${encodeURIComponent(input.format)}/${input.slide}`;
}

function InspirationPanel({ initialLinks }: { initialLinks: CarouselStudioSnapshot["inspirationLinks"] }) {
  const writesEnabled = useAdminWritesEnabled();
  const [links, setLinks] = useState(initialLinks);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!writesEnabled) return;
    setPending(true);
    setError("");
    setMessage("Saving link…");
    try {
      const response = await fetch("/admin/api/carousel-studio/inspiration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, label })
      });
      const result = await response.json() as { links?: CarouselStudioSnapshot["inspirationLinks"]; error?: string };
      if (!response.ok || !result.links) throw new Error(result.error ?? "The link could not be saved.");
      setLinks(result.links);
      setUrl("");
      setLabel("");
      setMessage("Saved. MOTIF can use this exact link at the next agenda-gated Studio room.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The link could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <AdminCard><AdminCardContent><form onSubmit={submit}><fieldset disabled={!writesEnabled}>
        <AdminEntityBadge>Owner dropbox</AdminEntityBadge>
        <h3 className="m-0 mt-3 text-[length:var(--admin-type-section)] font-semibold">Add one inspiration link</h3>
        <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Use a direct article or post. The meeting stores text observations and provenance only—never the external image bytes.</p>
        <div className="mt-4">
          <AdminLabel htmlFor="studio-inspiration-url">Direct HTTPS link</AdminLabel>
          <AdminInput id="studio-inspiration-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" required type="url" value={url} />
        </div>
        <div className="mt-3">
          <AdminLabel htmlFor="studio-inspiration-label">What should MOTIF inspect?</AdminLabel>
          <AdminInput id="studio-inspiration-label" maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Editorial pacing and title hierarchy" required value={label} />
        </div>
        <AdminButton className="mt-4 w-full" disabled={pending || !writesEnabled} type="submit" variant="primary"><Link2 aria-hidden className="size-4" />{pending ? "Saving…" : "Save individual link"}</AdminButton>
        <div aria-live="polite" className="mt-3 min-h-6 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}</div>
      </fieldset></form></AdminCardContent></AdminCard>
      <AdminCard><AdminCardContent><section aria-labelledby="saved-inspiration-heading">
        <div className="flex items-center justify-between gap-4"><h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id="saved-inspiration-heading">Saved links</h3><AdminEntityBadge>{links.length}</AdminEntityBadge></div>
        {links.length ? <ol className="m-0 mt-3 grid list-none divide-y divide-[var(--admin-border)] p-0">{links.map((link) => <li className="py-3" key={link.url}><a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-2 break-all rounded-[var(--admin-radius-sm)] font-semibold text-[var(--admin-link)] underline underline-offset-2" href={link.url} rel="noreferrer" target="_blank">{link.label}<ExternalLink aria-hidden className="size-4 shrink-0" /></a><p className="m-0 mt-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">Added {formatDateTime(link.addedAt)}</p></li>)}</ol> : <AdminStateMessage className="mt-3" state="initial-empty" title="No links yet." description="The 13:00 room will stay asleep and cost $0 until a bounded agenda exists." />}
      </section></AdminCardContent></AdminCard>
    </div>
  );
}

function TemplateStatusControl({ templateId, version, status, checksPass }: { templateId: string; version: string; status: "draft" | "live" | "deprecated"; checksPass: boolean }) {
  const writesEnabled = useAdminWritesEnabled();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(next: "draft" | "live" | "deprecated"): Promise<void> {
    if (!writesEnabled) return;
    const reason = window.prompt(`Why should ${templateId}@${version} become ${next}?`);
    if (!reason) return;
    setPending(true); setError(""); setMessage("Saving status…");
    try {
      const response = await fetch("/admin/api/carousel-studio/status", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, version, status: next, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The status could not be saved.");
      setMessage(`Saved as ${next}. Reload to see the canonical view.`);
    } catch (caught) { setMessage(""); setError(caught instanceof Error ? caught.message : "The status could not be saved."); } finally { setPending(false); }
  }
  return <div className="mt-3"><div className="flex flex-wrap gap-2"><AdminButton disabled={!writesEnabled || pending || status === "draft"} onClick={() => update("draft")}>Move to draft</AdminButton><AdminButton disabled={!writesEnabled || pending || status === "live" || !checksPass} onClick={() => update("live")} variant="primary">Make live</AdminButton><AdminButton disabled={!writesEnabled || pending || status === "deprecated"} onClick={() => update("deprecated")} variant="destructive">Deprecate</AdminButton></div><div aria-live="polite" className="mt-2 min-h-5 text-xs" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}</div></div>;
}

function TemplateGallery({ snapshot }: { snapshot: CarouselStudioSnapshot }) {
  return (
    <div className="grid gap-4">
      <AdminCallout tone="information"><strong>{snapshot.templates.filter((entry) => entry.template.status === "live").length} live templates.</strong> Open a template to compare every slide across all three brands and all three output formats. Images are previews only; this admin offers no download action.</AdminCallout>
      {snapshot.templates.length === 0 ? <AdminStateMessage state="initial-empty" title="No carousel templates are recorded." /> : null}
      {snapshot.templates.map((entry, templateIndex) => (
        <details className="group rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)]" key={`${entry.template.id}@${entry.template.version}`} open={templateIndex === 0}>
          <summary className="min-h-16 cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-information)] md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap gap-2"><AdminStatusBadge tone={entry.template.status === "live" ? "success" : entry.template.status === "deprecated" ? "destructive" : "warning"}>{entry.template.status}</AdminStatusBadge><AdminEntityBadge>{entry.source}</AdminEntityBadge><AdminEntityBadge>{entry.template.version}</AdminEntityBadge></div><h3 className="m-0 mt-3 text-[length:var(--admin-type-section)] font-semibold">{entry.template.name}</h3><p className="m-0 mt-1 max-w-3xl text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{entry.template.description}</p></div><div className="flex items-center gap-2 text-[length:var(--admin-type-label)] uppercase tracking-[var(--admin-tracking-label)]">{entry.allChecksPass ? <CheckCircle2 aria-hidden className="size-5 text-[var(--admin-success)]" /> : <TriangleAlert aria-hidden className="size-5 text-[var(--admin-warning)]" />}{entry.allChecksPass ? `All ${entry.checks.reduce((total, check) => total + check.details.length, 0)} checks pass` : "Checks need attention"}</div></div>
          </summary>
          <div className="border-t border-[var(--admin-border)] p-5 md:p-6">
            <TemplateStatusControl checksPass={entry.allChecksPass} status={entry.template.status} templateId={entry.template.id} version={entry.template.version} />
            <div className="mt-7 grid gap-8">
              {snapshot.brands.map((brand) => <section aria-labelledby={`${entry.template.id}-${brand.id}`} key={brand.id}><div className="mb-4 flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-[var(--admin-section-accent)]" /><h4 className="font-semibold" id={`${entry.template.id}-${brand.id}`}>{brand.name}</h4></div><div className="grid gap-4 xl:grid-cols-3">{snapshot.formats.map((format) => <div className="min-w-0 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3" key={format}><p className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[var(--admin-foreground-muted)]">{formatLabel(format)}</p><div className="grid grid-cols-2 gap-2">{entry.template.slides.map((slide, index) => <Image alt={`${brand.name} ${entry.template.name}, ${formatLabel(format)}, slide ${index + 1} of ${entry.template.slides.length}`} className="h-auto w-full rounded-sm border border-[var(--admin-border)] bg-[var(--admin-surface-elevated)]" data-carousel-preview height={entry.template.formats[format].height} key={slide.id} loading="lazy" sizes="(max-width: 768px) 44vw, (max-width: 1280px) 22vw, 160px" src={previewUrl({ templateId: entry.template.id, version: entry.template.version, brand: brand.id, format, slide: index + 1 })} unoptimized width={entry.template.formats[format].width} />)}</div></div>)}</div></section>)}
            </div>
            <div className="mt-8 max-w-xl"><RatingWidget contentHash={entry.contentHash} initialHistory={entry.ratings} objectId={`${entry.template.id}@${entry.template.version}`} objectKind="template" ventureId="carousel-studio" /></div>
          </div>
        </details>
      ))}
    </div>
  );
}

export function CarouselStudioAdminPanel({ snapshot, tab }: { snapshot: CarouselStudioSnapshot; tab: "templates" | "inspiration" }) {
  if (tab === "inspiration") return <InspirationPanel initialLinks={snapshot.inspirationLinks} />;
  return <TemplateGallery snapshot={snapshot} />;
}
