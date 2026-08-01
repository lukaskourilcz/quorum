import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminCard } from "@/lib/admin-portfolio";

function statusTone(status: string): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (["approved", "accepted", "published", "shortlist", "shipped"].includes(status)) return "success";
  if (["bad", "failed", "killed", "vetoed", "archived"].includes(status)) return "danger";
  if (["owner_rated", "queued", "deferred", "proposed"].includes(status)) return "warning";
  if (["live", "in_progress"].includes(status)) return "accent";
  return "neutral";
}

function timestamp(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(parsed);
}

export function PortfolioCard({ card, originHref }: { card: AdminCard; originHref: string | null }) {
  return (
    <Card className="min-w-0">
      <CardContent className="grid h-full gap-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge>{card.kind.replaceAll("-", " ")}</Badge>
            <Badge tone={statusTone(card.status)}>{card.status.replaceAll("_", " ")}</Badge>
          </div>
          <h3 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.04em]">{card.title}</h3>
          <p className="mt-3 line-clamp-5 text-sm leading-6 text-[var(--fog)]">{card.summary}</p>
        </div>

        {card.media.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {card.media.slice(0, 4).map((source, index) => (
              <a
                className="overflow-hidden rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)]"
                href={source}
                key={source}
                rel="noreferrer"
                target="_blank"
              >
                <Image alt={`Open ${card.title} asset ${index + 1}`} height={320} src={source} width={320} />
              </a>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 border-y border-[var(--border)] py-4 text-xs">
          <div>
            <dt className="font-mono uppercase tracking-[0.1em] text-[var(--fog)]">Created</dt>
            <dd className="mt-1 text-[var(--mist)]">{timestamp(card.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-mono uppercase tracking-[0.1em] text-[var(--fog)]">Updated</dt>
            <dd className="mt-1 text-[var(--mist)]">{timestamp(card.updatedAt)}</dd>
          </div>
        </dl>

        <div className="min-h-11">
          {originHref ? (
            <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-4" href={originHref}>
              Source meeting <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <p className="content-center text-sm text-[var(--fog)]">Source meeting unavailable</p>
          )}
        </div>

        <RatingWidget
          contentHash={card.contentHash}
          initialHistory={card.ratings}
          objectId={card.id}
          objectKind={card.kind}
          ventureId={card.ventureId}
        />
      </CardContent>
    </Card>
  );
}
