import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminBooksofhistory } from "@/lib/admin-booksofhistory";
import { BooksofhistoryShortlistPanel } from "./booksofhistory-shortlist-panel";

const roots: string[] = [];
const fixtures = path.resolve(process.cwd(), "../contracts/fixtures");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtures, name), "utf8");
}

async function put(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

describe("BOOKSOFHISTORY shortlist panel", () => {
  it("renders the fixture ranking factors, brief decisions, cycle progress and radar state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-shortlist-panel-"));
    roots.push(root);
    const cycle = JSON.parse(await fixture("bh-cycle.valid.json")) as Record<string, unknown>;
    cycle.phase = "research";
    await Promise.all([
      put(root, "state/ventures/booksofhistory/shortlists/2026-08-12.json", await fixture("bh-shortlist.valid.json")),
      put(root, "state/ventures/booksofhistory/briefs/2026-08-12.json", await fixture("bh-research-brief.valid.json")),
      put(root, "state/ventures/booksofhistory/cycle.json", JSON.stringify(cycle))
    ]);

    const html = renderToStaticMarkup(<BooksofhistoryShortlistPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("Day B of cycle 1: researching 0 of 2.");
    expect(html).toContain("Válka s mloky");
    expect(html).toContain("Editorial priors");
    expect(html).toContain("czech relevance 100 × 14%");
    expect(html).toContain("Trend crossover");
    expect(html).toContain("The publishing history offers the strongest unused documented angle.");
    expect(html).toContain("No dated book or author anniversaries fall inside the next 60 days.");
    expect(html).not.toContain("state/ventures");
    expect(html).not.toContain("library.json");
    expect(html).not.toContain("coverRef");
    expect(html).not.toContain("<img");
  });

  it("shows a dated anniversary inside the next 60 days", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-shortlist-panel-radar-"));
    roots.push(root);
    const shortlist = JSON.parse(await fixture("bh-shortlist.valid.json")) as {
      entries: Array<{ factors: { anniversary: { multiplier: number; strength: number; events: unknown[] } } }>;
    };
    shortlist.entries[0]!.factors.anniversary = {
      multiplier: 1.1,
      strength: 0.8,
      events: [{ kind: "author-birth", milestone: 140, daysAway: 24 }]
    };
    await put(root, "state/ventures/booksofhistory/shortlists/2026-08-12.json", JSON.stringify(shortlist));

    const html = renderToStaticMarkup(<BooksofhistoryShortlistPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("author birth · 140 years");
    expect(html).toContain("in 24 days");
  });

  it("labels missing records instead of filling the workspace with examples", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-shortlist-panel-empty-"));
    roots.push(root);

    const html = renderToStaticMarkup(<BooksofhistoryShortlistPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("No cycle has been recorded yet.");
    expect(html).toContain("No valid shortlist is stored yet.");
    expect(html).toContain("No valid meeting brief is stored yet.");
  });
});
