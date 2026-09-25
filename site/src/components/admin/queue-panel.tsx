"use client";

import Link from "next/link";
import {
  QUEUE_GROUP_LABELS,
  QUEUE_GROUPS,
  QUEUE_PLATFORM_LABELS,
  QUEUE_PLATFORMS,
  type AdminQueueSnapshot,
  type QueueGroup,
  type QueuePlatform
} from "@/lib/admin-queue/types";
import { AdminEmptyState, AdminStateMessage } from "./admin-primitives";
import { QueueCard } from "./queue-card";

export interface QueueFilters {
  group: QueueGroup;
  venture: string | null;
  platform: QueuePlatform | null;
}

export function queueHref(filters: QueueFilters): string {
  const query = new URLSearchParams();
  if (filters.group !== "waiting") query.set("status", filters.group);
  if (filters.venture) query.set("venture", filters.venture);
  if (filters.platform) query.set("platform", filters.platform);
  const search = query.toString();
  return search ? `/admin/queue?${search}` : "/admin/queue";
}

const tabClass = "admin-focus-ring flex min-h-[var(--admin-touch-target)] shrink-0 items-center gap-2 rounded-[var(--admin-radius-sm)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground-muted)] data-[active=true]:bg-[var(--admin-surface)] data-[active=true]:text-[var(--admin-foreground)]";
const chipClass = "admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center rounded-full border border-[var(--admin-border)] px-3 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground-muted)] data-[active=true]:border-[var(--admin-border-strong)] data-[active=true]:bg-[var(--admin-surface-selected)] data-[active=true]:text-[var(--admin-foreground)] md:min-h-[var(--admin-control-height)]";

function emptyCopy(group: QueueGroup, filtered: boolean): { title: string; description: string } {
  if (filtered) return { title: `No ${QUEUE_GROUP_LABELS[group].toLowerCase()} posts match these filters.`, description: "Clear the venture or platform filter to see the rest." };
  if (group === "waiting") return { title: "Nothing is waiting.", description: "marketingShark's next room sits at 07:00." };
  return { title: `Nothing is ${QUEUE_GROUP_LABELS[group].toLowerCase()} right now.`, description: "Posts move here on their own as they are approved, sent or stopped." };
}

/**
 * The Queue: every social post that waits for the owner, and what became of the ones that no
 * longer do. Filters are links, so a view is a URL that reloads, bookmarks and goes back.
 */
export function QueuePanel({ snapshot, filters, writesConfigured }: { snapshot: AdminQueueSnapshot; filters: QueueFilters; writesConfigured: boolean }) {
  const scoped = snapshot.items.filter((item) => (!filters.venture || item.ventureKey === filters.venture) && (!filters.platform || item.platform === filters.platform));
  const visible = scoped.filter((item) => item.group === filters.group);
  const unreadable = snapshot.unreadable + snapshot.dropped.items;
  const filtered = filters.venture !== null || filters.platform !== null;
  const empty = emptyCopy(filters.group, filtered);

  return (
    <div className="grid min-w-0 gap-4" data-admin-queue>
      {!writesConfigured ? (
        <AdminStateMessage
          description="Approving, editing, holding and rejecting need the production GitHub token listed in NEEDED.md. The posts below are shown as they are."
          state="write-disabled"
          title="This deployment cannot save queue actions"
        />
      ) : null}
      {unreadable > 0 ? (
        <AdminStateMessage
          description={`${unreadable} ${unreadable === 1 ? "file" : "files"} in the social queue could not be read as a queue item, so ${unreadable === 1 ? "it is" : "they are"} not listed and cannot be approved.`}
          state="malformed"
          title="Some queue files are unreadable"
        />
      ) : null}
      {snapshot.unavailable.length > 0 ? (
        <AdminStateMessage description={snapshot.unavailable.join(". ")} state="unavailable" title="Part of the queue's context could not be read" />
      ) : null}

      <nav aria-label="Queue status" className="flex max-w-full gap-1 overflow-x-auto rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-1" data-horizontal-scroll>
        {QUEUE_GROUPS.map((group) => {
          const count = scoped.filter((item) => item.group === group).length;
          return (
            <Link aria-current={filters.group === group ? "page" : undefined} className={tabClass} data-active={filters.group === group} href={queueHref({ ...filters, group })} key={group}>
              {QUEUE_GROUP_LABELS[group]}
              <span className="admin-tabular text-[length:var(--admin-type-label)] text-[var(--admin-foreground-subtle)]">{count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-3 md:grid-cols-2">
        <nav aria-label="Filter by venture" className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[length:var(--admin-type-label)] font-medium text-[var(--admin-foreground-muted)]">Venture</span>
          <Link aria-current={filters.venture === null ? "page" : undefined} className={chipClass} data-active={filters.venture === null} href={queueHref({ ...filters, venture: null })}>All</Link>
          {snapshot.ventures.map((venture) => (
            <Link aria-current={filters.venture === venture.id ? "page" : undefined} className={chipClass} data-active={filters.venture === venture.id} href={queueHref({ ...filters, venture: venture.id })} key={venture.id}>
              {venture.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter by platform" className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[length:var(--admin-type-label)] font-medium text-[var(--admin-foreground-muted)]">Platform</span>
          <Link aria-current={filters.platform === null ? "page" : undefined} className={chipClass} data-active={filters.platform === null} href={queueHref({ ...filters, platform: null })}>All</Link>
          {QUEUE_PLATFORMS.map((platform) => (
            <Link aria-current={filters.platform === platform ? "page" : undefined} className={chipClass} data-active={filters.platform === platform} href={queueHref({ ...filters, platform })} key={platform}>
              {QUEUE_PLATFORM_LABELS[platform]}
            </Link>
          ))}
        </nav>
      </div>

      {visible.length === 0 ? (
        <AdminEmptyState
          action={filtered ? <Link className="admin-focus-ring rounded-sm text-[length:var(--admin-type-control)] text-[var(--admin-link)] underline-offset-4 hover:underline" href={queueHref({ group: filters.group, venture: null, platform: null })}>Clear filters</Link> : undefined}
          description={empty.description}
          title={empty.title}
        />
      ) : (
        <ul aria-label={`${QUEUE_GROUP_LABELS[filters.group]} posts`} className="m-0 grid list-none gap-4 p-0">
          {visible.map((item) => <li className="min-w-0" key={item.id}><QueueCard item={item} /></li>)}
        </ul>
      )}
    </div>
  );
}
