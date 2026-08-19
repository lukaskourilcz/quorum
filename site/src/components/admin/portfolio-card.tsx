import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { AdminCard, AdminCardContent, AdminEntityBadge, AdminStatusBadge } from "./admin-primitives";
import type { AdminCard as AdminPortfolioCard } from "@/lib/admin-portfolio";
import { formatDate, formatDateTime } from "@/lib/utils";

function statusTone(status: string): "neutral" | "information" | "success" | "warning" | "destructive" {
  if (["approved", "accepted", "published", "shortlist", "shipped"].includes(status)) return "success";
  if (["bad", "failed", "killed", "vetoed", "archived"].includes(status)) return "destructive";
  if (["owner_rated", "queued", "deferred", "proposed"].includes(status)) return "warning";
  if (["live", "in_progress"].includes(status)) return "information";
  return "neutral";
}

function timestamp(value: string | null): string {
  if (!value) return "Not recorded";
  return value.includes("T") ? formatDateTime(value) : formatDate(value);
}

export function isAdminImageAsset(source: string): boolean {
  return /^\/.+\.(?:png|jpe?g|webp|svg)$/iu.test(source);
}

export function PortfolioCard({ card, originHref }: { card: AdminPortfolioCard; originHref: string | null }) {
  const detailHref = card.detailPath
    ? `/admin/files/${card.detailPath.split("/").map(encodeURIComponent).join("/")}`
    : null;
  const currentRating = card.ratings[0] ?? null;
  const imageAssets = card.media.filter(isAdminImageAsset);
  const otherAssets = card.media.filter((source) => !isAdminImageAsset(source));
  return (
    <AdminCard className="min-w-0">
      <AdminCardContent className="grid h-full gap-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AdminEntityBadge>{card.kind.replaceAll("-", " ")}</AdminEntityBadge>
            <AdminStatusBadge tone={card.graduation ? statusTone(currentRating?.rating ?? card.status) : statusTone(card.status)}>
              {card.graduation ?? card.status.replaceAll("_", " ")}
            </AdminStatusBadge>
          </div>
          <h3 className="mt-3 text-[length:var(--admin-type-section)] font-semibold leading-tight">{card.title}</h3>
          <p className="mt-2 line-clamp-5 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{card.summary}</p>
          {currentRating ? (
            <p className="mt-3 text-sm font-medium text-[var(--mist)]">
              Saved rating: <span className="capitalize">{currentRating.rating}</span>
            </p>
          ) : null}
        </div>

        {imageAssets.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {imageAssets.slice(0, 4).map((source, index) => (
              <a
                className="overflow-hidden rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)]"
                href={source}
                key={source}
                rel="noreferrer"
                target="_blank"
              >
                <Image alt={`Open ${card.title} asset ${index + 1}`} height={320} src={source} unoptimized width={320} />
              </a>
            ))}
          </div>
        ) : null}

        {otherAssets.length ? (
          <div className="border-y border-[var(--border)] py-4">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Attached assets</p>
            <ul className="mt-2 grid gap-1 break-all text-sm text-[var(--mist)]">
              {otherAssets.map((source) => <li key={source}>{source}</li>)}
            </ul>
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

        <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2">
          {detailHref ? (
            <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--foreground)] underline underline-offset-4" href={detailHref}>
              Read full notes <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
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
      </AdminCardContent>
    </AdminCard>
  );
}
