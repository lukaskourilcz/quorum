import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readStudioArticles } from "./carousel-summaries";

vi.mock("server-only", () => ({}));

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("the Design Lab summary rail", () => {
  it("keeps both BOOKSOFHISTORY locale records as distinct decks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-summary-rail-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/carousel-studio/summaries/booksofhistory");
    await mkdir(directory, { recursive: true });
    const summaries = (["cs", "en"] as const).map((locale) => buildCarouselSummary({
      venture: "booksofhistory",
      locale,
      slug: "serial-to-book",
      date: "2026-08-14",
      title: locale === "cs" ? "Příběh vydání knihy" : "The book's publication story",
      dek: locale === "cs" ? "Doložený příběh vydání." : "A sourced publication story.",
      points: locale === "cs"
        ? ["První karta příběhu.", "Druhá karta příběhu.", "Třetí karta příběhu."]
        : ["The first story card.", "The second story card.", "The third story card."],
      hasHero: false,
      heroCredit: null
    }));
    for (const summary of summaries) {
      await writeFile(
        path.join(directory, `${summary.date}-${summary.slug}-${summary.locale}.json`),
        `${JSON.stringify(summary, null, 2)}\n`
      );
    }

    const rail = await readStudioArticles(root);
    expect(rail).toHaveLength(2);
    expect(rail.map(({ summary }) => summary.locale).sort()).toEqual(["cs", "en"]);
    expect(new Set(rail.map(({ summary }) => summary.slug))).toEqual(new Set(["serial-to-book"]));
    expect(new Set(rail.map(({ id }) => id)).size).toBe(2);
    expect(rail.every(({ venture, origin }) => venture === "booksofhistory" && origin === "recorded")).toBe(true);
  });

  it("shows a recorded Tehdejsi svet feature once, with Czech as the primary rail locale", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-summary-rail-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/carousel-studio/summaries/tehdejsi-svet");
    await mkdir(directory, { recursive: true });
    const summary = buildCarouselSummary({
      venture: "tehdejsi-svet",
      locale: "cs",
      slug: "ts-2026-08-14-synthetic-memory",
      date: "2026-08-14",
      title: "Krátká znělka uzavírala den.",
      dek: "Syntetický popis ověřuje pouze cestu do studia.",
      points: [
        "První smyšlená karta.",
        "Druhá smyšlená karta.",
        "Třetí smyšlená karta."
      ],
      hasHero: false,
      heroCredit: null
    });
    await writeFile(
      path.join(directory, `${summary.date}-${summary.slug}.json`),
      `${JSON.stringify(summary, null, 2)}\n`
    );

    const rail = await readStudioArticles(root);
    expect(rail).toHaveLength(1);
    expect(rail[0]).toMatchObject({
      id: `tehdejsi-svet:${summary.slug}:${summary.date}`,
      venture: "tehdejsi-svet",
      ventureLabel: "Tehdejší svět",
      origin: "recorded",
      summary: { locale: "cs" }
    });
  });
});
