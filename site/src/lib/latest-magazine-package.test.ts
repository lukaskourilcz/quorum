import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  latestMagazinePackage,
  newestDeliveredEdition,
  packageThumbnail
} from "./latest-magazine-package";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function editionRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "latest-magazine-"));
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  const archive = path.join(root, "state", "edition", "archive");
  const deliveries = path.join(root, "state", "edition", "deliveries");
  await Promise.all([mkdir(archive, { recursive: true }), mkdir(deliveries, { recursive: true })]);

  const edition = async (date: string, hash: string, body: Record<string, unknown>) => {
    await Promise.all([
      writeFile(path.join(deliveries, `${date}.json`), JSON.stringify({
        date,
        packageHash: hash,
        status: "delivered",
        editionStatus: "edition",
        articleUrl: `https://example.test/${date}`
      })),
      writeFile(path.join(archive, `${date}-${hash}.json`), JSON.stringify(body))
    ]);
  };

  const quietDay = async (date: string, hash: string) => {
    await Promise.all([
      writeFile(path.join(deliveries, `${date}.json`), JSON.stringify({
        date,
        packageHash: hash,
        status: "delivered",
        editionStatus: "no_edition"
      })),
      writeFile(path.join(archive, `${date}-${hash}.json`), JSON.stringify({}))
    ]);
  };

  return { root, archive, deliveries, edition, quietDay };
}

const PUBLISHED = {
  article: { cs: { frontmatter: { title: "Headline" } } },
  image: { thumb_bytes_base64: "Ynl0ZXM=", thumb_path: "public/images/editions/x/thumb.svg" }
};

describe("the newest package a magazine room delivered", () => {
  it("returns the edition, its date and the address the receipt recorded", async () => {
    const repository = await editionRepository();
    await repository.edition("2026-08-19", "package", PUBLISHED);

    const newest = await latestMagazinePackage("caught-up");

    expect(newest?.date).toBe("2026-08-19");
    expect(newest?.articleUrl).toBe("https://example.test/2026-08-19");
    expect(packageThumbnail(newest!.delivered)?.mediaType).toBe("image/svg+xml; charset=utf-8");
  });

  /*
   * The bug this resolver exists to prevent.
   *
   * A day with nothing to publish still writes a delivered receipt and still archives a package,
   * and that package has no article and no picture. Two surfaces answering "which package is the
   * newest" separately disagreed on exactly this day: the card showed yesterday's headline and the
   * route serving its picture answered with the empty package, so the picture came back 404.
   */
  it("looks past a no-edition day, so the card and its picture name one package", async () => {
    const repository = await editionRepository();
    await repository.edition("2026-08-19", "package", PUBLISHED);
    await repository.quietDay("2026-08-20", "quiet");

    const newest = await latestMagazinePackage("caught-up");

    expect(newest?.date).toBe("2026-08-19");
    expect(packageThumbnail(newest!.delivered)).not.toBeNull();
  });

  it("skips a receipt that does not say the edition was delivered", async () => {
    const repository = await editionRepository();
    await repository.edition("2026-08-19", "package", PUBLISHED);
    await writeFile(path.join(repository.deliveries, "2026-08-21.json"), JSON.stringify({
      date: "2026-08-21",
      packageHash: "failed",
      status: "failed",
      editionStatus: "edition"
    }));

    expect((await newestDeliveredEdition())?.date).toBe("2026-08-19");
  });

  it("holds nothing when the package behind the newest receipt is no longer kept", async () => {
    const repository = await editionRepository();
    await writeFile(path.join(repository.deliveries, "2026-08-19.json"), JSON.stringify({
      date: "2026-08-19",
      packageHash: "deleted-on-delivery",
      status: "delivered",
      editionStatus: "edition"
    }));

    expect(await newestDeliveredEdition()).not.toBeNull();
    expect(await latestMagazinePackage("caught-up")).toBeNull();
  });

  it("has nothing to show a room that has delivered nothing", async () => {
    await editionRepository();

    expect(await latestMagazinePackage("caught-up")).toBeNull();
    expect(await latestMagazinePackage("mma-files")).toBeNull();
  });
});

describe("the picture a package carries", () => {
  it("claims one only when the bytes and a servable format are both recorded", async () => {
    expect(packageThumbnail({ image: {} })).toBeNull();
    expect(packageThumbnail({ image: { thumb_bytes_base64: "Ynl0ZXM=" } })).toBeNull();
    expect(packageThumbnail({
      image: { thumb_bytes_base64: "", thumb_path: "a/thumb.png" }
    })).toBeNull();
    // A format this site does not serve is not a picture it can promise.
    expect(packageThumbnail({
      image: { thumb_bytes_base64: "Ynl0ZXM=", thumb_path: "a/thumb.tiff" }
    })).toBeNull();
    expect(packageThumbnail({
      image: { thumb_bytes_base64: "Ynl0ZXM=", thumb_path: "a/thumb.png" }
    })).toEqual({ bytes: "Ynl0ZXM=", mediaType: "image/png" });
  });
});
