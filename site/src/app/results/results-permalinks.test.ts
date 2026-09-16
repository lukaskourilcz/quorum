import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getDailyResults } = await import("@/lib/daily-results");
const { generateStaticParams, generateMetadata } = await import("./[date]/page");
const sitemap = (await import("../sitemap")).default;

/**
 * The per-day permalink is the one surface of #538 that did not already exist, and it is only
 * distribution if the pages and the sitemap agree about which days there are. Asserted against
 * the committed receipts rather than a fixture, so a day that stops being readable fails here.
 */
describe("the per-day report permalinks", () => {
  it("has one page per recorded day and no page for a day with no record", async () => {
    const days = await getDailyResults();
    expect(days.length).toBeGreaterThan(0);
    expect((await generateStaticParams()).map((entry) => entry.date).sort())
      .toEqual(days.map((day) => day.date).sort());
  });

  it("names the day in each permalink's title and claims nothing for an unrecorded date", async () => {
    const [newest] = await getDailyResults();
    const recorded = await generateMetadata({ params: Promise.resolve({ date: newest!.date }) });
    expect(recorded.title).toContain("Day report");
    expect(recorded.description).toBeTruthy();
    // 1970 is before the company existed, so there is no record to describe and the metadata
    // must not invent a day. The page itself answers a request for it with notFound().
    const absent = await generateMetadata({ params: Promise.resolve({ date: "1970-01-01" }) });
    expect(absent.title).toBe("Day report");
    expect(absent.description).toBeUndefined();
  });

  it("lists every permalink in the sitemap", async () => {
    const days = await getDailyResults();
    const urls = new Set((await sitemap()).map((entry) => entry.url));
    for (const day of days) {
      expect([...urls].some((url) => url.endsWith(`/results/${day.date}`)), day.date).toBe(true);
    }
  });
});
