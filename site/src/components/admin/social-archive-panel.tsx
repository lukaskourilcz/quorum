import Image from "next/image";
import { Images } from "lucide-react";
import {
  AdminEntityBadge,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { CopySocialText } from "@/components/admin/copy-social-text";
import type { AdminSocialPack } from "@/lib/admin-state";
import { formatDate } from "@/lib/utils";

function queueTone(status: string): "neutral" | "success" | "warning" | "destructive" {
  if (status === "published") return "success";
  if (["failed", "needs_reconciliation"].includes(status)) return "destructive";
  if (["approved", "queued", "publishing"].includes(status)) return "warning";
  return "neutral";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    needs_reconciliation: "needs checking",
    in_progress: "being worked on",
    owner_rated: "rated by you",
    proposed: "suggested",
    shortlist: "keep looking at this",
    archived: "closed",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function renderedFrameUrl(date: string, locale: "en" | "cs", slide: number): string {
  return `/admin/api/social-frames/${date}/${locale}/instagram/${slide}`;
}

function SocialCopy({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 border-l-2 border-[var(--admin-border-strong)] pl-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)]">{label}</h4>
        <CopySocialText text={text} />
      </div>
      <pre className="m-0 max-w-full whitespace-pre-wrap break-words font-sans text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{text}</pre>
    </div>
  );
}

function SocialLocalePanel({ pack, locale, localized }: { pack: AdminSocialPack; locale: "en" | "cs"; localized: NonNullable<AdminSocialPack["byLocale"]["en"]> }) {
  const queue = pack.queue.filter((item) => item.locale === locale);
  return (
    <section aria-labelledby={`${pack.date}-${locale}`} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{locale === "cs" ? "České vydání" : "English edition"}</p>
          <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold" id={`${pack.date}-${locale}`}>{locale.toUpperCase()} social posts</h3>
        </div>
        <div className="flex flex-wrap gap-2">{queue.map((item) => <AdminStatusBadge key={item.channel} tone={queueTone(item.status)}>{item.channel} · {statusLabel(item.status)}</AdminStatusBadge>)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {localized.instagram.frames.map((frame, index) => {
          const rendered = renderedFrameUrl(pack.date, locale, index + 1);
          return (
            <a className="admin-focus-ring overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)]" href={rendered} key={frame} rel="noreferrer" target="_blank">
              <Image alt={`Open ${locale.toUpperCase()} carousel frame ${index + 1}`} className="h-auto w-full" height={1350} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 240px" src={rendered} unoptimized width={1080} />
            </a>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><SocialCopy label="Instagram caption" text={localized.instagram.text} /><SocialCopy label="Threads post" text={localized.threads.text} /></div>
      <p className="m-0 mt-3 break-all text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">Destination: <a className="admin-focus-ring underline underline-offset-2" href={localized.destination} rel="noreferrer" target="_blank">{localized.destination}</a></p>
    </section>
  );
}

export function SocialArchive({ packs, unreadableFiles }: { packs: AdminSocialPack[]; unreadableFiles: string[] }) {
  return (
    <section className="grid min-w-0 gap-4" id="social-archive">
      <div className="flex items-start gap-2"><Images aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--admin-section-accent)]" /><AdminSectionHeading description="English and Czech drafts are stored with carousel images reproducible from the same text and design settings." title="DNESKAi social archive" /></div>
      {unreadableFiles.length > 0 ? <AdminStateMessage description={unreadableFiles.join(", ")} state="malformed" title={`${unreadableFiles.length} social post ${unreadableFiles.length === 1 ? "file cannot" : "files cannot"} be read`} /> : null}
      {packs.length === 0 ? (
        <AdminStateMessage description="They stay off until Threads, Instagram and image posts are all enabled for DNESKAi. The daily article and picture carry on without them." state="held" title="No social posts are stored" />
      ) : (
        <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
          {packs.map((pack) => (
            <article className="grid gap-5 py-4" key={pack.date}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Edition</p><h2 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold"><time dateTime={pack.date}>{formatDate(pack.date)}</time></h2></div>
                <div className="flex flex-wrap items-center gap-2"><AdminEntityBadge>File {pack.editionRef.slice(0, 12)}…</AdminEntityBadge><a className="admin-focus-ring text-[length:var(--admin-type-control)] underline underline-offset-2" href={pack.quoteCard.frame} rel="noreferrer" target="_blank">Open quote card</a></div>
              </div>
              <div className="grid gap-6 2xl:grid-cols-2">{(["en", "cs"] as const).flatMap((locale) => { const localized = pack.byLocale[locale]; return localized ? [<SocialLocalePanel key={locale} locale={locale} localized={localized} pack={pack} />] : []; })}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
