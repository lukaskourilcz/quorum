import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminSocialArchive } from "./admin-state";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function localePack(locale: "en" | "cs") {
  const frames = [1, 2, 3, 4].map(
    (number) => `/social/2026-08-04/${locale}/frame-0${number}.webp`
  );
  return {
    destination: `https://caught-up.example/${locale === "cs" ? "cs/" : ""}articles/test`,
    instagram: { caption: `${locale} Instagram`, hashtags: ["ai", "news", "tech", "caughtup", "daily"], frames },
    threads: { text: `${locale} Threads`, hashtags: [], frames }
  };
}

describe("admin social archive", () => {
  it("loads bilingual packs and their draft queue state newest first", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-admin-social-"));
    roots.push(root);
    const packs = path.join(root, "state", "social", "packs");
    const queue = path.join(root, "state", "social", "queue");
    await Promise.all([mkdir(packs, { recursive: true }), mkdir(queue, { recursive: true })]);
    const en = localePack("en");
    const cs = localePack("cs");
    await writeFile(path.join(packs, "2026-08-04.json"), JSON.stringify({
      schemaVersion: "social-pack/1",
      date: "2026-08-04",
      editionRef: "a".repeat(64),
      byLocale: { en, cs },
      quoteCard: {
        frame: "/social/2026-08-04/quote.webp",
        sourceTurnRef: "meetings/2026-08-04-cu-edition#turn-2"
      }
    }));
    for (const locale of ["en", "cs"] as const) {
      for (const channel of ["instagram", "threads"] as const) {
        await writeFile(path.join(queue, `2026-08-04-${locale}-${channel}.json`), JSON.stringify({
          channel,
          status: "draft",
          publishWindow: {
            notBefore: "2026-08-04T04:00:00.000Z",
            notAfter: "2026-08-07T04:00:00.000Z"
          }
        }));
      }
    }

    const archive = await readAdminSocialArchive(root);

    expect(archive.unreadableFiles).toEqual([]);
    expect(archive.packs).toHaveLength(1);
    expect(archive.packs[0]).toMatchObject({
      date: "2026-08-04",
      byLocale: {
        en: { destination: "https://caught-up.example/articles/test" },
        cs: { destination: "https://caught-up.example/cs/articles/test" }
      }
    });
    expect(archive.packs[0]?.queue.map((item) => item.status)).toEqual(Array(4).fill("draft"));
  });

  it("reports a malformed pack without projecting unsafe image paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-admin-social-"));
    roots.push(root);
    const packs = path.join(root, "state", "social", "packs");
    await mkdir(packs, { recursive: true });
    await writeFile(path.join(packs, "2026-08-04.json"), JSON.stringify({
      schemaVersion: "social-pack/1",
      date: "2026-08-04",
      editionRef: "a".repeat(64),
      byLocale: {
        en: localePack("en"),
        cs: {
          ...localePack("cs"),
          instagram: { ...localePack("cs").instagram, frames: ["https://evil.example/frame.webp"] }
        }
      },
      quoteCard: {
        frame: "/social/2026-08-04/quote.webp",
        sourceTurnRef: "meetings/2026-08-04-cu-edition#turn-2"
      }
    }));

    await expect(readAdminSocialArchive(root)).resolves.toEqual({
      packs: [],
      unreadableFiles: ["2026-08-04.json"]
    });
  });
});
