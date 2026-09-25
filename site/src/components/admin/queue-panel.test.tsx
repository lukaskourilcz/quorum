import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminQueueItemView, AdminQueueSnapshot } from "@/lib/admin-queue/types";
import { QueuePanel, queueHref, type QueueFilters } from "./queue-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function item(overrides: Partial<AdminQueueItemView> = {}): AdminQueueItemView {
  return {
    id: "ms-2026-09-26-devshark-en-linkedin",
    sourceVentureId: "marketingshark",
    ventureKey: "devshark",
    ventureLabel: "devShark",
    platform: "linkedin",
    profileLabel: "devShark on LinkedIn",
    handle: null,
    locale: "en",
    contentKind: "carousel",
    caption: "Which selector wins: .card p or p.note?\n\n#css #frontend",
    captionLimit: 3_000,
    altText: "Slide 1: the question.",
    hashtags: ["#css", "#frontend"],
    frameCount: 5,
    frameHrefs: [1, 2, 3, 4, 5].map((slide) => `/admin/api/queue/frame/ms-2026-09-26-devshark-en-linkedin/${slide}`),
    publishWindow: { notBefore: "2026-09-26T06:00:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" },
    status: "draft",
    group: "waiting",
    checks: [
      { id: "schema", label: "Schema", state: "pass" },
      { id: "duplicate", label: "Duplicate", state: "pass" },
      { id: "accessibility", label: "Alt text", state: "pass" },
      { id: "budget", label: "Budget", state: "pass" },
      { id: "capability", label: "Capability", state: "fail" },
      { id: "authority", label: "Authority", state: "pending" }
    ],
    ownerChecks: "pending",
    contentHash: "a".repeat(64),
    supersedes: null,
    supersededBy: null,
    designLabHref: "/admin?venture=design-lab&tab=studio&brand=devshark",
    permalink: null,
    reason: null,
    nextSafeAction: null,
    gate: "The LinkedIn connection is not activated yet, so an approval queues the post and nothing sends.",
    schemaVersion: 2,
    createdAt: "2026-09-26T05:10:00.000Z",
    actions: { approve: true, edit: true, hold: true, reject: true, rerender: false },
    ...overrides
  };
}

function snapshot(items: AdminQueueItemView[], overrides: Partial<AdminQueueSnapshot> = {}): AdminQueueSnapshot {
  const counts = { waiting: 0, scheduled: 0, sending: 0, sent: 0, failed: 0, held: 0 };
  for (const entry of items) counts[entry.group] += 1;
  return {
    items,
    counts,
    ventures: [...new Map(items.map((entry) => [entry.ventureKey, entry.ventureLabel])).entries()].map(([id, label]) => ({ id, label, count: items.filter((entry) => entry.ventureKey === id).length })),
    unreadable: 0,
    dropped: { items: 0, events: 0, receipts: 0, health: 0, holds: 0 },
    unavailable: [],
    generatedAt: "2026-09-26T08:00:00.000Z",
    ...overrides
  };
}

const waiting: QueueFilters = { group: "waiting", venture: null, platform: null };
const render = (value: AdminQueueSnapshot, filters = waiting, writesConfigured = true) =>
  renderToStaticMarkup(<QueuePanel filters={filters} snapshot={value} writesConfigured={writesConfigured} />);

describe("the Queue panel", () => {
  it("says when nothing waits and when the next room sits", () => {
    const html = render(snapshot([]));
    expect(html).toContain("Nothing is waiting.");
    expect(html).toContain("marketingShark&#x27;s next room sits at 07:00.");
    expect(html).not.toContain("<button");
  });

  it("shows a waiting post with its frames, bounded caption, checks and every owner action", () => {
    const html = render(snapshot([item()]));
    expect(html).toContain("LinkedIn · devShark on LinkedIn");
    expect(html).toContain("Handle not connected yet");
    expect(html.match(/<img /gu)).toHaveLength(3);
    expect(html).toContain("Show all 5 frames");
    expect(html).toContain("of 3,000 characters");
    for (const label of ["Approve and publish now", "Approve for the window", "Edit", "Hold", "Reject", "Open in Design Lab", "Re-render"]) {
      expect(html, label).toContain(`>${label}<`);
    }
    expect(html).toContain('href="/admin?venture=design-lab&amp;tab=studio&amp;brand=devshark"');
    expect(html).toContain("Re-render redraws a marketingShark carousel from its Design Lab slides; this post has none.");
    expect(html).toContain('data-check="capability" data-state="fail"');
    expect(html).toContain(": fails</span>");
    expect(html).toContain(": not run yet</span>");
    expect(html).toContain("The LinkedIn connection is not activated yet");
    expect(html).toContain('aria-current="page"');
  });

  it("links a package-built post to its own article in the Design Lab and offers its re-render (quorum#575)", () => {
    const href = "/admin?venture=design-lab&tab=studio&brand=devshark&article=devshark%3Amarketingshark-2026-09-26-devshark%3A2026-09-26";
    const html = render(snapshot([item({ designLabHref: href, actions: { approve: true, edit: true, hold: true, reject: true, rerender: true } })]));
    expect(html).toContain(`href="${href.replaceAll("&", "&amp;")}"`);
    expect(html).toContain("Re-render draws the slides saved in the Design Lab into new frames");
  });

  it("keeps every write control inert and says why when the deployment cannot save", () => {
    const html = render(snapshot([item()]), waiting, false);
    expect(html).toContain('data-admin-state="write-disabled"');
    expect(html).toContain("This deployment cannot save queue actions");
    const buttons = html.match(/<button[^>]*>/gu) ?? [];
    const writes = buttons.filter((button) => !button.includes("aria-expanded"));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((button) => button.includes("disabled"))).toBe(true);
  });

  it("gives a failed post and an unconfirmed one each its next safe action, and no approval", () => {
    const failed = item({ id: "failed-item", status: "failed", group: "failed", reason: "Buffer refused the post.", nextSafeAction: "Nothing was published. Edit it to draft a corrected copy, or reject it.", actions: { approve: false, edit: true, hold: false, reject: true, rerender: false }, gate: null });
    const unconfirmed = item({ id: "unconfirmed-item", status: "needs_reconciliation", group: "failed", reason: "The publisher could not confirm whether the post went out.", nextSafeAction: "Check the profile for this post before anything else; the publisher will not send it again on its own.", actions: { approve: false, edit: false, hold: false, reject: false, rerender: false }, gate: null });
    const html = render(snapshot([failed, unconfirmed]), { ...waiting, group: "failed" });
    expect(html).toContain("Buffer refused the post.");
    expect(html).toContain("Nothing was published. Edit it to draft a corrected copy, or reject it.");
    expect(html).toContain("Check the profile for this post before anything else");
    expect(html).not.toContain("Approve and publish now");
    expect(html).toContain("Failed · needs reconciliation");
  });

  it("names unreadable queue files and an empty filtered view with a way back", () => {
    const html = render(snapshot([item()], { unreadable: 1, dropped: { items: 2, events: 0, receipts: 0, health: 0, holds: 0 } }), { group: "waiting", venture: null, platform: "threads" });
    expect(html).toContain("3 files in the social queue could not be read");
    expect(html).toContain("No waiting posts match these filters.");
    expect(html).toContain("Clear filters");
  });

  it("shows a sent post's permalink and a replaced post's successor", () => {
    const sent = item({ id: "sent-item", status: "published", group: "sent", permalink: "https://www.linkedin.com/feed/update/urn:li:share:1", actions: { approve: false, edit: false, hold: false, reject: false, rerender: false }, gate: null, ownerChecks: "pass" });
    const html = render(snapshot([sent]), { ...waiting, group: "sent" });
    expect(html).toContain("Open the published post");
    expect(html).toContain("approved by you");
    const replaced = item({ id: "old-item", status: "cancelled", group: "held", supersededBy: "old-item-r1", reason: "Replaced by old-item-r1.", actions: { approve: false, edit: false, hold: false, reject: false, rerender: false }, gate: null });
    expect(render(snapshot([replaced]), { ...waiting, group: "held" })).toContain("Replaced by <span class=\"font-mono\">old-item-r1</span>");
  });

  it("builds canonical filter URLs", () => {
    expect(queueHref(waiting)).toBe("/admin/queue");
    expect(queueHref({ group: "failed", venture: "devshark", platform: "linkedin" })).toBe("/admin/queue?status=failed&venture=devshark&platform=linkedin");
  });
});
