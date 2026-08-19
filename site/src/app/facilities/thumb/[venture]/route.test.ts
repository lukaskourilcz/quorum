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

async function requestThumbnail(extension: "svg" | "webp") {
  const root = await mkdtemp(path.join(os.tmpdir(), "facilities-thumbnail-"));
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  const archive = path.join(root, "state", "edition", "archive");
  await mkdir(archive, { recursive: true });
  const bytes = extension === "svg"
    ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')
    : Buffer.from("RIFF0000WEBP", "ascii");
  await writeFile(path.join(archive, "2026-08-19-package.json"), JSON.stringify({
    image: {
      thumb_bytes_base64: bytes.toString("base64"),
      thumb_path: `public/images/editions/fixture/thumb.${extension}`
    }
  }));

  return GET(new Request("http://localhost/facilities/thumb/caught-up"), {
    params: Promise.resolve({ venture: "caught-up" })
  });
}

describe("Facilities thumbnail route", () => {
  it("serves a stored SVG with its declared media type and a sandbox", async () => {
    const response = await requestThumbnail("svg");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toMatch(/^<svg/u);
  });

  it("keeps WebP packages on the raster media type", async () => {
    const response = await requestThumbnail("webp");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
