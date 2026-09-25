"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, Layers, Send } from "lucide-react";
import { SlideImage } from "./design-lab-image";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { AdminButton, AdminCallout, AdminEntityBadge, AdminInput, AdminLabel, AdminStatusBadge, AdminTextarea, adminButtonVariants } from "./admin-primitives";
import { queueActionFailure, queueActionNotice, type QueueActionNotice } from "@/lib/admin-queue/notice";
import { QUEUE_PLATFORM_LABELS } from "@/lib/admin-queue/types";
import type { LabPackageArticle } from "@/lib/design-lab-package";
import { cn } from "@/lib/utils";

interface SlideCopy { headline: string; body: string; alt: string }
interface Problem { slide: number; field: "headline" | "body" | "alt" | "code"; slot: string | null; message: string }
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; commit: string | null }
  | { kind: "refused"; problems: Problem[] }
  | { kind: "failed"; message: string };

const ROLE_LABELS: Readonly<Record<string, string>> = { hook: "Hook", context: "Question", reveal: "Answer", why: "Why", footer: "Sign-off" };
const RATIO = 1080 / 1350;
const same = (left: SlideCopy, right: SlideCopy) => left.headline === right.headline && left.body === right.body && left.alt === right.alt;
const trimmed = (copy: SlideCopy): SlideCopy => ({ headline: copy.headline.trim(), body: copy.body.trim(), alt: copy.alt.trim() });

/**
 * The address of one slide's picture. The copy is sent only when it differs from what the server
 * holds, so an unedited slide is one cacheable URL and an unsaved draft still previews as typed.
 */
function slideSrc(article: LabPackageArticle, index: number, copy: SlideCopy, revision: string): string {
  const query = new URLSearchParams();
  const server = article.slides[index]!.current;
  if (copy.headline.trim() !== server.headline || copy.body.trim() !== server.body) {
    query.set("headline", copy.headline);
    query.set("body", copy.body);
  }
  if (revision) query.set("revision", revision);
  const suffix = query.toString() ? `?${query}` : "";
  return `/admin/api/carousel-studio/package/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${index + 1}${suffix}`;
}

function Counter({ id, length, limit }: { id: string; length: number; limit: number }) {
  const over = length > limit;
  return <p className={cn("m-0 mt-1 text-right text-[length:var(--admin-type-label)] admin-tabular", over ? "font-semibold text-[var(--admin-destructive)]" : "text-[var(--admin-foreground-muted)]")} id={id}>
    {length} / {limit}{over ? ", over the limit" : ""}
  </p>;
}

/**
 * A devShark package in the Design Lab (quorum#575): five slides in marketingShark's quiz
 * templates, each with an editable headline, body and alt text. Save checks the whole deck against
 * the room's caps and the clip gate on the server; Send to Queue turns the saved slides into new
 * frames and a new draft for every live queue item of this package. Nothing here posts.
 */
export function DesignLabPackageWorkspace({ article }: { article: LabPackageArticle }) {
  const router = useRouter();
  const writesEnabled = useAdminWritesEnabled();
  const ids = useId();
  const [slide, setSlide] = useState(0);
  const [drafts, setDrafts] = useState<SlideCopy[]>(article.slides.map((entry) => entry.current));
  const [saved, setSaved] = useState<SlideCopy[]>(article.slides.map((entry) => entry.current));
  const [preview, setPreview] = useState<SlideCopy>(article.slides[0]!.current);
  const [revision, setRevision] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Array<{ platform: string; notice: QueueActionNotice }>>([]);

  const draft = drafts[slide]!;
  const current = article.slides[slide]!;
  const headlineLimit = current.role === "hook" ? article.limits.hook : article.limits.headline;
  const dirty = !same(trimmed(draft), saved[slide]!);
  const unsaved = drafts.some((entry, index) => !same(trimmed(entry), saved[index]!));
  const altTotal = drafts.map((entry) => entry.alt.trim()).join(" ").length;
  const busy = save.kind === "saving" || sending;
  const problems = save.kind === "refused" ? save.problems : [];
  const invalid = (field: Problem["field"]) => problems.some((problem) => problem.slide === slide + 1 && problem.field === field);

  // The picture follows the typing, a moment behind it, so a draft previews without a render per key.
  useEffect(() => {
    const timer = window.setTimeout(() => setPreview(draft), 400);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const edit = (field: keyof SlideCopy, value: string) => {
    setDrafts((values) => values.map((entry, index) => index === slide ? { ...entry, [field]: value } : entry));
    if (save.kind !== "saving") setSave({ kind: "idle" });
  };
  const open = (index: number) => {
    setSlide(index);
    setPreview(drafts[index]!);
  };

  async function saveSlide(): Promise<void> {
    if (!writesEnabled || busy) return;
    const index = slide;
    setSave({ kind: "saving" });
    try {
      const response = await fetch("/admin/api/carousel-studio/package-slide", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture: article.venture, slug: article.slug, date: article.date, slide: index, ...drafts[index] })
      });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; commit?: string | null; error?: string; problems?: Problem[]; slide?: SlideCopy };
      if (response.ok && body.ok === true && body.slide) {
        setSaved((values) => values.map((entry, position) => position === index ? body.slide! : entry));
        setDrafts((values) => values.map((entry, position) => position === index ? body.slide! : entry));
        setSave({ kind: "saved", commit: body.commit ?? null });
        setRevision(crypto.randomUUID());
        router.refresh();
      } else if (Array.isArray(body.problems) && body.problems.length > 0) {
        setSave({ kind: "refused", problems: body.problems });
      } else {
        setSave({ kind: "failed", message: body.error ?? "The edit was not saved." });
      }
    } catch {
      setSave({ kind: "failed", message: "The server did not answer, so the edit was not saved." });
    }
  }

  async function sendToQueue(): Promise<void> {
    if (!writesEnabled || busy || unsaved) return;
    setSending(true);
    setSent([]);
    const results: Array<{ platform: string; notice: QueueActionNotice }> = [];
    // One item at a time: they share the new frames and package revision, and the first request
    // writes them while the rest find them already there.
    for (const item of article.queueItems) {
      let notice: QueueActionNotice;
      try {
        const response = await fetch("/admin/api/queue/actions", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rerender", itemId: item.id, expectedContentHash: item.contentHash })
        });
        notice = queueActionNotice(response.ok, await response.json().catch(() => ({})));
      } catch {
        notice = queueActionFailure();
      }
      results.push({ platform: QUEUE_PLATFORM_LABELS[item.platform], notice });
      setSent([...results]);
    }
    setSending(false);
    router.refresh();
  }

  return <article className="min-w-0 overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]" data-lab-article={`${article.venture}/${article.slug}/${article.date}`} data-lab-package>
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--admin-border)] p-4 md:p-5">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-foreground-muted)]"><Layers aria-hidden="true" className="size-3.5" />{article.ventureLabel} · {article.date}<AdminEntityBadge>marketingShark package · {article.slides.length} slides</AdminEntityBadge></div>
        <h3 className="max-w-3xl break-words text-lg font-semibold leading-snug text-[var(--admin-foreground)]">{article.headline}</h3>
      </div>
      <AdminStatusBadge tone={article.renderable ? "success" : "destructive"}>{article.renderable ? "Renders" : "Cannot render"}</AdminStatusBadge>
    </header>
    {article.problems.length ? <div className="p-4"><AdminCallout tone="warning">{article.problems.join(" ")}</AdminCallout></div> : null}

    <div className="grid min-w-0 gap-5 p-3 md:p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="grid min-w-0 place-items-center rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-elevated)] px-3 py-6 md:px-6" data-design-stage>
          <div className="relative w-full shadow-xl" style={{ maxWidth: `${Math.round(600 * RATIO)}px` }}>
            <SlideImage alt={`Slide ${slide + 1}, ${ROLE_LABELS[current.role]}: ${preview.alt || preview.headline}`} ratio={RATIO} src={slideSrc(article, slide, preview, revision)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--admin-foreground-muted)]">1080 × 1350 px · {current.templateId}</span>
          <div className="flex items-center gap-3">
            <AdminButton aria-label="Previous slide" disabled={slide === 0} onClick={() => open(slide - 1)}><ArrowLeft aria-hidden="true" className="size-4" /></AdminButton>
            <span aria-live="polite" className="whitespace-nowrap text-xs tabular-nums">{slide + 1} / {article.slides.length}</span>
            <AdminButton aria-label="Next slide" disabled={slide === article.slides.length - 1} onClick={() => open(slide + 1)}><ArrowRight aria-hidden="true" className="size-4" /></AdminButton>
          </div>
        </div>
        <div className="w-full overflow-x-auto pb-2" data-horizontal-scroll>
          <ol aria-label="Package slides" className="flex gap-2" data-slide-strip>{article.slides.map((entry) => <li className="w-[72px] shrink-0" key={entry.index}>
            <button aria-label={`Open slide ${entry.index + 1}, ${ROLE_LABELS[entry.role]}`} aria-pressed={slide === entry.index} className={cn("admin-focus-ring grid w-full gap-1 rounded-lg border p-1", slide === entry.index ? "border-[var(--admin-primary)] bg-[var(--admin-surface-elevated)]" : "border-transparent")} onClick={() => open(entry.index)} type="button">
              <SlideImage alt="" canvas={false} ratio={RATIO} src={slideSrc(article, entry.index, saved[entry.index]!, revision)} />
              <span className="text-[10px] tabular-nums text-[var(--admin-foreground-muted)]">{entry.index + 1}{!same(trimmed(drafts[entry.index]!), saved[entry.index]!) ? " •" : ""}</span>
            </button>
          </li>)}</ol>
        </div>
      </div>

      <aside aria-label={`Slide ${slide + 1} copy`} className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4" data-package-editor>
        <p className="m-0 text-sm font-semibold">Slide {slide + 1}: {ROLE_LABELS[current.role]}{saved[slide] && !same(saved[slide]!, current.original) ? <span className="ml-2 font-normal text-[var(--admin-foreground-muted)]">edited</span> : null}</p>
        <div>
          <AdminLabel htmlFor={`${ids}-headline`}>Headline</AdminLabel>
          <AdminInput aria-describedby={`${ids}-headline-count`} aria-invalid={draft.headline.trim().length > headlineLimit || invalid("headline")} disabled={!writesEnabled || busy} id={`${ids}-headline`} onChange={(event) => edit("headline", event.target.value)} value={draft.headline} />
          <Counter id={`${ids}-headline-count`} length={draft.headline.trim().length} limit={headlineLimit} />
        </div>
        <div>
          <AdminLabel htmlFor={`${ids}-body`}>Body</AdminLabel>
          <AdminTextarea aria-describedby={`${ids}-body-count`} aria-invalid={draft.body.trim().length > article.limits.body || invalid("body") || invalid("code")} className="min-h-28 font-mono text-sm" disabled={!writesEnabled || busy} id={`${ids}-body`} onChange={(event) => edit("body", event.target.value)} value={draft.body} />
          <Counter id={`${ids}-body-count`} length={draft.body.trim().length} limit={article.limits.body} />
        </div>
        <div>
          <AdminLabel htmlFor={`${ids}-alt`}>Alt text</AdminLabel>
          <AdminTextarea aria-describedby={`${ids}-alt-count ${ids}-alt-total`} aria-invalid={draft.alt.trim().length === 0 || draft.alt.trim().length > article.limits.alt || invalid("alt")} disabled={!writesEnabled || busy} id={`${ids}-alt`} onChange={(event) => edit("alt", event.target.value)} value={draft.alt} />
          <Counter id={`${ids}-alt-count`} length={draft.alt.trim().length} limit={article.limits.alt} />
          <p className="m-0 text-right text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)] admin-tabular" id={`${ids}-alt-total`}>All five slides: {altTotal} / {article.limits.altTotal}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminButton data-save-package-slide disabled={!writesEnabled || busy || !dirty || !article.renderable} onClick={() => { void saveSlide(); }} variant="primary">{save.kind === "saving" ? "Checking and saving…" : "Save slide"}</AdminButton>
          <AdminButton disabled={!writesEnabled || busy || same(trimmed(draft), current.original)} onClick={() => setDrafts((values) => values.map((entry, index) => index === slide ? current.original : entry))} variant="ghost">Use the package&apos;s words</AdminButton>
        </div>
        <p className="m-0 text-xs leading-relaxed text-[var(--admin-foreground-muted)]">Save checks all five slides against marketingShark&apos;s limits and refuses anything the canvas would clip.</p>
        <div aria-live="polite" role="status">
          {save.kind === "saved" ? <p className="m-0 text-sm text-[var(--admin-success)]">Saved{save.commit ? ` in commit ${save.commit}` : ""}.</p> : null}
          {save.kind === "failed" ? <p className="m-0 text-sm text-[var(--admin-destructive)]">{save.message}</p> : null}
          {save.kind === "refused" ? <AdminCallout data-package-refusal tone="destructive"><p className="m-0 font-semibold">Not saved:</p><ul className="m-0 mt-1 list-disc pl-5">{problems.map((problem) => <li key={`${problem.slide}-${problem.field}-${problem.slot ?? ""}-${problem.message}`}>{problem.message}</li>)}</ul></AdminCallout> : null}
        </div>
      </aside>
    </div>

    <footer className="grid min-w-0 gap-3 border-t border-[var(--admin-border)] p-4 md:p-5" data-send-to-queue>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><Send aria-hidden="true" className="size-4" />Send to Queue</span>
        <AdminButton data-send-package disabled={!writesEnabled || busy || unsaved || !article.renderable || article.queueItems.length === 0} onClick={() => { void sendToQueue(); }} variant="primary">{sending ? "Rendering frames…" : "Send to Queue"}</AdminButton>
      </div>
      <p className="m-0 text-sm leading-relaxed text-[var(--admin-foreground-muted)]">Renders the saved slides as PNG and JPEG frames and replaces each draft below with a new one. Nothing is posted: every new draft waits for your approval in the <Link className="underline underline-offset-4" href="/admin/queue">Queue</Link>.</p>
      {unsaved ? <AdminCallout tone="warning">Save or undo the edited slides first; the Queue gets the saved words only.</AdminCallout> : null}
      {article.queueItems.length ? <ul aria-label="Queue drafts from this package" className="m-0 flex list-none flex-wrap gap-2 p-0">{article.queueItems.map((item) => <li key={item.id}><AdminEntityBadge>{QUEUE_PLATFORM_LABELS[item.platform]} · {item.status}</AdminEntityBadge></li>)}</ul>
        : <p className="m-0 text-sm text-[var(--admin-foreground-muted)]">No draft in the Queue uses this package any more, so there is nothing to replace.</p>}
      <ul aria-live="polite" className="m-0 grid list-none gap-1 p-0 empty:hidden" role="status">{sent.map(({ platform, notice }) => <li className={cn("text-sm", notice.tone === "destructive" ? "text-[var(--admin-destructive)]" : notice.tone === "warning" ? "text-[var(--admin-warning)]" : "text-[var(--admin-success)]")} key={platform}>{platform}: {notice.text}</li>)}</ul>
      {sent.length && !sending ? <Link className={cn(adminButtonVariants({ variant: "secondary" }), "w-fit")} href="/admin/queue?venture=devshark">Open the Queue</Link> : null}
    </footer>
  </article>;
}
