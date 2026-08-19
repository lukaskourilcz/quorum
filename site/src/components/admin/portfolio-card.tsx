import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { AdminCard, AdminCardContent, AdminEntityBadge, AdminStatusBadge } from "./admin-primitives";
import type { AdminCard as AdminPortfolioCard } from "@/lib/admin-portfolio";
import { formatDate, formatDateTime } from "@/lib/utils";

function statusTone(status: string): "neutral" | "information" | "success" | "warning" | "destructive" {
  if (["approved", "accepted", "published", "shortlist", "shipped"].includes(status)) return "success";
  if (["bad", "failed", "killed", "vetoed"].includes(status)) return "destructive";
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
            <p className="mt-3 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground)]">
              Saved rating: <span className="capitalize">{currentRating.rating}</span>
            </p>
          ) : null}
        </div>

        {imageAssets.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {imageAssets.slice(0, 4).map((source, index) => (
              <a
                className="admin-focus-ring overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)]"
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
          <div className="border-y border-[var(--admin-border)] py-4">
            <p className="font-mono text-[length:var(--admin-type-label)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Attached assets</p>
            <ul className="mt-2 grid gap-1 break-all text-[length:var(--admin-type-control)] text-[var(--admin-foreground)]">
              {otherAssets.map((source) => <li key={source}>{source}</li>)}
            </ul>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 border-y border-[var(--admin-border)] py-4 text-[length:var(--admin-type-control)]">
          <div>
            <dt className="font-mono uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Created</dt>
            <dd className="admin-tabular mt-1 text-[var(--admin-foreground)]">{timestamp(card.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-mono uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Updated</dt>
            <dd className="admin-tabular mt-1 text-[var(--admin-foreground)]">{timestamp(card.updatedAt)}</dd>
          </div>
        </dl>

        <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2">
          {detailHref ? (
            <Link className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)] underline underline-offset-4" href={detailHref}>
              Read full notes <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
          {originHref ? (
            <Link className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-section-accent)] underline underline-offset-4" href={originHref}>
              Source meeting <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <AdminStatusBadge tone="neutral">Source meeting unavailable</AdminStatusBadge>
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
