import { describe, expect, it } from "vitest";

import { buildLaunchBoard, HELD_VENTURES, LAUNCH_SET, shortTitle, ventureForApproval } from "./admin-launch-board";
import type { VentureImageRung } from "./admin-image-rungs";

function rung(over: Partial<VentureImageRung> = {}): VentureImageRung {
  return { date: "2026-08-28", slug: "s", rung: "search", fellToPlate: false, plateCount: 0, sampled: 10, malformed: 0, ...over };
}

function inputs(over: Partial<Parameters<typeof buildLaunchBoard>[0]> = {}) {
  return {
    ventures: [{ id: "caught-up", name: "Caught Up" }, { id: "kvorum", name: "Kvórum" }],
    deliveries: {}, slots: {}, images: {}, social: {}, blocking: {},
    ...over
  };
}

describe("launch board", () => {
  it("names the seven ventures the owner is launching, and holds the four he is not", () => {
    expect(LAUNCH_SET).toHaveLength(7);
    expect(LAUNCH_SET).toContain("personal-growth");
    expect(LAUNCH_SET).not.toContain("titty-tuesdays");
    expect(HELD_VENTURES).toContain("titty-tuesdays");
    expect(LAUNCH_SET.some((id) => (HELD_VENTURES as readonly string[]).includes(id))).toBe(false);
  });

  it("reads a venture that delivered and has nothing blocking as shipping", () => {
    const board = buildLaunchBoard(inputs({
      deliveries: { "caught-up": { date: "2026-08-28", url: "https://example.test/a" } }
    }));
    expect(board.rows[0]).toMatchObject({ state: "shipping", stateLabel: "Shipping" });
    expect(board.shippingCount).toBe(1);
  });

  it("puts a blocking item ahead of a delivery, because the board is about what needs a person", () => {
    const board = buildLaunchBoard(inputs({
      deliveries: { "caught-up": { date: "2026-08-28", url: null } },
      blocking: { "caught-up": { title: "Countersign the brief", href: "/admin?view=approvals" } }
    }));
    expect(board.rows[0]).toMatchObject({ state: "attention" });
    expect(board.verdict.tone).toBe("risk");
    expect(board.verdict.headline).toBe("1 of 2 ventures need you");
  });

  it("keeps a deliberately held room out of the blocked count", () => {
    // A room the owner stopped is not a fault, and showing it as one teaches the reader to ignore
    // the colour. The hold outranks a blocking item, not the other way round.
    const board = buildLaunchBoard(inputs({
      heldIds: ["kvorum"],
      blocking: { kvorum: { title: "Countersign the constitution", href: "/admin" } }
    }));
    expect(board.rows[1]).toMatchObject({ state: "held", stateLabel: "Held" });
    expect(board.blockingCount).toBe(0);
    expect(board.verdict.headline).toBe("Nothing is blocked");
  });

  it("warns when the last picture was the drawn plate even though nothing is blocked", () => {
    const board = buildLaunchBoard(inputs({
      deliveries: { "caught-up": { date: "2026-08-28", url: null } },
      images: { "caught-up": rung({ rung: "plate", fellToPlate: true, plateCount: 3 }) }
    }));
    expect(board.verdict.tone).toBe("warning");
    expect(board.verdict.detail).toContain("1 venture last shipped the drawn plate");
  });

  it("routes an approval to its venture by the id the inbox actually uses", () => {
    // Every id here is one the inbox carries today, so a rename shows up as a failing test rather
    // than as a blocker silently vanishing off the board.
    expect(ventureForApproval("KV-EDITORIAL-004")).toBe("kvorum");
    expect(ventureForApproval("BH-RESEARCH-001")).toBe("booksofhistory");
    expect(ventureForApproval("TS-SNAPSHOT-001")).toBe("tehdejsi-svet");
    expect(ventureForApproval("BOOK-INGEST-002")).toBe("door-money");
    expect(ventureForApproval("DEVSHARK-BANNER-001")).toBe("marketingshark");
  });

  it("prefers the longer prefix so a venture-specific id is not shadowed", () => {
    expect(ventureForApproval("APIFY-MMA-SOURCES-001")).toBe("mma-files");
    // The portfolio-wide Apify approval belongs to no single venture and must not land on one.
    expect(ventureForApproval("APIFY-ACCOUNT-001")).toBeNull();
    expect(ventureForApproval("BRAND-CLEARANCE-001")).toBeNull();
  });

  it("reports how old the needs-you column is, and calls more than a day stale", () => {
    const stale = buildLaunchBoard(inputs({ attentionAsOf: "2026-08-13", today: "2026-08-29" }));
    expect(stale.attention).toEqual({ asOf: "2026-08-13", ageDays: 16, stale: true });

    const fresh = buildLaunchBoard(inputs({ attentionAsOf: "2026-08-29", today: "2026-08-29" }));
    expect(fresh.attention.stale).toBe(false);

    // No collector run yet is not "zero days old".
    expect(buildLaunchBoard(inputs()).attention).toEqual({ asOf: null, ageDays: null, stale: false });
  });

  it("dates the verdict rather than asserting a stale blocker as today's fact", () => {
    const over = {
      blocking: { kvorum: { title: "Countersign the constitution", href: "/admin" } }
    };
    const stale = buildLaunchBoard(inputs({ ...over, attentionAsOf: "2026-08-13", today: "2026-08-29" }));
    expect(stale.verdict.headline).toBe("1 of 2 ventures needed you as of 2026-08-13");
    expect(stale.verdict.detail).toContain("16 days old");

    const fresh = buildLaunchBoard(inputs({ ...over, attentionAsOf: "2026-08-29", today: "2026-08-29" }));
    expect(fresh.verdict.headline).toBe("1 of 2 ventures need you");
  });

  it("cuts a long approval title at a word rather than mid-syllable", () => {
    expect(shortTitle("Allow BOOKSOFHISTORY to make guarded web-search research calls with the provider"))
      .toBe("Allow BOOKSOFHISTORY to make guarded web-search research calls with…");
    expect(shortTitle("Short enough")).toBe("Short enough");
    // A single unbroken run has no word to cut at and still has to fit.
    expect(shortTitle("x".repeat(90))).toBe(`${"x".repeat(68)}…`);
  });

  it("carries a venture with no record at all as ready rather than inventing a zero", () => {
    const board = buildLaunchBoard(inputs());
    expect(board.rows[1]).toMatchObject({
      state: "ready", lastDelivery: null, nextSlot: null, image: null, social: null, blocking: null
    });
    expect(board.verdict.detail).toBe("0 of 2 ventures have shipped.");
  });
});
