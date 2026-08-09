import Image from "next/image";
import { Images } from "lucide-react";
import { CopySocialText } from "@/components/admin/copy-social-text";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminSocialPack } from "@/lib/admin-state";
import { formatDate } from "@/lib/utils";

/**
 * The DNESKAi social drafts, lifted out of `admin/page.tsx` unchanged.
 *
 * It was three functions and 120 lines inside the page component, which is why the page was hard
 * to reorganise: the archive, the file viewer and the venture table all lived in one file with no
 * seams. Moving it here changes nothing it renders.
 */
function queueTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "published") return "success";
  if (["failed", "needs_reconciliation"].includes(status)) return "danger";
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
    archived: "closed"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function renderedFrameUrl(date: string, locale: "en" | "cs", slide: number): string {
  return `/admin/api/social-frames/${date}/${locale}/instagram/${slide}`;
}

function SocialCopy({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="font-mono text-xs font-bold uppercase tracking-[0.12em]">{label}</h4>
        <CopySocialText text={text} />
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[var(--mist)]">
        {text}
      </pre>
    </div>
  );
}

function SocialLocalePanel({ pack, locale, localized }: { pack: AdminSocialPack; locale: "en" | "cs"; localized: NonNullable<AdminSocialPack["byLocale"]["en"]> }) {
  const queue = pack.queue.filter((item) => item.locale === locale);
  return (
    <section aria-labelledby={`${pack.date}-${locale}`} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">
            {locale === "cs" ? "České vydání" : "English edition"}
          </p>
          <h3 className="mt-1 text-2xl font-semibold" id={`${pack.date}-${locale}`}>
            {locale.toUpperCase()} social posts
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {queue.map((item) => (
            <Badge key={item.channel} tone={queueTone(item.status)}>
              {item.channel} · {statusLabel(item.status)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {localized.instagram.frames.map((frame, index) => {
          const rendered = renderedFrameUrl(pack.date, locale, index + 1);
          return (
          <a
            className="overflow-hidden rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            href={rendered}
            key={frame}
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt={`Open ${locale.toUpperCase()} carousel frame ${index + 1}`}
              className="h-auto w-full"
              height={1350}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 240px"
              src={rendered}
              unoptimized
              width={1080}
            />
          </a>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SocialCopy label="Instagram caption" text={localized.instagram.text} />
        <SocialCopy label="Threads post" text={localized.threads.text} />
      </div>
      <p className="mt-4 break-all font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
        Destination: <a className="text-[var(--accent)] underline" href={localized.destination} rel="noreferrer" target="_blank">{localized.destination}</a>
      </p>
    </section>
  );
}

export function SocialArchive({ packs, unreadableFiles }: { packs: AdminSocialPack[]; unreadableFiles: string[] }) {
  return (
    <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8" id="social-archive">
      <div className="mb-6 flex items-center gap-3">
        <Images aria-hidden="true" className="size-5 text-[var(--accent)]" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em]">DNESKAi social archive</p>
          <p className="mt-1 text-sm text-[var(--fog)]">English and Czech drafts are stored with carousel images that can be recreated from the same text and design settings.</p>
        </div>
      </div>

      {unreadableFiles.length > 0 ? (
        <Callout className="mb-5" tone="warning">
          {unreadableFiles.length} social post {unreadableFiles.length === 1 ? "file cannot" : "files cannot"} be read. Check: {unreadableFiles.join(", ")}.
        </Callout>
      ) : null}

      {packs.length === 0 ? (
        <Callout>
          No social posts are stored. They stay off until you turn THREADS, INSTAGRAM and FRAME on for DNESKAi. Article delivery and the hero image continue without them.
        </Callout>
      ) : (
        <div className="grid gap-6">
          {packs.map((pack) => (
            <Card key={pack.date}>
              <CardContent>
                <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Edition</p>
                    <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em]"><time dateTime={pack.date}>{formatDate(pack.date)}</time></h2>
                  </div>
                  <div className="text-right font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
                    <p>Edition file {pack.editionRef.slice(0, 12)}…</p>
                    <a className="text-[var(--accent)] underline" href={pack.quoteCard.frame} rel="noreferrer" target="_blank">Open quote card</a>
                  </div>
                </div>
                <div className="grid gap-10 2xl:grid-cols-2">
                  {(["en", "cs"] as const).flatMap((locale) => {
                    const localized = pack.byLocale[locale];
                    return localized ? [<SocialLocalePanel key={locale} locale={locale} localized={localized} pack={pack} />] : [];
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
