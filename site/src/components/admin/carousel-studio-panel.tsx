"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { CarouselStudioSnapshot } from "@/lib/carousel-studio";
import { formatDateTime } from "@/lib/utils";

function formatLabel(value: string): string {
  return value.replaceAll("instagram-", "Instagram ").replaceAll("-", " ");
}

function previewUrl(input: { templateId: string; version: string; brand: string; format: string; slide: number }): string {
  return `/api/carousel-studio/preview/${encodeURIComponent(input.templateId)}/${encodeURIComponent(input.version)}/${encodeURIComponent(input.brand)}/${encodeURIComponent(input.format)}/${input.slide}`;
}

function InspirationPanel({ initialLinks }: { initialLinks: CarouselStudioSnapshot["inspirationLinks"] }) {
  const [links, setLinks] = useState(initialLinks);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <form className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6" onSubmit={submit}>
        <Badge tone="accent">Owner dropbox</Badge>
        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Add one inspiration link</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Use a direct article or post. The meeting stores text observations and provenance only—never the external image bytes.</p>
        <label className="mt-6 block" htmlFor="studio-inspiration-url">
          <span className="text-sm font-semibold">Direct HTTPS link</span>
          <input className="mt-2 min-h-12 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-4 text-base" id="studio-inspiration-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" required type="url" value={url} />
        </label>
        <label className="mt-4 block" htmlFor="studio-inspiration-label">
          <span className="text-sm font-semibold">What should MOTIF inspect?</span>
          <input className="mt-2 min-h-12 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-4 text-base" id="studio-inspiration-label" maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Editorial pacing and title hierarchy" required value={label} />
        </label>
        <Button className="mt-5 w-full" disabled={pending} type="submit" variant="accent"><Link2 aria-hidden="true" className="size-4" />{pending ? "Saving…" : "Save individual link"}</Button>
        <div aria-live="polite" className="mt-3 min-h-6 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}</div>
      </form>
      <section aria-labelledby="saved-inspiration-heading" className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between gap-4"><h3 className="text-xl font-semibold" id="saved-inspiration-heading">Saved links</h3><Badge>{links.length}</Badge></div>
        {links.length ? <ol className="mt-5 grid gap-3">{links.map((link) => <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={link.url}><a className="inline-flex min-h-11 items-center gap-2 break-all font-semibold text-[var(--accent)] underline underline-offset-4" href={link.url} rel="noreferrer" target="_blank">{link.label}<ExternalLink aria-hidden="true" className="size-4 shrink-0" /></a><p className="mt-2 font-mono text-xs text-[var(--fog)]">Added {formatDateTime(link.addedAt)}</p></li>)}</ol> : <Callout className="mt-5">No links yet. The 13:00 room will stay asleep and cost $0 until a bounded agenda exists.</Callout>}
      </section>
    </div>
  );
}

function TemplateStatusControl({ templateId, version, status, checksPass }: { templateId: string; version: string; status: "draft" | "live" | "deprecated"; checksPass: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(next: "draft" | "live" | "deprecated"): Promise<void> {
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
  return <div className="mt-4"><div className="flex flex-wrap gap-2"><Button disabled={pending || status === "draft"} onClick={() => update("draft")} size="small" type="button" variant="secondary">Move to draft</Button><Button disabled={pending || status === "live" || !checksPass} onClick={() => update("live")} size="small" type="button" variant="secondary">Make live</Button><Button className="border-[var(--destructive-soft)] text-[var(--destructive-soft)]" disabled={pending || status === "deprecated"} onClick={() => update("deprecated")} size="small" type="button" variant="secondary">Deprecate</Button></div><div aria-live="polite" className="mt-2 min-h-5 text-xs" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}</div></div>;
}

function TemplateGallery({ snapshot }: { snapshot: CarouselStudioSnapshot }) {
  return (
    <div className="mt-8 grid gap-5">
      <Callout tone="accent"><strong>{snapshot.templates.filter((entry) => entry.template.status === "live").length} live templates.</strong> Open a template to compare every slide across all three brands and all three output formats. Images are previews only; this admin offers no download action.</Callout>
      {snapshot.templates.map((entry, templateIndex) => (
        <details className="group rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]" key={`${entry.template.id}@${entry.template.version}`} open={templateIndex === 0}>
          <summary className="min-h-16 cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge tone={entry.template.status === "live" ? "success" : entry.template.status === "deprecated" ? "danger" : "warning"}>{entry.template.status}</Badge><Badge>{entry.source}</Badge><Badge>{entry.template.version}</Badge></div><h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{entry.template.name}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fog)]">{entry.template.description}</p></div><div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">{entry.allChecksPass ? <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--success)]" /> : <TriangleAlert aria-hidden="true" className="size-5 text-[var(--warning)]" />}{entry.allChecksPass ? `All ${entry.checks.reduce((total, check) => total + check.details.length, 0)} checks pass` : "Checks need attention"}</div></div>
          </summary>
          <div className="border-t border-[var(--border)] p-5 md:p-6">
            <TemplateStatusControl checksPass={entry.allChecksPass} status={entry.template.status} templateId={entry.template.id} version={entry.template.version} />
            <div className="mt-7 grid gap-8">
              {snapshot.brands.map((brand) => <section aria-labelledby={`${entry.template.id}-${brand.id}`} key={brand.id}><div className="mb-4 flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-[var(--accent)]" /><h4 className="font-semibold" id={`${entry.template.id}-${brand.id}`}>{brand.name}</h4></div><div className="grid gap-4 xl:grid-cols-3">{snapshot.formats.map((format) => <div className="min-w-0 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" key={format}><p className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]">{formatLabel(format)}</p><div className="grid grid-cols-2 gap-2">{entry.template.slides.map((slide, index) => <Image alt={`${brand.name} ${entry.template.name}, ${formatLabel(format)}, slide ${index + 1} of ${entry.template.slides.length}`} className="h-auto w-full rounded-sm border border-white/10 bg-[var(--surface-raised)]" data-carousel-preview height={entry.template.formats[format].height} key={slide.id} loading="lazy" sizes="(max-width: 768px) 44vw, (max-width: 1280px) 22vw, 160px" src={previewUrl({ templateId: entry.template.id, version: entry.template.version, brand: brand.id, format, slide: index + 1 })} unoptimized width={entry.template.formats[format].width} />)}</div></div>)}</div></section>)}
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
