import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminMmaFiles } from "./admin-mma-files";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

function article(image?: Record<string, unknown>) {
  const content = {
    schemaVersion: "article/1",
    slug: "fixture-preview",
    localizations: {
      en: { title: "Fixture preview", dek: "A sourced dry article.", bodyMDX: "[Alex Example](/fighters/ufc/alex-example) has a source." },
      cs: { title: "Zkušební pozvánka", dek: "Ozdrojovaný suchý článek.", bodyMDX: "[Alex Example](/fighters/ufc/alex-example) má zdroj." }
    },
    format: "fight-week-preview",
    sources: [{ kind: "internal", ref: "FIXTURE:ARTICLE" }],
    image: {
      hero_path: "public/images/articles/fixture-preview/hero.svg",
      thumb_path: "public/images/articles/fixture-preview/thumb.svg",
      width: 1600,
      height: 900,
      alt_en: "Fixture cover",
      alt_cs: "Zkušební obálka",
      license: {
        name: "BoardlessAI deterministic",
        author: "BoardlessAI FRAME",
        source_url: "https://boardless-ai.vercel.app/",
        attribution_html: "Artwork by BoardlessAI FRAME"
      },
      origin: "svg",
      hero_bytes_base64: "PHN2Zy8+",
      thumb_bytes_base64: "PHN2Zy8+",
      ...image
    },
    heroSpec: { template: "type-led", bindings: { headline: "Fixture" } },
    fighterRefs: ["ufc:alex-example"],
    eventRef: "ufc:event:fixture",
    organization: "ufc",
    publishAt: "2026-08-01T08:00:00.000Z",
    slot: "am",
    status: "published"
  };
  return { ...content, packageHash: createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex") };
}

describe("MMA Files admin projection", () => {
  it("renders hash-checked bilingual articles, platform captions and calendar state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-files-admin-"));
    roots.push(root);
    const directories = [
      "state/ventures/mma-files/articles", "state/ventures/mma-files/social/packs",
      "state/ventures/mma-files/slates", "state/ratings/mma-files"
    ];
    await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    const packageValue = article();
    await writeFile(path.join(root, "state/ventures/mma-files/articles/2026-08-01-am-fixture-preview.json"), JSON.stringify(packageValue));
    await writeFile(path.join(root, "state/ventures/mma-files/social/packs/article-2026-08-01-am-fixture-preview.json"), JSON.stringify({
      schemaVersion: "social-variant/1",
      articleRef: "article:2026-08-01:am:fixture-preview",
      variants: [
        { id: "A", captions: { en: { instagram: "English A", threads: "English A short" }, cs: { instagram: "Česky A", threads: "Česky A krátce" } }, designAxes: { templateFamily: "stat-led", colorScheme: "orange-dark", headlineFraming: "fact-first", captionTone: "plain" } },
        { id: "B", captions: { en: { instagram: "English B", threads: "English B short" }, cs: { instagram: "Česky B", threads: "Česky B krátce" } }, designAxes: { templateFamily: "question-led", colorScheme: "paper-dark", headlineFraming: "question", captionTone: "curious" } }
      ],
      assignmentProtocolRef: "state/ventures/mma-files/social/ASSIGNMENT.md",
      status: "draft"
    }));
    await writeFile(path.join(root, "state/ventures/mma-files/slates/2026-08-01.json"), JSON.stringify({
      schemaVersion: "editorial-slate/1", date: "2026-08-01",
      slots: [
        { slot: "am", format: "fight-week-preview", rationale: "The event is close.", status: "assigned" },
        { slot: "pm", format: "fighter-profile", rationale: "No sourced profile cleared the bar.", status: "killed", killedReason: "No complete file." }
      ]
    }));
    const rating = { schemaVersion: "rating/1", id: "r-2026-08-01-abcd", ventureId: "mma-files", objectKind: "article", objectRef: { id: "article:2026-08-01:am:fixture-preview", contentHash: `sha256:${packageValue.packageHash.slice(0, 12)}` }, rating: "good", ratedAt: "2026-08-01T12:00:00.000Z" };
    await writeFile(path.join(root, "state/ratings/mma-files/ledger.jsonl"), `${JSON.stringify(rating)}\n`);
    const snapshot = await readAdminMmaFiles(root);
    expect(snapshot.unreadable).toEqual([]);
    expect(snapshot.articles[0]).toMatchObject({ id: "article:2026-08-01:am:fixture-preview", organization: "ufc", placements: ["Nejnovější", "UFC"], weekStart: "2026-07-27", localizations: { en: { title: "Fixture preview" }, cs: { title: "Zkušební pozvánka" } }, ratings: [{ rating: "good" }] });
    expect(snapshot.socialPacks[0]?.variants.map((variant) => variant.id)).toEqual(["A", "B"]);
    expect(snapshot.calendar[0]?.slots.map((slot) => slot.articleStatus)).toEqual(["published", null]);
    expect(snapshot.socialPacks[0]?.variants[0].captions.en).toEqual({ instagram: "English A", threads: "English A short" });
  });

  it("projects source freshness, quotas and independent bout corroboration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-files-health-"));
    roots.push(root);
    const directories = [
      "config",
      "state/ventures/fightaiq/source-snapshots",
      "state/mma/source-quota",
      "state/mma/events/oktagon",
      "state/mma/bouts/oktagon"
    ];
    await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    await writeFile(path.join(root, "config/mma-sources.json"), JSON.stringify({
      schemaVersion: "mma-sources/1",
      verifiedAt: "2026-08-09",
      sources: [
        { id: "wikimedia", name: "Wikimedia", state: "wired", access: "api" },
        { id: "apify-tapology-oktagon", name: "Tapology", state: "proposed", access: "apify" }
      ]
    }));
    await writeFile(path.join(root, "state/ventures/fightaiq/source-snapshots/2026-08-09.json"), JSON.stringify({
      schemaVersion: "fightaiq-source-snapshot/1",
      retrievedAt: "2026-08-09T10:00:00.000Z",
      sources: [{ sourceId: "wikimedia", status: "success", items: [] }]
    }));
    await writeFile(path.join(root, "state/mma/source-quota/apify.json"), JSON.stringify({ estimatedUsedUsd: 0, shareCapUsd: 3 }));
    await writeFile(path.join(root, "state/mma/events/oktagon/event.json"), JSON.stringify({ org: "oktagon" }));
    await writeFile(path.join(root, "state/mma/bouts/oktagon/bout.json"), JSON.stringify({
      org: "oktagon",
      status: "confirmed",
      sourceRefs: ["source:wikipedia:fixture", "source:the-odds-api:fixture"]
    }));
    const snapshot = await readAdminMmaFiles(root, new Date("2026-08-09T12:00:00.000Z"));
    expect(snapshot.predictions.lastSnapshotAgeHours).toBe(2);
    expect(snapshot.predictions.organizations.oktagon).toMatchObject({ events: 1, bouts: 1, confirmed: 1 });
    expect(snapshot.predictions.corroboration.multipleProviders).toBe(1);
    expect(snapshot.predictions.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "wikimedia", freshnessHours: 2, lastStatus: "success" }),
      expect.objectContaining({ id: "apify-tapology-oktagon", quota: "$0.00 / $3.00 MMA share" })
    ]));
  });
});

/**
 * The hero the package stored, and the credit the licence requires.
 *
 * Both used to be guessed. The URL was built as hero.svg no matter what the package said, so a
 * licensed WebP photograph — every photo article since the desk started buying them — asked for
 * a file that was never written. The licence block was not read at all, which matters more: CC BY
 * and CC BY-SA oblige whoever shows the picture to name the author.
 */
describe("an article's hero in the admin projection", () => {
  async function snapshotOf(image: Record<string, unknown>) {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-files-hero-"));
    roots.push(root);
    await mkdir(path.join(root, "state/ventures/mma-files/articles"), { recursive: true });
    await mkdir(path.join(root, "state/ventures/mma-files/media/2026-08-01-am-fixture-preview"), { recursive: true });
    const packageValue = article(image);
    const heroPath = String((packageValue.image as Record<string, unknown>).hero_path);
    const extension = /\.(webp|png|svg)$/u.exec(heroPath)?.[1];
    if (!extension) throw new Error("Fixture hero extension is invalid");
    await writeFile(path.join(root, `state/ventures/mma-files/media/2026-08-01-am-fixture-preview/hero.${extension}`), "hero");
    await writeFile(
      path.join(root, "state/ventures/mma-files/articles/2026-08-01-am-fixture-preview.json"),
      JSON.stringify(packageValue)
    );
    return readAdminMmaFiles(root);
  }

  it("points at the encoding the package actually stored", async () => {
    const snapshot = await snapshotOf({
      hero_path: "public/images/articles/fixture-preview/hero.webp",
      thumb_path: "public/images/articles/fixture-preview/thumb.webp",
      origin: "photo",
      license: {
        name: "CC BY",
        author: "Prensa TV Pública",
        source_url: "https://commons.wikimedia.org/w/index.php?curid=39657163",
        attribution_html: "<span>Prensa TV Pública</span> · CC BY"
      }
    });
    const hero = snapshot.articles[0]?.hero;
    expect(hero?.url).toContain(encodeURIComponent("2026-08-01-am-fixture-preview/hero.webp"));
    expect(hero?.url).not.toContain("hero.svg");
    // Markup in the stored line is flattened, never handed to the page as HTML.
    expect(hero?.credit).toBe("Prensa TV Pública · CC BY");
    expect(hero?.license).toBe("CC BY");
  });

  it("reads the package's own alt text, and falls back to Czech when English is absent", async () => {
    const both = await snapshotOf({});
    expect(both.articles[0]?.hero?.alt).toEqual({ en: "Fixture cover", cs: "Zkušební obálka" });
    const czechOnly = await snapshotOf({ alt_en: undefined });
    expect(czechOnly.articles[0]?.hero?.alt).toEqual({ en: "Zkušební obálka", cs: "Zkušební obálka" });
  });

  it("drops the picture rather than showing it without a credit", async () => {
    const snapshot = await snapshotOf({
      license: {
        name: "CC BY-SA",
        author: "Somebody",
        source_url: "https://commons.wikimedia.org/",
        attribution_html: "   "
      }
    });
    // The article still reads; only the unattributable image is withheld.
    expect(snapshot.articles[0]?.slug).toBe("fixture-preview");
    expect(snapshot.articles[0]?.hero).toBeNull();
  });

  it("drops a claimed hero whose stored media file is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-files-hero-missing-"));
    roots.push(root);
    await mkdir(path.join(root, "state/ventures/mma-files/articles"), { recursive: true });
    await writeFile(
      path.join(root, "state/ventures/mma-files/articles/2026-08-01-am-fixture-preview.json"),
      JSON.stringify(article())
    );
    const snapshot = await readAdminMmaFiles(root);
    expect(snapshot.articles[0]?.hero).toBeNull();
  });
});
