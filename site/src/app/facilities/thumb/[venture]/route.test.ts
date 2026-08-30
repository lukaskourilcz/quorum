import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "./route";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const THUMBNAILS: Readonly<Record<"svg" | "webp", Buffer>> = {
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
  webp: Buffer.from("RIFF0000WEBP", "ascii")
};

/** A repository root holding one delivered edition, and whatever else a test adds to it. */
async function repository(extension: "svg" | "webp") {
  const root = await mkdtemp(path.join(os.tmpdir(), "facilities-thumbnail-"));
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  const archive = path.join(root, "state", "edition", "archive");
  const deliveries = path.join(root, "state", "edition", "deliveries");
  await Promise.all([
    mkdir(archive, { recursive: true }),
    mkdir(deliveries, { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(deliveries, "2026-08-19.json"), JSON.stringify({
      date: "2026-08-19",
      packageHash: "package",
      status: "delivered",
      editionStatus: "edition"
    })),
    writeFile(path.join(archive, "2026-08-19-package.json"), JSON.stringify({
      image: {
        thumb_bytes_base64: THUMBNAILS[extension].toString("base64"),
        thumb_path: `public/images/editions/fixture/thumb.${extension}`
      }
    }))
  ]);
  return { root, archive, deliveries };
}

function requestThumbnail() {
  return GET(new Request("http://localhost/facilities/thumb/caught-up"), {
    params: Promise.resolve({ venture: "caught-up" })
  });
}

describe("Facilities thumbnail route", () => {
  it("serves a stored SVG with its declared media type and a sandbox", async () => {
    await repository("svg");
    const response = await requestThumbnail();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toMatch(/^<svg/u);
  });

  it("keeps WebP packages on the raster media type", async () => {
    await repository("webp");
    const response = await requestThumbnail();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  /*
   * The day the desk publishes nothing must not blank the picture.
   *
   * A no-edition day is still recorded as delivered and still archives a package — one with no
   * article and no image. This route used to take the newest file in the archive directory, so
   * that empty package shadowed the real one and the card on the Facilities plan showed a broken
   * image. It resolves the same delivered edition the card does now, and this is that day.
   */
  it("looks past a no-edition day to the edition that was published", async () => {
    const { archive, deliveries } = await repository("svg");
    await Promise.all([
      writeFile(path.join(deliveries, "2026-08-20.json"), JSON.stringify({
        date: "2026-08-20",
        packageHash: "quiet",
        status: "delivered",
        editionStatus: "no_edition"
      })),
      writeFile(path.join(archive, "2026-08-20-quiet.json"), JSON.stringify({ image: {} }))
    ]);

    const response = await requestThumbnail();

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^<svg/u);
  });

  it("answers 404 when the newest delivered package carries no picture", async () => {
    const { archive } = await repository("svg");
    await writeFile(path.join(archive, "2026-08-19-package.json"), JSON.stringify({ image: {} }));

    expect((await requestThumbnail()).status).toBe(404);
  });

  it("answers 404 for a venture with no magazine room", async () => {
    await repository("svg");
    const response = await GET(new Request("http://localhost/facilities/thumb/goviral"), {
      params: Promise.resolve({ venture: "goviral" })
    });

    expect(response.status).toBe(404);
  });
});
