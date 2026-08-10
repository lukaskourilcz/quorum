import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deskWindow, readRenderedDesk } from "./rendered-desk";

const TODAY = "2026-08-09";

async function json(root: string, relative: string, value: unknown) {
  const absolute = path.join(root, "state", relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, typeof value === "string" ? value : JSON.stringify(value));
}

async function shipped(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "boardless-desk-"));
  await json(root, "edition/deliveries/2026-08-08.json", {
    date: "2026-08-08",
    status: "delivered",
    editionStatus: "edition",
    articleUrl: "https://caughtup-ai.vercel.app/articles/2026-08-08-openai-astra"
  });
  await json(root, "edition/archive/2026-08-08-abc.json", {
    schemaVersion: "edition-package/1",
    article: { cs: { frontmatter: { title: "OpenAI pozastavuje Astru", dek: "Model překročil práh." } } },
    image: { hero_path: "public/images/editions/x/hero.webp", alt_cs: "Řady serverových skříní." }
  });
  await json(root, "ventures/mma-files/articles/2026-08-08-am-ufc.json", {
    schemaVersion: "article/1",
    slug: "ufc-gamrot",
    status: "published",
    localizations: { en: { title: "Gamrot vs Salkilld", dek: "What to watch." } },
    image: { thumb_path: "ventures/mma-files/media/2026-08-08-am-ufc/thumb.webp", alt: "Two fighters." }
  });
  await json(root, "ventures/caught-up/datasets/2026-08-08-ai-facts.json", {
    dataset: "ai-facts",
    appendedIds: ["fact-021", "fact-022"]
  });
  return root;
}

describe("the three-day window", () => {
  it("is today and the two days before it, newest first", () => {
    expect(deskWindow(TODAY)).toEqual(["2026-08-09", "2026-08-08", "2026-08-07"]);
    // Crosses a month boundary without arithmetic of its own.
    expect(deskWindow("2026-09-01")).toEqual(["2026-09-01", "2026-08-31", "2026-08-30"]);
  });
});

describe("what shipped on a day", () => {
  it("builds a share card per article and lists the appends", async () => {
    const desk = await readRenderedDesk(TODAY, await shipped());
    expect(desk.days.map((day) => day.date)).toEqual(["2026-08-09", "2026-08-08", "2026-08-07"]);

    const [today, yesterday] = desk.days;
    expect(today?.empty).toBe(true);
    expect(yesterday?.empty).toBe(false);
    expect(yesterday?.articles.map((article) => article.ventureId).sort()).toEqual(["caught-up", "mma-files"]);
    expect(yesterday?.datasets).toEqual([{ ventureId: "caught-up", dataset: "ai-facts", added: 2 }]);
  });

  it("serves the picture it holds and explains the one it does not", async () => {
    const desk = await readRenderedDesk(TODAY, await shipped());
    const articles = desk.days[1]!.articles;
    const edition = articles.find((article) => article.ventureId === "caught-up")!;
    const mma = articles.find((article) => article.ventureId === "mma-files")!;

    // The edition's picture is delivered into the magazine's repository, so there are no bytes
    // here to show — and the card says that rather than showing a broken image.
    expect(edition.imageHref).toBeNull();
    expect(edition.imageNote).toContain("lives in the magazine");
    expect(edition.url).toContain("caughtup-ai.vercel.app");

    // MMA Files keeps its bytes in state, so the authed media route can serve the real thumbnail.
    expect(mma.imageHref).toBe(
      "/admin/api/mma-files/media?path=ventures%2Fmma-files%2Fmedia%2F2026-08-08-am-ufc%2Fthumb.webp"
    );
    expect(mma.imageNote).toBeNull();
  });

  it("refuses an image path the media route would not serve", async () => {
    const root = await shipped();
    await json(root, "ventures/mma-files/articles/2026-08-08-am-ufc.json", {
      schemaVersion: "article/1",
      slug: "ufc-gamrot",
      status: "published",
      localizations: { en: { title: "Gamrot vs Salkilld" } },
      image: { thumb_path: "../../../etc/passwd" }
    });
    const desk = await readRenderedDesk(TODAY, root);
    const mma = desk.days[1]!.articles.find((article) => article.ventureId === "mma-files")!;
    expect(mma.imageHref).toBeNull();
  });

  it("leaves a NO_EDITION day's article out, and says the day was quiet", async () => {
    const root = await shipped();
    await json(root, "edition/deliveries/2026-08-08.json", {
      date: "2026-08-08", status: "delivered", editionStatus: "no_edition"
    });
    const desk = await readRenderedDesk(TODAY, root);
    expect(desk.days[1]?.articles.some((article) => article.ventureId === "caught-up")).toBe(false);
  });

  it("counts a malformed record instead of failing the desk", async () => {
    const root = await shipped();
    await json(root, "edition/archive/2026-08-08-broken.json", "{ not json");
    const desk = await readRenderedDesk(TODAY, root);
    expect(desk.unreadable).toBeGreaterThan(0);
    expect(desk.days).toHaveLength(3);
  });

  it("writes nothing at all — it is a window, not a store", async () => {
    const source = await readFileList(await shipped());
    const root = await shipped();
    await readRenderedDesk(TODAY, root);
    expect(await readFileList(root)).toEqual(source);
  });
});

/** Every file under the root, so a write anywhere would show up as a difference. */
async function readFileList(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const walk = async (directory: string): Promise<string[]> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    const found = await Promise.all(entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [path.relative(root, absolute)];
    }));
    return found.flat();
  };
  return (await walk(root)).sort();
}
